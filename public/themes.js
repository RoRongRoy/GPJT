/* Original cached isometric illustrations. No third-party artwork. */
class FactionArt {
 constructor(context){this.c=context;this.cache=new Map();}
 draw(x,y,scale,kind,faction='human',variant=0){
  const dark=faction==='vampire',key=[kind,dark,variant%4].join(':');
  if(!this.cache.has(key)){
   const canvas=document.createElement('canvas');canvas.width=340;canvas.height=360;
   const c=canvas.getContext('2d');c.translate(170,304);this.paint(c,kind,dark,variant%4);
   c.setTransform(1,0,0,1,0,0);c.globalCompositeOperation='source-atop';
   for(let i=0;i<6500;i++){const n=Math.sin(i*127.1+variant*17)*43758.5453,f=n-Math.floor(n),x=(i*73)%340,y=(i*137+Math.floor(f*37))%360;c.fillStyle=f>.5?'#c7b99b22':'#0c101c33';c.fillRect(x,y,1+f*2,1+f);}
   const shade=c.createLinearGradient(0,0,260,360);shade.addColorStop(0,'#b8b8a01a');shade.addColorStop(.5,'#1b202b00');shade.addColorStop(1,'#070a1644');c.fillStyle=shade;c.fillRect(0,0,340,360);c.globalCompositeOperation='source-over';
   this.cache.set(key,canvas);
  }
  this.c.drawImage(this.cache.get(key),x-170*scale,y-304*scale,340*scale,360*scale);
 }
 paint(c,kind,dark,v){
  const stone=dark?'#514653':'#687064',trim=dark?'#aa637a':'#aa9d74',glow=dark?'#d5446a':'#d9b86b';
  const poly=(p,color,stroke='#17191c')=>{c.beginPath();p.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.closePath();c.fillStyle=color;c.fill();c.save();c.clip();const top=Math.min(...p.map(n=>n[1])),bottom=Math.max(...p.map(n=>n[1]));if(bottom>top){const g=c.createLinearGradient(-60,top,70,bottom);g.addColorStop(0,'#e2d6b31a');g.addColorStop(1,'#040b2044');c.fillStyle=g;c.fill();}c.restore();c.strokeStyle=stroke;c.lineWidth=1.2;c.stroke();};
  const line=(p,color='#a1967e',width=1)=>{c.beginPath();p.forEach(([x,y],i)=>i?c.lineTo(x,y):c.moveTo(x,y));c.strokeStyle=color;c.lineWidth=width;c.stroke();};
  const ellipse=(x,y,rx,ry,color)=>{c.beginPath();c.ellipse(x,y,rx,ry,0,0,Math.PI*2);c.fillStyle=color;c.fill();};
  const box=(x,y,w,d,h,col=stone)=>{
   poly([[x-w,y],[x,y+d],[x,y+d-h],[x-w,y-h]],col);
   poly([[x,y+d],[x+w,y],[x+w,y-h],[x,y+d-h]],dark?'#302b38':'#3d4540');
   poly([[x-w,y-h],[x,y-d-h],[x+w,y-h],[x,y+d-h]],dark?'#75606e':'#828674');
  };
  const window=(x,y)=>{poly([[x-6,y],[x-6,y-20],[x,y-28],[x+6,y-20],[x+6,y]],'#171722');line([[x,y-24],[x,y-2]],glow,2);};
  const bat=(x,y)=>{poly([[x,y],[x-18,y-9],[x-11,y+2],[x-5,y],[x,y+5],[x+6,y],[x+12,y+2],[x+19,y-9]],'#1b1822',trim);};
  const drum=(x,y)=>{ellipse(x,y+10,14,6,'#151719');c.fillStyle=v%2?'#62604a':'#674d45';c.fillRect(x-14,y-29,28,39);ellipse(x,y-29,14,6,'#88816b');ellipse(x,y+10,14,6,'#4c4942');line([[x-14,y-18],[x+14,y-18]],'#292e2a',3);line([[x-14,y+1],[x+14,y+1]],'#292e2a',3);};
  ellipse(0,4,kind==='wire'||kind==='wall'?83:100,25,'#0b101555');
  if(kind==='wire'){
   for(const x of [-76,0,76]){line([[x,7],[x,-65],[x+9,-77]],'#66716b',5);ellipse(x,8,8,3,'#313b36');}
   for(let y=-55;y<5;y+=12)line([[-76,y],[76,y]],'#8d95816e');
   for(let x=-76;x<76;x+=12){line([[x,0],[Math.min(76,x+40),-60]],'#90978899');line([[x,-60],[Math.min(76,x+40),0]],'#69776b99');}
   line([[-76,-72],[76,-72]],'#ada88f',1.5);
   for(let x=-72;x<=72;x+=12){line([[x-3,-78],[x+3,-67]],'#a4a18d');line([[x-3,-67],[x+3,-78]],'#a4a18d');}return;
  }
  if(kind==='drums'){drum(-22,-3);drum(12,-14);drum(26,12);return;}
  if(kind==='supply'){
   box(-25,0,35,15,33,'#6b634d');box(30,10,29,14,25,'#776b4e');box(-20,-28,24,12,27,'#535d4c');
   for(const x of [-47,-18,13,40])line([[x,-17],[x,16]],'#b3a17b',3);
   poly([[-50,-35],[-20,-52],[7,-35],[-20,-17]],'#4e584b');line([[-20,-50],[-20,-20]],'#777f5c',2);return;
  }
  if(kind==='truck'){
   for(const x of [-55,42]){ellipse(x,13,16,21,'#171c20');ellipse(x+6,13,7,10,'#5b5d52');}
   box(0,-4,84,28,32,'#445444');box(-28,-33,55,24,46,'#485943');box(53,-25,30,22,55,'#59644a');
   poly([[43,-76],[74,-65],[74,-43],[43,-53]],'#25383c');line([[-75,-54],[10,-54]],'#8a8d6c',2);
   ellipse(71,-21,5,4,'#e2c779');ellipse(38,-9,5,4,'#e2c779');return;
  }
  if(kind==='tent'){
   poly([[-92,0],[-12,-44],[86,-5],[8,40]],'#313a32');
   poly([[-80,-7],[-24,-113],[17,-23],[2,25]],'#56624a');
   poly([[-24,-113],[70,-70],[91,0],[17,-23]],'#738062');
   poly([[-65,-5],[-23,-92],[5,16]],'#232e2b');poly([[-65,-5],[-23,-92],[-38,5]],'#697454');
   for(let i=0;i<4;i++)line([[-11+i*23,-105+i*11],[28+i*19,-18+i*5]],'#90977b',1.4);
   line([[-24,-114],[-108,16]],'#9b987e',1.2);line([[70,-70],[112,27]],'#9b987e',1.2);
   line([[-108,8],[-108,24]],'#605d4d',3);line([[112,19],[112,34]],'#605d4d',3);
   if(v===1){c.fillStyle='#d8d7bf';c.fillRect(35,-61,22,7);c.fillRect(42,-68,7,22);}return;
  }
  if(kind==='grave'){
   box(0,8,43,19,9,'#55535a');box(0,-8,19,9,55,'#6b6570');
   poly([[-19,-63],[0,-79],[19,-63],[0,-54]],'#8b7b85');line([[-10,-48],[10,-40]],'#302c39',3);line([[0,-58],[0,-25]],'#302c39',3);return;
  }
  if(kind==='cave'){
   poly([[-112,14],[-98,-52],[-53,-112],[-6,-134],[68,-104],[112,-38],[99,16],[7,47]],'#49404e');
   poly([[-68,9],[-56,-49],[-15,-84],[33,-65],[58,-17],[51,28],[0,41]],'#11141d');
   for(const [x,y] of [[-87,-44],[-45,-101],[51,-88],[91,-26]])line([[x-14,y+15],[x,y],[x+17,y+4]],'#82717e',3);
   bat(-59,-130);bat(8,-163);bat(70,-137);return;
  }
  if(kind==='wall'){
   box(0,7,85,24,63);
   for(let y=-53;y<7;y+=15)line([[-82,y],[0,y+24],[82,y]],'#92818a55');
   for(let x=-70;x<80;x+=28)box(x,-Math.abs(x)*.05-53,12,8,18);
   return;
  }
  if(kind==='tower'){
   box(0,0,40,24,145);for(let y=-130;y<-10;y+=20)line([[-39,y],[0,y+24],[39,y]],'#a99c8a44');
   poly([[-52,-146],[0,-244],[52,-146],[0,-117]],dark?'#342b45':'#505d43');
   line([[0,-244],[0,-270]],trim,3);window(19,-55);window(-17,-83);
   if(dark)bat(67,-204);else{box(0,-146,46,28,20);line([[-42,-160],[42,-160]],'#bab79b',2);}return;
  }
  if(kind==='radio'){
   box(0,0,40,22,35,'#45554c');line([[0,-24],[0,-174]],'#8c9990',4);line([[-37,-129],[37,-129]],'#87978c',3);
   for(let i=0;i<4;i++)line([[-27+i*18,-144],[-27+i*18,-113]],'#adad90',2);return;
  }
  // Castles, crypts and fortified field headquarters share a masonry foundation.
  box(0,10,94,43,18);box(0,-8,75,35,96);
  for(let y=-96;y<-8;y+=17)line([[-74,y],[0,y+35],[74,y]],'#a3958b44');
  if(dark){
   poly([[-86,-106],[0,-190],[86,-106],[0,-61]],'#342c44');
   for(const x of [-64,64]){box(x,-22,21,12,128);poly([[x-28,-150],[x,-222],[x+28,-150],[x,-135]],'#392d46');window(x,-66);}
   window(-26,-42);window(30,-52);
   poly([[-17,24],[-17,-26],[0,-48],[17,-26],[17,24]],'#17151f');line([[0,-39],[0,20]],trim,2);
   if(kind==='keep'){box(0,-101,27,17,106);poly([[-34,-207],[0,-285],[34,-207],[0,-186]],'#3d2b48');window(0,-140);}
   else if(kind==='crypt'){line([[-10,-164],[10,-164]],trim,4);line([[0,-181],[0,-142]],trim,4);}
   bat(-102,-161);bat(102,-176);
  }else{
   box(0,-104,83,39,13,'#5b6354');box(0,-118,40,21,33,'#515e4f');
   for(const x of [-49,-18,18,49]){poly([[x-9,-42],[x-9,-65],[x+9,-58],[x+9,-35]],'#253431');line([[x,-62],[x,-39]],'#a8aa8c',2);}
   poly([[-17,24],[-17,-31],[17,-19],[17,24]],'#202b28');
   line([[74,-113],[74,-189]],'#a09e7d',3);poly([[74,-188],[118,-175],[74,-163]],'#7a8d77');
   drum(-98,14);box(91,5,23,12,26,'#777255');
  }
 }
}
