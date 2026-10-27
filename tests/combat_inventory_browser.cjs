// Optional real-browser inventory/combat check using an isolated seeded save.
const {chromium}=require('playwright'),{spawn,execFileSync}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check,message){for(let i=0;i<80;i++){if(await check())return;await delay(80);}throw Error(message);}
(async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'bloodfall-combat-')),save=path.join(tmp,'world.sqlite3'),key=crypto.randomBytes(32).toString('hex');
 execFileSync(process.env.PYTHON||'python',['-c',`import sys;from server.game import new_world;from server.storage import Store
w=new_world();w['player'].update(chosen=True,x=20,y=20,hp=90);w['inventory']['water']=1;w['base'].update(x=6,y=6)
for e in w['enemies']:e.update(x=50,y=50)
w['enemies'][0].update(x=21,y=20);w['enemies'][1].update(x=20,y=21.5)
s=Store(sys.argv[1]);s.save(w);s.close()`,save],{cwd:root});
 const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const url=`http://127.0.0.1:${port}`,server=spawn(process.env.PYTHON||'python',['-m','server.main','--port',String(port),'--data',save],{cwd:root,env:{...process.env,BLOODFALL_ACCESS_KEY:key},stdio:'ignore'});let browser;
 try{
  await until(async()=>{try{return (await fetch(url)).ok;}catch{return false;}},'Server did not start');
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1440,height:1080}}),errors=[];let session;
  page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>{if(r.url().endsWith('/api/state'))session=r.headers()['x-session-id'];});
  await page.goto(url+'/#key='+key);await until(()=>page.locator('#world').getAttribute('data-art').then(x=>x==='ready'),'Sprites not ready');
  const read=()=>page.evaluate(async session=>(await fetch('/api/state',{headers:{'X-Access-Key':sessionStorage.getItem('bloodfall-key'),'X-Session-ID':session}})).json(),session);
  await page.evaluate(()=>{const old=WorldView.prototype.playCombat;WorldView.prototype.playCombat=function(...args){old.apply(this,args);window.lastCombat={kind:this.combat.kind,hits:this.combat.hits};};});
  const screenshots=process.env.BLOODFALL_SCREENSHOTS;if(screenshots)fs.mkdirSync(screenshots,{recursive:true});
  await page.locator('#menu-bag').click();assert.equal(await page.locator('#menu-title').textContent(),'인벤토리');
  assert.equal(await page.locator('[data-inventory-item]').count(),10);
  await until(()=>page.locator('[data-inventory-item] img').evaluateAll(imgs=>imgs.every(i=>i.complete&&i.naturalWidth>0)),'Item icons not loaded');
  await page.locator('[data-inventory-item=wood]').click();assert.equal(await page.locator('#item-use').isDisabled(),true);
  await page.locator('[data-filter=supplies]').click();await page.locator('[data-inventory-item=soup]').click();
  const slot=await page.locator('[data-inventory-item=soup]').elementHandle();await delay(500);assert.equal(await slot.evaluate(e=>e.isConnected&&e===document.activeElement),true,'Polling replaced a selected/focused slot');
  assert.ok((await page.locator('#item-effect').textContent()).includes('45'));
  if(screenshots)await page.screenshot({path:path.join(screenshots,'inventory-desktop.png')});
  const beforeSoup=(await read()).world.inventory.soup;await page.locator('#item-use').click();
  await until(async()=> (await read()).world.inventory.soup===beforeSoup-1,'Inventory consume failed');
  await page.locator('[data-inventory-item=water]').click();await page.locator('#item-use').click();
  await until(async()=> (await read()).world.inventory.water===0,'Last item was not consumed');
  assert.equal(await page.locator('#item-name').textContent(),'식수');assert.equal(await page.locator('#item-use').isDisabled(),true,'Empty stack must not switch to another usable item');
  assert.equal(await page.locator('[data-inventory-item=water]').count(),0);
  await page.locator('[data-inventory-item=blood]').click();assert.equal(await page.locator('#item-use').isDisabled(),true);assert.ok((await page.locator('#item-use-reason').textContent()).includes('뱀파이어'));
  await page.locator('[data-filter=growth]').click();assert.equal(await page.locator('[data-inventory-item]').count(),1);assert.equal(await page.locator('#item-name').textContent(),'강화 주문서');
  await page.keyboard.press('Escape');
  const before=(await read()).world;await page.keyboard.press('q');
  await until(()=>page.evaluate(()=>window.lastCombat?.kind==='sweep'),'Q skill not confirmed');
  assert.equal(await page.evaluate(()=>window.lastCombat.hits.length),2);
  assert.ok(await page.evaluate(()=>window.lastCombat.hits.every(h=>h.damage===32)));
  await delay(130);if(screenshots)await page.screenshot({path:path.join(screenshots,'sweep-impact.png')});
  const after=(await read()).world;assert.ok(after.player.food<=before.player.food-6);assert.ok(after.player.food>before.player.food-7);assert.ok(after.cooldowns['skill:sweep']>after.elapsed);
  assert.equal(await page.locator('#skill-sweep').isDisabled(),true);
  await delay(650);await page.keyboard.press('Space');
  await until(()=>page.evaluate(()=>window.lastCombat?.kind==='attack'),'Basic swing not confirmed');
  assert.equal(await page.evaluate(()=>window.lastCombat.hits.length),1);
  await delay(150);if(screenshots)await page.screenshot({path:path.join(screenshots,'basic-strike.png')});
  await page.keyboard.press('r');await until(()=>page.evaluate(()=>window.lastCombat?.kind==='recover'),'R recovery not confirmed');
  const recovered=(await read()).world;assert.ok(recovered.cooldowns['skill:recover']>recovered.elapsed);
  await page.keyboard.press('r');await delay(200);assert.equal((await read()).world.cooldowns['skill:recover'],recovered.cooldowns['skill:recover'],'Cooldown was bypassed');
  if(screenshots)await page.screenshot({path:path.join(screenshots,'recovery.png')});
  await page.locator('#pause').click();await page.locator('#pause-overlay').waitFor({state:'visible'});
  assert.equal(await page.locator('#skill-recover').isDisabled(),true);
  await page.setViewportSize({width:390,height:844});await page.locator('#menu-bag').click();await page.locator('[data-filter=supplies]').click();await page.locator('[data-inventory-item=medicine]').click();
  assert.equal(await page.locator('#item-use').isDisabled(),true,'Paused inventory must not consume');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.locator('#item-use').scrollIntoViewIfNeeded();
  if(screenshots)await page.screenshot({path:path.join(screenshots,'inventory-mobile.png')});
  assert.deepEqual(errors,[]);console.log('Inventory/combat browser passed: icons, filters, focus, consume, species restriction, Q area hits, Space strike, R cooldown, pause and mobile layout.');
 }finally{if(browser)await browser.close();if(server.exitCode===null){server.kill('SIGINT');await new Promise(r=>server.once('exit',r));}fs.rmSync(tmp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
