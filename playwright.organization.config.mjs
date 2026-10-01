import {defineConfig} from '@playwright/test';

// Production-enhancer acceptance across layout widths; WebKit is not real iOS proof.
export default defineConfig({
  testDir: 'tests/mobile',
  testMatch: /(?:organization|activity-density|pagination|dashboard-pagination)\.spec\.mjs$/,
  timeout: 25000,
  expect: {timeout: 5000},
  workers: 1,
  reporter: [['dot'], ['json', {outputFile: process.env.ORG_REPORT_PATH || '.qa/organization-tests.json'}]],
  use: {headless: true, screenshot: 'only-on-failure'},
  projects: ['chromium', 'webkit'].flatMap(browserName => [320, 440, 1280].map(width => ({
    name: `${browserName}-${width}`,
    use: {browserName, viewport: {width, height: 956}, deviceScaleFactor: 1},
  }))),
});
