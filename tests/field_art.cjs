// Renderer invariants: facing in isometric space, paused animation, atlas bounds,
// loading/error fallback, and drawImage source rectangles without neighbouring cells.
const vm=require('node:vm'),fs=require('node:fs'),assert=require('node:assert/strict');
let draws=[];const images=[];
class Image {constructor(){images.push(this);this.complete=false;this.naturalWidth=0;} }
const ctx=new Proxy({}, {get:(_,key)=>key==='drawImage'?(...args)=>draws.push(args):()=>{}});
const sandbox={Image,ctx};vm.createContext(sandbox);
for(const file of ['gothic','sprite-manifest','sprites'])vm.runInContext(fs.readFileSync(`public/${file}.js`,'utf8'),sandbox);
const {art,manifest}=vm.runInContext('({art:new FieldArt(ctx),manifest:FIELD_SPRITES})',sandbox);
assert.equal(images.length,11);
assert.equal(art.sprite('human',0,0,87),false);
for(const [key,value] of Object.entries(manifest)){
 const png=fs.readFileSync(`public/art/gameplay/${key}.png`);
 assert.equal(png.readUInt32BE(16),value.width);assert.equal(png.readUInt32BE(20),value.height);
 for(const [x,y,w,h] of value.frames){assert.ok(x>=0&&y>=0&&w>0&&h>0&&x+w<=value.width&&y+h<=value.height);}
 const img=art.images[key];img.complete=true;img.naturalWidth=value.width;img.onload();
}
assert.equal(art.loaded,11);
for(const [x,y,row] of [[1,0,0],[0,1,1],[-1,0,2],[0,-1,3]]){
 art.pose('test',0,0,0);const pose=art.pose('test',x,y,300);assert.equal(pose.row,row);assert.equal(pose.frame,2);art.actors.delete('test');
}
art.pose('idle',0,0,0);art.pose('idle',1,0,300);
assert.equal(art.pose('idle',1,0,800).frame,0,'Idle must stop walking');
assert.equal(art.pose('idle',2,0,900,true).frame,0,'Pause must stop walking');
art.character(100,200,1,'vampire',true,300,{pose:{row:3,frame:2}});
assert.deepEqual(draws.at(-1).slice(1,5),Array.from(manifest.vampire.frames[14]));
art.images.pine.complete=false;art.images.pine.naturalWidth=0;art.images.pine.onerror();
assert.deepEqual(Array.from(art.failed),['pine']);assert.equal(art.sprite('pine',0,0,200),false);
assert.doesNotThrow(()=>art.tree(0,0,1,.8),'Failed assets must retain a drawable fallback');
console.log('Field art passed: 11 PNG dimensions, atlas bounds, directional movement/idle/pause, frame sampling and loading/error fallback.');
