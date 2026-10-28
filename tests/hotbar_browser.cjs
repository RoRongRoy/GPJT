// Actual browser UI with deterministic server-shaped fixtures; no personal saves.
const {chromium}=require('playwright'),{execFileSync}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),delay=ms=>new Promise(r=>setTimeout(r,ms));
const original=JSON.parse(execFileSync(process.env.PYTHON||'python',['-c',`import json,tempfile
from pathlib import Path
from server.main import Runtime
from server.game import act
with tempfile.TemporaryDirectory() as d:
 r=Runtime(Path(d)/'test.sqlite3');act(r.world,{'action':'choose','species':'human'})
 p=r.world['player'];p.update(combat_level=20,hp=45,mp=100,learned_skills=['sweep','recover','strike','ranged','purify','ultimate'])
 r.world['enemies'][0].update(x=p['x']+1,y=p['y'],hp=10000)
 print(json.dumps(r.snapshot()));r.store.close()`],{cwd:root,encoding:'utf8'}));
async function until(check,msg){for(let i=0;i<100;i++){if(await check())return;await delay(30);}throw Error(msg);}
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});try{
 for(const mobile of [false,true]){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},hasTouch:mobile}),page=await context.newPage(),errors=[],commands=[];
  let fixture=structuredClone(original);
  await page.addInitScript(()=>{if(!localStorage.getItem('bloodfall_hotbar_v3'))localStorage.setItem('bloodfall_hotbar_v2',JSON.stringify({q:'recover',r:'sweep','1':'strike','2':'ranged','3':'purify','4':'ultimate'}));});
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://hotbar.test/**',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname.includes('socket.io'))return route.fulfill({contentType:'text/javascript',body:''});
   if(url.pathname.startsWith('/api/')){
    if(url.pathname==='/api/action'){commands.push(route.request().postDataJSON().command);fixture.world.revision++;}
    fixture.snapshot_time=Date.now()/1000;
    return route.fulfill({json:fixture});
   }
   return route.fulfill({path:path.join(root,'public',url.pathname==='/'?'index.html':url.pathname)});
  });
  await page.goto('http://hotbar.test');await page.locator('#welcome').waitFor({state:'hidden'});
  const mapping=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('bloodfall_hotbar_v3')));
  assert.equal((await mapping())['1'],'recover','Old Q/R layout should migrate by position');
  await page.keyboard.press('k');await page.locator('[data-assign-slot="6"]').waitFor({state:'visible'});
  assert.deepEqual(await page.locator('[data-assign-slot] kbd').allTextContents(),['1','2','3','4','5','6']);
  await page.locator('[data-select-skill=ultimate]').click();await page.locator('[data-assign-slot="1"]').click();
  assert.equal((await mapping())['1'],'ultimate');assert.equal((await mapping())['6'],'recover');
  await page.locator('[data-assign-slot="3"]').click();await page.locator('[data-select-skill=recover]').click();
  assert.equal((await mapping())['3'],'recover');
  const card=await page.locator('[data-select-skill=sweep]').elementHandle();await card.focus();await delay(650);
  assert.ok(await card.evaluate(el=>el.isConnected&&el===document.activeElement),'Polling must preserve assignment controls and focus');
  await page.keyboard.press('1');assert.equal(commands.length,0,'Editing must not cast numeric skills');
  if(!mobile){
   const source=page.locator('#skills-list [data-skill=ranged] .skill-glyph-box');
   await source.scrollIntoViewIfNeeded();
   const from=await source.boundingBox(),to=await page.locator('[data-assign-slot="5"]').boundingBox();
   await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();
   await page.mouse.move(from.x+from.width/2+8,from.y+from.height/2,{steps:4});
   await page.mouse.move(to.x+to.width/2,to.y+to.height/2,{steps:20});await page.mouse.up();
   assert.equal((await mapping())['5'],'ranged','Drag and drop must work inside the skills window');
  }
  const assigned=await mapping();assert.equal(new Set(Object.values(assigned)).size,6);
  await page.locator('.menu-body').evaluate(el=>el.scrollTop=0);
  await page.screenshot({path:`/tmp/hotbar-editor-${mobile?'mobile':'desktop'}.png`});
  await page.keyboard.press('Escape');
  await page.locator('#skill-bar').waitFor({state:'visible'});
  assert.deepEqual(await page.locator('#skill-bar [data-slot]').evaluateAll(els=>els.map(el=>el.dataset.slot)),['1','2','3','4','5','6']);
  assert.equal((await page.locator('#skill-bar').innerText()).trim(),'','Field bar should have no visible text');
  assert.equal(await page.locator('#skill-bar .skill-glyph svg').count(),6);
  for(const key of ['1','2','3','4','5','6']){await page.keyboard.press(key);await delay(150);assert.equal(commands.at(-1)?.skill,assigned[key],`Key ${key} should cast its assigned skill`);}
  const count=commands.length;await page.keyboard.press('q');await page.keyboard.press('r');await delay(120);assert.equal(commands.length,count,'Old Q/R shortcuts should be retired');
  await page.screenshot({path:`/tmp/hotbar-field-${mobile?'mobile':'desktop'}.png`});
  const box=await page.locator('#skill-bar').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=page.viewportSize().width,'Field bar must fit');
  await page.reload();await page.locator('#welcome').waitFor({state:'hidden'});assert.deepEqual(await mapping(),assigned,'Reload must preserve layout');
  fixture.world.player.combat_level=1;fixture.world.player.learned_skills=['sweep','recover'];
  await page.keyboard.press('k');await until(()=>page.locator('[data-select-skill=ultimate]').isDisabled(),'Locked skill became assignable');
  fixture.world.cooldowns['skill:recover']=fixture.world.elapsed+5;
  await until(()=>page.locator('#skill-recover').getAttribute('class').then(c=>c.includes('in-cooldown')),'Cooldown overlay missing');
  assert.equal((await page.locator('#skill-bar').textContent()).trim(),'');
  await page.evaluate(()=>localStorage.setItem('bloodfall_hotbar_v3',JSON.stringify({'1':'sweep','2':'sweep','3':'bad'})));
  await page.reload();await page.locator('#welcome').waitFor({state:'hidden'});assert.equal(new Set(Object.values(await mapping())).size,6,'Malformed storage should restore unique slots');
  assert.deepEqual(errors,[]);console.log(`Hotbar ${mobile?'mobile':'desktop'} passed: migration, click assignment, drag, stable focus, 1–6 dispatch, icons, persistence, locked skills and cooldowns.`);
  await page.unrouteAll({behavior:'ignoreErrors'});await context.close();
 }
}finally{for(const context of browser.contexts())for(const page of context.pages())await page.unrouteAll({behavior:'ignoreErrors'});await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
