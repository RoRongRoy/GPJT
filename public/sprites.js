/* Original raster field artwork. Source PNGs stay untouched; atlas rectangles are
   sampled at render time. Rules and collision remain on the server. */
class FieldArt extends GothicArt {
 constructor(context) {
  super(context);this.images={};this.failed=[];this.loaded=0;this.actors=new Map();this.rasters=new Map();
  if(typeof Image==='undefined')return; // Headless controller checks use the vector fallback.
  for(const key of Object.keys(FIELD_SPRITES)){
   const img=new Image();this.images[key]=img;
   img.onload=()=>{this.loaded++;};img.onerror=()=>{this.failed.push(key);};
   img.src='/art/gameplay/'+key+'.png';
  }
 }
 screenLayer(name,width,height,paint){
  if(typeof document==='undefined')return false;
  const id=name+':'+width+':'+height;
  if(!this.screenLayers||this.screenSize!==width+':'+height){this.screenLayers=new Map();this.screenSize=width+':'+height;}
  if(!this.screenLayers.has(id)){
   const canvas=document.createElement('canvas');canvas.width=Math.ceil(width/2);canvas.height=Math.ceil(height/2);
   const g=canvas.getContext('2d');g.scale(.5,.5);paint(g);this.screenLayers.set(id,canvas);
  }
  this.c.drawImage(this.screenLayers.get(id),0,0,width,height);return true;
 }
 sky(width,height,now){
  if(!this.screenLayer('sky',width,height,g=>new GothicArt(g).sky(width,height,0)))super.sky(width,height,now);
 }
 atmosphere(width,height,now){
  if(!this.screenLayer('atmosphere',width,height,g=>{
   new GothicArt(g).atmosphere(width,height,0);
   const shade=g.createRadialGradient(width*.5,height*.45,height*.18,width*.5,height*.5,Math.max(width,height)*.68);
   shade.addColorStop(0,'#080e1900');shade.addColorStop(1,'#080e1970');g.fillStyle=shade;g.fillRect(0,0,width,height);
  }))super.atmosphere(width,height,now);
 }
 ready(key){const img=this.images[key];return img?.complete&&img.naturalWidth>0;}
 sprite(key,x,y,height,frame=0,flip=false,bottom=0){
  if(!this.ready(key))return false;
  const c=this.c,img=this.images[key],rect=FIELD_SPRITES[key].frames[frame], [sx,sy,sw,sh]=rect;
  const width=height*sw/sh;
  let source=img,sourceRect=[sx,sy,sw,sh];
  if(typeof document!=='undefined'){
   const id=key+':'+frame;let raster=this.rasters.get(id);
   if(!raster){
    // Fixed, bounded runtime mip level. Original artwork files remain intact.
    const h=Math.min(sh,['pine','dead-tree','refuge','ruin'].includes(key)?640:320);
    raster=document.createElement('canvas');raster.height=h;raster.width=Math.ceil(h*sw/sh);
    const g=raster.getContext('2d');g.imageSmoothingQuality='high';g.drawImage(img,sx,sy,sw,sh,0,0,raster.width,raster.height);
    this.rasters.set(id,raster);
   }
   source=raster;sourceRect=[0,0,raster.width,raster.height];
  }
  c.save();c.translate(x,y+bottom);if(flip)c.scale(-1,1);
  c.imageSmoothingEnabled=true;c.imageSmoothingQuality='low';
  c.drawImage(source,...sourceRect,-width/2,-height,width,height);c.restore();return true;
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
 pose(id,x,y,now,paused=false,sprint=false){
  let a=this.actors.get(id);if(!a){a={x,y,row:0,until:0};this.actors.set(id,a);}
  const dx=x-a.x,dy=y-a.y;
  if(Math.hypot(dx,dy)>.0003){
   const right=dx-dy>=0,front=dx+dy>=0;
   a.row=front?(right?0:1):(right?3:2);a.until=now+440;
  }
  a.x=x;a.y=y;return {row:a.row,frame:!paused&&now<a.until?Math.floor(now/(sprint?92:145))%4:0};
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
  const {size}=state.map,{scale,tw,th,ox,oy,width,height}=projection,c=this.c,span=16;
  if(this.terrainVersion!==state.map.layout_version){this.terrainChunks=new Map();this.terrainVersion=state.map.layout_version;}
  const inverse=(x,y)=>[((x-ox)/tw+(y-oy)/th)/2,((y-oy)/th-(x-ox)/tw)/2];
  const corners=[inverse(0,0),inverse(width,0),inverse(0,height),inverse(width,height)];
  const loX=Math.max(0,Math.floor(Math.min(...corners.map(p=>p[0]))/span)),hiX=Math.min(size/span-1,Math.floor(Math.max(...corners.map(p=>p[0]))/span));
  const loY=Math.max(0,Math.floor(Math.min(...corners.map(p=>p[1]))/span)),hiY=Math.min(size/span-1,Math.floor(Math.max(...corners.map(p=>p[1]))/span));
  const visible=new Set();
  for(let cy=loY;cy<=hiY;cy++)for(let cx=loX;cx<=hiX;cx++){
   const left=ox+(cx-cy)*span*tw-span*tw-2*scale,top=oy+(cx+cy)*span*th-th-2*scale;
   const w=(span*68+4)*scale,h=(span*34+4)*scale;
   if(left>width||left+w<0||top>height||top+h<0)continue;
   const key=cx+':'+cy;visible.add(key);let img=this.terrainChunks.get(key);
   if(!img){
    img=document.createElement('canvas');img.width=span*68+4;img.height=span*34+4;
    const g=img.getContext('2d');g.setTransform(34,17,-34,17,span*34+2-(cx-cy)*span*34,19-(cx+cy)*span*17);
    this.paintTerrain(g,state.map,cx*span-.505,cy*span-.505,span+.01,span+.01);
   }
   this.terrainChunks.delete(key);this.terrainChunks.set(key,img);c.drawImage(img,left,top,w,h);
  }
  // Keep only a small LRU neighbourhood, never allocate a full 128x128 bitmap.
  const budget=Math.max(width<600?12:24,visible.size);
  for(const key of this.terrainChunks.keys()){if(this.terrainChunks.size<=budget)break;if(!visible.has(key))this.terrainChunks.delete(key);}
  return true;
 }
 paintTerrain(g,map,x,y,w,h){
  g.save();g.beginPath();g.rect(x,y,w,h);g.clip();
  const patterns={};
  for(const key of ['earth','stone']){
   if(!this[key+'Texture']){const tex=document.createElement('canvas');tex.width=tex.height=384;tex.getContext('2d').drawImage(this.images[key],0,0,384,384);this[key+'Texture']=tex;}
   patterns[key]=g.createPattern(this[key+'Texture'],'repeat');patterns[key].setTransform(new DOMMatrix().scale(8/384));
  }
  g.fillStyle=patterns.earth;g.fillRect(x,y,w,h);g.fillStyle='#252b3228';g.fillRect(x,y,w,h);
  for(const r of map.regions){
   const tint={outskirts:'#64606228',forest:'#1d474748',marsh:'#355c7260',works:'#67545e48'}[r.id];
   const gradient=g.createRadialGradient(r.x,r.y,3,r.x,r.y,r.radius);gradient.addColorStop(0,tint);gradient.addColorStop(1,tint.slice(0,7)+'00');g.fillStyle=gradient;g.fillRect(x,y,w,h);
  }
  g.lineJoin='round';g.lineCap='round';
  for(const road of map.roads){
   g.beginPath();g.moveTo(...road[0]);
   for(let i=1;i<road.length-1;i++)g.quadraticCurveTo(...road[i],(road[i][0]+road[i+1][0])/2,(road[i][1]+road[i+1][1])/2);
   g.lineTo(...road[road.length-1]);g.globalAlpha=.25;g.strokeStyle='#a0927a';g.lineWidth=1.8;g.stroke();g.globalAlpha=.8;g.strokeStyle=patterns.stone;g.lineWidth=1.1;g.stroke();
  }
  g.restore();
 }
 campGround(x,y,projection,radius=7){
  if(!this.ready('stone')||typeof DOMMatrix==='undefined')return false;
  const c=this.c,{scale,tw,th,ox,oy,width,height}=projection,sx=ox+(x-y)*tw,sy=oy+(x+y)*th;
  const rx=radius*48.1,ry=radius*24.05;
  if(sx+rx*scale<0||sx-rx*scale>width||sy+ry*scale<0||sy-ry*scale>height)return true;
  if(!this.campCache||this.campRadius!==radius){
   const canvas=document.createElement('canvas');canvas.width=Math.ceil(rx*2+8);canvas.height=Math.ceil(ry*2+8);
   const g=canvas.getContext('2d');g.setTransform(34,17,-34,17,canvas.width/2,canvas.height/2);
   const pattern=g.createPattern(this.images.stone,'repeat');pattern.setTransform(new DOMMatrix().scale(8/this.images.stone.naturalWidth));
   g.save();g.beginPath();g.arc(0,0,radius,0,Math.PI*2);g.clip();g.globalAlpha=.32;g.fillStyle=pattern;g.fillRect(-radius,-radius,radius*2,radius*2);g.restore();
   g.strokeStyle='#c9b08055';g.lineWidth=.035;g.setLineDash([.22,.2]);g.beginPath();g.arc(0,0,radius,0,Math.PI*2);g.stroke();
   this.campCache=canvas;this.campRadius=radius;
  }
  c.drawImage(this.campCache,sx-this.campCache.width/2*scale,sy-this.campCache.height/2*scale,this.campCache.width*scale,this.campCache.height*scale);return true;
 }
}
