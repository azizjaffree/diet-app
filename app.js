// Stage1 placeholder
// Stage1 placeholder
/* app.js - FitTracker v4 Pro (Stage 2 core logic)
   - multi-user onboarding
   - safe migration from legacy single-key v3
   - tab & drawer behavior
   - date handling
   - basic rendering of Food / Exercise / Analysis / Profile using existing v3 shape
   - NOTE: other modules (workouts.js, suggestions.js, pdf.js) will be added in later stages
*/

/* ---------- CONFIG ---------- */
const USERS = ["Aziz", "Yasmin"];
const BASE_KEY = "fit10_tracker_v3"; // legacy single-key: fit10_tracker_v3
const USER_KEY_PREFIX = BASE_KEY + "_"; // per-user: fit10_tracker_v3_aziz
const DEFAULT_CAL_TARGET = 2000;
const START_DATE = new Date("2025-11-10");
const TOTAL_WEEKS = 10;

/* ---------- UTIL ---------- */
function toISO(d) { return d.toISOString().split("T")[0]; }
function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }
function daysDiff(a,b){ return Math.floor((a-b)/(1000*60*60*24)); }
function dayNumber(date){ const diff = daysDiff(date, START_DATE); return ((diff%7)+7)%7 + 1; }

/* ---------- STORAGE HELPERS (per-user) ---------- */
function userKey(u){ return USER_KEY_PREFIX + u.toLowerCase(); }

function loadPerUserState(u){
  // returns parsed state object; fallback to default shape
  const key = userKey(u);
  const raw = localStorage.getItem(key);
  if(!raw) return {meals:{},exercises:{},weights:{},notes:{},completedDays:{},meta:{}}; 
  try { return JSON.parse(raw); } catch(e){ console.error("Invalid JSON in", key); return {meals:{},exercises:{},weights:{},notes:{},completedDays:{},meta:{}}; }
}

function savePerUserState(u, stateObj){
  try {
    const key = userKey(u);
    localStorage.setItem(key, JSON.stringify(stateObj));
  } catch(e){ console.error("Save failed", e); }
}

/* ---------- SAFE MIGRATION: legacy fit10_tracker_v3 -> per-user key ---------- */
function migrateLegacyIfNeeded(u){
  const destKey = userKey(u);
  if(localStorage.getItem(destKey)) return; // already have per-user data, do nothing
  const legacy = localStorage.getItem(BASE_KEY);
  if(!legacy) return; // nothing to migrate
  try{
    const parsed = JSON.parse(legacy);
    // copy into per-user key but keep the legacy key as-is (do not delete)
    localStorage.setItem(destKey, JSON.stringify(parsed));
    console.info("Migrated legacy v3 data into", destKey);
  }catch(e){ console.warn("Legacy data malformed, skipping migration"); }
}

/* ---------- APP STATE ---------- */
let currentUser = null;
let currentState = null; // in-memory state for current user
let selectedDate = new Date(); // default to today

/* ---------- UI HELPERS ---------- */
const el = (id)=>document.getElementById(id);
function showOverlay(show){
  const ov = el('userOverlay');
  ov.style.display = show ? 'flex' : 'none';
}
function showDrawer(open){
  const dr = el('drawer');
  if(open) dr.classList.add('open'); else dr.classList.remove('open');
}
function setActiveTab(tab){
  // tabs: food, exercise, analysis, profile
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.remove('active'));
  const btn = document.querySelector(`.nav-btn[data-tab="${tab}"]`);
  if(btn) btn.classList.add('active');
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  const pg = document.getElementById(tab);
  if(pg) pg.classList.add('active');
}

/* ---------- BOOTSTRAP UI INTERACTIONS ---------- */
function initUI(){
  // user overlay buttons
  document.querySelectorAll('.user-btn').forEach(b=>{
    b.addEventListener('click', (ev)=>{
      const u = ev.currentTarget.dataset.user;
      if(!u) return;
      selectUser(u);
    });
  });

  // drawer open
  el('openDrawer').addEventListener('click', ()=> showDrawer(true));
  // drawer close items
  document.querySelectorAll('.drawer .close').forEach(b=>b.addEventListener('click', ()=>showDrawer(false)));
  // switch user button inside drawer (shows overlay)
  const switchB = document.getElementById('switchUser');
  if(switchB) switchB.addEventListener('click', ()=>{
    // clear remembered user and force overlay
    localStorage.removeItem('currentUser');
    showOverlay(true);
    showDrawer(false);
  });

  // bottom nav
  document.querySelectorAll('.nav-btn').forEach(b=>{
    b.addEventListener('click', ()=>{
      const t = b.dataset.tab;
      setActiveTab(t);
      // slide+fade animation handled by CSS
      renderForDate(selectedDate);
    });
  });

  // date pick (create if missing)
  if(!el('datePicker')){
    // create minimal date picker if not present in UI
    const dp = document.createElement('input');
    dp.type='date'; dp.id='datePicker';
    dp.style.position='fixed'; dp.style.top='64px'; dp.style.right='16px'; dp.style.zIndex=50;
    document.body.appendChild(dp);
    dp.addEventListener('change', ()=>{
      selectedDate = new Date(dp.value);
      renderForDate(selectedDate);
    });
    dp.value = toISO(selectedDate);
  } else {
    el('datePicker').addEventListener('change', ()=>{
      selectedDate = new Date(el('datePicker').value);
      renderForDate(selectedDate);
    });
  }
}

/* ---------- SELECT USER ---------- */
function selectUser(u){
  if(!USERS.includes(u)) return;
  // migrate legacy if present
  migrateLegacyIfNeeded(u);
  currentUser = u;
  localStorage.setItem('currentUser', currentUser);
  currentState = loadPerUserState(currentUser);
  // hide overlay, show app container (if present)
  const appC = document.getElementById('appContainer');
  if(appC) appC.style.display = 'block';
  showOverlay(false);
  // init date picker if present
  if(el('datePicker')) el('datePicker').value = toISO(selectedDate);
  // render UI
  setActiveTab('food');
  renderForDate(selectedDate);
  updateProfileBanner();
}

/* ---------- LOAD LAST USER ON START ---------- */
window.addEventListener('DOMContentLoaded', ()=>{
  initUI();
  const last = localStorage.getItem('currentUser');
  if(last && USERS.includes(last)){
    // migrate if needed and auto-select
    migrateLegacyIfNeeded(last);
    selectUser(last);
  } else {
    // show overlay
    showOverlay(true);
  }
});

/* ---------- RENDERERS (Food / Exercise / Analysis / Profile) ---------- */
function renderForDate(date){
  renderFood(date);
  renderExercise(date);
  renderAnalysis(date);
  updateProfileBanner();
}

/* Food renderer: reads state.meals[YYYY-MM-DD] and shows options like v3 */
function renderFood(date){
  const container = document.getElementById('food');
  if(!container) return;
  container.innerHTML = '<h2>Food</h2>';
  if(!currentState) { container.innerHTML += '<div class="muted">No user selected</div>'; return; }
  const dk = toISO(date);
  const meals = currentState.meals && currentState.meals[dk] ? currentState.meals[dk] : {};
  const mealKeys = ['breakfast','lunch','snack','post','dinner'];
  const wrapper = document.createElement('div');
  wrapper.className='food-wrapper';
  mealKeys.forEach(k=>{
    const section = document.createElement('div');
    section.className='meal-section glass';
    const title = document.createElement('h3'); title.textContent = k.charAt(0).toUpperCase() + k.slice(1);
    section.appendChild(title);
    const list = document.createElement('div'); list.className='meal-list';
    // if meals[k] exists, show selected IDs with calories when possible
    const sel = meals[k] && meals[k].selected ? meals[k].selected : [];
    if(sel.length === 0){
      const p = document.createElement('div'); p.className='muted'; p.textContent = 'No items selected';
      list.appendChild(p);
    } else {
      sel.forEach(id=>{
        // try to find in FOOD_OPTIONS global if present (we don't have workouts.js yet)
        let label = id;
        if(currentState.meals[dk] && currentState.meals[dk].custom){
          const c = (currentState.meals[dk].custom || []).find(x=>x.id===id);
          if(c) label = `${c.label} — ${c.kcal} kcal`;
        }
        const row = document.createElement('div'); row.className='meal-row';
        row.textContent = label;
        list.appendChild(row);
      });
    }
    section.appendChild(list);
    wrapper.appendChild(section);
  });
  container.appendChild(wrapper);

  // total calories (best-effort: sum custom kcal + default when found in state.meta if stored)
  const totalDiv = document.createElement('div'); totalDiv.className='cal-total muted';
  const total = caloriesEatenForDate(date);
  totalDiv.innerHTML = `<strong>Total:</strong> ${total} kcal`;
  container.appendChild(totalDiv);
}

/* Best-effort calories from state - supports custom and default-preserved entries */
function caloriesEatenForDate(date){
  if(!currentState) return 0;
  const dk = toISO(date);
  const meals = currentState.meals && currentState.meals[dk] ? currentState.meals[dk] : {};
  let total = 0;
  ['breakfast','lunch','snack','post','dinner'].forEach(k=>{
    const entry = meals[k];
    if(!entry || !entry.selected) return;
    entry.selected.forEach(sel=>{
      // first, check custom stored in same date
      if(meals.custom){
        const c = (meals.custom||[]).find(x=>x.id===sel);
        if(c && c.kcal) { total += Number(c.kcal); return; }
      }
      // fallback: maybe saved as label+kcal string (earlier versions) -> try to parse
      // if not found, skip (we can't invent calories)
    });
  });
  return total;
}

/* Exercise renderer - shows suggested workout based on dayNumber; if exercise logs exist, show per-set state */
function renderExercise(date){
  const container = document.getElementById('exercise');
  if(!container) return;
  container.innerHTML = '<h2>Exercise</h2>';
  if(!currentState){ container.innerHTML += '<div class="muted">No user selected</div>'; return; }

  const dayNum = dayNumber(date);
  // best-effort workouts: if workouts.js present it will define WORKOUTS; otherwise, try load from state.meta.workouts
  let workout = null;
  if(window.WORKOUTS && window.WORKOUTS[dayNum]) workout = window.WORKOUTS[dayNum];
  else if(currentState.meta && currentState.meta.workouts && currentState.meta.workouts[dayNum]) workout = currentState.meta.workouts[dayNum];
  else workout = {name:'Today\'s Plan', exercises: []};

  const title = document.createElement('div'); title.className='muted'; title.style.marginBottom='10px';
  title.textContent = `Day ${dayNum} — ${workout.name || ''}`;
  container.appendChild(title);

  // render each exercise (if any)
  const list = document.createElement('div'); list.className='exercise-list';
  workout.exercises.forEach((ex, exIdx)=>{
    const exCard = document.createElement('div'); exCard.className='ex-card glass';
    const h = document.createElement('div'); h.style.fontWeight='700'; h.textContent = ex.title || 'Exercise';
    exCard.appendChild(h);
    const meta = document.createElement('div'); meta.className='muted'; meta.textContent = `Sets: ${ex.sets || 3} — Reps: ${ex.reps || '-'}`;
    exCard.appendChild(meta);

    // sets UI: load state.exercises[date][exIdx][setNumber] if available
    const setsRow = document.createElement('div'); setsRow.className='sets-row';
    const dk = toISO(date);
    if(!currentState.exercises) currentState.exercises = {};
    if(!currentState.exercises[dk]) currentState.exercises[dk] = {};
    if(!currentState.exercises[dk][exIdx]) currentState.exercises[dk][exIdx] = {};
    for(let s=1;s<= (ex.sets||3); s++){
      const setBox = document.createElement('div'); setBox.className='set-box';
      const cb = document.createElement('input'); cb.type='checkbox';
      cb.checked = !!(currentState.exercises[dk][exIdx] && currentState.exercises[dk][exIdx][s] && currentState.exercises[dk][exIdx][s].done);
      cb.addEventListener('change', ()=>{
        currentState.exercises[dk] = currentState.exercises[dk] || {};
        currentState.exercises[dk][exIdx] = currentState.exercises[dk][exIdx] || {};
        currentState.exercises[dk][exIdx][s] = currentState.exercises[dk][exIdx][s] || {};
        currentState.exercises[dk][exIdx][s].done = !!cb.checked;
        savePerUserState(currentUser, currentState);
      });
      const repInp = document.createElement('input'); repInp.type='number'; repInp.placeholder='reps'; repInp.style.width='72px';
      const wtInp = document.createElement('input'); wtInp.type='number'; wtInp.placeholder='kg'; wtInp.style.width='72px';
      // restore values if present
      const val = currentState.exercises[dk][exIdx] && currentState.exercises[dk][exIdx][s];
      if(val){ if(val.reps) repInp.value = val.reps; if(val.weight) wtInp.value = val.weight; }
      repInp.addEventListener('change', ()=>{ currentState.exercises[dk][exIdx][s] = currentState.exercises[dk][exIdx][s] || {}; currentState.exercises[dk][exIdx][s].reps = Number(repInp.value||0); savePerUserState(currentUser, currentState); });
      wtInp.addEventListener('change', ()=>{ currentState.exercises[dk][exIdx][s] = currentState.exercises[dk][exIdx][s] || {}; currentState.exercises[dk][exIdx][s].weight = Number(wtInp.value||0); savePerUserState(currentUser, currentState); });

      setBox.appendChild(cb); setBox.appendChild(repInp); setBox.appendChild(wtInp);
      setsRow.appendChild(setBox);
    }

    exCard.appendChild(setsRow);
    list.appendChild(exCard);
  });

  container.appendChild(list);

  // session burn load/save control (present in v3)
  const burnRow = document.createElement('div'); burnRow.className='row'; burnRow.style.marginTop='12px';
  const label = document.createElement('label'); label.className='muted'; label.textContent = 'Estimated session burn (kcal): ';
  const input = document.createElement('input'); input.type='number'; input.className='small-input'; input.style.width='120px';
  const dk2 = toISO(date);
  if(currentState.exercises && currentState.exercises[dk2] && currentState.exercises[dk2].sessionBurn) input.value = currentState.exercises[dk2].sessionBurn;
  input.addEventListener('change', ()=>{
    currentState.exercises[dk2] = currentState.exercises[dk2] || {};
    currentState.exercises[dk2].sessionBurn = Number(input.value||0);
    savePerUserState(currentUser,currentState);
  });
  burnRow.appendChild(label); burnRow.appendChild(input);
  container.appendChild(burnRow);
}

/* Analysis renderer - weekly summary readonly using state */
function renderAnalysis(date){
  const container = document.getElementById('analysis');
  if(!container) return;
  container.innerHTML = '<h2>Analysis</h2>';
  if(!currentState){ container.innerHTML += '<div class="muted">No user selected</div>'; return; }
  const wk = getWeekForDate(date);
  const summary = summarizeWeek(wk.start, wk.end);
  const div = document.createElement('div');
  div.innerHTML = `<div class="muted">Week ${wk.week} (${wk.start.toLocaleDateString()} — ${wk.end.toLocaleDateString()})</div>
    <div><strong>Total eaten:</strong> ${summary.totalEaten} kcal</div>
    <div><strong>Estimated burn:</strong> ${summary.totalBurn} kcal (${summary.sessions} sessions)</div>
    <div><strong>Net:</strong> ${summary.totalEaten - summary.totalBurn} kcal</div>`;
  container.appendChild(div);
  // inject notes area
  const notesLabel = document.createElement('h4'); notesLabel.textContent = 'Weekly Notes';
  container.appendChild(notesLabel);
  const ta = document.createElement('textarea'); ta.id = 'weeklyNotes';
  ta.value = currentState.notes && currentState.notes[`week${wk.week}`] ? currentState.notes[`week${wk.week}`] : '';
  const saveBtn = document.createElement('button'); saveBtn.className='pill'; saveBtn.textContent='Save Note';
  saveBtn.addEventListener('click', ()=>{
    currentState.notes = currentState.notes || {};
    currentState.notes[`week${wk.week}`] = ta.value;
    savePerUserState(currentUser, currentState);
    alert('Saved');
  });
  container.appendChild(ta); container.appendChild(saveBtn);
}

/* Profile renderer - shows profile tag info + quick hydration (simple) */
function updateProfileBanner(){
  const tag = document.getElementById('profileTag');
  const weightTextEl = document.getElementById('weightDeltaText');
  if(!tag) return;
  // latest weight
  let latest = null; 
  if(currentState && currentState.weights){
    Object.keys(currentState.weights).forEach(k=>{
      // weekN or last
      if(k==='last'){ latest = currentState.weights[k]; }
      else if(k.startsWith('week')){ /* prefer latest week if last not set */ }
    });
    // fallback to week keys if last not available
    if(!latest){
      const weeks = Object.keys(currentState.weights || {}).filter(x=>x.startsWith('week')).sort();
      if(weeks.length) latest = currentState.weights[weeks[weeks.length-1]];
    }
  }
  tag.textContent = currentUser ? `👤 ${currentUser} | Weight: ${latest ? latest + ' kg' : '-- kg'}` : '👤 —';
  if(weightTextEl) weightTextEl.textContent = latest ? `Lost: ${(87 - latest).toFixed(1)} kg` : 'Lost: — kg';
}

/* ---------- WEEK / SUMMARY HELPERS ---------- */
function getWeekForDate(date){
  const diffDays = daysDiff(date, START_DATE);
  const weekIndex = Math.floor(diffDays/7) + 1;
  const wk = clamp(weekIndex, 1, TOTAL_WEEKS);
  const start = new Date(START_DATE.getTime() + (wk-1)*7*24*60*60*1000);
  const end = new Date(start.getTime() + 6*24*60*60*1000);
  return {week:wk, start, end};
}

function summarizeWeek(start, end){
  let totalEaten=0, totalBurn=0, sessions=0;
  for(let d = new Date(start); d <= end; d.setDate(d.getDate()+1)){
    const dk = toISO(new Date(d));
    totalEaten += caloriesEatenForDate(new Date(d));
    const ex = currentState.exercises && currentState.exercises[dk];
    if(ex && ex.sessionBurn){ totalBurn += Number(ex.sessionBurn); sessions++; }
    else if(ex){
      // conservative estimate based on sets marked done
      const completed = Object.values(ex).filter(v => typeof v === 'object').flatMap(x => Object.values(x)).filter(s => s && s.done).length;
      if(completed>0){ totalBurn += 350; sessions++; }
    }
  }
  return {totalEaten, totalBurn, sessions};
}

/* ---------- SAVE ON UNLOAD ---------- */
window.addEventListener('beforeunload', ()=>{
  if(currentUser && currentState) savePerUserState(currentUser, currentState);
});

/* ---------- small helpers to debug / quick actions ---------- */
window.ft_debug = {
  getRaw: ()=>{ return { currentUser, state: currentState }; },
  loadUser: (name)=>{ selectUser(name); },
  exportUser: ()=>{
    if(!currentUser) return alert('No user');
    const data = loadPerUserState(currentUser);
    const blob = new Blob([JSON.stringify(data, null, 2)], {type:'application/json'});
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `fit10_${currentUser}_export.json`; a.click();
  }
};
