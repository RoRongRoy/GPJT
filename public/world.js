/* Original procedural field artwork. No external images, fonts, or game assets. */
class WorldView {
 constructor(canvas, minimap) {
  this.canvas=canvas; this.ctx=canvas.getContext('2d'); this.minimap=minimap;
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
  c.fillStyle='#131f23';c.fillRect(0,0,width,height);
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
  const palettes={outskirts:['#526348','#58694d','#5a6b50','#53654b'],forest:['#304f43','#355346','#395749','#3c5948'],marsh:['#426562','#466b65','#4d7068','#496963'],works:['#686458','#706a5c','#666255','#726c60']};
  const scenery=[];
  for(let y=minY;y<=maxY;y++)for(let x=minX;x<=maxX;x++){
   const region=this.region(state,x,y).id,n=this.noise(x,y),road=[10,32,50].includes(x)||[10,32,50].includes(y);
   tile(x,y,road?(n>.5?'#8d8871':'#88846d'):palettes[region][Math.floor(n*4)]);
   const [sx,sy]=project(x,y);
   if(road){
    if((x+y)%3===0){c.fillStyle='#d3bf8d80';c.fillRect(sx-3*scale,sy,6*scale,2*scale);}
    c.fillStyle='#3c473a50';c.fillRect(sx+9*scale,sy+2*scale,3*scale,scale);
   }else{
    // Ground details remain decorative; travel is intentionally unobstructed.
    if(region==='marsh'&&n>.73&&!nearLandmark(x,y)){
     ellipse(sx,sy,22,9,'#34585b');ellipse(sx+3*scale,sy,14,4,'#6d9b923d');
    }else{
     c.strokeStyle=region==='works'?'#aea18a44':'#b6bf8344';c.lineWidth=scale;
     c.beginPath();c.moveTo(sx-7*scale,sy+2*scale);c.lineTo(sx-9*scale,sy-3*scale);c.moveTo(sx-6*scale,sy+2*scale);c.lineTo(sx-4*scale,sy-2*scale);c.stroke();
    }
    if(!nearLandmark(x,y)&&n>(region==='forest'?.72:.89))scenery.push({x,y,type:region==='works'?'ruin':region==='marsh'?'reed':'tree',seed:n});
   }
  }
  for(let x=-2;x<=2;x++)for(let y=-2;y<=2;y++)tile(w.base.x+x,w.base.y+y,(x+y)%2?'#8a8461':'#85825f');
  if(target){
   const [tx,ty]=project(target.x,target.y),[px,py]=project(this.player.x,this.player.y);
   c.setLineDash([3,9]);c.strokeStyle='#ead3a488';c.lineWidth=1.5;c.beginPath();c.moveTo(px,py);c.lineTo(tx,ty);c.stroke();c.setLineDash([]);
   c.strokeStyle='#f2d39b';c.beginPath();c.ellipse(tx,ty,15*scale,7*scale,0,0,Math.PI*2);c.stroke();
  }
  const offsets={kitchen:[-1,-1],alchemy:[1,-1],medical:[-1,1],storage:[1,1]};
  const facilities=Object.entries(w.base.facilities).filter(([,level])=>level).map(([id,level])=>({x:w.base.x+offsets[id][0],y:w.base.y+offsets[id][1],id,level,type:'facility'}));
  const entities=[...scenery,...state.pois.map(n=>({...n,type:'poi'})),{...w.base,type:'base'},...facilities,...w.enemies.filter(e=>e.hp>0).map(e=>({...e,type:'enemy'})),{...p,...this.player,type:'player'}].filter(e=>visible(e.x,e.y)).sort((a,b)=>a.x+a.y-b.x-b.y);
  this.points=[];const labels=[];
  const tree=(x,y,seed=0)=>{
   const [sx,sy]=project(x,y),h=(72+seed*25)*scale;
   ellipse(sx+12*scale,sy+3*scale,23,10,'#182d2850');
   c.fillStyle='#655440';c.fillRect(sx-3*scale,sy-h*.55,6*scale,h*.55);
   for(let j=0;j<3;j++){
    const top=sy-h+j*16*scale,half=(22+j*5)*scale;
    poly([[sx,top],[sx+half,top+39*scale],[sx,top+32*scale],[sx-half,top+39*scale]],['#58745b','#486a52','#385b49'][j]);
    poly([[sx,top],[sx,top+32*scale],[sx-half,top+39*scale]],['#78916a','#64815c','#527453'][j]);
   }
  };
  for(const e of entities){
   const [sx,sy]=project(e.x,e.y),near=Math.hypot(p.x-e.x,p.y-e.y);
   const [px,py]=project(this.player.x,this.player.y);
   const occludes=['tree','base','poi','facility','ruin'].includes(e.type)&&Math.abs(px-sx)<36*scale&&py<=sy+5*scale&&py>sy-85*scale;
   c.globalAlpha=occludes?.42:1;
   if(e.type==='tree'){tree(e.x,e.y,e.seed);c.globalAlpha=1;continue;}
   if(e.type==='reed'){
    c.strokeStyle='#b2b687';c.lineWidth=2*scale;
    for(let j=0;j<5;j++){c.beginPath();c.moveTo(sx+(j-2)*5*scale,sy);c.lineTo(sx+(j-3)*6*scale,sy-(18+j%3*5)*scale);c.stroke();}continue;
   }
   if(e.type==='ruin'){box(e.x,e.y,15,'#8e8272',.75);box(e.x+.1,e.y-.2,28,'#9f917d',.4);continue;}
   ellipse(sx+4*scale,sy+3*scale,18,8,'#152c2955');
   if(e.type==='base'){
    // Canvas shelter: canvas roof, timber frame, warm doorway and a signal flag.
    box(e.x,e.y,34,'#b8aa7c',1.1);
    poly([[sx-39*scale,sy-33*scale],[sx-5*scale,sy-78*scale],[sx+39*scale,sy-33*scale]],'#cfbd86');
    poly([[sx-5*scale,sy-78*scale],[sx+39*scale,sy-33*scale],[sx+19*scale,sy-18*scale]],'#8b815c');
    c.fillStyle='#203632';c.fillRect(sx-8*scale,sy-28*scale,16*scale,29*scale);
    c.fillStyle='#f4c17e';c.fillRect(sx+15*scale,sy-25*scale,8*scale,9*scale);
    c.strokeStyle='#d6c7a0';c.lineWidth=2*scale;c.beginPath();c.moveTo(sx+42*scale,sy);c.lineTo(sx+42*scale,sy-89*scale);c.stroke();
    poly([[sx+43*scale,sy-88*scale],[sx+67*scale,sy-82*scale],[sx+43*scale,sy-70*scale]],'#ce7956');
    const glow=c.createRadialGradient(sx+19*scale,sy-20*scale,2,sx+19*scale,sy-20*scale,46*scale);glow.addColorStop(0,'#ffc87930');glow.addColorStop(1,'#ffc87900');c.fillStyle=glow;c.fillRect(sx-30*scale,sy-65*scale,100*scale,100*scale);
    labels.push(['아지트',sx,sy-101*scale,'#ffe0a3']);this.points.push({x:sx,y:sy-25*scale,id:'base',left:sx-44*scale,right:sx+44*scale,top:sy-108*scale,bottom:sy+12*scale});
   }
   if(e.type==='facility'){
    box(e.x,e.y,23,{kitchen:'#c49768',alchemy:'#9c86ae',medical:'#99b9a2',storage:'#bdac7b'}[e.id],.62);
    c.fillStyle='#f0e2be';c.textAlign='center';c.font=`bold ${17*scale}px system-ui`;c.fillText({kitchen:'♨',alchemy:'⚗',medical:'+',storage:'▤'}[e.id],sx,sy-21*scale);
   }
   if(e.type==='poi'){
    if(e.kind==='wood'){tree(e.x-.25,e.y,.4);tree(e.x+.35,e.y+.3,.1);}
    if(e.kind==='water'){
     box(e.x,e.y,15,'#b5b39a');ellipse(sx,sy-15*scale,17,8,'#2c5962');ellipse(sx,sy-16*scale,11,4,'#8eb6ad');
     c.fillStyle='#746a50';c.fillRect(sx-21*scale,sy-48*scale,3*scale,43*scale);c.fillRect(sx+18*scale,sy-48*scale,3*scale,43*scale);
     poly([[sx-27*scale,sy-48*scale],[sx,sy-61*scale],[sx+27*scale,sy-48*scale],[sx,sy-37*scale]],'#8d9b79');
    }
    if(['crop','herb'].includes(e.kind)){
     tile(e.x,e.y,'#736348');
     for(let j=0;j<9;j++){
      const [gx,gy]=project(e.x+(j%3-1)*.37,e.y+(Math.floor(j/3)-1)*.37);
      c.strokeStyle='#b9c27c';c.lineWidth=2*scale;c.beginPath();c.moveTo(gx,gy);c.lineTo(gx,gy-16*scale);c.stroke();
      ellipse(gx-3*scale,gy-9*scale,4,2,'#8da466');ellipse(gx+3*scale,gy-13*scale,4,2,e.kind==='herb'?'#c3a6b4':'#dbc58a');
     }
    }
    if(e.kind==='metal'){
     box(e.x,e.y,19,'#ae7757',.95);box(e.x-.25,e.y-.2,34,'#96a29a',.5);
     c.fillStyle='#2b4749';c.fillRect(sx-4*scale,sy-33*scale,12*scale,8*scale);ellipse(sx-18*scale,sy+4*scale,6,7,'#283a37');ellipse(sx+18*scale,sy+4*scale,6,7,'#283a37');
    }
    if(e.kind==='blood'){
     box(e.x,e.y,35,'#9a7573',.8);c.fillStyle='#ead2b0';c.fillRect(sx-3*scale,sy-31*scale,6*scale,18*scale);c.fillRect(sx-9*scale,sy-25*scale,18*scale,6*scale);
    }
    if(e.kind==='npc'){
     box(e.x+.35,e.y+.3,17,'#b5a175',.85);
     c.fillStyle=e.id.includes('vampire')||e.id.includes('ferryman')?'#9d83ab':'#cfa76e';c.fillRect(sx-6*scale,sy-32*scale,12*scale,26*scale);ellipse(sx,sy-38*scale,7,8,'#d5bd95');
     poly([[sx-10*scale,sy-42*scale],[sx,sy-51*scale],[sx+10*scale,sy-42*scale]],'#717c61');
    }
    const focus=e.id===selected||near<2.5;
    if(focus){c.strokeStyle='#e9d29a';c.lineWidth=1.5;c.beginPath();c.ellipse(sx,sy,28*scale,14*scale,0,0,Math.PI*2);c.stroke();}
    if(focus||near<7)labels.push([e.label,sx,sy-(e.kind==='wood'?107:70)*scale,focus?'#ffe5aa':'#e0e4d2']);
    const halfWidth=Math.max(30*scale,e.label.length*5.5);
    this.points.push({x:sx,y:sy-22*scale,id:e.id,left:sx-halfWidth,right:sx+halfWidth,top:sy-(e.kind==='wood'?112:76)*scale,bottom:sy+12*scale});
   }
   if(e.type==='enemy'){
    const sway=Math.sin(now/220+e.id)*2*scale;
    c.fillStyle='#886e60';c.fillRect(sx-7*scale,sy-26*scale,14*scale,23*scale);c.fillStyle='#b0b08c';ellipse(sx+sway,sy-33*scale,6,7,'#a8aa86');
    c.fillStyle='#f0a477';c.fillRect(sx-4*scale,sy-35*scale,3*scale,2*scale);c.fillRect(sx+2*scale,sy-35*scale,3*scale,2*scale);
    c.fillStyle='#263a34';c.fillRect(sx-16*scale,sy-48*scale,32*scale,4*scale);c.fillStyle='#dd8d6f';c.fillRect(sx-16*scale,sy-48*scale,32*scale*Math.max(0,e.hp)/60,4*scale);
    this.points.push({x:sx,y:sy-18*scale,id:'enemy:'+e.id,left:sx-20*scale,right:sx+20*scale,top:sy-51*scale,bottom:sy+10*scale});
   }
   if(e.type==='player'){
    const stride=moving&&!w.paused?Math.sin(now/85)*4*scale:0;
    c.strokeStyle='#f0deb0';c.lineWidth=1.5;c.beginPath();c.ellipse(sx,sy+2*scale,14*scale,7*scale,0,0,Math.PI*2);c.stroke();
    if(p.mounted&&p.species==='vampire'){
     const flap=Math.sin(now/130)*8*scale;poly([[sx-39*scale,sy-36*scale-flap],[sx-20*scale,sy-13*scale],[sx,sy-21*scale],[sx+20*scale,sy-13*scale],[sx+39*scale,sy-36*scale-flap],[sx,sy-30*scale]],'#c3a5c8');
    }else{
     if(p.mounted){box(e.x,e.y,14,'#8c9d89',p.unlocks.human===2?1.1:.75);ellipse(sx-22*scale,sy+2*scale,7,8,'#263632');ellipse(sx+22*scale,sy+2*scale,7,8,'#263632');}
     c.fillStyle='#243b3c';c.fillRect(sx-7*scale,sy-12*scale+stride,5*scale,13*scale);c.fillRect(sx+2*scale,sy-12*scale-stride,5*scale,13*scale);
     poly([[sx-9*scale,sy-32*scale],[sx+8*scale,sy-32*scale],[sx+12*scale,sy-9*scale],[sx-11*scale,sy-9*scale]],p.species==='human'?'#d5aa6d':'#ae8fac');
     c.fillStyle='#6a8275';c.fillRect(sx-12*scale,sy-29*scale,7*scale,16*scale);ellipse(sx,sy-38*scale,7,8,'#ecd0a3');
     ellipse(sx,sy-43*scale,11,4,p.species==='human'?'#6b7961':'#77667f');
     c.fillStyle='#e6a577';c.fillRect(sx-6*scale,sy-32*scale,16*scale,4*scale);
    }
    if(now<(effects.attackUntil||0)){c.strokeStyle='#ffe3a3';c.lineWidth=4*scale;c.beginPath();c.arc(sx,sy-18*scale,38*scale,-1.2,1.1);c.stroke();}
   }
  }
  c.globalAlpha=1;
  for(const args of labels)label(...args);
  const shade=c.createRadialGradient(width*.5,height*.45,height*.18,width*.5,height*.5,Math.max(width,height)*.68);
  shade.addColorStop(0,'#0d202600');shade.addColorStop(1,'#0d202677');c.fillStyle=shade;c.fillRect(0,0,width,height);
  if(now<(effects.hurtUntil||0)){c.fillStyle='#cf654322';c.fillRect(0,0,width,height);}
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
