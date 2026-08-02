import { chromium } from 'playwright-core';

const SHOT_DIR = 'C:\\Users\\a877912\\AppData\\Local\\Temp\\claude\\c--Users-a877912-OneDrive---ATOS-Desktop-42-Hackathon\\3842d18c-daa4-41f2-8ee6-811b251d27ad\\scratchpad\\';

const browser = await chromium.launch({
  executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  args: ['--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
page.on('console', (msg) => { if (msg.type() === 'error') console.log('CONSOLE ERROR:', msg.text()); });

await page.goto('http://localhost:4200/dashboard', { waitUntil: 'load', timeout: 60000 });
await page.waitForSelector('.section--split', { timeout: 60000 });
await page.waitForTimeout(1500);

await page.locator('button[aria-label="Enter TV mode"]').click();
await page.waitForSelector('.tv-bar', { timeout: 10000 });
console.log('TV mode enabled, robot intro playing...');

await page.waitForTimeout(17000); // -> section 0
await page.waitForTimeout(15000 * 5); // -> section 5 (Most Campus Time)
await page.screenshot({ path: SHOT_DIR + 'v2-05-campus-time.png' });
console.log('captured section 5 (Most Campus Time)');

await page.waitForTimeout(15000 * 2); // -> section 7 (Night Owls)
await page.screenshot({ path: SHOT_DIR + 'v2-07-night-owls.png' });
console.log('captured section 7 (Night Owls)');

await page.waitForTimeout(15000 * 5); // -> section 12 (Transcendence Completed)
await page.waitForTimeout(1200);
await page.screenshot({ path: SHOT_DIR + 'v2-12-transcendence.png' });
console.log('captured section 12 (Transcendence Completed)');

await page.waitForTimeout(15000); // -> section 13 (Achievement Unlock)
await page.waitForTimeout(1200);
await page.screenshot({ path: SHOT_DIR + 'v2-13-achievement.png' });
console.log('captured section 13 (Achievement Unlock)');

await browser.close();
console.log('DONE tv-verify2');
