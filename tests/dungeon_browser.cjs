// Real server: daily admission, private map transition, art and return on desktop/mobile.
const {chromium}=require('playwright'),{spawn,execFileSync}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(check,msg){for(let i=0;i<100;i++){if(await check())return;await delay(80);}throw Error(msg);}
(async()=>{
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'bloodfall-dungeon-')),save=path.join(temp,'test.sqlite3');
 execFileSync('python',['-c',`import sys,copy
from server.game import new_world,act
from server.storage import Store
from server.main import PROFILE_KEYS
s=Store(sys.argv[1]);s.save(new_world())
for species in ('human','vampire'):
 w=new_world();act(w,{'action':'choose','species':species});w['player'].update(combat_level=100)
 w['base'].update(x=110,y=90,established=True);w['base']['facilities']={k:1 for k in w['base']['facilities']}
 p={k:copy.deepcopy(w[k]) for k in (*PROFILE_KEYS,'next_gear_id') if k in w}
 s.save_account('art-'+species,'test-password',p)
s.close()`,save],{cwd:root});
 const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const url=`http://127.0.0.1:${port}`,server=spawn('python',['-m','server.main','--host','127.0.0.1','--port',String(port),'--data',save],{cwd:root,stdio:'ignore'});let browser;
 try{
  await until(async()=>{try{return (await fetch(url)).ok;}catch{return false;}},'Server startup');
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox']});
  for(const species of ['human','vampire']){
   const context=await browser.newContext({viewport:species==='human'?{width:1440,height:1000}:{width:390,height:844}}),page=await context.newPage(),errors=[];
   const session='dungeon-browser-'+species;page.on('pageerror',e=>errors.push(e.message));
   await page.addInitScript(id=>Object.defineProperty(crypto,'randomUUID',{value:()=>id}),session);
   await page.goto(url);
   await until(()=>page.locator('#connection').textContent().then(t=>t.includes('접속)')),'Connection');
   await page.evaluate(async({session,species})=>{
    const r=await fetch('/api/action',{method:'POST',headers:{'Content-Type':'application/json','X-Session-ID':session},body:JSON.stringify({command:{action:'account_load',username:'art-'+species,password:'test-password'}})});if(!r.ok)throw Error(await r.text());
   },{session,species});
   await page.locator('#welcome').waitFor({state:'hidden'});
   await until(()=>page.locator('body').getAttribute('data-species').then(v=>v===species),'Species art');
   await page.waitForFunction(()=>document.getElementById('world').dataset.art==='ready',{},{timeout:20000});
   await delay(800);await page.screenshot({path:`/tmp/town-theme-${species}.png`});
   await page.locator('#menu-dungeons').click();
   assert.equal(await page.locator('[data-dungeon]').count(),3);
   await page.locator('[data-dungeon=bunker]').click();
   await until(()=>page.locator('#region-name').textContent().then(t=>t==='봉쇄된 지하 보급고'),'Instance map enters').catch(async e=>{console.error('Diagnostic',await page.locator('#toast').textContent(),errors,await page.locator('#region-name').textContent());await page.screenshot({path:'/tmp/dungeon-failure.png'});throw e;});
   await page.locator('#menu-dialog').waitFor({state:'hidden'});
   const old=await page.locator('#coordinates').textContent();await page.keyboard.down('d');await delay(400);await page.keyboard.up('d');
   await until(()=>page.locator('#coordinates').textContent().then(t=>t!==old),'Instance movement');
   await page.screenshot({path:`/tmp/dungeon-theme-${species}.png`});
   await page.locator('#menu-dungeons').click();
   assert.ok((await page.locator('#dungeon-current').textContent()).includes('남은 적 7'));
   assert.ok((await page.locator('#dungeon-list').textContent()).includes('2/3'));
   await page.getByRole('button',{name:'필드로 귀환',exact:true}).click();
   await until(()=>page.locator('#region-name').textContent().then(t=>t!=='봉쇄된 지하 보급고'),'Field return');
   await page.locator('#menu-dungeons').click();assert.ok((await page.locator('#dungeon-list').textContent()).includes('2/3'));
   const dock=await page.locator('.menu-dock').boundingBox();assert.ok(dock.x>=0&&dock.x+dock.width<=page.viewportSize().width+1,'Dungeon menu fits viewport');
   assert.deepEqual(errors,[]);console.log(`Dungeon ${species}: real admission, map, movement, return, quota and art passed.`);
   await context.close();
  }
 }finally{if(browser)await browser.close();if(server.exitCode===null){server.kill('SIGINT');await new Promise(r=>server.once('exit',r));}fs.rmSync(temp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
