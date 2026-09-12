const GUEST_KEY = 'nexus-v2-guest';
const CONFIG_KEY = 'nexus-cloud-config';

const defaultData = () => ({
  meta: { lastModified: 0 },
  tasks: [], notes: [], events: [], goals: [], lists: [], money: [], projects: [],
  settings: { theme: 'system' }
});

let currentUser = null;
let cloud = null;
let cloudConfigured = false;
let cloudStatus = 'local';
let currentView = 'home';
let taskFilter = 'all';
let selectedDate = ymd(new Date());
let calendarCursor = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
let deferredInstallPrompt = null;
let syncTimer = null;
let data = loadData(GUEST_KEY);

const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const userKey = () => currentUser ? `nexus-v2-user-${currentUser.id}` : GUEST_KEY;

function loadData(key){
  try{
    const parsed = JSON.parse(localStorage.getItem(key));
    return normalizeData(parsed || defaultData());
  }catch{ return defaultData(); }
}
function normalizeData(input){
  const d = defaultData();
  return {
    ...d, ...input,
    meta: { ...d.meta, ...(input.meta || {}) },
    settings: { ...d.settings, ...(input.settings || {}) },
    tasks: Array.isArray(input.tasks) ? input.tasks : [],
    notes: Array.isArray(input.notes) ? input.notes : [],
    events: Array.isArray(input.events) ? input.events : [],
    goals: Array.isArray(input.goals) ? input.goals : [],
    lists: Array.isArray(input.lists) ? input.lists : [],
    money: Array.isArray(input.money) ? input.money : [],
    projects: Array.isArray(input.projects) ? input.projects : []
  };
}
function saveData({touch=true, sync=true}={}){
  if(touch) data.meta.lastModified = Date.now();
  localStorage.setItem(userKey(), JSON.stringify(data));
  renderAll();
  if(sync && currentUser && cloudConfigured) scheduleCloudPush();
}
function uid(){ return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`; }
function ymd(d){
  const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,'0'), day=String(d.getDate()).padStart(2,'0');
  return `${y}-${m}-${day}`;
}
function parseDate(s){ const [y,m,d]=s.split('-').map(Number); return new Date(y,m-1,d); }
function fmtDate(s, opts={month:'short',day:'numeric'}){ return parseDate(s).toLocaleDateString(undefined, opts); }
function moneyFmt(v){ return new Intl.NumberFormat(undefined,{style:'currency',currency:'USD'}).format(Number(v)||0); }
function esc(v=''){ return String(v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c])); }
function toast(msg){ const el=$('#toast'); el.textContent=msg; el.classList.add('show'); clearTimeout(window.__toast); window.__toast=setTimeout(()=>el.classList.remove('show'),1800); }
function empty(msg){ return `<div class="muted">${esc(msg)}</div>`; }

function setCloudStatus(status, text){
  cloudStatus = status;
  const dot = $('.statusdot');
  dot.classList.toggle('online', status==='synced');
  dot.classList.toggle('syncing', status==='syncing');
  $('#accountText').textContent = text || (currentUser ? currentUser.email : (cloudConfigured ? 'Sign in' : 'Local only'));
  $('#syncSide').textContent = status==='synced' ? 'Cloud synced' : status==='syncing' ? 'Syncing…' : status==='error' ? 'Sync needs attention' : 'Local mode';
}

function applyTheme(mode=data.settings.theme){
  const dark = mode==='dark' || (mode==='system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.body.classList.toggle('dark', dark);
  $('#themeBtn').textContent = dark ? '☀' : '☾';
  $('#themeSelect').value = mode;
  document.querySelector('meta[name="theme-color"]').setAttribute('content', dark ? '#0d0e10' : '#f4f4f6');
}

function switchView(view){
  currentView = view;
  $$('.view').forEach(v=>v.classList.toggle('active',v.id===`view-${view}`));
  $$('.nav,[data-view]').forEach(b=>{ if(b.dataset.view) b.classList.toggle('active',b.dataset.view===view); });
  const map={
    home:['Home','Everything important, without the digital soup.'],
    tasks:['Tasks','Keep the next action obvious.'],notes:['Notes','Catch ideas before they evaporate.'],
    calendar:['Calendar','See what your time is doing.'],goals:['Goals','Turn “someday” into progress.'],
    lists:['Lists','Tiny checkboxes, suspiciously powerful.'],money:['Money','Know where it went.'],
    projects:['Projects','Bigger work, less fog.'],settings:['Settings','Appearance, backup, and sync.']
  };
  $('#pageTitle').textContent=map[view][0]; $('#pageSub').textContent=map[view][1];
  if(view==='calendar') renderCalendar();
}

function renderAll(){ renderHome(); renderTasks(); renderNotes(); renderCalendar(); renderGoals(); renderLists(); renderMoney(); renderProjects(); renderSettings(); }

function renderHome(){
  const open=data.tasks.filter(t=>!t.done);
  const activeGoals=data.goals.filter(g=>Number(g.progress)<Number(g.target));
  const activeProjects=data.projects.filter(p=>p.status!=='done');
  const income=data.money.filter(x=>x.type==='income').reduce((s,x)=>s+Number(x.amount||0),0);
  const spent=data.money.filter(x=>x.type==='expense').reduce((s,x)=>s+Number(x.amount||0),0);
  $('#sTasks').textContent=open.length; $('#sTasksSub').textContent=open.length?`${open.length} remaining`:'Nothing pending';
  $('#sGoals').textContent=activeGoals.length; $('#sProjects').textContent=activeProjects.length; $('#sBalance').textContent=moneyFmt(income-spent);
  $('#sBalanceSub').textContent=currentUser&&cloudConfigured?'Included in sync':'Tracked locally';
  const h=new Date().getHours(); $('#greeting').textContent=(h<12?'GOOD MORNING':h<18?'GOOD AFTERNOON':'GOOD EVENING');
  const now=new Date(); $('#dateBox').innerHTML=`<strong>${now.getDate()}</strong><span>${now.toLocaleDateString(undefined,{weekday:'long',month:'long'})}</span>`;
  $('#homeTasks').innerHTML=open.sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999')).slice(0,4).map(t=>itemTask(t,true)).join('')||empty('No open tasks. That is suspiciously peaceful.');
  const upcoming=data.events.filter(e=>e.date>=ymd(new Date())).sort((a,b)=>(a.date+a.time).localeCompare(b.date+b.time)).slice(0,4);
  $('#homeEvents').innerHTML=upcoming.map(e=>`<div class="item"><div><b>${esc(fmtDate(e.date,{month:'short',day:'numeric'}))}</b><small class="muted"> ${esc(e.time||'Any time')}</small></div><div class="grow"><b>${esc(e.title)}</b><small>${esc(e.details||'')}</small></div></div>`).join('')||empty('Nothing upcoming.');
  $('#homeGoals').innerHTML=activeGoals.slice(0,4).map(g=>goalMini(g)).join('')||empty('No active goals yet.');
  $('#homeNotes').innerHTML=[...data.notes].sort((a,b)=>b.updated-a.updated).slice(0,4).map(n=>`<div class="item"><div class="grow"><b>${esc(n.title||'Untitled')}</b><small>${esc((n.body||'').slice(0,70))}</small></div></div>`).join('')||empty('No notes yet.');
}

function itemTask(t,mini=false){
  return `<div class="item ${t.done?'done':''}"><button class="check ${t.done?'done':''}" onclick="toggleTask('${t.id}')"></button><div class="grow"><b>${esc(t.title)}</b><small>${t.due?esc(fmtDate(t.due,{month:'short',day:'numeric'})):'No due date'}${t.details?' • '+esc(t.details):''}</small></div><span class="dot ${t.priority||'low'}"></span>${mini?'':`<button class="smallbtn" onclick="openTask('${t.id}')">Edit</button><button class="smallbtn" onclick="deleteTask('${t.id}')">Delete</button>`}</div>`;
}
function renderTasks(){
  let arr=[...data.tasks].sort((a,b)=>(a.done-b.done)||((a.due||'9999').localeCompare(b.due||'9999')));
  if(taskFilter==='open')arr=arr.filter(t=>!t.done); if(taskFilter==='done')arr=arr.filter(t=>t.done);
  $('#taskList').innerHTML=arr.map(t=>itemTask(t)).join('')||empty('No tasks in this view.');
}
function toggleTask(id){const t=data.tasks.find(x=>x.id===id);if(!t)return;t.done=!t.done;t.updated=Date.now();saveData();toast(t.done?'Task completed':'Task reopened');}
function deleteTask(id){data.tasks=data.tasks.filter(x=>x.id!==id);saveData();toast('Task deleted');}
function openTask(id=null){
  const t=id?data.tasks.find(x=>x.id===id):null;
  openModal(t?'Edit task':'New task',`<form id="taskForm" class="form"><label>Task<input name="title" required value="${esc(t?.title||'')}" placeholder="What needs doing?"></label><label>Details<input name="details" value="${esc(t?.details||'')}" placeholder="Optional"></label><div class="two"><label>Due date<input type="date" name="due" value="${t?.due||''}"></label><label>Priority<select name="priority">${['low','medium','high'].map(p=>`<option value="${p}" ${t?.priority===p?'selected':''}>${p}</option>`).join('')}</select></label></div><div class="row"><button type="button" class="secondary" onclick="closeModal()">Cancel</button><button class="primary">Save</button></div></form>`);
  $('#taskForm').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);const obj={title:f.get('title').trim(),details:f.get('details').trim(),due:f.get('due'),priority:f.get('priority'),updated:Date.now()};if(t)Object.assign(t,obj);else data.tasks.push({id:uid(),...obj,done:false,created:Date.now()});closeModal();saveData();toast(t?'Task updated':'Task added');};
}

function renderNotes(){
  const q=($('#noteSearch').value||'').toLowerCase().trim();
  const arr=[...data.notes].sort((a,b)=>b.updated-a.updated).filter(n=>!q||n.title.toLowerCase().includes(q)||n.body.toLowerCase().includes(q));
  $('#noteList').innerHTML=arr.map(n=>`<article class="card" onclick="openNote('${n.id}')"><h4>${esc(n.title||'Untitled note')}</h4><p>${esc((n.body||'').slice(0,260))}</p><footer>${new Date(n.updated).toLocaleString()}</footer></article>`).join('')||empty('No notes found.');
}
function openNote(id=null){
  const n=id?data.notes.find(x=>x.id===id):null;
  openModal(n?'Edit note':'New note',`<form id="noteForm" class="form"><label>Title<input name="title" value="${esc(n?.title||'')}" placeholder="Note title"></label><label>Note<textarea name="body" rows="8" placeholder="Write anything…">${esc(n?.body||'')}</textarea></label><div class="row">${n?`<button type="button" class="danger" onclick="deleteNote('${n.id}')">Delete</button>`:''}<button type="button" class="secondary" onclick="closeModal()">Cancel</button><button class="primary">Save</button></div></form>`);
  $('#noteForm').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target);const obj={title:f.get('title').trim(),body:f.get('body').trim(),updated:Date.now()};if(n)Object.assign(n,obj);else data.notes.push({id:uid(),...obj,created:Date.now()});closeModal();saveData();toast(n?'Note updated':'Note saved');};
}
function deleteNote(id){data.notes=data.notes.filter(x=>x.id!==id);closeModal();saveData();toast('Note deleted');}

function renderCalendar(){
  const y=calendarCursor.getFullYear(),m=calendarCursor.getMonth();
  $('#calTitle').textContent=calendarCursor.toLocaleDateString(undefined,{month:'long',year:'numeric'});
  const first=new Date(y,m,1), start=new Date(y,m,1-first.getDay()); let html='';
  for(let i=0;i<42;i++){const d=new Date(start);d.setDate(start.getDate()+i);const ds=ymd(d);html+=`<button class="day ${d.getMonth()!==m?'out':''} ${ds===ymd(new Date())?'today':''} ${ds===selectedDate?'selected':''} ${data.events.some(e=>e.date===ds)?'event':''}" onclick="selectDate('${ds}')">${d.getDate()}</button>`;}
  $('#calGrid').innerHTML=html; $('#dayTitle').textContent=fmtDate(selectedDate,{weekday:'long',month:'long',day:'numeric'}); $('#daySub').textContent=selectedDate===ymd(new Date())?'Today':'';
  const arr=data.events.filter(e=>e.date===selectedDate).sort((a,b)=>(a.time||'').localeCompare(b.time||''));
  $('#eventList').innerHTML=arr.map(e=>`<div class="item"><div><b>${esc(e.time||'Any time')}</b></div><div class="grow"><b>${esc(e.title)}</b><small>${esc(e.details||'')}</small></div><button class="smallbtn" onclick="openEvent('${e.id}')">Edit</button><button class="smallbtn" onclick="deleteEvent('${e.id}')">Delete</button></div>`).join('')||empty('No events for this day.');
}
function selectDate(ds){selectedDate=ds;const d=parseDate(ds);calendarCursor=new Date(d.getFullYear(),d.getMonth(),1);renderCalendar();}
function deleteEvent(id){data.events=data.events.filter(x=>x.id!==id);saveData();toast('Event deleted');}
function openEvent(id=null){
  const e=id?data.events.find(x=>x.id===id):null;
  openModal(e?'Edit event':'New event',`<form id="eventForm" class="form"><label>Event<input name="title" required value="${esc(e?.title||'')}" placeholder="What's happening?"></label><div class="two"><label>Date<input type="date" name="date" required value="${e?.date||selectedDate}"></label><label>Time<input type="time" name="time" value="${e?.time||''}"></label></div><label>Details<input name="details" value="${esc(e?.details||'')}" placeholder="Optional"></label><div class="row"><button type="button" class="secondary" onclick="closeModal()">Cancel</button><button class="primary">Save</button></div></form>`);
  $('#eventForm').onsubmit=x=>{x.preventDefault();const f=new FormData(x.target),obj={title:f.get('title').trim(),date:f.get('date'),time:f.get('time'),details:f.get('details').trim(),updated:Date.now()};if(e)Object.assign(e,obj);else data.events.push({id:uid(),...obj,created:Date.now()});selectedDate=obj.date;const d=parseDate(obj.date);calendarCursor=new Date(d.getFullYear(),d.getMonth(),1);closeModal();saveData();toast(e?'Event updated':'Event added');};
}

function goalMini(g){const pct=Math.min(100,Math.round((Number(g.progress)||0)/(Number(g.target)||1)*100));return `<div class="item"><div class="grow"><b>${esc(g.title)}</b><small>${esc(g.progress)} / ${esc(g.target)} ${esc(g.unit||'')}</small><div class="progress"><span style="width:${pct}%"></span></div></div><b>${pct}%</b></div>`;}
function renderGoals(){
  $('#goalList').innerHTML=data.goals.map(g=>{const pct=Math.min(100,Math.round((Number(g.progress)||0)/(Number(g.target)||1)*100));return `<article class="card"><h4>${esc(g.title)}</h4><p>${esc(g.progress)} / ${esc(g.target)} ${esc(g.unit||'')}</p><div class="progress"><span style="width:${pct}%"></span></div><p>${pct}% complete${g.due?' • due '+esc(fmtDate(g.due,{month:'short',day:'numeric'})):''}</p><footer><button class="smallbtn" onclick="openGoal('${g.id}')">Edit</button> <button class="smallbtn" onclick="deleteGoal('${g.id}')">Delete</button></footer></article>`;}).join('')||empty('No goals yet.');
}
function openGoal(id=null){const g=id?data.goals.find(x=>x.id===id):null;openModal(g?'Edit goal':'New goal',`<form id="goalForm" class="form"><label>Goal<input name="title" required value="${esc(g?.title||'')}" placeholder="Read 20 books"></label><div class="two"><label>Progress<input type="number" step="any" name="progress" value="${g?.progress??0}"></label><label>Target<input type="number" step="any" min="0.0001" name="target" required value="${g?.target??1}"></label></div><div class="two"><label>Unit<input name="unit" value="${esc(g?.unit||'')}" placeholder="books, miles, hours…"></label><label>Due<input type="date" name="due" value="${g?.due||''}"></label></div><div class="row"><button type="button" class="secondary" onclick="closeModal()">Cancel</button><button class="primary">Save</button></div></form>`);$('#goalForm').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target),obj={title:f.get('title').trim(),progress:Number(f.get('progress'))||0,target:Number(f.get('target'))||1,unit:f.get('unit').trim(),due:f.get('due'),updated:Date.now()};if(g)Object.assign(g,obj);else data.goals.push({id:uid(),...obj,created:Date.now()});closeModal();saveData();toast(g?'Goal updated':'Goal added');};}
function deleteGoal(id){data.goals=data.goals.filter(x=>x.id!==id);saveData();toast('Goal deleted');}

function renderLists(){
  $('#listsGrid').innerHTML=data.lists.map(l=>`<article class="card"><div class="panelhead"><div><h4>${esc(l.title)}</h4><p>${l.items.filter(i=>i.done).length}/${l.items.length} checked</p></div><div><button class="smallbtn" onclick="openList('${l.id}')">Rename</button><button class="smallbtn" onclick="deleteList('${l.id}')">Delete</button></div></div><div class="listitems">${l.items.map(i=>`<div class="listline"><button class="check ${i.done?'done':''}" onclick="toggleListItem('${l.id}','${i.id}')"></button><span style="${i.done?'text-decoration:line-through;opacity:.55':''}">${esc(i.text)}</span><button class="smallbtn" onclick="removeListItem('${l.id}','${i.id}')">×</button></div>`).join('')}</div><form class="listadd" onsubmit="addListItem(event,'${l.id}')"><input name="item" placeholder="Add item…"><button class="primary">＋</button></form></article>`).join('')||empty('No lists yet.');
}
function openList(id=null){const l=id?data.lists.find(x=>x.id===id):null;openModal(l?'Rename list':'New list',`<form id="listForm" class="form"><label>List name<input name="title" required value="${esc(l?.title||'')}" placeholder="Groceries"></label><div class="row"><button type="button" class="secondary" onclick="closeModal()">Cancel</button><button class="primary">Save</button></div></form>`);$('#listForm').onsubmit=e=>{e.preventDefault();const title=new FormData(e.target).get('title').trim();if(l){l.title=title;l.updated=Date.now();}else data.lists.push({id:uid(),title,items:[],created:Date.now(),updated:Date.now()});closeModal();saveData();toast(l?'List renamed':'List created');};}
function addListItem(e,listId){e.preventDefault();const input=e.target.elements.item,text=input.value.trim();if(!text)return;const l=data.lists.find(x=>x.id===listId);l.items.push({id:uid(),text,done:false});l.updated=Date.now();input.value='';saveData();}
function toggleListItem(listId,itemId){const l=data.lists.find(x=>x.id===listId),i=l?.items.find(x=>x.id===itemId);if(!i)return;i.done=!i.done;l.updated=Date.now();saveData();}
function removeListItem(listId,itemId){const l=data.lists.find(x=>x.id===listId);if(!l)return;l.items=l.items.filter(x=>x.id!==itemId);l.updated=Date.now();saveData();}
function deleteList(id){data.lists=data.lists.filter(x=>x.id!==id);saveData();toast('List deleted');}

function renderMoney(){
  const income=data.money.filter(x=>x.type==='income').reduce((s,x)=>s+Number(x.amount||0),0),spent=data.money.filter(x=>x.type==='expense').reduce((s,x)=>s+Number(x.amount||0),0);
  $('#moneyBalance').textContent=moneyFmt(income-spent);$('#moneyIncome').textContent=moneyFmt(income);$('#moneySpent').textContent=moneyFmt(spent);
  const arr=[...data.money].sort((a,b)=>(b.date||'').localeCompare(a.date||'')||b.created-a.created);
  $('#moneyList').innerHTML=arr.map(x=>`<div class="item"><div class="grow"><b>${esc(x.category||'Other')}</b><small>${esc(fmtDate(x.date,{month:'short',day:'numeric'}))}${x.note?' • '+esc(x.note):''}</small></div><b class="amount ${x.type}">${x.type==='expense'?'-':'+'}${moneyFmt(x.amount)}</b><button class="smallbtn" onclick="openMoney('${x.id}')">Edit</button><button class="smallbtn" onclick="deleteMoney('${x.id}')">Delete</button></div>`).join('')||empty('No transactions yet.');
}
function openMoney(id=null){const x=id?data.money.find(v=>v.id===id):null;openModal(x?'Edit transaction':'New transaction',`<form id="moneyForm" class="form"><div class="two"><label>Type<select name="type"><option value="expense" ${x?.type==='expense'?'selected':''}>Expense</option><option value="income" ${x?.type==='income'?'selected':''}>Income</option></select></label><label>Amount<input type="number" step="0.01" min="0" name="amount" required value="${x?.amount??''}" placeholder="0.00"></label></div><div class="two"><label>Category<input name="category" value="${esc(x?.category||'')}" placeholder="Food, Pay, Games…"></label><label>Date<input type="date" name="date" required value="${x?.date||ymd(new Date())}"></label></div><label>Note<input name="note" value="${esc(x?.note||'')}" placeholder="Optional"></label><div class="row"><button type="button" class="secondary" onclick="closeModal()">Cancel</button><button class="primary">Save</button></div></form>`);$('#moneyForm').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target),obj={type:f.get('type'),amount:Number(f.get('amount'))||0,category:f.get('category').trim()||'Other',date:f.get('date'),note:f.get('note').trim(),updated:Date.now()};if(x)Object.assign(x,obj);else data.money.push({id:uid(),...obj,created:Date.now()});closeModal();saveData();toast(x?'Transaction updated':'Transaction added');};}
function deleteMoney(id){data.money=data.money.filter(x=>x.id!==id);saveData();toast('Transaction deleted');}

function renderProjects(){
  $('#projectList').innerHTML=data.projects.map(p=>`<article class="card"><h4>${esc(p.title)}</h4><p>${esc(p.details||'No details yet.')}</p><span class="projectStatus">${esc(p.status)}</span>${p.due?`<footer>Due ${esc(fmtDate(p.due,{month:'short',day:'numeric'}))}</footer>`:''}<footer><button class="smallbtn" onclick="openProject('${p.id}')">Edit</button> <button class="smallbtn" onclick="deleteProject('${p.id}')">Delete</button></footer></article>`).join('')||empty('No projects yet.');
}
function openProject(id=null){const p=id?data.projects.find(x=>x.id===id):null;openModal(p?'Edit project':'New project',`<form id="projectForm" class="form"><label>Project<input name="title" required value="${esc(p?.title||'')}" placeholder="Build something excellent"></label><label>Details<textarea rows="5" name="details">${esc(p?.details||'')}</textarea></label><div class="two"><label>Status<select name="status">${['planned','active','paused','done'].map(s=>`<option value="${s}" ${p?.status===s?'selected':''}>${s}</option>`).join('')}</select></label><label>Due<input type="date" name="due" value="${p?.due||''}"></label></div><div class="row"><button type="button" class="secondary" onclick="closeModal()">Cancel</button><button class="primary">Save</button></div></form>`);$('#projectForm').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target),obj={title:f.get('title').trim(),details:f.get('details').trim(),status:f.get('status'),due:f.get('due'),updated:Date.now()};if(p)Object.assign(p,obj);else data.projects.push({id:uid(),...obj,created:Date.now()});closeModal();saveData();toast(p?'Project updated':'Project created');};}
function deleteProject(id){data.projects=data.projects.filter(x=>x.id!==id);saveData();toast('Project deleted');}

function renderSettings(){
  const cfg=getCloudConfig(); $('#cloudUrl').value=cfg.url||''; $('#cloudKey').value=cfg.key||'';
  $('#accountSettings').innerHTML=currentUser?`<p>Signed in as <b>${esc(currentUser.email||'Account')}</b>.</p><div class="row" style="margin-top:14px"><button class="secondary" onclick="syncNow()">Sync now</button><button class="danger" onclick="signOut()">Sign out</button></div>`:`<p class="muted">${cloudConfigured?'Cloud is configured. Sign in to sync across devices.':'Set the cloud connection above, then create or sign into a NEXUS account.'}</p><div class="row" style="margin-top:14px"><button class="primary" onclick="openAccount()">${cloudConfigured?'Sign in / Create account':'Set up cloud'}</button></div>`;
}

function openModal(title,body){$('#modalTitle').textContent=title;$('#modalBody').innerHTML=body;$('#modalBg').classList.remove('hidden');setTimeout(()=>$('#modalBody input, #modalBody textarea, #modalBody button')?.focus(),30);}
function closeModal(){$('#modalBg').classList.add('hidden');}
function openQuick(){openModal('Quick Add',`<div class="quickgrid"><button class="quick" onclick="openTask()"><b>✓</b>Task</button><button class="quick" onclick="openNote()"><b>✎</b>Note</button><button class="quick" onclick="openEvent()"><b>◫</b>Event</button><button class="quick" onclick="openGoal()"><b>◎</b>Goal</button><button class="quick" onclick="openList()"><b>☷</b>List</button><button class="quick" onclick="openMoney()"><b>$</b>Money</button><button class="quick" onclick="openProject()"><b>◆</b>Project</button></div>`);}
function openMore(){openModal('More',`<div class="quickgrid"><button class="quick" onclick="closeModal();switchView('goals')"><b>◎</b>Goals</button><button class="quick" onclick="closeModal();switchView('lists')"><b>☷</b>Lists</button><button class="quick" onclick="closeModal();switchView('money')"><b>$</b>Money</button><button class="quick" onclick="closeModal();switchView('projects')"><b>◆</b>Projects</button><button class="quick" onclick="closeModal();switchView('settings')"><b>⚙</b>Settings</button></div>`);}

function openSearch(){
  openModal('Search NEXUS',`<input id="globalSearch" class="searchinput" style="max-width:none" placeholder="Search tasks, notes, goals, lists, projects…"><div id="globalResults" class="searchResults"></div>`);
  const input=$('#globalSearch');input.addEventListener('input',()=>renderSearchResults(input.value));renderSearchResults('');
}
function renderSearchResults(q){
  q=q.toLowerCase().trim(); if(!q){$('#globalResults').innerHTML=empty('Start typing to search everything.');return;}
  let results=[];
  const add=(type,view,id,title,sub='')=>{if(`${title} ${sub}`.toLowerCase().includes(q))results.push({type,view,id,title,sub});};
  data.tasks.forEach(x=>add('Task','tasks',x.id,x.title,x.details)); data.notes.forEach(x=>add('Note','notes',x.id,x.title,x.body)); data.events.forEach(x=>add('Event','calendar',x.id,x.title,x.details)); data.goals.forEach(x=>add('Goal','goals',x.id,x.title,x.unit)); data.lists.forEach(x=>add('List','lists',x.id,x.title,x.items.map(i=>i.text).join(' '))); data.money.forEach(x=>add('Money','money',x.id,x.category,x.note)); data.projects.forEach(x=>add('Project','projects',x.id,x.title,x.details));
  $('#globalResults').innerHTML=results.slice(0,25).map(r=>`<button class="searchResult" onclick="closeModal();switchView('${r.view}')"><b>${esc(r.title||'Untitled')}</b><small>${esc(r.type)}${r.sub?' • '+esc(String(r.sub).slice(0,90)):''}</small></button>`).join('')||empty('Nothing matched.');
}

function getCloudConfig(){try{return JSON.parse(localStorage.getItem(CONFIG_KEY))||{};}catch{return {};}}
function saveCloudConfig(){
  const url=$('#cloudUrl').value.trim(),key=$('#cloudKey').value.trim();
  if(!url||!key){toast('Add both the project URL and public key');return;}
  localStorage.setItem(CONFIG_KEY,JSON.stringify({url,key})); toast('Cloud connection saved'); initCloud(true);
}
function clearCloudConfig(){localStorage.removeItem(CONFIG_KEY);cloud=null;cloudConfigured=false;currentUser=null;data=loadData(GUEST_KEY);setCloudStatus('local','Local only');renderAll();toast('Cloud connection removed');}

async function initCloud(showToast=false){
  const cfg=getCloudConfig();
  cloudConfigured=!!(cfg.url&&cfg.key);
  if(!cloudConfigured){setCloudStatus('local','Local only');renderSettings();return;}
  if(!window.supabase?.createClient){setCloudStatus('error','Cloud unavailable');if(showToast)toast('Cloud library could not load');return;}
  try{
    cloud=window.supabase.createClient(cfg.url,cfg.key);
    cloud.auth.onAuthStateChange((event,session)=>{setTimeout(()=>handleSession(session,event),0);});
    const {data:sessionData,error}=await cloud.auth.getSession();
    if(error)throw error;
    await handleSession(sessionData.session,'INIT');
    if(showToast)toast('Cloud connection ready');
  }catch(err){console.error(err);setCloudStatus('error','Cloud error');if(showToast)toast('Could not connect to cloud');}
}

async function handleSession(session,event){
  const newUser=session?.user||null;
  if(!newUser){
    if(currentUser){currentUser=null;data=loadData(GUEST_KEY);applyTheme(data.settings.theme);renderAll();}
    setCloudStatus(cloudConfigured?'local':'local',cloudConfigured?'Sign in':'Local only');renderSettings();return;
  }
  const changed=!currentUser||currentUser.id!==newUser.id;
  currentUser=newUser;
  if(changed)data=loadData(userKey());
  setCloudStatus('syncing','Syncing…');renderAll();
  await syncOnLogin();
}

async function syncOnLogin(){
  if(!cloud||!currentUser)return;
  try{
    const {data:row,error}=await cloud.from('nexus_data').select('payload,updated_at').eq('user_id',currentUser.id).maybeSingle();
    if(error)throw error;
    if(row?.payload){
      const remote=normalizeData(row.payload); const local=loadData(userKey());
      if((local.meta.lastModified||0)>(remote.meta.lastModified||0)){data=local;await pushCloudNow();}
      else{data=remote;localStorage.setItem(userKey(),JSON.stringify(data));applyTheme(data.settings.theme);renderAll();setCloudStatus('synced',currentUser.email||'Synced');}
    }else{
      const cached=loadData(userKey());
      const guest=loadData(GUEST_KEY);
      data=(cached.meta.lastModified||0)>0?cached:guest;
      localStorage.setItem(userKey(),JSON.stringify(data));await pushCloudNow();
    }
  }catch(err){console.error(err);setCloudStatus('error',currentUser.email||'Sync error');toast('Signed in, but cloud sync needs setup');renderSettings();}
}
function scheduleCloudPush(){clearTimeout(syncTimer);setCloudStatus('syncing','Syncing…');syncTimer=setTimeout(pushCloudNow,650);}
async function pushCloudNow(){
  if(!cloud||!currentUser)return;
  try{
    setCloudStatus('syncing','Syncing…');
    const {error}=await cloud.from('nexus_data').upsert({user_id:currentUser.id,payload:data,updated_at:new Date().toISOString()},{onConflict:'user_id'});
    if(error)throw error;
    setCloudStatus('synced',currentUser.email||'Synced');renderSettings();
  }catch(err){console.error(err);setCloudStatus('error',currentUser.email||'Offline changes');}
}
async function syncNow(){await pushCloudNow();toast(cloudStatus==='synced'?'Synced':'Sync could not complete');}

function openAccount(){
  if(!cloudConfigured){switchView('settings');toast('Add the cloud connection first');return;}
  if(currentUser){openModal('NEXUS Account',`<p>Signed in as <b>${esc(currentUser.email||'Account')}</b>.</p><div class="row" style="margin-top:15px"><button class="secondary" onclick="syncNow()">Sync now</button><button class="danger" onclick="signOut()">Sign out</button></div>`);return;}
  openModal('Sign in or create account',`<form id="authForm" class="form"><label>Email<input type="email" name="email" required placeholder="you@example.com"></label><label>Password<input type="password" name="password" minlength="6" required placeholder="At least 6 characters"></label><div class="row"><button type="button" id="signUpBtn" class="secondary">Create account</button><button class="primary">Sign in</button></div><button type="button" id="resetBtn" class="textbtn">Forgot password?</button><small class="muted">If email confirmation is enabled in Supabase, new accounts may need to confirm their email before the first sign-in.</small></form>`);
  $('#authForm').onsubmit=async e=>{e.preventDefault();const f=new FormData(e.target);await signIn(f.get('email'),f.get('password'));};
  $('#signUpBtn').onclick=async()=>{const f=new FormData($('#authForm'));await signUp(f.get('email'),f.get('password'));};
  $('#resetBtn').onclick=async()=>{const email=$('#authForm').elements.email.value.trim();if(!email){toast('Enter your email first');return;}await resetPassword(email);};
}
async function signIn(email,password){
  try{setCloudStatus('syncing','Signing in…');const {error}=await cloud.auth.signInWithPassword({email,password});if(error)throw error;closeModal();toast('Signed in');}
  catch(err){console.error(err);setCloudStatus('local','Sign in');toast(err.message||'Sign-in failed');}
}
async function signUp(email,password){
  try{setCloudStatus('syncing','Creating…');const {data:result,error}=await cloud.auth.signUp({email,password,options:{emailRedirectTo:location.origin+location.pathname}});if(error)throw error;if(result.session){closeModal();toast('Account created');}else toast('Account created. Check your email to confirm it.');}
  catch(err){console.error(err);setCloudStatus('local','Sign in');toast(err.message||'Sign-up failed');}
}
async function resetPassword(email){try{const {error}=await cloud.auth.resetPasswordForEmail(email,{redirectTo:location.origin+location.pathname});if(error)throw error;toast('Password reset email requested');}catch(err){toast(err.message||'Could not send reset email');}}
async function signOut(){try{if(cloud)await cloud.auth.signOut();}catch{}currentUser=null;data=loadData(GUEST_KEY);applyTheme(data.settings.theme);closeModal();renderAll();setCloudStatus(cloudConfigured?'local':'local',cloudConfigured?'Sign in':'Local only');toast('Signed out');}

function exportData(){const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`nexus-backup-${ymd(new Date())}.json`;a.click();URL.revokeObjectURL(url);toast('Backup exported');}
async function importData(file){try{data=normalizeData(JSON.parse(await file.text()));data.meta.lastModified=Date.now();saveData();applyTheme(data.settings.theme);toast('Backup imported');}catch{toast('Could not read that backup');}}

$$('[data-view]').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.view)));
$$('[data-jump]').forEach(b=>b.addEventListener('click',()=>switchView(b.dataset.jump)));
$('#quickAddBtn').onclick=openQuick; $('#searchBtn').onclick=openSearch; $('#accountBtn').onclick=openAccount; $('#moreBtn').onclick=openMore;
$('#closeModal').onclick=closeModal; $('#modalBg').addEventListener('click',e=>{if(e.target.id==='modalBg')closeModal();}); document.addEventListener('keydown',e=>{if(e.key==='Escape')closeModal();if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'){e.preventDefault();openSearch();}});
$('#noteSearch').addEventListener('input',renderNotes);
$('#taskFilter').addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;taskFilter=b.dataset.filter;$$('#taskFilter button').forEach(x=>x.classList.toggle('active',x===b));renderTasks();});
$('#prevMonth').onclick=()=>{calendarCursor=new Date(calendarCursor.getFullYear(),calendarCursor.getMonth()-1,1);renderCalendar();};
$('#nextMonth').onclick=()=>{calendarCursor=new Date(calendarCursor.getFullYear(),calendarCursor.getMonth()+1,1);renderCalendar();};
$('#themeBtn').onclick=()=>{data.settings.theme=document.body.classList.contains('dark')?'light':'dark';applyTheme();saveData();};
$('#themeSelect').onchange=e=>{data.settings.theme=e.target.value;applyTheme();saveData();};
$('#saveCloudBtn').onclick=saveCloudConfig; $('#clearCloudBtn').onclick=clearCloudConfig; $('#exportBtn').onclick=exportData;
$('#importFile').onchange=e=>{if(e.target.files[0])importData(e.target.files[0]);e.target.value='';};
$('#clearDataBtn').onclick=()=>{if(confirm('Clear the current NEXUS data on this account/device?')){data=defaultData();saveData();toast('Data cleared');}};
matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change',()=>{if(data.settings.theme==='system')applyTheme();});
window.addEventListener('beforeinstallprompt',e=>{e.preventDefault();deferredInstallPrompt=e;$('#installBtn').classList.remove('hidden');});
$('#installBtn').onclick=async()=>{if(!deferredInstallPrompt)return;deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;$('#installBtn').classList.add('hidden');};
window.addEventListener('online',()=>{if(currentUser&&cloudConfigured)pushCloudNow();});
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('sw.js').catch(()=>{}));

applyTheme();renderAll();initCloud();
