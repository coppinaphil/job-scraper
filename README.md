# Job Scraper

A professional web scraper built with Playwright and Crawlee to automate job listing collection. Work in progress. NOT for Indeed, Ziprecruiter, LinkedIn, etc. Just made it for a couple local aggregator sites.

## Features

- Automated login handling
- Robust error recovery
- Progress saving
- Environment variable configuration
- Detailed logging
- Screenshot capture for debugging

## Prerequisites

- Node.js (v14 or higher)
- npm

## Installation

1. Clone the repository:
```bash
git clone https://github.com/coppinaphil/job-scraper
cd job-scraper
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory with the following content:
```
EMAIL=your_email@example.com
PASSWORD=your_password
BASE_URL=https://www.examplejobboard.com
LOGIN_PATH=/login
SEARCH_PATH=/search
APPLY_PATH=/applyredirect
```

## Usage

Run the scraper:
```bash
npm start
```

The scraper will:
1. Log in to the specified website
2. Navigate through job listings
3. Extract job URLs and application links
4. Save progress to `extracted-jobs.json`

## Output

The scraper generates:
- `extracted-jobs.json`: Contains all scraped job data
- Error screenshots (if any issues occur)

## Error Handling

The scraper includes:
- Automatic retry logic
- Timeout handling
- Progress saving after each job
- Screenshot capture on errors

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Disclaimer

Please ensure you have permission to scrape any website you target. Always review and comply with the website's terms of service and robots.txt file. 