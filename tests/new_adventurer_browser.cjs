// Regression for starter rarity crashing rendering after choose/account_load.
// All saves, credentials and accounts are isolated disposable test fixtures.
const {chromium}=require('playwright');
const {spawn,execFileSync}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check,message){for(let i=0;i<100;i++){if(await check())return;await delay(80);}throw Error(message);}
(async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'bloodfall-start-')),save=path.join(tmp,'world.sqlite3'),key=crypto.randomBytes(32).toString('hex');
 execFileSync(process.env.PYTHON||'python',['-c',`import sys,copy
from server.game import new_world,act
from server.main import PROFILE_KEYS
from server.storage import Store
w=new_world();act(w,{'action':'choose','species':'human'})
for g in w['gear']:g['rarity']='common'
w['inventory']['wood']=77
profile={k:copy.deepcopy(w[k]) for k in (*PROFILE_KEYS,'base','next_gear_id') if k in w}
s=Store(sys.argv[1]);s.save(new_world());s.save_account('legacy-player','test-password',profile);s.close()`,save],{cwd:root});
 const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const url=`http://127.0.0.1:${port}`,server=spawn(process.env.PYTHON||'python',['-m','server.main','--host','127.0.0.1','--port',String(port),'--data',save],{cwd:root,env:{...process.env,BLOODFALL_ACCESS_KEY:key},stdio:'ignore'});let browser;
 try{
  await until(async()=>{try{return (await fetch(url)).ok;}catch{return false;}},'Server did not start');
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox']});
  for(const transport of ['http','socket'])for(const species of ['human','vampire']){
   const context=await browser.newContext({viewport:species==='human'?{width:1440,height:1080}:{width:390,height:844}});
   const page=await context.newPage(),errors=[];page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
   if(transport==='http')await page.route('**/socket.io.js',r=>r.fulfill({contentType:'text/javascript',body:''}));
   await page.addInitScript(()=>sessionStorage.setItem('bloodfall-key','obsolete-local-server-key'));
   await page.goto(species==='human'?url:url+'/#key='+key);
   if(species==='human')assert.equal(await page.evaluate(()=>sessionStorage.getItem('bloodfall-key')),null,'Bare localhost URL must discard obsolete access keys');
   await until(()=>page.locator('#connection').textContent().then(t=>t.includes('접속)')),'Connection missing');
   await page.locator(`[data-species=${species}]`).click();
   await until(async()=>{
    const toast=await page.locator('#toast').textContent();
    if(toast.includes('Cannot read'))throw Error('New adventurer failed: '+toast);
    return await page.locator('body').getAttribute('data-species')===species;
   },'Species selection did not render');
   await page.locator('#welcome').waitFor({state:'hidden'});
   await page.locator('#menu-equip').click();
   assert.ok((await page.locator('[data-view=equip]').textContent()).includes('[일반]'));
   await page.keyboard.press('Escape');await page.locator('#menu-bag').click();
   await page.locator('[data-filter=equipment]').click();
   assert.equal(await page.locator('[data-inventory-item]').count(),2);
   await page.locator('[data-inventory-item="gear:starter-weapon"]').click();
   assert.equal(await page.locator('#item-category').textContent(),'일반 무기');
   await page.keyboard.press('Escape');const coords=await page.locator('#coordinates').textContent();
   await page.keyboard.down('d');await delay(700);await page.keyboard.up('d');
   await until(()=>page.locator('#coordinates').textContent().then(t=>t!==coords),'Movement blocked after starting');
   await page.locator('#menu-account').click();
   await page.locator('#account-load-id').fill('legacy-player');
   await page.locator('#account-load-pw').fill('test-password');
   await page.locator('#account-load-btn').click();
   await page.locator('#welcome').waitFor({state:'hidden'});
   await until(()=>page.locator('#field-equip').textContent().then(t=>t.includes('[일반]')),'Legacy gear did not render');
   await page.locator('#menu-bag').click();await page.locator('[data-filter=materials]').click();
   await page.locator('[data-inventory-item=wood]').click();
   assert.ok((await page.locator('#item-owned').textContent()).includes('77'),'Saved inventory was reset');
   if(transport==='http'&&species==='human'){
    // A cached/older server or an unknown future tier must not crash any gear view.
    await page.route('**/api/state',async route=>{
     const response=await route.fetch(),data=await response.json();
     for(const g of data.world.gear)g.rarity=g.slot==='weapon'?'common':'future-tier';
     await route.fulfill({response,json:data});
    });
    await until(()=>page.locator('#field-equip').textContent().then(t=>t.includes('[미확인]')&&t.includes('[일반]')),'Fallback rarity display failed');
    await page.locator('[data-filter=equipment]').click();
    await page.locator('[data-inventory-item="gear:starter-armor"]').click();
    assert.equal(await page.locator('#item-category').textContent(),'미확인 상의');
   }
   assert.deepEqual(errors,[]);
   console.log(`Passed ${transport} / ${species}: start, gear, movement, legacy account`);
   await page.unrouteAll({behavior:'ignoreErrors'});await context.close();
  }
  console.log('New adventurer regression passed: human/vampire, HTTP/Socket.IO, desktop/mobile, starter gear, movement and legacy account load.');
 }finally{if(browser){for(const context of browser.contexts())for(const page of context.pages())await page.unrouteAll({behavior:'ignoreErrors'});await browser.close();}if(server.exitCode===null){server.kill('SIGINT');await new Promise(r=>server.once('exit',r));}fs.rmSync(tmp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
