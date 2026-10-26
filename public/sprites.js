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
  if(!this.groundCache||this.groundSize!==size){
   // Project static terrain once. Frames copy only the visible rectangle;
   // they never rotate/resample the entire 64x64 terrain texture again.
   const canvas=document.createElement('canvas');canvas.width=size*68;canvas.height=size*34;
   const g=canvas.getContext('2d');g.setTransform(34,17,-34,17,size*34,17);
   const patterns={};
   for(const key of ['stone','earth']){
    const texture=document.createElement('canvas');texture.width=texture.height=384;
    texture.getContext('2d').drawImage(this.images[key],0,0,384,384);
    patterns[key]=g.createPattern(texture,'repeat');patterns[key].setTransform(new DOMMatrix().scale(8/384));
   }
   for(const r of state.map.regions){
    g.fillStyle=patterns[r.id==='works'?'stone':'earth'];g.fillRect(r.x-.5,r.y-.5,r.width,r.height);
    g.fillStyle={outskirts:'#252b3230',forest:'#1d393c24',marsh:'#25425055',works:'#312b3538'}[r.id];g.fillRect(r.x-.5,r.y-.5,r.width,r.height);
   }
   for(const n of [10,32,50]){
    g.fillStyle=patterns.stone;g.fillRect(n-.5,-.5,1,size);g.fillRect(-.5,n-.5,size,1);
    g.fillStyle='#14202a16';g.fillRect(n-.5,-.5,1,size);g.fillRect(-.5,n-.5,size,1);
   }
   this.groundCache=canvas;this.groundSize=size;
  }
  const c=this.c,{scale,ox,oy,width,height}=projection,img=this.groundCache;
  const left=ox-size*34*scale,top=oy-17*scale;
  const sx=Math.max(0,-left/scale),sy=Math.max(0,-top/scale);
  const sw=Math.min(img.width-sx,(width-left)/scale-sx),sh=Math.min(img.height-sy,(height-top)/scale-sy);
  if(sw>0&&sh>0)c.drawImage(img,sx,sy,sw,sh,left+sx*scale,top+sy*scale,sw*scale,sh*scale);
  return true;
 }

 campGround(x,y,projection){
  if(!this.ready('stone')||typeof DOMMatrix==='undefined')return false;
  const c=this.c,{scale,tw,th,ox,oy,width,height}=projection;
  const sx=ox+(x-y)*tw,sy=oy+(x+y)*th;
  if(sx+170*scale<0||sx-170*scale>width||sy+85*scale<0||sy-85*scale>height)return true;
  if(!this.campCache){
   const canvas=document.createElement('canvas');canvas.width=340;canvas.height=170;
   const g=canvas.getContext('2d');g.setTransform(34,17,-34,17,170,85);
   const pattern=g.createPattern(this.images.stone,'repeat');pattern.setTransform(new DOMMatrix().scale(8/this.images.stone.naturalWidth));
   g.fillStyle=pattern;g.fillRect(-2.5,-2.5,5,5);g.fillStyle='#34303b16';g.fillRect(-2.5,-2.5,5,5);this.campCache=canvas;
  }
  c.drawImage(this.campCache,sx-170*scale,sy-85*scale,340*scale,170*scale);return true;
 }
}
