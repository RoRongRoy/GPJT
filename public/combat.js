/* Short-lived, client-only presentation of server-confirmed combat outcomes. */
class CombatEffects {
 constructor(before,after,kind,now,facing=0,spec=null){
  this.kind=kind;this.start=now;this.spec=spec;
  this.skillId=spec?.id||spec?.key||kind;
  this.isSkill=kind!=='attack';
  this.isHeal=kind==='recover'||kind==='purify';
  this.duration=this.isHeal?800:kind==='ultimate'?760:kind==='sweep'?650:(kind==='strike'||kind==='ranged')?520:420;
  this.origin={x:after.player.x,y:after.player.y};this.vampire=after.player.species==='vampire';this.job=after.player.job||'warrior';
  this.hits=after.enemies.flatMap(e=>{const old=before.enemies.find(n=>n.id===e.id);return old&&old.hp>e.hp?[{id:e.id,x:e.x,y:e.y,damage:Math.ceil(old.hp-e.hp),killed:e.hp<=0&&Boolean(after.inventory)}]:[];});
  const newGear=(after.gear||[]).filter(g=>!(before.gear||[]).some(o=>o.id===g.id));
  const gradeNames={normal:'일반',advanced:'고급',rare:'희귀',epic:'영웅',legendary:'전설'};
  this.lootLabel=newGear.length?`★ [${gradeNames[newGear[0].rarity]||'장비'}] ${newGear[0].name}`:'전리품 드랍 · 주문서·부품';
  this.heal=Math.max(0,Math.ceil(after.player.hp-before.player.hp));
  const target=this.hits.slice().sort((a,b)=>Math.hypot(a.x-this.origin.x,a.y-this.origin.y)-Math.hypot(b.x-this.origin.x,b.y-this.origin.y))[0],dx=target?target.x-this.origin.x:1,dy=target?target.y-this.origin.y:0;
  this.targetDistance=Math.hypot((dx-dy)*34,(dx+dy)*17);
  this.angle=Math.atan2((dx+dy)*17,(dx-dy)*34);this.row=dx+dy>=0?(dx-dy>=0?0:1):(dx-dy>=0?3:2);
  if(!target){this.row=facing;this.angle=[Math.PI/6,Math.PI*5/6,-Math.PI*5/6,-Math.PI/6][facing];}
  this.reduced=Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  this.profile=this.effectProfile();
  if(this.isSkill)this.duration=this.isHeal?900:this.profile.power>=3?1050:this.profile.family==='beam'?820:780;
  this.impactAt=this.duration*(this.isHeal?.18:this.isSkill?.42:.2);
  this.seed=String(this.skillId).split('').reduce((n,c)=>(n*31+c.charCodeAt(0))%997,0);
  this.target=target||{...this.origin};
 }
 active(now){return now-this.start<this.duration+450;}
 body(now){
  const age=now-this.start;
  const held=this.isSkill&&!this.reduced&&age>this.impactAt&&age<this.impactAt+65?this.impactAt:age;
  const t=held/this.duration;
  if(this.isHeal||t<0||t>1||this.reduced)return {x:0,y:0,tilt:0};
  if(this.job==='ranged')return {x:-Math.cos(this.angle)*Math.sin(t*Math.PI)*2,y:-Math.sin(this.angle)*Math.sin(t*Math.PI),tilt:0};
  if(this.isSkill){const wind=t<.24?-Math.sin(t/.24*Math.PI)*5:Math.sin(Math.max(0,(t-.24)/.76)*Math.PI)*(this.profile.power>=3?15:11);return {x:Math.cos(this.angle)*wind,y:Math.sin(this.angle)*wind*.5,tilt:Math.cos(this.angle)*Math.sin(t*Math.PI)*.12};}
  const mult=this.kind==='strike'?1.35:this.kind==='ranged'?-.45:this.kind==='ultimate'?1.15:1;
  const strike=Math.sin(Math.PI*Math.max(0,(t-.2)/.8)),wind=t<.2?-3*Math.sin(t/.2*Math.PI):0;
  return {x:Math.cos(this.angle)*(wind+strike*9*mult),y:Math.sin(this.angle)*(wind+strike*5*mult),tilt:Math.cos(this.angle)*strike*.09*mult};
 }
 pose(normal,now){
  const age=now-this.start;
  if(this.isHeal||age>this.duration)return normal;
  const frame=this.isSkill?(age<this.duration*.22?0:age<this.impactAt?1:age<this.impactAt+65?2:3):Math.min(3,Math.max(0,Math.floor(age/this.duration*4)));
  return {row:this.row,frame};
 }
 effectProfile(){
  const groups={
   slash:['hw_slash','hw_cleave','vw_rend','vw_reap'],
   cross:['hw_judgment','hw_execution','vw_fang','vw_king'],
   nova:['hw_bash','hw_quake','vw_howl','vw_feast'],
   volley:['hr_shot'],lightning:['hr_shock','hr_flash'],
   bomb:['hr_grenade','hr_rocket','vr_doom'],
   beam:['hr_snipe','hr_rail','vr_lance'],
   orb:['vr_bolt','vr_orb','vr_eclipse'],
   chains:['vw_grip','vr_bind','vr_prison'],
   heal:['hw_aid','hr_medkit','vw_mend'],
   sanctuary:['hw_sanctuary','vr_restore']
  };
  let family=Object.keys(groups).find(k=>groups[k].includes(this.skillId));
  if(!family)family=this.isHeal?(this.kind==='purify'?'sanctuary':'heal'):this.job==='ranged'?(this.vampire?(this.spec?.blast_radius?'orb':'beam'):(this.spec?.blast_radius?'bomb':'volley')):this.kind==='ultimate'?'nova':this.kind==='sweep'?'slash':'cross';
  const power=this.kind==='ultimate'||(this.spec?.unlock_level||0)>=25?3:(this.spec?.unlock_level||0)>=15?2:1;
  const colors=this.vampire?['#f04b81','#b86cec','#ff9aa9']:this.job==='ranged'?['#7bdaff','#ffc16d','#c1edff']:['#ffe4a1','#8bdbff','#fff0c9'];
  const color=this.isHeal?(this.vampire?'#db72b8':'#81efc7'):['chains','lightning','orb'].includes(family)?colors[1]:colors[0];
  return {family,power,color,core:colors[2]};
 }
 shake(now){
  const age=now-this.start-this.impactAt;
  if(this.reduced||this.isHeal||!this.hits.length||age<0||age>160)return {x:0,y:0};
  const amp=(this.isSkill?1+this.profile.power:0.6)*(1-age/160);
  return {x:Math.sin(age*.13)*amp,y:Math.cos(age*.17)*amp*.55};
 }
 reaction(id,now){
  const age=now-this.start-this.impactAt;
  if(this.reduced||!this.hits.some(h=>h.id===id)||age<0||age>210)return {x:0,y:0,flash:false};
  const kick=Math.sin(age/210*Math.PI)*(this.isSkill?5:2);
  return {x:Math.cos(this.angle)*kick,y:Math.sin(this.angle)*kick*.5,flash:age<85};
 }
 ring(c,x,y,r,color,alpha=1){
  c.strokeStyle=color;c.globalAlpha=Math.max(0,Math.min(1,alpha));c.lineWidth=2;c.beginPath();c.ellipse(x,y,r,r*.48,0,0,Math.PI*2);c.stroke();
 }
 rays(c,x,y,r,count,color,phase,offset=0){
  c.strokeStyle=color;c.lineWidth=2;
  for(let i=0;i<count;i++){
   const a=i/count*Math.PI*2+offset,start=r*(.2+phase*.35),end=r*(.55+phase*.65);
   c.beginPath();c.moveTo(x+Math.cos(a)*start,y+Math.sin(a)*start*.6);c.lineTo(x+Math.cos(a)*end,y+Math.sin(a)*end*.6);c.stroke();
  }
 }
 drawSkill(c,project,scale,now,art=null){
  const age=now-this.start,t=age/this.duration;if(t<0||t>1)return;
  const {family,power,color,core}=this.profile;
  const origin=project(this.origin.x,this.origin.y),target=project(this.target.x,this.target.y);
  const impact=this.impactAt/this.duration,q=Math.max(0,(t-impact)/(1-impact));
  const limit=this.reduced?5:c.canvas?.clientWidth<600?8+power*2:12+power*4;
  c.save();c.translate(origin[0],origin[1]);c.scale(scale,scale);c.lineCap='round';
  const tx=(target[0]-origin[0])/scale,ty=(target[1]-origin[1])/scale;
  // A short, readable preparation seal before release, rather than a full-screen flash.
  if(t<impact){
   const charge=t/impact;c.globalAlpha=(this.reduced?.25:.65)*Math.sin(charge*Math.PI);
   this.ring(c,0,-2,20+charge*18,color,c.globalAlpha);
   if(!this.reduced)this.rays(c,0,-2,30,6+power*2,color,charge,this.seed*.1);
  }
  c.globalCompositeOperation='lighter';
  const stamp=(frame,x,y,size,alpha)=>{
   if(!art?.ready('skill-fx'))return;
   c.save();c.globalCompositeOperation='source-over';c.globalAlpha=Math.max(0,alpha)*(this.reduced?.35:.8);art.sprite('skill-fx',x,y,size,frame);c.restore();
  };
  const frame=this.isHeal?(this.vampire?5:7):family==='slash'?(this.vampire?1:0):family==='cross'?(this.vampire?1:8):family==='nova'?(this.vampire?11:10):family==='lightning'?4:family==='bomb'?(this.vampire?9:3):family==='orb'?(this.skillId==='vr_eclipse'?11:5):family==='chains'?6:2;
  if(this.isHeal)stamp(frame,0,12,120+power*20,Math.sin(t*Math.PI));
  else if(family==='slash'&&t>.18)stamp(frame,Math.cos(this.angle)*30,5,125+power*20,Math.sin(Math.min(1,(t-.18)/.65)*Math.PI));
  else if(t>=impact&&this.hits.length)for(const hit of (this.spec?.blast_radius?[this.target]:family==='nova'?[this.origin]:this.hits.slice(0,6))){
   const point=project(hit.x,hit.y),hx=(point[0]-origin[0])/scale,hy=(point[1]-origin[1])/scale;
   stamp(frame,hx,hy+12,95+power*25,Math.sin(q*Math.PI));
  }
  if(this.isHeal){
   this.ring(c,0,-3,25+t*(family==='sanctuary'?60:32),color,(1-t)*.65);
   if(family==='sanctuary')this.ring(c,0,-3,18+t*40,core,(1-t)*.45);
   c.globalAlpha=(1-t)*.65;c.strokeStyle=color;c.lineWidth=family==='sanctuary'?3:2;
   for(let i=0;i<(this.reduced?2:8);i++){
    const a=i*Math.PI/4+t*1.8,x=Math.cos(a)*22,y=-18-t*65+Math.sin(a)*9;
    c.beginPath();c.moveTo(x-4,y);c.lineTo(x+4,y);c.moveTo(x,y-4);c.lineTo(x,y+4);c.stroke();
   }
  }else if(['volley','beam','lightning','bomb','orb'].includes(family)){
   const travel=Math.max(0,Math.min(1,(t-.12)/(impact-.12))),dx=tx,dy=ty;
   if(t>=.12&&t<impact+.1){
    const copies=family==='volley'?3:1;
    for(let i=0;i<copies;i++){
     const progress=Math.max(0,Math.min(1,travel-i*.13)),x=dx*progress,y=-40+dy*progress;
     c.globalAlpha=.8*(t>impact?1-(t-impact)/.1:1);c.strokeStyle=color;c.lineWidth=family==='beam'?5+power*2:3;
     c.beginPath();c.moveTo(dx*(family==='beam'?0:Math.max(0,progress-.23)),-40+dy*(family==='beam'?0:Math.max(0,progress-.23)));
     if(family==='lightning')for(let j=1;j<8;j++)c.lineTo(dx*progress*j/8+Math.sin(j*7+this.seed)*10,-40+dy*progress*j/8);
     c.lineTo(x,y);c.stroke();
     if(['bomb','orb'].includes(family)){
      const arc=family==='bomb'?Math.sin(progress*Math.PI)*50:0;
      c.fillStyle=family==='bomb'?'#ffc98a':color;c.beginPath();c.arc(x,y-arc,5+power*2,0,Math.PI*2);c.fill();
      this.ring(c,x,y-arc,10+power*2,core,.65);
     }else {c.strokeStyle=core;c.lineWidth=1.5;c.stroke();}
    }
   }
  }else if(t>=.18){
   const phase=Math.min(1,(t-.18)/.42),r=family==='nova'?70+power*18:this.spec?.aoe?90+power*12:50+power*15;
   c.save();c.translate(0,-32);c.rotate(this.angle);c.scale(1,.62);c.globalAlpha=(1-t)*.8;
   if(family==='slash'||family==='cross'){
    const blades=family==='cross'?2:this.vampire?(this.spec?.aoe?4:3):(this.spec?.aoe?2:1);
    for(let i=0;i<blades;i++){
     c.strokeStyle=i===0?core:color;c.lineWidth=8-i*2;
     c.beginPath();c.arc(0,i*10,r-i*8,-2.2+phase*3+i*.7,-.7+phase*3+i*.7);c.stroke();
    }
   }else if(family==='nova'){
    this.ring(c,0,32,r*phase,color,(1-t)*.75);
    this.rays(c,0,32,r,limit,color,phase,this.seed*.1);
   }
   c.restore();
  }
  // Only confirmed victims receive impact, binding or hit flashes.
  if(t>=impact){
   for(const hit of this.hits.slice(0,12)){
    const point=project(hit.x,hit.y),hx=(point[0]-origin[0])/scale,hy=(point[1]-origin[1])/scale-38;
    c.globalAlpha=(1-q)*.8;
    const radius=(family==='bomb'||family==='orb'?40:22)+power*12;
    if(family==='chains'){
     c.strokeStyle=color;c.lineWidth=3;
     for(let i=0;i<3;i++){c.beginPath();c.ellipse(hx,hy+8*i,20+power*4,7,Math.sin(i+this.seed)*.3,0,Math.PI*2);c.stroke();}
     c.beginPath();c.moveTo(hx-18,hy+28);c.lineTo(hx-18,hy-32);c.moveTo(hx+18,hy+28);c.lineTo(hx+18,hy-32);c.stroke();
    }else{
     this.ring(c,hx,hy,radius*(.3+q),color,(1-q)*.4);
     this.rays(c,hx,hy,radius,this.reduced?3:4+power*2,color,q,this.seed*.1);
     if(power>=2&&!this.reduced){c.strokeStyle=color;c.lineWidth=power*4;c.beginPath();c.moveTo(hx,hy+15);c.lineTo(hx,hy-55*(1-q));c.stroke();}
    }
    if(!this.reduced)for(let i=0;i<limit;i++){
     const a=i*2.399+this.seed,spread=radius*q,speed=.6+(i%5)*.13;
     c.globalAlpha=(1-q)*.45;c.fillStyle=i%3?color:core;
     c.fillRect(hx+Math.cos(a)*spread*speed,hy+Math.sin(a)*spread*.6+q*q*18,2+power,2+power);
    }
   }
   if(this.spec?.blast_radius&&this.hits.length)this.ring(c,tx,ty,34*this.spec.blast_radius*(.25+q*.75),color,(1-q)*.5);
  }
  c.restore();
 }
 draw(c,project,scale,now,art=null){
  const age=now-this.start,t=age/this.duration;if(age<0||!this.active(now))return;
  const [x,y]=project(this.origin.x,this.origin.y);
  if(!this.isSkill&&this.spec?.blast_radius&&this.hits.length&&t>.45&&t<1){
   const center=this.hits.reduce((a,b)=>Math.hypot(a.x-this.origin.x,a.y-this.origin.y)<Math.hypot(b.x-this.origin.x,b.y-this.origin.y)?a:b);
   const [bx,by]=project(center.x,center.y),phase=(t-.45)/.55;
   c.save();c.strokeStyle=this.vampire?'#df789e':'#edbc72';c.globalAlpha=1-phase;c.lineWidth=3*scale;c.beginPath();c.ellipse(bx,by,34*this.spec.blast_radius*phase*scale,17*this.spec.blast_radius*phase*scale,0,0,Math.PI*2);c.stroke();c.restore();
  }
  const color=this.kind==='purify'?(this.vampire?'#ff7597':'#7ef0d2'):this.kind==='recover'?'#9ce2bf':this.kind==='ultimate'?(this.vampire?'#ff2e55':'#ffd166'):this.vampire?'#f19db4':'#ffe0a5';
  c.save();c.lineCap='round';
  if(t<1&&!this.isSkill){
   c.save();c.translate(x,y-35*scale);c.scale(scale,scale);
   if(this.isHeal){
    c.strokeStyle=color;c.globalAlpha=(1-t)*.85;c.lineWidth=this.kind==='purify'?2.8:2;
    c.beginPath();c.ellipse(0,28,20+t*(this.kind==='purify'?42:30),9+t*(this.kind==='purify'?19:14),0,0,Math.PI*2);c.stroke();
    if(this.kind==='purify'){c.beginPath();c.ellipse(0,28,12+t*26,5+t*11,0,0,Math.PI*2);c.stroke();}
    if(!this.reduced)for(let i=0;i<(this.kind==='purify'?10:7);i++){const px=Math.sin(i*2.4)*25,py=15-t*58+i%3*8;c.fillStyle=color;c.fillRect(px-1,py-4,2,8);c.fillRect(px-4,py-1,8,2);}
   }else if(this.kind==='ranged'||this.job==='ranged'){
    const phase=Math.max(0,Math.min(1,t/.65)),reach=Math.max(25,this.targetDistance);
    c.rotate(this.angle);c.globalAlpha=1-t*.8;
    if(this.vampire){
     // Blood Mage staff spell circle & crimson blood bolt
     c.strokeStyle='#ff2e55';c.lineWidth=2.2;
     c.beginPath();c.arc(14,0,8+phase*5,0,Math.PI*2);c.stroke();
     c.strokeStyle='#ff3355';c.lineWidth=this.kind==='attack'?3.2:4.5;
     c.beginPath();c.moveTo(12,0);c.lineTo(24+phase*reach,0);c.stroke();
     c.strokeStyle='#ffd1dc';c.lineWidth=1.6;
     c.beginPath();c.moveTo(18+phase*reach*.35,0);c.lineTo(28+phase*reach,0);c.stroke();
    }else{
     // Human Gunner muzzle flash & high-velocity bullet tracer
     c.fillStyle='#ffe89e';c.beginPath();c.arc(15,0,6*(1-phase*.6),0,Math.PI*2);c.fill();
     c.strokeStyle='#7ce8ff';c.lineWidth=this.kind==='attack'?3:4.2;
     c.beginPath();c.moveTo(12,0);c.lineTo(26+phase*reach,0);c.stroke();
     c.strokeStyle='#ffffff';c.lineWidth=1.5;
     c.beginPath();c.moveTo(20+phase*reach*.35,0);c.lineTo(30+phase*reach,0);c.stroke();
    }
   }else{
    const sweep=this.kind==='sweep'||this.kind==='ultimate',ult=this.kind==='ultimate',strike=this.kind==='strike';
    const phase=Math.max(0,Math.min(1,(t-.18)/.55));
    c.rotate(this.angle);c.scale(1,.65);
    if(t>=.18){
     const end=-1.8+phase*(ult?Math.PI*3:sweep?Math.PI*2:strike?2.6:3.3);
     const radius=ult?104:sweep?72:strike?62:48;
     for(let i=0;i<(ult?4:3);i++){c.globalAlpha=(1-t)*(.62-i*.13);c.strokeStyle=color;c.lineWidth=(ult?10:8)-i*2;c.beginPath();c.arc(0,0,radius-i*6,end-(sweep?2.5:1.3),end);c.stroke();}
     if(strike||(this.vampire&&this.job==='warrior')){
      c.globalAlpha=(1-t)*.75;c.strokeStyle=this.vampire?'#ff2e55':'#fff2b2';c.lineWidth=3.2;
      c.beginPath();c.moveTo(22,-22);c.lineTo(66,22);c.moveTo(22,22);c.lineTo(66,-22);c.stroke();
     }
    }
    if(!this.reduced){c.globalAlpha=Math.min(1,(1-t)*3);c.rotate(-1.8+phase*(ult?Math.PI*3:sweep?Math.PI*2:3.3));c.strokeStyle='#f5eee1';c.lineWidth=3;c.beginPath();c.moveTo(13,0);c.lineTo(ult?96:sweep?72:53,0);c.stroke();c.strokeStyle='#aa8b62';c.lineWidth=5;c.beginPath();c.moveTo(18,-5);c.lineTo(18,5);c.stroke();}
   }
   c.restore();
  }
  if(this.isSkill)this.drawSkill(c,project,scale,now,art);
  const hitProgress=Math.max(0,(age-this.impactAt)/(this.duration-this.impactAt+450));
  if(age>=this.impactAt){
   for(const hit of this.hits){
    const [hx,hy]=project(hit.x,hit.y);c.globalAlpha=Math.max(0,1-hitProgress);c.fillStyle=color;
    if(!this.reduced&&hitProgress<.4)for(let i=0;i<5;i++){const a=i*1.256;c.beginPath();c.arc(hx+Math.cos(a)*hitProgress*70*scale,hy-42*scale+Math.sin(a)*hitProgress*50*scale,2*scale,0,Math.PI*2);c.fill();}
    c.font=`bold ${Math.round((this.isSkill?21:17)*scale)}px system-ui`;c.textAlign='center';c.strokeStyle='#17121e';c.lineWidth=3;c.strokeText(String(hit.damage),hx,hy-(90+hitProgress*25)*scale);c.fillText(String(hit.damage),hx,hy-(90+hitProgress*25)*scale);
    if(hit.killed){c.font=`bold ${Math.round(12*scale)}px system-ui`;c.fillStyle='#ffd97d';c.strokeText(this.lootLabel,hx,hy-(114+hitProgress*32)*scale);c.fillText(this.lootLabel,hx,hy-(114+hitProgress*32)*scale);}
   }
   if(this.isHeal&&this.heal>0){c.globalAlpha=Math.max(0,1-hitProgress);c.font=`bold ${Math.round(17*scale)}px system-ui`;c.textAlign='center';c.fillStyle=color;c.fillText('+'+this.heal,x,y-(100+hitProgress*25)*scale);}
  }
  c.restore();
 }
}
