/** Native-shaped fixture regressions, reached by native-browser CI; no live Forgejo or Storybook server. */
import {defineConfig} from '@playwright/test';
import mobile from './playwright.mobile.config.mjs';

const nativeSuites = [
  'organization.spec.mjs',
  'activity-density.spec.mjs',
  'native-activity-icons.spec.mjs',
  'native-org-repo-list.spec.mjs',
  'pagination.spec.mjs',
  'dashboard-pagination.spec.mjs',
  'pagination-theme-race.spec.mjs',
  'release-style.spec.mjs',
  'universal-search-scope.spec.mjs',
  'universal-search-header.spec.mjs',
  'universal-search-layout.spec.mjs',
  'search-scope-menu.spec.mjs',
  'universal-search-capability.spec.mjs',
  'native-diff-layout.spec.mjs',
  'keyboard-pointer-interruption.spec.mjs',
];
const mobileSuites = [
  'native-controls.spec.mjs',
  'native-header.spec.mjs',
  'native-page-layout.spec.mjs',
  'repository-controls.spec.mjs',
];
// These set their own 320/440/1280 viewports, so each browser runs them once, in its 1280 project.
const selfParameterizedSuites = [
  'universal-search-stream.spec.mjs',
  'search-scope-resize.spec.mjs',
  'universal-search-coverage.spec.mjs',
  'pagination-accessible-names.spec.mjs',
];

export default defineConfig({
  ...mobile,
  forbidOnly: true,
  fullyParallel: false,
  workers: 2,
  retries: 0,
  globalTimeout: 15 * 60 * 1000,
  outputDir: '.qa/native-results',
  reporter: [
    ['list'],
    ['json', {outputFile: '.qa/native-tests.json'}],
    ['html', {outputFolder: '.qa/native-report', open: 'never'}],
  ],
  use: {
    baseURL: undefined,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
  },
  projects: ['chromium', 'webkit'].flatMap(browserName =>
    [320, 440, 1280].map(width => ({
      name: `${browserName}-${width}`,
      // Control suites start in a mobile disclosure, then assert desktop restoration themselves.
      testMatch: width < 768 ? [...nativeSuites, ...mobileSuites] : [...nativeSuites, ...selfParameterizedSuites],
      use: {browserName, viewport: {width, height: 956}, deviceScaleFactor: 1},
    })),
  ),
});
