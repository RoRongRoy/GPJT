const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const sandbox={window:{matchMedia:()=>({matches:false})}};vm.createContext(sandbox);vm.runInContext(fs.readFileSync('public/combat.js','utf8'),sandbox);
const Combat=vm.runInContext('CombatEffects',sandbox);
const before={player:{x:2,y:2,hp:50,species:'human'},enemies:[{id:1,x:3,y:2,hp:60},{id:2,x:2,y:3,hp:60}]};
const after=JSON.parse(JSON.stringify(before));after.enemies[0].hp=28;after.enemies[1].hp=28;
const snapshot=JSON.stringify(before),effect=new Combat(before,after,'sweep',100);
assert.equal(effect.hits.length,2);assert.equal(effect.hits[0].damage,32);assert.equal(JSON.stringify(before),snapshot);
assert.ok(effect.body(420).x>0,'Strike must lunge toward its target');assert.equal(effect.active(1400),false);
let depth=0,texts=[];const ctx=new Proxy({}, {get:(_,key)=>key==='save'?()=>depth++:key==='restore'?()=>depth--:key==='fillText'?(t)=>texts.push(t):()=>{}});
effect.draw(ctx,(x,y)=>[x*34,y*17],1,520);assert.equal(depth,0);assert.deepEqual(texts,['32','32']);
sandbox.window.matchMedia=()=>({matches:true});const reduced=new Combat(before,after,'sweep',100);assert.deepEqual(JSON.parse(JSON.stringify(reduced.body(420))),{x:0,y:0,tilt:0});
const empty=new Combat(before,before,'attack',100,2);assert.equal(empty.row,2);assert.equal(empty.hits.length,0);
after.player.hp=68;after.enemies=before.enemies;const heal=new Combat(before,after,'recover',100);assert.equal(heal.heal,18);assert.equal(heal.hits.length,0);
console.log('Combat presentation passed: confirmed hits, immutable snapshots, directional strike, reduced motion, empty swing facing, heal and effect expiration.');
sandbox.window.matchMedia=()=>({matches:false});
const gunBefore={player:{x:0,y:0,hp:100,species:'human',job:'ranged'},enemies:[{id:1,x:8,y:0,hp:100},{id:2,x:6,y:0,hp:100}]};
const gunAfter=JSON.parse(JSON.stringify(gunBefore));gunAfter.enemies.forEach(e=>e.hp=70);
const gun=new Combat(gunBefore,gunAfter,'ranged',0,0,{blast_radius:3});
assert.equal(gun.targetDistance,Math.hypot(6*34,6*17));
assert.ok(gun.body(260).x<0&&Math.abs(gun.body(260).x)<=2,'Ranged cast should recoil, not lunge');
gun.draw(ctx,(x,y)=>[(x-y)*34,(x+y)*17],1,350);assert.equal(depth,0);
console.log('Ranged presentation passed: nearest target distance, small recoil, target blast, balanced canvas state.');
// Exercise all 56 class-specific skill definitions, not just representative visuals.
const {execFileSync}=require('node:child_process');
const catalogs=JSON.parse(execFileSync('python',['-c',"import json;from server.game import JOB_SKILLS,COMBAT;print(json.dumps([{'species':sp,'job':job,'skills':{k:{**COMBAT[k],**v,'id':k} for k,v in skills.items()}} for (sp,job),skills in JOB_SKILLS.items()]))"],{encoding:'utf8'}));
let verified=0;
for(const catalog of catalogs)for(const [id,spec] of Object.entries(catalog.skills)){
 const a={player:{x:0,y:0,hp:50,species:catalog.species,job:catalog.job},enemies:[{id:1,x:3,y:1,hp:100},{id:2,x:3.5,y:1,hp:100}]};
 const b=JSON.parse(JSON.stringify(a));
 if(spec.heal)b.player.hp+=spec.heal;else b.enemies[0].hp-=20;
 const original=JSON.stringify([a,b]),fx=new Combat(a,b,spec.visual||id,0,0,spec);
 assert.equal(fx.isSkill,true);assert.ok(fx.profile.family);assert.ok(fx.duration>=780);
 for(const phase of [.1,.3,.45,.65,.95,1.2]){
  fx.draw(ctx,(x,y)=>[(x-y)*34,(x+y)*17],1,fx.duration*phase);
  const movement=fx.body(fx.duration*phase),shake=fx.shake(fx.duration*phase);
  assert.ok(Object.values(movement).every(Number.isFinite));assert.ok(Math.abs(shake.x)<=4);
  assert.equal(depth,0);
 }
 assert.equal(fx.reaction(2,fx.impactAt+20).flash,false,'Unharmed targets must not flinch');
 if(!spec.heal)assert.equal(fx.reaction(1,fx.impactAt+20).flash,true);
 assert.equal(JSON.stringify([a,b]),original,'Effects must never change game state');
 sandbox.window.matchMedia=()=>({matches:true});const quiet=new Combat(a,b,spec.visual||id,0,0,spec);
 assert.equal(quiet.shake(quiet.impactAt+20).x,0);assert.equal(quiet.reaction(1,quiet.impactAt+20).flash,false);
 sandbox.window.matchMedia=()=>({matches:false});verified++;
}
assert.equal(verified,56);console.log('All 56 skill effects passed: phases, bounded shake, confirmed hits, reduced motion, immutable snapshots.');
