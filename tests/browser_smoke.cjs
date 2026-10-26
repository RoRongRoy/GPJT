// Optional real-browser integration check. Requires Playwright and Chromium.
// Uses an isolated temporary save; never opens or modifies the development world.
const {chromium}=require('playwright');
const {spawn}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net');
const crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function until(check,message,timeout=10000){
 const end=Date.now()+timeout;
 while(Date.now()<end){if(await check())return;await delay(100);}
 throw new Error(message);
}
(async()=>{
 const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'bloodfall-browser-'));
 const key=crypto.randomBytes(32).toString('hex');
 const socket=net.createServer();await new Promise(resolve=>socket.listen(0,'127.0.0.1',resolve));
 const port=socket.address().port;await new Promise(resolve=>socket.close(resolve));
 const url=`http://127.0.0.1:${port}`;
 const server=spawn(process.env.PYTHON||'python',['-m','server.main','--port',String(port),'--data',path.join(temporary,'world.sqlite3')],{cwd:root,env:{...process.env,BLOODFALL_ACCESS_KEY:key},stdio:['ignore','ignore','pipe']});
 let serverError='',browser;const errors=[];server.stderr.on('data',data=>serverError+=data);
 try{
  await until(async()=>{if(server.exitCode!==null)throw new Error(serverError||'Server exited');try{return (await fetch(url)).ok;}catch{return false;}},'Server did not start');
  const executable=process.env.CHROMIUM_PATH||(fs.existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined);
  browser=await chromium.launch({executablePath:executable,headless:true,args:['--no-sandbox']});
  const screenshots=process.env.BLOODFALL_SCREENSHOTS;
  if(screenshots)fs.mkdirSync(screenshots,{recursive:true});
  const context=await browser.newContext({viewport:{width:1440,height:1080},deviceScaleFactor:1});
  const page=await context.newPage();let session;
  function watch(page){
   page.on('pageerror',error=>errors.push(error.message));
   page.on('request',request=>{if(request.url().endsWith('/api/state'))session=request.headers()['x-session-id'];});
  }
  watch(page);
  await page.goto(url+'/#key='+key);
  await page.locator('#welcome').waitFor({state:'visible'});
  await until(()=>Boolean(session),'Session missing');
  await until(()=>page.locator('#connection').textContent().then(t=>t.includes('자동 저장')),'Client did not connect');
  assert.equal(await page.evaluate(()=>location.hash),'');
  await until(()=>page.locator('#intro-art img, .species-choice img').evaluateAll(images=>images.length===3&&images.every(img=>img.complete&&img.naturalWidth>0)),'Original artwork failed to load');
  assert.equal(await page.locator('#intro-art').isVisible(),true);
  if(screenshots)await page.screenshot({path:path.join(screenshots,'desktop-welcome.png'),fullPage:true,animations:'disabled'});
  async function readState(activePage=page){
   return activePage.evaluate(async session=>{
    const response=await fetch('/api/state',{headers:{'X-Access-Key':sessionStorage.getItem('bloodfall-key'),'X-Session-ID':session}});
    if(!response.ok)throw new Error('State request failed: '+response.status);
    return response.json();
   },session);
  }
  await page.locator('button[data-species=human]').click();
  await page.locator('#welcome').waitFor({state:'hidden'});
  assert.equal(await page.locator('#intro-art').isVisible(),false);
  await until(()=>page.locator('#world').getAttribute('data-art').then(v=>v==='ready'),'Gameplay sprites failed to load',20000);
  assert.equal(await page.locator('body').getAttribute('data-species'),'human');
  const initial=await readState();assert.equal(initial.map.size,64);assert.equal(initial.map.regions.length,4);
  assert.equal(await page.locator('#menu-dialog').isVisible(),false,'Details must start closed');
  assert.equal(await page.locator('#meters').isVisible(),false);
  assert.equal(await page.locator('#craft-submit').isVisible(),false);
  await page.locator('#menu-bag').click();
  assert.equal(await page.locator('[data-view=bag]').isVisible(),true);
  await page.locator('[data-filter=supplies]').click();
  assert.equal(await page.locator('[data-filter=supplies]').getAttribute('aria-pressed'),'true');
  assert.equal(await page.locator('[data-filter=materials]').getAttribute('aria-pressed'),'false');
  assert.ok((await page.locator('#inventory').textContent()).includes('채소 수프'));
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#menu-dialog').isVisible(),false);
  assert.equal(await page.evaluate(()=>document.activeElement.id),'menu-bag','Closing must return focus');
  await page.locator('#menu-journal').click();await page.locator('[data-panel=quests]').click();
  assert.equal(await page.locator('[data-view=quests]').isVisible(),true);
  assert.equal(await page.locator('[data-view]:not([hidden])').count(),1,'Only one category can be shown');
  await page.locator('#menu-back').click();assert.equal(await page.locator('[data-view=journal]').isVisible(),true);
  await page.locator('#menu-close').click();
  await page.locator('#menu-bag').click();
  const before=(await readState()).world.player;
  await page.keyboard.down('d');await delay(550);await page.keyboard.up('d');
  const after=(await readState()).world.player;
  assert.ok(after.x>before.x&&after.y<before.y,'D must move right on screen even after a button click');
  await page.keyboard.down('w');await delay(400);await page.keyboard.up('w');
  const up=(await readState()).world.player;
  assert.ok(up.x+up.y<after.x+after.y,'W must move up on screen');
  assert.equal(await page.locator('#menu-dialog').isVisible(),false,'Moving should close the menu');
  const atlas=await page.locator('#minimap').boundingBox();
  async function mapClick(x,y){await page.mouse.click(atlas.x+x/64*atlas.width,atlas.y+y/64*atlas.height);}
  // Click the upper part of the visible tree, not only its ground coordinate.
  await delay(700);const player=(await readState()).world.player;
  const field=await page.locator('#world').boundingBox();
  await page.mouse.click(field.x+field.width/2+(4-8-player.x+player.y)*34,field.y+field.height*.52+(4+8-player.x-player.y)*17-75);
  await until(async()=> (await readState()).world.inventory.wood>initial.world.inventory.wood,'Click-to-gather did not complete');
  await page.locator('#zoom-in').click();assert.equal(await page.locator('#zoom-level').textContent(),'110%');
  await page.locator('#zoom-out').click();assert.equal(await page.locator('#zoom-level').textContent(),'100%');
  await page.locator('#focus-view').click();assert.equal(await page.locator('body').evaluate(e=>e.classList.contains('focus-mode')),true);
  await page.keyboard.press('v');assert.equal(await page.locator('body').evaluate(e=>e.classList.contains('focus-mode')),false);
  await page.keyboard.down('d');await delay(80);
  await page.locator('#pause').click();await page.keyboard.up('d');await page.locator('#pause-overlay').waitFor({state:'visible'});
  const paused=(await readState()).world.player;
  await page.keyboard.down('d');await delay(300);await page.keyboard.up('d');
  assert.deepEqual((await readState()).world.player,paused,'Paused movement changed state');
  await page.locator('#pause').click();await page.locator('#pause-overlay').waitFor({state:'hidden'});
  await page.locator('#go-home').click();
  await until(async()=>{const w=(await readState()).world;return Math.hypot(w.player.x-w.base.x,w.player.y-w.base.y)<.5;},'Home navigation failed');
  await delay(300);
  assert.equal(await page.locator('#menu-camp').isVisible(),true,'Camp category must be available at home');
  await page.locator('#menu-camp').click();
  assert.equal(await page.locator('[data-view=camp]').isVisible(),true);
  assert.equal(await page.locator('#craft-submit').isVisible(),false,'Camp landing should show categories, not all controls');
  await page.locator('[data-panel=craft]').click();
  assert.equal(await page.locator('#craft-submit').isDisabled(),true,'Missing kitchen should block crafting');
  assert.ok((await page.locator('#recipe-status').textContent()).includes('주방'));
  await page.locator('[data-craft=elixir]').click();assert.equal(await page.locator('#recipe-name').textContent(),'안정화 혈액');
  await page.locator('[data-craft=soup]').click();
  await page.locator('#menu-back').click();await page.locator('[data-panel=build]').click();
  const build=page.locator('#facilities .facility').first().getByRole('button');
  const original=await build.elementHandle();await delay(500);
  assert.equal(await original.evaluate(e=>e.isConnected),true,'Polling replaced the focused build button');
  await build.click();
  await until(async()=> (await readState()).world.base.facilities.kitchen===1,'Kitchen construction failed');
  await page.locator('#menu-back').click();await page.locator('[data-panel=craft]').click();
  assert.equal(await page.locator('#craft-submit').isDisabled(),false);
  if(screenshots)await page.screenshot({path:path.join(screenshots,'desktop-crafting.png'),fullPage:true,animations:'disabled'});
  await page.locator('#craft-submit').click();
  await until(async()=> (await readState()).world.milestones.includes('craft:soup'),'Craft failed');
  await page.locator('#menu-survival').click();
  assert.ok((await page.locator('#survivor-art').getAttribute('src')).includes('human-warden'));
  await until(()=>page.locator('#survivor-art').evaluate(img=>img.complete&&img.naturalWidth>0),'Survivor portrait failed to load');
  await delay(100);await page.locator('[data-item=soup]').click();
  await until(async()=> (await readState()).world.milestones.includes('consume:soup'),'Consumption failed');
  await page.locator('#menu-close').click();
  if(screenshots)await page.screenshot({path:path.join(screenshots,'desktop-camp.png'),fullPage:true,animations:'disabled'});
  // Exercise the vampire portrait and field silhouette through the real medical conversion.
  await page.locator('#menu-camp').click();await page.locator('[data-panel=build]').click();
  await page.locator('#facilities .facility').nth(2).getByRole('button').click();
  await until(async()=> (await readState()).world.base.facilities.medical===1,'Medical construction failed');
  await page.locator('#menu-back').click();await page.locator('[data-panel=research]').click();
  await page.locator('[data-action=convert]').click();
  await until(()=>page.locator('body').getAttribute('data-species').then(s=>s==='vampire'),'Vampire art theme not applied');
  await page.locator('#menu-survival').click();
  await until(()=>page.locator('#survivor-art').evaluate(img=>img.src.includes('vampire-scholar')&&img.complete&&img.naturalWidth>0),'Vampire portrait failed to load');
  if(screenshots)await page.screenshot({path:path.join(screenshots,'desktop-vampire.png'),fullPage:true,animations:'disabled'});
  await page.locator('#menu-camp').click();await page.locator('[data-panel=research]').click();
  await page.locator('[data-action=convert]').click();
  await until(()=>page.locator('body').getAttribute('data-species').then(s=>s==='human'),'Human art theme not restored');
  await page.locator('#menu-close').click();
  // Cross the old 22-tile boundary and visit a new region using actual movement requests.
  const forestWood=(await readState()).world.inventory.wood;
  await page.locator('#menu-camp').click();await page.locator('[data-panel=craft]').click();
  await page.keyboard.down('d');await delay(160);await page.keyboard.up('d');
  assert.equal(await page.locator('#menu-dialog').isVisible(),false,'Movement must dismiss crafting');
  await mapClick(37,9);
  await until(async()=>{const s=await readState();return s.world.inventory.wood>=forestWood+3;},'Expanded-map navigation/gather failed',25000);
  assert.equal(await page.locator('#region-name').textContent(),'잿빛 소나무숲');
  assert.equal(await page.locator('#menu-camp').isVisible(),false,'Camp category must disappear outside camp');
  assert.equal(await page.locator('#camp-access').isVisible(),false);
  assert.equal(await page.locator('#craft-submit').isVisible(),false);
  await page.keyboard.press('b');assert.equal(await page.locator('#menu-dialog').isVisible(),false,'Shortcut cannot open remote crafting');
  if(screenshots)await page.screenshot({path:path.join(screenshots,'desktop-forest.png'),fullPage:true,animations:'disabled'});
  await mapClick(54,24);await page.keyboard.press('Escape');await delay(250);
  const stopped=(await readState()).world.player;await delay(400);
  const still=(await readState()).world.player;assert.equal(still.x,stopped.x);assert.equal(still.y,stopped.y);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Desktop horizontal overflow');
  await context.close();await delay(4200);
  const mobileContext=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true,deviceScaleFactor:1});
  const mobile=await mobileContext.newPage();watch(mobile);
  await mobile.goto(url+'/#key='+key);
  await until(()=>mobile.locator('#connection').textContent().then(t=>t.includes('자동 저장')),'Mobile did not connect');
  assert.equal(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'Mobile horizontal overflow');
  assert.equal(await mobile.locator('#menu-camp').isVisible(),false);
  await mobile.locator('#menu-bag').tap();assert.equal(await mobile.locator('[data-view=bag]').isVisible(),true);
  await mobile.locator('[data-filter=supplies]').tap();
  assert.equal(await mobile.locator('[data-filter=supplies]').getAttribute('aria-pressed'),'true');
  assert.equal(await mobile.locator('[data-filter=materials]').getAttribute('aria-pressed'),'false');
  if(screenshots)await mobile.screenshot({path:path.join(screenshots,'mobile-inventory.png'),fullPage:true,animations:'disabled'});
  await mobile.locator('#menu-close').tap();
  const mobileBefore=(await readState(mobile)).world.player;
  await mobile.locator('[data-direction=down]').scrollIntoViewIfNeeded();
  const down=await mobile.locator('[data-direction=down]').boundingBox();
  const touch=await mobileContext.newCDPSession(mobile);
  await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:down.x+down.width/2,y:down.y+down.height/2}]});
  await delay(450);await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  const mobileAfter=(await readState(mobile)).world.player;
  assert.ok(mobileAfter.x>mobileBefore.x&&mobileAfter.y>mobileBefore.y,'Touch direction pad did not move down');
  await delay(200);const released=(await readState(mobile)).world.player;await delay(400);
  assert.equal((await readState(mobile)).world.player.x,released.x,'Pointer release did not stop movement');
  if(screenshots)await mobile.screenshot({path:path.join(screenshots,'mobile-forest.png'),fullPage:true,animations:'disabled'});
  // Return through real world movement and open the contextual menu on mobile.
  await mobile.locator('#go-home').tap();
  await until(async()=>{const w=(await readState(mobile)).world;return Math.hypot(w.player.x-w.base.x,w.player.y-w.base.y)<.6;},'Mobile return to camp failed',25000);
  await mobile.locator('#camp-access').tap();await mobile.locator('[data-panel=craft]').tap();
  assert.equal(await mobile.locator('#craft-submit').isVisible(),true);
  const menuBox=await mobile.locator('#menu-dialog').boundingBox();
  assert.ok(menuBox.x>=0&&menuBox.y>=0&&menuBox.x+menuBox.width<=390&&menuBox.y+menuBox.height<=844,'Mobile menu must fit viewport');
  if(screenshots)await mobile.screenshot({path:path.join(screenshots,'mobile-crafting.png'),fullPage:true,animations:'disabled'});
  await mobile.locator('#menu-back').tap();assert.equal(await mobile.locator('[data-view=camp]').isVisible(),true);
  await mobileContext.close();
  assert.deepEqual(errors,[],'Browser errors');
  console.log('Browser smoke passed: desktop/mobile layout, real HTTP gameplay, expanded map, keyboard, click gathering, camera tools, pause, cancellation, category navigation/focus, contextual camp crafting and direction-pad release.');
 }finally{
  if(browser)await browser.close();
  if(server.exitCode===null){server.kill('SIGINT');await new Promise(resolve=>server.once('exit',resolve));}
  fs.rmSync(temporary,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
