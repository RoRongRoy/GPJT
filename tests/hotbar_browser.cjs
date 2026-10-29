// Actual browser UI with deterministic server-shaped fixtures; no personal saves.
const {chromium}=require('playwright'),{execFileSync}=require('node:child_process');
const path=require('node:path'),assert=require('node:assert/strict');
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
(async()=>{const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox']});try{
 for(const layout of (process.env.HUD_LAYOUTS?.split(',')||['desktop','mobile','landscape'])){
  const mobile=layout!=='desktop';
  const context=await browser.newContext({viewport:layout==='mobile'?{width:390,height:844}:layout==='landscape'?{width:844,height:390}:{width:1440,height:1000},hasTouch:mobile}),page=await context.newPage(),errors=[],commands=[];
  let fixture=structuredClone(original);
  await page.addInitScript(()=>{if(!localStorage.getItem('bloodfall_hotbar_v4'))localStorage.setItem('bloodfall_hotbar_v2',JSON.stringify({q:'recover',r:'sweep','1':'strike','2':'ranged','3':'purify','4':'ultimate'}));});
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
  const mapping=()=>page.evaluate(()=>JSON.parse(localStorage.getItem('bloodfall_hotbar_v4')));
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
  await page.screenshot({path:`/tmp/hotbar-editor-${layout}.png`});
  await page.keyboard.press('Escape');
  await page.locator('#skill-bar').waitFor({state:'visible'});
  assert.deepEqual(await page.locator('#skill-bar [data-slot]').evaluateAll(els=>els.map(el=>el.dataset.slot)),['1','2','3','4','5','6']);
  assert.equal((await page.locator('#skill-bar').innerText()).trim(),'','Field bar should have no visible text');
  assert.equal(await page.locator('#skill-bar .skill-glyph svg').count(),6);
  for(const key of ['1','2','3','4','5','6']){await page.keyboard.press(key);await delay(150);assert.equal(commands.at(-1)?.skill,assigned[key],`Key ${key} should cast its assigned skill`);}
  const count=commands.length;await page.keyboard.press('q');await page.keyboard.press('r');await delay(120);assert.equal(commands.length,count,'Old Q/R shortcuts should be retired');
  await page.screenshot({path:`/tmp/hotbar-field-${layout}.png`});
  const box=await page.locator('#skill-bar').boundingBox();assert.ok(box.x>=0&&box.x+box.width<=page.viewportSize().width,'Field bar must fit');
  await page.reload();await page.locator('#welcome').waitFor({state:'hidden'});assert.deepEqual(await mapping(),assigned,'Reload must preserve layout');
  fixture.world.player.combat_level=1;fixture.world.player.learned_skills=['sweep','recover'];
  await page.keyboard.press('k');await until(()=>page.locator('[data-select-skill=ultimate]').isDisabled(),'Locked skill became assignable');
  fixture.world.cooldowns['skill:recover']=fixture.world.elapsed+5;
  await until(()=>page.locator('#skill-bar [data-skill=recover]').getAttribute('class').then(c=>c.includes('in-cooldown')),'Cooldown overlay missing');
  assert.equal((await page.locator('#skill-bar').textContent()).trim(),'');
  await page.evaluate(()=>localStorage.setItem('bloodfall_hotbar_v4',JSON.stringify({'1':'sweep','2':'sweep','3':'bad'})));
  await page.reload();await page.locator('#welcome').waitFor({state:'hidden'});assert.equal(Object.values(await mapping()).filter(Boolean).length,1,'Invalid and duplicate entries must stay empty');
  await page.evaluate(()=>{localStorage.removeItem('bloodfall_hotbar_v4');localStorage.setItem('bloodfall_hotbar_v3',JSON.stringify({'1':'recover','2':null,'3':'ultimate'}));});
  await page.reload();await page.locator('#welcome').waitFor({state:'hidden'});assert.equal((await mapping())['1'],'recover');assert.equal((await mapping())['2'],null);assert.equal((await mapping())['3'],null,'Legacy unlearned skills must become empty');
  await page.evaluate(()=>localStorage.setItem('bloodfall_hotbar_v4','{broken'));await page.reload();await page.locator('#welcome').waitFor({state:'hidden'});assert.ok(Object.values(await mapping()).every(id=>id===null),'Malformed JSON must safely reset to empty slots');
  // Fresh settings must never auto-fill, including after a new skill is learned.
  await page.evaluate(()=>{localStorage.clear();localStorage.setItem('bloodfall_hotbar_v4','{}');});
  await page.reload();await page.locator('#welcome').waitFor({state:'hidden'});
  assert.ok(Object.values(await mapping()).every(id=>id===null));
  assert.equal(await page.locator('#skill-bar .slot-empty').count(),6);
  assert.equal(await page.locator('#skill-bar .skill-glyph svg').count(),0);
  const beforeEmpty=commands.length;await page.keyboard.press('6');await delay(150);assert.equal(commands.length,beforeEmpty,'Empty key must not issue an action');
  await page.locator('#quickslot-2').click();await page.locator('[data-select-skill=sweep]').click();
  assert.equal((await mapping())['2'],'sweep');assert.equal(Object.values(await mapping()).filter(Boolean).length,1);
  await page.locator('[data-select-skill=sweep]').click();await page.locator('[data-assign-slot=\"4\"]').click();assert.equal((await mapping())['2'],null);assert.equal((await mapping())['4'],'sweep','Moving into an empty slot must leave the original empty');
  await page.locator('[data-select-skill=sweep]').click();await page.locator('[data-assign-slot=\"2\"]').click();
  await page.locator('[data-assign-slot="2"]').click();await page.locator('#hotbar-clear').click();
  assert.equal((await mapping())['2'],null,'Selected slot can be unregistered');
  await page.reload();await page.locator('#welcome').waitFor({state:'hidden'});assert.ok(Object.values(await mapping()).every(id=>id===null),'Empty slots survive reload');
  fixture.world.player.combat_level=20;fixture.world.player.learned_skills=['sweep','recover','strike','ranged','purify','ultimate'];
  await page.locator('#menu-skills').click();await until(()=>page.locator('[data-select-skill=ultimate]').isEnabled(),'Skill unlock should become available');
  assert.ok(Object.values(await mapping()).every(id=>id===null),'Unlocking must not auto-register');
  await page.locator('[data-select-skill=sweep]').click();await page.locator('[data-assign-slot="1"]').click();
  await page.locator('.menu-body').evaluate(el=>el.scrollTop=0);await page.waitForFunction(()=>!document.getElementById('toast').classList.contains('show'));await page.screenshot({path:`/tmp/hotbar-editor-${layout}.png`});
  await page.keyboard.press('Escape');await page.screenshot({path:`/tmp/hotbar-field-${layout}.png`});
  assert.equal(await page.locator('#skill-bar .skill-glyph svg').count(),1);
  await page.locator('#quickslot-1')[mobile?'tap':'click']();await delay(150);assert.equal(commands.at(-1)?.skill,'sweep','Click/touch must cast the registered skill');
  await page.locator('.quick-items [data-item=medicine]')[mobile?'tap':'click']();await delay(150);assert.equal(commands.at(-1)?.item,'medicine');
  // Main field regions must fit on screen without overlapping one another.
  const regions=['.field-vitals','.menu-dock','.atlas','.hud-quest','#skill-bar','#interaction','.quick-items'];
  if(mobile)regions.push('.touch-pad');
  const bounds=await Promise.all(regions.map(selector=>page.locator(selector).boundingBox()));
  for(let i=0;i<bounds.length;i++){
   const b=bounds[i];assert.ok(b&&b.x>=0&&b.y>=0&&b.x+b.width<=page.viewportSize().width+1&&b.y+b.height<=page.viewportSize().height+1,`${layout}: ${regions[i]} must fit the viewport`);
   for(let j=0;j<i;j++){const c=bounds[j],overlap=Math.min(b.x+b.width,c.x+c.width)-Math.max(b.x,c.x)>1&&Math.min(b.y+b.height,c.y+c.height)-Math.max(b.y,c.y)>1;assert.ok(!overlap,`${layout}: ${regions[i]} overlaps ${regions[j]}`);}
  }
  for(const selector of ['#interact','#loot-btn','#sprint-toggle','#mount-toggle','#auto-hunt','#interaction .attack-button']){const b=await page.locator(selector).boundingBox(),c=await page.locator('#interaction').boundingBox();assert.ok(b.x>=c.x-1&&b.y>=c.y-1&&b.x+b.width<=c.x+c.width+1&&b.y+b.height<=c.y+c.height+1,`${layout}: ${selector} must stay inside the combat controls`);}
  for(const [selector,panel] of [['#menu-bag','bag'],['#menu-equip','equip'],['#menu-journal','journal'],['#menu-account','account']]){await page.locator(selector).click();assert.equal(await page.locator('#menu-dialog').getAttribute('data-panel'),panel);await page.keyboard.press('Escape');}
  fixture.world.gear.push({id:'gear:test-ring',slot:'ring',rarity:'rare',name:'검증 반지',power:7});
  await page.locator('#menu-equip').click();
  assert.equal(await page.locator('#equip-paperdoll .paperdoll-slot').count(),8);
  await until(()=>page.getByRole('button',{name:'반지 2 장착',exact:true}).isVisible(),'Ring slot choice must appear');
  await page.getByRole('button',{name:'반지 2 장착',exact:true})[mobile?'tap':'click']();await delay(150);
  assert.equal(commands.at(-1)?.action,'equip');assert.equal(commands.at(-1)?.item,'gear:test-ring');assert.equal(commands.at(-1)?.slot,'ring2');
  fixture.world.equipment.ring2='gear:test-ring';
  await page.locator('[data-equipment-slot=ring2]')[mobile?'tap':'click']();
  const ringCard=page.locator('#equip-selected .equip-slot-card');
  await until(()=>ringCard.getByRole('button',{name:'착용 해제'}).isVisible(),'Equipped ring must appear in its slot');
  await ringCard.getByRole('button',{name:'착용 해제'})[mobile?'tap':'click']();await delay(150);
  assert.equal(commands.at(-1)?.action,'unequip');assert.equal(commands.at(-1)?.slot,'ring2');
  fixture.world.equipment.ring2=null;
  await page.keyboard.press('Escape');await page.locator('#menu-bag').click();await page.locator('[data-filter=equipment]').click();
  await page.locator('[data-inventory-item="gear:test-ring"]').click();
  await page.locator('#ring-target').selectOption('ring2');await page.locator('#item-use')[mobile?'tap':'click']();await delay(150);
  assert.equal(commands.at(-1)?.action,'equip');assert.equal(commands.at(-1)?.item,'gear:test-ring');assert.equal(commands.at(-1)?.slot,'ring2');
  await page.keyboard.press('Escape');await page.locator('#menu-equip').click();
  await page.locator('.menu-body').evaluate(el=>el.scrollTop=0);
  const stage=await page.locator('.equipment-stage').boundingBox();
  for(const slot of await page.locator('#equip-paperdoll button').all()){
   const bounds=await slot.boundingBox();assert.ok(bounds.x>=stage.x-1&&bounds.y>=stage.y-1&&bounds.x+bounds.width<=stage.x+stage.width+1&&bounds.y+bounds.height<=stage.y+stage.height+1,'Equipment slots must remain inside the character stage');
  }
  assert.ok(await page.locator('#equip-character-art').evaluate(img=>img.complete&&img.naturalWidth>0),'Character art must load');
  await page.screenshot({path:`/tmp/equipment-${layout}.png`});
  await page.keyboard.press('Escape');
  fixture.world.base={x:null,y:null,established:false,facilities:{kitchen:0,alchemy:0,medical:0,storage:0}};
  fixture.world.player.x=fixture.map.towns.human.x;fixture.world.player.y=fixture.map.towns.human.y;
  await page.locator('#menu-camp').click();
  await until(()=>page.locator('#settlement-build').isDisabled(),'Town must explain why construction is unavailable');
  fixture.world.player.x=58;fixture.world.player.y=14;
  await until(()=>page.locator('#settlement-build').isEnabled(),'Field construction should be reachable');
  await page.locator('#settlement-build')[mobile?'tap':'click']();await delay(150);
  assert.equal(commands.at(-1)?.action,'claim_base','Construction button must submit a server-owned claim');
  fixture.world.base={x:58,y:14,established:true,facilities:{kitchen:0,alchemy:0,medical:0,storage:0}};
  await until(()=>page.locator('#settlement-manage').isVisible(),'Construction should expose facility management');
  await page.locator('#settlement-manage').click();assert.equal(await page.locator('#menu-dialog').getAttribute('data-panel'),'camp');
  await page.keyboard.press('Escape');await page.keyboard.press('b');assert.equal(await page.locator('#menu-dialog').getAttribute('data-panel'),'settlement');
  await page.keyboard.press('Escape');fixture.world.inventory.gold=10000;
  for(const role of ['equipment','scroll','skill','supplies']){
   const merchant=fixture.map.merchants.find(m=>m.faction==='human'&&m.role===role);
   fixture.world.player.x=merchant.x;fixture.world.player.y=merchant.y;
   await until(()=>page.locator('#coordinates').textContent().then(t=>t===`${merchant.x} / ${merchant.y}`),'Merchant position must arrive');
   await page.locator('#interact')[mobile?'tap':'click']();
   assert.equal(await page.locator('#menu-dialog').getAttribute('data-panel'),'shop');
   assert.equal(await page.locator('#shop-merchant-name').textContent(),merchant.name);
   assert.equal(await page.locator('[data-shop-category]').count(),0,'Another merchant must require a visit');
   const count=await page.locator('#shop-buy-list .shop-item-card').count();
   assert.equal(count,role==='equipment'?7:role==='supplies'?6:1);
   await page.locator('#shop-buy-list .shop-buy-btn').first()[mobile?'tap':'click']();await delay(150);
   assert.equal(commands.at(-1)?.merchant_id,merchant.id);
   assert.equal(commands.at(-1)?.action,'shop_buy');
   if(role==='equipment')await page.screenshot({path:`/tmp/specialist-shop-${layout}.png`});
   await page.keyboard.press('Escape');
  }
  for(const faction of ['human','vampire']){
   fixture.world.player.species=faction;
   const town=fixture.map.towns[faction];fixture.world.player.x=town.x;fixture.world.player.y=town.y;
   await until(()=>page.locator('#coordinates').textContent().then(t=>t===`${town.x} / ${town.y}`),'Town view must arrive');
   await page.evaluate(()=>document.getElementById('zoom-out').click());await page.evaluate(()=>document.getElementById('zoom-out').click());await delay(400);
   await page.screenshot({path:`/tmp/town-${faction}-${layout}.png`});
  }
  fixture.world.player.x=58;fixture.world.player.y=14;fixture.world.player.combat_level=50;
  fixture.world.base={x:58,y:14,established:true,facilities:Object.fromEntries(Object.keys(fixture.map.facilities).map(id=>[id,1]))};
  fixture.world.inventory=Object.fromEntries(Object.keys(fixture.items).map(id=>[id,20]));
  await until(()=>page.locator('#coordinates').textContent().then(t=>t==='58 / 14'),'Return to own camp');
  await page.locator('#menu-camp').click();await page.locator('#settlement-manage').click();
  await page.locator('[data-view=camp] [data-panel=build]').click();
  assert.equal(await page.locator('#facilities .facility').count(),12);
  await page.locator('#build-category').selectOption('장비');assert.equal(await page.locator('#facilities .facility:visible').count(),3);
  await page.locator('#facilities .facility:visible button').first()[mobile?'tap':'click']();await delay(200);
  assert.equal(commands.at(-1)?.action,'build');assert.equal(commands.at(-1)?.facility,'forge');
  await page.keyboard.press('Escape');await page.locator('#menu-camp').click();await page.locator('#settlement-manage').click();
  await page.locator('[data-view=camp] [data-panel=craft]').click();
  assert.equal(await page.locator('#recipe-choices button').count(),20);
  await page.locator('#craft-category').selectOption('장비');assert.equal(await page.locator('#recipe-choices button').count(),7);
  await page.locator('[data-craft=make_ring]').click();await page.locator('#craft-submit')[mobile?'tap':'click']();await delay(200);
  assert.equal(commands.at(-1)?.recipe,'make_ring');
  await page.screenshot({path:`/tmp/settlement-crafting-${layout}.png`});
  await page.keyboard.press('Escape');
  const mine=fixture.pois.find(p=>p.site_type==='mine');fixture.world.player.x=mine.x;fixture.world.player.y=mine.y;
  await until(()=>page.locator('#coordinates').textContent().then(t=>t===`${Math.floor(mine.x)} / ${Math.floor(mine.y)}`),'Mine position must arrive');
  await page.locator('#interact')[mobile?'tap':'click']();
  assert.equal(await page.locator('#loot-title').textContent(),mine.label);
  assert.ok((await page.locator('#loot-list').textContent()).includes('철광석'));
  await page.locator('#loot-all')[mobile?'tap':'click']();await delay(200);
  assert.equal(commands.at(-1)?.id,mine.id);assert.deepEqual(commands.at(-1)?.items,['ore','metal']);
  assert.deepEqual(errors,[]);console.log(`Hotbar ${layout} passed: migration, assignment, empty slots, removal, 1–6 dispatch, persistence, unlocks, touch/click actions, navigation and HUD bounds.`);
  await page.unrouteAll({behavior:'ignoreErrors'});await context.close();
 }
}finally{for(const context of browser.contexts())for(const page of context.pages())await page.unrouteAll({behavior:'ignoreErrors'});await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
