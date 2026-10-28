// Real input latency comparison on a disposable server. Browser requests get
// controlled delay; observations use an independent authenticated HTTP reader.
const {chromium}=require('playwright'),{spawn}=require('node:child_process');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net'),crypto=require('node:crypto'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,msg,timeout=10000){const end=Date.now()+timeout;while(Date.now()<end){if(await fn())return;await delay(30);}throw Error(msg);}
(async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'bloodfall-movement-')),key=crypto.randomBytes(32).toString('hex');
 const socket=net.createServer();await new Promise(r=>socket.listen(0,'127.0.0.1',r));const port=socket.address().port;await new Promise(r=>socket.close(r));
 const url=`http://127.0.0.1:${port}`,server=spawn(process.env.PYTHON||'python',['-m','server.main','--host','127.0.0.1','--port',String(port),'--data',path.join(tmp,'world.sqlite3')],{cwd:root,env:{...process.env,BLOODFALL_ACCESS_KEY:key},stdio:'ignore'});let browser;
 try{
  await until(async()=>{try{return (await fetch(url)).ok;}catch{return false;}},'Server missing');
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',headless:true,args:['--no-sandbox']});
  const results=[];
  for(const mode of ['legacy-delay','stream-delay','stream-socket']){
   const context=await browser.newContext({viewport:{width:1280,height:960}}),page=await context.newPage(),errors=[];
   let session,blockInputs=false;
   page.on('pageerror',e=>errors.push(e.message));
   page.on('request',r=>{if(r.url().endsWith('/api/state'))session=r.headers()['x-session-id'];});
   if(mode!=='stream-socket'){
    await page.route('**/socket.io.js',r=>r.fulfill({contentType:'text/javascript',body:''}));
    await page.route('**/api/**',async route=>{
     if(blockInputs&&route.request().url().endsWith('/api/input'))return route.abort();
     await delay(100);const response=await route.fetch(),data=await response.json();await delay(100);
     if(mode==='legacy-delay'){delete data.movement;}
     await route.fulfill({response,json:data});
    });
   }
   await page.goto(url+'/#key='+key);
   await until(()=>page.locator('#connection').textContent().then(t=>t.includes('접속)')),'Client missing');
   await page.locator('[data-species=human]').click();await page.locator('#welcome').waitFor({state:'hidden'});
   await until(()=>Boolean(session),'Session missing');
   const read=async()=>{const res=await fetch(url+'/api/state',{headers:{'X-Access-Key':key,'X-Session-ID':session}});assert.equal(res.status,200);return res.json();};
   await page.evaluate(()=>{
    const old=WorldView.prototype.draw;window.frames=[];
    WorldView.prototype.draw=function(...args){old.apply(this,args);if(this.player){window.visual={...this.player};window.frames.push({time:performance.now(),...this.player,phase:this.art.actors.get('player')?.phase,gait:this.canvas.dataset.locomotion});}};
   });
   await delay(300);const before=(await read()).world.player;
   await page.evaluate(()=>{window.frames=[];window.measureStart=performance.now();});
   const start=Date.now();await page.keyboard.down('d');
   await until(()=>page.evaluate(x=>window.visual?.x>x+.03,before.x),'No predicted response',1000);
   const firstResponseMs=Date.now()-start;
   await delay(Math.max(0,2000-(Date.now()-start)));await page.keyboard.up('d');
   await delay(650);const stopped=(await read()).world.player;
   await delay(450);const settled=(await read()).world.player;
   assert.ok(Math.hypot(settled.x-stopped.x,settled.y-stopped.y)<.01,'Key release left movement running');
   const distance=Math.hypot(stopped.x-before.x,stopped.y-before.y);
   const stalledFrames=await page.evaluate(()=>{const frames=window.frames.filter(f=>f.time-window.measureStart>300&&f.time-window.measureStart<1900),speeds=frames.slice(1).map((f,i)=>Math.hypot(f.x-frames[i].x,f.y-frames[i].y)/((f.time-frames[i].time)/1000));return speeds.filter(v=>v<1).length/speeds.length;});
   results.push({mode,firstResponseMs,distanceInTwoSeconds:Number(distance.toFixed(2)),stalledFramePercent:Math.round(stalledFrames*100)});
   assert.ok(firstResponseMs<160,'Local response waited for server round trip');
   if(mode.startsWith('stream')){
    assert.ok(distance>9&&distance<14,'Continuous movement speed drifted');assert.ok(stalledFrames<.1,'Held movement still stalls between snapshots');
    const gait=await page.evaluate(()=>({phases:new Set(window.frames.filter(f=>f.gait==='walk').map(f=>Math.floor(f.phase))).size,last:window.frames.at(-1).gait}));
    assert.ok(gait.phases>=5,'Held keyboard movement must animate a complete running stride');
    assert.equal(gait.last,'idle','Released keyboard must return to idle');
    const sprintStart=(await read()).world.player;
    await page.keyboard.down('Shift');await page.keyboard.down('a');await delay(1000);
    assert.equal(await page.locator('#world').getAttribute('data-locomotion'),'run');
    await page.keyboard.up('Shift');
    await until(()=>page.locator('#world').getAttribute('data-locomotion').then(t=>t==='walk'),'Shift release failed to restore walking',300);
    await page.keyboard.up('a');await delay(650);
    const sprintStop=(await read()).world.player,sprintDistance=Math.hypot(sprintStop.x-sprintStart.x,sprintStop.y-sprintStart.y);
    assert.ok(sprintDistance>8&&sprintDistance<12.5,'Sprint must use the server 1.65 multiplier');
    // Reverse immediately, then blur while holding the key: no stale input resumes.
    await page.keyboard.down('a');await delay(350);await page.keyboard.up('a');
    const atTurn=(await read()).world.player;await page.keyboard.down('d');await delay(500);
    assert.ok((await read()).world.player.x>atTurn.x-.3,'New direction was blocked by old input');
    await page.evaluate(()=>window.dispatchEvent(new Event('blur')));await page.keyboard.up('d');await delay(650);
    const blurred=(await read()).world.player;await delay(450);
    assert.ok(Math.hypot((await read()).world.player.x-blurred.x,(await read()).world.player.y-blurred.y)<.01,'Blur failed to stop');
    if(mode==='stream-delay'){
     await page.keyboard.down('d');await delay(350);blockInputs=true;
     await delay(750);const disconnected=(await read()).world.player;await delay(450);
     assert.ok(Math.hypot((await read()).world.player.x-disconnected.x,(await read()).world.player.y-disconnected.y)<.01,'Lost input lease kept walking');
     await page.keyboard.up('d');
    }
    if(mode==='stream-socket'){
     await page.setViewportSize({width:390,height:844});
     const pad=page.locator('[data-direction=left]');await pad.waitFor({state:'visible'});
     const box=await pad.boundingBox(),touchStart=(await read()).world.player;
     await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await delay(500);await page.mouse.up();await delay(400);
     const touchStop=(await read()).world.player;
     assert.ok(Math.hypot(touchStop.x-touchStart.x,touchStop.y-touchStart.y)>1.5,'Mobile direction pad failed');
     assert.equal(await page.locator('#world').getAttribute('data-locomotion'),'idle','Touch release must stop animation');
    }
   }
   assert.deepEqual(errors,[]);console.log(results.at(-1));await page.unrouteAll({behavior:'ignoreErrors'});await context.close();
  }
  assert.ok(results[1].distanceInTwoSeconds>results[0].distanceInTwoSeconds*2,'Latency still throttles every step');
  console.log(JSON.stringify(results,null,2));
  console.log('Movement passed: prediction, 200ms latency, server speed, Shift sprint/walk animation, reversal, release, blur, lost input expiry and Socket.IO.');
 }finally{if(browser){for(const context of browser.contexts())for(const page of context.pages())await page.unrouteAll({behavior:'ignoreErrors'});await browser.close();}if(server.exitCode===null){server.kill('SIGINT');await new Promise(r=>server.once('exit',r));}fs.rmSync(tmp,{recursive:true,force:true});}
})().catch(e=>{console.error(e);process.exitCode=1;});
