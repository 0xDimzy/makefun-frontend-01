import { chromium } from '/home/hatch/workspace/makefun/pwtest/node_modules/playwright-core/index.mjs';
import { mkdir, writeFile, stat } from 'node:fs/promises';
const browser = await chromium.launch({args:['--no-sandbox','--disable-gpu','--proxy-server=http://hatch-egress-proxy:3128','--proxy-bypass-list=127.0.0.1;localhost']});
const page = await browser.newPage({viewport:{width:1280,height:800},deviceScaleFactor:1});
const errors=[];
page.on('console',msg=>{if(msg.type()==='error')errors.push(msg.text())});
page.on('pageerror',err=>errors.push(err.message));
// Forward API calls through Node's configured environment proxy; Chromium itself cannot establish the proxy tunnel here.
await page.route('https://make.fun/api/**', async route => {
  const request=route.request();
  const response=await fetch(request.url(),{headers:request.headers()});
  await route.fulfill({status:response.status,headers:Object.fromEntries(response.headers),body:Buffer.from(await response.arrayBuffer())});
});
const routes=[['1-board.jpg','/#/'],['2-bounty.jpg','/#/bounty/threejs-fps-02'],['3-leaderboard.jpg','/#/bounty/threejs-fps-02/leaderboard']];
await mkdir('screenshots',{recursive:true});
for (const [file,path] of routes) {
  await page.goto('http://127.0.0.1:8080'+path,{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__shotReady===true,{timeout:60000});
  if (await page.locator('.error').count()) throw new Error(`${path} displayed an API error: ${await page.locator('.error').innerText()}`);
  await page.screenshot({path:`screenshots/${file}`,type:'jpeg',quality:80,fullPage:false});
  if ((await stat(`screenshots/${file}`)).size>262144) throw new Error(`${file} exceeds 256 KiB`);
}
await page.goto('http://127.0.0.1:8080/#/profile/nimble-finch-25',{waitUntil:'domcontentloaded'});
await page.waitForFunction(()=>window.__shotReady===true,{timeout:60000});
if (await page.locator('.error').count()) throw new Error('profile route displayed an API error');
if(errors.length) throw new Error(`Browser console errors: ${errors.join(' | ')}`);
console.log('All four routes rendered with live data and no console errors.');
await browser.close();
await writeFile('shots.json',JSON.stringify(routes.map(([file,path])=>({file,path:path.slice(1),viewport:{width:1280,height:800}})),null,2)+'\n');
