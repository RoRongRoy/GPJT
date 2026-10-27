/* Articulated hero renderer. Players are drawn from joints (hips, knees, feet, shoulders,
   elbows, hands) driven by a continuous gait phase, so legs and arms really step instead of
   a picture sliding across the map. Appearance depends on species, gender and job. */
const HERO_LEG=21.5;
const HERO_STYLE={
 human:{
  skin:'#c9a98a',skinShade:'#a88a6c',hair:['#2a211c','#3b2a22'],
  coat:{warrior:['#3d4650','#2a323a','#1c2229'],ranged:['#2f4455','#223340','#17242e']},
  trim:'#8c7a58',boot:'#2a211c',bootHi:'#4a3a2c',pants:'#232a32',cape:'#5a6240',capeDark:'#3f4730',
  eye:'#241c18',
 },
 vampire:{
  skin:'#d8d0cd',skinShade:'#b4a9a8',hair:['#16121a','#1d1020'],
  coat:{warrior:['#2b232b','#1c161c','#120e13'],ranged:['#3a1a30','#28111f','#1a0b14']},
  trim:'#b02a4a',boot:'#16121a',bootHi:'#3a2a34',pants:'#16121a',cape:'#7a1830',capeDark:'#4e0f20',
  eye:'#ff2e55',
 },
};
// World-forward vector per sprite row, projected like the isometric map (tw 34 : th 17).
const HERO_FORWARD=[[1,0],[0,1],[-1,0],[0,-1]];
function heroScreen(wx,wy){return [(wx-wy)*.894,(wx+wy)*.447];}
function heroIK(hip,foot,bendDir,len=HERO_LEG){
 let dx=foot[0]-hip[0],dy=foot[1]-hip[1],d=Math.hypot(dx,dy);
 const max=len*2-.05;if(d>max){dx*=max/d;dy*=max/d;d=max;foot=[hip[0]+dx,hip[1]+dy];}
 if(d<1e-6)d=1e-6;
 const h=Math.sqrt(Math.max(0,len*len-d*d/4)),nx=-dy/d,ny=dx/d;
 const side=(nx*bendDir[0]+ny*bendDir[1])>=0?1:-1;
 return [hip[0]+dx/2+nx*h*side,hip[1]+dy/2+ny*h*side,foot];
}
class HeroArt {
 static draw(art,x,y,scale,species,now,options={}){
  const pose=options.pose||{row:0,frame:0},row=Math.max(0,Math.min(3,pose.row|0));
  const vamp=species==='vampire',female=options.gender==='female',ranged=options.job==='ranged';
  const style=HERO_STYLE[vamp?'vampire':'human'],palette=style.coat[ranged?'ranged':'warrior'];
  const [fa,fb]=HERO_FORWARD[row],f=heroScreen(fa,fb),l=heroScreen(-fb,fa);
  const front=row<=1,dirX=f[0]>=0?1:-1;
  const combat=pose.phase===undefined; // combat poses carry a strike frame instead of a gait phase
  const amp=Math.max(0,Math.min(1,pose.amp||0));
  const run=Boolean(options.sprint),phase=pose.phase||0;
  const A=amp*(run?1.35:1),stepLen=(run?15:10.5)*A,lift=(run?11:6)*amp;
  const bob=Math.cos(phase)**2*(run?3.4:1.7)*amp+Math.sin(now/900)*.35*(1-amp);
  const lean=(run?.2:.05)*amp,swayT=Math.sin(phase)*.03*amp;
  const attack=combat?(pose.frame||0):-1;
  art.frame(x,y,scale,()=>{
   const c=art.c;c.save();c.lineCap='round';c.lineJoin='round';
   const hipY=-40-bob,shY=hipY-26,hipC=[0,hipY];
   const fwd=(v,k)=>[v[0]*k,v[1]*k];
   // Leg targets: opposite legs swing a half-cycle apart; the swinging foot is lifted.
   const legs=[1,-1].map((s)=>{
    const ph=phase+(s>0?0:Math.PI),sw=Math.sin(ph)*stepLen,up=Math.max(0,Math.cos(ph))*lift;
    const hip=[l[0]*3.6*s,hipY+l[1]*3.6*s+(s>0?0:0)];
    const foot=[l[0]*3.6*s+f[0]*sw,l[1]*3.6*s+f[1]*sw-up];
    const [kx,ky,ft]=heroIK(hip,foot,f);
    return {s,hip,knee:[kx,ky],foot:ft,depth:foot[1]+ (s>0?.01:0),toe:f};
   }).sort((a,b)=>a.depth-b.depth);
   const limb=(pts,w,col,edge)=>{
    art.line(pts,edge,w+1.8);art.line(pts,col,w);
   };
   const drawLeg=(L)=>{
    limb([L.hip,L.knee,L.foot],7,style.pants,'#0b0d12');
    // boot: from ankle toward the walking direction
    const bx=L.foot[0],by=L.foot[1];
    art.poly([[bx-2.8*dirX*0+l[0]*-2.6,by-6+l[1]*-2.6],[bx+l[0]*2.6,by-6+l[1]*2.6],[bx+f[0]*4.4+l[0]*2.6,by+1.4+f[1]*3],[bx+f[0]*4.4-l[0]*2.6,by+1.4+f[1]*3]],style.boot,'#0b0d12');
    art.line([[bx,by-5.5],[bx,by-1]],style.bootHi,1.2);
   };
   // Cape / coat tails flow behind the walking direction.
   const trail=(run?9:3)*amp+1.5,flutter=Math.sin(phase*2+.8)*(1.5+3*amp);
   const coatLen=vamp?(ranged?23:27):(ranged?15:22);
   const shoulder=(s)=>[l[0]*(female?6.6:8)*s+lean*f[0]*26,shY+l[1]*(female?6.6:8)*s+lean*18];
   const hipP=(s)=>[l[0]*(female?6.2:6.6)*s,hipY+l[1]*(female?6.2:6.6)*s];
   const backCape=()=>{
    if(vamp||ranged){ // long vampire coat tail or gunner duster flap behind
     const tail=[[shoulder(1)[0],shoulder(1)[1]],[shoulder(-1)[0],shoulder(-1)[1]],
      [hipP(-1)[0]-f[0]*(trail+2)+flutter*.4,hipY+coatLen],[hipP(1)[0]-f[0]*(trail+4)-flutter*.4,hipY+coatLen-2+f[1]*-3]];
     art.poly(tail,vamp?'#4e0f20':palette[2],'#0b0d12');
    }else{
     const cape=[[shoulder(1)[0],shoulder(1)[1]-1],[shoulder(-1)[0],shoulder(-1)[1]-1],
      [hipP(-1)[0]-f[0]*(trail+3)+flutter*.5,hipY+coatLen-2],[hipP(1)[0]-f[0]*(trail+6)-flutter*.5,hipY+coatLen]];
     art.poly(cape,style.capeDark,'#0b0d12');
    }
   };
   const torso=()=>{
    const sL=shoulder(1),sR=shoulder(-1),hL=hipP(1),hR=hipP(-1);
    // coat body with long skirt
    const skL=[hL[0]-f[0]*trail*.4+l[0]*2,hipY+coatLen-flutter*.2],skR=[hR[0]-f[0]*trail*.4-l[0]*2,hipY+coatLen+flutter*.2];
    art.poly([sL,sR,hR,skR,skL,hL],palette[0],'#0b0d12');
    // shaded half (the side turned away from the light) + belt
    art.poly([sR,[ (sL[0]+sR[0])/2,(sL[1]+sR[1])/2],[(hL[0]+hR[0])/2,(hL[1]+hR[1])/2],hR,skR,[(skL[0]+skR[0])/2,(skL[1]+skR[1])/2]],palette[1]);
    art.line([[hL[0],hL[1]+1],[hR[0],hR[1]+1]],style.trim,2);
    if(front){ // chest detail: vest seam / blood gem
     const m=[(sL[0]+sR[0])/2+f[0]*.8,(sL[1]+sR[1])/2],b=[(hL[0]+hR[0])/2+f[0]*.8,(hL[1]+hR[1])/2];
     art.line([[m[0],m[1]+2],[b[0],b[1]]],palette[2],1.2);
     if(vamp)art.poly([[m[0],m[1]+6],[m[0]+2,m[1]+9],[m[0],m[1]+12],[m[0]-2,m[1]+9]],'#ff3860','#ffd1dc66');
     else art.line([[sR[0],sR[1]+1],[hL[0],hL[1]-2]],style.trim,1.4);
    }else if(vamp){art.line([[ (sL[0]+sR[0])/2,sL[1]+3],[(hL[0]+hR[0])/2,hL[1]]],'#7a243b',1.2);}
    // collar / mantle
    art.poly([[sL[0],sL[1]-1],[sR[0],sR[1]-1],[sR[0]*.55,sR[1]-6],[sL[0]*.55,sL[1]-6]],vamp?'#3a1a30':style.cape,'#0b0d12');
    if(!vamp&&!ranged){ // pauldron on the near shoulder
     const near=sL[1]>sR[1]?sL:sR;art.oval(near[0],near[1]-.5,4.6,3.2,'#8b929a');art.oval(near[0]-.7,near[1]-1.3,2.6,1.4,'#c3c9ce');
    }
   };
   // arms: hand swing opposes the same-side leg
   const arms=[1,-1].map((s)=>{
    const ph=phase+(s>0?Math.PI:0),sw=Math.sin(ph)*(run?11:6.5)*amp;
    const sh=shoulder(s);
    let hand=[sh[0]+f[0]*sw+l[0]*1.5*s,sh[1]+(run?13:21)+f[1]*sw-(run?4:0)*amp+(run?-lift*.2:0)];
    let bend=[-f[0],-f[1]+.3];
    if(combat&&s<0){ // weapon arm: wind-up, strike, follow-through
     const t=[-.9,.6,1,.4][Math.min(3,attack)];
     hand=[sh[0]+f[0]*(8+t*14),sh[1]+4-t*3+f[1]*(6+t*9)];bend=[-f[0]*.2,1];
    }
    const [ex,ey,hd]=heroIK(sh,hand,bend,run&&!combat?11.5:HERO_LEG*.52);
    return {s,sh,elbow:[ex,ey],hand:hd,depth:hd[1]+(s<0?.02:0)};
   });
   const drawArm=(a)=>{
    limb([a.sh,a.elbow,a.hand],5.8,palette[0],'#0b0d12');
    art.oval(a.hand[0],a.hand[1],2.7,2.7,style.skin);
   };
   const weapon=(a)=>{
    const [hx,hy]=a.hand,swing=combat?[-.9,.6,1,.4][Math.min(3,attack)]:Math.sin(phase)*.25*amp;
    const bd=[f[0]*.55+(combat?swing*.9:swing*.3),.7-(combat?swing*.45:0)];const bl=Math.hypot(bd[0],bd[1]);bd[0]/=bl;bd[1]/=bl;
    if(!vamp&&!ranged){ // sword
     art.line([[hx,hy],[hx+bd[0]*24,hy+bd[1]*24]],'#0b0d12',3.6);art.line([[hx,hy],[hx+bd[0]*24,hy+bd[1]*24]],'#cfd5db',2);
     art.line([[hx-bd[1]*3.2+bd[0]*3,hy+bd[0]*3.2+bd[1]*3],[hx+bd[1]*3.2+bd[0]*3,hy-bd[0]*3.2+bd[1]*3]],'#c9a45f',1.8);
    }else if(!vamp&&ranged){ // pistol
     art.line([[hx,hy],[hx+f[0]*9,hy+f[1]*5-1]],'#0b0d12',4);art.line([[hx,hy],[hx+f[0]*9,hy+f[1]*5-1]],'#5a6674',2.6);
     art.line([[hx,hy],[hx-f[0]*1.2,hy+4]],'#4a3626',2.4);
     if(combat&&attack>=1)art.glow(hx+f[0]*11,hy+f[1]*6-1,10,'#ffd27a99');
    }else if(vamp&&!ranged){ // blood claws on both hands (called per hand)
     for(let i=-1;i<=1;i++){
      const ox=-bd[1]*i*1.9,oy=bd[0]*i*1.9;
      art.line([[hx+ox,hy+oy],[hx+ox+bd[0]*9.5,hy+oy+bd[1]*9.5]],'#ff2e55',1.5);
      art.line([[hx+ox,hy+oy],[hx+ox+bd[0]*7,hy+oy+bd[1]*7]],'#ffc2cf',.7);
     }
    }else{ // blood mage staff (only the weapon hand)
     if(a.s<0){
      const tipx=hx+f[0]*3.5,tipy=hy-34;
      art.line([[hx-f[0]*1.5,hy+15],[tipx,tipy]],'#0b0d12',3.4);art.line([[hx-f[0]*1.5,hy+15],[tipx,tipy]],'#5a3445',2);
      art.glow(tipx,tipy-3,16,combat&&attack>=1?'#ff2e55aa':'#ff2e5566');art.oval(tipx,tipy-3,3.6,4.4,'#ff1e4d');art.oval(tipx-.6,tipy-4,1.6,2,'#ffd1dc');
     }
    }
   };
   const hc=[f[0]*1.6+lean*f[0]*30,shY-12+lean*20],rx=6.6-(female?.5:0),ry=7.6;
   const hairMass=()=>{ // long hair / vampire mane hangs behind the head; hidden by the torso when seen from the front
    if(!(female||vamp))return;
    const wave=Math.sin(phase+.6)*(2+4*amp),len=female?19:7;
    art.poly([[hc[0]-rx-1,hc[1]-3],[hc[0]+rx+1,hc[1]-3],[hc[0]+rx-f[0]*(trail*.5)+wave*.3,hc[1]+len],[hc[0]-rx-f[0]*(trail*.8+2)+wave,hc[1]+len+1]],style.hair[female?1:0]);
   };
   const head=()=>{
    art.oval(hc[0],hc[1],rx,ry,style.skin);
    if(front){ // face: eyes, brow and mouth shifted toward the facing side
     const ex=hc[0]+f[0]*2.2;
     for(const k of [-1,1]){art.oval(ex+k*2.1,hc[1]-.6,.95,1.2,style.eye);}
     art.line([[ex-3.6,hc[1]-2.6],[ex-.8,hc[1]-2.1]],style.hair[0],.9);art.line([[ex+.8,hc[1]-2.1],[ex+3.6,hc[1]-2.6]],style.hair[0],.9);
     art.line([[ex-1.2,hc[1]+3],[ex+1.2,hc[1]+3]],vamp?'#7a243b':'#7a5a48',.8);
     if(vamp)art.glow(ex,hc[1]-.6,5,'#ff2e5544');
    }
    // hair cap
    const hairCol=style.hair[female?1:0];
    art.poly([[hc[0]-rx-.6,hc[1]+1],[hc[0]-rx,hc[1]-ry*.55],[hc[0]-1,hc[1]-ry-1.3],[hc[0]+rx,hc[1]-ry*.6],[hc[0]+rx+.6,hc[1]+1],[hc[0]+rx*.5,hc[1]-ry*.35],[hc[0]-rx*.5+f[0]*.8,hc[1]-ry*.5]],hairCol);
    if(!front)art.oval(hc[0],hc[1]-.5,rx+.4,ry+.3,hairCol);
    if(female)art.oval(hc[0]-f[0]*(rx+1.6),hc[1]-ry*.45,2.1,1.7,vamp?'#ff4d6d':'#e8c27a');
    if(!vamp&&!ranged&&!female&&false)art.oval(hc[0],hc[1],1,1,'#000');
   };
   // ---------- paint order: far legs, back cape, torso, near legs, arms, head ----------
   drawLeg(legs[0]);
   backCape();
   if(front)hairMass();
   const armFar=arms[0].depth<arms[1].depth?arms[0]:arms[1],armNear=armFar===arms[0]?arms[1]:arms[0];
   if(!front){drawArm(armFar);}
   torso();
   drawLeg(legs[1]);
   if(front)drawArm(armFar);
   // weapon hand is the right one (s<0); vampire claws appear on both hands
   const wArm=arms.find(a=>a.s<0),oArm=arms.find(a=>a.s>0);
   if(!front)hairMass();
   head();
   drawArm(armNear);
   weapon(wArm);
   if(vamp&&!ranged)weapon(oArm);
   c.restore();
  });
 }
}
