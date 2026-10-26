/* Camera and original gothic field renderer. Raster sprites live in sprites.js; gothic.js supplies the loading fallback. */
class WorldView {
 constructor(canvas, minimap) {
  this.canvas=canvas; this.ctx=canvas.getContext('2d'); this.minimap=minimap;this.art=new FieldArt(this.ctx);
  this.zoom=1; this.camera=null; this.player=null; this.points=[]; this.projection=null; this.lastFrame=0;this.prediction=null;
 }
 predictMove(state,{dx,dy}){
  const p=state.world.player,m=state.map.movement;
  const mounted=p.mounted&&!(p.species==='vampire'&&p.blood<=5);
  const step=m.step*(mounted?m.mount_base+p.unlocks[p.species]*m.mount_tier:1),norm=Math.hypot(dx,dy);
  if(!norm)return;
  this.prediction={x:Math.max(1,Math.min(state.map.size-2,p.x+dx/norm*step)),y:Math.max(1,Math.min(state.map.size-2,p.y+dy/norm*step))};
 }
 endMove(accepted){this.prediction=null;if(!accepted)this.player=null;}
 prepareScenery(state){
  if(this.mapSource===state.map&&this.poiSource===state.pois)return;
  this.mapSource=state.map;this.poiSource=state.pois;
  const key=JSON.stringify([state.map,state.pois]);if(key===this.mapKey)return;this.mapKey=key;
  this.scenery=[];this.ponds=[];
  for(let y=0;y<state.map.size;y++)for(let x=0;x<state.map.size;x++){
   if(state.pois.some(n=>Math.hypot(x-n.x,y-n.y)<1.7))continue;
   const region=this.region(state,x,y).id,n=this.noise(x,y),road=[10,32,50].includes(x)||[10,32,50].includes(y);
   if(road){if([10,32,50].includes(x)&&y%7===0)this.scenery.push({x:x+.65,y,type:'lantern'});continue;}
   if(region==='marsh'&&n>.73)this.ponds.push({x,y});
   if(x%2||y%2||n<=(region==='forest'?.42:.72))continue;
   const type=region==='works'||(region==='outskirts'&&n>.88)?'ruin':'tree';
   if(type==='ruin'&&(x%4||y%4))continue;
   this.scenery.push({x,y,type,seed:region==='marsh'?this.noise(y+12,x)*.4:region==='forest'?.5+this.noise(y,x)*.5:this.noise(y+7,x)});
  }
 }
 setZoom(value) { this.zoom=Math.max(.65,Math.min(1.6,value)); return this.zoom; }
 toWorld(x,y) {
  const {ox,oy,tw,th}=this.projection;
  return {x:((x-ox)/tw+(y-oy)/th)/2,y:((y-oy)/th-(x-ox)/tw)/2};
 }
 project(x,y,z=0) { const {ox,oy,tw,th,scale}=this.projection; return [ox+(x-y)*tw,oy+(x+y)*th-z*scale]; }
 region(state,x,y) { return state.map.regions.find(r=>x>=r.x&&y>=r.y&&x<r.x+r.width&&y<r.y+r.height)||state.map.regions[0]; }
 noise(x,y) { const n=Math.sin(x*127.1+y*311.7)*43758.5453; return n-Math.floor(n); }
 draw(state,target,selected,effects={}) {
  if(!state?.map)return;
  const c=this.ctx,rect=this.canvas.getBoundingClientRect(),width=rect.width,height=rect.height;
  if(!width||!height)return;
  const ratio=Math.min(2,window.devicePixelRatio||1),now=performance.now(),dt=Math.min(.05,(now-this.lastFrame)/1000||.016);
  this.lastFrame=now;
  if(this.canvas.width!==Math.round(width*ratio)||this.canvas.height!==Math.round(height*ratio)){
   this.canvas.width=Math.round(width*ratio);this.canvas.height=Math.round(height*ratio);
  }
  c.setTransform(ratio,0,0,ratio,0,0);
  const w=state.world,p=w.player,size=state.map.size,visual=this.prediction||p;
  if(!this.player||Math.hypot(this.player.x-visual.x,this.player.y-visual.y)>5)this.player={x:visual.x,y:visual.y};
  const moving=Math.hypot(this.player.x-visual.x,this.player.y-visual.y)>.025;
  const follow=1-Math.exp(-30*dt);
  this.player.x+=(visual.x-this.player.x)*follow;this.player.y+=(visual.y-this.player.y)*follow;
  if(!this.camera)this.camera={...this.player};
  this.camera.x+=(this.player.x-this.camera.x)*(1-Math.exp(-16*dt));
  this.camera.y+=(this.player.y-this.camera.y)*(1-Math.exp(-16*dt));
  const scale=this.zoom*(width<600?.85:1),tw=34*scale,th=17*scale;
  this.projection={scale,tw,th,width,height,ox:width/2-(this.camera.x-this.camera.y)*tw,oy:height*.52-(this.camera.x+this.camera.y)*th};
  const art=this.art;art.sky(width,height,now);
  this.canvas.dataset.art=art.failed.length?'fallback':art.loaded===Object.keys(FIELD_SPRITES).length?'ready':'loading';
  const project=(x,y,z=0)=>this.project(x,y,z);
  const poly=(points,color)=>{c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fillStyle=color;c.fill();};
  const tile=(x,y,color)=>{const [sx,sy]=project(x,y);poly([[sx,sy-th],[sx+tw+.6,sy],[sx,sy+th+.5],[sx-tw-.6,sy]],color);};
  const ellipse=(x,y,rx,ry,color)=>{c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx*scale,ry*scale,0,0,Math.PI*2);c.fill();};
  const box=(x,y,z,color,wide=.7)=>{
   const [sx,sy]=project(x,y),a=tw*wide,b=th*wide,h=z*scale;
   poly([[sx-a,sy-h],[sx,sy-h+b],[sx,sy+b],[sx-a,sy]],'#35423e');
   poly([[sx+a,sy-h],[sx,sy-h+b],[sx,sy+b],[sx+a,sy]],'#273637');
   poly([[sx-a,sy-h],[sx,sy-h-b],[sx+a,sy-h],[sx,sy-h+b]],color);
  };
  const label=(text,x,y,color='#d9e4cd')=>{
   c.font='500 11px system-ui';c.textAlign='center';const m=c.measureText(text);
   c.fillStyle='#101e22e8';c.fillRect(x-m.width/2-9,y-13,m.width+18,22);
   c.fillStyle=color;c.fillText(text,x,y+2);
  };
  const corners=[this.toWorld(-200,-280),this.toWorld(width+200,-280),this.toWorld(-200,height+280),this.toWorld(width+200,height+280)];
  const minX=Math.max(0,Math.floor(Math.min(...corners.map(n=>n.x)))),maxX=Math.min(size-1,Math.ceil(Math.max(...corners.map(n=>n.x))));
  const minY=Math.max(0,Math.floor(Math.min(...corners.map(n=>n.y)))),maxY=Math.min(size-1,Math.ceil(Math.max(...corners.map(n=>n.y))));
  const visible=(x,y)=>x>=minX&&x<=maxX&&y>=minY&&y<=maxY;
  this.prepareScenery(state);
  const outsideCamp=e=>Math.hypot(e.x-w.base.x,e.y-w.base.y)>=3;
  const scenery=this.scenery.filter(e=>visible(e.x,e.y)&&outsideCamp(e));
  if(!art.ground(state,this.projection)){
   const palettes={outskirts:'#404449',forest:'#2f3b39',marsh:'#33434a',works:'#4d494b'};
   for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++)tile(x,y,[10,32,50].includes(x)||[10,32,50].includes(y)?'#515257':palettes[this.region(state,x,y).id]);
  }
  for(const pond of this.ponds){if(!visible(pond.x,pond.y)||!outsideCamp(pond))continue;const [sx,sy]=project(pond.x,pond.y);ellipse(sx,sy,22,9,'#253842');ellipse(sx+3*scale,sy,14,4,'#93a8b02c');}
  if(!art.campGround(w.base.x,w.base.y,this.projection))for(let x=-2;x<=2;x++)for(let y=-2;y<=2;y++)tile(w.base.x+x,w.base.y+y,'#5c5757');
  if(target){
   const [tx,ty]=project(target.x,target.y),[px,py]=project(this.player.x,this.player.y);
   c.setLineDash([3,9]);c.strokeStyle='#ead3a488';c.lineWidth=1.5;c.beginPath();c.moveTo(px,py);c.lineTo(tx,ty);c.stroke();c.setLineDash([]);
   c.strokeStyle='#f2d39b';c.beginPath();c.ellipse(tx,ty,15*scale,7*scale,0,0,Math.PI*2);c.stroke();
  }
  const offsets={kitchen:[-.5,2],alchemy:[2,-.5],medical:[1,2],storage:[2,1]};
  const facilities=Object.entries(w.base.facilities).filter(([,level])=>level).map(([id,level])=>({x:w.base.x+offsets[id][0],y:w.base.y+offsets[id][1],id,level,type:'facility'}));
  const entities=[...scenery,...state.pois.map(n=>({...n,type:'poi'})),{...w.base,type:'base'},...facilities,...w.enemies.filter(e=>e.hp>0).map(e=>({...e,type:'enemy'})),{...p,...this.player,type:'player'}].filter(e=>visible(e.x,e.y)).sort((a,b)=>a.x+a.y-b.x-b.y);
  this.points=[];const labels=[];let playerCovered=false;
  const tree=(x,y,seed=0)=>{const [sx,sy]=project(x,y);art.tree(sx,sy,scale,seed);};
  for(const e of entities){
   const [sx,sy]=project(e.x,e.y),near=Math.hypot(p.x-e.x,p.y-e.y);
   if(sx < -150*scale || sx > width+150*scale || sy < -40*scale || sy > height+290*scale)continue;
   const [px,py]=project(this.player.x,this.player.y);
   const tall=e.type==='base'||e.type==='ruin',treeLike=e.type==='tree'||e.kind==='wood';
   const occludes=(tall||treeLike||e.type==='facility'||['water','metal','blood'].includes(e.kind))&&Math.abs(px-sx)<(tall?95:treeLike?60:35)*scale&&py<sy+(tall?36:5)*scale&&py>sy-(tall?260:treeLike?205:95)*scale;
   if(occludes&&e.x+e.y>=this.player.x+this.player.y)playerCovered=true;
   c.globalAlpha=occludes?.3:1;
   if(e.type==='tree'){tree(e.x,e.y,e.seed);c.globalAlpha=1;continue;}
   if(e.type==='lantern'){art.lantern(sx,sy,scale);continue;}
   if(e.type==='reed'){
    c.strokeStyle='#8d9386';c.lineWidth=2*scale;
    for(let j=0;j<5;j++){c.beginPath();c.moveTo(sx+(j-2)*5*scale,sy);c.lineTo(sx+(j-3)*6*scale,sy-(18+j%3*5)*scale);c.stroke();}continue;
   }
   if(e.type==='ruin'&&(e.x%4!==0||e.y%4!==0))continue;
   if(e.type==='ruin'){art.ruin(sx,sy,scale,e.seed);continue;}
   ellipse(sx+4*scale,sy+3*scale,18,8,'#152c2955');
   if(e.type==='base'){
    art.refuge(sx,sy,scale);
    labels.push(['아지트 · 피난처',sx,sy-250*scale,'#e2cfaa']);
    this.points.push({x:sx,y:sy-30*scale,id:'base',left:sx-115*scale,right:sx+115*scale,top:sy-245*scale,bottom:sy+35*scale});
   }
   if(e.type==='facility')art.facility(sx,sy,scale,e.id);
   if(e.type==='poi'){
    if(e.kind==='wood')tree(e.x,e.y,.8);
    if(['water','metal','blood'].includes(e.kind)&&!art.prop(e.kind,sx,sy,scale))box(e.x,e.y,30,'#77716a');
    if(['crop','herb'].includes(e.kind)){
     tile(e.x,e.y,'#494143');
     for(let j=0;j<9;j++){
      const [gx,gy]=project(e.x+(j%3-1)*.37,e.y+(Math.floor(j/3)-1)*.37);
      c.strokeStyle='#989f7d';c.lineWidth=2*scale;c.beginPath();c.moveTo(gx,gy);c.lineTo(gx,gy-16*scale);c.stroke();
      ellipse(gx-3*scale,gy-9*scale,4,2,'#657c64');ellipse(gx+3*scale,gy-13*scale,4,2,e.kind==='herb'?'#b89fae':'#b5a583');
     }
    }
    if(e.kind==='npc'){
     art.prop('storage',sx+26*scale,sy+8*scale,scale*.7);
     art.character(sx,sy,scale,['vampire','ferryman'].includes(e.id)?'vampire':'human',false,now,{npc:true});
    }
    const focus=e.id===selected||near<2.5;
    if(focus){c.strokeStyle='#e9d29a';c.lineWidth=1.5;c.beginPath();c.ellipse(sx,sy,28*scale,14*scale,0,0,Math.PI*2);c.stroke();}
    if(focus||near<7)labels.push([e.label,sx,sy-(e.kind==='wood'?214:e.kind==='blood'?140:e.kind==='water'||e.kind==='metal'?116:96)*scale,focus?'#ffe5aa':'#e0e4d2']);
    const halfWidth=Math.max((e.kind==='wood'?66:e.kind==='metal'?72:45)*scale,e.label.length*5.5);
    this.points.push({x:sx,y:sy-22*scale,id:e.id,left:sx-halfWidth,right:sx+halfWidth,top:sy-(e.kind==='wood'?210:e.kind==='blood'?137:110)*scale,bottom:sy+12*scale});
   }
   if(e.type==='enemy'){
    const pose=art.pose('enemy:'+e.id,e.x,e.y,now,w.paused);
    art.character(sx,sy,scale,'human',pose.frame!==0,now,{enemy:true,variant:Number(String(e.id).replace(/\D/g,''))%3===0,pose});
    c.fillStyle='#151c29';c.fillRect(sx-16*scale,sy-98*scale,32*scale,4*scale);c.fillStyle='#ad5866';c.fillRect(sx-16*scale,sy-98*scale,32*scale*Math.max(0,e.hp)/60,4*scale);
    this.points.push({x:sx,y:sy-23*scale,id:'enemy:'+e.id,left:sx-29*scale,right:sx+29*scale,top:sy-95*scale,bottom:sy+10*scale});
   }
   if(e.type==='player'){
    c.strokeStyle=p.species==='vampire'?'#ca8d9d':'#c4bd9d';c.lineWidth=1.2;c.beginPath();c.ellipse(sx,sy+2*scale,14*scale,7*scale,0,0,Math.PI*2);c.stroke();
    art.character(sx,sy,scale,p.species,moving&&!w.paused,now,{mounted:p.mounted,tier:p.unlocks[p.species],pose:art.pose('player',e.x,e.y,now,w.paused)});
    if(now<(effects.attackUntil||0)){c.strokeStyle='#ffe3a3';c.lineWidth=4*scale;c.beginPath();c.arc(sx,sy-18*scale,38*scale,-1.2,1.1);c.stroke();}
   }
  }
  c.globalAlpha=1;
  if(playerCovered){
   const [px,py]=project(this.player.x,this.player.y);
   c.save();c.shadowColor='#c6c0a5';c.shadowBlur=4*scale;
   art.character(px,py,scale,p.species,moving&&!w.paused,now,{mounted:p.mounted,tier:p.unlocks[p.species],pose:art.pose('player',this.player.x,this.player.y,now,w.paused)});c.restore();
  }
  for(const args of labels)label(...args);
  art.atmosphere(width,height,now);
  if(now<(effects.hurtUntil||0)){c.fillStyle='#9e294b2b';c.fillRect(0,0,width,height);}
  if(!this.lastMinimap||now-this.lastMinimap>=100){this.drawMinimap(state,target);this.lastMinimap=now;}
 }
 drawMinimap(state,target) {
  const canvas=this.minimap,c=canvas.getContext('2d'),d=160,size=state.map.size,k=d/size;
  if(canvas.width!==320){canvas.width=320;canvas.height=320;}
  c.setTransform(2,0,0,2,0,0);c.clearRect(0,0,d,d);
  for(const region of state.map.regions){c.fillStyle=region.color;c.fillRect(region.x*k,region.y*k,region.width*k,region.height*k);}
  c.strokeStyle='#d3bd8d66';c.lineWidth=2;c.beginPath();
  for(const n of [10,32,50]){c.moveTo(n*k,0);c.lineTo(n*k,d);c.moveTo(0,n*k);c.lineTo(d,n*k);}c.stroke();
  for(const node of state.pois){c.fillStyle=node.kind==='npc'?'#e6be89':'#d9e3bc';c.fillRect(node.x*k-1,node.y*k-1,2,2);}
  const w=state.world;
  for(const enemy of w.enemies){if(enemy.hp>0){c.fillStyle='#eb8d78';c.fillRect(enemy.x*k-1,enemy.y*k-1,2,2);}}
  c.fillStyle='#ffda8d';c.fillRect(w.base.x*k-3,w.base.y*k-3,6,6);
  if(this.projection){
   const r=this.canvas.getBoundingClientRect(),corners=[[0,0],[r.width,0],[r.width,r.height],[0,r.height]].map(([x,y])=>this.toWorld(x,y));
   c.strokeStyle='#e9efcf66';c.lineWidth=1;c.beginPath();corners.forEach((v,i)=>i?c.lineTo(v.x*k,v.y*k):c.moveTo(v.x*k,v.y*k));c.closePath();c.stroke();
  }
  if(target){c.strokeStyle='#ffdfab';c.beginPath();c.arc(target.x*k,target.y*k,4,0,Math.PI*2);c.stroke();}
  c.fillStyle='#fff9db';c.beginPath();c.arc(w.player.x*k,w.player.y*k,3,0,Math.PI*2);c.fill();
 }
}
