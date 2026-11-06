const {chromium}=require('playwright'),{execFileSync}=require('node:child_process');
const path=require('node:path'),assert=require('node:assert/strict'),root=path.resolve(__dirname,'..');
const seed=JSON.parse(execFileSync('python',['-c',`import json,tempfile
from pathlib import Path
from server.main import Runtime
from server.game import act
with tempfile.TemporaryDirectory() as d:
 r=Runtime(Path(d)/'test.db');act(r.world,{'action':'choose','species':'human'})
 w=r.world;w['player'].update(combat_level=80,x=w['base']['x'],y=w['base']['y'])
 w['inventory'].update(wood=20,engine_block=1,metal=11,water=21,skillbook_human_warrior_hw_dawn=1)
 w['gear'].append(dict(id='gear:expedition-test',name='탐험 외투',slot='armor',rarity='rare',power=24))
 print(json.dumps(r.snapshot()));r.store.close()`],{cwd:root,encoding:'utf8'}));
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox']});
 try{for(const mobile of [false,true]){
  const fixture=structuredClone(seed),context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://expedition.test/**',async route=>{
   const u=new URL(route.request().url());
   if(u.pathname.includes('socket.io'))return route.fulfill({body:'',contentType:'text/javascript'});
   if(u.pathname==='/api/action'){
    const command=route.request().postDataJSON().command;
    Object.assign(fixture,JSON.parse(execFileSync('python',['-c',`import sys,json
from server.game import act
from server.backpack import layout
d=json.load(sys.stdin);w=d['world'];act(w,d['command'],lambda:.5);w['revision']+=1
print(json.dumps({'world':w,'backpack':layout(w)}))`],{cwd:root,encoding:'utf8',input:JSON.stringify({world:fixture.world,command})})));
   }
   if(u.pathname.startsWith('/api/'))return route.fulfill({json:fixture});
   return route.fulfill({path:path.join(root,'public',u.pathname==='/'?'index.html':u.pathname)});
  });
  await page.goto('http://expedition.test');await page.locator('#welcome').waitFor({state:'hidden'});
  await page.keyboard.press('i');
  assert.equal(await page.locator('#inventory .item-slot').count(),0,'Duplicate inventory removed');
  for(const id of Object.values(fixture.world.equipment))if(id)assert.equal(await page.locator('#bag-tetris-grid [data-inventory-item="'+id+'"]').count(),0,'Worn gear excluded');
  assert.equal(await page.locator('#bag-equipped-slots .equip-slot-card').count(),9);
  for(const [key,shape] of [['engine_block','3×3'],['wood','3×2'],['water','1×2']]){
   assert.equal(await page.locator('[data-inventory-item="'+key+'"] .tarkov-item-size').first().textContent(),shape);
  }
  const dimensions=await page.locator('#inventory').evaluate(e=>({client:e.clientWidth,scroll:e.scrollWidth}));
  assert.ok(dimensions.scroll<=dimensions.client+2,'Grid must fit viewport');
  await page.locator('[data-inventory-item="wood"]').first().click();
  await page.locator('#bag-rotate-btn').click();
  await page.waitForFunction(()=>document.querySelector('[data-inventory-item="wood"] .tarkov-item-size')?.textContent==='2×3');
  assert.equal(await page.locator('#item-name').textContent(),'목재');
  await page.screenshot({path:`/tmp/expedition-bag-${mobile?'mobile':'desktop'}.png`});
  await page.locator('[data-inventory-item="gear:expedition-test"]').click();await page.locator('#item-use').click();
  await page.waitForFunction(()=>!document.querySelector('#bag-tetris-grid [data-inventory-item="gear:expedition-test"]'));
  assert.equal(fixture.world.equipment.armor,'gear:expedition-test');
  assert.ok(fixture.backpack.entries.some(e=>e.id==='gear:starter-armor'));
  await page.keyboard.press('Escape');await page.keyboard.press('k');
  await page.locator('#skill-discipline').selectOption('검술');
  assert.equal(await page.locator('#skills-list .skill-card').count(),2);
  await page.locator('#skills-list [data-skill=hw_dawn] > button').first().click();
  await page.waitForFunction(()=>document.querySelector('[data-skill=hw_dawn] [data-select-skill]')?.disabled===false);
  assert.ok(fixture.world.player.learned_skills.includes('human:warrior:hw_dawn'));
  await page.screenshot({path:`/tmp/expedition-skills-${mobile?'mobile':'desktop'}.png`});
  assert.deepEqual(errors,[]);
  console.log('Expedition inventory, rotation, equipment swap and specialized learning passed:',mobile?'mobile':'desktop');
  await context.close();
 }}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
