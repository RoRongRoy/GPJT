const $ = id => document.getElementById(id);
const query = new URLSearchParams(location.hash.slice(1));
if(query.has('key')) { sessionStorage.setItem('bloodfall-key', query.get('key')); history.replaceState(null,'',location.pathname); }
const key = sessionStorage.getItem('bloodfall-key') || '';
// Deliberately per-tab: a second tab must not silently share control of this P0 world.
const session = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}-${Math.random()}`;
let state = null, busy = false, connected = false, polling = false, toastTimer, selected = null;
let target=null, hurtUntil=0, pendingAction=null, pendingTimer=null, lastCommandAt=-Infinity, lastMove= -Infinity, autoHunt=false, sprintToggle=false, shiftHeld=false, pointerDown=false;
const held=new Set(), touchHeld=new Set();
const movementInput={dx:0,dy:0,sprint:false,seq:0,lastSent:-Infinity,pending:0,rtt:0};
const canvas=$('world'), view=new WorldView(canvas,$('minimap'));
const facilityRows=new Map();
let activePanel=null, panelOpener=null, inventoryFilter='all', selectedRecipe='soup';
const campPanels=new Set(['camp','craft','build','research','dispatch']);
const campActions=new Set(['craft','build','enhance','research','convert','dispatch']);
const panelInfo={
 survival:['생존','내 상태를 살피고 필요한 소모품을 사용하세요.','SURVIVOR'],
 skills:['종족 스킬','전투 레벨 성장에 따라 해금되는 종족별 고유 전투·회복 기술을 확인하고 시전하세요.','SPECIES SKILLS'],
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
 'controls-view':['조작키 안내','BLOODFALL 단축키 및 탐험·전투 기능입니다.','CONTROLS'],
};
const panelParents={guide:'journal',quests:'journal',log:'journal',travel:'journal',craft:'camp',build:'camp',research:'camp',dispatch:'camp','controls-view':'account'};
const categoryMap={
 equip:'character',skills:'character',survival:'character',
 bag:'bag',
 journal:'journal',guide:'journal',quests:'journal',log:'journal',travel:'journal',
 camp:'camp',craft:'camp',build:'camp',research:'camp',dispatch:'camp',
 account:'system','controls-view':'system'
};
const categorySubnav={
 character:[
  {panel:'equip',label:'⚔ 장착 장비',key:'C'},
  {panel:'skills',label:'✦ 종족 스킬',key:'K'},
  {panel:'survival',label:'♡ 생존 상태',key:'H',id:'menu-survival'}
 ],
 journal:[
  {panel:'guide',label:'✦ 첫 생존'},
  {panel:'quests',label:'◇ 보급 의뢰'},
  {panel:'log',label:'≡ 생존 기록'},
  {panel:'travel',label:'⌖ 사냥터 안내'}
 ],
 camp:[
  {panel:'craft',label:'♨ 제작'},
  {panel:'build',label:'⌂ 시설'},
  {panel:'research',label:'✧ 연구'},
  {panel:'dispatch',label:'⚑ 파견'}
 ],
 system:[
  {panel:'account',label:'💾 계정 저장·불러오기',key:'U'},
  {panel:'controls-view',label:'⌨ 전체 조작키'}
 ]
};
function updateSubnav(name){
 const subnav=$('menu-subnav');
 if(!subnav)return;
 const cat=categoryMap[name]||name;
 const items=categorySubnav[cat];
 if(!items||!items.length){subnav.hidden=true;subnav.innerHTML='';return;}
 subnav.hidden=false;
 subnav.innerHTML=items.map(item=>`
  <button type="button" class="subnav-tab${item.panel===name?' active':''}" data-panel="${item.panel}" aria-selected="${item.panel===name}"${item.id?` id="${item.id}"`:''}>
   <span>${item.label}</span>${item.key?`<kbd>${item.key}</kbd>`:''}
  </button>
 `).join('');
 for(const btn of (subnav.querySelectorAll ? subnav.querySelectorAll('[data-panel]') : document.querySelectorAll('#menu-subnav [data-panel]') || [])){
  btn.onclick=()=>openPanel(btn.dataset.panel);
 }
}
const recipeDetails={soup:['♨','포만도 +45 · 수분 +15'],elixir:['⚗','혈액량 +40 · 안정도 +45'],medicine:['+','체력 +40 · 감염 −60']};
const inventoryGroups={all:['wood','water','crop','herb','blood','metal','scroll','skillbook','soup','elixir','medicine'],materials:['wood','water','crop','herb','blood','metal'],supplies:['soup','water','blood','elixir','medicine'],growth:['scroll','skillbook'],equipment:[]};
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
let socket=null,moveBusy=false,lastSocketAt=0;
function updateConnectionBadge(){
 $('connection').classList.remove('status-error');
 const count=state?.online_count||1;
 $('connection').textContent=socket?.connected?`● Socket.IO 멀티플레이 (${count}명 접속) · 서버 상태 관리`:`● 서버 연결 (${count}명 접속) · 자동 저장`;
}
if(typeof io==='function'){
 socket=io({auth:{key,session},query:{key,session},reconnectionDelay:600});
 socket.on('connect',()=>{connected=true;lastSocketAt=performance.now();updateConnectionBadge();});
 socket.on('state',data=>{connected=true;lastSocketAt=performance.now();accept(data,true);updateConnectionBadge();});
 socket.on('disconnect',()=>{clearMovement();view.resetInput();updateConnectionBadge();});
 socket.on('connect_error',err=>{
  if(!connected&&!state){$('connection').textContent=err.message||'서버 연결 재시도 중...';$('connection').classList.add('status-error');}
 });
}
async function api(path, body) {
 if(socket?.connected){
  try{
   return await new Promise((resolve,reject)=>{
    const ev=path==='/api/input'?'input':path==='/api/action'?'action':'state';
    socket.emit(ev,body||{},res=>{
     if(res?.ok){connected=true;if(res.state)lastSocketAt=performance.now();updateConnectionBadge();resolve(path==='/api/input'?res.input:res.state);}
     else{const error=new Error(res?.error||'서버 오류');error.status=res?.status||400;reject(error);}
    });
   });
  }catch(err){
   if((err.status!==408&&err.status!==503)||path==='/api/action')throw err;
   // Only reads and sequenced direction inputs are safe to retry after a lost ACK.
  }
 }
 const response = await fetch(path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Access-Key':key,'X-Session-ID':session},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(5000),keepalive:path==='/api/input'});
 const data = await response.json();
 if(!response.ok) { const error=new Error(data.error || '서버 오류'); error.status=response.status; throw error; }
 connected=true; updateConnectionBadge(); return data;
}
function driveMovement(dx,dy){
 if(!state?.movement?.enabled)return;
 const sprint=Boolean((dx||dy)&&isSprinting());
 const input=movementInput,now=performance.now(),changed=dx!==input.dx||dy!==input.dy||sprint!==input.sprint;
 input.dx=dx;input.dy=dy;input.sprint=sprint;
 if(!changed&&(!(dx||dy)||now-input.lastSent<100||input.pending>=2))return;
 // Direction changes and release supersede old packets; never replay a movement queue.
 const seq=++input.seq;input.lastSent=now;input.pending++;
 view.setInput(state,dx,dy,seq,sprint);
 api('/api/input',{seq,dx,dy,sprint}).then(()=>{
  const rtt=performance.now()-now;input.rtt=input.rtt?input.rtt*.75+rtt*.25:rtt;view.inputLatency=Math.min(.2,input.rtt/2000);
 }).catch(e=>{
  if(seq<input.seq)return;
  if(!e.status)connected=false;
  clearMovement();view.resetInput();
 }).finally(()=>{input.pending--;});
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
 const isMove=(action==='move');
 if(busy||moveBusy||performance.now()-lastCommandAt<75){
  if(!isMove){pendingAction={action,fields};schedulePending();}
  return;
 }
 const before=state.world;
 if(isMove)moveBusy=true;else busy=true;
 lastCommandAt=performance.now();
 if(isMove)view.predictMove(state,fields);
 try {
  const result=await api('/api/action',{revision:state.world.revision,command:{action,...fields,...(state.movement?.enabled?{input_seq:movementInput.seq}:{})}});
  if(isMove)view.endMove(true);
  accept(result);
  const drops=(result.world.gear||[]).filter(g=>!(before.gear||[]).some(old=>old.id===g.id));
  const killed=(before.enemies||[]).filter(old=>old.hp>0&&result.world.enemies.some(e=>e.id===old.id&&e.hp<=0));
  if(drops.length)toast('★ 장비 드랍 · '+drops.map(g=>itemName(g.id)).join(' · ')+' · 가방에 보관');
  else if(result.world.player.combat_level>before.player.combat_level)toast(`전투 레벨 상승 · Lv.${result.world.player.combat_level}`);
  else if(killed.length)toast(result.world.log[0]||'몬스터 처치 · 전리품 획득');
  if(action==='attack'||action==='skill')view.playCombat(before,result.world,action==='attack'?'attack':fields.skill);
 }catch(e){
  if(isMove)view.endMove(false,e.status===409||e.status===429||e.status===408||e.status===503);
  if(e.status===409){
   try{
    accept(await api('/api/state'));
    if(['choose','new_adventurer','account_save','account_load','restore_local_save','learn_skill','change_class'].includes(action)){
     const retry=await api('/api/action',{revision:state.world.revision,command:{action,...fields,...(state.movement?.enabled?{input_seq:movementInput.seq}:{})}});
     accept(retry);
     return;
    }
   }catch{if(!socket?.connected){connected=false;clearMovement();}}
  }else if(!e.status&&!socket?.connected){connected=false;clearMovement();}
  if(!isMove&&e.status!==429)toast(e.message);
 }finally{
  // The server rate limit starts after its commit; retain this safety gap.
  lastCommandAt=performance.now();
  if(isMove){moveBusy=false;if(held.size||touchHeld.size||target)setTimeout(stepMovement,12);}
  else busy=false;
  schedulePending();
 }
}
let welcomeForced=false,activityLogKey='',selectedGender='male',selectedJob='warrior';
const CLASS_CATALOG={
 human:{
  warrior:{name:'전사',style:'근거리',weapon_type:'검',attack_range:2.1,skill_range_bonus:0,starter_weapon:'녹슨 기본 단검',desc:'도검을 다루는 근접 전투 전문가. 근거리 참격과 강타로 전선을 돌파합니다.'},
  ranged:{name:'거너',style:'원거리',weapon_type:'총기',attack_range:4.2,skill_range_bonus:1.2,starter_weapon:'구형 제식 권총',desc:'총기를 사용하는 원거리 화력 전문가. 사거리 4.2의 사격과 탄막 기술로 적을 제압합니다.'},
 },
 vampire:{
  warrior:{name:'전사',style:'근거리',weapon_type:'클로',attack_range:2.1,skill_range_bonus:0,starter_weapon:'무딘 혈족 클로',desc:'양손에 날카로운 클로를 장착한 근거리 혈투사. 적을 찢고 피를 흡수합니다.'},
  ranged:{name:'혈법사',style:'원거리',weapon_type:'지팡이',attack_range:4.2,skill_range_bonus:1.2,starter_weapon:'고목 혈마법 지팡이',desc:'지팡이로 원거리 혈마법을 구사하는 혈법사. 사거리 4.2의 혈탄과 광역 비전을 시전합니다.'},
 },
};
function classInfo(species='human',job='warrior'){return (state?.classes?.[species]?.[job])||CLASS_CATALOG[species]?.[job]||CLASS_CATALOG.human.warrior;}
function genderName(gender='male'){return gender==='female'?'여성':'남성';}
// Local storage backup & dual persistence helpers
function saveLocalAccountBackup(username, password, world) {
 if (!world || !world.player) return;
 const p = world.player;
 const profileKeys = ['player', 'inventory', 'gear', 'equipment', 'cooldowns', 'quest', 'milestones', 'dispatch', 'base', 'next_gear_id'];
 const profile = {};
 for (const k of profileKeys) { if (world[k]) profile[k] = world[k]; }
 const summary = {
  username,
  species: p.species,
  gender: p.gender || 'male',
  job: p.job || 'warrior',
  level: p.combat_level || 1,
  savedAt: Date.now()
 };
 try {
  if (username) {
   localStorage.setItem('bloodfall_acc_' + username.toLowerCase(), JSON.stringify({username, password, profile, summary}));
   localStorage.setItem('bloodfall_last_login', JSON.stringify({username, password, summary}));
  }
  localStorage.setItem('bloodfall_quicksave_profile', JSON.stringify({profile, summary}));
 } catch (e) {}
}

function getLocalAccountBackup(username) {
 try {
  const raw = localStorage.getItem('bloodfall_acc_' + (username || '').toLowerCase());
  return raw ? JSON.parse(raw) : null;
 } catch (e) { return null; }
}

function getLastLogin() {
 try {
  const raw = localStorage.getItem('bloodfall_last_login');
  return raw ? JSON.parse(raw) : null;
 } catch (e) { return null; }
}

let lastBackupTime = 0;
function backupCurrentWorld(world) {
 if (!world || !world.player || !world.player.chosen) return;
 const now = Date.now();
 if (now - lastBackupTime < 2000) return; // throttle to 2s
 lastBackupTime = now;
 saveLocalAccountBackup(world.player.account || '', '', world);
}

function updateWelcomeAccountUI() {
 const last = getLastLogin();
 const quickBox = $('welcome-quick-resume');
 if (last && last.summary) {
  const s = last.summary;
  const spText = s.species === 'vampire' ? '뱀파이어' : '인간';
  const jText = s.job === 'ranged' ? (s.species === 'vampire' ? '혈법사' : '거너') : '전사';
  if (quickBox) {
   quickBox.hidden = false;
   quickBox.innerHTML = `
    <div class="quick-resume-content">
     <span class="quick-resume-icon">⚡</span>
     <div>
      <strong>최근 플레이 계정: <span class="highlight">${s.username}</span></strong>
      <small>Lv.${s.level} ${spText} ${jText} · 안전하게 저장됨</small>
     </div>
    </div>
    <button type="button" id="welcome-quick-btn" class="accent quick-resume-btn">바로 이어하기 ▶</button>
   `;
   const qBtn = $('welcome-quick-btn');
   if (qBtn) qBtn.onclick = () => submitAccountAction('account_load', {username: last.username, password: last.password}, 'welcome-account-msg');
  }
  if ($('welcome-account-id') && !$('welcome-account-id').value) $('welcome-account-id').value = last.username;
  if ($('welcome-account-pw') && !$('welcome-account-pw').value) $('welcome-account-pw').value = last.password;
  if ($('account-load-id') && !$('account-load-id').value) $('account-load-id').value = last.username;
  if ($('account-load-pw') && !$('account-load-pw').value) $('account-load-pw').value = last.password;
 } else {
  try {
   const q = JSON.parse(localStorage.getItem('bloodfall_quicksave_profile') || 'null');
   if (q && q.profile && q.profile.player && q.profile.player.chosen) {
    const p = q.profile.player;
    const spText = p.species === 'vampire' ? '뱀파이어' : '인간';
    if (quickBox) {
     quickBox.hidden = false;
     quickBox.innerHTML = `
      <div class="quick-resume-content">
       <span class="quick-resume-icon">⚡</span>
       <div>
        <strong>마지막 플레이 캐릭터 (로컬 백업)</strong>
        <small>Lv.${p.combat_level || 1} ${spText} · 브라우저 저장됨</small>
       </div>
      </div>
      <button type="button" id="welcome-quick-local-btn" class="accent quick-resume-btn">이어서 플레이 ▶</button>
     `;
     const qlBtn = $('welcome-quick-local-btn');
     if (qlBtn) qlBtn.onclick = async () => {
      try {
       const res = await api('/api/action', {
        revision: state.world.revision,
        command: { action: 'restore_local_save', profile: q.profile }
       });
       welcomeForced = false;
       accept(res);
       toast('로컬 저장 데이터를 복원했습니다.');
      } catch (err) { toast(err.message || '복원 실패'); }
     };
    }
   } else if (quickBox) {
    quickBox.hidden = true;
   }
  } catch (e) {}
 }
}

function updateWelcomeCustomizer(){
 const gText=genderName(selectedGender),hCls=classInfo('human',selectedJob),vCls=classInfo('vampire',selectedJob);
 document.querySelectorAll('[data-select-gender]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.selectGender===selectedGender)));
 document.querySelectorAll('[data-select-job]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.selectJob===selectedJob)));
  document.querySelectorAll('.portrait-pair img').forEach(i=>i.classList.toggle('selected-gender',i.dataset.gender===selectedGender));
 if($('welcome-human-title'))$('welcome-human-title').textContent=`인간 · ${gText} ${hCls.name}`;
 if($('welcome-human-sub'))$('welcome-human-sub').textContent=`HUMAN · ${hCls.style} · ${hCls.weapon_type} · 사거리 ${hCls.attack_range}`;
 if($('welcome-human-trait'))$('welcome-human-trait').textContent=`기본 무기: ${hCls.starter_weapon} · MP 전술 스킬`;
 if($('welcome-vampire-title'))$('welcome-vampire-title').textContent=`뱀파이어 · ${gText} ${vCls.name}`;
 if($('welcome-vampire-sub'))$('welcome-vampire-sub').textContent=`VAMPIRE · ${vCls.style} · ${vCls.weapon_type} · 사거리 ${vCls.attack_range}`;
 if($('welcome-vampire-trait'))$('welcome-vampire-trait').textContent=`기본 무기: ${vCls.starter_weapon} · 흡혈 및 혈족 비전`;
 updateWelcomeAccountUI();
}
document.querySelectorAll('[data-select-gender]').forEach(b=>b.onclick=()=>{selectedGender=b.dataset.selectGender;updateWelcomeCustomizer();});
document.querySelectorAll('[data-select-job]').forEach(b=>b.onclick=()=>{selectedJob=b.dataset.selectJob;updateWelcomeCustomizer();});
updateWelcomeCustomizer();
function accept(data,fromBroadcast=false) {
 if(!data?.world)return;
 if(!state || (data.world.revision >= state.world.revision&&(!data.snapshot_time||!state.snapshot_time||data.snapshot_time>=state.snapshot_time))) {
  if(state && data.world.player.hp<state.world.player.hp)hurtUntil=performance.now()+350;
  // Prevent a delayed peer broadcast from snapping the local player's position backward while a move is in flight
  if(!data.movement?.enabled&&fromBroadcast && moveBusy && state?.world?.player){
   data.world.player.x=state.world.player.x;
   data.world.player.y=state.world.player.y;
  }
  state=data;backupCurrentWorld(data.world);view.reconcileInput(data);update();
 }
}
function span(className,text) { const n=document.createElement('span'); n.className=className; n.textContent=text; return n; }
function update() {
 if(!state) return;
 const w=state.world,p=w.player;
 updateContext();
 $('intro-art').hidden=p.chosen&&!welcomeForced;
 if(!p.chosen||welcomeForced)updateWelcomeAccountUI();
 document.body.dataset.species=p.chosen?p.species:'unchosen';
 const portrait=$('survivor-art');
 const portraitKey=p.species+':'+(p.gender||'male');if(portrait.dataset.portraitSpecies!==portraitKey){portrait.dataset.portraitSpecies=portraitKey;const fem=p.gender==='female';portrait.src=p.species==='human'?(fem?'/art/human-warden.png':'/art/human-male-warden.png'):(fem?'/art/vampire-female-scholar.png':'/art/vampire-scholar.png');portrait.alt=(p.species==='human'?'인간 ':'뱀파이어 ')+(fem?'여성':'남성')+' 초상';}
 $('welcome').hidden=p.chosen&&!welcomeForced; $('welcome-close-btn').hidden=!p.chosen; $('interaction').hidden=!p.chosen; if(w.paused){if(autoHunt)setAutoHunt(false,true);clearMovement();} updateGuide();
 const region=view.region(state,p.x,p.y);$('region-name').textContent=region.name;$('region-description').textContent=region.subtitle+(region.levels?` · 권장 Lv.${region.levels.join('–')}${(p.combat_level||1)<region.levels[0]?' · 위험 지역':''}`:'');
 $('coordinates').textContent=`${Math.floor(p.x).toString().padStart(2,'0')} / ${Math.floor(p.y).toString().padStart(2,'0')}`;
 const cls=classInfo(p.species,p.job||'warrior'),gName=genderName(p.gender||'male');
 $('species').textContent=!p.chosen?'새로운 생존자':`${p.species==='human'?'인간':'뱀파이어'} · ${gName} ${cls.name} (${cls.style}·${cls.weapon_type})`;
 $('pause-overlay').hidden=!w.paused;
 $('pause').textContent=w.paused?'계속하기':'일시정지';

 $('level').textContent=`Lv.${p.combat_level||1} · EXP ${p.xp||0}/${(p.combat_level||1)>=50?'MAX':(p.combat_level||1)*40} · 공격 사거리 ${cls.attack_range} · 공격력 +${((p.combat_level||1)-1)*3} · 방어력 +${Math.floor(((p.combat_level||1)-1)/2)} · 무기강화 +${p.level}`;
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
 renderActivityLog();
 $('log').replaceChildren(...w.log.slice(0,5).map(t=>{const li=document.createElement('li');li.textContent=t;return li;}));
 $('quest-progress').textContent=`채집 ${Math.min(5,w.quest.collected)} / 5 · 완료 ${w.quest.round}회`;
 $('dispatch-cost').textContent=p.species==='human'?'파견 비용 · 작물 1':'파견 비용 · 원혈 1';
 $('dispatch').textContent=w.dispatch?`파견 복귀까지 ${Math.ceil(w.dispatch.ends-w.elapsed)}초`:'파견 대기 · 완료 시 자원 자동 보관';
 const tier=p.unlocks[p.species],forms=p.species==='human'?['슬레이어 스카우트 바이크','슬레이어 나이트크루저','아머드 배틀 크루저']:['블러드 배트 변신','나이트메어 광폭 박쥐','아크데몬 군주 박쥐'];
 $('mobility').textContent=`다크에덴 이동 형태: ${forms[tier]} · ${p.mounted?'탑승·변신 중 (고속 이동)':'미사용 (M키 즉시 탑승)'}`;
 const mountLbl=$('mount-label');const mountTxt=p.mounted?'⏬ 하차':p.species==='human'?'🏍 탑승':'🦇 변신';if(mountLbl)mountLbl.textContent=mountTxt;else $('mount-toggle').textContent=mountTxt;
 document.querySelectorAll('[data-item]').forEach(b=>{const id=b.dataset.item;b.disabled=w.paused||!w.inventory[id]||(p.species==='human'?['blood','elixir'].includes(id):['soup','water'].includes(id));});
 renderRecipe();renderLootBox();
}
function renderActivityLog(){
 const entries=(state.world.log||[]).slice(0,4),key=JSON.stringify(entries);
 $('activity-feed').hidden=!state.world.player.chosen||welcomeForced||!entries.length;
 if(key===activityLogKey)return;
 activityLogKey=key;
 $('activity-messages').replaceChildren(...entries.map(message=>{
  const item=document.createElement('li');item.textContent=message;return item;
 }));
}
function isSprinting(){return Boolean(state?.world.player.chosen&&!state?.world.paused&&connected&&(sprintToggle||shiftHeld));}
function updateSprintUI(){
 const active=isSprinting();
 const btn=$('sprint-toggle'),lbl=$('sprint-label');
 if(btn){btn.disabled=!state?.world.player.chosen||!connected||state.world.paused;btn.setAttribute('aria-pressed',String(active));}
 if(lbl)lbl.textContent=active?'🏃 질주':'🏃 걷기';
}
function setSprint(active,silent=false){
 const next=Boolean(active&&state?.world.player.chosen&&!state?.world.paused&&connected);
 sprintToggle=next;updateSprintUI();
 if(!silent)toast(sprintToggle?'🏃 달리기 ON · 이동 속도가 65% 빨라집니다 (Shift 또는 버튼으로 해제)':'달리기 OFF · 일반 걸음으로 이동합니다');
}
function draw(){view.draw(state,target,selected,{hurtUntil,sprinting:isSprinting()});}
function clearMovement(){held.clear();touchHeld.clear();shiftHeld=false;pointerDown=false;driveMovement(0,0);target=null;updateSprintUI();document.querySelectorAll('[data-direction]').forEach(b=>b.classList.remove('pressed'));}
function navigate(x,y,id=null){
 if(!state?.world.player.chosen||state.world.paused||!connected)return;
 if(autoHunt&&!id?.startsWith('enemy:'))setAutoHunt(false,true);
 closePanel(false);held.clear();touchHeld.clear();document.querySelectorAll('[data-direction]').forEach(b=>b.classList.remove('pressed'));
 const max=state.map.size-2;
 target={x:Math.max(1,Math.min(max,x)),y:Math.max(1,Math.min(max,y)),id};selected=id;
}
function changeZoom(amount){const value=view.setZoom(view.zoom+amount);$('zoom-level').textContent=`${Math.round(value*100)}%`;draw();}
function toggleFocus(){const active=document.body.classList.toggle('focus-mode');$('focus-view').setAttribute('aria-pressed',String(active));draw();}
function handleCanvasPoint(e,allowNode=true){
 if(!view.projection||!state)return;
 if(e.shiftKey&&!shiftHeld){shiftHeld=true;updateSprintUI();}
 const r=canvas.getBoundingClientRect(),cx=e.clientX-r.left,cy=e.clientY-r.top,p=state.world.player;
 const node=allowNode?view.points.map(n=>({...n,d:Math.hypot(n.x-cx,n.y-cy)})).filter(n=>cx>=n.left&&cx<=n.right&&cy>=n.top&&cy<=n.bottom).sort((a,b)=>a.d-b.d)[0]:null;
 if(node){
  if(node.id==='base'){inspectOnArrive=false;if(canUseCamp()){openPanel('camp');return;}navigate(state.world.base.x,state.world.base.y);}
  else if(node.id.startsWith('enemy:')){inspectOnArrive=false;const enemy=state.world.enemies.find(n=>n.id===Number(node.id.split(':')[1]));if(enemy)navigate(enemy.x,enemy.y,node.id);}
  else if(node.id.startsWith('drop:')){const drop=(state.world.drops||[]).find(d=>d.id===node.id);if(drop){if(Math.hypot(drop.x-p.x,drop.y-p.y)<=3.5){clearMovement();selected=drop.id;openLootBox({type:'drop',id:drop.id});return;}inspectOnArrive=true;navigate(drop.x,drop.y,drop.id);}}
  else{const poi=state.pois.find(n=>n.id===node.id);if(poi){if(poi.kind!=='npc'&&Math.hypot(poi.x-p.x,poi.y-p.y)<=3.5){clearMovement();selected=poi.id;openLootBox({type:'poi',id:poi.id});return;}inspectOnArrive=poi.kind!=='npc';navigate(poi.x,poi.y,poi.id);}}
 }else{inspectOnArrive=false;const point=view.toWorld(cx,cy);if(point.x>=0&&point.y>=0&&point.x<state.map.size&&point.y<state.map.size)navigate(point.x,point.y);}
 canvas.focus({preventScroll:true});stepMovement();
}
canvas.addEventListener('click',e=>handleCanvasPoint(e,true));
canvas.addEventListener('contextmenu',e=>{e.preventDefault();handleCanvasPoint(e,true);});
canvas.addEventListener('dblclick',e=>{e.preventDefault();if(state?.world.player.chosen&&!state.world.paused){setSprint(true,true);handleCanvasPoint(e,false);}});
canvas.addEventListener('pointerdown',e=>{if(e.button===0||e.button===2){pointerDown=true;}});
canvas.addEventListener('pointermove',e=>{if(pointerDown&&(e.buttons&3)){handleCanvasPoint(e,false);}});
window.addEventListener('pointerup',()=>{pointerDown=false;});
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
if($('sprint-toggle'))$('sprint-toggle').onclick=()=>{if(!state?.world.player.chosen||!connected)return;if(state.world.paused){toast('일시정지를 해제하세요.');return;}setSprint(!sprintToggle);stepMovement();};
function setAutoHunt(active,silent=false){
 const next=Boolean(active&&state?.world.player.chosen&&!state?.world.paused&&connected);
 if(autoHunt===next&&silent)return;
 autoHunt=next;
 if(!autoHunt&&target?.id?.startsWith('enemy:'))target=null;
 $('auto-hunt').setAttribute('aria-pressed',String(autoHunt));
 $('auto-hunt-label').textContent=autoHunt?'자동사냥 ON':'자동사냥 OFF';const ahv=$('auto-hunt-visual');if(ahv){ahv.textContent=autoHunt?'⚡ ON':'⚡ AUTO';}
 if(!silent)toast(autoHunt?'자동사냥 ON · 주변 감염체를 자동으로 추적·공격합니다.':'자동사냥 OFF');
}
$('auto-hunt').onclick=()=>{if(!state?.world.player.chosen||!connected)return;if(state.world.paused){toast('일시정지를 해제하세요.');return;}closePanel(false);setAutoHunt(!autoHunt);if(autoHunt)stepMovement();};
function manualAction(action,fields={}){if(action==='attack'||action==='skill')closePanel(false);clearMovement();pendingAction=null;clearTimeout(pendingTimer);command(action,fields);}
$('pause').onclick=()=>manualAction('pause');if($('flyout-pause'))$('flyout-pause').onclick=()=>manualAction('pause');
document.querySelectorAll('[data-action]').forEach(b=>b.onclick=()=>manualAction(b.dataset.action));
document.querySelectorAll('[data-item]').forEach(b=>b.onclick=()=>manualAction('consume',{item:b.dataset.item}));
$('craft-submit').onclick=()=>manualAction('craft',{recipe:selectedRecipe});
document.querySelectorAll('button[data-species]').forEach(b=>b.onclick=()=>{welcomeForced=false;manualAction('choose',{species:b.dataset.species,gender:selectedGender,job:selectedJob});});
async function submitAccountAction(action,fields,msgId){
 const msgEl=$(msgId);
 if(msgEl)msgEl.textContent='서버 처리 중...';
 try{
  let cmd = {action,...fields,...(state.movement?.enabled?{input_seq:movementInput.seq}:{})};
  if(action==='account_load'){
   const u=(fields.username||'').trim();
   const bk=getLocalAccountBackup(u);
   if(bk&&bk.profile)cmd.backup_profile=bk.profile;
  }
  const result=await api('/api/action',{revision:state.world.revision,command:cmd});
  if(action==='account_load')welcomeForced=false;
  accept(result);
  const noteText=result.world.log?.[0]||'처리되었습니다.';
  if(msgEl)msgEl.textContent=noteText;
  toast(noteText);
  if(action==='account_save'&&fields.username){
   saveLocalAccountBackup(fields.username.trim(),fields.password||'',result.world);
   updateWelcomeAccountUI();
  }
  if(action==='account_load'&&fields.username){
   saveLocalAccountBackup(fields.username.trim(),fields.password||'',result.world);
   if(activePanel==='account')closePanel();
  }
 }catch(e){
  if(action==='account_load'){
   const u=(fields.username||'').trim();
   const bk=getLocalAccountBackup(u);
   if(bk&&bk.profile&&bk.profile.player&&bk.profile.player.chosen){
    try{
     if(msgEl)msgEl.textContent='로컬 백업 데이터로 복원 중...';
     const rRes=await api('/api/action',{revision:state.world.revision,command:{action:'restore_local_save',profile:bk.profile}});
     welcomeForced=false;
     accept(rRes);
     toast(`계정 '${u}' 데이터를 로컬 백업에서 안전하게 복원했습니다.`);
     if(msgEl)msgEl.textContent=`계정 '${u}' 복원 완료`;
     saveLocalAccountBackup(u,fields.password||'',rRes.world);
     if(activePanel==='account')closePanel();
     return;
    }catch(rErr){}
   }
  }
  if(msgEl)msgEl.textContent=e.message||'오류가 발생했습니다.';
  toast(e.message||'오류가 발생했습니다.');
 }
}
$('new-start-btn').onclick=()=>{closePanel(false);closeLootBox();welcomeForced=true;updateWelcomeCustomizer();update();};
$('welcome-close-btn').onclick=()=>{welcomeForced=false;update();};
$('welcome-load-btn').onclick=()=>submitAccountAction('account_load',{username:$('welcome-account-id').value,password:$('welcome-account-pw').value},'welcome-account-msg');
for(const id of ['welcome-account-id','welcome-account-pw'])$(id).addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('welcome-load-btn').click();}});
$('account-save-btn').onclick=()=>submitAccountAction('account_save',{username:$('account-save-id').value,password:$('account-save-pw').value},'account-save-msg');
$('account-load-btn').onclick=()=>submitAccountAction('account_load',{username:$('account-load-id').value,password:$('account-load-pw').value},'account-load-msg');
const accLocalRestoreBtn=$('account-local-restore-btn');
if(accLocalRestoreBtn){
 accLocalRestoreBtn.onclick=async()=>{
  const msgEl=$('account-local-restore-msg');
  try{
   const last=getLastLogin();
   let profile=null;
   if(last&&last.summary&&last.summary.username){
    const bk=getLocalAccountBackup(last.summary.username);
    if(bk&&bk.profile)profile=bk.profile;
   }
   if(!profile){
    const q=JSON.parse(localStorage.getItem('bloodfall_quicksave_profile')||'null');
    if(q&&q.profile)profile=q.profile;
   }
   if(!profile||!profile.player||!profile.player.chosen){
    if(msgEl)msgEl.textContent='복원 가능한 로컬 백업 데이터가 없습니다.';
    toast('복원 가능한 로컬 백업 데이터가 없습니다.');
    return;
   }
   if(msgEl)msgEl.textContent='로컬 백업 데이터 복원 중...';
   const rRes=await api('/api/action',{
    revision:state.world.revision,
    command:{action:'restore_local_save',profile}
   });
   welcomeForced=false;
   accept(rRes);
   const lvl=profile.player.combat_level||1;
   const sp=profile.player.species==='vampire'?'뱀파이어':'인간';
   toast(`로컬 백업 (Lv.${lvl} ${sp}) 데이터를 성공적으로 복원했습니다.`);
   if(msgEl)msgEl.textContent='복원 완료!';
   closePanel();
  }catch(err){
   if(msgEl)msgEl.textContent=err.message||'복원 실패';
   toast(err.message||'복원 실패');
  }
 };
}
$('account-new-human').onclick=()=>{welcomeForced=false;closePanel();manualAction('choose',{species:'human',gender:selectedGender,job:selectedJob});toast('신규 인간 모험자로 새로운 여정을 시작합니다.');};
$('account-new-vampire').onclick=()=>{welcomeForced=false;closePanel();manualAction('choose',{species:'vampire',gender:selectedGender,job:selectedJob});toast('신규 뱀파이어 모험자로 새로운 여정을 시작합니다.');};
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
 const activeCat=categoryMap[name]||name;
 document.querySelectorAll('[data-panel]').forEach(button=>button.setAttribute('aria-expanded',String(button.dataset.panel===root||button.dataset.panel===name)));
 document.querySelectorAll('.dock-major-btn').forEach(button=>{
  const itemCat=button.closest?.('.dock-item')?.dataset.category;
  button.setAttribute('aria-expanded',String(itemCat===activeCat||button.dataset.panel===name));
 });
 updateSubnav(name);
 $('menu-context').textContent=campPanels.has(name)?'⌂ 아지트 안 · 벗어나면 이 메뉴는 닫힙니다.':'Esc로 닫기 · 메뉴를 연 동안에도 월드 시간은 흐릅니다.';
 if(!$('menu-dialog').open)$('menu-dialog').show();
 renderInventory();renderRecipe();if(name==='skills'){renderSkillsMenu();renderHotbarEditor();}$('menu-title').focus({preventScroll:true});return true;
}
function updateContext(){
 const {player:p}=state.world,atCamp=canUseCamp();
 $('menu-camp').hidden=!atCamp;const campDockItem=$('menu-camp')?.closest?.('.dock-item');if(campDockItem)campDockItem.hidden=!atCamp;$('camp-access').hidden=!atCamp;
 document.querySelectorAll('[data-panel]').forEach(button=>button.disabled=(!p.chosen&&button.dataset.panel!=='account')||!connected);
 $('auto-hunt').disabled=!p.chosen||!connected||state.world.paused;
 updateSprintUI();
 if(!connected&&autoHunt)setAutoHunt(false,true);
 if(activePanel&&((campPanels.has(activePanel)&&!atCamp)||!connected))closePanel(false);
 $('field-hp').textContent=Math.ceil(p.hp);$('field-health-bar').style.width=`${Math.max(0,Math.min(100,p.hp))}%`;
 if(p.species==='human'){
  const mp=p.mp??100;
  $('field-mp-label').textContent='MP';$('field-mp').textContent=Math.ceil(mp);
  $('field-mp-wrap').classList.remove('vampire-blood');
  $('field-mp-track').hidden=false;$('field-mp-bar').style.width=`${Math.max(0,Math.min(100,mp))}%`;
 }else{
  const blood=p.blood??100;
  $('field-mp-label').textContent='혈액';$('field-mp').textContent=Math.ceil(blood);
  $('field-mp-wrap').classList.add('vampire-blood');
  $('field-mp-track').hidden=false;$('field-mp-bar').style.width=`${Math.max(0,Math.min(100,blood))}%`;
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
 skillbook:['스킬 해금 비전서','몬스터에게서 낮은 확률로 드랍되는 고대 스킬북. 상위 직업 스킬을 해금할 때 소모됩니다.','스킬 메뉴(K) → 상위 직업 스킬 해금에 사용'],
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
 if(id==='skillbook')return !connected?'서버 연결을 기다리세요.':!w.inventory.skillbook?'보유한 스킬북이 없습니다.':'';
 if(!['soup','water','blood','elixir','medicine'].includes(id))return '직접 사용할 수 없는 제작·강화 재료입니다.';
 if(!connected)return '서버 연결을 기다리세요.';
 if(w.paused)return '일시정지를 해제하세요.';
 if(!w.inventory[id])return '보유한 아이템이 없습니다.';
 if(['soup','water'].includes(id)&&w.player.species!=='human')return '인간만 사용할 수 있습니다.';
 if(['blood','elixir'].includes(id)&&w.player.species!=='vampire')return '뱀파이어만 사용할 수 있습니다.';
 return '';
}
function gearItem(id){return state?.world.gear?.find(g=>g.id===id);}
function gearRarity(g){
 const id=g?.rarity==='common'?'normal':g?.rarity;
 return state?.rarities?.[id]||{name:id==='normal'?'일반':'미확인',color:'#c6c9c5'};
}
function itemName(id){const g=gearItem(id);return g?`[${gearRarity(g).name}] ${g.name}`:state.items[id];}
function itemIcon(id){return gearItem(id)?.slot||id;}
function makeEquippedSlotCard(slot,mode='equip'){
 const g=gearItem(state.world.equipment?.[slot]),rarity=g?gearRarity(g):null;
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
  const rarity=gearRarity(g),equipped=w.equipment?.[g.slot]===g.id;
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
  button.style.color=g?gearRarity(g).color:'';button.style.borderColor=g?gearRarity(g).color:'';
  button.setAttribute('aria-label',g?itemName(id)+' '+count.textContent:itemName(id)+' '+amount+'개');button.setAttribute('aria-pressed',String(id===selectedItem));}
 $('equipped-summary').textContent=['weapon','armor'].map(slot=>{const g=gearItem(state.world.equipment?.[slot]);return (slot==='weapon'?'무기':'방어구')+' · '+(g?itemName(g.id):'미착용');}).join(' / ');
 $('bag-count').textContent=Object.values(state.world.inventory).filter(n=>n>0).length+'종 · 장비 '+gear.length+'개 · 용량 '+bagUsed()+'/'+bagCapacity();$('inventory-empty').hidden=ids.length>0;
 const g=gearItem(selectedItem),rarity=g?gearRarity(g):null,equipped=g&&state.world.equipment[g.slot]===g.id;
 const info=g?[rarity.name+' '+(g.slot==='weapon'?'무기':'방어구'),'몬스터에게서 획득한 장비. 종족·레벨 제한 없이 착용할 수 있습니다.',(g.slot==='weapon'?'공격력 +':'받는 피해 −')+g.power+' · 현재 부위 대비 '+(g.power-(gearItem(state.world.equipment[g.slot])?.power||0)>=0?'+':'')+(g.power-(gearItem(state.world.equipment[g.slot])?.power||0))]:itemInfo[selectedItem];$('item-art').hidden=!info;if(info)$('item-art').src='/icons/'+itemIcon(selectedItem)+'.svg';
 $('item-category').textContent=info?.[0]||'';$('item-name').textContent=selectedItem?itemName(selectedItem):'비어 있는 가방';
 $('item-description').textContent=info?.[1]||'채집하거나 제작해 아이템을 획득하세요.';$('item-effect').textContent=info?.[2]||'';
 $('item-category').style.color=rarity?.color||'';
 $('item-owned').textContent=g?(equipped?'현재 착용 중':'가방에 보관 중'):selectedItem?'보유 수량 · '+(state.world.inventory[selectedItem]||0):'';
 const reason=itemUseReason(selectedItem);$('item-use').disabled=Boolean(reason);$('item-use').textContent=g?(equipped?'착용 해제':'착용'):selectedItem==='skillbook'?'스킬 메뉴 열기 (K)':'1개 사용';$('item-use-reason').textContent=reason||(g?'같은 부위의 장비는 교체되며 가방에 보존됩니다.':selectedItem==='skillbook'?'스킬 메뉴에서 스킬북을 사용해 직업 스킬을 해금합니다.':'선택한 아이템 1개를 사용합니다.');
}
$('item-use').onclick=()=>{if(selectedItem&&!itemUseReason(selectedItem)){if(selectedItem==='skillbook'){openPanel('skills');return;}const g=gearItem(selectedItem);if(g)manualAction(state.world.equipment[g.slot]===g.id?'unequip':'equip',{item:g.id,slot:g.slot});else manualAction('consume',{item:selectedItem});}};
const SKILL_IDS=['sweep','recover','strike','ranged','purify','ultimate'];
const HOTBAR_KEYS=['1','2','3','4','5','6'];
const DEFAULT_HOTBAR=Object.fromEntries(HOTBAR_KEYS.map((key,i)=>[key,SKILL_IDS[i]]));
let hotbarMap={...DEFAULT_HOTBAR},selectedAssignSkill=null,selectedAssignSlot=null,skillsLayout='';
try{
 const current=localStorage.getItem('bloodfall_hotbar_v3');
 const saved=JSON.parse(current||localStorage.getItem('bloodfall_hotbar_v2')||'null');
 if(saved&&typeof saved==='object'&&!Array.isArray(saved)){
  const oldKeys=current?HOTBAR_KEYS:['q','r','1','2','3','4'],used=new Set(),restored={};
  HOTBAR_KEYS.forEach((key,i)=>{const id=saved[oldKeys[i]];if(SKILL_IDS.includes(id)&&!used.has(id)){restored[key]=id;used.add(id);}});
  const unused=SKILL_IDS.filter(id=>!used.has(id));
  HOTBAR_KEYS.forEach(key=>{if(!restored[key])restored[key]=unused.shift();});
  hotbarMap=restored;
 }
 saveHotbar();
}catch(e){}
function saveHotbar(){
 try{localStorage.setItem('bloodfall_hotbar_v3',JSON.stringify(hotbarMap));}catch(e){}
}
// Original vector icons, shared by the field bar, skill list and assignment slots.
const SKILL_ART={
 sweep:'<path d="M9 24C12 8 31 5 40 12C26 9 19 19 17 31"/><path d="m15 30 6-5M8 36c10 6 24 3 31-8"/>',
 recover:'<path d="M20 9h8v11h11v8H28v11h-8V28H9v-8h11z"/><path d="m7 9 2-4 2 4M37 39l2 4 2-4"/>',
 strike:'<path d="m11 7 7 3 17 24-5 4L13 14zM37 7l-7 3-17 24 5 4 17-24z"/><path d="m8 31 11 8m10 0 11-8M11 40l-3 4m29-4 3 4"/>',
 ranged:'<circle cx="24" cy="24" r="13"/><circle cx="24" cy="24" r="4"/><path d="M24 5v10m0 18v10M5 24h10m18 0h10"/>',
 purify:'<path d="m24 5 5 13 13 6-13 6-5 13-5-13-13-6 13-6z"/><path d="m7 7 5 5m24 24 5 5M7 41l5-5m24-24 5-5"/>',
 ultimate:'<path d="m27 5-7 14 6-1-5 12 13-17-8 2z"/><path d="M12 14C2 27 15 44 29 40c10-3 14-14 8-22M8 29c9 9 21 6 27-2M17 38l-5 4"/>'
};
function skillIconMarkup(id){return `<svg viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">${SKILL_ART[id]||''}</svg>`;}
function skillIcon(id){const icon=span('skill-art','');icon.dataset.icon=id;icon.innerHTML=skillIconMarkup(id);return icon;}
function renderHotbarEditor(){
 if(!state||activePanel!=='skills')return;
 if(selectedAssignSkill&&!skillStatus(selectedAssignSkill).unlocked)selectedAssignSkill=null;
 for(const button of document.querySelectorAll('[data-assign-slot]')){
  const key=button.dataset.assignSlot,id=hotbarMap[key],spec=activeSkillSpec(id),name=skillNameFor(spec,state.world.player.species,state.world.player.job||'warrior');
  const icon=button.querySelector('.skill-art');
  if(icon.dataset.icon!==id){icon.dataset.icon=id;icon.innerHTML=skillIconMarkup(id);}
  button.dataset.skill=id;
  button.setAttribute('aria-label',`${key}번 슬롯: ${name}. 선택한 스킬 배치`);
  button.setAttribute('aria-pressed',String(selectedAssignSlot===key));
  button.title=`${key} · ${name}`;
  button.classList.toggle('slot-locked',!skillStatus(id).unlocked);
 }
 document.querySelectorAll('[data-select-skill]').forEach(button=>button.setAttribute('aria-pressed',String(selectedAssignSkill===button.dataset.selectSkill)));
 const hint=selectedAssignSkill?`${skillNameFor(activeSkillSpec(selectedAssignSkill),state.world.player.species,state.world.player.job||'warrior')} 선택됨 · 배치할 1~6번 슬롯을 누르세요.`:selectedAssignSlot?`${selectedAssignSlot}번 슬롯 선택됨 · 아래에서 배치할 스킬을 선택하세요.`:'스킬을 선택한 뒤 1~6번 슬롯을 누르세요. 드래그로도 배치할 수 있습니다.';
 if($('hotbar-editor-hint').textContent!==hint)$('hotbar-editor-hint').textContent=hint;
}
function selectAssignmentSkill(id){
 if(!skillStatus(id).unlocked)return;
 if(selectedAssignSlot){assignSkillToSlot(selectedAssignSlot,id);return;}
 selectedAssignSkill=selectedAssignSkill===id?null:id;renderHotbarEditor();
}
for(const button of document.querySelectorAll('[data-assign-slot]')){
 button.onclick=()=>{const key=button.dataset.assignSlot;if(selectedAssignSkill)assignSkillToSlot(key,selectedAssignSkill);else{selectedAssignSlot=selectedAssignSlot===key?null:key;renderHotbarEditor();}};
 button.addEventListener('dragover',e=>{e.preventDefault();button.classList.add('drag-over');});
 button.addEventListener('dragleave',()=>button.classList.remove('drag-over'));
 button.addEventListener('drop',e=>{e.preventDefault();button.classList.remove('drag-over');assignSkillToSlot(button.dataset.assignSlot,e.dataTransfer.getData('text/plain'));});
}
function getSlotForSkill(skillId){
 return Object.keys(hotbarMap).find(k=>hotbarMap[k]===skillId)||null;
}
function assignSkillToSlot(slotKey,targetSkillId){
 if(!HOTBAR_KEYS.includes(slotKey)||!SKILL_IDS.includes(targetSkillId)||!state||!skillStatus(targetSkillId).unlocked)return;
 const prevSlot=getSlotForSkill(targetSkillId);
 const currentSkillInSlot=hotbarMap[slotKey];
 if(prevSlot&&prevSlot!==slotKey){
  hotbarMap[prevSlot]=currentSkillInSlot;
 }
 hotbarMap[slotKey]=targetSkillId;
 selectedAssignSlot=null;selectedAssignSkill=null;
 saveHotbar();
 renderHotbarSlots();
 updateSkills();
 const slotEl=$('skill-'+targetSkillId);
 if(slotEl){
  slotEl.classList.remove('slot-flash');
  void slotEl.offsetWidth;
  slotEl.classList.add('slot-flash');
 }
 const p=state?.world?.player;
 const spec=activeSkillSpec(targetSkillId);
 const name=spec&&p?skillNameFor(spec,p.species,p.job||'warrior'):targetSkillId;
 toast(`[${slotKey.toUpperCase()}] 퀵슬롯에 [${name}] 등록 완료`);
}
function renderHotbarSlots(){
 const bar=$('skill-bar');const track=bar?.querySelector ? bar.querySelector('.hotbar-slots-track') : (document.querySelector ? document.querySelector('.hotbar-slots-track') : null);
 if(!track)return;
 for(const slotKey of HOTBAR_KEYS){
  const skillId=hotbarMap[slotKey];
  const btn=$('skill-'+skillId);
  if(btn){
   btn.dataset.slot=slotKey;
   btn.dataset.skill=skillId;
   const kbd=btn.querySelector?.('.slot-key');
   if(kbd)kbd.textContent=slotKey.toUpperCase();
   if(track.children?.[HOTBAR_KEYS.indexOf(slotKey)]!==btn)track.appendChild?.(btn);
  }
 }
}
function setupHotbarDragDrop(){
 for(const id of SKILL_IDS){
  const btn=$('skill-'+id);
  if(!btn||btn._dndBound)continue;
  btn._dndBound=true;
  btn.draggable=true;
  btn.addEventListener('dragstart',e=>{
   e.dataTransfer.setData('text/plain',btn.dataset.skill);
   e.dataTransfer.effectAllowed='copyMove';
   btn.classList.add('dragging');
   document.querySelectorAll('.skill-slot, [data-assign-slot]').forEach(s=>s.classList.add('drag-active'));
  });
  btn.addEventListener('dragend',()=>{
   btn.classList.remove('dragging');
   document.querySelectorAll('.skill-slot, [data-assign-slot]').forEach(s=>s.classList.remove('drag-active','drag-over'));
  });
  btn.addEventListener('dragover',e=>{
   e.preventDefault();
   e.dataTransfer.dropEffect='move';
   btn.classList.add('drag-over');
  });
  btn.addEventListener('dragleave',()=>{
   btn.classList.remove('drag-over');
  });
  btn.addEventListener('drop',e=>{
   e.preventDefault();
   btn.classList.remove('drag-over');
   const droppedSkill=e.dataTransfer.getData('text/plain');
   if(droppedSkill&&SKILL_IDS.includes(droppedSkill)){
    assignSkillToSlot(btn.dataset.slot,droppedSkill);
   }
  });
 }
}
function activeSkillSpec(id,species=state?.world.player.species||'human',job=state?.world.player.job||'warrior'){
 const base=state?.combat?.[id];
 if(!base)return null;
 const jobSpec=state?.job_skills?.[`${species}_${job}`]?.[id];
 return jobSpec?{...base,...jobSpec}:base;
}
function skillNameFor(spec,species,job){
 if(!spec)return '';
 const jobSpec=state?.job_skills?.[`${species}_${job}`]?.[Object.keys(state?.combat||{}).find(k=>state.combat[k]?.key===spec.key)];
 if(jobSpec?.name)return jobSpec.name;
 const isVamp=species==='vampire',isRanged=job==='ranged';
 if(isRanged)return (isVamp?spec.vampire_ranged_name:spec.human_ranged_name)||(isVamp?spec.vampire_name:spec.name);
 return isVamp?spec.vampire_name:spec.name;
}
function skillDescFor(spec,species,job){
 if(!spec)return '';
 const jobSpec=state?.job_skills?.[`${species}_${job}`]?.[Object.keys(state?.combat||{}).find(k=>state.combat[k]?.key===spec.key)];
 if(jobSpec?.desc)return jobSpec.desc;
 const isVamp=species==='vampire',isRanged=job==='ranged';
 if(isRanged)return (isVamp?spec.vampire_ranged_desc:spec.human_ranged_desc)||(isVamp?spec.vampire_desc:spec.desc)||'';
 return (isVamp?spec.vampire_desc:spec.desc)||'';
}
function skillStatus(id){
 const w=state.world,p=w.player,isVamp=p.species==='vampire',job=p.job||'warrior';
 const spec=activeSkillSpec(id,p.species,job);
 if(!spec)return {reason:'서버 연결 중'};
 const meter=isVamp?'blood':'food',cost=spec.cost||0;
 const mpCost=spec.mp_cost??cost,hpCost=spec.hp_cost??6;
 const unlockLevel=spec.unlock_level||1,levelMet=(p.combat_level||1)>=unlockLevel;
 const bookCost=spec.book_cost??0,booksHave=w.inventory?.skillbook||0;
 const learnedList=p.learned_skills||['sweep','recover'];
 const learned=bookCost<=0||learnedList.includes(id);
 const unlocked=levelMet&&learned;
 const canLearn=levelMet&&!learned&&booksHave>=bookCost;
 const isHeal=Boolean(spec.heal);
 const effRange=isHeal?0:spec.range;
 const remaining=Math.max(0,(w.cooldowns['skill:'+id]||0)-w.elapsed,!isHeal?(w.cooldowns.attack||0)-w.elapsed:0);
 const reason=!connected?'연결 중':w.paused?'일시정지':!levelMet?`Lv.${unlockLevel} 필요`:!learned?`스킬북 ${bookCost}권 필요`:p.mounted?'하차 후 사용':remaining>0?remaining.toFixed(1)+'초':!isVamp&&(p.mp??100)<mpCost?'MP 부족':isVamp&&p.hp<=hpCost?'체력 부족':p[meter]<cost?'자원 부족':id==='recover'&&p.hp>=100?'체력 가득':id==='purify'&&p.hp>=100&&(p.infection||0)<=0?'체력 가득':!isHeal&&!w.enemies.some(e=>e.hp>0&&Math.hypot(e.x-p.x,e.y-p.y)<=effRange)?'적에게 접근':'';
 return {reason,spec,meter,cost,mpCost,hpCost,remaining,unlocked,unlockLevel,levelMet,learned,bookCost,booksHave,canLearn,isHeal,effRange};
}
function renderSkillsMenu(){
 if(!state||activePanel!=='skills'||!$('skills-list'))return;
 const w=state.world,p=w.player,isVamp=p.species==='vampire',job=p.job||'warrior',gender=p.gender||'male',lvl=p.combat_level||1;
 const cls=classInfo(p.species,job),gName=genderName(gender),booksHave=w.inventory?.skillbook||0;
 const wepPow=gearItem(w.equipment?.weapon)?.power||0,lvlAtk=(lvl-1)*3,enhMult=1+(p.level||0)*.02;
 const layout=JSON.stringify([p.species,job,gender,lvl,p.level,wepPow,booksHave,p.learned_skills,connected,w.paused,hotbarMap]);
 if(layout===skillsLayout)return;
 skillsLayout=layout;
 const learnedCount=SKILL_IDS.filter(id=>skillStatus(id).unlocked).length;
 $('skills-summary').textContent=`${isVamp?'☾ 뱀파이어':'☀ 인간'} · ${gName} [${cls.style}] ${cls.name} (${cls.weapon_type} · 기본 사거리 ${cls.attack_range}) · 전투 Lv.${lvl} · 습득 스킬 ${learnedCount}/${SKILL_IDS.length}개 · 📖 보유 고대 스킬북: ${booksHave}권 (몬스터 처치 시 낮은 확률 드랍)`;
 if($('class-switcher')){
  const gBar=document.createElement('div');gBar.className='gender-bar';
  gBar.append(span('custom-label',`현재 성별: ${gName} (${gender==='female'?'♀':'♂'})`));
  const gBtns=document.createElement('div');gBtns.className='gender-bar-btns';
  for(const [gid,gLabel] of [['male','♂ 남성'],['female','♀ 여성']]){
   const gb=document.createElement('button');gb.type='button';gb.className=gender===gid?'accent':'';
   gb.textContent=gLabel+(gender===gid?' (현재)':'');gb.disabled=!connected||w.paused||gender===gid;
   gb.onclick=()=>manualAction('change_class',{gender:gid,job});
   gBtns.append(gb);
  }
  gBar.append(gBtns);
  const jobCards=['warrior','ranged'].map(jid=>{
   const cInfo=classInfo(p.species,jid),active=job===jid;
   const card=document.createElement('div');card.className='class-card'+(active?' active':'');
   const title=document.createElement('strong');title.textContent=`${jid==='warrior'?'⚔':'⌖'} [${cInfo.style}] ${cInfo.name} (${cInfo.weapon_type})`;
   const desc=document.createElement('small');desc.textContent=`${cInfo.desc} (기본 사거리 ${cInfo.attack_range})`;
   const btn=document.createElement('button');btn.type='button';btn.className=active?'':'accent';
   btn.textContent=active?'✓ 현재 선택된 직업':`${cInfo.name}(${cInfo.weapon_type})로 전직`;
   btn.disabled=!connected||w.paused||active;
   btn.onclick=()=>manualAction('change_class',{gender,job:jid});
   card.append(title,desc,btn);return card;
  });
  $('class-switcher').replaceChildren(gBar,...jobCards);
 }
 $('skills-list').replaceChildren(...SKILL_IDS.map(id=>{
  const {reason,spec,mpCost,hpCost,cost,unlocked,unlockLevel,levelMet,learned,bookCost,booksHave,canLearn,isHeal,effRange}=skillStatus(id);
  if(!spec)return document.createElement('div');
  const name=skillNameFor(spec,p.species,job),altJob=job==='warrior'?'ranged':'warrior',altJobCls=classInfo(p.species,altJob),altJobName=skillNameFor(state.combat?.[id],p.species,altJob);
  const desc=skillDescFor(spec,p.species,job);
  const totalDmg=spec.damage?Math.round((spec.damage+wepPow+lvlAtk)*enhMult):0;
  const costText=isVamp?`HP ${hpCost} · 혈액 ${cost}`:`MP ${mpCost} · 포만 ${cost}`;
  const card=document.createElement('div');card.className='skill-card '+(unlocked?'unlocked':'locked');
  card.dataset.skill=id;
  if(unlocked){
   card.draggable=true;
   card.addEventListener('dragstart',e=>{
    e.dataTransfer.setData('text/plain',id);
    e.dataTransfer.effectAllowed='copyMove';
    card.classList.add('dragging');
    document.querySelectorAll('.skill-slot, [data-assign-slot]').forEach(s=>s.classList.add('drag-active'));
   });
   card.addEventListener('dragend',()=>{
    card.classList.remove('dragging');
    document.querySelectorAll('.skill-slot, [data-assign-slot]').forEach(s=>s.classList.remove('drag-active','drag-over'));
   });
  }
  const left=document.createElement('div');left.className='equip-gear-info';
  const glyph=document.createElement('div');glyph.className='skill-glyph-box';glyph.append(skillIcon(id));
  if(unlocked){
   glyph.draggable=true;
   glyph.addEventListener('dragstart',e=>{
    e.stopPropagation();
    e.dataTransfer.setData('text/plain',id);
    e.dataTransfer.effectAllowed='copyMove';
    card.classList.add('dragging');
    document.querySelectorAll('.skill-slot, [data-assign-slot]').forEach(s=>s.classList.add('drag-active'));
   });
  }
  const txt=document.createElement('div');txt.className='equip-gear-text';
  const head=document.createElement('div');head.className='skill-card-head';
  const title=document.createElement('strong');title.textContent=name;
  const badgeText=unlocked?(bookCost>0?`✓ 습득 완료 (Lv.${unlockLevel})`:`✓ 기본 직업 스킬`):!levelMet?`🔒 Lv.${unlockLevel} + 📖 스킬북 ${bookCost}권 필요`:`📖 스킬북 ${bookCost}권으로 해금 가능 (보유 ${booksHave}/${bookCost})`;
  const badge=span('skill-badge'+(unlocked?'':' locked'),badgeText);
  head.append(title,badge);
  const sub=document.createElement('small');
  const effectText=isHeal?`회복 +${spec.heal}`+(spec.cleanse?` · 감염 −${spec.cleanse} 정화`:''):`${spec.aoe?'광역':'단일'} 피해 ${totalDmg} (기본 ${spec.damage}) · 사거리 ${effRange.toFixed(1)}`+(isVamp?' · 흡혈 회복':'');
  sub.textContent=`${effectText} · 쿨타임 ${spec.cooldown}초 · 소모: ${costText}`;
  const descEl=document.createElement('small');descEl.textContent=(desc?desc+' ':'')+`(${altJobCls.name} 전직 시: ${altJobName})`;
  const assignBar=document.createElement('div');assignBar.className='skill-assign-bar';
  const assign=document.createElement('button');assign.type='button';assign.className='skill-select-button';assign.dataset.selectSkill=id;
  assign.textContent='슬롯에 배치';assign.disabled=!unlocked;
  assign.setAttribute('aria-pressed',String(selectedAssignSkill===id));assign.onclick=()=>selectAssignmentSkill(id);
  assignBar.append(assign,span('skill-assignment-label',`${getSlotForSkill(id)}번에 배치됨`));
  txt.append(head,sub,descEl,assignBar);left.append(glyph,txt);
  const btn=document.createElement('button');btn.type='button';
  if(!learned){
   btn.className=canLearn?'accent':'';
   btn.textContent=!levelMet?`🔒 Lv.${unlockLevel} 달성 필요`:canLearn?`📖 스킬 해금 (스킬북 ${bookCost}권)`:`📖 스킬북 부족 (${booksHave}/${bookCost})`;
   btn.disabled=!connected||w.paused||!canLearn;
   btn.onclick=()=>manualAction('learn_skill',{skill:id});
  }else{
   btn.className=!reason?'accent':'';
   btn.dataset.skillCast=id;btn.textContent=reason?reason:`시전 (${getSlotForSkill(id)})`;
   btn.disabled=Boolean(reason);
   btn.onclick=()=>useSkill(id);
  }
  card.append(left,btn);return card;
 }));
}
function updateSkills(){
 if(!state)return;$('skill-bar').hidden=!state.world.player.chosen;
 const p=state.world.player,isVamp=p.species==='vampire',job=p.job||'warrior';
 for(const id of SKILL_IDS){
  const el=$('skill-'+id);if(!el)continue;
  const {reason,spec,mpCost,hpCost,unlocked,unlockLevel,levelMet,learned,bookCost,canLearn,effRange,remaining}=skillStatus(id);if(!spec)continue;
  const name=skillNameFor(spec,p.species,job);
  const glyph=el.querySelector?.('.skill-glyph');
  if(glyph&&glyph.dataset.icon!==id){glyph.dataset.icon=id;glyph.innerHTML=skillIconMarkup(id);}
  el.setAttribute('aria-label',`${getSlotForSkill(id)}번 ${name}${reason?' · '+reason:''}`);
  const costText=isVamp?`HP ${hpCost} 소모`:`MP ${mpCost}`;
  const maskEl=el.querySelector?.('.skill-cd-mask');
  const lockIcon=el.querySelector?.('.skill-lock-icon');
  if(remaining>0&&unlocked){
   const maxCd=spec.cooldown||1;
   const pct=Math.min(100,Math.max(0,(remaining/maxCd)*100));
   if(maskEl)maskEl.style.height=pct+'%';
   el.classList.add('in-cooldown');
  }else{
   if(maskEl)maskEl.style.height=unlocked?'0%':'100%';
   el.classList.remove('in-cooldown');
  }
  if(lockIcon)lockIcon.hidden=unlocked;
  if(!unlocked)el.classList.add('skill-locked');else el.classList.remove('skill-locked');
  el.disabled=unlocked?Boolean(reason):false;
  el.title=name+(!levelMet?` · 전투 Lv.${unlockLevel} 및 고대 스킬북 ${bookCost}권 필요`:!learned?` · 클릭하여 스킬 메뉴에서 고대 스킬북 ${bookCost}권으로 해금`:' · '+(spec.damage?`사거리 ${effRange.toFixed(1)} 피해 ${spec.damage}`:`체력 +${spec.heal}`)+' · 재사용 '+spec.cooldown+'초 · '+costText);
 }
 renderHotbarSlots();
 setupHotbarDragDrop();
 renderSkillsMenu();renderHotbarEditor();
 for(const button of document.querySelectorAll('[data-skill-cast]')){
  const id=button.dataset.skillCast,{reason}=skillStatus(id);
  button.disabled=Boolean(reason);button.textContent=reason||`시전 (${getSlotForSkill(id)})`;
 }
}
function useSkill(id){
 const {reason,unlocked,unlockLevel,levelMet,learned,bookCost,canLearn}=skillStatus(id);
 if(!unlocked){
  if(canLearn){manualAction('learn_skill',{skill:id});return;}
  openPanel('skills');
  toast(!levelMet?`전투 Lv.${unlockLevel} 달성 및 고대 스킬북 ${bookCost}권이 필요한 스킬입니다.`:`고대 스킬북 ${bookCost}권이 필요합니다. 몬스터를 처치해 스킬북을 획득하세요!`);
  return;
 }
 if(reason){toast(reason);return;}
 manualAction('skill',{skill:id});
}
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
   const rarity=gearRarity(g),row=document.createElement('li');row.className='loot-row';
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
 if(k==='shift'){if(!shiftHeld){shiftHeld=true;updateSprintUI();stepMovement();}return;}
 if(e.shiftKey&&!shiftHeld){shiftHeld=true;updateSprintUI();}
 if(moveKeys.includes(k)){e.preventDefault();if(autoHunt)setAutoHunt(false,true);closePanel(false);closeLootBox();target=null;held.add(k);stepMovement();}
 if(e.repeat)return;
 if(k==='escape'){e.preventDefault();if(autoHunt)setAutoHunt(false,true);closeLootBox();closePanel();clearMovement();pendingAction=null;clearTimeout(pendingTimer);}
 const shortcut={h:'survival',k:'skills',c:'equip',i:'bag',j:'journal',u:'account',b:'camp'}[k];
 if(shortcut){e.preventDefault();if(activePanel===shortcut)closePanel();else openPanel(shortcut);}
 const skillKey=HOTBAR_KEYS.includes(k)?hotbarMap[k]:null;
 if(skillKey&&!activePanel){e.preventDefault();if(state?.world.player.chosen)useSkill(skillKey);}
 if(k==='e'){e.preventDefault();interact();}
 if(k==='f'){e.preventDefault();quickLoot();}
 if(k==='g'){e.preventDefault();if(state?.world.player.chosen&&!state.world.paused){closePanel(false);closeLootBox();setAutoHunt(!autoHunt);if(autoHunt)stepMovement();}}
 if(k==='m')manualAction('mount');
 if(k==='v')toggleFocus();
 if(k===' '&&(!activePanel||e.target.tagName!=='BUTTON')){e.preventDefault();manualAction('attack');}
});
window.addEventListener('keyup',e=>{
 const k=e.key.toLowerCase();
 if(k==='shift'){shiftHeld=false;updateSprintUI();}
 held.delete(k);
 if(k==='shift'||moveKeys.includes(k)){const {dx,dy}=screenDirection();driveMovement(dx,dy);}
});
window.addEventListener('blur',()=>{clearMovement();pendingAction=null;clearTimeout(pendingTimer);});
document.addEventListener('visibilitychange',()=>{clearMovement();pendingAction=null;clearTimeout(pendingTimer);});
const touchKeys={up:'w',left:'a',down:'s',right:'d'};
for(const button of document.querySelectorAll('[data-direction]')){
 const key=touchKeys[button.dataset.direction];
 button.addEventListener('pointerdown',e=>{e.preventDefault();if(autoHunt)setAutoHunt(false,true);closePanel(false);closeLootBox();target=null;touchHeld.add(key);button.classList.add('pressed');button.setPointerCapture(e.pointerId);stepMovement();});
 const release=()=>{touchHeld.delete(key);button.classList.remove('pressed');const {dx,dy}=screenDirection();driveMovement(dx,dy);};
 button.addEventListener('pointerup',release);button.addEventListener('pointercancel',release);button.addEventListener('lostpointercapture',release);
}
function stepMovement(){
 if(!state||!connected||state.world.paused||!state.world.player.chosen||document.hidden){driveMovement(0,0);return;}
 const manual=screenDirection();
 if(state.movement?.enabled&&(manual.dx||manual.dy)){driveMovement(manual.dx,manual.dy);return;}
 driveMovement(0,0);
 if(busy||moveBusy||pendingAction)return;
 const now=performance.now(),sprinting=isSprinting(),moveGap=state.world.player.mounted?(sprinting?58:76):(sprinting?62:84);
 if(now-lastMove<moveGap||now-lastCommandAt<75)return;
 let {dx,dy}=screenDirection();
 if(autoHunt&&!dx&&!dy){
  const w=state.world,p=w.player;
  if(p.hp<=35&&w.inventory.medicine>0){command('consume',{item:'medicine'});return;}
  if((p.hp<=60||(p.infection||0)>=25)&&!skillStatus('purify').reason){command('skill',{skill:'purify'});return;}
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
    dx=Math.sign(p.x-nearest.x)||1;dy=Math.sign(p.y-nearest.y)||1;lastMove=now;command('move',sprinting?{dx,dy,sprint:true}:{dx,dy});return;
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
  const mult=p.mounted?(m.mount_base+p.unlocks[p.species]*m.mount_tier)*(sprinting?1.25:1):(sprinting?(m.sprint_mult||1.65):1);
  const distance=Math.hypot(target.x-p.x,target.y-p.y),step=m.step*mult;
  const enemyStop=(p.job||'warrior')==='ranged'?3.4:1.5;
  const arriveDist=target.id?(inspectOnArrive||target.id.startsWith('drop:')?2.2:target.id.startsWith('enemy:')?enemyStop:1.5):step*.8;
  if(distance<=arriveDist){
   const id=target.id;if(!autoHunt||!id?.startsWith('enemy:'))target=null;
   if(id?.startsWith('enemy:')){
    for(const sk of ['ultimate','sweep','strike','ranged']){if(autoHunt&&!skillStatus(sk).reason){command('skill',{skill:sk});return;}}
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
 if(dx||dy){lastMove=now;command('move',sprinting?{dx,dy,sprint:true}:{dx,dy});}
}
setInterval(stepMovement,20);
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
  $('loot-btn-label').textContent=isBagFull(w)?'📦 가득':dropCount?`📦 ${dropCount}개`:'📦 루팅';
  const interactLbl=$('interact-label');
  if(nearDrop&&Math.hypot(nearDrop.x-p.x,nearDrop.y-p.y)<=3.5){
   $('nearby-label').textContent=nearDrop.label||'몬스터 전리품';
   $('interact').disabled=w.paused||isBagFull(w);
   const nearTxt=isBagFull(w)?'🔍 가득':'🔍 확인';
   if(interactLbl)interactLbl.textContent=nearTxt;else $('interact').textContent=nearTxt;
  }else{
   const nearest=[...state.pois].sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];
   const distance=Math.hypot(nearest.x-p.x,nearest.y-p.y),close=distance<=(nearest.kind==='npc'?2.5:3.5);
   const cooldown=close?Math.max(0,Math.ceil((w.cooldowns[nearest.id]||0)-w.elapsed)):0;
   $('nearby-label').textContent=close?nearest.label:`${nearest.label} (${Math.ceil(distance)}m)`;
   $('interact').disabled=w.paused;
   const poiTxt=cooldown?`🔍 ${cooldown}s`:close?(nearest.kind==='npc'?'💬 보고':'🔍 파밍'):'🔍 파밍';
   if(interactLbl)interactLbl.textContent=poiTxt;else $('interact').textContent=poiTxt;
  }
 $('location-hint').textContent=autoHunt?'● 자동사냥 중'+(isBagFull(w)?' (가방 가득 참·루팅 제외)':' (자동 루팅 ON)')+' · '+p.x.toFixed(1)+' / '+p.y.toFixed(1):Math.hypot(p.x-w.base.x,p.y-w.base.y)<=state.map.base_radius?'● 안전지대 · 아지트':w.enemies.some(e=>e.hp>0&&Math.hypot(p.x-e.x,p.y-e.y)<4.8)?'● 감염체 접근 · 공격하거나 후퇴하세요':'◇ 탐색 중 · '+p.x.toFixed(1)+' / '+p.y.toFixed(1);
}
let pollFailures=0;
async function poll(){
 if(polling||busy||moveBusy||document.hidden||(socket?.connected&&performance.now()-lastSocketAt<3500))return;
 polling=true;
 try{
  accept(await api('/api/state'),true);
  pollFailures=0;
 }catch(e){
  pollFailures++;
  if(!socket?.connected&&pollFailures>=3){
   connected=false;clearMovement();if(state)updateContext();
   $('connection').textContent=e.message||'서버 재연결 중...';$('connection').classList.add('status-error');
   if(!state){$('objective').textContent='서버 접속 링크를 확인하세요';$('objective-detail').textContent=e.message;}
  }
 }finally{polling=false;}
}
setInterval(poll,450);function frame(){if(!document.hidden)draw();requestAnimationFrame(frame);}frame();poll();


function makeDraggableScroll(el){
 if(!el)return;
 let isDown=false,startY=0,scrollTop=0;
 el.addEventListener('mousedown',e=>{
  if(['BUTTON','INPUT','A','SELECT'].includes(e.target.tagName)||e.target.closest('button,input,a,select,kbd'))return;
  isDown=true;startY=e.pageY-el.offsetTop;scrollTop=el.scrollTop;
 });
 window.addEventListener('mouseup',()=>{isDown=false;});
 el.addEventListener('mousemove',e=>{
  if(!isDown)return;
  e.preventDefault();
  el.scrollTop=scrollTop-(e.pageY-el.offsetTop-startY)*1.25;
 });
}
document.querySelectorAll('.menu-body,#loot-list,#activity-messages').forEach(makeDraggableScroll);
