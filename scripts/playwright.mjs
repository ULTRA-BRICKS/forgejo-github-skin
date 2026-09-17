/** Normal project dependency, or an explicitly supplied existing installation. */
import {pathToFileURL} from 'node:url';
export async function loadPlaywright() {
  return process.env.PLAYWRIGHT_MODULE
    ? import(pathToFileURL(process.env.PLAYWRIGHT_MODULE).href)
    : import('@playwright/test');
}
