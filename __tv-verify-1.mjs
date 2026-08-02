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

await page.waitForTimeout(16000); // intro -> section 0 (Scattered on Campus)
await page.screenshot({ path: SHOT_DIR + 'v1-00-scattered.png' });
console.log('captured section 0 (Scattered on Campus)');

await page.waitForTimeout(15000); // -> 1
await page.waitForTimeout(15000); // -> 2
await page.waitForTimeout(15000); // -> 3 (Coalition Leaderboard)
await page.screenshot({ path: SHOT_DIR + 'v1-03-coalition.png' });
console.log('captured section 3 (Coalition Leaderboard)');

await page.waitForTimeout(15000); // -> 4
await page.waitForTimeout(15000); // -> 5 (Most Campus Time)
await page.screenshot({ path: SHOT_DIR + 'v1-05-campus-time.png' });
console.log('captured section 5 (Most Campus Time)');

await page.waitForTimeout(15000); // -> 6
await page.waitForTimeout(15000); // -> 7
await page.waitForTimeout(15000); // -> 8
await page.waitForTimeout(15000); // -> 9 (Weekly Top Coalitions)
await page.screenshot({ path: SHOT_DIR + 'v1-09-weekly-top-coalitions.png' });
console.log('captured section 9 (Weekly Top Coalitions)');

await browser.close();
console.log('DONE v1');
