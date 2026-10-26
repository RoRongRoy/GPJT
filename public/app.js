const $ = id => document.getElementById(id);
const query = new URLSearchParams(location.hash.slice(1));
if(query.has('key')) { sessionStorage.setItem('bloodfall-key', query.get('key')); history.replaceState(null,'',location.pathname); }
const key = sessionStorage.getItem('bloodfall-key') || '';
// Deliberately per-tab: a second tab must not silently share control of this P0 world.
const session = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}-${Math.random()}`;
let state = null, busy = false, connected = false, polling = false, toastTimer, selected = null;
let renderPoints = [];
const canvas = $('world'), ctx = canvas.getContext('2d');
const facilityNames = {kitchen:'주방',alchemy:'연금대',medical:'의료실',storage:'저장고'};
function toast(message) { $('toast').textContent=message; $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2600); }
async function api(path, body) {
 const response = await fetch(path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Access-Key':key,'X-Session-ID':session},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(5000)});
 const data = await response.json();
 if(!response.ok) throw new Error(data.error || '서버 오류');
 connected=true; $('connection').textContent='● 서버 연결 · 자동 저장'; return data;
}
async function command(action, fields={}) {
 if(busy || !state || !connected) return;
 busy=true;
 try { accept(await api('/api/action',{revision:state.world.revision,command:{action,...fields}})); }
 catch(e) { if(action!=='move') toast(e.message); }
 finally { busy=false; }
}
function accept(data) { if(!state || data.world.revision >= state.world.revision) { state=data; update(); } }
function span(className,text) { const n=document.createElement('span'); n.className=className; n.textContent=text; return n; }
function update() {
 if(!state) return;
 const w=state.world,p=w.player;
 $('welcome').hidden=p.chosen;
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
 $('facilities').replaceChildren(...Object.entries(facilityNames).map(([id,name])=>{const row=document.createElement('div');row.className='facility';row.append(span('',`${name} · Lv.${w.base.facilities[id]}`));const b=document.createElement('button');b.textContent=w.base.facilities[id]?'개선':'건설';b.disabled=w.base.facilities[id]>=3;b.title=`목재 ${3*(w.base.facilities[id]+1)} / 부품 ${2*(w.base.facilities[id]+1)}`;b.onclick=()=>command('build',{facility:id});row.append(b);return row;}));
 $('log').replaceChildren(...w.log.slice(0,5).map(t=>{const li=document.createElement('li');li.textContent=t;return li;}));
 $('quest-progress').textContent=`채집 ${Math.min(5,w.quest.collected)} / 5 · 완료 ${w.quest.round}회`;
 $('dispatch').textContent=w.dispatch?`파견 복귀까지 ${Math.ceil(w.dispatch.ends-w.elapsed)}초`:'파견 대기 · 완료 시 자원 자동 보관';
 const tier=p.unlocks[p.species],forms=p.species==='human'?['도보','오토바이','험비']:['보행','박쥐','거대박쥐'];
 $('mobility').textContent=`이동 연구: ${forms[tier]} · ${p.mounted?'사용 중':'미사용'}`;
 document.querySelectorAll('[data-item]').forEach(b=>{const id=b.dataset.item;b.disabled=!w.inventory[id]||(p.species==='human'?['blood','elixir'].includes(id):['soup','water'].includes(id));});
 draw();
}
function draw() {
 const rect=canvas.getBoundingClientRect(), ratio=window.devicePixelRatio||1;
 canvas.width=rect.width*ratio;canvas.height=rect.height*ratio;ctx.setTransform(ratio,0,0,ratio,0,0);
 const width=rect.width,height=rect.height;
 ctx.fillStyle='#131d20';ctx.fillRect(0,0,width,height);
 const scale=Math.min(width/1050,height/640),tw=38*scale,th=19*scale,ox=width/2,oy=height/2-20*th;
 const project=(x,y,z=0)=>[ox+(x-y)*tw,oy+(x+y)*th-z*scale];
 function diamond(x,y,color){const [sx,sy]=project(x,y);ctx.beginPath();ctx.moveTo(sx,sy);ctx.lineTo(sx+tw,sy+th);ctx.lineTo(sx,sy+th*2);ctx.lineTo(sx-tw,sy+th);ctx.closePath();ctx.fillStyle=color;ctx.fill();ctx.strokeStyle='#2b3839';ctx.lineWidth=.45;ctx.stroke();}
 function block(x,y,h,color){let [sx,sy]=project(x,y);sy+=th;ctx.fillStyle=color;ctx.beginPath();ctx.moveTo(sx-tw*.65,sy-h*scale);ctx.lineTo(sx,sy-h*scale-th*.65);ctx.lineTo(sx+tw*.65,sy-h*scale);ctx.lineTo(sx,sy-h*scale+th*.65);ctx.closePath();ctx.fill();ctx.fillStyle='#354746';ctx.beginPath();ctx.moveTo(sx-tw*.65,sy-h*scale);ctx.lineTo(sx,sy-h*scale+th*.65);ctx.lineTo(sx,sy+th*.65);ctx.lineTo(sx-tw*.65,sy);ctx.closePath();ctx.fill();ctx.fillStyle='#293b3a';ctx.beginPath();ctx.moveTo(sx+tw*.65,sy-h*scale);ctx.lineTo(sx,sy-h*scale+th*.65);ctx.lineTo(sx,sy+th*.65);ctx.lineTo(sx+tw*.65,sy);ctx.closePath();ctx.fill();}
 for(let x=0;x<22;x++)for(let y=0;y<22;y++){const road=x===10||y===10;diamond(x,y,road?'#394345':((x*17+y*13)%7===0?'#2c3b36':'#23302e'));}
 if(!state) return;
 const w=state.world,p=w.player;
 for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)diamond(w.base.x+x,w.base.y+y,'#42584c');
 renderPoints=[];
 const entities=[...state.pois.map(n=>({...n,type:'poi'})),{...w.base,type:'base'},...w.enemies.filter(e=>e.hp>0).map(e=>({...e,type:'enemy'})),{...p,type:'player'}].sort((a,b)=>a.x+a.y-b.x-b.y);
 entities.forEach(e=>{
  const [sx,sy0]=project(e.x,e.y),sy=sy0+th;
  if(e.type==='base'){block(e.x,e.y,44,'#b4c5a2');ctx.strokeStyle='#e1e4c4';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(sx,sy-42*scale);ctx.lineTo(sx,sy-76*scale);ctx.stroke();ctx.fillStyle='#b3cda1';ctx.fillRect(sx,sy-76*scale,20*scale,10*scale);label('아지트',sx,sy-87*scale,'#c9dec3');}
  if(e.type==='poi'){block(e.x,e.y,e.kind==='npc'?25:16,e.kind==='npc'?'#8d9fbb':'#9b987b');label(e.label,sx,sy-35*scale,e.id===selected?'#f3d798':'#a5b3a8');renderPoints.push({x:sx,y:sy,id:e.id});}
  if(e.type==='enemy'){ctx.fillStyle='#aa6961';ctx.beginPath();ctx.ellipse(sx,sy-7*scale,6*scale,9*scale,0,0,Math.PI*2);ctx.fill();ctx.fillStyle='#d79e8c';ctx.beginPath();ctx.arc(sx,sy-19*scale,4*scale,0,Math.PI*2);ctx.fill();}
  if(e.type==='player'){
   ctx.strokeStyle='#d3e4b6';ctx.lineWidth=1.5;ctx.beginPath();ctx.ellipse(sx,sy,13*scale,6*scale,0,0,Math.PI*2);ctx.stroke();
   ctx.fillStyle=p.species==='human'?'#b8d3c1':'#bb9ac6';
   if(p.mounted&&p.species==='vampire'){ctx.beginPath();ctx.moveTo(sx-24*scale,sy-19*scale);ctx.lineTo(sx,sy-11*scale);ctx.lineTo(sx+24*scale,sy-19*scale);ctx.lineTo(sx,sy-30*scale);ctx.closePath();ctx.fill();}
   else{ctx.fillRect(sx-5*scale,sy-21*scale,10*scale,17*scale);ctx.beginPath();ctx.arc(sx,sy-28*scale,5*scale,0,Math.PI*2);ctx.fill();if(p.mounted){ctx.strokeStyle='#d0b57e';ctx.strokeRect(sx-16*scale,sy-10*scale,32*scale,10*scale);}}
   label('YOU',sx,sy-40*scale,'#e7f0d8');
  }
 });
 function label(text,x,y,color){ctx.font=`${Math.max(9,11*scale)}px system-ui`;ctx.textAlign='center';ctx.fillStyle='#131d20dd';const m=ctx.measureText(text);ctx.fillRect(x-m.width/2-4,y-11,m.width+8,15);ctx.fillStyle=color;ctx.fillText(text,x,y);}
}
canvas.addEventListener('click',e=>{const r=canvas.getBoundingClientRect();const node=renderPoints.find(n=>Math.hypot(n.x-(e.clientX-r.left),n.y-(e.clientY-r.top))<30);if(node){selected=node.id;const n=state.pois.find(p=>p.id===node.id);toast(n.label+' · 가까이 이동 후 E');draw();}canvas.focus();});
$('pause').onclick=()=>command('pause');
document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>command(b.dataset.action));
document.querySelectorAll('[data-item]').forEach(b=>b.onclick=()=>command('consume',{item:b.dataset.item}));
document.querySelectorAll('[data-recipe]').forEach(b=>b.onclick=()=>command('craft',{recipe:b.dataset.recipe}));
document.querySelectorAll('[data-species]').forEach(b=>b.onclick=()=>command('choose',{species:b.dataset.species}));
const held=new Set();
function interact(){if(!state)return;const p=state.world.player;const nearby=[...state.pois].sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];command(nearby.kind==='npc'?'quest':'gather',{id:nearby.id});}
window.addEventListener('keydown',e=>{if(e.target.tagName==='INPUT')return;const k=e.key.toLowerCase();if(['w','a','s','d','arrowup','arrowleft','arrowdown','arrowright',' '].includes(k)){e.preventDefault();held.add(k);}if(!e.repeat&&k==='e')interact();if(!e.repeat&&k==='m')command('mount');if(!e.repeat&&k===' ')command('attack');});
window.addEventListener('keyup',e=>held.delete(e.key.toLowerCase()));
window.addEventListener('blur',()=>held.clear());
document.addEventListener('visibilitychange',()=>held.clear());
setInterval(()=>{if(!state||state.world.paused||!state.world.player.chosen||document.hidden)return;let dx=0,dy=0;if(held.has('w')||held.has('arrowup'))dy--;if(held.has('s')||held.has('arrowdown'))dy++;if(held.has('a')||held.has('arrowleft'))dx--;if(held.has('d')||held.has('arrowright'))dx++;if(dx||dy)command('move',{dx,dy});},150);
async function poll(){if(polling||busy||document.hidden)return;polling=true;try{accept(await api('/api/state'));}catch(e){connected=false;$('connection').textContent='연결 대기';if(!state)toast(e.message);}finally{polling=false;}}
setInterval(poll,400);window.addEventListener('resize',draw);draw();poll();
