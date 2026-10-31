// Browser rendering checks with disposable server snapshots, no personal saves.
const {chromium}=require('playwright'),{execFileSync}=require('node:child_process');
const path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const original=JSON.parse(execFileSync('python',['-c',`import json,tempfile
from pathlib import Path
from server.main import Runtime
from server.game import act
with tempfile.TemporaryDirectory() as d:
 r=Runtime(Path(d)/'test.db');act(r.world,{'action':'choose','species':'human'})
 r.world['player'].update(combat_level=40)
 print(json.dumps(r.snapshot()));r.store.close()`],{cwd:root,encoding:'utf8'}));
const delay=ms=>new Promise(r=>setTimeout(r,ms));
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox']});
 try{
  for(const scene of (process.env.ART_SCENES?.split(',')||['human','vampire','field','estate','salvage','cave','bike','humvee','bat','giant','garage','roost','mobile'])){
   const fixture=structuredClone(original),p=fixture.world.player;
   p.food=42;p.water=73;p.blood=61;p.stability=82;
   p.species=['vampire','estate','bat','giant','roost'].includes(scene)?'vampire':'human';
   const town=fixture.map.towns[p.species];p.x=town.spawn[0];p.y=town.spawn[1];fixture.world.base.established=false;
   if(scene==='field'||scene==='estate'){
    p.x=170;p.y=90;fixture.world.enemies=fixture.world.enemies.slice(0,3).map((e,i)=>({...e,x:173+i*3,y:92-i*2,faction:'infected',monster_type:['hound','sentinel','walker'][i]}));
    fixture.pois=fixture.pois.filter(n=>n.kind!=='npc').slice(0,6).map((n,i)=>({...n,x:165+i*2,y:86+i*2,kind:'metal',prop:'metal',site_type:['car','corpse','mine','library','garden_ruin','warehouse'][i],loot:{metal:3}}));
   }
   if(scene==='salvage'){
    p.x=170;p.y=90;fixture.world.enemies=[];
    const types=Object.keys(fixture.map.site_art).filter(k=>fixture.map.site_art[k].atlas==='salvage').slice(-20);
    fixture.pois=types.map((kind,i)=>{const original=fixture.pois.find(n=>n.site_type===kind),dx=(i%5-2)*205,dy=(Math.floor(i/5)-1.5)*170;return {...original,x:p.x+dx/68+dy/34,y:p.y-dx/68+dy/34};});
   }
   if(scene==='cave'){
    const cave=fixture.pois.find(n=>n.id==='salvage:vampire:bat_cave');
    p.x=cave.x;p.y=cave.y+1;fixture.world.enemies=[];fixture.pois=[cave];
   }
   if(['bike','humvee','bat','giant','garage','roost'].includes(scene)){
    p.x=170;p.y=90;fixture.world.enemies=[];
    p.mounted=!['garage','roost'].includes(scene);p.unlocks[p.species]=['humvee','giant'].includes(scene)?1:0;
    fixture.pois=[];
    if(!p.mounted){fixture.world.base={x:p.x,y:p.y,established:true,facilities:{mobility:1}};for(const key of Object.keys(fixture.items))fixture.world.inventory[key]=100;}
   }
   let gathered=null;
   if(scene==='estate')fixture.world.base={x:170,y:90,established:true,facilities:Object.fromEntries(Object.keys(fixture.map.facilities).map(k=>[k,2]))};
   const context=await browser.newContext({viewport:scene==='mobile'?{width:390,height:844}:{width:1440,height:900}}),page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('http://art.test/**',async route=>{
    const u=new URL(route.request().url());
    if(u.pathname.includes('socket.io'))return route.fulfill({contentType:'text/javascript',body:''});
    if(u.pathname==='/api/action'&&scene==='cave'){
     const cmd=route.request().postDataJSON().command;
     if(cmd.action==='gather'){gathered=cmd;fixture.world.cooldowns[cmd.id]=fixture.world.elapsed+120;fixture.world.revision++;}
    }
    if(u.pathname.startsWith('/api/'))return route.fulfill({json:fixture});
    return route.fulfill({path:path.join(root,'public',u.pathname==='/'?'index.html':u.pathname)});
   });
   await page.goto('http://art.test');
   await page.waitForFunction(()=>document.getElementById('world').dataset.art==='ready',{},{timeout:20000}).catch(async e=>{console.error(scene,errors,await page.locator('#world').getAttribute('data-art'));await page.screenshot({path:'/tmp/nocturne-error.png'});throw e;});
   assert.equal(await page.locator('#world').getAttribute('data-environment-art'),'ready');
   assert.equal(await page.locator('#field-food-bar').evaluate(e=>e.style.width),p.species==='human'?'42%':'61%');
   assert.equal(await page.locator('#field-water-bar').evaluate(e=>e.style.width),p.species==='human'?'73%':'82%');
   assert.equal(await page.locator('#field-mp-wrap').isVisible(),p.species==='human');
   const food=await page.locator('#field-food-wrap').boundingBox(),water=await page.locator('#field-water-wrap').boundingBox();
   assert.ok(food.width>60&&water.x>=food.x+food.width&&food.y===water.y);
   assert.ok(food.y>=(await page.locator(p.species==='human'?'#field-mp-wrap':'#field-health-bar').boundingBox()).y);

   await page.evaluate(()=>{
    const draw=WorldView.prototype.draw;
    window.__drawTimes=[];
    WorldView.prototype.draw=function(...args){const t=performance.now();const result=draw.apply(this,args);window.__artProbe=this;window.__drawTimes.push(performance.now()-t);return result;};
   });
   await delay(900);
   const stats=await page.evaluate(()=>({chunks:window.__artProbe.art.terrainChunks.size,frames:window.__artProbe.art.rasters.size,median:window.__drawTimes.slice().sort((a,b)=>a-b)[Math.floor(window.__drawTimes.length/2)],failed:window.__artProbe.art.failed}));
   assert.deepEqual(stats.failed,[]);if(scene==='salvage')assert.ok(stats.frames>=20,'All distinct salvage sprites must render');assert.ok(stats.chunks<=32);assert.ok(stats.frames<=100);
   // A roomy threshold catches repeated full-atlas decoding/rasterization, not GPU speed.
   assert.ok(stats.median<100,`Render loop stalled: ${JSON.stringify(stats)}`);
   await page.screenshot({path:`/tmp/nocturne-${scene}.png`});
   if(scene==='garage'||scene==='roost'){
    await page.locator('#menu-camp').click();await page.locator('#settlement-manage').click();
    await page.locator('[data-view=camp] [data-panel=research]').click();
    assert.match(await page.locator('#mount-upgrade-name').innerText(),scene==='garage'?/험비/:/거대/);
    assert.ok(await page.locator('#mount-upgrade').isEnabled());
    assert.match(await page.locator('#mount-upgrade-description').innerText(),/시설 준비 완료/);
    await page.screenshot({path:`/tmp/nocturne-${scene}-research.png`});
   }
   if(scene==='cave'){
    await page.keyboard.press('e');await page.locator('#loot-box').waitFor({state:'visible'});
    assert.match(await page.locator('#loot-title').innerText(),/박쥐 동굴/);
    assert.match(await page.locator('#loot-eyebrow').innerText(),/입구 수색/);
    await page.locator('#loot-all').click();
    await page.waitForFunction(()=>document.getElementById('loot-box').hidden);
    assert.equal(gathered?.id,'salvage:vampire:bat_cave');
    assert.deepEqual(gathered.items,Object.keys(fixture.pois[0].loot));
    await page.keyboard.press('e');await page.locator('#loot-box').waitFor({state:'visible'});
    assert.ok(await page.locator('#loot-all').isDisabled());
    assert.match(await page.locator('#loot-subtitle').innerText(),/대기/);
    await page.screenshot({path:'/tmp/nocturne-cave-search.png'});
   }
   assert.deepEqual(errors,[]);
   console.log(`Nocturne ${scene}: assets loaded, ${stats.chunks} terrain chunks, ${stats.frames} cached frames, median draw ${stats.median.toFixed(1)}ms.`);
   await page.unrouteAll({behavior:'ignoreErrors'});await context.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
