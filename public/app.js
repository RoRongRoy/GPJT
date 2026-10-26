const $ = id => document.getElementById(id);
const query = new URLSearchParams(location.hash.slice(1));
if(query.has('key')) { sessionStorage.setItem('bloodfall-key', query.get('key')); history.replaceState(null,'',location.pathname); }
const key = sessionStorage.getItem('bloodfall-key') || '';
// Deliberately per-tab: a second tab must not silently share control of this P0 world.
const session = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}-${Math.random()}`;
let state = null, busy = false, connected = false, polling = false, toastTimer, selected = null;
let renderPoints = [], target = null, projection = null, visualPlayer = null, attackUntil = 0, hurtUntil = 0;
const canvas = $('world'), ctx = canvas.getContext('2d');
const facilityNames = {kitchen:'주방',alchemy:'연금대',medical:'의료실',storage:'저장고'};
function toast(message) { $('toast').textContent=message; $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2600); }
async function api(path, body) {
 const response = await fetch(path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Access-Key':key,'X-Session-ID':session},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(5000)});
 const data = await response.json();
 if(!response.ok) throw new Error(data.error || '서버 오류');
 connected=true; $('connection').classList.remove('status-error'); $('connection').textContent='● 서버 연결 · 자동 저장'; return data;
}
async function command(action, fields={}) {
 if(busy || !state || !connected) return;
 busy=true;
 try { accept(await api('/api/action',{revision:state.world.revision,command:{action,...fields}})); if(action==='attack') attackUntil=performance.now()+260; }
 catch(e) { if(action!=='move') toast(e.message); }
 finally { busy=false; }
}
function accept(data) { if(!state || data.world.revision >= state.world.revision) { if(state && data.world.player.hp<state.world.player.hp)hurtUntil=performance.now()+350; state=data; update(); } }
function span(className,text) { const n=document.createElement('span'); n.className=className; n.textContent=text; return n; }
function update() {
 if(!state) return;
 const w=state.world,p=w.player;
 $('welcome').hidden=p.chosen; $('interaction').hidden=!p.chosen; if(w.paused)target=null; updateGuide();
 $('pause-overlay').hidden=!w.paused;
 $('pause').textContent=w.paused?'계속하기':'일시정지';
 $('species').textContent=p.species==='human'?'인간 · 생존자':'뱀파이어 · 혈족';
 $('level').textContent=`WEAPON +${p.level} · 실패 ${p.pity}`;
 $('day').textContent=`DAY ${String(1+Math.floor(w.elapsed/600)).padStart(2,'0')}`;
 $('time').textContent=`활동 ${Math.floor(w.elapsed/60)}분 ${Math.floor(w.elapsed%60)}초`;
 $('base-pos').textContent=`${w.base.x} / ${w.base.y}`;
 const meters=[['체력',p.hp],...(p.species==='human'?[['포만도',p.food],['수분',p.water]]:[['혈액량',p.blood],['안정도',p.stability]]),['감염',p.infection]];
 $('meters').replaceChildren(...meters.map(([name,value])=>{
  const row=document.createElement('div'), label=document.createElement('div');label.className='meter-label';label.append(span('',name),span('',String(Math.ceil(value))));
  const track=document.createElement('div'),fill=document.createElement('div'); track.className='track'; fill.className='fill'+(name==='감염'?' danger':'');fill.style.width=`${Math.max(0,Math.min(100,value))}%`;track.append(fill);row.append(label,track);return row;
 }));
 $('inventory').replaceChildren(...Object.entries(state.items).map(([id,name])=>{const row=document.createElement('div');row.className='item';row.append(span('',name));const count=document.createElement('strong');count.textContent=w.inventory[id]||0;row.append(count);return row;}));
 $('facilities').replaceChildren(...Object.entries(facilityNames).map(([id,name])=>{const row=document.createElement('div');row.className='facility';const info=document.createElement('div');info.append(span('',`${name} · Lv.${w.base.facilities[id]}`));const cost=document.createElement('small');cost.textContent=w.base.facilities[id]>=3?'최대 레벨':`목재 ${3*(w.base.facilities[id]+1)} · 부품 ${2*(w.base.facilities[id]+1)}`;info.append(cost);row.append(info);const b=document.createElement('button');b.textContent=w.base.facilities[id]?'개선':'건설';b.disabled=w.base.facilities[id]>=3;b.title=`목재 ${3*(w.base.facilities[id]+1)} / 부품 ${2*(w.base.facilities[id]+1)}`;b.onclick=()=>command('build',{facility:id});row.append(b);return row;}));
 $('log').replaceChildren(...w.log.slice(0,5).map(t=>{const li=document.createElement('li');li.textContent=t;return li;}));
 $('quest-progress').textContent=`채집 ${Math.min(5,w.quest.collected)} / 5 · 완료 ${w.quest.round}회`;
 $('dispatch').textContent=w.dispatch?`파견 복귀까지 ${Math.ceil(w.dispatch.ends-w.elapsed)}초`:'파견 대기 · 완료 시 자원 자동 보관';
 const tier=p.unlocks[p.species],forms=p.species==='human'?['도보','오토바이','험비']:['보행','박쥐','거대박쥐'];
 $('mobility').textContent=`이동 연구: ${forms[tier]} · ${p.mounted?'사용 중':'미사용'}`;
 document.querySelectorAll('[data-item]').forEach(b=>{const id=b.dataset.item;b.disabled=!w.inventory[id]||(p.species==='human'?['blood','elixir'].includes(id):['soup','water'].includes(id));});
 draw();
}
function draw() {
 const rect=canvas.getBoundingClientRect(),ratio=Math.min(2,window.devicePixelRatio||1);
 if(canvas.width!==Math.round(rect.width*ratio)||canvas.height!==Math.round(rect.height*ratio)){canvas.width=Math.round(rect.width*ratio);canvas.height=Math.round(rect.height*ratio);}
 ctx.setTransform(ratio,0,0,ratio,0,0);
 const width=rect.width,height=rect.height,scale=Math.min(width/1040,(height-100)/650),tw=23*scale,th=12*scale;
 const ox=width/2,oy=(height-44*th)/2-5;
 projection={ox,oy,tw,th};
 const project=(x,y,z=0)=>[ox+(x-y)*tw,oy+(x+y)*th-z*scale];
 const bg=ctx.createRadialGradient(width*.5,height*.45,10,width*.5,height*.5,width*.7);bg.addColorStop(0,'#344534');bg.addColorStop(1,'#101d18');ctx.fillStyle=bg;ctx.fillRect(0,0,width,height);
 function poly(points,color){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.closePath();ctx.fillStyle=color;ctx.fill();}
 function tile(x,y,color){const [sx,sy]=project(x,y);poly([[sx,sy-th],[sx+tw,sy],[sx,sy+th],[sx-tw,sy]],color);}
 function box(x,y,h,color,wide=.65){const [sx,sy]=project(x,y),a=tw*wide,b=th*wide,z=h*scale;poly([[sx-a,sy-z],[sx,sy-z+b],[sx,sy+b],[sx-a,sy]],'#344337');poly([[sx+a,sy-z],[sx,sy-z+b],[sx,sy+b],[sx+a,sy]],'#26352c');poly([[sx-a,sy-z],[sx,sy-z-b],[sx+a,sy-z],[sx,sy-z+b]],color);}
 function label(text,x,y,color='#d0d7b7'){ctx.font='11px system-ui';ctx.textAlign='center';const m=ctx.measureText(text);ctx.fillStyle='#101b17db';ctx.fillRect(x-m.width/2-5,y-12,m.width+10,18);ctx.fillStyle=color;ctx.fillText(text,x,y);}
 function tree(x,y){const [sx,sy]=project(x,y);ctx.fillStyle='#504c33';ctx.fillRect(sx-2*scale,sy-23*scale,4*scale,23*scale);for(let j=0;j<3;j++){const top=sy-(56-j*12)*scale;poly([[sx,top],[sx+(17+j*3)*scale,top+27*scale],[sx-(17+j*3)*scale,top+27*scale]],['#4f6743','#405b3b','#314c35'][j]);}}
 for(let y=0;y<22;y++)for(let x=0;x<22;x++){
  const n=(x*17+y*13)%7,road=x===10||y===10;
  tile(x,y,road?(n%2?'#62604b':'#5b5b49'):['#3d5138','#40543b','#394d35','#43553b','#3a5039','#405238','#45583c'][n]);
  if(road){const [sx,sy]=project(x,y);ctx.fillStyle='#ac9c6455';ctx.fillRect(sx-2*scale,sy,4*scale,2*scale);}
 }
 if(!state)return;
 const w=state.world,p=w.player;
 for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)tile(w.base.x+x,w.base.y+y,'#74805a');
 if(target){const [tx,ty]=project(target.x,target.y),[px,py]=project(p.x,p.y);ctx.setLineDash([4,6]);ctx.strokeStyle='#e8d59299';ctx.beginPath();ctx.moveTo(px,py);ctx.lineTo(tx,ty);ctx.stroke();ctx.setLineDash([]);ctx.strokeStyle='#e8d592';ctx.beginPath();ctx.ellipse(tx,ty,10,5,0,0,Math.PI*2);ctx.stroke();}
 if(!visualPlayer||Math.hypot(visualPlayer.x-p.x,visualPlayer.y-p.y)>4)visualPlayer={x:p.x,y:p.y};
 visualPlayer.x+=(p.x-visualPlayer.x)*.24;visualPlayer.y+=(p.y-visualPlayer.y)*.24;
 renderPoints=[];
 const scenery=[];
 for(let i=0;i<22;i++){const x=(i*7)%21,y=(i*13+2)%21;if(x===10||y===10||Math.hypot(x-w.base.x,y-w.base.y)<3||state.pois.some(n=>Math.hypot(x-n.x,y-n.y)<1.6))continue;scenery.push({x,y,type:'tree'});}
 const facilities=Object.entries(w.base.facilities).filter(([,level])=>level).map(([id,level],i)=>({x:w.base.x+[-1,1,-1,1][i],y:w.base.y+[-1,-1,1,1][i],id,level,type:'facility'}));
 const entities=[...scenery,...state.pois.map(n=>({...n,type:'poi'})),{...w.base,type:'base'},...facilities,...w.enemies.filter(e=>e.hp>0).map(e=>({...e,type:'enemy'})),{...p,...visualPlayer,type:'player'}].sort((a,b)=>a.x+a.y-b.x-b.y);
 for(const e of entities){const [sx,sy]=project(e.x,e.y);
  if(e.type==='tree'){tree(e.x,e.y);continue;}
  ctx.fillStyle='#07130e45';ctx.beginPath();ctx.ellipse(sx,sy,18*scale,8*scale,0,0,Math.PI*2);ctx.fill();
  if(e.type==='base'){
   box(e.x,e.y,28,'#c8ba86',.95);poly([[sx-23*scale,sy-28*scale],[sx,sy-58*scale],[sx+23*scale,sy-28*scale]],'#bdb37b');poly([[sx,sy-58*scale],[sx+23*scale,sy-28*scale],[sx+9*scale,sy-21*scale]],'#8e9464');ctx.fillStyle='#253c2a';ctx.fillRect(sx-4*scale,sy-24*scale,8*scale,24*scale);ctx.fillStyle='#d0bf7e';ctx.fillRect(sx+25*scale,sy-70*scale,2*scale,60*scale);poly([[sx+27*scale,sy-70*scale],[sx+45*scale,sy-65*scale],[sx+27*scale,sy-58*scale]],'#d7cf95');label('⌂ 아지트',sx,sy-80*scale);renderPoints.push({x:sx,y:sy,id:'base'});
  }
  if(e.type==='facility'){box(e.x,e.y,20,e.id==='alchemy'?'#ad8da8':e.id==='medical'?'#a3c0ac':'#af9d71',.65);ctx.fillStyle='#e3d9b4';ctx.font=`${15*scale}px serif`;ctx.textAlign='center';ctx.fillText({kitchen:'♨',alchemy:'⚗',medical:'+',storage:'▤'}[e.id],sx,sy-23*scale);}
  if(e.type==='poi'){
   if(e.kind==='wood'){tree(e.x-.35,e.y);tree(e.x+.4,e.y+.4);}
   else if(e.kind==='water'){box(e.x,e.y,12,'#a2b3a1');ctx.fillStyle='#67a1a8';ctx.beginPath();ctx.ellipse(sx,sy-12*scale,12*scale,6*scale,0,0,Math.PI*2);ctx.fill();}
   else if(['crop','herb'].includes(e.kind)){tile(e.x,e.y,'#735d42');for(let j=0;j<6;j++){const [gx,gy]=project(e.x+(j%3-1)*.35,e.y+(Math.floor(j/3)-.5)*.6);ctx.strokeStyle=e.kind==='herb'?'#b0b185':'#a3b964';ctx.lineWidth=3*scale;ctx.beginPath();ctx.moveTo(gx,gy);ctx.lineTo(gx-3*scale,gy-10*scale);ctx.moveTo(gx,gy);ctx.lineTo(gx+4*scale,gy-8*scale);ctx.stroke();}}
   else if(e.kind==='metal'){box(e.x,e.y,15,'#8f8e80',.85);box(e.x-.3,e.y-.2,24,'#b2aa88',.45);ctx.fillStyle='#21372c';ctx.fillRect(sx-4*scale,sy-24*scale,10*scale,5*scale);}
   else if(e.kind==='blood'){box(e.x,e.y,24,'#986c68');ctx.fillStyle='#dfa79a';ctx.fillRect(sx-3*scale,sy-22*scale,6*scale,12*scale);ctx.fillRect(sx-7*scale,sy-18*scale,14*scale,4*scale);}
   else {box(e.x,e.y,15,e.id==='human'?'#d0b78a':'#ae8fa4');ctx.fillStyle=e.id==='human'?'#cabc94':'#c7aac7';ctx.beginPath();ctx.arc(sx,sy-31*scale,6*scale,0,Math.PI*2);ctx.fill();ctx.fillRect(sx-5*scale,sy-25*scale,10*scale,14*scale);}
   const near=Math.hypot(p.x-e.x,p.y-e.y)<=2;label(e.label,sx,sy-(e.kind==='wood'?70:48)*scale,e.id===selected||near?'#f4dda1':'#d0d7b7');renderPoints.push({x:sx,y:sy-15*scale,id:e.id});
   if(near){ctx.strokeStyle='#eddda788';ctx.beginPath();ctx.ellipse(sx,sy,22*scale,10*scale,0,0,Math.PI*2);ctx.stroke();}
  }
  if(e.type==='enemy'){ctx.fillStyle='#944f43';ctx.fillRect(sx-5*scale,sy-22*scale,10*scale,18*scale);ctx.fillStyle='#b5ae83';ctx.beginPath();ctx.arc(sx,sy-29*scale,5*scale,0,Math.PI*2);ctx.fill();ctx.fillStyle='#ecb78d';ctx.fillRect(sx-3*scale,sy-30*scale,2*scale,2*scale);ctx.fillStyle='#392d24';ctx.fillRect(sx-14*scale,sy-43*scale,28*scale,3*scale);ctx.fillStyle='#e39479';ctx.fillRect(sx-14*scale,sy-43*scale,28*scale*Math.max(0,e.hp)/60,3*scale);renderPoints.push({x:sx,y:sy,id:'enemy:'+e.id});}
  if(e.type==='player'){
   ctx.strokeStyle='#f2e9b4';ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(sx,sy,12*scale,6*scale,0,0,Math.PI*2);ctx.stroke();ctx.fillStyle=p.species==='human'?'#ded9ae':'#c3a3c7';
   if(p.mounted&&p.species==='vampire'){const flap=Math.sin(performance.now()/150)*6;poly([[sx-28*scale,sy-(26+flap)*scale],[sx-13*scale,sy-12*scale],[sx,sy-18*scale],[sx+13*scale,sy-12*scale],[sx+28*scale,sy-(26+flap)*scale],[sx,sy-30*scale]],'#ba96c5');}
   else {if(p.mounted){box(e.x,e.y,12,'#8f9b80',p.unlocks.human===2?1:.7);}ctx.fillRect(sx-5*scale,sy-24*scale,10*scale,18*scale);ctx.fillStyle=p.species==='human'?'#b7a47c':'#73557f';ctx.fillRect(sx-7*scale,sy-22*scale,5*scale,12*scale);ctx.fillStyle='#e9d6b0';ctx.beginPath();ctx.arc(sx,sy-30*scale,5*scale,0,Math.PI*2);ctx.fill();}
   label('YOU',sx,sy-46*scale,'#fff2c0');
   if(performance.now()<attackUntil){ctx.strokeStyle='#ffe4a3';ctx.lineWidth=4*scale;ctx.beginPath();ctx.arc(sx,sy-12*scale,32*scale,-1.1,1.2);ctx.stroke();}
  }
 }
 if(performance.now()<hurtUntil){ctx.fillStyle='#d6533822';ctx.fillRect(0,0,width,height);}
}
function navigate(x,y,id=null){if(!state?.world.player.chosen||state.world.paused)return;target={x:Math.max(1,Math.min(20,x)),y:Math.max(1,Math.min(20,y)),id};selected=id;}
canvas.addEventListener('click',e=>{
 if(!projection||!state)return;
 const r=canvas.getBoundingClientRect(),cx=e.clientX-r.left,cy=e.clientY-r.top;
 const node=renderPoints.map(n=>({...n,d:Math.hypot(n.x-cx,n.y-cy)})).filter(n=>n.d<32).sort((a,b)=>a.d-b.d)[0];
 if(node){if(node.id==='base')navigate(state.world.base.x,state.world.base.y);else if(node.id.startsWith('enemy:')){const enemy=state.world.enemies.find(n=>n.id===Number(node.id.split(':')[1]));navigate(enemy.x,enemy.y,node.id);}else{const poi=state.pois.find(n=>n.id===node.id);navigate(poi.x,poi.y,poi.id);}}
 else {const {ox,oy,tw,th}=projection;const x=((cx-ox)/tw+(cy-oy)/th)/2,y=((cy-oy)/th-(cx-ox)/tw)/2;if(x>=0&&y>=0&&x<22&&y<22)navigate(x,y);}
 canvas.focus({preventScroll:true});
});
$('go-home').onclick=()=>state&&navigate(state.world.base.x,state.world.base.y);
$('interact').onclick=()=>interact();
$('pause').onclick=()=>command('pause');
document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>command(b.dataset.action));
document.querySelectorAll('[data-item]').forEach(b=>b.onclick=()=>command('consume',{item:b.dataset.item}));
document.querySelectorAll('[data-recipe]').forEach(b=>b.onclick=()=>command('craft',{recipe:b.dataset.recipe}));
document.querySelectorAll('[data-species]').forEach(b=>b.onclick=()=>command('choose',{species:b.dataset.species}));
const held=new Set();
function interact(){target=null;if(!state)return;const p=state.world.player;const nearby=[...state.pois].sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];command(nearby.kind==='npc'?'quest':'gather',{id:nearby.id});}
window.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA','SELECT','BUTTON'].includes(e.target.tagName))return;const k=e.key.toLowerCase();if(['w','a','s','d','arrowup','arrowleft','arrowdown','arrowright',' '].includes(k)){e.preventDefault();target=null;held.add(k);}if(!e.repeat&&k==='e')interact();if(!e.repeat&&k==='m')command('mount');if(!e.repeat&&k===' ')command('attack');});
window.addEventListener('keyup',e=>held.delete(e.key.toLowerCase()));
window.addEventListener('blur',()=>{held.clear();target=null;});
document.addEventListener('visibilitychange',()=>{held.clear();target=null;});
setInterval(()=>{
 if(!state||!connected||busy||state.world.paused||!state.world.player.chosen||document.hidden)return;
 let dx=0,dy=0;
 if(held.has('w')||held.has('arrowup'))dy--;if(held.has('s')||held.has('arrowdown'))dy++;
 if(held.has('a')||held.has('arrowleft'))dx--;if(held.has('d')||held.has('arrowright'))dx++;
 if(target && !dx && !dy){
  const p=state.world.player;
  const enemy=target.id?.startsWith('enemy:')?state.world.enemies.find(n=>n.id===Number(target.id.split(':')[1])):null;
  if(enemy){if(enemy.hp<=0){target=null;return;}target.x=enemy.x;target.y=enemy.y;}
  const distance=Math.hypot(target.x-p.x,target.y-p.y),step=p.mounted ? .42*(1.55+p.unlocks[p.species]*.25) : .42;
  if(distance<=(target.id?1.5:step*.8)){
   const id=target.id;target=null;
   if(id?.startsWith('enemy:'))command('attack');
   else if(id){const poi=state.pois.find(n=>n.id===id);command(poi.kind==='npc'?'quest':'gather',{id});}
   return;
  }
  dx=Math.abs(target.x-p.x)>step*.42?Math.sign(target.x-p.x):0;
  dy=Math.abs(target.y-p.y)>step*.42?Math.sign(target.y-p.y):0;
 }
 if(dx||dy)command('move',{dx,dy});
},150);
function updateGuide(){
 const w=state.world,p=w.player,m=w.milestones||[],human=p.species==='human',facility=human?'kitchen':'alchemy',meal=human?'soup':'elixir';
 const steps=[
  [p.chosen,'시작 종족 선택','인간과 뱀파이어 중 첫 삶을 선택하세요. 의료실에서 전환할 수 있습니다.'],
  [m.includes('gather'),'첫 자원 채집','목재나 식수 지점을 클릭하세요. 이동한 뒤 한 번 채집합니다.'],
  [w.base.facilities[facility]>0,human?'아지트에 주방 건설':'아지트에 연금대 건설','아지트 근처에서 오른쪽 시설의 건설 버튼을 누르세요. 목재 3 · 부품 2'],
  [m.includes('craft:'+meal),human?'따뜻한 수프 제작':'안정화 혈액 제작',human?'아지트에서 수프 제작: 작물 2 · 식수 1':'아지트에서 강화혈액 제작: 원혈 2 · 약초 1 · 식수 1'],
  [m.includes('consume:'+meal),human?'첫 식사 하기':'강화혈액 마시기','생존자 패널에서 만든 소모품을 사용해 생활 지표를 회복하세요.']
 ];
 const next=steps.find(s=>!s[0]),count=steps.filter(s=>s[0]).length;
 $('objective').textContent=next?next[1]:'첫 생존 완료 · 이제 나만의 아지트를 키워보세요';
 $('objective-detail').textContent=next?next[2]:'보급 의뢰, 의료실, 이동 연구와 종족 전환을 탐험하세요.';
 $('objective-count').textContent=`${count} / 5`;
 $('objective-steps').replaceChildren(...steps.map(s=>{const i=document.createElement('i');i.className=s[0]?'done':'';return i;}));
 const nearest=[...state.pois].sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];
 const distance=Math.hypot(nearest.x-p.x,nearest.y-p.y),close=distance<=(nearest.kind==='npc'?2.5:2);
 const cooldown=Math.max(0,Math.ceil((w.cooldowns[nearest.id]||0)-w.elapsed));
 $('nearby-label').textContent=close?nearest.label:'지도 클릭으로 탐험';
 $('interact').disabled=!close||!!cooldown||w.paused;
 $('interact').textContent=cooldown?`${cooldown}초 대기`:nearest.kind==='npc'?'E · 의뢰 보고':'E · 채집';
 $('location-hint').textContent=Math.hypot(p.x-w.base.x,p.y-w.base.y)<=2.5?'● 안전지대 · 아지트':w.enemies.some(e=>e.hp>0&&Math.hypot(p.x-e.x,p.y-e.y)<4.8)?'● 감염체 접근 · 공격하거나 후퇴하세요':'◇ 탐색 중 · '+p.x.toFixed(1)+' / '+p.y.toFixed(1);
}
async function poll(){if(polling||busy||document.hidden)return;polling=true;try{accept(await api('/api/state'));}catch(e){connected=false;target=null;$('connection').textContent=e.message;$('connection').classList.add('status-error');if(!state){$('objective').textContent='서버 접속 링크를 확인하세요';$('objective-detail').textContent=e.message;}}finally{polling=false;}}
setInterval(poll,400);function frame(){if(!document.hidden)draw();requestAnimationFrame(frame);}frame();poll();
