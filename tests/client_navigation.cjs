// Exercise the actual client controller with a minimal DOM and server-shaped state.
const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const nodes=new Map(),intervals=[],windowEvents={},documentEvents={};let now=0;
const ctx=new Proxy({}, {get:(_,key)=>key==='measureText'?()=>({width:30}):key==='createRadialGradient'?()=>({addColorStop(){}}):()=>{},set:()=>true});
function node(){return {textContent:'',hidden:false,style:{},classList:{add(){},remove(){}},append(){},replaceChildren(){},addEventListener(){},setAttribute(){},show(){this.open=true;},close(){this.open=false;},getBoundingClientRect:()=>({width:1000,height:600,left:0,top:0}),getContext:()=>ctx,focus(){}};}
const sandbox={console,URLSearchParams,location:{hash:'',pathname:'/'},sessionStorage:{getItem:()=>null},crypto:{randomUUID:()=> 'test-session-id'},history:{},document:{hidden:false,getElementById:id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);},createElement:node,querySelectorAll:()=>[],addEventListener:(name,fn)=>documentEvents[name]=fn},window:{devicePixelRatio:1,addEventListener:(name,fn)=>windowEvents[name]=fn},performance:{now:()=>now},setInterval:fn=>intervals.push(fn),setTimeout:()=>0,clearTimeout(){},requestAnimationFrame(){},AbortSignal,fetch:()=>new Promise(()=>{})};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('public/world.js','utf8'),sandbox);
vm.runInContext(fs.readFileSync('public/app.js','utf8'),sandbox);
const python=process.env.PYTHON || 'python';
const fixture=JSON.parse(execFileSync(python,['-c',"import json;from server.game import new_world,POIS,ITEMS,RECIPES;from server.worldmap import WORLD_MAP;print(json.dumps({'world':new_world(),'pois':POIS,'items':ITEMS,'map':WORLD_MAP,'recipes':RECIPES}))"],{encoding:'utf8'}));
sandbox.fixture=fixture;
vm.runInContext('state=fixture;connected=true;state.world.player.chosen=true;command=(action,fields={})=>{if(action===\'move\'){const p=state.world.player,m=state.map.movement,s=m.step*(p.mounted?m.mount_base+p.unlocks[p.species]*m.mount_tier:1),n=Math.hypot(fields.dx,fields.dy);p.x+=fields.dx/n*s;p.y+=fields.dy/n*s;}else globalThis.lastAction={action,...fields};};update();',sandbox);
for(const mounted of [false,true])for(const destination of [[1,1],[20,20],[1,20],[20,1],[6.2,7.1],[8,4],[62,62],[1,62],[62,1],[43,15],[9,51],[55,52]]){
 sandbox.destination=destination;sandbox.mounted=mounted;
 vm.runInContext('state.world.player.x=6;state.world.player.y=7;state.world.player.mounted=mounted;state.world.player.unlocks.human=2;navigate(...destination);',sandbox);
 for(let i=0;i<400 && vm.runInContext('!!target',sandbox);i++){now+=150;intervals[0]();}
 const error=vm.runInContext('Math.hypot(state.world.player.x-destination[0],state.world.player.y-destination[1])',sandbox);
 assert.ok(error<.8,`arrival distance: ${error}`);
 assert.equal(vm.runInContext('target===null',sandbox),true,`arrival: ${mounted} ${destination}`);
}
vm.runInContext("state.world.player.x=6;state.world.player.y=7;state.world.player.mounted=false;navigate(4,8,'grove')",sandbox);
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
// Camera projection must round-trip at multiple zoom levels and positions.
for(const zoom of [.65,1,1.6]){
 sandbox.zoom=zoom;now+=150;
 vm.runInContext('view.setZoom(zoom);draw();globalThis.roundTrip=view.toWorld(...view.project(43,15))',sandbox);
 assert.ok(Math.abs(sandbox.roundTrip.x-43)<1e-8&&Math.abs(sandbox.roundTrip.y-15)<1e-8);
}
vm.runInContext('view.setZoom(99)',sandbox);assert.equal(vm.runInContext('view.zoom',sandbox),1.6);
console.log('Client navigation: 24 walking/mounted destinations, gathering, screen-relative controls, cancellation, camera projection and guide completion passed.');

// Camp details share the server radius and close if authoritative position changes.
vm.runInContext('state.world.paused=false;state.world.player.x=6;state.world.player.y=7;connected=true;update()',sandbox);
assert.equal(vm.runInContext('openPanel("craft")',sandbox),true);
assert.equal(vm.runInContext('activePanel',sandbox),'craft');
vm.runInContext('state.world.player.x=40;state.world.player.y=40;update()',sandbox);
assert.equal(vm.runInContext('activePanel',sandbox),null);
assert.equal(nodes.get('menu-camp').hidden,true);
assert.equal(vm.runInContext('openPanel("craft")',sandbox),false);
vm.runInContext('state.world.player.x=6;state.world.player.y=8.79;update()',sandbox);
assert.equal(vm.runInContext('canUseCamp()',sandbox),true);
vm.runInContext('state.world.player.y=8.81;update()',sandbox);
assert.equal(vm.runInContext('canUseCamp()',sandbox),false);
assert.equal(vm.runInContext('openPanel("bag")',sandbox),true);
vm.runInContext('connected=false;updateContext()',sandbox);
assert.equal(vm.runInContext('activePanel',sandbox),null);
console.log('Contextual menu checks passed: camp radius, leaving camp, remote access and disconnect.');
