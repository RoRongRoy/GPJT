/* Short-lived, client-only presentation of server-confirmed combat outcomes. */
class CombatEffects {
 constructor(before,after,kind,now,facing=0){
  this.kind=kind;this.start=now;
  this.isHeal=kind==='recover'||kind==='purify';
  this.duration=this.isHeal?800:kind==='ultimate'?760:kind==='sweep'?650:(kind==='strike'||kind==='ranged')?520:420;
  this.origin={x:after.player.x,y:after.player.y};this.vampire=after.player.species==='vampire';this.job=after.player.job||'warrior';
  this.hits=after.enemies.flatMap(e=>{const old=before.enemies.find(n=>n.id===e.id);return old&&old.hp>e.hp?[{id:e.id,x:e.x,y:e.y,damage:Math.ceil(old.hp-e.hp),killed:e.hp<=0&&Boolean(after.inventory)}]:[];});
  const newGear=(after.gear||[]).filter(g=>!(before.gear||[]).some(o=>o.id===g.id));
  const gradeNames={normal:'일반',advanced:'고급',rare:'희귀',epic:'영웅',legendary:'전설'};
  this.lootLabel=newGear.length?`★ [${gradeNames[newGear[0].rarity]||'장비'}] ${newGear[0].name}`:'전리품 드랍 · 주문서·부품';
  this.heal=Math.max(0,Math.ceil(after.player.hp-before.player.hp));
  const target=this.hits[0],dx=target?target.x-this.origin.x:1,dy=target?target.y-this.origin.y:0;
  this.angle=Math.atan2((dx+dy)*17,(dx-dy)*34);this.row=dx+dy>=0?(dx-dy>=0?0:1):(dx-dy>=0?3:2);
  if(!target){this.row=facing;this.angle=[Math.PI/6,Math.PI*5/6,-Math.PI*5/6,-Math.PI/6][facing];}
  this.reduced=Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
 }
 active(now){return now-this.start<this.duration+450;}
 body(now){
  const t=(now-this.start)/this.duration;
  if(this.isHeal||t<0||t>1||this.reduced)return {x:0,y:0,tilt:0};
  const mult=this.kind==='strike'?1.35:this.kind==='ranged'?-.45:this.kind==='ultimate'?1.15:1;
  const strike=Math.sin(Math.PI*Math.max(0,(t-.2)/.8)),wind=t<.2?-3*Math.sin(t/.2*Math.PI):0;
  return {x:Math.cos(this.angle)*(wind+strike*9*mult),y:Math.sin(this.angle)*(wind+strike*5*mult),tilt:Math.cos(this.angle)*strike*.09*mult};
 }
 pose(normal,now){return this.isHeal||now-this.start>this.duration?normal:{row:this.row,frame:Math.min(3,Math.floor((now-this.start)/this.duration*4))};}
 draw(c,project,scale,now){
  const age=now-this.start,t=age/this.duration;if(age<0||!this.active(now))return;
  const [x,y]=project(this.origin.x,this.origin.y);
  const color=this.kind==='purify'?(this.vampire?'#ff7597':'#7ef0d2'):this.kind==='recover'?'#9ce2bf':this.kind==='ultimate'?(this.vampire?'#ff2e55':'#ffd166'):this.vampire?'#f19db4':'#ffe0a5';
  c.save();c.lineCap='round';
  if(t<1){
   c.save();c.translate(x,y-35*scale);c.scale(scale,scale);
   if(this.isHeal){
    c.strokeStyle=color;c.globalAlpha=(1-t)*.85;c.lineWidth=this.kind==='purify'?2.8:2;
    c.beginPath();c.ellipse(0,28,20+t*(this.kind==='purify'?42:30),9+t*(this.kind==='purify'?19:14),0,0,Math.PI*2);c.stroke();
    if(this.kind==='purify'){c.beginPath();c.ellipse(0,28,12+t*26,5+t*11,0,0,Math.PI*2);c.stroke();}
    if(!this.reduced)for(let i=0;i<(this.kind==='purify'?10:7);i++){const px=Math.sin(i*2.4)*25,py=15-t*58+i%3*8;c.fillStyle=color;c.fillRect(px-1,py-4,2,8);c.fillRect(px-4,py-1,8,2);}
   }else if(this.kind==='ranged'||(this.job==='ranged'&&(this.kind==='attack'||this.kind==='strike'))){
    const phase=Math.max(0,Math.min(1,t/.65));
    c.rotate(this.angle);c.globalAlpha=1-t*.8;
    if(this.vampire){
     // Blood Mage staff spell circle & crimson blood bolt
     c.strokeStyle='#ff2e55';c.lineWidth=2.2;
     c.beginPath();c.arc(14,0,8+phase*5,0,Math.PI*2);c.stroke();
     c.strokeStyle='#ff3355';c.lineWidth=this.kind==='attack'?3.2:4.5;
     c.beginPath();c.moveTo(12,0);c.lineTo(24+phase*118,0);c.stroke();
     c.strokeStyle='#ffd1dc';c.lineWidth=1.6;
     c.beginPath();c.moveTo(18+phase*40,0);c.lineTo(28+phase*118,0);c.stroke();
    }else{
     // Human Gunner muzzle flash & high-velocity bullet tracer
     c.fillStyle='#ffe89e';c.beginPath();c.arc(15,0,6*(1-phase*.6),0,Math.PI*2);c.fill();
     c.strokeStyle='#7ce8ff';c.lineWidth=this.kind==='attack'?3:4.2;
     c.beginPath();c.moveTo(12,0);c.lineTo(26+phase*120,0);c.stroke();
     c.strokeStyle='#ffffff';c.lineWidth=1.5;
     c.beginPath();c.moveTo(20+phase*42,0);c.lineTo(30+phase*120,0);c.stroke();
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
  const hitProgress=Math.max(0,(age-this.duration*.2)/(this.duration*.8+450));
  if(age>=this.duration*.2){
   for(const hit of this.hits){
    const [hx,hy]=project(hit.x,hit.y);c.globalAlpha=Math.max(0,1-hitProgress);c.fillStyle=color;
    if(!this.reduced&&hitProgress<.4)for(let i=0;i<5;i++){const a=i*1.256;c.beginPath();c.arc(hx+Math.cos(a)*hitProgress*70*scale,hy-42*scale+Math.sin(a)*hitProgress*50*scale,2*scale,0,Math.PI*2);c.fill();}
    c.font=`bold ${Math.round(17*scale)}px system-ui`;c.textAlign='center';c.strokeStyle='#17121e';c.lineWidth=3;c.strokeText(String(hit.damage),hx,hy-(90+hitProgress*25)*scale);c.fillText(String(hit.damage),hx,hy-(90+hitProgress*25)*scale);
    if(hit.killed){c.font=`bold ${Math.round(12*scale)}px system-ui`;c.fillStyle='#ffd97d';c.strokeText(this.lootLabel,hx,hy-(114+hitProgress*32)*scale);c.fillText(this.lootLabel,hx,hy-(114+hitProgress*32)*scale);}
   }
   if(this.isHeal&&this.heal>0){c.globalAlpha=Math.max(0,1-hitProgress);c.font=`bold ${Math.round(17*scale)}px system-ui`;c.textAlign='center';c.fillStyle=color;c.fillText('+'+this.heal,x,y-(100+hitProgress*25)*scale);}
  }
  c.restore();
 }
}
