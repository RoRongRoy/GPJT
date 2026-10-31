// Exercise UI against actual Python game rules; all worlds are disposable.
const {chromium}=require('playwright'),{execFileSync}=require('node:child_process');
const path=require('node:path'),assert=require('node:assert/strict'),root=path.resolve(__dirname,'..');
const seed=JSON.parse(execFileSync('python',['-c',`import json,tempfile
from pathlib import Path
from server.main import Runtime
from server.game import act
with tempfile.TemporaryDirectory() as d:
 r=Runtime(Path(d)/'test.db');act(r.world,{'action':'choose','species':'human'})
 w=r.world;w['player'].update(combat_level=30,x=w['base']['x'],y=w['base']['y'])
 w['inventory'].update(skillbook_human_warrior_hw_slash=1,skillbook_vampire_warrior_vw_fang=1,skillbook=10,scroll=50)
 print(json.dumps(r.snapshot()));r.store.close()`],{cwd:root,encoding:'utf8'}));
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox']});
 try{
 for(const mobile of [false,true]){
  const fixture=structuredClone(seed),context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900}}),page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.route('http://books.test/**',async route=>{
   const url=new URL(route.request().url());
   if(url.pathname.includes('socket.io'))return route.fulfill({body:'',contentType:'text/javascript'});
   if(url.pathname==='/api/action'){
    const command=route.request().postDataJSON().command;
    fixture.world=JSON.parse(execFileSync('python',['-c',`import sys,json
from server.game import act
data=json.load(sys.stdin);w=data['world'];act(w,data['command'],lambda:0);w['revision']+=1
print(json.dumps(w))`],{cwd:root,encoding:'utf8',input:JSON.stringify({world:fixture.world,command})}));
   }
   if(url.pathname.startsWith('/api/'))return route.fulfill({json:fixture});
   return route.fulfill({path:path.join(root,'public',url.pathname==='/'?'index.html':url.pathname)});
  });
  await page.goto('http://books.test');await page.locator('#welcome').waitFor({state:'hidden'});
  await page.keyboard.press('i');
  await page.locator('[data-filter=growth]').click();
  await page.locator('[data-inventory-item=skillbook_vampire_warrior_vw_fang]').click();
  assert.equal(await page.locator('#item-use').isDisabled(),true);
  await page.locator('[data-inventory-item=skillbook_human_warrior_hw_slash]').click();
  assert.equal(await page.locator('#item-use').isEnabled(),true);
  await page.locator('#item-use').click();
  await page.waitForFunction(()=>document.querySelector('[data-inventory-item=skillbook_human_warrior_hw_slash]')?.hidden||!document.querySelector('[data-inventory-item=skillbook_human_warrior_hw_slash]'));
  assert.ok(fixture.world.player.learned_skills.includes('human:warrior:hw_slash'));
  assert.equal(fixture.world.inventory.skillbook,10);
  await page.keyboard.press('Escape');await page.locator('#menu-camp').click();await page.locator('#settlement-manage').click();
  await page.locator('[data-view=camp] [data-panel=research]').click();
  const armor=fixture.world.gear.find(g=>g.slot==='armor'),weapon=fixture.world.gear.find(g=>g.slot==='weapon'),power=armor.power;
  await page.locator('#enhancement-gear').selectOption(armor.id);
  await page.locator('[data-action=enhance]').click();
  await page.waitForFunction(()=>document.getElementById('enhancement-preview').textContent.includes('+1 → +2'));
  assert.equal(fixture.world.gear.find(g=>g.id===armor.id).power,power+1);
  assert.equal(fixture.world.gear.find(g=>g.id===weapon.id).enhancement,undefined);
  assert.equal(await page.locator('#enhancement-gear').inputValue(),armor.id);
  assert.deepEqual(errors,[]);
  await page.screenshot({path:`/tmp/equipment-upgrade-${mobile?'mobile':'desktop'}.png`});
  console.log('Named book inventory use and selected armor enhancement passed:',mobile?'mobile':'desktop');
  await context.close();
 }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
