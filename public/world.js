/* Camera and original gothic field renderer. Raster sprites live in sprites.js; gothic.js supplies the loading fallback. */
class WorldView {
 constructor(canvas, minimap) {
  this.canvas=canvas; this.ctx=canvas.getContext('2d'); this.minimap=minimap;this.art=new FieldArt(this.ctx);this.themes=typeof FactionArt!=='undefined'?new FactionArt(this.ctx):null;
  this.entityPositions=new Map();this.zoom=1; this.camera=null; this.player=null; this.points=[]; this.projection=null; this.lastFrame=0;this.prediction=null;
 }
 playCombat(before,after,kind){this.combat=new CombatEffects(before,after,kind,performance.now(),this.art.actors.get('player')?.row||0);}
 predictMove(state,{dx,dy,sprint}){
  this.streamInput=null;this.streamPosition=null;
  const p=state.world.player,m=state.map.movement;
  const mounted=p.mounted&&!(p.species==='vampire'&&p.blood<=5);
  const mult=mounted?(m.mount_base+p.unlocks[p.species]*m.mount_tier)*(sprint?1.25:1):(sprint?(m.sprint_mult||1.65):1);
  const step=m.step*mult,norm=Math.hypot(dx,dy);
  if(!norm)return;
  this.prediction={x:Math.max(1,Math.min(state.map.size-2,p.x+dx/norm*step)),y:Math.max(1,Math.min(state.map.size-2,p.y+dy/norm*step))};
 }
 endMove(accepted,soft=false){this.prediction=null;if(!accepted&&!soft)this.player=null;}
 setInput(state,dx,dy,seq,sprint=false){
  if(!this.streamPosition)this.streamPosition={...(this.player||state.world.player)};
  const old=this.streamInput;
  this.streamInput={dx,dy,sprint,changeSeq:!old||old.dx!==dx||old.dy!==dy||old.sprint!==sprint?seq:old.changeSeq};
  this.prediction=null;
 }
 resetInput(){this.streamInput=null;this.streamPosition=null;this.player=null;this.prediction=null;}
 reconcileInput(state){
  if(!state.movement?.enabled)return;
  const p=state.world.player;
  this.inputAnchor={x:p.x,y:p.y,...state.movement,received:performance.now()};
  if(state.world.paused||!p.chosen||(this.streamPosition&&Math.hypot(this.streamPosition.x-p.x,this.streamPosition.y-p.y)>6))this.resetInput();
 }
 inputPosition(state,dt,now){
  const input=this.streamInput,position=this.streamPosition,a=this.inputAnchor;
  if(!input||!position||!a)return null;
  const p=state.world.player,m=state.map.movement,norm=Math.hypot(input.dx,input.dy);
  const mounted=p.mounted&&!(p.species==='vampire'&&p.blood<=5);
  const speedFor=sprint=>m.step/m.interval*(mounted?(m.mount_base+p.unlocks[p.species]*m.mount_tier)*(sprint?1.25:1):(sprint?m.sprint_mult:1));
  const speed=speedFor(input.sprint);
  const horizon=a.lease+Math.min(.2,this.inputLatency||0);
  const stale=now-a.received>700;
  if(norm&&!stale&&!state.world.paused){position.x+=input.dx/norm*speed*dt;position.y+=input.dy/norm*speed*dt;}
  if(stale||(a.seq>=input.changeSeq&&a.dx===input.dx&&a.dy===input.dy&&a.sprint===input.sprint)){
   const lead=stale?0:Math.min(horizon,(now-a.received)/1000+(a.age||0)+(this.inputLatency||0)),an=Math.hypot(a.dx,a.dy);
   const serverSpeed=speedFor(a.sprint),x=a.x+(an?a.dx/an*serverSpeed*lead:0),y=a.y+(an?a.dy/an*serverSpeed*lead:0),follow=1-Math.exp(-8*dt);
   position.x+=(x-position.x)*follow;position.y+=(y-position.y)*follow;
  }
  // A stalled connection cannot predict indefinitely beyond confirmed coordinates.
  const gap=Math.hypot(position.x-a.x,position.y-a.y),limit=speed*horizon+.5;
  if(gap>limit){position.x=a.x+(position.x-a.x)/gap*limit;position.y=a.y+(position.y-a.y)/gap*limit;}
  position.x=Math.max(1,Math.min(state.map.size-2,position.x));position.y=Math.max(1,Math.min(state.map.size-2,position.y));
  return position;
 }
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
   const regionInfo=this.region(state,x,y),region=regionInfo.terrain||regionInfo.id,n=this.noise(gx+47,gy+13);
   const cluster=(Math.sin(x/8)+Math.cos(y/11)+Math.sin((x+y)/17))/3;
   if(region==='marsh'&&n>.82)this.ponds.push({x,y});
   if(n<(region==='forest'?(cluster>.15?.48:.87):.88))continue;
   const type=region==='works'||(region==='outskirts'&&n>.97)?'ruin':'tree';
   if(type==='ruin'&&this.scenery.some(e=>e.type==='ruin'&&Math.hypot(e.x-x,e.y-y)<10))continue;
   this.scenery.push({x,y,type:this.themes&&n>.96?'theme_prop':type,model:region==='works'?'truck':region==='marsh'?'grave':region==='forest'?'cave':'drums',faction:region==='marsh'||region==='forest'?'vampire':'human',seed:region==='marsh'?n*.4:region==='forest'?.5+n*.5:this.noise(y+7,x)});
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
  const regions=state.map.id?.startsWith('dungeon:')?state.map.regions:x<256&&y<256?state.map.regions.slice(0,4):x<384&&y<384?state.map.regions.slice(4,9):state.map.regions.slice(9);
  return (regions.length?regions:state.map.regions).reduce((a,b)=>((wx-a.x)**2+(wy-a.y)**2)/a.radius**2<=((wx-b.x)**2+(wy-b.y)**2)/b.radius**2?a:b);
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
  const w=state.world,p=w.player,size=state.map.size,visual=this.inputPosition(state,dt,now)||this.prediction||p;
  if(!this.player||Math.hypot(this.player.x-visual.x,this.player.y-visual.y)>5)this.player={x:visual.x,y:visual.y};
  const follow=1-Math.exp(-36*dt);
  this.player.x+=(visual.x-this.player.x)*follow;this.player.y+=(visual.y-this.player.y)*follow;
  if(!this.camera)this.camera={...this.player};
  this.camera.x+=(this.player.x-this.camera.x)*(1-Math.exp(-22*dt));
  this.camera.y+=(this.player.y-this.camera.y)*(1-Math.exp(-22*dt));
  const scale=this.zoom*(width<600?.85:1),tw=34*scale,th=17*scale;
  this.projection={scale,tw,th,width,height,ox:width/2-(this.camera.x-this.camera.y)*tw,oy:height*.52-(this.camera.x+this.camera.y)*th};
  if(this.combat&&!this.combat.active(now))this.combat=null;
  const art=this.art;art.sky(width,height,now);
  this.canvas.dataset.art=art.failed.length?'fallback':art.loaded===Object.keys(FIELD_SPRITES).length?'ready':'loading';
  const project=(x,y,z=0)=>this.project(x,y,z);
  const paintPlayer=(sx,sy)=>{
   const sprinting=Boolean(effects.sprinting);
   const normal=art.pose('player',this.player.x,this.player.y,now,w.paused,sprinting,this.streamInput),pose=this.combat?this.combat.pose(normal,now):normal;
   const activeMove=normal.moving;
   this.canvas.dataset.locomotion=activeMove?(sprinting?'run':'walk'):'idle';
   const dirSign=(pose.row===0||pose.row===3)?1:-1,dirY=(pose.row<=1)?1:-1;
    // Lineage M-style locomotion: smooth walk->run transition, alternating footprints, stopping skid puff, dynamic stride bounce & sway.
    const lc=this.loco||(this.loco={run:0,trail:[],lastX:null,lastY:null,side:1,wasActive:false,tick:0});
    if(lc.tick!==now){
     lc.tick=now;
     lc.run+=(((sprinting&&activeMove&&!p.mounted)?1:0)-lc.run)*(1-Math.exp(-8*dt));
     const px=this.player.x,py=this.player.y;
     if(lc.lastX===null){lc.lastX=px;lc.lastY=py;}
     if(activeMove&&!p.mounted&&Math.hypot(px-lc.lastX,py-lc.lastY)>(sprinting?.75:.5)){
      lc.side=-lc.side;lc.trail.push({k:'print',x:px,y:py,side:lc.side,born:now,life:1400});lc.lastX=px;lc.lastY=py;
     }
     if(!activeMove){lc.lastX=px;lc.lastY=py;}
     if(lc.wasActive&&!activeMove&&lc.run>.45){
      for(let i=0;i<5;i++)lc.trail.push({k:'puff',x:px,y:py,dx:(Math.random()-.5)*14,born:now,life:420+i*60});
     }
     lc.wasActive=activeMove;
     lc.trail=lc.trail.filter(q=>now-q.born<q.life).slice(-40);
    }
    for(const q of lc.trail){
     const k=(now-q.born)/q.life,[tx,ty]=project(q.x,q.y);
     if(q.k==='print'){
      c.fillStyle='rgba(10,12,18,'+(0.28*(1-k)).toFixed(3)+')';c.beginPath();c.ellipse(tx+q.side*3*scale,ty+scale,2.4*scale,1.2*scale,0,0,Math.PI*2);c.fill();
     }else{
      c.fillStyle='rgba(190,178,160,'+(0.3*(1-k)).toFixed(3)+')';c.beginPath();c.ellipse(tx+q.dx*scale*(1+k*2),ty-8*k*scale,(3+k*5)*scale,(1.6+k*2.5)*scale,0,0,Math.PI*2);c.fill();
     }
    }
    // Crisp 2D walk cadence: subtle vertical step bounce synced with stride, zero canvas tilt/stretch to keep authentic 2D sprite art sharp
    let walkY=0;
    if(activeMove&&!p.mounted&&!this.combat){
     walkY=-Math.abs(Math.sin(normal.phase))*(1.4+lc.run*.8);
    }
    const body=this.combat?.body(now)||{x:0,y:walkY,tilt:0};
   if(activeMove){
    c.save();
    // Footstep dust puffs & sprint shockwave / speed lines
    for(let i=0;i<(sprinting?4:2);i++){
     const phase=((now/(sprinting?180:260))+i*.33)%1;
     const dx=-dirSign*(8+phase*(sprinting?26:14))*scale,dy=-dirY*(2+phase*7)*scale+3*scale;
     c.fillStyle=p.species==='vampire'?(sprinting?'#e35d7a55':'#b8889438'):(sprinting?'#e6d7b855':'#b8b49e38');
     c.beginPath();c.ellipse(sx+dx,sy+dy,(4.5-phase*2.5)*scale,(2.4-phase*1.2)*scale,0,0,Math.PI*2);c.fill();
    }
    if(sprinting){
      // Sprint wind streaks
      c.strokeStyle=p.species==='vampire'?'#ff8da644':'#fff0c244';c.lineWidth=1.2*scale;
      for(let i=0;i<2;i++){
       const wy=sy-(26+i*24)*scale,wx=sx-dirSign*(14+i*5)*scale;
       c.beginPath();c.moveTo(wx,wy);c.lineTo(wx-dirSign*(16+((now/8+i*7)%12))*scale,wy+dirY*2*scale);c.stroke();
      }
     }
     c.restore();
   }
   c.save();c.translate(sx+(body.x||0)*scale,sy+(body.y||0)*scale);if(body.tilt)c.rotate(body.tilt);
   art.character(0,0,scale,p.species,activeMove,now,{mounted:p.mounted,tier:p.unlocks[p.species],sprint:sprinting,pose,gender:p.gender||'male',job:p.job||'warrior'});
   c.restore();
  };
  const poly=(points,color)=>{c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fillStyle=color;c.fill();};
  const tile=(x,y,color)=>{const [sx,sy]=project(x,y);poly([[sx,sy-th],[sx+tw+.6,sy],[sx,sy+th+.5],[sx-tw-.6,sy]],color);};
  const ellipse=(x,y,rx,ry,color)=>{c.fillStyle=color;c.beginPath();c.ellipse(x,y,rx*scale,ry*scale,0,0,Math.PI*2);c.fill();};
  const box=(x,y,z,color,wide=.7,sides=['#35423e','#273637'])=>{
   const [sx,sy]=project(x,y),a=tw*wide,b=th*wide,h=z*scale;
   poly([[sx-a,sy-h],[sx,sy-h+b],[sx,sy+b],[sx-a,sy]],sides[0]);
   poly([[sx+a,sy-h],[sx,sy-h+b],[sx,sy+b],[sx+a,sy]],sides[1]);
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
  const hasBase=Boolean(w.base&&w.base.established!==false&&w.base.x!=null);
  const campClearance=Object.keys(w.base?.facilities||{}).some(id=>(w.base.facilities[id]||0)>0&&!['kitchen','alchemy','medical','storage'].includes(id))?12:state.map.base_clear_radius;
  const outsideCamp=e=>!hasBase||Math.hypot(e.x-w.base.x,e.y-w.base.y)>=campClearance;
  const scenery=this.scenery.filter(e=>visible(e.x,e.y)&&outsideCamp(e));
  if(!art.ground(state,this.projection)){
   const palettes={outskirts:'#404449',forest:'#2f3b39',marsh:'#33434a',works:'#4d494b'};
   for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++)tile(x,y,palettes[this.region(state,x,y).terrain||this.region(state,x,y).id]||'#404449');
  }
  if(state.map.dungeon_theme)for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++)if(x>1&&x<63&&y>1&&y<63)tile(x,y,(x+y)%2?'#343039aa':'#39353caa');
  for(const pond of this.ponds){if(!visible(pond.x,pond.y)||!outsideCamp(pond))continue;const [sx,sy]=project(pond.x,pond.y);ellipse(sx,sy,22,9,'#253842');ellipse(sx+3*scale,sy,14,4,'#93a8b02c');}
  const towns=state.map?.towns?Object.values(state.map.towns):[];
  for(const town of towns){
   const dark=town.faction==='vampire';
   for(let dx=-12;dx<=12;dx++)for(let dy=-12;dy<=12;dy++){
    const x=town.x+dx,y=town.y+dy;if(!visible(x,y))continue;
    const avenue=Math.abs(dx)<=2||Math.abs(dy)<=2,plaza=Math.abs(dx)<=4&&Math.abs(dy)<=4;
    tile(x,y,plaza?((dx+dy)%2?'#4f4e4b88':'#4d4b4988'):avenue?((dx+dy)%2?'#49484788':'#47464688'):dark?'#2b252e77':'#30373a77');
    if(avenue&&(Math.abs(dx)===2||Math.abs(dy)===2))tile(x,y,dark?'#68424a44':'#6b665344');
   }
  }
  if(hasBase&&this.themes){for(let dx=-11;dx<=11;dx++)for(let dy=-11;dy<=11;dy++){const x=w.base.x+dx,y=w.base.y+dy;if(visible(x,y)&&(Math.abs(dx)<=1||Math.abs(dy)<=1||Math.abs(dx)===11||Math.abs(dy)===11))tile(x,y,p.species==='human'?'#555c4b':'#4e3f50');}}
  if(hasBase&&!this.themes&&!art.campGround(w.base.x,w.base.y,this.projection,state.map.base_radius))for(let x=-2;x<=2;x++)for(let y=-2;y<=2;y++)tile(w.base.x+x,w.base.y+y,'#5c5757');
  if(target){
   const [tx,ty]=project(target.x,target.y),[px,py]=project(this.player.x,this.player.y);
   c.setLineDash([3,9]);c.strokeStyle='#ead3a488';c.lineWidth=1.5;c.beginPath();c.moveTo(px,py);c.lineTo(tx,ty);c.stroke();c.setLineDash([]);
   c.strokeStyle='#f2d39b';c.beginPath();c.ellipse(tx,ty,15*scale,7*scale,0,0,Math.PI*2);c.stroke();
  }
  const offsets={kitchen:[-4,2],alchemy:[3,-4],medical:[2,4],storage:[5,0]};
  const facilities=hasBase?Object.entries(w.base.facilities||{}).filter(([,level])=>level).map(([id,level])=>{const off=state.map.facilities?.[id]?.offset||offsets[id]||[0,0];return {x:w.base.x+off[0],y:w.base.y+off[1],id,level,type:'facility'};}):[];
  const smooth=(e,key)=>{let v=this.entityPositions.get(key);if(!v||Math.hypot(v.x-e.x,v.y-e.y)>5||w.paused)v={x:e.x,y:e.y};
   const follow=1-Math.exp(-12*dt);v.x+=(e.x-v.x)*follow;v.y+=(e.y-v.y)*follow;this.entityPositions.set(key,v);return {...e,...v};};
  const otherBases=(state.other_bases||[]).map(b=>({...b,type:'other_base'}));
  const merchants=(state.map.merchants||[]).map(m=>({...m,type:'merchant',kind:'merchant'}));
  const baseEntity=hasBase?[{...w.base,type:'base'}]:[];
  const townBuildings=towns.flatMap(t=>[[-8,-9,'storage',t.faction==='human'?'보급 천막':'지하 보물고'],[8,-9,'storage',t.faction==='human'?'병기 정비고':'혈철 공방'],[-8,10,'alchemy',t.faction==='human'?'작전 통신소':'금서 첨탑'],[8,10,'medical',t.faction==='human'?'야전 의무 텐트':'혈족 대성당'],[-9,0,'kitchen',t.faction==='human'?'취사 야영지':'혈족 연회당'],[9,0,'medical',t.faction==='human'?'야전 사령부':'박쥐 동굴']].map(([dx,dy,prop,title],i)=>({x:t.x+dx,y:t.y+dy,type:'town_building',prop,title,faction:t.faction,model:t.faction==='human'?['tent','bunker','radio','tent','tent','bunker'][i]:['crypt','crypt','tower','keep','crypt','cave'][i],variant:i})));
  const townProps=towns.flatMap(t=>[[-5,-9],[-3,-8],[5,7],[7,4],[-5,7],[3,-10]].map(([dx,dy],i)=>({x:t.x+dx,y:t.y+dy,type:'theme_prop',faction:t.faction,model:t.faction==='human'?['supply','drums','truck','supply','drums','radio'][i]:['grave','grave','cave','grave','crypt','grave'][i],seed:i})));
  if(state.map.dungeon_theme)for(const [x,y] of [[14,18],[28,10],[42,20],[18,38],[36,44],[52,48]])townProps.push({x,y,type:'theme_prop',faction:state.map.dungeon_theme,model:state.map.dungeon_theme==='human'?'supply':'grave',seed:x});
  const estateWalls=[];
  if(hasBase)for(let n=-10;n<=10;n+=4)for(const sign of [-1,1])if(Math.abs(n)>2){estateWalls.push({x:w.base.x+n,y:w.base.y+sign*11,type:'town_wall',faction:p.species});estateWalls.push({x:w.base.x+sign*11,y:w.base.y+n,type:'town_wall',faction:p.species});}
  if(state.map.dungeon_theme)for(let n=2;n<=62;n+=4)for(const side of [2,62]){estateWalls.push({x:n,y:side,type:'town_wall',faction:state.map.dungeon_theme});estateWalls.push({x:side,y:n,type:'town_wall',faction:state.map.dungeon_theme});}

  const townWalls=towns.flatMap(t=>{
   const pieces=[];
   for(let n=-12;n<=12;n+=2)for(const side of [-1,1])if(Math.abs(n)>2){
    pieces.push({x:t.x+n,y:t.y+side*12,type:'town_wall',faction:t.faction});
    pieces.push({x:t.x+side*12,y:t.y+n,type:'town_wall',faction:t.faction});
   }
   for(const dx of [-12,12])for(const dy of [-12,12])pieces.push({x:t.x+dx,y:t.y+dy,type:'town_tower',faction:t.faction});
   pieces.push({x:t.x,y:t.y,type:'town_monument',faction:t.faction,title:t.name});
   return pieces;
  });
  const entities=[...scenery.filter(e=>!towns.some(t=>Math.hypot(e.x-t.x,e.y-t.y)<t.radius)),...townBuildings,...townWalls,...townProps,...estateWalls,...state.pois.map(n=>({...n,...(n.kind==='npc'?smooth(n,'npc:'+n.id):{}),type:'poi'})),...merchants,...(w.drops||[]).map(d=>({...d,type:'drop'})),...baseEntity,...facilities,...otherBases,...w.enemies.filter(e=>e.hp>0).map(e=>({...smooth(e,'enemy:'+e.id),type:'enemy'})),...(state.others||[]).filter(o=>o.chosen).map(o=>({...smooth(o,'peer:'+o.id),type:'peer'})),{...p,...this.player,type:'player'}].filter(e=>visible(e.x,e.y)).sort((a,b)=>a.x+a.y-b.x-b.y);
  this.points=[];const labels=[];let playerCovered=false;
  const tree=(x,y,seed=0)=>{const [sx,sy]=project(x,y);art.tree(sx,sy,scale,seed);};
  for(const e of entities){
   const [sx,sy]=project(e.x,e.y),near=Math.hypot(p.x-e.x,p.y-e.y);
   if(sx < -150*scale || sx > width+150*scale || sy < -40*scale || sy > height+290*scale)continue;
   const [px,py]=project(this.player.x,this.player.y);
   const tall=['base','ruin','town_building','town_tower','theme_prop'].includes(e.type),treeLike=e.type==='tree'||e.kind==='wood';
   const occludes=(tall||treeLike||e.type==='facility'||['water','metal','blood'].includes(e.kind))&&Math.abs(px-sx)<(tall?95:treeLike?60:35)*scale&&py<sy+(tall?36:5)*scale&&py>sy-(tall?260:treeLike?205:95)*scale;
   if(occludes&&e.x+e.y>=this.player.x+this.player.y)playerCovered=true;
   c.globalAlpha=occludes?.3:1;
   if(e.type==='theme_prop'&&this.themes){this.themes.draw(sx,sy,scale*.65,e.model,e.faction,Math.floor((e.seed||0)*7));c.globalAlpha=1;continue;}
   if(e.type==='tree'){tree(e.x,e.y,e.seed);c.globalAlpha=1;continue;}
   if(e.type==='lantern'){art.lantern(sx,sy,scale);continue;}
   if(e.type==='reed'){
    c.strokeStyle='#8d9386';c.lineWidth=2*scale;
    for(let j=0;j<5;j++){c.beginPath();c.moveTo(sx+(j-2)*5*scale,sy);c.lineTo(sx+(j-3)*6*scale,sy-(18+j%3*5)*scale);c.stroke();}continue;
   }
   if(e.type==='ruin'){art.ruin(sx,sy,scale,e.seed);continue;}
   ellipse(sx+4*scale,sy+3*scale,18,8,'#152c2955');
   if(e.type==='base'){
    if(this.themes)this.themes.draw(sx,sy,scale,p.species==='human'?'bunker':'keep',p.species);else art.refuge(sx,sy,scale);
    labels.push([p.species==='human'?'내 아지트 · 인간 전초영지':'내 아지트 · 혈족 성채영지',sx,sy-250*scale,'#ffd166']);
    this.points.push({x:sx,y:sy-30*scale,id:'base',left:sx-115*scale,right:sx+115*scale,top:sy-245*scale,bottom:sy+35*scale});
   }
   if(e.type==='other_base'){
    if(this.themes)this.themes.draw(sx,sy,scale,e.species==='vampire'?'keep':'bunker',e.species);else art.refuge(sx,sy,scale);
    labels.push([e.name||'생존자 거점',sx,sy-250*scale,'#7dd3fc']);
   }
   if(e.type==='facility'){
    const spec=state.map.facilities?.[e.id];if(this.themes){const model=p.species==='human'?(['storage','forge','workshop','archive'].includes(e.id)?'bunker':'tent'):(['alchemy','archive'].includes(e.id)?'tower':'crypt');this.themes.draw(sx,sy,scale*.55,model,p.species,e.id==='medical'?1:0);art.prop(spec?.prop||e.id,sx+30*scale,sy+8*scale,scale*.35);}else art.prop(spec?.prop||e.id,sx,sy,scale*.9);
    labels.push([`${state.map.facility_themes?.[p.species]?.[e.id]||spec?.name||e.id} Lv.${e.level}`,sx,sy-108*scale,'#d3c7a3']);
   }
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
    const dropTitle=gear?`★ [${state.rarities?.[gear.rarity]?.name||'장비'}] ${gear.name} [F 루팅]`:`📦 ${e.label||'전리품'} [F 루팅]`;
    if(near<16||e.id===selected)labels.push([dropTitle,sx,sy-36*scale,rarityColor]);
    this.points.push({x:sx,y:sy-10*scale,id:e.id,left:sx-45*scale,right:sx+45*scale,top:sy-55*scale,bottom:sy+16*scale});
   }
   if(e.type==='poi'){
    if(e.site_type){
     if(e.site_type==='corpse'){
      ellipse(sx,sy,22,8,'#292426');c.strokeStyle='#84716a';c.lineWidth=7*scale;c.beginPath();c.moveTo(sx-17*scale,sy-3*scale);c.lineTo(sx+16*scale,sy-3*scale);c.stroke();ellipse(sx+20*scale,sy-3*scale,5,5,'#a0927e');
     }else if(['warehouse','library','pharmacy','armory','ancient_vault','wreck_truck','mutant_vat'].includes(e.site_type)){
      art.refuge(sx,sy,scale*.55);art.prop(e.prop,sx+27*scale,sy+8*scale,scale*.5);
     }else if(['mine','silver_vein','obsidian_vein','crystal_cache','sulfur_vent','bone_pit'].includes(e.site_type)){
      for(let j=0;j<4;j++)box(e.x+j*.25,e.y-j*.3,22+j*7,({silver_vein:'#b5c8cf',obsidian_vein:'#514268',crystal_cache:'#66bbc9',sulfur_vent:'#b6a65d',bone_pit:'#bab09c'})[e.site_type]||'#837e72',.35);
     }else art.prop(e.prop,sx,sy,scale);
    }
    if(!e.site_type&&e.kind==='wood')tree(e.x,e.y,.8);
    if(!e.site_type&&['water','metal','blood'].includes(e.kind)&&!art.prop(e.kind,sx,sy,scale))box(e.x,e.y,30,'#77716a');
    if(!e.site_type&&['crop','herb'].includes(e.kind)){
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
     const pose=art.pose('npc:'+e.id,e.x,e.y,now,w.paused),npcBob=pose.moving?-Math.abs(Math.sin(pose.phase))*1.6*scale:0;
     art.character(sx,sy+npcBob,scale,isVamp?'vampire':'human',pose.moving,now,{npc:true,pose});
    }
    const focus=e.id===selected||near<=3.5;
    if(focus){c.strokeStyle='#e9d29a';c.lineWidth=1.5;c.beginPath();c.ellipse(sx,sy,28*scale,14*scale,0,0,Math.PI*2);c.stroke();}
    const poiLabel=focus&&e.kind!=='npc'?`${e.label} [E: 내용물 확인]`:e.label;
    if(focus||near<8)labels.push([poiLabel,sx,sy-(e.site_type?175:e.kind==='wood'?214:e.kind==='blood'?140:e.kind==='water'||e.kind==='metal'?116:96)*scale,focus?'#ffe5aa':'#e0e4d2']);
    const halfWidth=Math.max((e.kind==='wood'?66:e.kind==='metal'?72:45)*scale,e.label.length*5.5);
    this.points.push({x:sx,y:sy-22*scale,id:e.id,left:sx-halfWidth,right:sx+halfWidth,top:sy-(e.site_type?175:e.kind==='wood'?210:e.kind==='blood'?137:110)*scale,bottom:sy+12*scale});
   }
   if((e.type==='town_wall'||e.type==='town_tower')&&this.themes){this.themes.draw(sx,sy,scale*.6,e.type==='town_tower'?'tower':e.faction==='human'?'wire':'wall',e.faction);continue;}
   if(e.type==='town_wall'||e.type==='town_tower'){
    const tower=e.type==='town_tower',dark=e.faction==='vampire',height=tower?80:34;
    const wallWidth=tower?1.15:1;
    box(e.x,e.y,height,dark?'#54404b':'#60656b',wallWidth,dark?['#42363e','#302b32']:['#575755','#3f4143']);
    c.strokeStyle='#15171b99';c.lineWidth=.8*scale;
    for(let z=10;z<height;z+=10){
     c.beginPath();c.moveTo(sx-tw*wallWidth,sy-(height-z)*scale);c.lineTo(sx,sy+th*wallWidth-(height-z)*scale);c.lineTo(sx+tw*wallWidth,sy-(height-z)*scale);c.stroke();
    }
    for(const d of [-.65,0,.65])box(e.x+d,e.y,height+7,dark?'#7b5360':'#898273',.19);
    if(tower){c.fillStyle=dark?'#c95970':'#e7be72';c.fillRect(sx-3*scale,sy-56*scale,6*scale,13*scale);}
   }
   if(e.type==='town_monument'){
    box(e.x,e.y,10,'#817361',1.7);box(e.x,e.y,70,e.faction==='human'?'#afb5b7':'#734259',.42);
    c.strokeStyle=e.faction==='human'?'#ecdbac':'#e98aaf';c.lineWidth=4*scale;
    c.beginPath();c.moveTo(sx,sy-105*scale);c.lineTo(sx,sy-65*scale);c.moveTo(sx-12*scale,sy-90*scale);c.lineTo(sx+12*scale,sy-90*scale);c.stroke();
    labels.push([e.title,sx,sy-120*scale,'#e8cf97']);
   }
   if(e.type==='town_building'){
    if(this.themes){this.themes.draw(sx,sy,scale*.85,e.model,e.faction,e.variant);labels.push([e.title,sx,sy-210*scale,'#cbbfa9']);continue;}
    c.save();if(e.faction==='vampire')c.filter='hue-rotate(315deg) saturate(.75)';art.refuge(sx,sy,scale*(e.prop==='medical'?.85:.62));c.restore();
    art.prop(e.prop,sx+38*scale,sy+12*scale,scale*.6);c.fillStyle=e.faction==='human'?'#78bccb':'#aa536b';c.fillRect(sx-3*scale,sy-105*scale,3*scale,55*scale);c.beginPath();c.moveTo(sx,sy-105*scale);c.lineTo(sx+26*scale,sy-97*scale);c.lineTo(sx,sy-84*scale);c.fill();
    labels.push([e.title,sx,sy-(e.prop==='medical'?238:178)*scale,'#cbbfa9']);
   }
   if(e.type==='merchant'){
    const isVamp=e.faction==='vampire';
    const [hx,hy]=project(e.x,e.y);box(e.x+.6,e.y+.6,14,isVamp?'#603c4b':'#6a6352',.65);
    art.character(sx,sy,scale,isVamp?'vampire':'human',false,now,{npc:true});
    c.strokeStyle='#fbbf24aa';c.lineWidth=1.5;c.beginPath();c.ellipse(sx,sy+2*scale,16*scale,8*scale,0,0,Math.PI*2);c.stroke();
    labels.push([`${({equipment:'⚔',scroll:'◇',skill:'✦',supplies:'◈'})[e.role]||'◈'} ${e.name} [E: 상점]`,sx,sy-112*scale,'#fde047']);
    this.points.push({x:sx,y:sy-25*scale,id:'merchant:'+e.id,left:sx-48*scale,right:sx+48*scale,top:sy-98*scale,bottom:sy+12*scale,merchant:true});
   }
   if(e.type==='enemy'){
    const pose=art.pose('enemy:'+e.id,e.x,e.y,now,w.paused),high=(e.level||1)>=8,boss=(e.level||1)>=12;
    const eBob=pose.moving?-Math.abs(Math.sin(pose.phase))*1.8*scale:0;
    const eFac=e.faction||'infected';
    const isFriendly=(eFac===p.species);
    const specForArt=(eFac==='vampire'?'vampire':'human');
    if(high){c.strokeStyle=boss?'#ff525288':'#d68c7766';c.lineWidth=boss?2:1.3;c.beginPath();c.ellipse(sx,sy+2*scale,(boss?24:19)*scale,(boss?11:9)*scale,0,0,Math.PI*2);c.stroke();}
    const monster=state.map.monster_types?.[e.monster_type];
    c.save();if(eFac==='infected'&&monster)c.filter=`hue-rotate(${monster.hue}deg)`;
    art.character(sx,sy+eBob,scale*(monster?.scale||(boss?1.15:high?1.06:1)),specForArt,pose.moving,now,{enemy:eFac==='infected',variant:e.monster_type==='juggernaut'||high,pose,gender:'male',job:e.monster_type==='wraith'?'ranged':'warrior'});c.restore();
    c.fillStyle='#151c29';c.fillRect(sx-18*scale,sy-98*scale,36*scale,4*scale);
    c.fillStyle=isFriendly?'#38bdf8':boss?'#ff5c5c':high?'#d9734e':'#ad5866';
    c.fillRect(sx-18*scale,sy-98*scale,36*scale*Math.min(1,Math.max(0,e.hp)/(e.max_hp||60)),4*scale);
    const facTag=isFriendly?'[아군] ':eFac==='human'?'[인간·적대] ':eFac==='vampire'?'[혈족·적대] ':'[감염] ';
    const nameColor=isFriendly?'#9ee4ff':boss?'#ff7b7b':eFac==='vampire'?'#f472b6':'#e4c9c1';
    labels.push([`${facTag}${e.name||'몬스터'} Lv.${e.level||1}`,sx,sy-111*scale,nameColor]);
    this.points.push({x:sx,y:sy-23*scale,id:'enemy:'+e.id,left:sx-29*scale,right:sx+29*scale,top:sy-95*scale,bottom:sy+10*scale,isFriendly});
   }
   if(e.type==='peer'){
    const pose=art.pose('peer:'+e.id,e.x,e.y,now,w.paused),pBob=pose.moving&&!e.mounted?-Math.abs(Math.sin(pose.phase))*1.6*scale:0;
    c.strokeStyle='#6bc5e8aa';c.lineWidth=1.4;c.beginPath();c.ellipse(sx,sy+2*scale,15*scale,7*scale,0,0,Math.PI*2);c.stroke();
    art.character(sx,sy+pBob,scale,e.species,pose.moving,now,{mounted:e.mounted,tier:e.unlocks?.[e.species]||0,pose,gender:e.gender||'male',job:e.job||'warrior'});
    c.fillStyle='#151c29';c.fillRect(sx-16*scale,sy-96*scale,32*scale,4*scale);
    c.fillStyle='#5bc0eb';c.fillRect(sx-16*scale,sy-96*scale,32*scale*Math.min(1,Math.max(0,e.hp||0)/100),4*scale);
    labels.push([`${e.name||'생존자'} · Lv.${e.combat_level||1}`,sx,sy-108*scale,'#9ee4ff']);
   }
   if(e.type==='player'){
    c.strokeStyle=p.species==='vampire'?'#ca8d9d':'#c4bd9d';c.lineWidth=1.2;c.beginPath();c.ellipse(sx,sy+2*scale,14*scale,7*scale,0,0,Math.PI*2);c.stroke();
    paintPlayer(sx,sy);
    const barY=sy-(p.mounted?112:102)*scale;
    c.fillStyle='#121822dd';c.fillRect(sx-19*scale,barY,38*scale,p.species==='human'?9*scale:5*scale);
    c.fillStyle=p.species==='vampire'?'#d94f70':'#68c97a';
    c.fillRect(sx-18*scale,barY+1*scale,36*scale*Math.min(1,Math.max(0,p.hp||0)/100),3.2*scale);
    if(p.species==='human'){
     c.fillStyle='#4da6ff';
     c.fillRect(sx-18*scale,barY+5*scale,36*scale*Math.min(1,Math.max(0,(p.mp??100))/100),3*scale);
    }
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
  const towns=state.map?.towns?Object.values(state.map.towns):[];
  for(const town of towns){
   c.strokeStyle=town.faction==='vampire'?'#e11d4888':'#38bdf888';c.lineWidth=1.2;c.beginPath();c.arc(town.x*k,town.y*k,town.radius*k,0,Math.PI*2);c.stroke();
   c.fillStyle=town.faction==='vampire'?'#e11d48':'#38bdf8';c.fillRect(town.x*k-2.5,town.y*k-2.5,5,5);
  }
  for(const m of (state.map?.merchants||[])){c.fillStyle='#fbbf24';c.fillRect(m.x*k-1.5,m.y*k-1.5,3,3);}
  const w=state.world,hasBase=Boolean(w.base&&w.base.established!==false&&w.base.x!=null);
  for(const enemy of w.enemies){if(enemy.hp>0){c.fillStyle=(enemy.faction===w.player.species)?'#38bdf8':'#eb8d78';c.fillRect(enemy.x*k-1,enemy.y*k-1,2,2);}}
  for(const drop of (w.drops||[])){c.fillStyle='#ffd966';c.fillRect(drop.x*k-1.5,drop.y*k-1.5,3,3);}
  for(const peer of (state.others||[])){if(peer.chosen){c.fillStyle='#5bc0eb';c.beginPath();c.arc(peer.x*k,peer.y*k,2.5,0,Math.PI*2);c.fill();}}
  for(const ob of (state.other_bases||[])){
   c.strokeStyle='#38bdf855';c.lineWidth=1;c.beginPath();c.arc(ob.x*k,ob.y*k,state.map.base_radius*k,0,Math.PI*2);c.stroke();
   c.fillStyle='#38bdf8';c.fillRect(ob.x*k-2,ob.y*k-2,4,4);
  }
  if(hasBase){
   c.strokeStyle='#e9cf8f88';c.lineWidth=1;c.beginPath();c.arc(w.base.x*k,w.base.y*k,state.map.base_radius*k,0,Math.PI*2);c.stroke();
   c.fillStyle='#ffda8d';c.fillRect(w.base.x*k-3,w.base.y*k-3,6,6);
  }
  if(this.projection){
   const r=this.canvas.getBoundingClientRect(),corners=[[0,0],[r.width,0],[r.width,r.height],[0,r.height]].map(([x,y])=>this.toWorld(x,y));
   c.strokeStyle='#e9efcf66';c.lineWidth=1;c.beginPath();corners.forEach((v,i)=>i?c.lineTo(v.x*k,v.y*k):c.moveTo(v.x*k,v.y*k));c.closePath();c.stroke();
  }
  if(target){c.strokeStyle='#ffdfab';c.beginPath();c.arc(target.x*k,target.y*k,4,0,Math.PI*2);c.stroke();}
  c.fillStyle='#fff9db';c.beginPath();c.arc(w.player.x*k,w.player.y*k,3,0,Math.PI*2);c.fill();
 }
}
