// Renderer invariants: facing in isometric space, paused animation, atlas bounds,
// loading/error fallback, and drawImage source rectangles without neighbouring cells.
const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
let draws=[];const images=[];
class Image {constructor(){images.push(this);this.complete=false;this.naturalWidth=0;} }
const ctx=new Proxy({}, {get:(_,key)=>key==='drawImage'?(...args)=>draws.push(args):()=>{}});
const sandbox={Image,ctx};vm.createContext(sandbox);
for(const file of ['gothic','sprite-manifest','sprites'])vm.runInContext(fs.readFileSync(`public/${file}.js`,'utf8'),sandbox);
const {art,manifest}=vm.runInContext('({art:new FieldArt(ctx),manifest:FIELD_SPRITES})',sandbox);
assert.equal(images.length,18);
assert.equal(art.sprite('human',0,0,87),false);
for(const [key,value] of Object.entries(manifest)){
 const png=fs.readFileSync(`public/art/gameplay/${key}.png`);
 assert.equal(png.readUInt32BE(16),value.width);assert.equal(png.readUInt32BE(20),value.height);
 for(const [x,y,w,h] of value.frames){assert.ok(x>=0&&y>=0&&w>0&&h>0&&x+w<=value.width&&y+h<=value.height);}
 const img=art.images[key];img.complete=true;img.naturalWidth=value.width;img.onload();
}
assert.equal(art.loaded,18);
for(const [x,y,row] of [[1,0,0],[0,1,1],[-1,0,2],[0,-1,3]]){
 art.pose('test',0,0,0);const pose=art.pose('test',x,y,300);assert.equal(pose.row,row);assert.equal(pose.frame,1,'Walk frame follows distance travelled');art.actors.delete('test');
}
art.pose('idle',0,0,0);art.pose('idle',1,0,300);
assert.equal(art.pose('idle',1,0,800).frame,0,'Idle must stop walking');
assert.equal(art.pose('idle',2,0,900,true).frame,0,'Pause must stop walking');
function stride(id,speed,fps,sprint=false){art.pose(id,0,0,0);let pose;for(let i=1;i<=fps;i++)pose=art.pose(id,speed*i/fps,0,1000*i/fps,false,sprint);return pose;}
const walk=stride('walk',6,60),walk30=stride('walk30',6,30),run=stride('run',9.9,60,true);
assert.ok(walk.moving&&run.moving);
assert.ok(Math.abs(walk.phase-walk30.phase)<1e-9,'Stride must be independent of frame rate');
assert.equal(art.pose('walk',6.1,0,1016,false,false,{dx:0,dy:0}).moving,false,'Key release must suppress reconciliation drift');
assert.equal(art.pose('run',60,0,1016,false,true).frame,0,'Teleport must not animate a step');
assert.equal(art.pose('walk30',6,0,1200).moving,false,'Stationary actor must stop');
const phase=art.actors.get('walk30').phase;
art.pose('walk30',7,0,1300,true);
assert.equal(art.actors.get('walk30').phase,phase,'Pause must not advance stride');
art.character(100,200,1,'vampire',true,300,{pose:{row:3,frame:2}});
assert.deepEqual(draws.at(-1).slice(1,5),Array.from(manifest.vampire.frames[14]).slice(0,4));
art.images.pine.complete=false;art.images.pine.naturalWidth=0;art.images.pine.onerror();
assert.deepEqual(Array.from(art.failed),['pine']);assert.equal(art.sprite('pine',0,0,200),false);
assert.doesNotThrow(()=>art.tree(0,0,1,.8),'Failed assets must retain a drawable fallback');
for(const tier of [0,1,2])for(const sprint of [false,true]){
 assert.doesNotThrow(()=>art.character(100,200,1,'vampire',true,350,{mounted:true,tier,sprint,pose:{row:0,frame:2}}));
 assert.doesNotThrow(()=>art.character(100,200,1,'human',true,350,{mounted:false,tier,sprint,pose:{row:1,frame:1}}));
}
console.log('Field art passed: 18 PNG dimensions, atlas bounds, directional movement/idle/pause, vampire bat tiers, frame sampling and loading/error fallback.');

// Repeated zooms must reuse bounded raster frames instead of re-sampling PNGs.
let samples=0;
sandbox.document={createElement:()=>({width:0,height:0,getContext:()=>({drawImage(){samples++;}})})};
for(let i=0;i<100;i++)art.sprite('refuge',100,100,180+i*2);
assert.equal(samples,1);assert.equal(art.rasters.size,1);
assert.ok(art.rasters.get('refuge:0').height<=640);
console.log('Runtime sprite cache passed: repeated zooms reuse one bounded raster.');

sandbox.document=undefined;art.rasters.clear();
for(const [sp,g,k] of [['human','male','human-male'],['human','female','human'],['vampire','male','vampire'],['vampire','female','vampire-female']]){draws=[];art.character(100,200,1,sp,true,300,{pose:{row:0,frame:1},gender:g});assert.deepEqual(draws.at(-1).slice(1,5),Array.from(manifest[k].frames[1]).slice(0,4),sp+' '+g+' must use its own sheet');}
console.log('Gender sprite sheets passed.');

// Distinct monster silhouettes use the same four-direction, four-frame locomotion.
for(const [type,key] of [['hound','grave-hound'],['sentinel','iron-revenant']])for(let row=0;row<4;row++)for(let frame=0;frame<4;frame++){
 draws=[];art.character(10,10,1,'human',true,300,{enemy:true,monsterType:type,pose:{row,frame}});
 assert.deepEqual(draws.at(-1).slice(1,5),Array.from(manifest[key].frames[row*4+frame]).slice(0,4));
}
console.log('Monster atlases passed: hound and sentinel use all 16 directional frames.');
