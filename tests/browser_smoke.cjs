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
  if(screenshots)await page.screenshot({path:path.join(screenshots,'desktop-welcome.png'),fullPage:true});
  async function readState(activePage=page){
   return activePage.evaluate(async session=>{
    const response=await fetch('/api/state',{headers:{'X-Access-Key':sessionStorage.getItem('bloodfall-key'),'X-Session-ID':session}});
    if(!response.ok)throw new Error('State request failed: '+response.status);
    return response.json();
   },session);
  }
  await page.locator('[data-species=human]').click();
  await page.locator('#welcome').waitFor({state:'hidden'});
  const initial=await readState();assert.equal(initial.map.size,64);assert.equal(initial.map.regions.length,4);
  await page.locator('#tab-bag').click();
  assert.equal(await page.locator('#panel-bag').isVisible(),true);
  const before=(await readState()).world.player;
  await page.keyboard.down('d');await delay(550);await page.keyboard.up('d');
  const after=(await readState()).world.player;
  assert.ok(after.x>before.x&&after.y<before.y,'D must move right on screen even after a button click');
  await page.keyboard.down('w');await delay(400);await page.keyboard.up('w');
  const up=(await readState()).world.player;
  assert.ok(up.x+up.y<after.x+after.y,'W must move up on screen');
  await page.locator('#tab-camp').click();
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
  const build=page.locator('#facilities .facility').first().getByRole('button');
  const original=await build.elementHandle();await delay(500);
  assert.equal(await original.evaluate(e=>e.isConnected),true,'Polling replaced the focused build button');
  await build.click();
  await until(async()=> (await readState()).world.base.facilities.kitchen===1,'Kitchen construction failed');
  await page.locator('[data-recipe=soup]').click();
  await until(async()=> (await readState()).world.milestones.includes('craft:soup'),'Craft failed');
  await delay(100);await page.locator('[data-item=soup]').click();
  await until(async()=> (await readState()).world.milestones.includes('consume:soup'),'Consumption failed');
  if(screenshots)await page.screenshot({path:path.join(screenshots,'desktop-camp.png'),fullPage:true});
  // Cross the old 22-tile boundary and visit a new region using actual movement requests.
  const forestWood=(await readState()).world.inventory.wood;
  await mapClick(37,9);
  await until(async()=>{const s=await readState();return s.world.inventory.wood>=forestWood+3;},'Expanded-map navigation/gather failed',25000);
  assert.equal(await page.locator('#region-name').textContent(),'잿빛 소나무숲');
  if(screenshots)await page.screenshot({path:path.join(screenshots,'desktop-forest.png'),fullPage:true});
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
  await mobile.locator('#tab-bag').tap();assert.equal(await mobile.locator('#panel-bag').isVisible(),true);
  await mobile.locator('#tab-camp').tap();
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
  if(screenshots)await mobile.screenshot({path:path.join(screenshots,'mobile-forest.png'),fullPage:true});
  await mobileContext.close();
  assert.deepEqual(errors,[],'Browser errors');
  console.log('Browser smoke passed: desktop/mobile layout, real HTTP gameplay, expanded map, keyboard, click gathering, camera tools, pause, cancellation, tabs and direction-pad release.');
 }finally{
  if(browser)await browser.close();
  if(server.exitCode===null){server.kill('SIGINT');await new Promise(resolve=>server.once('exit',resolve));}
  fs.rmSync(temporary,{recursive:true,force:true});
 }
})().catch(error=>{console.error(error);process.exitCode=1;});
