/* Original BLOODFALL field art. Shapes are drawn here, never extracted from another game. */
class GothicArt {
 constructor(context){this.c=context;}
 frame(x,y,scale,paint){const c=this.c;c.save();c.translate(x,y);c.scale(scale,scale);paint();c.restore();}
 poly(points,fill,stroke=null){const c=this.c;c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fillStyle=fill;c.fill();if(stroke){c.strokeStyle=stroke;c.lineWidth=.8;c.stroke();}}
 line(points,color,width=1){const c=this.c;c.beginPath();points.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.strokeStyle=color;c.lineWidth=width;c.stroke();}
 oval(x,y,rx,ry,color){const c=this.c;c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fillStyle=color;c.fill();}
 block(x,y,w,d,h,top='#555557',left='#37383e',right='#25272d'){
  this.poly([[x-w,y-h],[x,y+d-h],[x,y+d],[x-w,y]],left,'#1a1b20');
  this.poly([[x+w,y-h],[x,y+d-h],[x,y+d],[x+w,y]],right,'#191a20');
  this.poly([[x-w,y-h],[x,y-d-h],[x+w,y-h],[x,y+d-h]],top,'#76716a55');
 }
 glow(x,y,r,color){const c=this.c,g=c.createRadialGradient(x,y,1,x,y,r);g.addColorStop(0,color);g.addColorStop(1,'#d98d3d00');c.fillStyle=g;c.fillRect(x-r,y-r,r*2,r*2);}
 arch(x,y,w,h,fill){const c=this.c;c.beginPath();c.moveTo(x-w,y);c.lineTo(x-w,y-h*.65);c.quadraticCurveTo(x-w,y-h*.8,x,y-h);c.quadraticCurveTo(x+w,y-h*.8,x+w,y-h*.65);c.lineTo(x+w,y);c.closePath();c.fillStyle=fill;c.fill();}
 tree(x,y,scale,seed=0){this.frame(x,y,scale,()=>{
  this.oval(9,2,25,10,'#070b1099');
  const h=93+seed*24;
  this.poly([[-4,2],[5,0],[3,-h*.8],[-1,-h]],'#373536');
  if(seed>.5){
   for(let i=0;i<4;i++){
    const top=-h+i*20,half=17+i*6;
    this.poly([[0,top],[half,top+38],[half*.55,top+35],[half*.85,top+45],[0,top+36],[-half,top+43],[-half*.65,top+32]],['#2e3d3a','#263732','#21312f','#1d2c2c'][i],'#76817233');
    this.line([[0,top],[-half*.6,top+30],[-half,top+43]],'#7e85714d');
   }
  }else{
   this.line([[0,-25],[-13,-43],[-24,-45],[-34,-65]],'#474445',4);
   this.line([[-14,-44],[-16,-70],[-28,-85]],'#555052',2.5);
   this.line([[1,-49],[15,-66],[17,-91],[29,-103]],'#524c4d',3);
   this.line([[15,-66],[32,-73],[40,-89]],'#4a484b',2);
   this.line([[0,-78],[-10,-99],[-8,-116]],'#777063',1.3);
   this.line([[-24,-45],[-39,-44]],'#797161',1);
  }
 });}
 ruin(x,y,scale,seed=0){this.frame(x,y,scale,()=>{
  this.oval(9,3,33,12,'#090b1099');
  this.block(-6,0,25,13,18,'#625c56');
  this.poly([[-29,-12],[-29,-64],[-19,-71],[-12,-63],[-9,-80],[0,-73],[0,4]],'#444349','#79746b55');
  this.poly([[0,4],[0,-73],[14,-69],[17,-43],[29,-39],[29,-10]],'#2d3037','#64625e55');
  this.arch(-16,-18,6,30,'#151c25');
  this.line([[-27,-37],[-20,-34],[-11,-38]],'#8b82734d');
  this.block(28,9,9,4,8,'#696059');this.block(-25,14,7,4,6,'#777065');
  if(seed>.94){this.line([[10,-46],[10,-94]],'#8a8271',2);this.poly([[10,-91],[27,-80],[11,-68]],'#682d36');}
 });}
 refuge(x,y,scale){this.frame(x,y,scale,()=>{
  const c=this.c;
  this.oval(6,8,63,26,'#05080cb0');
  this.block(0,7,49,25,7,'#625e58','#48464a','#30333a');
  this.block(0,0,43,22,65,'#5a5254','#49464a','#34353e');
  for(let i=0;i<5;i++){
   const h=-8-i*11;
   this.line([[-42,h-11],[-1,h+10]],'#8c807344',.7);
   this.line([[1,h+10],[42,h-11]],'#77746c33',.7);
   for(let j=0;j<3;j++)this.line([[-36+j*13,h-8+j*6.5],[-36+j*13,h-15+j*6.5]],'#161d2588',.8);
  }
  this.poly([[-51,-63],[-7,-131],[49,-64],[0,-38]],'#3b3c48','#8e878066');
  this.poly([[-51,-63],[-7,-131],[-10,-74],[0,-38]],'#55505b','#a3927866');
  for(let i=1;i<5;i++)this.line([[-7+i*9,-131+i*11],[i*9,-65+i*4]],'#79707844');
  this.line([[-7,-131],[-7,-149]],'#bbb09a',1.8);this.poly([[-7,-154],[-3,-147],[-7,-141],[-11,-147]],'#bda887');
  this.arch(-20,-8,10,41,'#141c27');this.arch(-20,-10,6,31,'#bd7d46');
  this.line([[-20,-41],[-20,-11]],'#3a2d31',2);this.line([[-27,-23],[-13,-23]],'#3a2d31',2);
  this.arch(23,-12,5,27,'#c69253');this.line([[23,-37],[23,-12]],'#43333a',1.5);
  this.glow(-20,-23,48,'#e5aa4d36');this.glow(23,-22,32,'#e2a25a25');
  this.block(29,-23,5,3,56,'#82786b');
  this.line([[54,6],[54,-78]],'#6e6b64',3);this.line([[53,-77],[67,-84]],'#948677',2);
  this.poly([[58,-76],[64,-79],[68,-70],[64,-59],[58,-62]],'#322c2e','#ae987c');
  c.fillStyle='#f4c481';c.fillRect(60,-72,5,9);this.glow(62,-68,30,'#e8b26944');
 });}
 lantern(x,y,scale){this.frame(x,y,scale,()=>{
  this.block(0,0,4,2,5,'#77746a');this.line([[0,0],[0,-70]],'#77716c',2.5);this.line([[0,-68],[8,-75],[14,-71]],'#8d8172',1.5);
  this.poly([[9,-70],[19,-70],[17,-53],[11,-53]],'#252830','#a8977d');
  this.poly([[12,-66],[16,-66],[15,-57],[12,-57]],'#ebba72');this.glow(14,-61,33,'#dca25435');
 });}
 facility(x,y,scale,id){this.frame(x,y,scale,()=>{
  const c=this.c;
  this.block(0,0,20,11,20,{kitchen:'#756654',alchemy:'#605565',medical:'#667076',storage:'#645b50'}[id]);
  if(id==='kitchen'){
   this.block(-10,-4,7,4,39,'#565661');this.oval(5,-15,10,5,'#191e26');this.oval(5,-17,7,3,'#c58242');this.glow(5,-16,23,'#d5933444');
   this.line([[0,-28],[-3,-34],[0,-40]],'#a5a8a055',1);this.line([[7,-29],[10,-36],[7,-43]],'#a5a8a055',1);
  }else if(id==='alchemy'){
   this.line([[-4,-22],[-4,-40]],'#a9a39b',2);this.oval(-4,-28,6,9,'#a74759');this.oval(-4,-34,3,3,'#d989a3');
   this.line([[9,-22],[9,-36]],'#8d969c',2);this.oval(9,-27,4,6,'#718e96');this.glow(-3,-30,24,'#982e4c33');
  }else if(id==='medical'){
   c.fillStyle='#d6c7b2';c.fillRect(-3,-23,6,15);c.fillRect(-8,-18,16,5);this.line([[-17,-21],[-17,-41],[4,-51]],'#96958b',1.5);
  }else{
   this.block(-8,-3,9,5,35,'#7d6a52');this.line([[-14,-34],[-2,-28],[-2,-7]],'#b19b72',1);this.block(12,0,10,5,25,'#82745d');
  }
 });}
 character(x,y,scale,species,moving,now,{enemy=false,npc=false,mounted=false,tier=0}={}){this.frame(x,y,scale,()=>{
  const c=this.c,step=moving&&!mounted?Math.sin(now/90)*3:0,vampire=species==='vampire';
  this.oval(4,2,17,7,'#06080dc0');
  if(enemy){
   this.poly([[-8,-38],[4,-35],[11,-9],[-4,-5],[-11,-16]],'#3e4548','#747668');
   this.line([[-6,-9],[-9,2]],'#292b34',5);this.line([[5,-8],[9,3]],'#2d3037',5);
   this.line([[-9,-32],[-17,-20],[-14,-12]],'#768277',4);this.line([[7,-29],[15,-21],[17,-13]],'#6b786c',3);
   this.oval(-2,-43,7,9,'#95958a');this.line([[-7,-44],[-3,-45]],'#cf615c',1.5);this.line([[0,-45],[4,-43]],'#cf615c',1.5);
   this.poly([[-8,-48],[-3,-55],[5,-49],[3,-46],[-4,-49]],'#33343a');return;
  }
  if(mounted&&vampire){
   const flap=Math.sin(now/130)*8;
   this.poly([[0,-24],[-18,-31],[-43,-43-flap],[-27,-14],[-14,-22],[0,-15],[14,-22],[27,-14],[43,-43-flap],[18,-31]],'#5e344b','#aa7a8a');
   this.line([[0,-24],[-18,-31],[-43,-43-flap]],'#c6a2a9',1);this.line([[0,-24],[18,-31],[43,-43-flap]],'#c6a2a9',1);this.oval(0,-23,5,10,'#232031');return;
  }
  if(mounted){
   this.block(0,0,tier===2?34:25,tier===2?15:9,15,'#444a4e','#2b323c','#1c2430');
   this.oval(-23,4,7,9,'#131820');this.oval(23,4,7,9,'#131820');this.line([[-6,-18],[12,-24],[18,-16]],'#a5a6a3',2);this.glow(27,-8,24,'#d1c9a222');
  }
  this.line([[-5,-12],[-7,-1+step]],'#1b202b',6);this.line([[5,-12],[7,-1-step]],'#151d29',6);
  this.poly([[-9,-39],[8,-39],[14,-5],[4,-9],[-2,-3],[-14,-8]],vampire?'#3d2637':'#313a43','#95948977');
  if(vampire)this.poly([[5,-38],[15,-28],[20+step,-4],[10,-9],[5,-17]],'#792c45','#a4556266');
  this.poly([[-10,-38],[0,-32],[9,-38],[4,-24],[-4,-24]],vampire?'#8b697b':'#7d8079');
  this.line([[-10,-34],[-14,-18]],vampire?'#423241':'#3a4248',6);this.line([[9,-34],[15,-20]],'#35333d',5);
  this.oval(-14,-17,3,4,'#bbb3a2');this.oval(15,-19,3,4,'#c0b9ac');
  this.oval(0,-46,6,8,vampire?'#d0c9c4':'#bbae98');
  this.poly([[-7,-47],[-7,-53],[-2,-57],[6,-53],[8,-45],[4,-47],[1,-52],[-4,-49]],'#141b25');
  if(vampire){this.line([[-4,-45],[-1,-45]],'#c8848c',1);this.line([[2,-45],[4,-45]],'#c8848c',1);}
  else {this.line([[-7,-32],[9,-18]],'#aa9578',2);this.block(-12,-21,4,2,9,'#5a5148');}
  this.line([[-8,-21],[9,-21]],'#8f8674',1.5);
  if(!npc){this.line([[14,-22],[22,-3]],'#b9b7a8',2);this.line([[13,-20],[18,-22]],'#c6af82',2);}
  else {this.oval(14,-15,3,4,'#d9b778');this.glow(14,-15,20,'#e0ae6922');}
 });}
 sky(width,height,now){
  const c=this.c,g=c.createLinearGradient(0,0,0,height);g.addColorStop(0,'#11131e');g.addColorStop(.6,'#1c2430');g.addColorStop(1,'#18212b');c.fillStyle=g;c.fillRect(0,0,width,height);
  c.save();c.globalAlpha=.24;
  for(let i=0;i<18;i++){
   const x=i*width/16-60,h=65+(i*43)%110,y=height*.32;
   c.fillStyle='#080d17';c.fillRect(x,y-h,55,h+140);
   this.poly([[x-5,y-h],[x+27,y-h-28],[x+60,y-h]],'#0a101b');
   if(i%3===0){c.fillRect(x+21,y-h-48,10,34);this.poly([[x+18,y-h-48],[x+26,y-h-79],[x+34,y-h-48]],'#0a101b');}
  }
  c.restore();
 }
 atmosphere(width,height,now){
  const c=this.c;c.save();
  for(let i=0;i<3;i++){
   const x=width*(.15+i*.38)+Math.sin(now/16000+i)*30,y=height*(.32+i*.22);
   const fog=c.createRadialGradient(x,y,2,x,y,width*.45);fog.addColorStop(0,'#9dabb209');fog.addColorStop(1,'#9dabb200');c.fillStyle=fog;c.fillRect(0,0,width,height);
  }
  c.restore();
 }
}
