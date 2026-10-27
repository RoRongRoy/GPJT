const $ = id => document.getElementById(id);
const query = new URLSearchParams(location.hash.slice(1));
if(query.has('key')) { sessionStorage.setItem('bloodfall-key', query.get('key')); history.replaceState(null,'',location.pathname); }
const key = sessionStorage.getItem('bloodfall-key') || '';
// Deliberately per-tab: a second tab must not silently share control of this P0 world.
const session = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}-${Math.random()}`;
let state = null, busy = false, connected = false, polling = false, toastTimer, selected = null;
let target=null, hurtUntil=0, pendingAction=null, pendingTimer=null, lastCommandAt=-Infinity, lastMove= -Infinity, autoHunt=false;
const held=new Set(), touchHeld=new Set();
const canvas=$('world'), view=new WorldView(canvas,$('minimap'));
const facilityRows=new Map();
let activePanel=null, panelOpener=null, inventoryFilter='all', selectedRecipe='soup';
const campPanels=new Set(['camp','craft','build','research','dispatch']);
const campActions=new Set(['craft','build','enhance','research','convert','dispatch']);
const panelInfo={
 survival:['생존','내 상태를 살피고 필요한 소모품을 사용하세요.','SURVIVOR'],
 equip:['장착 장비','현재 착용 중인 무기·방어구와 보유 장비를 확인하고 장착·해제하세요.','EQUIPMENT'],
 bag:['인벤토리','아이템을 선택해 정보를 확인하고 사용하세요.','INVENTORY'],
 journal:['수첩','확인하고 싶은 기록을 선택하세요.','FIELD JOURNAL'],
 guide:['첫 생존','작은 목표를 하나씩 완성해보세요.','FIRST NIGHT'],
 quests:['의뢰','물자를 모으고 다음 하루를 준비하세요.','SUPPLY RUN'],
 log:['생존 기록','최근에 일어난 일입니다.','FIELD NOTES'],
 travel:['이동','돌아갈 곳과 다음 여정을 정하세요.','EXPEDITION'],
 camp:['아지트','지금 하고 싶은 일을 선택하세요.','HOME, FOR NOW'],
 craft:['제작','제작 분류를 선택하고 필요한 재료를 확인하세요.','WORKSHOP'],
 build:['시설','시설을 건설하거나 한 단계 개선하세요.','CONSTRUCTION'],
 research:['연구·성장','장비와 이동 형태, 다음 삶을 준비하세요.','RESEARCH'],
 dispatch:['파견','동료와 종복에게 보급 임무를 맡기세요.','COMPANIONS'],
 account:['계정 저장 · 불러오기','신규 모험자의 진행 상황을 계정/비밀번호로 서버에 저장하거나 불러오세요.','ACCOUNT & SAVE'],
};
const panelParents={guide:'journal',quests:'journal',log:'journal',craft:'camp',build:'camp',research:'camp',dispatch:'camp'};
const recipeDetails={soup:['♨','포만도 +45 · 수분 +15'],elixir:['⚗','혈액량 +40 · 안정도 +45'],medicine:['+','체력 +40 · 감염 −60']};
const inventoryGroups={all:['wood','water','crop','herb','blood','metal','scroll','soup','elixir','medicine'],materials:['wood','water','crop','herb','blood','metal'],supplies:['soup','water','blood','elixir','medicine'],growth:['scroll'],equipment:[]};
const facilityNames = {kitchen:'주방',alchemy:'연금대',medical:'의료실',storage:'저장고'};
const poiContents={
 wood:[['wood',3,'주요 벌목 자재'],['scroll',1,'숨겨진 고대 주문서'],['herb',1,'야생 약초']],
 water:[['water',3,'정수된 식수'],['scroll',1,'보존된 주문서'],['crop',1,'물가 작물']],
 crop:[['crop',3,'수확용 작물'],['scroll',1,'농장 주문서'],['water',1,'농업용 식수']],
 herb:[['herb',3,'야생 약초 다발'],['scroll',1,'비전 주문서'],['blood',1,'응고된 원혈']],
 blood:[['blood',3,'농축 원혈'],['scroll',1,'혈족 주문서'],['herb',1,'정화 약초']],
 metal:[['metal',3,'고철 금속 부품'],['scroll',1,'기계공의 주문서'],['wood',1,'폐목재']],
};
let activeLoot=null,lootChecks=new Set(),inspectOnArrive=false;
function bagCapacity(w=state?.world){return w?160+(w.base.facilities.storage||0)*50+((w.player.combat_level||1)-1)*10:160;}
function bagUsed(w=state?.world){return w?Object.values(w.inventory).reduce((a,b)=>a+b,0)+(w.gear?.length||0)*4:0;}
function isBagFull(w=state?.world){return !w||bagUsed(w)>=bagCapacity(w)||(w.gear?.length||0)>=20;}
function toast(message) { $('toast').textContent=message; $('toast').classList.add('show'); clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('toast').classList.remove('show'),2600); }
let socket=null;
function updateConnectionBadge(){
 $('connection').classList.remove('status-error');
 const count=state?.online_count||1;
 $('connection').textContent=socket?.connected?`● Socket.IO 멀티플레이 (${count}명 접속) · 서버 상태 관리`:`● 서버 연결 (${count}명 접속) · 자동 저장`;
}
if(typeof io==='function'){
 socket=io({auth:{key,session},query:{key,session}});
 socket.on('connect',()=>{connected=true;updateConnectionBadge();});
 socket.on('state',data=>{connected=true;accept(data);updateConnectionBadge();});
 socket.on('connect_error',err=>{
  if(!connected){$('connection').textContent=err.message||'서버 연결 오류';$('connection').classList.add('status-error');}
 });
}
async function api(path, body) {
 if(socket?.connected){
  return await new Promise((resolve,reject)=>{
   const ev=path==='/api/action'?'action':'state';
   socket.emit(ev,body||{},res=>{
    if(res?.ok){connected=true;updateConnectionBadge();resolve(res.state);}
    else{const error=new Error(res?.error||'서버 오류');error.status=res?.status||400;reject(error);}
   });
  });
 }
 const response = await fetch(path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Access-Key':key,'X-Session-ID':session},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(5000)});
 const data = await response.json();
 if(!response.ok) { const error=new Error(data.error || '서버 오류'); error.status=response.status; throw error; }
 connected=true; updateConnectionBadge(); return data;
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
 if(campActions.has(action)&&!canUseCamp()){toast('아지트 가까이에서 이용하세요.');return;}
 if(busy||performance.now()-lastCommandAt<75){
  if(action!=='move'){pendingAction={action,fields};schedulePending();}
  return;
 }
 const before=state.world;
 busy=true;lastCommandAt=performance.now();
 if(action==='move')view.predictMove(state,fields);
 try {
  const result=await api('/api/action',{revision:state.world.revision,command:{action,...fields}});
  if(action==='move')view.endMove(true);
  accept(result);
  const drops=(result.world.gear||[]).filter(g=>!(before.gear||[]).some(old=>old.id===g.id));
  const killed=(before.enemies||[]).filter(old=>old.hp>0&&result.world.enemies.some(e=>e.id===old.id&&e.hp<=0));
  if(drops.length)toast('★ 장비 드랍 · '+drops.map(g=>itemName(g.id)).join(' · ')+' · 가방에 보관');
  else if(result.world.player.combat_level>before.player.combat_level)toast(`전투 레벨 상승 · Lv.${result.world.player.combat_level}`);
  else if(killed.length)toast(result.world.log[0]||'몬스터 처치 · 전리품 획득');
  if(action==='attack'||action==='skill')view.playCombat(before,result.world,action==='attack'?'attack':fields.skill);
 }catch(e){
  if(action==='move')view.endMove(false);
  if(e.status===409){
   try{
    accept(await api('/api/state'));
    if(['choose','new_adventurer','account_save','account_load'].includes(action)){
     const retry=await api('/api/action',{revision:state.world.revision,command:{action,...fields}});
     accept(retry);
     return;
    }
   }catch{connected=false;clearMovement();}
  }else if(!e.status){connected=false;clearMovement();}
  if(action!=='move')toast(e.message);
 }finally{
  // The server rate limit starts after its commit; retain this safety gap.
  lastCommandAt=performance.now();busy=false;schedulePending();
 }
}
let welcomeForced=false;
function accept(data) { if(!state || data.world.revision >= state.world.revision) { if(state && data.world.player.hp<state.world.player.hp)hurtUntil=performance.now()+350; state=data; update(); } }
function span(className,text) { const n=document.createElement('span'); n.className=className; n.textContent=text; return n; }
function update() {
 if(!state) return;
 const w=state.world,p=w.player;
 updateContext();
 $('intro-art').hidden=p.chosen&&!welcomeForced;
 document.body.dataset.species=p.chosen?p.species:'unchosen';
 const portrait=$('survivor-art');
 if(portrait.dataset.portraitSpecies!==p.species){portrait.dataset.portraitSpecies=p.species;portrait.src=p.species==='human'?'/art/human-warden.png':'/art/vampire-scholar.png';portrait.alt=p.species==='human'?'인간 생존자 초상':'뱀파이어 초상';}
 $('welcome').hidden=p.chosen&&!welcomeForced; $('welcome-close-btn').hidden=!p.chosen; $('interaction').hidden=!p.chosen; if(w.paused){if(autoHunt)setAutoHunt(false,true);clearMovement();} updateGuide();
 const region=view.region(state,p.x,p.y);$('region-name').textContent=region.name;$('region-description').textContent=region.subtitle+(region.levels?` · 권장 Lv.${region.levels.join('–')}${(p.combat_level||1)<region.levels[0]?' · 위험 지역':''}`:'');
 $('coordinates').textContent=`${Math.floor(p.x).toString().padStart(2,'0')} / ${Math.floor(p.y).toString().padStart(2,'0')}`;
 $('species').textContent=!p.chosen?'새로운 생존자':p.species==='human'?'인간 · 생존자':'뱀파이어 · 혈족';
 $('pause-overlay').hidden=!w.paused;
 $('pause').textContent=w.paused?'계속하기':'일시정지';

 $('level').textContent=`Lv.${p.combat_level||1} · EXP ${p.xp||0}/${(p.combat_level||1)>=50?'MAX':(p.combat_level||1)*40} · 공격력 +${((p.combat_level||1)-1)*3} · 방어력 +${Math.floor(((p.combat_level||1)-1)/2)} · 무기강화 +${p.level}`;
 $('day').textContent=`DAY ${String(1+Math.floor(w.elapsed/600)).padStart(2,'0')}`;
 $('time').textContent=`활동 ${Math.floor(w.elapsed/60)}분 ${Math.floor(w.elapsed%60)}초`;
 $('base-pos').textContent=`${w.base.x} / ${w.base.y}`;
 const meters=p.species==='human'?[['체력 (HP)',p.hp],['마나 (MP)',p.mp??100],['포만도',p.food],['수분',p.water],['감염',p.infection]]:[['체력 (HP · 자동재생/흡혈)',p.hp],['혈액량',p.blood],['안정도',p.stability],['감염',p.infection]];
 $('meters').replaceChildren(...meters.map(([name,value])=>{
  const row=document.createElement('div'), label=document.createElement('div');label.className='meter-label';label.append(span('',name),span('',String(Math.ceil(value))));
  const track=document.createElement('div'),fill=document.createElement('div'); track.className='track'; fill.className='fill'+(name==='감염'?' danger':name.includes('MP')?' mp-fill':'');fill.style.width=`${Math.max(0,Math.min(100,value))}%`;track.append(fill);row.append(label,track);return row;
 }));
 renderInventory();updateSkills();
 for(const [id,name] of Object.entries(facilityNames)){
  if(!facilityRows.has(id)){
   const row=document.createElement('div'),info=document.createElement('div'),title=span('',''),cost=document.createElement('small'),button=document.createElement('button');
   row.className='facility';info.append(title,cost);row.append(info,button);$('facilities').append(row);
   button.onclick=()=>manualAction('build',{facility:id});facilityRows.set(id,{title,cost,button});
  }
  const {title,cost,button}=facilityRows.get(id),level=w.base.facilities[id];
  title.textContent=`${name} · Lv.${level}`;cost.textContent=level>=3?'최대 레벨':`목재 ${3*(level+1)} · 부품 ${2*(level+1)}`;
  button.textContent=level?'개선':'건설';button.disabled=level>=3||w.paused||w.inventory.wood<3*(level+1)||w.inventory.metal<2*(level+1);button.title=cost.textContent;
 }
 $('log').replaceChildren(...w.log.slice(0,5).map(t=>{const li=document.createElement('li');li.textContent=t;return li;}));
 $('quest-progress').textContent=`채집 ${Math.min(5,w.quest.collected)} / 5 · 완료 ${w.quest.round}회`;
 $('dispatch-cost').textContent=p.species==='human'?'파견 비용 · 작물 1':'파견 비용 · 원혈 1';
 $('dispatch').textContent=w.dispatch?`파견 복귀까지 ${Math.ceil(w.dispatch.ends-w.elapsed)}초`:'파견 대기 · 완료 시 자원 자동 보관';
 const tier=p.unlocks[p.species],forms=p.species==='human'?['슬레이어 스카우트 바이크','슬레이어 나이트크루저','아머드 배틀 크루저']:['블러드 배트 변신','나이트메어 광폭 박쥐','아크데몬 군주 박쥐'];
 $('mobility').textContent=`다크에덴 이동 형태: ${forms[tier]} · ${p.mounted?'탑승·변신 중 (고속 이동)':'미사용 (M키 즉시 탑승)'}`;
 $('mount-toggle').textContent=p.mounted?'⏬ 하차·해제':p.species==='human'?'🏍 바이크 탑승':'🦇 박쥐 변신';
 document.querySelectorAll('[data-item]').forEach(b=>{const id=b.dataset.item;b.disabled=w.paused||!w.inventory[id]||(p.species==='human'?['blood','elixir'].includes(id):['soup','water'].includes(id));});
 renderRecipe();renderLootBox();
}
function draw(){view.draw(state,target,selected,{hurtUntil});}
function clearMovement(){held.clear();touchHeld.clear();target=null;document.querySelectorAll('[data-direction]').forEach(b=>b.classList.remove('pressed'));}
function navigate(x,y,id=null){
 if(!state?.world.player.chosen||state.world.paused||!connected)return;
 if(autoHunt&&!id?.startsWith('enemy:'))setAutoHunt(false,true);
 closePanel(false);clearMovement();const max=state.map.size-2;
 target={x:Math.max(1,Math.min(max,x)),y:Math.max(1,Math.min(max,y)),id};selected=id;
}
function changeZoom(amount){const value=view.setZoom(view.zoom+amount);$('zoom-level').textContent=`${Math.round(value*100)}%`;draw();}
function toggleFocus(){const active=document.body.classList.toggle('focus-mode');$('focus-view').setAttribute('aria-pressed',String(active));draw();}
canvas.addEventListener('click',e=>{
 if(!view.projection||!state)return;
 const r=canvas.getBoundingClientRect(),cx=e.clientX-r.left,cy=e.clientY-r.top,p=state.world.player;
 const node=view.points.map(n=>({...n,d:Math.hypot(n.x-cx,n.y-cy)})).filter(n=>cx>=n.left&&cx<=n.right&&cy>=n.top&&cy<=n.bottom).sort((a,b)=>a.d-b.d)[0];
 if(node){
  if(node.id==='base'){inspectOnArrive=false;if(canUseCamp()){openPanel('camp');return;}navigate(state.world.base.x,state.world.base.y);}
  else if(node.id.startsWith('enemy:')){inspectOnArrive=false;const enemy=state.world.enemies.find(n=>n.id===Number(node.id.split(':')[1]));if(enemy)navigate(enemy.x,enemy.y,node.id);}
  else if(node.id.startsWith('drop:')){const drop=(state.world.drops||[]).find(d=>d.id===node.id);if(drop){if(Math.hypot(drop.x-p.x,drop.y-p.y)<=3.5){clearMovement();selected=drop.id;openLootBox({type:'drop',id:drop.id});return;}inspectOnArrive=true;navigate(drop.x,drop.y,drop.id);}}
  else{const poi=state.pois.find(n=>n.id===node.id);if(poi){if(poi.kind!=='npc'&&Math.hypot(poi.x-p.x,poi.y-p.y)<=3.5){clearMovement();selected=poi.id;openLootBox({type:'poi',id:poi.id});return;}inspectOnArrive=poi.kind!=='npc';navigate(poi.x,poi.y,poi.id);}}
 }else{inspectOnArrive=false;const point=view.toWorld(cx,cy);if(point.x>=0&&point.y>=0&&point.x<state.map.size&&point.y<state.map.size)navigate(point.x,point.y);}
 canvas.focus({preventScroll:true});stepMovement();
});
canvas.addEventListener('wheel',e=>{e.preventDefault();changeZoom(e.deltaY<0?.1:-.1);},{passive:false});
$('minimap').addEventListener('click',e=>{
 if(!state)return;const r=$('minimap').getBoundingClientRect(),x=(e.clientX-r.left)/r.width*state.map.size,y=(e.clientY-r.top)/r.height*state.map.size;
 const poi=state.pois.find(n=>Math.hypot(n.x-x,n.y-y)<1.5);
 navigate(poi?poi.x:x,poi?poi.y:y,poi?.id);canvas.focus({preventScroll:true});stepMovement();
});
$('zoom-in').onclick=()=>changeZoom(.1);$('zoom-out').onclick=()=>changeZoom(-.1);$('focus-view').onclick=toggleFocus;
function goHome(){if(state){navigate(state.world.base.x,state.world.base.y);stepMovement();}}
$('go-home').onclick=goHome;$('travel-home').onclick=goHome;
$('interact').onclick=()=>interact();
$('loot-btn').onclick=()=>quickLoot();
function setAutoHunt(active,silent=false){
 const next=Boolean(active&&state?.world.player.chosen&&!state?.world.paused&&connected);
 if(autoHunt===next&&silent)return;
 autoHunt=next;
 if(!autoHunt&&target?.id?.startsWith('enemy:'))target=null;
 $('auto-hunt').setAttribute('aria-pressed',String(autoHunt));
 $('auto-hunt-label').textContent=autoHunt?'자동사냥 ON':'자동사냥 OFF';
 if(!silent)toast(autoHunt?'자동사냥 ON · 주변 감염체를 자동으로 추적·공격합니다.':'자동사냥 OFF');
}
$('auto-hunt').onclick=()=>{if(!state?.world.player.chosen||!connected)return;if(state.world.paused){toast('일시정지를 해제하세요.');return;}closePanel(false);setAutoHunt(!autoHunt);if(autoHunt)stepMovement();};
function manualAction(action,fields={}){if(action==='attack'||action==='skill')closePanel(false);clearMovement();pendingAction=null;clearTimeout(pendingTimer);command(action,fields);}
$('pause').onclick=()=>manualAction('pause');
document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>manualAction(b.dataset.action));
document.querySelectorAll('[data-item]').forEach(b=>b.onclick=()=>manualAction('consume',{item:b.dataset.item}));
$('craft-submit').onclick=()=>manualAction('craft',{recipe:selectedRecipe});
document.querySelectorAll('button[data-species]').forEach(b=>b.onclick=()=>{welcomeForced=false;manualAction('choose',{species:b.dataset.species});});
async function submitAccountAction(action,fields,msgId){
 const msgEl=$(msgId);
 if(msgEl)msgEl.textContent='서버 처리 중...';
 try{
  const result=await api('/api/action',{revision:state.world.revision,command:{action,...fields}});
  if(action==='account_load')welcomeForced=false;
  accept(result);
  const noteText=result.world.log?.[0]||'처리되었습니다.';
  if(msgEl)msgEl.textContent=noteText;
  toast(noteText);
  if(action==='account_load'&&activePanel==='account')closePanel();
 }catch(e){
  if(msgEl)msgEl.textContent=e.message||'오류가 발생했습니다.';
  toast(e.message||'오류가 발생했습니다.');
 }
}
$('new-start-btn').onclick=()=>{closePanel(false);closeLootBox();welcomeForced=true;update();};
$('welcome-close-btn').onclick=()=>{welcomeForced=false;update();};
$('welcome-load-btn').onclick=()=>submitAccountAction('account_load',{username:$('welcome-account-id').value,password:$('welcome-account-pw').value},'welcome-account-msg');
for(const id of ['welcome-account-id','welcome-account-pw'])$(id).addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('welcome-load-btn').click();}});
$('account-save-btn').onclick=()=>submitAccountAction('account_save',{username:$('account-save-id').value,password:$('account-save-pw').value},'account-save-msg');
$('account-load-btn').onclick=()=>submitAccountAction('account_load',{username:$('account-load-id').value,password:$('account-load-pw').value},'account-load-msg');
$('account-new-human').onclick=()=>{welcomeForced=false;closePanel();manualAction('choose',{species:'human'});toast('신규 인간 모험자로 새로운 여정을 시작합니다.');};
$('account-new-vampire').onclick=()=>{welcomeForced=false;closePanel();manualAction('choose',{species:'vampire'});toast('신규 뱀파이어 모험자로 새로운 여정을 시작합니다.');};
$('account-new-welcome').onclick=()=>{closePanel();welcomeForced=true;manualAction('new_adventurer',{});update();};
function canUseCamp(){
 if(!state||!connected||!state.world.player.chosen)return false;
 const {player,base}=state.world;
 return Math.hypot(player.x-base.x,player.y-base.y)<=state.map.base_radius;
}
function closePanel(restoreFocus=true){
 if(!activePanel)return;
 const previous=panelOpener;activePanel=null;
 $('menu-dialog').close();
 document.querySelectorAll('[data-view]').forEach(section=>section.hidden=true);
 document.querySelectorAll('[data-panel]').forEach(button=>button.setAttribute('aria-expanded','false'));
 if(restoreFocus){if(previous?.isConnected&&!previous.hidden&&!previous.disabled)previous.focus({preventScroll:true});else canvas.focus({preventScroll:true});}
}
function openPanel(name,opener=null){
 if(!panelInfo[name]||(!state?.world.player.chosen&&name!=='account')||!connected)return false;
 if(campPanels.has(name)&&!canUseCamp())return false;
 clearMovement();pendingAction=null;clearTimeout(pendingTimer);
 if(!activePanel)panelOpener=opener||document.activeElement;
 activePanel=name;$('menu-dialog').dataset.panel=name;
 const [title,description,eyebrow]=panelInfo[name];
 $('menu-title').textContent=title;$('menu-description').textContent=description;$('menu-eyebrow').textContent=eyebrow;
 $('menu-back').hidden=!panelParents[name];
 document.querySelectorAll('[data-view]').forEach(section=>section.hidden=section.dataset.view!==name);
 const root=panelParents[name]||name;
 document.querySelectorAll('[data-panel]').forEach(button=>button.setAttribute('aria-expanded',String(button.dataset.panel===root)));
 $('menu-context').textContent=campPanels.has(name)?'⌂ 아지트 안 · 벗어나면 이 메뉴는 닫힙니다.':'Esc로 닫기 · 메뉴를 연 동안에도 월드 시간은 흐릅니다.';
 if(!$('menu-dialog').open)$('menu-dialog').show();
 renderInventory();renderRecipe();$('menu-title').focus({preventScroll:true});return true;
}
function updateContext(){
 const {player:p}=state.world,atCamp=canUseCamp();
 $('menu-camp').hidden=!atCamp;$('camp-access').hidden=!atCamp;
 document.querySelectorAll('[data-panel]').forEach(button=>button.disabled=(!p.chosen&&button.dataset.panel!=='account')||!connected);
 $('auto-hunt').disabled=!p.chosen||!connected||state.world.paused;
 if(!connected&&autoHunt)setAutoHunt(false,true);
 if(activePanel&&((campPanels.has(activePanel)&&!atCamp)||!connected))closePanel(false);
 $('field-hp').textContent=Math.ceil(p.hp);$('field-health-bar').style.width=`${Math.max(0,Math.min(100,p.hp))}%`;
 if(p.species==='human'){
  const mp=p.mp??100;
  $('field-mp-label').textContent='MP';$('field-mp').textContent=Math.ceil(mp);
  $('field-mp-track').hidden=false;$('field-mp-bar').style.width=`${Math.max(0,Math.min(100,mp))}%`;
 }else{
  $('field-mp-label').textContent='혈족특성';$('field-mp').textContent='흡혈·체력재생';
  $('field-mp-track').hidden=true;
 }
 const maxXp=(p.combat_level||1)>=50?1:(p.combat_level||1)*40;
 $('field-level').textContent=`Lv.${p.combat_level||1}`;$('field-exp-bar').style.width=`${Math.max(0,Math.min(100,((p.xp||0)/maxXp)*100))}%`;
 $('field-vital').textContent=p.species==='human'?`포만 ${Math.ceil(p.food)} · 수분 ${Math.ceil(p.water)}`:`혈액 ${Math.ceil(p.blood)} · 안정 ${Math.ceil(p.stability)}`;
 $('field-bag').textContent=`가방 ${bagUsed()}/${bagCapacity()}`;
 const eqW=gearItem(state.world.equipment?.weapon),eqA=gearItem(state.world.equipment?.armor);
 $('field-equip').textContent=`⚔ ${eqW?itemName(eqW.id):'미착용'} · 🛡 ${eqA?itemName(eqA.id):'미착용'}`;
 $('field-infection').hidden=p.infection<1;$('field-infection').textContent=`감염 ${Math.ceil(p.infection)}`;
 $('account-top-btn').textContent=p.account?`💾 ${p.account}`:'💾 계정저장';
 if(p.account){
  $('account-current-title').textContent=`✅ 저장된 계정: ${p.account} (${p.species==='human'?'인간':'뱀파이어'} Lv.${p.combat_level||1})`;
  $('account-current-desc').textContent=`현재 모험(레벨·장비·인벤토리·아지트)이 서버 계정 '${p.account}'에 연결되어 자동 저장됩니다.`;
  if(document.activeElement!==$('account-save-id')&&!$('account-save-id').value)$('account-save-id').value=p.account;
 }else{
  $('account-current-title').textContent=`✨ 신규 모험자 (미저장 상태 · ${p.species==='human'?'인간':'뱀파이어'} Lv.${p.combat_level||1})`;
  $('account-current-desc').textContent='현재 계정 없이 자유롭게 플레이 중입니다. 아래에서 아이디/비밀번호를 생성해 현재 캐릭터를 서버에 영구 저장하세요.';
 }
}
const itemSlots=new Map();let selectedItem=null,inventoryLayout='';
const itemInfo={
 wood:['제작 재료','시설을 건설하고 개선하는 데 쓰는 목재.','아지트 → 시설에서 사용'],
 metal:['제작 재료','시설과 이동 연구에 필요한 금속 부품.','아지트 → 시설·연구에서 사용'],
 crop:['식재료','따뜻한 수프를 만드는 기본 식재료.','아지트 → 제작 → 요리'],
 herb:['약재','치료제와 안정화 혈액, 종족 전환에 필요한 약초.','아지트 → 제작·연구에서 사용'],
 scroll:['강화 재료','현재 무기의 공격력을 강화하는 주문서.','아지트 → 연구·성장 → 장비 강화'],
 soup:['인간 소모품','야채와 물로 끓인 따뜻한 식사.','포만도 +45 · 수분 +15'],
 water:['인간 소모품 / 재료','마실 수 있는 깨끗한 물. 제작에도 사용합니다.','수분 +40'],
 blood:['뱀파이어 소모품 / 재료','뱀파이어의 갈증을 달래는 원혈.','혈액량 +30'],
 elixir:['뱀파이어 소모품','혈액을 안정화한 연금 혼합물.','혈액량 +40 · 안정도 +45'],
 medicine:['공용 소모품','상처와 감염을 치료하는 약품.','체력 +40 · 감염 −60'],
};
function itemUseReason(id){
 const w=state.world;
 if(gearItem(id))return !connected?'서버 연결을 기다리세요.':w.paused?'일시정지를 해제하세요.':'';
 if(!id)return '아이템을 선택하세요.';
 if(!['soup','water','blood','elixir','medicine'].includes(id))return '직접 사용할 수 없는 제작·강화 재료입니다.';
 if(!connected)return '서버 연결을 기다리세요.';
 if(w.paused)return '일시정지를 해제하세요.';
 if(!w.inventory[id])return '보유한 아이템이 없습니다.';
 if(['soup','water'].includes(id)&&w.player.species!=='human')return '인간만 사용할 수 있습니다.';
 if(['blood','elixir'].includes(id)&&w.player.species!=='vampire')return '뱀파이어만 사용할 수 있습니다.';
 return '';
}
function gearItem(id){return state?.world.gear?.find(g=>g.id===id);}
function itemName(id){const g=gearItem(id);return g?`[${state.rarities[g.rarity].name}] ${g.name}`:state.items[id];}
function itemIcon(id){return gearItem(id)?.slot||id;}
function makeEquippedSlotCard(slot,mode='equip'){
 const g=gearItem(state.world.equipment?.[slot]),rarity=g?state.rarities?.[g.rarity]:null;
 const card=document.createElement('div');card.className='equip-slot-card';
 if(rarity)card.style.borderColor=rarity.color;
 const head=document.createElement('div');head.className='equip-slot-head';
 const img=document.createElement('img');img.src='/icons/'+slot+'.svg';img.alt='';img.width=34;img.height=34;
 const titleBox=document.createElement('div');titleBox.className='equip-slot-title';
 const slotLabel=document.createElement('small');slotLabel.textContent=(slot==='weapon'?'⚔ 주무기 슬롯':'🛡 방어구 슬롯')+(rarity?` · ${rarity.name} 등급`:'');
 const nameEl=document.createElement('strong');nameEl.textContent=g?itemName(g.id):'장착된 장비 없음';
 if(rarity)nameEl.style.color=rarity.color;
 titleBox.append(slotLabel,nameEl);head.append(img,titleBox);
 const stat=span('equip-slot-stat',g?(slot==='weapon'?`공격력 +${g.power} (무기강화 +${state.world.player.level||0})`:`방어력 +${g.power} (피해 감소 -${g.power})`):(slot==='weapon'?'무기를 장착해 공격력을 높이세요':'방어구를 장착해 받는 피해를 줄이세요'));
 const actions=document.createElement('div');actions.className='equip-slot-actions';
 if(g){
  if(mode==='bag'){
   const inspectBtn=document.createElement('button');inspectBtn.type='button';inspectBtn.textContent='상세 보기';
   inspectBtn.onclick=()=>{selectedItem=g.id;renderInventory();};
   actions.append(inspectBtn);
  }
  const unequipBtn=document.createElement('button');unequipBtn.type='button';unequipBtn.textContent='착용 해제';
  unequipBtn.disabled=!connected||state.world.paused;
  unequipBtn.onclick=()=>manualAction('unequip',{slot});
  actions.append(unequipBtn);
 }else if(mode==='survival'){
  const openBtn=document.createElement('button');openBtn.type='button';openBtn.textContent='장비창 열기 (C)';
  openBtn.onclick=()=>openPanel('equip');
  actions.append(openBtn);
 }
 card.append(head,stat,actions);return card;
}
function renderEquippedViews(){
 if(!state)return;
 const w=state.world,p=w.player,gear=w.gear||[];
 const wep=gearItem(w.equipment?.weapon),arm=gearItem(w.equipment?.armor);
 const lvl=p.combat_level||1,lvlAtk=(lvl-1)*3,lvlDef=Math.floor((lvl-1)/2);
 const wepPow=wep?.power||0,armPow=arm?.power||0;
 $('equip-stats-summary').textContent=`전투 Lv.${lvl} · 총 공격력 보너스 +${lvlAtk+wepPow} (레벨 +${lvlAtk} / 무기 +${wepPow}) · 무기강화 +${p.level||0} · 총 방어력 +${lvlDef+armPow} (레벨 +${lvlDef} / 방어구 +${armPow})`;
 $('equip-paperdoll').replaceChildren(makeEquippedSlotCard('weapon','equip'),makeEquippedSlotCard('armor','equip'));
 $('bag-equipped-slots').replaceChildren(makeEquippedSlotCard('weapon','bag'),makeEquippedSlotCard('armor','bag'));
 $('survival-equipped').replaceChildren(makeEquippedSlotCard('weapon','survival'),makeEquippedSlotCard('armor','survival'));
 $('equip-gear-empty').hidden=gear.length>0;
 $('equip-gear-list').replaceChildren(...gear.map(g=>{
  const rarity=state.rarities?.[g.rarity],equipped=w.equipment?.[g.slot]===g.id;
  const currentPow=gearItem(w.equipment?.[g.slot])?.power||0,diff=g.power-currentPow;
  const row=document.createElement('div');row.className='equip-gear-row';
  if(equipped&&rarity)row.style.borderColor=rarity.color;
  const info=document.createElement('div');info.className='equip-gear-info';
  const img=document.createElement('img');img.src='/icons/'+g.slot+'.svg';img.alt='';img.width=32;img.height=32;
  const txt=document.createElement('div');txt.className='equip-gear-text';
  const title=document.createElement('strong');title.textContent=itemName(g.id)+(equipped?' [착용 중]':'');
  if(rarity)title.style.color=rarity.color;
  const desc=document.createElement('small');desc.textContent=(g.slot==='weapon'?`무기 · 공격력 +${g.power}`:`방어구 · 방어력 +${g.power}`)+(equipped?' · 현재 장착 슬롯':` · 장착 시 ${diff>=0?'+'+diff:diff}`);
  txt.append(title,desc);info.append(img,txt);
  const btn=document.createElement('button');btn.type='button';btn.className=equipped?'':'accent';
  btn.textContent=equipped?'착용 해제':'장착';
  btn.disabled=!connected||w.paused;
  btn.onclick=()=>manualAction(equipped?'unequip':'equip',{item:g.id,slot:g.slot});
  row.append(info,btn);return row;
 }));
}
function renderInventory(){
 if(!state)return;
 renderEquippedViews();
 const gear=state.world.gear||[],allIds=[...inventoryGroups[inventoryFilter],...(['all','equipment'].includes(inventoryFilter)?gear.map(g=>g.id):[])];
 const ids=allIds.filter(id=>gearItem(id)||state.world.inventory[id]>0);
 if(!allIds.includes(selectedItem))selectedItem=ids[0]||null;
 const layout=inventoryFilter+':'+ids.join(',');
 if(layout!==inventoryLayout){
  const slots=ids.map(id=>{
   if(!itemSlots.has(id)){
    const button=document.createElement('button'),img=document.createElement('img'),name=span('slot-name',itemName(id)),count=span('slot-count','');
    button.className='item-slot';button.dataset.inventoryItem=id;img.src='/icons/'+itemIcon(id)+'.svg';img.alt='';img.width=48;img.height=48;
    button.append(img,name,count);button.onclick=()=>{selectedItem=id;renderInventory();};itemSlots.set(id,{button,count});
   }
   return itemSlots.get(id).button;
  });
  for(let i=ids.length;i<20;i++){const empty=document.createElement('span');empty.className='item-slot empty-slot';empty.setAttribute('aria-hidden','true');slots.push(empty);}
  $('inventory').replaceChildren(...slots);inventoryLayout=layout;
 }
 for(const id of ids){const {button,count}=itemSlots.get(id),g=gearItem(id),amount=state.world.inventory[id];
  count.textContent=g?(state.world.equipment[g.slot]===id?'착용':'장비'):amount;
  button.style.color=g?state.rarities[g.rarity].color:'';button.style.borderColor=g?state.rarities[g.rarity].color:'';
  button.setAttribute('aria-label',g?itemName(id)+' '+count.textContent:itemName(id)+' '+amount+'개');button.setAttribute('aria-pressed',String(id===selectedItem));}
 $('equipped-summary').textContent=['weapon','armor'].map(slot=>{const g=gearItem(state.world.equipment?.[slot]);return (slot==='weapon'?'무기':'방어구')+' · '+(g?itemName(g.id):'미착용');}).join(' / ');
 $('bag-count').textContent=Object.values(state.world.inventory).filter(n=>n>0).length+'종 · 장비 '+gear.length+'개 · 용량 '+bagUsed()+'/'+bagCapacity();$('inventory-empty').hidden=ids.length>0;
 const g=gearItem(selectedItem),rarity=g?state.rarities[g.rarity]:null,equipped=g&&state.world.equipment[g.slot]===g.id;
 const info=g?[rarity.name+' '+(g.slot==='weapon'?'무기':'방어구'),'몬스터에게서 획득한 장비. 종족·레벨 제한 없이 착용할 수 있습니다.',(g.slot==='weapon'?'공격력 +':'받는 피해 −')+g.power+' · 현재 부위 대비 '+(g.power-(gearItem(state.world.equipment[g.slot])?.power||0)>=0?'+':'')+(g.power-(gearItem(state.world.equipment[g.slot])?.power||0))]:itemInfo[selectedItem];$('item-art').hidden=!info;if(info)$('item-art').src='/icons/'+itemIcon(selectedItem)+'.svg';
 $('item-category').textContent=info?.[0]||'';$('item-name').textContent=selectedItem?itemName(selectedItem):'비어 있는 가방';
 $('item-description').textContent=info?.[1]||'채집하거나 제작해 아이템을 획득하세요.';$('item-effect').textContent=info?.[2]||'';
 $('item-category').style.color=rarity?.color||'';
 $('item-owned').textContent=g?(equipped?'현재 착용 중':'가방에 보관 중'):selectedItem?'보유 수량 · '+(state.world.inventory[selectedItem]||0):'';
 const reason=itemUseReason(selectedItem);$('item-use').disabled=Boolean(reason);$('item-use').textContent=g?(equipped?'착용 해제':'착용'):'1개 사용';$('item-use-reason').textContent=reason||(g?'같은 부위의 장비는 교체되며 가방에 보존됩니다.':'선택한 아이템 1개를 사용합니다.');
}
$('item-use').onclick=()=>{if(selectedItem&&!itemUseReason(selectedItem)){const g=gearItem(selectedItem);if(g)manualAction(state.world.equipment[g.slot]===g.id?'unequip':'equip',{item:g.id,slot:g.slot});else manualAction('consume',{item:selectedItem});}};
function skillStatus(id){
 const w=state.world,p=w.player,spec=state.combat?.[id];
 if(!spec)return {reason:'서버 연결 중'};
 const isVamp=p.species==='vampire',meter=isVamp?'blood':'food',cost=spec.cost;
 const mpCost=spec.mp_cost??cost,hpCost=spec.hp_cost??6;
 const remaining=Math.max(0,(w.cooldowns['skill:'+id]||0)-w.elapsed,id==='sweep'?(w.cooldowns.attack||0)-w.elapsed:0);
 const reason=!connected?'연결 중':w.paused?'일시정지':p.mounted?'하차 후 사용':remaining>0?remaining.toFixed(1)+'초':!isVamp&&(p.mp??100)<mpCost?'MP 부족':isVamp&&p.hp<=hpCost?'체력 부족':p[meter]<cost?'자원 부족':id==='recover'&&p.hp>=100?'체력 가득':id==='sweep'&&!w.enemies.some(e=>e.hp>0&&Math.hypot(e.x-p.x,e.y-p.y)<=spec.range)?'적에게 접근':'';
 return {reason,spec,meter,cost,mpCost,hpCost,remaining};
}
function updateSkills(){
 if(!state)return;$('skill-bar').hidden=!state.world.player.chosen;
 const isVamp=state.world.player.species==='vampire';
 for(const id of ['sweep','recover']){
  const {reason,spec,mpCost,hpCost}=skillStatus(id);if(!spec)continue;
  const name=isVamp?spec.vampire_name:spec.name;
  const costText=isVamp?`HP ${hpCost} 소모`:`MP ${mpCost}`;
  $('skill-'+id+'-name').textContent=name;$('skill-'+id+'-status').textContent=reason||(spec.damage?`피해 ${spec.damage}${isVamp?'+흡혈':''}`:`회복 +${spec.heal}`)+' · '+costText;
  $('skill-'+id).disabled=Boolean(reason);$('skill-'+id).title=name+' · '+(spec.damage?'주변 적 피해 '+spec.damage:'체력 +'+spec.heal)+' · 재사용 '+spec.cooldown+'초 · '+costText;
 }
}
function useSkill(id){const {reason}=skillStatus(id);if(reason){toast(reason);return;}manualAction('skill',{skill:id});}
for(const button of document.querySelectorAll('[data-skill]'))button.onclick=()=>useSkill(button.dataset.skill);
function renderRecipe(){
 if(!state?.recipes)return;
 const recipe=state.recipes[selectedRecipe],w=state.world,[icon,effect]=recipeDetails[selectedRecipe];
 $('recipe-icon').textContent=icon;$('recipe-name').textContent=recipe.name;$('recipe-facility').textContent=facilityNames[recipe.facility]+' Lv.1';$('recipe-effect').textContent=effect;
 let enough=true;
 $('recipe-cost').replaceChildren(...Object.entries(recipe.cost).map(([id,amount])=>{
  const have=w.inventory[id]||0,row=document.createElement('div');row.className='recipe-cost-row';
  row.append(span('',state.items[id]),span(have<amount?'missing':'',`${have} / ${amount}`));if(have<amount)enough=false;return row;
 }));
 const facility=w.base.facilities[recipe.facility]>0;
 const reason=!canUseCamp()?'아지트에서 제작할 수 있습니다.':w.paused?'일시정지를 해제하면 제작할 수 있습니다.':!facility?`${facilityNames[recipe.facility]}를 먼저 건설하세요.`:!enough?'필요한 재료가 부족합니다.':'재료가 준비되었습니다.';
 $('recipe-status').textContent=reason;$('craft-submit').disabled=!canUseCamp()||w.paused||!facility||!enough;
}
for(const button of document.querySelectorAll('[data-panel]'))button.onclick=()=>{
 const name=button.dataset.panel;
 if(activePanel===name)closePanel();else openPanel(name,button);
};
$('menu-close').onclick=()=>closePanel();
$('menu-back').onclick=()=>openPanel(panelParents[activePanel]);
$('menu-dialog').addEventListener('cancel',event=>{event.preventDefault();closePanel();});
$('menu-dialog').addEventListener('close',()=>{if(activePanel&&!$('menu-dialog').open)closePanel(false);});
for(const button of document.querySelectorAll('[data-filter]'))button.onclick=()=>{
 inventoryFilter=button.dataset.filter;
 document.querySelectorAll('[data-filter]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));renderInventory();
};
for(const button of document.querySelectorAll('[data-craft]'))button.onclick=()=>{
 selectedRecipe=button.dataset.craft;
 document.querySelectorAll('[data-craft]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));renderRecipe();
};
function closeLootBox(){activeLoot=null;lootChecks.clear();$('loot-box').hidden=true;}
function openLootBox(source){
 if(!state)return;
 activeLoot=source;lootChecks.clear();
 if(source.type==='poi'){
  const poi=state.pois.find(n=>n.id===source.id);
  for(const [k] of (poiContents[poi?.kind]||[]))lootChecks.add(k);
 }else if(source.type==='drop'){
  const drop=(state.world.drops||[]).find(d=>d.id===source.id);
  if(drop){
   for(const g of (drop.gear||[]))lootChecks.add(g.id);
   for(const k of Object.keys(drop.items||{}))lootChecks.add(k);
  }
 }
 renderLootBox();
}
function renderLootBox(){
 if(!state||!activeLoot){$('loot-box').hidden=true;return;}
 const w=state.world,p=w.player;
 $('loot-capacity').textContent=`가방 ${bagUsed()}/${bagCapacity()}`;
 if(activeLoot.type==='poi'){
  const poi=state.pois.find(n=>n.id===activeLoot.id);
  if(!poi||Math.hypot(poi.x-p.x,poi.y-p.y)>3.6){closeLootBox();return;}
  const cd=Math.max(0,Math.ceil((w.cooldowns[poi.id]||0)-w.elapsed));
  $('loot-eyebrow').textContent='OBJECT INSPECTION · 오브젝트 선택 파밍';
  $('loot-title').textContent=poi.label;
  $('loot-subtitle').textContent=cd?`재생성 대기 중 (${cd}초) · 내부 자원을 확인하세요`:`원하는 자원을 체크해 선택 파밍하거나 단독 파밍하세요`;
  const contents=poiContents[poi.kind]||[[poi.kind,3,'자원']];
  $('loot-list').replaceChildren(...contents.map(([k,amt,desc])=>{
   const row=document.createElement('li');row.className='loot-row';
   const left=document.createElement('label');left.className='loot-check';
   const cb=document.createElement('input');cb.type='checkbox';cb.checked=lootChecks.has(k);
   cb.onchange=()=>{if(cb.checked)lootChecks.add(k);else lootChecks.delete(k);$('loot-selected').disabled=cd>0||lootChecks.size===0||isBagFull();};
   const txt=document.createElement('div');
   txt.append(span('loot-item-name',`${state.items[k]||k} ×${amt}`),span('loot-item-desc',desc));
   left.append(cb,txt);
   const btn=document.createElement('button');btn.type='button';btn.className='secondary-action loot-pick';btn.textContent='단독 파밍';
   btn.disabled=cd>0||isBagFull();
   btn.onclick=()=>{command('gather',{id:poi.id,items:[k]});closeLootBox();};
   row.append(left,btn);return row;
  }));
  $('loot-selected').textContent='선택 파밍';
  $('loot-selected').disabled=cd>0||lootChecks.size===0||isBagFull();
  $('loot-all').textContent='모두 파밍 · F';
  $('loot-all').disabled=cd>0||isBagFull();
  $('loot-box').hidden=false;
 }else if(activeLoot.type==='drop'){
  const drop=(w.drops||[]).find(d=>d.id===activeLoot.id);
  if(!drop||Math.hypot(drop.x-p.x,drop.y-p.y)>3.6){closeLootBox();return;}
  $('loot-eyebrow').textContent='FIELD LOOT · 몬스터 드랍 전리품';
  $('loot-title').textContent=drop.label||'몬스터 전리품';
  $('loot-subtitle').textContent=`획득할 전리품을 체크하거나 [모두 루팅 · F]를 누르세요`;
  const rows=[];
  for(const g of (drop.gear||[])){
   const rarity=state.rarities[g.rarity],row=document.createElement('li');row.className='loot-row';
   const left=document.createElement('label');left.className='loot-check';
   const cb=document.createElement('input');cb.type='checkbox';cb.checked=lootChecks.has(g.id);
   cb.onchange=()=>{if(cb.checked)lootChecks.add(g.id);else lootChecks.delete(g.id);$('loot-selected').disabled=lootChecks.size===0||isBagFull();};
   const txt=document.createElement('div'),title=span('loot-item-name',`[${rarity.name}] ${g.name}`);
   title.style.color=rarity.color;
   txt.append(title,span('loot-item-desc',(g.slot==='weapon'?'공격력 +':'방어력 +')+g.power+' 장비'));
   left.append(cb,txt);
   const btn=document.createElement('button');btn.type='button';btn.className='secondary-action loot-pick';btn.textContent='루팅';
   btn.disabled=isBagFull();
   btn.onclick=()=>command('loot',{id:drop.id,item:g.id});
   row.append(left,btn);rows.push(row);
  }
  for(const [k,amt] of Object.entries(drop.items||{})){
   const row=document.createElement('li');row.className='loot-row';
   const left=document.createElement('label');left.className='loot-check';
   const cb=document.createElement('input');cb.type='checkbox';cb.checked=lootChecks.has(k);
   cb.onchange=()=>{if(cb.checked)lootChecks.add(k);else lootChecks.delete(k);$('loot-selected').disabled=lootChecks.size===0||isBagFull();};
   const txt=document.createElement('div');
   txt.append(span('loot-item-name',`${state.items[k]||k} ×${amt}`),span('loot-item-desc','전리품 재료·보급품'));
   left.append(cb,txt);
   const btn=document.createElement('button');btn.type='button';btn.className='secondary-action loot-pick';btn.textContent='루팅';
   btn.disabled=isBagFull();
   btn.onclick=()=>command('loot',{id:drop.id,item:k});
   row.append(left,btn);rows.push(row);
  }
  $('loot-list').replaceChildren(...rows);
  $('loot-selected').textContent='선택 루팅';
  $('loot-selected').disabled=lootChecks.size===0||isBagFull();
  $('loot-all').textContent='모두 루팅 · F';
  $('loot-all').disabled=isBagFull();
  $('loot-box').hidden=false;
 }
}
$('loot-close').onclick=()=>closeLootBox();
$('loot-selected').onclick=async()=>{
 if(!state||!activeLoot)return;
 if(activeLoot.type==='poi'){
  const items=[...lootChecks];
  if(items.length){await command('gather',{id:activeLoot.id,items});closeLootBox();}
 }else if(activeLoot.type==='drop'){
  const drop=(state.world.drops||[]).find(d=>d.id===activeLoot.id);
  if(!drop)return;
  const allCount=(drop.gear?.length||0)+Object.keys(drop.items||{}).length;
  if(lootChecks.size>=allCount){await command('loot',{id:drop.id,item:'all'});}
  else{for(const item of [...lootChecks])await command('loot',{id:drop.id,item});}
 }
};
$('loot-all').onclick=()=>{
 if(!state||!activeLoot)return;
 if(activeLoot.type==='poi'){
  const poi=state.pois.find(n=>n.id===activeLoot.id);
  const items=(poiContents[poi?.kind]||[[poi?.kind,3]]).map(c=>c[0]);
  command('gather',{id:activeLoot.id,items});closeLootBox();
 }else if(activeLoot.type==='drop'){
  command('loot',{id:activeLoot.id,item:'all'});
 }
};
function interact(){
 if(autoHunt)setAutoHunt(false,true);
 clearMovement();if(!state)return;const w=state.world,p=w.player;
 const nearDrop=[...(w.drops||[])].sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];
 if(nearDrop&&Math.hypot(nearDrop.x-p.x,nearDrop.y-p.y)<=3.5){
  if(activeLoot?.type==='drop'&&activeLoot.id===nearDrop.id)command('loot',{id:nearDrop.id,item:'all'});
  else openLootBox({type:'drop',id:nearDrop.id});
  return;
 }
 const nearby=[...state.pois].sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];
 if(!nearby)return;
 const d=Math.hypot(nearby.x-p.x,nearby.y-p.y);
 if(nearby.kind==='npc'){
  if(d<=2.5)command('quest',{id:nearby.id});
  else{navigate(nearby.x,nearby.y,nearby.id);stepMovement();toast(`${nearby.label}에게 이동합니다.`);}
 }else if(d<=3.5){
  openLootBox({type:'poi',id:nearby.id});
 }else{
  inspectOnArrive=true;navigate(nearby.x,nearby.y,nearby.id);stepMovement();
  toast(`${nearby.label} 위치로 이동해 내부 파밍 아이템을 확인합니다.`);
 }
}
function quickLoot(){
 if(autoHunt)setAutoHunt(false,true);
 if(!state||state.world.paused)return;
 if(activeLoot&&!$('loot-all').disabled){$('loot-all').onclick();return;}
 const w=state.world,p=w.player;
 const nearDrop=[...(w.drops||[])].sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];
 if(nearDrop){
  const d=Math.hypot(nearDrop.x-p.x,nearDrop.y-p.y);
  if(d<=3.5){
   command('loot',{id:nearDrop.id,item:'all'});
   return;
  }
  inspectOnArrive=true;navigate(nearDrop.x,nearDrop.y,nearDrop.id);stepMovement();
  toast(`${nearDrop.label||'전리품'} 위치로 이동해 루팅합니다.`);
  return;
 }
 const nearPoi=[...state.pois].filter(n=>n.kind!=='npc').sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];
 if(nearPoi&&Math.hypot(nearPoi.x-p.x,nearPoi.y-p.y)<=3.5){
  openLootBox({type:'poi',id:nearPoi.id});
  return;
 }
 toast('주변에 루팅할 몬스터 전리품이 없습니다. 오브젝트 파밍은 E 키를 누르세요.');
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
 if(moveKeys.includes(k)){e.preventDefault();closePanel(false);closeLootBox();target=null;held.add(k);stepMovement();}
 if(e.repeat)return;
 if(k==='escape'){e.preventDefault();if(autoHunt)setAutoHunt(false,true);closeLootBox();closePanel();clearMovement();pendingAction=null;clearTimeout(pendingTimer);}
 const shortcut={h:'survival',c:'equip',i:'bag',j:'journal',u:'account',b:'camp'}[k];
 if(shortcut){e.preventDefault();if(activePanel===shortcut)closePanel();else openPanel(shortcut);}
 if(k==='q'||k==='r'){e.preventDefault();if(state?.world.player.chosen)useSkill(k==='q'?'sweep':'recover');}
 if(k==='e'){e.preventDefault();interact();}
 if(k==='f'){e.preventDefault();quickLoot();}
 if(k==='g'){e.preventDefault();if(state?.world.player.chosen&&!state.world.paused){closePanel(false);closeLootBox();setAutoHunt(!autoHunt);if(autoHunt)stepMovement();}}
 if(k==='m')manualAction('mount');
 if(k==='v')toggleFocus();
 if(k===' '&&(!activePanel||e.target.tagName!=='BUTTON')){e.preventDefault();manualAction('attack');}
});
window.addEventListener('keyup',e=>held.delete(e.key.toLowerCase()));
window.addEventListener('blur',()=>{clearMovement();pendingAction=null;clearTimeout(pendingTimer);});
document.addEventListener('visibilitychange',()=>{clearMovement();pendingAction=null;clearTimeout(pendingTimer);});
const touchKeys={up:'w',left:'a',down:'s',right:'d'};
for(const button of document.querySelectorAll('[data-direction]')){
 const key=touchKeys[button.dataset.direction];
 button.addEventListener('pointerdown',e=>{e.preventDefault();closePanel(false);closeLootBox();target=null;touchHeld.add(key);button.classList.add('pressed');button.setPointerCapture(e.pointerId);stepMovement();});
 const release=()=>{touchHeld.delete(key);button.classList.remove('pressed');};
 button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);
}
function stepMovement(){
 if(!state||!connected||busy||pendingAction||state.world.paused||!state.world.player.chosen||document.hidden)return;
 const now=performance.now(),moveGap=state.world.player.mounted?88:140;
 if(now-lastMove<moveGap||now-lastCommandAt<75)return;
 let {dx,dy}=screenDirection();
 if(autoHunt&&!dx&&!dy){
  const w=state.world,p=w.player;
  if(p.hp<=35&&w.inventory.medicine>0){command('consume',{item:'medicine'});return;}
  if(p.hp<=65&&!skillStatus('recover').reason){command('skill',{skill:'recover'});return;}
  const meter=p.species==='vampire'?'blood':'food',foodItem=p.species==='human'?(w.inventory.soup>0?'soup':w.inventory.water>0?'water':null):(w.inventory.elixir>0?'elixir':w.inventory.blood>0?'blood':null);
  if(p[meter]<20&&foodItem){command('consume',{item:foodItem});return;}
  if(p.hp<=25||p.infection>=70){setAutoHunt(false,true);command('rescue');toast('위급 상태 · 구조 요청 후 자동사냥을 종료합니다.');return;}
  const drops=w.drops||[];
  if(drops.length&&!isBagFull(w)){
   const nearDrop=drops.reduce((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)<=Math.hypot(b.x-p.x,b.y-p.y)?a:b);
   if(Math.hypot(nearDrop.x-p.x,nearDrop.y-p.y)<=2.2){command('loot',{id:nearDrop.id,item:'all'});return;}
   if(Math.hypot(nearDrop.x-p.x,nearDrop.y-p.y)<=18){target={x:nearDrop.x,y:nearDrop.y,id:nearDrop.id};selected=target.id;}
  }
  const alive=w.enemies.filter(e=>e.hp>0);
  if((!target||!target.id?.startsWith('drop:')||isBagFull(w))&&alive.length){
   const current=target?.id?.startsWith('enemy:')?alive.find(e=>'enemy:'+e.id===target.id):null;
   const nearest=alive.reduce((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)<=Math.hypot(b.x-p.x,b.y-p.y)?a:b);
   const chosen=current&&Math.hypot(current.x-p.x,current.y-p.y)<=Math.hypot(nearest.x-p.x,nearest.y-p.y)+3?current:nearest;
   if(p.mounted){
    if(!alive.some(e=>Math.hypot(e.x-p.x,e.y-p.y)<3)){command('mount');return;}
    dx=Math.sign(p.x-nearest.x)||1;dy=Math.sign(p.y-nearest.y)||1;lastMove=now;command('move',{dx,dy});return;
   }
   target={x:chosen.x,y:chosen.y,id:'enemy:'+chosen.id};selected=target.id;
  }
 }
 if(target&&!dx&&!dy){
  const p=state.world.player,m=state.map.movement;
  const enemy=target.id?.startsWith('enemy:')?state.world.enemies.find(n=>n.id===Number(target.id.split(':')[1])):null;
  const drop=target.id?.startsWith('drop:')?(state.world.drops||[]).find(d=>d.id===target.id):null;
  const npc=state.pois.find(n=>n.id===target.id&&n.kind==='npc');if(npc){target.x=npc.x;target.y=npc.y;}
  if(enemy){if(enemy.hp<=0){target=null;return;}target.x=enemy.x;target.y=enemy.y;}
  if(target.id?.startsWith('drop:')){if(!drop){target=null;return;}target.x=drop.x;target.y=drop.y;}
  const distance=Math.hypot(target.x-p.x,target.y-p.y),step=m.step*(p.mounted?m.mount_base+p.unlocks[p.species]*m.mount_tier:1);
  const arriveDist=target.id?(inspectOnArrive||target.id.startsWith('drop:')?2.2:1.5):step*.8;
  if(distance<=arriveDist){
   const id=target.id;if(!autoHunt||!id?.startsWith('enemy:'))target=null;
   if(id?.startsWith('enemy:')){
    if(autoHunt&&!skillStatus('sweep').reason){command('skill',{skill:'sweep'});return;}
    if(!autoHunt||(state.world.cooldowns.attack||0)<=state.world.elapsed)command('attack');
   }else if(id?.startsWith('drop:')){
    if(autoHunt&&!isBagFull(state.world))command('loot',{id,item:'all'});
    else openLootBox({type:'drop',id});
   }else if(id){
    const poi=state.pois.find(n=>n.id===id);
    if(poi){
     if(poi.kind==='npc')command('quest',{id});
     else if(inspectOnArrive){inspectOnArrive=false;openLootBox({type:'poi',id});}
     else command('gather',{id});
    }
   }
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
  [m.includes('gather'),'첫 자원 채집','목재나 식수 지점을 클릭하세요. 내부 자원을 확인하고 파밍합니다.'],
  [w.base.facilities[facility]>0,human?'아지트에 주방 건설':'아지트에 연금대 건설','아지트 관리 → 시설에서 건설하세요. 목재 3 · 부품 2'],
  [m.includes('craft:'+meal),human?'따뜻한 수프 제작':'안정화 혈액 제작',human?'아지트에서 수프 제작: 작물 2 · 식수 1':'아지트에서 강화혈액 제작: 원혈 2 · 약초 1 · 식수 1'],
  [m.includes('consume:'+meal),human?'첫 식사 하기':'강화혈액 마시기','하단 생존 메뉴에서 만든 소모품을 사용하세요.']
 ];
 const next=steps.find(s=>!s[0]),count=steps.filter(s=>s[0]).length;
 $('objective').textContent=next?next[1]:'첫 생존 완료 · 이제 나만의 아지트를 키워보세요';
 $('objective-detail').textContent=next?next[2]:'보급 의뢰, 의료실, 이동 연구와 종족 전환을 탐험하세요.';
 $('guide-hint').textContent=next?'✦ '+next[1]:'✦ 첫 생존 완료 · 수첩 열기';
 $('objective-count').textContent=`${count} / 5`;
 $('objective-steps').replaceChildren(...steps.map(s=>{const i=document.createElement('i');i.className=s[0]?'done':'';return i;}));
  const nearDrop=[...(w.drops||[])].sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];
  const dropCount=(w.drops||[]).length;
  $('loot-btn').disabled=w.paused||isBagFull(w);
  $('loot-btn-label').textContent=isBagFull(w)?'📦 가방 가득':dropCount?`📦 루팅 (${dropCount})`:'📦 드랍 루팅';
  if(nearDrop&&Math.hypot(nearDrop.x-p.x,nearDrop.y-p.y)<=3.5){
   $('nearby-label').textContent=nearDrop.label||'몬스터 전리품';
   $('interact').disabled=w.paused||isBagFull(w);
   $('interact').textContent=isBagFull(w)?'인벤 가득':'🔍 전리품 확인';
  }else{
   const nearest=[...state.pois].sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];
   const distance=Math.hypot(nearest.x-p.x,nearest.y-p.y),close=distance<=(nearest.kind==='npc'?2.5:3.5);
   const cooldown=close?Math.max(0,Math.ceil((w.cooldowns[nearest.id]||0)-w.elapsed)):0;
   $('nearby-label').textContent=close?nearest.label:`${nearest.label} (${Math.ceil(distance)}m)`;
   $('interact').disabled=w.paused;
   $('interact').textContent=cooldown?`🔍 파밍 (${cooldown}s)`:close?(nearest.kind==='npc'?'💬 의뢰 보고':'🔍 내용물 파밍'):'🔍 이동·파밍';
  }
 $('location-hint').textContent=autoHunt?'● 자동사냥 중'+(isBagFull(w)?' (가방 가득 참·루팅 제외)':' (자동 루팅 ON)')+' · '+p.x.toFixed(1)+' / '+p.y.toFixed(1):Math.hypot(p.x-w.base.x,p.y-w.base.y)<=state.map.base_radius?'● 안전지대 · 아지트':w.enemies.some(e=>e.hp>0&&Math.hypot(p.x-e.x,p.y-e.y)<4.8)?'● 감염체 접근 · 공격하거나 후퇴하세요':'◇ 탐색 중 · '+p.x.toFixed(1)+' / '+p.y.toFixed(1);
}
async function poll(){if(polling||busy||document.hidden||socket?.connected)return;polling=true;try{accept(await api('/api/state'));}catch(e){connected=false;clearMovement();if(state)updateContext();$('connection').textContent=e.message;$('connection').classList.add('status-error');if(!state){$('objective').textContent='서버 접속 링크를 확인하세요';$('objective-detail').textContent=e.message;}}finally{polling=false;}}
setInterval(poll,400);function frame(){if(!document.hidden)draw();requestAnimationFrame(frame);}frame();poll();
