/* Camera and original gothic field renderer. Raster sprites live in sprites.js; gothic.js supplies the loading fallback. */
class WorldView {
 constructor(canvas, minimap) {
  this.canvas=canvas; this.ctx=canvas.getContext('2d'); this.minimap=minimap;this.art=new FieldArt(this.ctx);
  this.entityPositions=new Map();this.zoom=1; this.camera=null; this.player=null; this.points=[]; this.projection=null; this.lastFrame=0;this.prediction=null;
 }
 playCombat(before,after,kind){this.combat=new CombatEffects(before,after,kind,performance.now(),this.art.actors.get('player')?.row||0);}
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
  const landmarks=state.pois.map(n=>({...n,x:n.home_x??n.x,y:n.home_y??n.y}));
  const key=JSON.stringify([state.map,landmarks]);if(key===this.mapKey)return;this.mapKey=key;
  this.scenery=[];this.ponds=[];
  // Irregular sparse clusters, with real gaps for travel and landmarks.
  for(let gy=3;gy<state.map.size;gy+=3)for(let gx=3;gx<state.map.size;gx+=3){
   const x=gx+(this.noise(gx,gy)-.5)*1.8,y=gy+(this.noise(gy,gx)-.5)*1.8;
   if(landmarks.some(n=>Math.hypot(x-n.x,y-n.y)<3.8)||this.nearRoad(state.map,x,y))continue;
   const region=this.region(state,x,y).id,n=this.noise(gx+47,gy+13);
   const cluster=(Math.sin(x/8)+Math.cos(y/11)+Math.sin((x+y)/17))/3;
   if(region==='marsh'&&n>.82)this.ponds.push({x,y});
   if(n<(region==='forest'?(cluster>.15?.48:.87):.88))continue;
   const type=region==='works'||(region==='outskirts'&&n>.97)?'ruin':'tree';
   if(type==='ruin'&&this.scenery.some(e=>e.type==='ruin'&&Math.hypot(e.x-x,e.y-y)<10))continue;
   this.scenery.push({x,y,type,seed:region==='marsh'?n*.4:region==='forest'?.5+n*.5:this.noise(y+7,x)});
  }
 }
 setZoom(value) { this.zoom=Math.max(.65,Math.min(1.6,value)); return this.zoom; }
 toWorld(x,y) {
  const {ox,oy,tw,th}=this.projection;
  return {x:((x-ox)/tw+(y-oy)/th)/2,y:((y-oy)/th-(x-ox)/tw)/2};
 }
 project(x,y,z=0) { const {ox,oy,tw,th,scale}=this.projection; return [ox+(x-y)*tw,oy+(x+y)*th-z*scale]; }
 region(state,x,y) {
  const wx=x+Math.sin(y/13)*5,wy=y+Math.sin(x/17)*4;
  return state.map.regions.reduce((a,b)=>((wx-a.x)**2+(wy-a.y)**2)/a.radius**2<=((wx-b.x)**2+(wy-b.y)**2)/b.radius**2?a:b);
 }
 nearRoad(map,x,y){
  return map.roads.some(road=>road.slice(1).some((b,i)=>{const a=road[i],dx=b[0]-a[0],dy=b[1]-a[1],t=Math.max(0,Math.min(1,((x-a[0])*dx+(y-a[1])*dy)/(dx*dx+dy*dy)));return Math.hypot(x-a[0]-t*dx,y-a[1]-t*dy)<2;}));
 }

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
  if(this.combat&&!this.combat.active(now))this.combat=null;
  const art=this.art;art.sky(width,height,now);
  this.canvas.dataset.art=art.failed.length?'fallback':art.loaded===Object.keys(FIELD_SPRITES).length?'ready':'loading';
  const project=(x,y,z=0)=>this.project(x,y,z);
  const paintPlayer=(sx,sy)=>{
   const normal=art.pose('player',this.player.x,this.player.y,now,w.paused),pose=this.combat?this.combat.pose(normal,now):normal;
   const body=this.combat?.body(now)||{x:0,y:0,tilt:0};
   c.save();c.translate(sx+body.x*scale,sy+body.y*scale);c.rotate(body.tilt);
   art.character(0,0,scale,p.species,moving&&!w.paused,now,{mounted:p.mounted,tier:p.unlocks[p.species],pose});c.restore();
  };
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
  const outsideCamp=e=>Math.hypot(e.x-w.base.x,e.y-w.base.y)>=state.map.base_clear_radius;
  const scenery=this.scenery.filter(e=>visible(e.x,e.y)&&outsideCamp(e));
  if(!art.ground(state,this.projection)){
   const palettes={outskirts:'#404449',forest:'#2f3b39',marsh:'#33434a',works:'#4d494b'};
   for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++)tile(x,y,palettes[this.region(state,x,y).id]);
  }
  for(const pond of this.ponds){if(!visible(pond.x,pond.y)||!outsideCamp(pond))continue;const [sx,sy]=project(pond.x,pond.y);ellipse(sx,sy,22,9,'#253842');ellipse(sx+3*scale,sy,14,4,'#93a8b02c');}
  if(!art.campGround(w.base.x,w.base.y,this.projection,state.map.base_radius))for(let x=-2;x<=2;x++)for(let y=-2;y<=2;y++)tile(w.base.x+x,w.base.y+y,'#5c5757');
  if(target){
   const [tx,ty]=project(target.x,target.y),[px,py]=project(this.player.x,this.player.y);
   c.setLineDash([3,9]);c.strokeStyle='#ead3a488';c.lineWidth=1.5;c.beginPath();c.moveTo(px,py);c.lineTo(tx,ty);c.stroke();c.setLineDash([]);
   c.strokeStyle='#f2d39b';c.beginPath();c.ellipse(tx,ty,15*scale,7*scale,0,0,Math.PI*2);c.stroke();
  }
  const offsets={kitchen:[-4,2],alchemy:[3,-4],medical:[2,4],storage:[5,0]};
  const facilities=Object.entries(w.base.facilities).filter(([,level])=>level).map(([id,level])=>({x:w.base.x+offsets[id][0],y:w.base.y+offsets[id][1],id,level,type:'facility'}));
  const smooth=(e,key)=>{let v=this.entityPositions.get(key);if(!v||Math.hypot(v.x-e.x,v.y-e.y)>5||w.paused)v={x:e.x,y:e.y};
   const follow=1-Math.exp(-12*dt);v.x+=(e.x-v.x)*follow;v.y+=(e.y-v.y)*follow;this.entityPositions.set(key,v);return {...e,...v};};
  const entities=[...scenery,...state.pois.map(n=>({...n,...(n.kind==='npc'?smooth(n,'npc:'+n.id):{}),type:'poi'})),...(w.drops||[]).map(d=>({...d,type:'drop'})),{...w.base,type:'base'},...facilities,...w.enemies.filter(e=>e.hp>0).map(e=>({...smooth(e,'enemy:'+e.id),type:'enemy'})),...(state.others||[]).filter(o=>o.chosen).map(o=>({...smooth(o,'peer:'+o.id),type:'peer'})),{...p,...this.player,type:'player'}].filter(e=>visible(e.x,e.y)).sort((a,b)=>a.x+a.y-b.x-b.y);
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
   if(e.type==='ruin'){art.ruin(sx,sy,scale,e.seed);continue;}
   ellipse(sx+4*scale,sy+3*scale,18,8,'#152c2955');
   if(e.type==='base'){
    art.refuge(sx,sy,scale);
    labels.push(['아지트 · 피난처',sx,sy-250*scale,'#e2cfaa']);
    this.points.push({x:sx,y:sy-30*scale,id:'base',left:sx-115*scale,right:sx+115*scale,top:sy-245*scale,bottom:sy+35*scale});
   }
   if(e.type==='facility')art.facility(sx,sy,scale,e.id);
   if(e.type==='drop'){
    const gear=e.gear?.[0],rarityColor=gear?state.rarities?.[gear.rarity]?.color||'#efc878':'#e8c97a';
    c.save();
    if(gear){
     const beam=c.createLinearGradient(sx,sy-85*scale,sx,sy);
     beam.addColorStop(0,rarityColor+'00');beam.addColorStop(1,rarityColor+'88');
     c.fillStyle=beam;c.fillRect(sx-8*scale,sy-85*scale,16*scale,85*scale);
    }
    c.strokeStyle=rarityColor;c.lineWidth=1.6;c.beginPath();c.ellipse(sx,sy,15*scale,7*scale,0,0,Math.PI*2);c.stroke();
    box(e.x,e.y,14,rarityColor,.32);
    c.restore();
    const dropTitle=gear?`★ [${state.rarities?.[gear.rarity]?.name||'장비'}] ${gear.name}`:`📦 ${e.label||'전리품'}`;
    if(near<9||e.id===selected)labels.push([dropTitle,sx,sy-34*scale,rarityColor]);
    this.points.push({x:sx,y:sy-10*scale,id:e.id,left:sx-36*scale,right:sx+36*scale,top:sy-48*scale,bottom:sy+12*scale});
   }
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
     const [hx,hy]=project(e.home_x??e.x,e.home_y??e.y);art.prop('storage',hx+26*scale,hy+8*scale,scale*.7);
     const isVamp=['vampire','ferryman'].includes(e.id);
     c.strokeStyle=isVamp?'#c87b9244':'#b5c89c44';c.lineWidth=1;c.setLineDash([2,5]);c.beginPath();c.ellipse(hx,hy,36*scale,18*scale,0,0,Math.PI*2);c.stroke();c.setLineDash([]);
     const pose=art.pose('npc:'+e.id,e.x,e.y,now,w.paused);
     art.character(sx,sy,scale,isVamp?'vampire':'human',pose.frame!==0,now,{npc:true,pose});
    }
    const focus=e.id===selected||near<2.5;
    if(focus){c.strokeStyle='#e9d29a';c.lineWidth=1.5;c.beginPath();c.ellipse(sx,sy,28*scale,14*scale,0,0,Math.PI*2);c.stroke();}
    if(focus||near<7)labels.push([e.label,sx,sy-(e.kind==='wood'?214:e.kind==='blood'?140:e.kind==='water'||e.kind==='metal'?116:96)*scale,focus?'#ffe5aa':'#e0e4d2']);
    const halfWidth=Math.max((e.kind==='wood'?66:e.kind==='metal'?72:45)*scale,e.label.length*5.5);
    this.points.push({x:sx,y:sy-22*scale,id:e.id,left:sx-halfWidth,right:sx+halfWidth,top:sy-(e.kind==='wood'?210:e.kind==='blood'?137:110)*scale,bottom:sy+12*scale});
   }
   if(e.type==='enemy'){
    const pose=art.pose('enemy:'+e.id,e.x,e.y,now,w.paused),high=(e.level||1)>=8,boss=(e.level||1)>=12;
    if(high){c.strokeStyle=boss?'#ff525288':'#d68c7766';c.lineWidth=boss?2:1.3;c.beginPath();c.ellipse(sx,sy+2*scale,(boss?24:19)*scale,(boss?11:9)*scale,0,0,Math.PI*2);c.stroke();}
    art.character(sx,sy,scale*(boss?1.15:high?1.06:1),'human',pose.frame!==0,now,{enemy:true,variant:high,pose});
    c.fillStyle='#151c29';c.fillRect(sx-18*scale,sy-98*scale,36*scale,4*scale);c.fillStyle=boss?'#ff5c5c':high?'#d9734e':'#ad5866';c.fillRect(sx-18*scale,sy-98*scale,36*scale*Math.min(1,Math.max(0,e.hp)/(e.max_hp||60)),4*scale);
    const tierTag=boss?'[최상위] ':high?'[고렙] ':(e.level||1)>=4?'[중렙] ':'[저렙] ';
    labels.push([`${tierTag}${e.name||'감염체'} Lv.${e.level||1}`,sx,sy-111*scale,boss?'#ff7b7b':(e.level||1)>(p.combat_level||1)+2?'#ff9c88':'#e4c9c1']);
    this.points.push({x:sx,y:sy-23*scale,id:'enemy:'+e.id,left:sx-29*scale,right:sx+29*scale,top:sy-95*scale,bottom:sy+10*scale});
   }
   if(e.type==='peer'){
    const pose=art.pose('peer:'+e.id,e.x,e.y,now,w.paused);
    c.strokeStyle='#6bc5e8aa';c.lineWidth=1.4;c.beginPath();c.ellipse(sx,sy+2*scale,15*scale,7*scale,0,0,Math.PI*2);c.stroke();
    art.character(sx,sy,scale,e.species,pose.frame!==0,now,{mounted:e.mounted,tier:e.unlocks?.[e.species]||0,pose});
    c.fillStyle='#151c29';c.fillRect(sx-16*scale,sy-96*scale,32*scale,4*scale);
    c.fillStyle='#5bc0eb';c.fillRect(sx-16*scale,sy-96*scale,32*scale*Math.min(1,Math.max(0,e.hp||0)/100),4*scale);
    labels.push([`${e.name||'생존자'} · Lv.${e.combat_level||1}`,sx,sy-108*scale,'#9ee4ff']);
   }
   if(e.type==='player'){
    c.strokeStyle=p.species==='vampire'?'#ca8d9d':'#c4bd9d';c.lineWidth=1.2;c.beginPath();c.ellipse(sx,sy+2*scale,14*scale,7*scale,0,0,Math.PI*2);c.stroke();
    paintPlayer(sx,sy);
   }
  }
  c.globalAlpha=1;
  if(playerCovered){
   const [px,py]=project(this.player.x,this.player.y);
   c.save();c.shadowColor='#c6c0a5';c.shadowBlur=4*scale;
   paintPlayer(px,py);c.restore();
  }
  for(const args of labels)label(...args);
  this.combat?.draw(c,project,scale,now);
  art.atmosphere(width,height,now);
  if(now<(effects.hurtUntil||0)){c.fillStyle='#9e294b2b';c.fillRect(0,0,width,height);}
  if(!this.lastMinimap||now-this.lastMinimap>=100){this.drawMinimap(state,target);this.lastMinimap=now;}
 }
 drawMinimap(state,target) {
  const canvas=this.minimap,c=canvas.getContext('2d'),d=160,size=state.map.size,k=d/size;
  if(canvas.width!==320){canvas.width=320;canvas.height=320;}
  c.setTransform(2,0,0,2,0,0);c.clearRect(0,0,d,d);
  c.fillStyle='#414b49';c.fillRect(0,0,d,d);
  for(const r of state.map.regions){const g=c.createRadialGradient(r.x*k,r.y*k,0,r.x*k,r.y*k,r.radius*k);g.addColorStop(0,r.color);g.addColorStop(1,r.color+'00');c.fillStyle=g;c.fillRect(0,0,d,d);}
  c.strokeStyle='#c7baa466';c.lineWidth=1.3;
  for(const road of state.map.roads){c.beginPath();road.forEach(([x,y],i)=>i?c.lineTo(x*k,y*k):c.moveTo(x*k,y*k));c.stroke();}
  for(const node of state.pois){c.fillStyle=node.kind==='npc'?'#e6be89':'#d9e3bc';c.fillRect(node.x*k-1,node.y*k-1,2,2);}
  const w=state.world;
  for(const enemy of w.enemies){if(enemy.hp>0){c.fillStyle='#eb8d78';c.fillRect(enemy.x*k-1,enemy.y*k-1,2,2);}}
  for(const drop of (w.drops||[])){c.fillStyle='#ffd966';c.fillRect(drop.x*k-1.5,drop.y*k-1.5,3,3);}
  for(const peer of (state.others||[])){if(peer.chosen){c.fillStyle='#5bc0eb';c.beginPath();c.arc(peer.x*k,peer.y*k,2.5,0,Math.PI*2);c.fill();}}
  c.strokeStyle='#e9cf8f88';c.lineWidth=1;c.beginPath();c.arc(w.base.x*k,w.base.y*k,state.map.base_radius*k,0,Math.PI*2);c.stroke();
  c.fillStyle='#ffda8d';c.fillRect(w.base.x*k-3,w.base.y*k-3,6,6);
  if(this.projection){
   const r=this.canvas.getBoundingClientRect(),corners=[[0,0],[r.width,0],[r.width,r.height],[0,r.height]].map(([x,y])=>this.toWorld(x,y));
   c.strokeStyle='#e9efcf66';c.lineWidth=1;c.beginPath();corners.forEach((v,i)=>i?c.lineTo(v.x*k,v.y*k):c.moveTo(v.x*k,v.y*k));c.closePath();c.stroke();
  }
  if(target){c.strokeStyle='#ffdfab';c.beginPath();c.arc(target.x*k,target.y*k,4,0,Math.PI*2);c.stroke();}
  c.fillStyle='#fff9db';c.beginPath();c.arc(w.player.x*k,w.player.y*k,3,0,Math.PI*2);c.fill();
 }
}
