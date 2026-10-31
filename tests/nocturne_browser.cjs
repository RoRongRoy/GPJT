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
  for(const scene of (process.env.ART_SCENES?.split(',')||['human','vampire','field','estate','mobile'])){
   const fixture=structuredClone(original),p=fixture.world.player;
   p.species=scene==='vampire'||scene==='estate'?'vampire':'human';
   const town=fixture.map.towns[p.species];p.x=town.spawn[0];p.y=town.spawn[1];fixture.world.base.established=false;
   if(scene==='field'||scene==='estate'){
    p.x=170;p.y=90;fixture.world.enemies=fixture.world.enemies.slice(0,3).map((e,i)=>({...e,x:173+i*3,y:92-i*2,faction:'infected',monster_type:['hound','sentinel','walker'][i]}));
    fixture.pois=fixture.pois.filter(n=>n.kind!=='npc').slice(0,6).map((n,i)=>({...n,x:165+i*2,y:86+i*2,kind:'metal',prop:'metal',site_type:['car','corpse','mine','library','garden_ruin','warehouse'][i],loot:{metal:3}}));
   }
   if(scene==='estate')fixture.world.base={x:170,y:90,established:true,facilities:Object.fromEntries(Object.keys(fixture.map.facilities).map(k=>[k,2]))};
   const context=await browser.newContext({viewport:scene==='mobile'?{width:390,height:844}:{width:1440,height:900}}),page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   await page.route('http://art.test/**',async route=>{
    const u=new URL(route.request().url());
    if(u.pathname.includes('socket.io'))return route.fulfill({contentType:'text/javascript',body:''});
    if(u.pathname.startsWith('/api/'))return route.fulfill({json:fixture});
    return route.fulfill({path:path.join(root,'public',u.pathname==='/'?'index.html':u.pathname)});
   });
   await page.goto('http://art.test');
   await page.waitForFunction(()=>document.getElementById('world').dataset.art==='ready',{},{timeout:20000}).catch(async e=>{console.error(scene,errors,await page.locator('#world').getAttribute('data-art'));await page.screenshot({path:'/tmp/nocturne-error.png'});throw e;});
   assert.equal(await page.locator('#world').getAttribute('data-environment-art'),'ready');
   await page.evaluate(()=>{
    const draw=WorldView.prototype.draw;
    window.__drawTimes=[];
    WorldView.prototype.draw=function(...args){const t=performance.now();const result=draw.apply(this,args);window.__artProbe=this;window.__drawTimes.push(performance.now()-t);return result;};
   });
   await delay(900);
   const stats=await page.evaluate(()=>({chunks:window.__artProbe.art.terrainChunks.size,frames:window.__artProbe.art.rasters.size,median:window.__drawTimes.slice().sort((a,b)=>a-b)[Math.floor(window.__drawTimes.length/2)],failed:window.__artProbe.art.failed}));
   assert.deepEqual(stats.failed,[]);assert.ok(stats.chunks<=32);assert.ok(stats.frames<=100);
   // A roomy threshold catches repeated full-atlas decoding/rasterization, not GPU speed.
   assert.ok(stats.median<100,`Render loop stalled: ${JSON.stringify(stats)}`);
   await page.screenshot({path:`/tmp/nocturne-${scene}.png`});
   assert.deepEqual(errors,[]);
   console.log(`Nocturne ${scene}: assets loaded, ${stats.chunks} terrain chunks, ${stats.frames} cached frames, median draw ${stats.median.toFixed(1)}ms.`);
   await page.unrouteAll({behavior:'ignoreErrors'});await context.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
