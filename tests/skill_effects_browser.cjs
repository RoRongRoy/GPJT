// Actual canvas rendering and hotbar dispatch, with disposable server-shaped fixtures.
const {chromium}=require('playwright'),{execFileSync}=require('node:child_process'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const original=JSON.parse(execFileSync('python',['-c',`import json,tempfile
from pathlib import Path
from server.main import Runtime
from server.game import act
with tempfile.TemporaryDirectory() as d:
 r=Runtime(Path(d)/'fx.db');act(r.world,{'action':'choose','species':'human'})
 print(json.dumps(r.snapshot()));r.store.close()`],{cwd:root,encoding:'utf8'}));
(async()=>{
 const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||undefined,headless:true,args:['--no-sandbox']});
 try{
  for(const [species,job] of [['human','warrior'],['human','ranged'],['vampire','warrior'],['vampire','ranged']]){
   const fixture=structuredClone(original),p=fixture.world.player,skills=fixture.job_skills[species+'_'+job];
   p.species=species;p.job=job;p.x=170;p.y=90;p.hp=70;p.combat_level=40;p.learned_skills=Object.keys(skills);
   fixture.world.base.established=false;fixture.pois=[];
   fixture.world.enemies=fixture.world.enemies.slice(0,3).map((e,i)=>({...e,x:170+(job==='warrior'?1.7:3)+i*.7,y:90+i*.5,hp:900,max_hp:1000,faction:'infected'}));
   const mobile=species==='vampire'&&job==='ranged',context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:900}}),page=await context.newPage(),errors=[];
   page.on('pageerror',e=>errors.push(e.message));
   const first=Object.keys(skills).find(k=>k.includes('_'));
   await page.addInitScript(id=>localStorage.setItem('bloodfall_hotbar_v4',JSON.stringify({'1':id})),first);
   await page.route('http://fx.test/**',async route=>{
    const u=new URL(route.request().url());
    if(u.pathname.includes('socket.io'))return route.fulfill({contentType:'text/javascript',body:''});
    if(u.pathname==='/api/action'){
     const cmd=route.request().postDataJSON().command;
     if(cmd.action==='skill'){fixture.world.enemies[0].hp-=25;fixture.world.revision++;}
    }
    if(u.pathname.startsWith('/api/'))return route.fulfill({json:fixture});
    return route.fulfill({path:path.join(root,'public',u.pathname==='/'?'index.html':u.pathname)});
   });
   await page.goto('http://fx.test');await page.waitForFunction(()=>document.getElementById('world').dataset.art==='ready');
   await page.evaluate(()=>{
    const draw=WorldView.prototype.draw;window.__fxTimes=[];
    WorldView.prototype.draw=function(...args){window.__fxView=this;if(window.__fxFreeze!=null)for(const fx of this.combatEffects)fx.start=performance.now()-fx.duration*window.__fxFreeze;const start=performance.now();const result=draw.apply(this,args);window.__fxTimes.push(performance.now()-start);return result;};
   });
   await page.waitForFunction(()=>Boolean(window.__fxView));await page.keyboard.press('1');
   await page.waitForFunction(id=>window.__fxView.combat?.skillId===id,first);
   for(const [id,jobSpec] of Object.entries(skills)){
    const spec={...fixture.combat[id],...jobSpec,id},before=structuredClone(fixture.world),after=structuredClone(before);
    if(spec.heal)after.player.hp=Math.min(100,before.player.hp+spec.heal);
    else after.enemies.forEach((e,i)=>{if(i===0||spec.aoe||spec.blast_radius)e.hp-=25;});
    await page.evaluate(({before,after,spec,id})=>{const view=window.__fxView;view.combatEffects=[];view.playCombat(before,after,spec.visual||id,spec);window.__fxFreeze=.55;},{before,after,spec,id});
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    if(['hw_quake','hw_execution','hr_rocket','hr_shock','vw_king','vr_prison','vr_doom','vr_restore'].includes(id))await page.screenshot({path:`/tmp/skill-fx-${id}.png`});
   }
   await page.evaluate(({before,spec})=>{window.__fxFreeze=.55;for(let i=0;i<12;i++){const after=structuredClone(before);after.enemies[0].hp-=10;window.__fxView.playCombat(before,after,'ranged',spec);}},{before:fixture.world,spec:{...skills[first],id:first}});
   assert.equal(await page.evaluate(()=>window.__fxView.combatEffects.length),8,'Effect overlap must stay bounded');
   await page.emulateMedia({reducedMotion:'reduce'});
   const quiet=await page.evaluate(({before,spec})=>{const after=structuredClone(before);after.enemies[0].hp-=10;window.__fxView.playCombat(before,after,'ranged',spec);const fx=window.__fxView.combat;return {shake:fx.shake(fx.start+fx.impactAt+30),reaction:fx.reaction(after.enemies[0].id,fx.start+fx.impactAt+30)};},{before:fixture.world,spec:{...skills[first],id:first}});
   assert.equal(quiet.shake.x,0);assert.equal(quiet.reaction.flash,false);
   const median=await page.evaluate(()=>{const a=window.__fxTimes.sort((a,b)=>a-b);return a[Math.floor(a.length/2)];});assert.ok(median<100);
   assert.deepEqual(errors,[]);console.log(`${species} ${job}: 14 skill renders, real hotbar dispatch, overlap cap, reduced motion; median ${median.toFixed(1)}ms.`);
   await page.unrouteAll({behavior:'ignoreErrors'});await context.close();
  }
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
