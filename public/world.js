/* Camera and original gothic field renderer. Artwork primitives live in gothic.js. */
class WorldView {
 constructor(canvas, minimap) {
  this.canvas=canvas; this.ctx=canvas.getContext('2d'); this.minimap=minimap;this.art=new GothicArt(this.ctx);
  this.zoom=1; this.camera=null; this.player=null; this.points=[]; this.projection=null; this.lastFrame=0;
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
  const w=state.world,p=w.player,size=state.map.size;
  if(!this.player||Math.hypot(this.player.x-p.x,this.player.y-p.y)>5)this.player={x:p.x,y:p.y};
  const moving=Math.hypot(this.player.x-p.x,this.player.y-p.y)>.025;
  const follow=1-Math.exp(-18*dt);
  this.player.x+=(p.x-this.player.x)*follow;this.player.y+=(p.y-this.player.y)*follow;
  if(!this.camera)this.camera={...this.player};
  this.camera.x+=(this.player.x-this.camera.x)*(1-Math.exp(-10*dt));
  this.camera.y+=(this.player.y-this.camera.y)*(1-Math.exp(-10*dt));
  const scale=this.zoom*(width<600?.85:1),tw=34*scale,th=17*scale;
  this.projection={scale,tw,th,ox:width/2-(this.camera.x-this.camera.y)*tw,oy:height*.52-(this.camera.x+this.camera.y)*th};
  const art=this.art;art.sky(width,height,now);
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
  const corners=[this.toWorld(-140,-160),this.toWorld(width+140,-160),this.toWorld(-140,height+180),this.toWorld(width+140,height+180)];
  const minX=Math.max(0,Math.floor(Math.min(...corners.map(n=>n.x)))),maxX=Math.min(size-1,Math.ceil(Math.max(...corners.map(n=>n.x))));
  const minY=Math.max(0,Math.floor(Math.min(...corners.map(n=>n.y)))),maxY=Math.min(size-1,Math.ceil(Math.max(...corners.map(n=>n.y))));
  const visible=(x,y)=>x>=minX&&x<=maxX&&y>=minY&&y<=maxY;
  const nearLandmark=(x,y)=>Math.hypot(x-w.base.x,y-w.base.y)<3||state.pois.some(n=>Math.hypot(x-n.x,y-n.y)<1.7);
  const palettes={outskirts:['#3c4045','#404449','#42464b','#3e4347'],forest:['#2b3837','#2f3b39','#313e3b','#33403c'],marsh:['#304047','#33434a','#37474d','#35454c'],works:['#48464a','#4d494b','#49474a','#504b4c']};
  const scenery=[];
  for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
   const region=this.region(state,x,y).id,n=this.noise(x,y),road=[10,32,50].includes(x)||[10,32,50].includes(y);
   tile(x,y,road?(n>.5?'#54545a':'#515257'):palettes[region][Math.floor(n*4)]);
   const [sx,sy]=project(x,y);
   if(road){
    if((x+y)%3===0){c.fillStyle='#b7ac8866';c.fillRect(sx-3*scale,sy,6*scale,2*scale);}
    c.fillStyle='#191f2c70';c.fillRect(sx+9*scale,sy+2*scale,3*scale,scale);
    c.strokeStyle='#a9a39c30';c.lineWidth=.6*scale;c.beginPath();c.moveTo(sx-tw*.5,sy-th*.5);c.lineTo(sx+tw*.5,sy+th*.5);c.moveTo(sx+tw*.5,sy-th*.5);c.lineTo(sx-tw*.5,sy+th*.5);c.stroke();
    if((x===10||x===32||x===50)&&y%7===0&&!nearLandmark(x,y))scenery.push({x:x+.65,y,type:'lantern'});
   }else{
    // Ground details remain decorative; travel is intentionally unobstructed.
    if(region==='marsh'&&n>.73&&!nearLandmark(x,y)){
     ellipse(sx,sy,22,9,'#253842');ellipse(sx+3*scale,sy,14,4,'#93a8b02c');
    }else{
     c.strokeStyle=region==='works'?'#b0a49a33':region==='outskirts'?'#a8a49c22':'#829b7f33';c.lineWidth=scale;
     c.beginPath();c.moveTo(sx-7*scale,sy+2*scale);c.lineTo(sx-9*scale,sy-3*scale);c.moveTo(sx-6*scale,sy+2*scale);c.lineTo(sx-4*scale,sy-2*scale);c.stroke();
    }
    if(!nearLandmark(x,y)&&n>(region==='forest'?.72:.89))scenery.push({x,y,type:region==='works'||(region==='outskirts'&&n>.94)?'ruin':region==='marsh'?'reed':'tree',seed:n});
   }
  }
  for(let x=-2;x<=2;x++)for(let y=-2;y<=2;y++)tile(w.base.x+x,w.base.y+y,(x+y)%2?'#625b58':'#5c5757');
  if(target){
   const [tx,ty]=project(target.x,target.y),[px,py]=project(this.player.x,this.player.y);
   c.setLineDash([3,9]);c.strokeStyle='#ead3a488';c.lineWidth=1.5;c.beginPath();c.moveTo(px,py);c.lineTo(tx,ty);c.stroke();c.setLineDash([]);
   c.strokeStyle='#f2d39b';c.beginPath();c.ellipse(tx,ty,15*scale,7*scale,0,0,Math.PI*2);c.stroke();
  }
  const offsets={kitchen:[-1,-1],alchemy:[1,-1],medical:[-1,1],storage:[1,1]};
  const facilities=Object.entries(w.base.facilities).filter(([,level])=>level).map(([id,level])=>({x:w.base.x+offsets[id][0],y:w.base.y+offsets[id][1],id,level,type:'facility'}));
  const entities=[...scenery,...state.pois.map(n=>({...n,type:'poi'})),{...w.base,type:'base'},...facilities,...w.enemies.filter(e=>e.hp>0).map(e=>({...e,type:'enemy'})),{...p,...this.player,type:'player'}].filter(e=>visible(e.x,e.y)).sort((a,b)=>a.x+a.y-b.x-b.y);
  this.points=[];const labels=[];
  const tree=(x,y,seed=0)=>{const [sx,sy]=project(x,y);art.tree(sx,sy,scale,seed);};
  for(const e of entities){
   const [sx,sy]=project(e.x,e.y),near=Math.hypot(p.x-e.x,p.y-e.y);
   const [px,py]=project(this.player.x,this.player.y);
   const occludes=['tree','base','poi','facility','ruin'].includes(e.type)&&Math.abs(px-sx)<(e.type==='base'?55:36)*scale&&py<=sy+5*scale&&py>sy-(e.type==='base'?155:125)*scale;
   c.globalAlpha=occludes?.42:1;
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
    labels.push(['아지트 · 피난처',sx,sy-168*scale,'#e2cfaa']);
    this.points.push({x:sx,y:sy-30*scale,id:'base',left:sx-55*scale,right:sx+55*scale,top:sy-173*scale,bottom:sy+20*scale});
   }
   if(e.type==='facility')art.facility(sx,sy,scale,e.id);
   if(e.type==='poi'){
    if(e.kind==='wood'){tree(e.x-.25,e.y,.72);tree(e.x+.35,e.y+.3,.2);}
    if(e.kind==='water'){
     box(e.x,e.y,15,'#8b8985');ellipse(sx,sy-15*scale,17,8,'#273d4b');ellipse(sx,sy-16*scale,11,4,'#8499a6');
     c.fillStyle='#64616a';c.fillRect(sx-21*scale,sy-48*scale,3*scale,43*scale);c.fillRect(sx+18*scale,sy-48*scale,3*scale,43*scale);
     poly([[sx-27*scale,sy-48*scale],[sx,sy-61*scale],[sx+27*scale,sy-48*scale],[sx,sy-37*scale]],'#545761');
    }
    if(['crop','herb'].includes(e.kind)){
     tile(e.x,e.y,'#494143');
     for(let j=0;j<9;j++){
      const [gx,gy]=project(e.x+(j%3-1)*.37,e.y+(Math.floor(j/3)-1)*.37);
      c.strokeStyle='#989f7d';c.lineWidth=2*scale;c.beginPath();c.moveTo(gx,gy);c.lineTo(gx,gy-16*scale);c.stroke();
      ellipse(gx-3*scale,gy-9*scale,4,2,'#657c64');ellipse(gx+3*scale,gy-13*scale,4,2,e.kind==='herb'?'#b89fae':'#b5a583');
     }
    }
    if(e.kind==='metal'){
     box(e.x,e.y,19,'#795b52',.95);box(e.x-.25,e.y-.2,34,'#7a8287',.5);
     c.fillStyle='#2b4749';c.fillRect(sx-4*scale,sy-33*scale,12*scale,8*scale);ellipse(sx-18*scale,sy+4*scale,6,7,'#283a37');ellipse(sx+18*scale,sy+4*scale,6,7,'#283a37');
    }
    if(e.kind==='blood'){
     box(e.x,e.y,35,'#6f3f4b',.8);c.fillStyle='#c2b4a9';c.fillRect(sx-3*scale,sy-31*scale,6*scale,18*scale);c.fillRect(sx-9*scale,sy-25*scale,18*scale,6*scale);
    }
    if(e.kind==='npc'){
     box(e.x+.5,e.y+.35,18,'#766958',.65);
     art.character(sx,sy,scale,['vampire','ferryman'].includes(e.id)?'vampire':'human',false,now,{npc:true});
    }
    const focus=e.id===selected||near<2.5;
    if(focus){c.strokeStyle='#e9d29a';c.lineWidth=1.5;c.beginPath();c.ellipse(sx,sy,28*scale,14*scale,0,0,Math.PI*2);c.stroke();}
    if(focus||near<7)labels.push([e.label,sx,sy-(e.kind==='wood'?131:74)*scale,focus?'#ffe5aa':'#e0e4d2']);
    const halfWidth=Math.max(30*scale,e.label.length*5.5);
    this.points.push({x:sx,y:sy-22*scale,id:e.id,left:sx-halfWidth,right:sx+halfWidth,top:sy-(e.kind==='wood'?136:80)*scale,bottom:sy+12*scale});
   }
   if(e.type==='enemy'){
    art.character(sx,sy,scale,'human',false,now,{enemy:true});
    c.fillStyle='#151c29';c.fillRect(sx-16*scale,sy-64*scale,32*scale,4*scale);c.fillStyle='#ad5866';c.fillRect(sx-16*scale,sy-64*scale,32*scale*Math.max(0,e.hp)/60,4*scale);
    this.points.push({x:sx,y:sy-23*scale,id:'enemy:'+e.id,left:sx-22*scale,right:sx+22*scale,top:sy-68*scale,bottom:sy+10*scale});
   }
   if(e.type==='player'){
    c.strokeStyle=p.species==='vampire'?'#ca8d9d':'#c4bd9d';c.lineWidth=1.2;c.beginPath();c.ellipse(sx,sy+2*scale,14*scale,7*scale,0,0,Math.PI*2);c.stroke();
    art.character(sx,sy,scale,p.species,moving&&!w.paused,now,{mounted:p.mounted,tier:p.unlocks[p.species]});
    if(now<(effects.attackUntil||0)){c.strokeStyle='#ffe3a3';c.lineWidth=4*scale;c.beginPath();c.arc(sx,sy-18*scale,38*scale,-1.2,1.1);c.stroke();}
   }
  }
  c.globalAlpha=1;
  for(const args of labels)label(...args);
  art.atmosphere(width,height,now);
  const shade=c.createRadialGradient(width*.5,height*.45,height*.18,width*.5,height*.5,Math.max(width,height)*.68);
  shade.addColorStop(0,'#080e1900');shade.addColorStop(1,'#080e1970');c.fillStyle=shade;c.fillRect(0,0,width,height);
  if(now<(effects.hurtUntil||0)){c.fillStyle='#9e294b2b';c.fillRect(0,0,width,height);}
  this.drawMinimap(state,target);
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
