const $ = id => document.getElementById(id);
const query = new URLSearchParams(location.hash.slice(1));
if(query.has('key')) { sessionStorage.setItem('bloodfall-key', query.get('key')); history.replaceState(null,'',location.pathname); }
const key = sessionStorage.getItem('bloodfall-key') || '';
// Deliberately per-tab: a second tab must not silently share control of this P0 world.
const session = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}-${Math.random()}`;
let state = null, busy = false, connected = false, polling = false, toastTimer, selected = null;
let target=null, attackUntil=0, hurtUntil=0, pendingAction=null, pendingTimer=null, lastCommandAt=-Infinity, lastMove= -Infinity;
const held=new Set(), touchHeld=new Set();
const canvas=$('world'), view=new WorldView(canvas,$('minimap'));
const facilityRows=new Map();
const facilityNames = {kitchen:'주방',alchemy:'연금대',medical:'의료실',storage:'저장고'};
function toast(message) { $('toast').textContent=message; $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2600); }
async function api(path, body) {
 const response = await fetch(path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Access-Key':key,'X-Session-ID':session},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(5000)});
 const data = await response.json();
 if(!response.ok) { const error=new Error(data.error || '서버 오류'); error.status=response.status; throw error; }
 connected=true; $('connection').classList.remove('status-error'); $('connection').textContent='● 서버 연결 · 자동 저장'; return data;
}
function schedulePending(){
 clearTimeout(pendingTimer);
 if(!pendingAction||busy)return;
 pendingTimer=setTimeout(()=>{
  const next=pendingAction;pendingAction=null;pendingTimer=null;
  if(next)command(next.action,next.fields);
 },Math.max(0,75-(performance.now()-lastCommandAt)));
}
async function command(action, fields={}) {
 if(!state||!connected)return;
 if(busy||performance.now()-lastCommandAt<75){
  if(action!=='move'){pendingAction={action,fields};schedulePending();}
  return;
 }
 busy=true;
 try {
  accept(await api('/api/action',{revision:state.world.revision,command:{action,...fields}}));
  if(action==='attack')attackUntil=performance.now()+260;
 }catch(e){
  if(e.status===409){
   try{accept(await api('/api/state'));}catch{connected=false;clearMovement();}
  }else if(!e.status){connected=false;clearMovement();}
  if(action!=='move')toast(e.message);
 }finally{
  lastCommandAt=performance.now();busy=false;schedulePending();
 }
}
function accept(data) { if(!state || data.world.revision >= state.world.revision) { if(state && data.world.player.hp<state.world.player.hp)hurtUntil=performance.now()+350; state=data; update(); } }
function span(className,text) { const n=document.createElement('span'); n.className=className; n.textContent=text; return n; }
function update() {
 if(!state) return;
 const w=state.world,p=w.player;
 $('welcome').hidden=p.chosen; $('interaction').hidden=!p.chosen; if(w.paused)clearMovement(); updateGuide();
 const region=view.region(state,p.x,p.y);$('region-name').textContent=region.name;$('region-description').textContent=region.subtitle;
 $('coordinates').textContent=`${Math.floor(p.x).toString().padStart(2,'0')} / ${Math.floor(p.y).toString().padStart(2,'0')}`;
 $('species').textContent=!p.chosen?'새로운 생존자':p.species==='human'?'인간 · 생존자':'뱀파이어 · 혈족';
 $('pause-overlay').hidden=!w.paused;
 $('pause').textContent=w.paused?'계속하기':'일시정지';

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
 for(const [id,name] of Object.entries(facilityNames)){
  if(!facilityRows.has(id)){
   const row=document.createElement('div'),info=document.createElement('div'),title=span('',''),cost=document.createElement('small'),button=document.createElement('button');
   row.className='facility';info.append(title,cost);row.append(info,button);$('facilities').append(row);
   button.onclick=()=>manualAction('build',{facility:id});facilityRows.set(id,{title,cost,button});
  }
  const {title,cost,button}=facilityRows.get(id),level=w.base.facilities[id];
  title.textContent=`${name} · Lv.${level}`;cost.textContent=level>=3?'최대 레벨':`목재 ${3*(level+1)} · 부품 ${2*(level+1)}`;
  button.textContent=level?'개선':'건설';button.disabled=level>=3;button.title=cost.textContent;
 }
 $('log').replaceChildren(...w.log.slice(0,5).map(t=>{const li=document.createElement('li');li.textContent=t;return li;}));
 $('quest-progress').textContent=`채집 ${Math.min(5,w.quest.collected)} / 5 · 완료 ${w.quest.round}회`;
 $('dispatch').textContent=w.dispatch?`파견 복귀까지 ${Math.ceil(w.dispatch.ends-w.elapsed)}초`:'파견 대기 · 완료 시 자원 자동 보관';
 const tier=p.unlocks[p.species],forms=p.species==='human'?['도보','오토바이','험비']:['보행','박쥐','거대박쥐'];
 $('mobility').textContent=`이동 연구: ${forms[tier]} · ${p.mounted?'사용 중':'미사용'}`;
 document.querySelectorAll('[data-item]').forEach(b=>{const id=b.dataset.item;b.disabled=!w.inventory[id]||(p.species==='human'?['blood','elixir'].includes(id):['soup','water'].includes(id));});
 draw();
}
function draw(){view.draw(state,target,selected,{attackUntil,hurtUntil});}
function clearMovement(){held.clear();touchHeld.clear();target=null;document.querySelectorAll('[data-direction]').forEach(b=>b.classList.remove('pressed'));}
function navigate(x,y,id=null){
 if(!state?.world.player.chosen||state.world.paused||!connected)return;
 clearMovement();const max=state.map.size-2;
 target={x:Math.max(1,Math.min(max,x)),y:Math.max(1,Math.min(max,y)),id};selected=id;
}
function changeZoom(amount){const value=view.setZoom(view.zoom+amount);$('zoom-level').textContent=`${Math.round(value*100)}%`;draw();}
function toggleFocus(){const active=document.body.classList.toggle('focus-mode');$('focus-view').setAttribute('aria-pressed',String(active));draw();}
canvas.addEventListener('click',e=>{
 if(!view.projection||!state)return;
 const r=canvas.getBoundingClientRect(),cx=e.clientX-r.left,cy=e.clientY-r.top;
 const node=view.points.map(n=>({...n,d:Math.hypot(n.x-cx,n.y-cy)})).filter(n=>cx>=n.left&&cx<=n.right&&cy>=n.top&&cy<=n.bottom).sort((a,b)=>a.d-b.d)[0];
 if(node){
  if(node.id==='base')navigate(state.world.base.x,state.world.base.y);
  else if(node.id.startsWith('enemy:')){const enemy=state.world.enemies.find(n=>n.id===Number(node.id.split(':')[1]));if(enemy)navigate(enemy.x,enemy.y,node.id);}
  else{const poi=state.pois.find(n=>n.id===node.id);if(poi)navigate(poi.x,poi.y,poi.id);}
 }else{const point=view.toWorld(cx,cy);if(point.x>=0&&point.y>=0&&point.x<state.map.size&&point.y<state.map.size)navigate(point.x,point.y);}
 canvas.focus({preventScroll:true});stepMovement();
});
canvas.addEventListener('wheel',e=>{e.preventDefault();changeZoom(e.deltaY<0?.1:-.1);},{passive:false});
$('minimap').addEventListener('click',e=>{
 if(!state)return;const r=$('minimap').getBoundingClientRect(),x=(e.clientX-r.left)/r.width*state.map.size,y=(e.clientY-r.top)/r.height*state.map.size;
 const poi=state.pois.find(n=>Math.hypot(n.x-x,n.y-y)<1.5);
 navigate(poi?poi.x:x,poi?poi.y:y,poi?.id);canvas.focus({preventScroll:true});stepMovement();
});
$('zoom-in').onclick=()=>changeZoom(.1);$('zoom-out').onclick=()=>changeZoom(-.1);$('focus-view').onclick=toggleFocus;
$('go-home').onclick=()=>{if(state){navigate(state.world.base.x,state.world.base.y);stepMovement();}};
$('interact').onclick=()=>interact();
function manualAction(action,fields={}){clearMovement();pendingAction=null;clearTimeout(pendingTimer);command(action,fields);}
$('pause').onclick=()=>manualAction('pause');
document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>manualAction(b.dataset.action));
document.querySelectorAll('[data-item]').forEach(b=>b.onclick=()=>manualAction('consume',{item:b.dataset.item}));
document.querySelectorAll('[data-recipe]').forEach(b=>b.onclick=()=>manualAction('craft',{recipe:b.dataset.recipe}));
document.querySelectorAll('[data-species]').forEach(b=>b.onclick=()=>manualAction('choose',{species:b.dataset.species}));
const tabs=[...document.querySelectorAll('[data-tab]')];
function selectTab(button){
 for(const tab of tabs){const active=tab===button;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;$('panel-'+tab.dataset.tab).hidden=!active;}
}
for(const tab of tabs){
 tab.onclick=()=>selectTab(tab);
 tab.addEventListener('keydown',e=>{
  if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;
  e.preventDefault();e.stopPropagation();const i=tabs.indexOf(tab),index=e.key==='Home'?0:e.key==='End'?tabs.length-1:(i+(e.key==='ArrowRight'?1:-1)+tabs.length)%tabs.length;
  selectTab(tabs[index]);tabs[index].focus();
 });
}
function interact(){
 clearMovement();if(!state)return;const p=state.world.player;
 const nearby=[...state.pois].sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];
 if(nearby)command(nearby.kind==='npc'?'quest':'gather',{id:nearby.id});
}
function screenDirection(){
 const keys=new Set([...held,...touchHeld]);
 const horizontal=Number(keys.has('d')||keys.has('arrowright'))-Number(keys.has('a')||keys.has('arrowleft'));
 const vertical=Number(keys.has('s')||keys.has('arrowdown'))-Number(keys.has('w')||keys.has('arrowup'));
 // Inverse of the isometric projection: up means up on the screen.
 return {dx:Math.sign(horizontal+vertical),dy:Math.sign(vertical-horizontal)};
}
const moveKeys=['w','a','s','d','arrowup','arrowleft','arrowdown','arrowright'];
window.addEventListener('keydown',e=>{
 if(e.target.isContentEditable||['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)||e.ctrlKey||e.metaKey||e.altKey)return;
 const k=e.key.toLowerCase();
 if(moveKeys.includes(k)){e.preventDefault();target=null;held.add(k);stepMovement();}
 if(e.repeat)return;
 if(k==='escape'){clearMovement();pendingAction=null;clearTimeout(pendingTimer);}
 if(k==='e'){e.preventDefault();interact();}
 if(k==='m')manualAction('mount');
 if(k==='v')toggleFocus();
 if(k===' '&&e.target.tagName!=='BUTTON'){e.preventDefault();manualAction('attack');}
});
window.addEventListener('keyup',e=>held.delete(e.key.toLowerCase()));
window.addEventListener('blur',()=>{clearMovement();pendingAction=null;clearTimeout(pendingTimer);});
document.addEventListener('visibilitychange',()=>{clearMovement();pendingAction=null;clearTimeout(pendingTimer);});
const touchKeys={up:'w',left:'a',down:'s',right:'d'};
for(const button of document.querySelectorAll('[data-direction]')){
 const key=touchKeys[button.dataset.direction];
 button.addEventListener('pointerdown',e=>{e.preventDefault();target=null;touchHeld.add(key);button.classList.add('pressed');button.setPointerCapture(e.pointerId);stepMovement();});
 const release=()=>{touchHeld.delete(key);button.classList.remove('pressed');};
 button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);
}
function stepMovement(){
 if(!state||!connected||busy||pendingAction||state.world.paused||!state.world.player.chosen||document.hidden)return;
 const now=performance.now();if(now-lastMove<140)return;
 let {dx,dy}=screenDirection();
 if(target&&!dx&&!dy){
  const p=state.world.player,m=state.map.movement;
  const enemy=target.id?.startsWith('enemy:')?state.world.enemies.find(n=>n.id===Number(target.id.split(':')[1])):null;
  if(enemy){if(enemy.hp<=0){target=null;return;}target.x=enemy.x;target.y=enemy.y;}
  const distance=Math.hypot(target.x-p.x,target.y-p.y),step=m.step*(p.mounted?m.mount_base+p.unlocks[p.species]*m.mount_tier:1);
  if(distance<=(target.id?1.5:step*.8)){
   const id=target.id;target=null;
   if(id?.startsWith('enemy:'))command('attack');
   else if(id){const poi=state.pois.find(n=>n.id===id);if(poi)command(poi.kind==='npc'?'quest':'gather',{id});}
   return;
  }
  dx=Math.abs(target.x-p.x)>step*.42?Math.sign(target.x-p.x):0;
  dy=Math.abs(target.y-p.y)>step*.42?Math.sign(target.y-p.y):0;
 }
 if(dx||dy){lastMove=now;command('move',{dx,dy});}
}
setInterval(stepMovement,35);
function updateGuide(){
 const w=state.world,p=w.player,m=w.milestones||[],human=p.species==='human',facility=human?'kitchen':'alchemy',meal=human?'soup':'elixir';
 const steps=[
  [p.chosen,'시작 종족 선택','인간과 뱀파이어 중 첫 삶을 선택하세요. 의료실에서 전환할 수 있습니다.'],
  [m.includes('gather'),'첫 자원 채집','목재나 식수 지점을 클릭하세요. 이동한 뒤 한 번 채집합니다.'],
  [w.base.facilities[facility]>0,human?'아지트에 주방 건설':'아지트에 연금대 건설','아지트 근처에서 아지트 탭의 건설 버튼을 누르세요. 목재 3 · 부품 2'],
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
 const cooldown=close?Math.max(0,Math.ceil((w.cooldowns[nearest.id]||0)-w.elapsed)):0;
 $('nearby-label').textContent=close?nearest.label:'지도 클릭으로 탐험';
 $('interact').disabled=!close||!!cooldown||w.paused;
 $('interact').textContent=cooldown?`${cooldown}초 대기`:nearest.kind==='npc'?'E · 의뢰 보고':'E · 채집';
 $('location-hint').textContent=Math.hypot(p.x-w.base.x,p.y-w.base.y)<=2.5?'● 안전지대 · 아지트':w.enemies.some(e=>e.hp>0&&Math.hypot(p.x-e.x,p.y-e.y)<4.8)?'● 감염체 접근 · 공격하거나 후퇴하세요':'◇ 탐색 중 · '+p.x.toFixed(1)+' / '+p.y.toFixed(1);
}
async function poll(){if(polling||busy||document.hidden)return;polling=true;try{accept(await api('/api/state'));}catch(e){connected=false;clearMovement();$('connection').textContent=e.message;$('connection').classList.add('status-error');if(!state){$('objective').textContent='서버 접속 링크를 확인하세요';$('objective-detail').textContent=e.message;}}finally{polling=false;}}
setInterval(poll,400);function frame(){if(!document.hidden)draw();requestAnimationFrame(frame);}frame();poll();
