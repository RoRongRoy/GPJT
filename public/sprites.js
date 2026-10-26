/* Original raster field artwork. Source PNGs stay untouched; atlas rectangles are
   sampled at render time. Rules and collision remain on the server. */
class FieldArt extends GothicArt {
 constructor(context) {
  super(context);this.images={};this.failed=[];this.loaded=0;this.patterns={};this.actors=new Map();
  if(typeof Image==='undefined')return; // Headless controller checks use the vector fallback.
  for(const key of Object.keys(FIELD_SPRITES)){
   const img=new Image();this.images[key]=img;
   img.onload=()=>{this.loaded++;};img.onerror=()=>{this.failed.push(key);};
   img.src='/art/gameplay/'+key+'.png';
  }
 }
 ready(key){const img=this.images[key];return img?.complete&&img.naturalWidth>0;}
 sprite(key,x,y,height,frame=0,flip=false,bottom=0){
  if(!this.ready(key))return false;
  const c=this.c,img=this.images[key],rect=FIELD_SPRITES[key].frames[frame], [sx,sy,sw,sh]=rect;
  const width=height*sw/sh;
  c.save();c.translate(x,y+bottom);if(flip)c.scale(-1,1);
  c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';
  c.drawImage(img,sx,sy,sw,sh,-width/2,-height,width,height);c.restore();return true;
 }
 shadow(x,y,width,scale){this.oval(x+4*scale,y+3*scale,width*scale,width*.34*scale,'#070b1080');}
 tree(x,y,scale,seed=.7){
  const key=seed>.45?'pine':'dead-tree',h=(key==='pine'?205:185)*( .88+seed*.18)*scale;
  this.shadow(x,y,28,scale);if(!this.sprite(key,x,y,h,0,seed<.22))super.tree(x,y,scale,seed);
 }
 ruin(x,y,scale,seed=0){this.shadow(x,y,64,scale);if(!this.sprite('ruin',x,y,(204+seed*18)*scale,0,false,24*scale))super.ruin(x,y,scale,seed);}
 refuge(x,y,scale){this.shadow(x,y,82,scale);if(!this.sprite('refuge',x,y,275*scale,0,false,35*scale))super.refuge(x,y,scale);}
 prop(id,x,y,scale){
  const props={water:[0,105],metal:[1,108],blood:[2,133],lantern:[3,120],kitchen:[4,67],alchemy:[5,65],medical:[6,75],storage:[7,56]};
  const [frame,h]=props[id];this.shadow(x,y,id==='metal'?37:21,scale);
  return this.sprite('props',x,y,h*scale,frame,false,6*scale);
 }
 lantern(x,y,scale){if(!this.prop('lantern',x,y,scale))super.lantern(x,y,scale);this.glow(x,y-101*scale,30*scale,'#e8b26924');}
 facility(x,y,scale,id){if(!this.prop(id,x,y,scale))super.facility(x,y,scale,id);}
 pose(id,x,y,now,paused=false){
  let a=this.actors.get(id);if(!a){a={x,y,row:0,until:0};this.actors.set(id,a);}
  const dx=x-a.x,dy=y-a.y;
  if(Math.hypot(dx,dy)>.002){
   const right=dx-dy>=0,front=dx+dy>=0;
   a.row=front?(right?0:1):(right?3:2);a.until=now+160;
  }
  a.x=x;a.y=y;return {row:a.row,frame:!paused&&now<a.until?Math.floor(now/145)%4:0};
 }
 character(x,y,scale,species,moving,now,options={}){
  if(options.mounted)return super.character(x,y,scale,species,moving,now,options);
  const key=options.enemy?(options.variant?'brute':'ghoul'):species;
  const pose=options.pose||{row:0,frame:0};
  // Human/ghoul sheets repeat the back-right view: mirror it for back-left.
  const repeated=['human','ghoul'].includes(key)&&pose.row>=2;
  const mirror=repeated&&pose.row===2;
  const row=repeated?2:pose.row,h=(key==='brute'?89:key==='ghoul'?78:87)*scale;
  this.shadow(x,y,options.enemy?18:15,scale);
  if(!this.sprite(key,x,y,h,row*4+pose.frame,mirror))super.character(x,y,scale,species,moving,now,options);
 }
 ground(state,projection){
  if(!this.ready('earth')||!this.ready('stone')||typeof DOMMatrix==='undefined')return false;
  const size=state.map.size;
  if(!this.groundCache){
   // Bake static terrain once, rather than resampling two large textures for
   // hundreds of tiny diamonds on every animation frame (especially on mobile).
   const canvas=document.createElement('canvas'),density=48;canvas.width=canvas.height=size*density;
   const g=canvas.getContext('2d');g.scale(density,density);
   const patterns={};
   for(const key of ['stone','earth']){patterns[key]=g.createPattern(this.images[key],'repeat');patterns[key].setTransform(new DOMMatrix().scale(8/this.images[key].naturalWidth));}
   for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const region=state.map.regions.find(r=>x>=r.x&&y>=r.y&&x<r.x+r.width&&y<r.y+r.height)?.id||'outskirts';
    const road=[10,32,50].includes(x)||[10,32,50].includes(y);
    g.fillStyle=patterns[road||region==='works'?'stone':'earth'];g.fillRect(x,y,1,1);
    g.fillStyle=road?'#14202a16':{outskirts:'#252b3230',forest:'#1d393c24',marsh:'#25425055',works:'#312b3538'}[region];g.fillRect(x,y,1,1);
   }
   this.groundCache=canvas;
  }
  const c=this.c,{tw,th,ox,oy}=projection;c.save();c.transform(tw,th,-tw,th,ox,oy);
  c.drawImage(this.groundCache,-.5,-.5,size,size);c.restore();return true;
 }
 terrain(key,projection,x,y,tint){
  if(!this.ready(key)||typeof DOMMatrix==='undefined')return false;
  const c=this.c,{tw,th,ox,oy}=projection;
  if(!this.patterns[key]){
   const pattern=c.createPattern(this.images[key],'repeat');
   pattern.setTransform(new DOMMatrix().scale(8/this.images[key].naturalWidth));this.patterns[key]=pattern;
  }
  c.save();c.transform(tw,th,-tw,th,ox,oy);c.fillStyle=this.patterns[key];
  c.fillRect(x-.505,y-.505,1.01,1.01);
  if(tint){c.fillStyle=tint;c.fillRect(x-.505,y-.505,1.01,1.01);}c.restore();return true;
 }
}
