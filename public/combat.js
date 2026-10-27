/* Short-lived, client-only presentation of server-confirmed combat outcomes. */
class CombatEffects {
 constructor(before,after,kind,now,facing=0){
  this.kind=kind;this.start=now;this.duration=kind==='recover'?800:kind==='sweep'?650:420;
  this.origin={x:after.player.x,y:after.player.y};this.vampire=after.player.species==='vampire';
  this.hits=after.enemies.flatMap(e=>{const old=before.enemies.find(n=>n.id===e.id);return old&&old.hp>e.hp?[{id:e.id,x:e.x,y:e.y,damage:Math.ceil(old.hp-e.hp)}]:[];});
  this.heal=Math.max(0,Math.ceil(after.player.hp-before.player.hp));
  const target=this.hits[0],dx=target?target.x-this.origin.x:1,dy=target?target.y-this.origin.y:0;
  this.angle=Math.atan2((dx+dy)*17,(dx-dy)*34);this.row=dx+dy>=0?(dx-dy>=0?0:1):(dx-dy>=0?3:2);
  if(!target){this.row=facing;this.angle=[Math.PI/6,Math.PI*5/6,-Math.PI*5/6,-Math.PI/6][facing];}
  this.reduced=Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
 }
 active(now){return now-this.start<this.duration+450;}
 body(now){
  const t=(now-this.start)/this.duration;
  if(this.kind==='recover'||t<0||t>1||this.reduced)return {x:0,y:0,tilt:0};
  const strike=Math.sin(Math.PI*Math.max(0,(t-.2)/.8)),wind=t<.2?-3*Math.sin(t/.2*Math.PI):0;
  return {x:Math.cos(this.angle)*(wind+strike*9),y:Math.sin(this.angle)*(wind+strike*5),tilt:Math.cos(this.angle)*strike*.09};
 }
 pose(normal,now){return this.kind==='recover'||now-this.start>this.duration?normal:{row:this.row,frame:Math.min(3,Math.floor((now-this.start)/this.duration*4))};}
 draw(c,project,scale,now){
  const age=now-this.start,t=age/this.duration;if(age<0||!this.active(now))return;
  const [x,y]=project(this.origin.x,this.origin.y),color=this.kind==='recover'?'#9ce2bf':this.vampire?'#f19db4':'#ffe0a5';
  c.save();c.lineCap='round';
  if(t<1){
   c.save();c.translate(x,y-35*scale);c.scale(scale,scale);
   if(this.kind==='recover'){
    c.strokeStyle=color;c.globalAlpha=(1-t)*.8;c.lineWidth=2;c.beginPath();c.ellipse(0,28,20+t*30,9+t*14,0,0,Math.PI*2);c.stroke();
    if(!this.reduced)for(let i=0;i<7;i++){const px=Math.sin(i*2.4)*23,py=15-t*55+i%3*8;c.fillStyle=color;c.fillRect(px-1,py-4,2,8);c.fillRect(px-4,py-1,8,2);}
   }else{
    const sweep=this.kind==='sweep',phase=Math.max(0,Math.min(1,(t-.18)/.55));
    c.rotate(this.angle);c.scale(1,.65);
    if(t>=.18){
     const end=-1.8+phase*(sweep?Math.PI*2:3.3);
     for(let i=0;i<3;i++){c.globalAlpha=(1-t)*(.55-i*.13);c.strokeStyle=color;c.lineWidth=8-i*2;c.beginPath();c.arc(0,0,(sweep?72:48)-i*5,end-(sweep?2.4:1.2),end);c.stroke();}
    }
    // Weapon travels from wind-up through the strike and settles on recovery.
    if(!this.reduced){c.globalAlpha=Math.min(1,(1-t)*3);c.rotate(-1.8+phase*(sweep?Math.PI*2:3.3));c.strokeStyle='#f5eee1';c.lineWidth=3;c.beginPath();c.moveTo(13,0);c.lineTo(sweep?72:53,0);c.stroke();c.strokeStyle='#aa8b62';c.lineWidth=5;c.beginPath();c.moveTo(18,-5);c.lineTo(18,5);c.stroke();}
   }
   c.restore();
  }
  const hitProgress=Math.max(0,(age-this.duration*.2)/(this.duration*.8+450));
  if(age>=this.duration*.2){
   for(const hit of this.hits){
    const [hx,hy]=project(hit.x,hit.y);c.globalAlpha=Math.max(0,1-hitProgress);c.fillStyle=color;
    if(!this.reduced&&hitProgress<.4)for(let i=0;i<5;i++){const a=i*1.256;c.beginPath();c.arc(hx+Math.cos(a)*hitProgress*70*scale,hy-42*scale+Math.sin(a)*hitProgress*50*scale,2*scale,0,Math.PI*2);c.fill();}
    c.font=`bold ${Math.round(17*scale)}px system-ui`;c.textAlign='center';c.strokeStyle='#17121e';c.lineWidth=3;c.strokeText(String(hit.damage),hx,hy-(90+hitProgress*25)*scale);c.fillText(String(hit.damage),hx,hy-(90+hitProgress*25)*scale);
   }
   if(this.kind==='recover'){c.globalAlpha=Math.max(0,1-hitProgress);c.font=`bold ${Math.round(17*scale)}px system-ui`;c.textAlign='center';c.fillStyle=color;c.fillText('+'+this.heal,x,y-(100+hitProgress*25)*scale);}
  }
  c.restore();
 }
}
