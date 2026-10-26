// Exercise the actual client controller with a minimal DOM and server-shaped state.
const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
const {execFileSync}=require('node:child_process');
const nodes=new Map(),intervals=[];
const ctx=new Proxy({}, {get:(_,key)=>key==='measureText'?()=>({width:30}):key==='createRadialGradient'?()=>({addColorStop(){}}):()=>{},set:()=>true});
function node(){return {textContent:'',hidden:false,style:{},classList:{add(){},remove(){}},append(){},replaceChildren(){},addEventListener(){},getBoundingClientRect:()=>({width:1000,height:600}),getContext:()=>ctx,focus(){}};}
const sandbox={console,URLSearchParams,location:{hash:'',pathname:'/'},sessionStorage:{getItem:()=>null},crypto:{randomUUID:()=> 'test-session-id'},history:{},document:{hidden:false,getElementById:id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id);},createElement:node,querySelectorAll:()=>[],addEventListener(){}},window:{devicePixelRatio:1,addEventListener(){}},performance:{now:()=>0},setInterval:fn=>intervals.push(fn),setTimeout:()=>0,clearTimeout(){},requestAnimationFrame(){},AbortSignal,fetch:()=>new Promise(()=>{})};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync('public/app.js','utf8'),sandbox);
const python=process.env.PYTHON || 'python';
const fixture=JSON.parse(execFileSync(python,['-c',"import json;from server.game import new_world,POIS,ITEMS;print(json.dumps({'world':new_world(),'pois':POIS,'items':ITEMS}))"],{encoding:'utf8'}));
sandbox.fixture=fixture;
vm.runInContext('state=fixture;connected=true;state.world.player.chosen=true;command=(action,fields={})=>{if(action===\'move\'){const p=state.world.player,s=p.mounted?.42*(1.55+p.unlocks[p.species]*.25):.42,n=Math.hypot(fields.dx,fields.dy);p.x+=fields.dx/n*s;p.y+=fields.dy/n*s;}else globalThis.lastAction={action,...fields};};update();',sandbox);
for(const mounted of [false,true])for(const destination of [[1,1],[20,20],[1,20],[20,1],[6.2,7.1],[8,4]]){
 sandbox.destination=destination;sandbox.mounted=mounted;
 vm.runInContext('state.world.player.x=6;state.world.player.y=7;state.world.player.mounted=mounted;state.world.player.unlocks.human=2;navigate(...destination);',sandbox);
 for(let i=0;i<200 && vm.runInContext('!!target',sandbox);i++)intervals[0]();
 assert.equal(vm.runInContext('target===null',sandbox),true,`arrival: ${mounted} ${destination}`);
}
vm.runInContext("state.world.player.x=6;state.world.player.y=7;state.world.player.mounted=false;navigate(4,8,'grove')",sandbox);
for(let i=0;i<50&&vm.runInContext('!!target',sandbox);i++)intervals[0]();
assert.equal(sandbox.lastAction.action,'gather');assert.equal(sandbox.lastAction.id,'grove');
vm.runInContext("navigate(20,20);state.world.paused=true;update()",sandbox);
assert.equal(vm.runInContext('target===null',sandbox),true);
vm.runInContext("state.world.milestones=['gather','craft:soup','consume:soup'];state.world.base.facilities.kitchen=1;updateGuide()",sandbox);
assert.equal(nodes.get('objective-count').textContent,'5 / 5');
console.log('Client navigation: 12 walking/mounted destinations, gathering, pause cancellation and guide completion passed.');
