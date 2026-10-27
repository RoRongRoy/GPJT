const $ = id => document.getElementById(id);
const query = new URLSearchParams(location.hash.slice(1));
if(query.has('key')) { sessionStorage.setItem('bloodfall-key', query.get('key')); history.replaceState(null,'',location.pathname); }
const key = sessionStorage.getItem('bloodfall-key') || '';
// Deliberately per-tab: a second tab must not silently share control of this P0 world.
const session = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}-${Math.random()}`;
let state = null, busy = false, connected = false, polling = false, toastTimer, selected = null;
let target=null, hurtUntil=0, pendingAction=null, pendingTimer=null, lastCommandAt=-Infinity, lastMove= -Infinity;
const held=new Set(), touchHeld=new Set();
const canvas=$('world'), view=new WorldView(canvas,$('minimap'));
const facilityRows=new Map();
let activePanel=null, panelOpener=null, inventoryFilter='all', selectedRecipe='soup';
const campPanels=new Set(['camp','craft','build','research','dispatch']);
const campActions=new Set(['craft','build','enhance','research','convert','dispatch']);
const panelInfo={
 survival:['생존','내 상태를 살피고 필요한 소모품을 사용하세요.','SURVIVOR'],
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
};
const panelParents={guide:'journal',quests:'journal',log:'journal',craft:'camp',build:'camp',research:'camp',dispatch:'camp'};
const recipeDetails={soup:['♨','포만도 +45 · 수분 +15'],elixir:['⚗','혈액량 +40 · 안정도 +45'],medicine:['+','체력 +40 · 감염 −60']};
const inventoryGroups={all:['wood','water','crop','herb','blood','metal','scroll','soup','elixir','medicine'],materials:['wood','water','crop','herb','blood','metal'],supplies:['soup','water','blood','elixir','medicine'],growth:['scroll']};
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
  if(action==='attack'||action==='skill')view.playCombat(before,result.world,action==='attack'?'attack':fields.skill);
 }catch(e){
  if(action==='move')view.endMove(false);
  if(e.status===409){
   try{accept(await api('/api/state'));}catch{connected=false;clearMovement();}
  }else if(!e.status){connected=false;clearMovement();}
  if(action!=='move')toast(e.message);
 }finally{
  // The server rate limit starts after its commit; retain this safety gap.
  lastCommandAt=performance.now();busy=false;schedulePending();
 }
}
function accept(data) { if(!state || data.world.revision >= state.world.revision) { if(state && data.world.player.hp<state.world.player.hp)hurtUntil=performance.now()+350; state=data; update(); } }
function span(className,text) { const n=document.createElement('span'); n.className=className; n.textContent=text; return n; }
function update() {
 if(!state) return;
 const w=state.world,p=w.player;
 updateContext();
 $('intro-art').hidden=p.chosen;
 document.body.dataset.species=p.chosen?p.species:'unchosen';
 const portrait=$('survivor-art');
 if(portrait.dataset.portraitSpecies!==p.species){portrait.dataset.portraitSpecies=p.species;portrait.src=p.species==='human'?'/art/human-warden.png':'/art/vampire-scholar.png';portrait.alt=p.species==='human'?'인간 생존자 초상':'뱀파이어 초상';}
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
 const tier=p.unlocks[p.species],forms=p.species==='human'?['도보','오토바이','험비']:['보행','박쥐','거대박쥐'];
 $('mobility').textContent=`이동 연구: ${forms[tier]} · ${p.mounted?'사용 중':'미사용'}`;
 document.querySelectorAll('[data-item]').forEach(b=>{const id=b.dataset.item;b.disabled=w.paused||!w.inventory[id]||(p.species==='human'?['blood','elixir'].includes(id):['soup','water'].includes(id));});
 renderRecipe();
}
function draw(){view.draw(state,target,selected,{hurtUntil});}
function clearMovement(){held.clear();touchHeld.clear();target=null;document.querySelectorAll('[data-direction]').forEach(b=>b.classList.remove('pressed'));}
function navigate(x,y,id=null){
 if(!state?.world.player.chosen||state.world.paused||!connected)return;
 closePanel(false);clearMovement();const max=state.map.size-2;
 target={x:Math.max(1,Math.min(max,x)),y:Math.max(1,Math.min(max,y)),id};selected=id;
}
function changeZoom(amount){const value=view.setZoom(view.zoom+amount);$('zoom-level').textContent=`${Math.round(value*100)}%`;draw();}
function toggleFocus(){const active=document.body.classList.toggle('focus-mode');$('focus-view').setAttribute('aria-pressed',String(active));draw();}
canvas.addEventListener('click',e=>{
 if(!view.projection||!state)return;
 const r=canvas.getBoundingClientRect(),cx=e.clientX-r.left,cy=e.clientY-r.top;
 const node=view.points.map(n=>({...n,d:Math.hypot(n.x-cx,n.y-cy)})).filter(n=>cx>=n.left&&cx<=n.right&&cy>=n.top&&cy<=n.bottom).sort((a,b)=>a.d-b.d)[0];
 if(node){
  if(node.id==='base'){if(canUseCamp()){openPanel('camp');return;}navigate(state.world.base.x,state.world.base.y);}
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
function goHome(){if(state){navigate(state.world.base.x,state.world.base.y);stepMovement();}}
$('go-home').onclick=goHome;$('travel-home').onclick=goHome;
$('interact').onclick=()=>interact();
function manualAction(action,fields={}){if(action==='attack'||action==='skill')closePanel(false);clearMovement();pendingAction=null;clearTimeout(pendingTimer);command(action,fields);}
$('pause').onclick=()=>manualAction('pause');
document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>manualAction(b.dataset.action));
document.querySelectorAll('[data-item]').forEach(b=>b.onclick=()=>manualAction('consume',{item:b.dataset.item}));
$('craft-submit').onclick=()=>manualAction('craft',{recipe:selectedRecipe});
document.querySelectorAll('button[data-species]').forEach(b=>b.onclick=()=>manualAction('choose',{species:b.dataset.species}));
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
 if(!panelInfo[name]||!state?.world.player.chosen||!connected)return false;
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
 document.querySelectorAll('[data-panel]').forEach(button=>button.disabled=!p.chosen||!connected);
 if(activePanel&&((campPanels.has(activePanel)&&!atCamp)||!connected))closePanel(false);
 $('field-hp').textContent=Math.ceil(p.hp);$('field-health-bar').style.width=`${Math.max(0,Math.min(100,p.hp))}%`;
 $('field-vital').textContent=p.species==='human'?`포만 ${Math.ceil(p.food)} · 수분 ${Math.ceil(p.water)}`:`혈액 ${Math.ceil(p.blood)} · 안정 ${Math.ceil(p.stability)}`;
 $('field-infection').hidden=p.infection<1;$('field-infection').textContent=`감염 ${Math.ceil(p.infection)}`;
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
 if(!id)return '아이템을 선택하세요.';
 if(!['soup','water','blood','elixir','medicine'].includes(id))return '직접 사용할 수 없는 제작·강화 재료입니다.';
 if(!connected)return '서버 연결을 기다리세요.';
 if(w.paused)return '일시정지를 해제하세요.';
 if(!w.inventory[id])return '보유한 아이템이 없습니다.';
 if(['soup','water'].includes(id)&&w.player.species!=='human')return '인간만 사용할 수 있습니다.';
 if(['blood','elixir'].includes(id)&&w.player.species!=='vampire')return '뱀파이어만 사용할 수 있습니다.';
 return '';
}
function renderInventory(){
 if(!state)return;
 const ids=inventoryGroups[inventoryFilter].filter(id=>state.world.inventory[id]>0);
 if(!inventoryGroups[inventoryFilter].includes(selectedItem))selectedItem=ids[0]||null;
 const layout=inventoryFilter+':'+ids.join(',');
 if(layout!==inventoryLayout){
  const slots=ids.map(id=>{
   if(!itemSlots.has(id)){
    const button=document.createElement('button'),img=document.createElement('img'),name=span('slot-name',state.items[id]),count=span('slot-count','');
    button.className='item-slot';button.dataset.inventoryItem=id;img.src='/icons/'+id+'.svg';img.alt='';img.width=48;img.height=48;
    button.append(img,name,count);button.onclick=()=>{selectedItem=id;renderInventory();};itemSlots.set(id,{button,count});
   }
   return itemSlots.get(id).button;
  });
  for(let i=ids.length;i<20;i++){const empty=document.createElement('span');empty.className='item-slot empty-slot';empty.setAttribute('aria-hidden','true');slots.push(empty);}
  $('inventory').replaceChildren(...slots);inventoryLayout=layout;
 }
 for(const id of ids){const {button,count}=itemSlots.get(id),amount=state.world.inventory[id];count.textContent=amount;button.setAttribute('aria-label',state.items[id]+' '+amount+'개');button.setAttribute('aria-pressed',String(id===selectedItem));}
 $('bag-count').textContent=Object.values(state.world.inventory).filter(n=>n>0).length+'종 보유';$('inventory-empty').hidden=ids.length>0;
 const info=itemInfo[selectedItem];$('item-art').hidden=!info;if(info)$('item-art').src='/icons/'+selectedItem+'.svg';
 $('item-category').textContent=info?.[0]||'';$('item-name').textContent=selectedItem?state.items[selectedItem]:'비어 있는 가방';
 $('item-description').textContent=info?.[1]||'채집하거나 제작해 아이템을 획득하세요.';$('item-effect').textContent=info?.[2]||'';
 $('item-owned').textContent=selectedItem?'보유 수량 · '+(state.world.inventory[selectedItem]||0):'';
 const reason=itemUseReason(selectedItem);$('item-use').disabled=Boolean(reason);$('item-use').textContent='1개 사용';$('item-use-reason').textContent=reason||'선택한 아이템 1개를 사용합니다.';
}
$('item-use').onclick=()=>{if(selectedItem&&!itemUseReason(selectedItem))manualAction('consume',{item:selectedItem});};
function skillStatus(id){
 const w=state.world,p=w.player,spec=state.combat?.[id];
 if(!spec)return {reason:'서버 연결 중'};
 const meter=p.species==='vampire'?'blood':'food',cost=spec.cost;
 const remaining=Math.max(0,(w.cooldowns['skill:'+id]||0)-w.elapsed,id==='sweep'?(w.cooldowns.attack||0)-w.elapsed:0);
 const reason=!connected?'연결 중':w.paused?'일시정지':p.mounted?'하차 후 사용':remaining>0?remaining.toFixed(1)+'초':p[meter]<cost?'자원 부족':id==='recover'&&p.hp>=100?'체력 가득':id==='sweep'&&!w.enemies.some(e=>e.hp>0&&Math.hypot(e.x-p.x,e.y-p.y)<=spec.range)?'적에게 접근':'';
 return {reason,spec,meter,cost,remaining};
}
function updateSkills(){
 if(!state)return;$('skill-bar').hidden=!state.world.player.chosen;
 for(const id of ['sweep','recover']){
  const {reason,spec,cost}=skillStatus(id);if(!spec)continue;
  const name=state.world.player.species==='vampire'?spec.vampire_name:spec.name;
  $('skill-'+id+'-name').textContent=name;$('skill-'+id+'-status').textContent=reason||(spec.damage?'피해 '+spec.damage:'회복 '+spec.heal)+' · '+(state.world.player.species==='vampire'?'혈액 ':'포만 ')+cost;
  $('skill-'+id).disabled=Boolean(reason);$('skill-'+id).title=name+' · '+(spec.damage?'주변 적 피해 '+spec.damage:'체력 +'+spec.heal)+' · 재사용 '+spec.cooldown+'초 · '+(state.world.player.species==='vampire'?'혈액 ':'포만 ')+cost;
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
 if(moveKeys.includes(k)){e.preventDefault();closePanel(false);target=null;held.add(k);stepMovement();}
 if(e.repeat)return;
 if(k==='escape'){e.preventDefault();closePanel();clearMovement();pendingAction=null;clearTimeout(pendingTimer);}
 const shortcut={h:'survival',i:'bag',j:'journal',b:'camp'}[k];
 if(shortcut){e.preventDefault();if(activePanel===shortcut)closePanel();else openPanel(shortcut);}
 if(k==='q'||k==='r'){e.preventDefault();if(state?.world.player.chosen)useSkill(k==='q'?'sweep':'recover');}
 if(k==='e'){e.preventDefault();interact();}
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
 button.addEventListener('pointerdown',e=>{e.preventDefault();closePanel(false);target=null;touchHeld.add(key);button.classList.add('pressed');button.setPointerCapture(e.pointerId);stepMovement();});
 const release=()=>{touchHeld.delete(key);button.classList.remove('pressed');};
 button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);
}
function stepMovement(){
 if(!state||!connected||busy||pendingAction||state.world.paused||!state.world.player.chosen||document.hidden)return;
 const now=performance.now();if(now-lastMove<140||now-lastCommandAt<75)return;
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
 const nearest=[...state.pois].sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];
 const distance=Math.hypot(nearest.x-p.x,nearest.y-p.y),close=distance<=(nearest.kind==='npc'?2.5:2);
 const cooldown=close?Math.max(0,Math.ceil((w.cooldowns[nearest.id]||0)-w.elapsed)):0;
 $('nearby-label').textContent=close?nearest.label:'지도 클릭으로 탐험';
 $('interact').disabled=!close||!!cooldown||w.paused;
 $('interact').textContent=cooldown?`${cooldown}초 대기`:nearest.kind==='npc'?'E · 의뢰 보고':'E · 채집';
 $('location-hint').textContent=Math.hypot(p.x-w.base.x,p.y-w.base.y)<=state.map.base_radius?'● 안전지대 · 아지트':w.enemies.some(e=>e.hp>0&&Math.hypot(p.x-e.x,p.y-e.y)<4.8)?'● 감염체 접근 · 공격하거나 후퇴하세요':'◇ 탐색 중 · '+p.x.toFixed(1)+' / '+p.y.toFixed(1);
}
async function poll(){if(polling||busy||document.hidden)return;polling=true;try{accept(await api('/api/state'));}catch(e){connected=false;clearMovement();if(state)updateContext();$('connection').textContent=e.message;$('connection').classList.add('status-error');if(!state){$('objective').textContent='서버 접속 링크를 확인하세요';$('objective-detail').textContent=e.message;}}finally{polling=false;}}
setInterval(poll,400);function frame(){if(!document.hidden)draw();requestAnimationFrame(frame);}frame();poll();
