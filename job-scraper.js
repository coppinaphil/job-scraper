import { PlaywrightCrawler } from 'crawlee';
import { writeFile } from 'fs/promises';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Construct URLs from environment variables
const BASE_URL = process.env.BASE_URL || 'https://www.greaterroccareers.com';
const LOGIN_URL = `${BASE_URL}${process.env.LOGIN_PATH}`;
const SEARCH_URL = `${BASE_URL}${process.env.SEARCH_PATH}`;
const APPLY_BASE_URL = `${BASE_URL}${process.env.APPLY_PATH}`;

async function setupJobScraper() {
  const crawler = new PlaywrightCrawler({
    // Launch browser options
    launchContext: {
      launchOptions: {
        headless: false,
        slowMo: 50,
      },
    },
    
    // Main request handler
    requestHandler: async ({ page, request, log }) => {
      log.info(`Processing: ${request.url}`);
      
      try {
        // Set default timeout for all operations
        page.setDefaultTimeout(15000);
        
        // Wait for the page to load completely
        await Promise.race([
          page.waitForLoadState('networkidle'),
          new Promise(resolve => setTimeout(resolve, 5000))
        ]);
        
        // Get page title to confirm we're on the right page
        const title = await page.title();
        log.info(`Page title: ${title}`);
        
        // Check if we're on the search results page
        if (request.url.includes(process.env.SEARCH_PATH)) {
          log.info('On search results page - logging in first!');
          
          // Navigate to login page
          log.info('Navigating to login page...');
          await page.goto(LOGIN_URL, { timeout: 15000 });
          await Promise.race([
            page.waitForLoadState('networkidle'),
            new Promise(resolve => setTimeout(resolve, 5000))
          ]);
          
          log.info(`Current URL after login navigation: ${page.url()}`);
          
          // Try to find email field with multiple selectors
          const emailSelectors = ['input[type="email"]', 'input[name*="email"]', 'input[name*="Email"]', '#email', '#Email'];
          let emailField = null;
          
          for (const selector of emailSelectors) {
            const count = await page.locator(selector).count();
            log.info(`Email selector "${selector}": ${count} found`);
            if (count > 0) {
              emailField = page.locator(selector).first();
              break;
            }
          }
          
          // Try to find password field
          const passwordSelectors = ['input[type="password"]', 'input[name*="password"]', 'input[name*="Password"]', '#password', '#Password'];
          let passwordField = null;
          
          for (const selector of passwordSelectors) {
            const count = await page.locator(selector).count();
            log.info(`Password selector "${selector}": ${count} found`);
            if (count > 0) {
              passwordField = page.locator(selector).first();
              break;
            }
          }
          
          if (emailField && passwordField) {
            log.info('Found email and password fields, filling them...');
            
            await emailField.fill(process.env.EMAIL);
            await passwordField.fill(process.env.PASSWORD);
            
            log.info('Credentials filled, looking for submit button...');
            
            // Find submit button
            const submitSelectors = ['input[type="submit"]', 'button[type="submit"]', 'button:has-text("Login")', 'button:has-text("Sign In")', 'input[value*="Login"]'];
            let submitButton = null;
            
            for (const selector of submitSelectors) {
              const count = await page.locator(selector).count();
              log.info(`Submit selector "${selector}": ${count} found`);
              if (count > 0) {
                submitButton = page.locator(selector).first();
                break;
              }
            }
            
            if (submitButton) {
              log.info('Found submit button, clicking...');
              await submitButton.click();
              
              // Wait for login to complete with timeout
              await Promise.race([
                page.waitForLoadState('networkidle'),
                new Promise(resolve => setTimeout(resolve, 10000))
              ]);
              log.info(`After login click, URL: ${page.url()}`);
            } else {
              log.error('No submit button found');
            }
            
          } else {
            log.error('Could not find email or password fields');
            log.info('Taking screenshot for debugging...');
            await page.screenshot({ path: 'login-debug.png' });
          }
          
          log.info('Navigating back to search page...');
          
          // Go back to search results
          await page.goto(SEARCH_URL, { timeout: 15000 });
          await Promise.race([
            page.waitForLoadState('networkidle'),
            new Promise(resolve => setTimeout(resolve, 5000))
          ]);
          
          // Wait a moment for any dynamic content to load
          await page.waitForTimeout(1000);
          
          // Find all job listing rows
          const jobRows = await page.locator('.listRow').all();
          log.info(`Found ${jobRows.length} job listings to process`);
          
          const extractedJobs = [];
          
          // Process each job (limit to first 20 for testing)
          for (let i = 0; i < Math.min(jobRows.length, 20); i++) {
            log.info(`\n=== Processing job ${i + 1}/${Math.min(jobRows.length, 20)} ===`);
            
            try {
              // Ensure we're on the search page before clicking
              if (!page.url().includes(process.env.SEARCH_PATH)) {
                log.info('Not on search page, navigating back...');
                await page.goto(SEARCH_URL, { timeout: 15000 });
                await Promise.race([
                  page.waitForLoadState('networkidle'),
                  new Promise(resolve => setTimeout(resolve, 5000))
                ]);
                
                // Re-get the job rows since we reloaded the page
                const updatedJobRows = await page.locator('.listRow').all();
                if (i < updatedJobRows.length) {
                  jobRows[i] = updatedJobRows[i];
                } else {
                  throw new Error('Job row no longer available after reload');
                }
              }
              
              // Click on the job row with retry logic
              let clickSuccess = false;
              for (let attempt = 0; attempt < 3 && !clickSuccess; attempt++) {
                try {
                  log.info(`Attempting to click job ${i + 1} (attempt ${attempt + 1})`);
                  await jobRows[i].click();
                  clickSuccess = true;
                  log.info(`Successfully clicked on job ${i + 1} (attempt ${attempt + 1})`);
                } catch (clickError) {
                  if (attempt === 2) throw clickError;
                  log.warning(`Click attempt ${attempt + 1} failed: ${clickError.message}`);
                  await page.waitForTimeout(1000);
                }
              }
              
              // Wait for job details page to load with timeout
              log.info('Waiting for job details page to load...');
              await Promise.race([
                page.waitForLoadState('networkidle'),
                new Promise(resolve => setTimeout(resolve, 10000))
              ]);
              
              // Get current job URL
              const jobUrl = page.url();
              log.info(`Job URL: ${jobUrl}`);
              
              // Extract company apply URL
              let companyUrl = 'Not found';
              
              if (jobUrl.includes('/job/')) {
                const code = jobUrl.split('/job/')[1].split('/')[0];
                const redirectUrl = `${APPLY_BASE_URL}/${code}`;
                
                log.info(`Code: ${code}, Going to: ${redirectUrl}`);
                
                try {
                  await page.goto(redirectUrl, { timeout: 15000 });
                  log.info('Waiting for redirect...');
                  
                  // Add timeout for redirect
                  let redirectTimeout;
                  const redirectPromise = new Promise((resolve, reject) => {
                    redirectTimeout = setTimeout(() => {
                      log.warning(`Redirect taking too long at URL: ${page.url()}`);
                      resolve('timeout'); // Resolve instead of reject to handle gracefully
                    }, 20000); // 20 second timeout
                  });

                  // Race between redirect completion and timeout
                  const redirectResult = await Promise.race([
                    Promise.all([
                      page.waitForLoadState('networkidle'),
                      new Promise(resolve => setTimeout(resolve, 10000))
                    ]).then(() => 'complete'),
                    redirectPromise
                  ]);

                  // Clear the timeout if we completed normally
                  clearTimeout(redirectTimeout);
                  
                  // Check if we actually got redirected
                  const finalUrl = page.url();
                  log.info(`Current URL after redirect attempt: ${finalUrl}`);
                  
                  if (redirectResult === 'timeout' || finalUrl === redirectUrl) {
                    log.warning(`Redirect timed out or failed at: ${finalUrl}`);
                    companyUrl = 'Redirect failed - timeout';
                    
                    // Try to go back to search page immediately
                    log.info('Redirect failed, returning to search page...');
                    await page.goto(SEARCH_URL, { timeout: 15000 });
                    await Promise.race([
                      page.waitForLoadState('networkidle'),
                      new Promise(resolve => setTimeout(resolve, 5000))
                    ]);
                  } else {
                    companyUrl = finalUrl;
                    log.info('Redirect successful');
                  }
                  log.info(`Final company URL: ${companyUrl}`);
                  
                } catch (redirectError) {
                  log.error(`Redirect failed: ${redirectError.message}`);
                  companyUrl = 'Redirect failed - error';
                }
              } else {
                log.warning('No /job/ found in URL');
              }
              
              // Store the result
              extractedJobs.push({
                jobIndex: i + 1,
                jobUrl: jobUrl,
                companyApplyUrl: companyUrl
              });
              
              log.info(`Job ${i + 1} complete - Company URL: ${companyUrl}`);
              
              // Save progress after each job
              try {
                await writeFile('extracted-jobs.json', JSON.stringify(extractedJobs, null, 2));
                log.info('Progress saved to extracted-jobs.json');
              } catch (saveError) {
                log.error(`Failed to save progress: ${saveError.message}`);
              }
              
            } catch (error) {
              log.error(`Error processing job ${i + 1}: ${error.message}`);
              
              // Still add a failed entry
              extractedJobs.push({
                jobIndex: i + 1,
                jobUrl: 'Failed to access',
                companyApplyUrl: 'Processing failed'
              });
              
              // Take a screenshot for debugging
              try {
                await page.screenshot({ path: `error-job-${i + 1}.png` });
                log.info(`Error screenshot saved as error-job-${i + 1}.png`);
              } catch (screenshotError) {
                log.error(`Failed to save error screenshot: ${screenshotError.message}`);
              }
            }
            
            // Always try to get back to search page
            try {
              log.info('Going back to search results...');
              await page.goto(SEARCH_URL, { timeout: 15000 });
              await Promise.race([
                page.waitForLoadState('networkidle'),
                new Promise(resolve => setTimeout(resolve, 5000))
              ]);
              log.info('Back on search page');
            } catch (backError) {
              log.error(`Failed to return to search: ${backError.message}`);
              // Don't break here, let's try to continue with the next job
              continue;
            }
          }
          
          // Log final results
          log.info('\n=== FINAL RESULTS ===');
          extractedJobs.forEach(job => {
            log.info(`Job ${job.jobIndex}: ${job.companyApplyUrl}`);
          });
          
        } else {
          log.info('Not on search page, no action needed');
        }
        
      } catch (error) {
        log.error('Error in request handler:', error.message);
        // Take a screenshot of the error state
        try {
          await page.screenshot({ path: 'error-state.png' });
          log.info('Error state screenshot saved as error-state.png');
        } catch (screenshotError) {
          log.error(`Failed to save error screenshot: ${screenshotError.message}`);
        }
      }
    },
  });

  return crawler;
}

// Export the setup function
export { setupJobScraper };

// Actually run the scraper
async function runScraper() {
  const crawler = await setupJobScraper();
  
  // Add the search URL to the queue
  await crawler.addRequests([SEARCH_URL]);
  
  // Start the crawler
  await crawler.run();
  
  console.log('Scraping completed!');
}

// Run it
runScraper().catch(console.error);