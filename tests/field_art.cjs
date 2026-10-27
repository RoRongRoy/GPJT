// Renderer invariants: facing in isometric space, paused animation, atlas bounds,
// loading/error fallback, and drawImage source rectangles without neighbouring cells.
const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
let draws=[];const images=[];
class Image {constructor(){images.push(this);this.complete=false;this.naturalWidth=0;} }
const ctx=new Proxy({}, {get:(_,key)=>key==='drawImage'?(...args)=>draws.push(args):()=>{}});
const sandbox={Image,ctx};vm.createContext(sandbox);
for(const file of ['gothic','sprite-manifest','hero','sprites'])vm.runInContext(fs.readFileSync(`public/${file}.js`,'utf8'),sandbox);
const {art,manifest}=vm.runInContext('({art:new FieldArt(ctx),manifest:FIELD_SPRITES})',sandbox);
assert.equal(images.length,13);
assert.equal(art.sprite('human',0,0,87),false);
for(const [key,value] of Object.entries(manifest)){
 const png=fs.readFileSync(`public/art/gameplay/${key}.png`);
 assert.equal(png.readUInt32BE(16),value.width);assert.equal(png.readUInt32BE(20),value.height);
 for(const [x,y,w,h] of value.frames){assert.ok(x>=0&&y>=0&&w>0&&h>0&&x+w<=value.width&&y+h<=value.height);}
 const img=art.images[key];img.complete=true;img.naturalWidth=value.width;img.onload();
}
assert.equal(art.loaded,13);
for(const [x,y,row] of [[1,0,0],[0,1,1],[-1,0,2],[0,-1,3]]){
 art.pose('test',0,0,0);const pose=art.pose('test',x,y,300);assert.equal(pose.row,row);assert.equal(pose.frame,1,'Walk frame follows distance travelled');art.actors.delete('test');
}
art.pose('idle',0,0,0);art.pose('idle',1,0,300);
assert.equal(art.pose('idle',1,0,800).frame,0,'Idle must stop walking');
assert.equal(art.pose('idle',2,0,900,true).frame,0,'Pause must stop walking');
art.character(100,200,1,'vampire',true,300,{npc:true,pose:{row:3,frame:2}});
assert.deepEqual(draws.at(-1).slice(1,5),Array.from(manifest.vampire.frames[14]).slice(0,4));
art.images.pine.complete=false;art.images.pine.naturalWidth=0;art.images.pine.onerror();
assert.deepEqual(Array.from(art.failed),['pine']);assert.equal(art.sprite('pine',0,0,200),false);
assert.doesNotThrow(()=>art.tree(0,0,1,.8),'Failed assets must retain a drawable fallback');
for(const tier of [0,1,2])for(const sprint of [false,true]){
 assert.doesNotThrow(()=>art.character(100,200,1,'vampire',true,350,{mounted:true,tier,sprint,pose:{row:0,frame:2}}));
 assert.doesNotThrow(()=>art.character(100,200,1,'human',true,350,{mounted:false,tier,sprint,pose:{row:1,frame:1}}));
}
console.log('Field art passed: 13 PNG dimensions, atlas bounds, directional movement/idle/pause, vampire bat tiers, frame sampling and loading/error fallback.');

// Repeated zooms must reuse bounded raster frames instead of re-sampling PNGs.
let samples=0;
sandbox.document={createElement:()=>({width:0,height:0,getContext:()=>({drawImage(){samples++;}})})};
for(let i=0;i<100;i++)art.sprite('refuge',100,100,180+i*2);
assert.equal(samples,1);assert.equal(art.rasters.size,1);
assert.ok(art.rasters.get('refuge:0').height<=640);
console.log('Runtime sprite cache passed: repeated zooms reuse one bounded raster.');

sandbox.document=undefined;art.rasters.clear();
// Players use the articulated hero renderer: no sprite sheet blits, and the legs really move with the gait phase.
for(const [sp,g,job] of [['human','male','warrior'],['human','female','ranged'],['vampire','male','warrior'],['vampire','female','ranged']])for(const row of [0,1,2,3]){
  draws=[];assert.doesNotThrow(()=>art.character(100,200,1,sp,true,300,{gender:g,job,sprint:row%2===0,pose:{row,frame:0,phase:1.3,amp:1}}));
  assert.equal(draws.length,0,'players must not be blitted from a picture sheet');
}
const feet=(phase)=>{const pts=[];const c2=new Proxy({}, {get:(_,k)=>k==='ellipse'?()=>{}:k==='moveTo'||k==='lineTo'?(x,y)=>pts.push([Math.round(x*10),Math.round(y*10)]):()=>{}, set:()=>true});const a2=vm.runInContext('(c)=>new FieldArt(c)',sandbox)(c2);a2.character(0,0,1,'human',true,0,{gender:'male',job:'warrior',pose:{row:0,frame:0,phase,amp:1}});return JSON.stringify(pts);};
assert.notEqual(feet(0),feet(Math.PI/2),'limb positions must change through the walk cycle');
assert.equal(art.actorKey('human',{gender:'male'}),'human-male');assert.equal(art.actorKey('vampire',{gender:'female'}),'vampire-female');
console.log('Gender sprite sheets passed.');
