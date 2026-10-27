// Exercise the actual client controller with a minimal DOM and server-shaped state.
const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const nodes=new Map(),intervals=[],windowEvents={},documentEvents={};let now=0;
const ctx=new Proxy({}, {get:(_,key)=>key==='measureText'?()=>({width:30}):(key==='createRadialGradient'||key==='createLinearGradient')?()=>({addColorStop(){}}):()=>{},set:()=>true});
function node(){return {dataset:{},textContent:'',hidden:false,style:{},classList:{add(){},remove(){}},append(){},replaceChildren(){},addEventListener(){},setAttribute(){},show(){this.open=true;},close(){this.open=false;},getBoundingClientRect:()=>({width:1000,height:600,left:0,top:0}),getContext:()=>ctx,focus(){}};}
const sandbox={console,URLSearchParams,location:{hash:'',pathname:'/'},sessionStorage:{getItem:()=>null},crypto:{randomUUID:()=> 'test-session-id'},history:{},document:{body:{dataset:{}},hidden:false,getElementById:id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);},createElement:node,querySelectorAll:()=>[],addEventListener:(name,fn)=>documentEvents[name]=fn},window:{devicePixelRatio:1,addEventListener:(name,fn)=>windowEvents[name]=fn},performance:{now:()=>now},setInterval:fn=>intervals.push(fn),setTimeout:()=>0,clearTimeout(){},requestAnimationFrame(){},AbortSignal,fetch:()=>new Promise(()=>{})};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('public/gothic.js','utf8'),sandbox);
vm.runInContext(fs.readFileSync('public/sprite-manifest.js','utf8'),sandbox);
vm.runInContext(fs.readFileSync('public/sprites.js','utf8'),sandbox);
vm.runInContext(fs.readFileSync('public/combat.js','utf8'),sandbox);
vm.runInContext(fs.readFileSync('public/world.js','utf8'),sandbox);
vm.runInContext(fs.readFileSync('public/app.js','utf8'),sandbox);
const originalCommand=vm.runInContext('command',sandbox);
const python=process.env.PYTHON || 'python';
const fixture=JSON.parse(execFileSync(python,['-c',"import json;from server.game import new_world,POIS,ITEMS,RECIPES,COMBAT;from server.worldmap import WORLD_MAP;print(json.dumps({'world':new_world(),'pois':POIS,'items':ITEMS,'map':WORLD_MAP,'recipes':RECIPES,'combat':COMBAT}))"],{encoding:'utf8'}));
sandbox.fixture=fixture;
vm.runInContext('state=fixture;connected=true;state.world.player.chosen=true;command=(action,fields={})=>{if(action===\'move\'){const p=state.world.player,m=state.map.movement,s=m.step*(p.mounted?m.mount_base+p.unlocks[p.species]*m.mount_tier:1),n=Math.hypot(fields.dx,fields.dy);p.x+=fields.dx/n*s;p.y+=fields.dy/n*s;}else globalThis.lastAction={action,...fields};};update();',sandbox);
for(const mounted of [false,true])for(const destination of [[1,1],[20,20],[1,20],[20,1],[6.2,7.1],[8,4],[126,126],[1,126],[126,1],[43,15],[9,51],[55,52]]){
 sandbox.destination=destination;sandbox.mounted=mounted;
 vm.runInContext('state.world.player.x=6;state.world.player.y=7;state.world.player.mounted=mounted;state.world.player.unlocks.human=2;navigate(...destination);',sandbox);
 for(let i=0;i<800 && vm.runInContext('!!target',sandbox);i++){now+=150;intervals[0]();}
 const error=vm.runInContext('Math.hypot(state.world.player.x-destination[0],state.world.player.y-destination[1])',sandbox);
 assert.ok(error<.8,`arrival distance: ${error}`);
 assert.equal(vm.runInContext('target===null',sandbox),true,`arrival: ${mounted} ${destination}`);
}
vm.runInContext("state.world.player.x=6;state.world.player.y=7;state.world.player.mounted=false;navigate(state.pois.find(n=>n.id==='grove').x,state.pois.find(n=>n.id==='grove').y,'grove')",sandbox);
for(let i=0;i<50&&vm.runInContext('!!target',sandbox);i++){now+=150;intervals[0]();}
assert.equal(sandbox.lastAction.action,'gather');assert.equal(sandbox.lastAction.id,'grove');
vm.runInContext("navigate(20,20);state.world.paused=true;update()",sandbox);
assert.equal(vm.runInContext('target===null',sandbox),true);
vm.runInContext("state.world.milestones=['gather','craft:soup','consume:soup'];state.world.base.facilities.kitchen=1;updateGuide()",sandbox);
assert.equal(nodes.get('objective-count').textContent,'5 / 5');
// Screen-relative input must remain usable after a UI button has focus.
vm.runInContext('state.world.paused=false;clearMovement();',sandbox);
function key(type,value,tag='BUTTON'){windowEvents[type]({key:value,target:{tagName:tag},preventDefault(){}});}
for(const [input,dx,dy] of [['w',-1,-1],['d',1,-1],['s',1,1],['a',-1,1],['ArrowUp',-1,-1]]){
 now+=200;key('keydown',input);
 assert.equal(vm.runInContext('screenDirection().dx',sandbox),dx);
 assert.equal(vm.runInContext('screenDirection().dy',sandbox),dy);
 key('keyup',input);
 assert.equal(vm.runInContext('held.size',sandbox),0);
}
key('keydown','w','INPUT');assert.equal(vm.runInContext('held.size',sandbox),0);
vm.runInContext('navigate(50,50)',sandbox);key('keydown','Escape');assert.equal(vm.runInContext('target',sandbox),null);
key('keydown','w');windowEvents.blur();assert.equal(vm.runInContext('held.size',sandbox),0);
key('keydown','d');documentEvents.visibilitychange();assert.equal(vm.runInContext('held.size',sandbox),0);
key('keydown','w');vm.runInContext('state.world.paused=true;update()',sandbox);assert.equal(vm.runInContext('held.size',sandbox),0);
// Auto-hunt toggle (ON/OFF) tracks and attacks the nearest living enemy, auto-loots drops until bag is full, and Escape cancels it.
vm.runInContext('state.world.paused=false;state.world.player.x=20;state.world.player.y=20;state.world.enemies[0].x=22;state.world.enemies[0].y=20;state.world.enemies[0].hp=60;globalThis.lastAction=null;',sandbox);
key('keydown','g');assert.equal(vm.runInContext('autoHunt',sandbox),true);
assert.equal(nodes.get('auto-hunt-label').textContent,'자동사냥 ON');
for(let i=0;i<30&&!sandbox.lastAction;i++){now+=150;intervals[0]();}
assert.ok(sandbox.lastAction&&(sandbox.lastAction.action==='attack'||sandbox.lastAction.action==='skill'));
vm.runInContext('state.world.drops=[{id:"drop:1",x:21,y:20,label:"전리품",items:{scroll:3},gear:[]}];globalThis.lastAction=null;',sandbox);
now+=150;intervals[0]();
assert.equal(sandbox.lastAction?.action,'loot');assert.equal(sandbox.lastAction?.id,'drop:1');
vm.runInContext('state.world.drops=[];',sandbox);
key('keydown','Escape');assert.equal(vm.runInContext('autoHunt',sandbox),false);
assert.equal(nodes.get('auto-hunt-label').textContent,'자동사냥 OFF');
// Camera projection must round-trip at multiple zoom levels and positions.
for(const zoom of [.65,1,1.6]){
 sandbox.zoom=zoom;now+=150;
 vm.runInContext('view.setZoom(zoom);draw();globalThis.roundTrip=view.toWorld(...view.project(43,15))',sandbox);
 assert.ok(Math.abs(sandbox.roundTrip.x-43)<1e-8&&Math.abs(sandbox.roundTrip.y-15)<1e-8);
}
vm.runInContext('view.setZoom(99)',sandbox);assert.equal(vm.runInContext('view.zoom',sandbox),1.6);
console.log('Client navigation: 24 walking/mounted destinations, gathering, screen-relative controls, cancellation, camera projection and guide completion passed.');

// Camp details share the server radius and close if authoritative position changes.
vm.runInContext('state.world.paused=false;state.world.player.x=state.world.base.x;state.world.player.y=state.world.base.y+1;connected=true;update()',sandbox);
assert.equal(vm.runInContext('openPanel("craft")',sandbox),true);
assert.equal(vm.runInContext('activePanel',sandbox),'craft');
vm.runInContext('state.world.player.x=40;state.world.player.y=40;update()',sandbox);
assert.equal(vm.runInContext('activePanel',sandbox),null);
assert.equal(nodes.get('menu-camp').hidden,true);
assert.equal(vm.runInContext('openPanel("craft")',sandbox),false);
vm.runInContext('state.world.player.x=state.world.base.x;state.world.player.y=state.world.base.y+state.map.base_radius-.01;update()',sandbox);
assert.equal(vm.runInContext('canUseCamp()',sandbox),true);
vm.runInContext('state.world.player.y=state.world.base.y+state.map.base_radius+.01;update()',sandbox);
assert.equal(vm.runInContext('canUseCamp()',sandbox),false);
assert.equal(vm.runInContext('openPanel("bag")',sandbox),true);
vm.runInContext('connected=false;updateContext()',sandbox);
assert.equal(vm.runInContext('activePanel',sandbox),null);
console.log('Contextual menu checks passed: camp radius, leaving camp, remote access and disconnect.');

// Use the real async command path with a delayed transport. Visual prediction must
// never spend resources, mutate authoritative positions or queue released input.
(async()=>{
 sandbox.originalCommand=originalCommand;now+=10000;let requests=[];
 sandbox.fetch=(url,options)=>new Promise(resolve=>requests.push({url,body:JSON.parse(options.body),resolve}));
 vm.runInContext("command=originalCommand;state.world.paused=false;state.world.player.chosen=true;state.world.player.mounted=false;state.world.player.x=6;state.world.player.y=7;connected=true;busy=false;pendingAction=null;clearMovement();lastMove=-Infinity;lastCommandAt=performance.now()-20;view.player={x:6,y:7};",sandbox);
 key('keydown','d');assert.equal(requests.length,0);assert.equal(vm.runInContext('lastMove',sandbox),-Infinity,'Blocked input must not start the movement cooldown');
 now+=60;intervals[0]();assert.equal(requests.length,1);
 const start=vm.runInContext('({x:state.world.player.x,y:state.world.player.y})',sandbox);
 const predicted=vm.runInContext('({...view.prediction})',sandbox);
 assert.ok(predicted.x>start.x&&predicted.y<start.y);
 assert.ok(Math.abs(Math.hypot(predicted.x-start.x,predicted.y-start.y)-fixture.map.movement.step)<1e-8);
 vm.runInContext('draw()',sandbox);assert.ok(vm.runInContext('view.player.x>state.world.player.x',sandbox),'Move should be visible before the response');
 assert.equal(vm.runInContext('state.world.player.x',sandbox),start.x,'Prediction must not mutate server state');
 key('keyup','d');now+=200;intervals[0]();assert.equal(requests.length,1,'No catch-up movement while a request is pending');
 const accepted=vm.runInContext('JSON.parse(JSON.stringify(state))',sandbox);accepted.world.player.x=predicted.x;accepted.world.player.y=predicted.y;accepted.world.revision++;
 requests[0].resolve({ok:true,json:async()=>accepted});await new Promise(setImmediate);
 assert.equal(vm.runInContext('view.prediction',sandbox),null);assert.equal(vm.runInContext('busy',sandbox),false);
 intervals[0]();assert.equal(requests.length,1,'Key release must prevent another command after a delayed response');
 // Respect the server commit-rate gap, then send the current held direction
 // rather than an old queued movement or a fresh 140ms input penalty.
 key('keydown','w');assert.equal(requests.length,1);now+=76;intervals[0]();assert.equal(requests.length,2);assert.equal(requests[1].body.command.dx,-1);assert.equal(requests[1].body.command.dy,-1);key('keyup','w');
 requests[1].resolve({ok:false,status:400,json:async()=>({error:'Rejected move'})});await new Promise(setImmediate);
 assert.equal(vm.runInContext('view.prediction',sandbox),null);assert.equal(vm.runInContext('view.player',sandbox),null,'Rejected prediction must snap back on the next frame');
 assert.equal(vm.runInContext('state.world.player.x',sandbox),predicted.x);
 vm.runInContext('state.world.player.x=126;state.world.player.y=126;view.predictMove(state,{dx:1,dy:1})',sandbox);
 assert.equal(vm.runInContext('view.prediction.x',sandbox),126,'Prediction must respect map boundaries');
 vm.runInContext('state.world.player.x=20;state.world.player.y=20;view.predictMove(state,{dx:1,dy:0,sprint:true})',sandbox);
 assert.ok(Math.abs((vm.runInContext('view.prediction.x',sandbox)-20)-fixture.map.movement.step*1.65)<1e-8,'Sprint prediction must use sprint multiplier');
 key('keydown','Shift');assert.equal(vm.runInContext('isSprinting()',sandbox),true);
 key('keyup','Shift');assert.equal(vm.runInContext('isSprinting()',sandbox),false);
 console.log('Input latency checks passed: throttled input retry, one-step prediction, authoritative reconciliation, delayed response/key release, reversal, rejection, sprint and map bounds.');
})().catch(error=>{console.error(error);process.exitCode=1;});
