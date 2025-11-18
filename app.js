/* app.js — FitTracker v4 Pro (clean install)
   - Multi-user
   - Date navigation
   - Food selection + custom meals
   - Exercises (daily plan) + difficulty + auto-progression
   - RPE, recovery, session burn
   - Weekly analysis
   - Export / Import JSON
   - Safe migration from old v3 key (fit10_tracker_v3)
*/

/* ---------- CONFIG ---------- */
const STORAGE_KEY = "fittracker_v4";
const LEGACY_KEY_V3 = "fit10_tracker_v3"; // old version used in earlier conversation (we'll detect & migrate)
const USERS = ["Aziz", "Yasmin"];
const totalWeeks = 10;
const startDate = new Date("2025-11-10"); // day1 baseline (matches earlier plan)
const dailyCalorieTarget = 2000;

/* ---------- DEFAULT DATA MODEL ---------- */
function emptyUser() {
  return {
    weightLog: {},      // week/iso-date -> kg
    dayData: {},        // date (YYYY-MM-DD) -> { meals: {breakfast:[], lunch:[], snack:[], post:[], dinner:[]}, workoutBurn:0, rpe:6, recovery:100, photos:[], water:0 }
    settings: { targetWeight: 77, autoProgress: true, difficultyDefault: "beginner" },
    meta: {}
  };
}

/* ---------- STORAGE & MIGRATION ---------- */
function loadRaw() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch(e){ return null; }
}
function saveRaw(obj) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
}

/* Attempt migration from legacy v3 key if present and v4 empty */
function migrateLegacyIfNeeded() {
  const v4 = loadRaw();
  if (v4 && Object.keys(v4).length) return; // already have v4 data

  const legacy = localStorage.getItem(LEGACY_KEY_V3);
  if (!legacy) return;

  try {
    const parsed = JSON.parse(legacy);
    // Create new structure
    const newState = {};
    USERS.forEach(u => newState[u] = emptyUser());

    // Heuristic migration: if parsed.meals/exercises/weights exist copy slices into today's date or weight logs
    // This is conservative: we don't overwrite if no clear mapping
    // If parsed had a 'weights' or 'weights' key, move to weightLog
    if (parsed.weights) {
      const keys = Object.keys(parsed.weights);
      keys.forEach((wk,i)=> {
        if (i < 100) newState[USERS[0]].weightLog[wk] = parsed.weights[wk];
      });
    }
    // If parsed.meals exist, copy today's meals into Aziz's dayData
    if (parsed.meals) {
      const today = (new Date()).toISOString().split('T')[0];
      newState[USERS[0]].dayData[today] = { meals: parsed.meals, workoutBurn: 0, rpe:6, recovery:100, photos:[], water:0 };
    }

    saveRaw(newState);
    console.info("Migrated legacy data from", LEGACY_KEY_V3, "to", STORAGE_KEY);
  } catch (e) { console.warn("Failed to migrate legacy data:", e); }
}

/* Ensure base state exists */
function ensureBaseState() {
  migrateLegacyIfNeeded();
  let state = loadRaw();
  if (!state || typeof state !== "object") {
    state = {};
    USERS.forEach(u => state[u] = emptyUser());
    saveRaw(state);
  } else {
    // ensure each user present
    USERS.forEach(u => { if (!state[u]) state[u] = emptyUser(); });
    saveRaw(state);
  }
  return state;
}

let state = ensureBaseState();

/* ---------- UTILS ---------- */
function formatISO(d) { return d.toISOString().split('T')[0]; }
function getTodayISO() { return formatISO(new Date()); }
function dateToWeekIndex(dateISO) {
  const d = new Date(dateISO);
  const diff = Math.floor((d - startDate) / (1000*60*60*24));
  const wk = Math.floor(diff/7) + 1;
  return Math.max(1, Math.min(totalWeeks, wk));
}

/* ---------- APP STATE ---------- */
let currentUser = localStorage.getItem("fittracker_currentUser") || null;
let currentDate = getTodayISO();

/* If no user remembered, show overlay */
const overlay = document.getElementById("userOverlay");
const profileTag = document.getElementById("profileTag");

/* ---------- DOM refs ---------- */
const datePicker = document.getElementById("datePicker");
const foodBlocks = document.getElementById("foodBlocks");
const foodTotalEl = document.getElementById("foodTotal");
const addCustomBtn = document.getElementById("addCustom");
const customName = document.getElementById("customName");
const customCals = document.getElementById("customCals");
const customSlot = document.getElementById("customSlot");

const difficultySelect = document.getElementById("difficultySelect");
const autoProgCheckbox = document.getElementById("autoProg");
const exerciseList = document.getElementById("exerciseList");
const sessionBurnInput = document.getElementById("sessionBurn");
const saveBurnBtn = document.getElementById("saveBurn");
const rpeInput = document.getElementById("rpeInput");
const rpeValue = document.getElementById("rpeValue");
const recoveryInput = document.getElementById("recoveryInput");

const weekLabel = document.getElementById("weekLabel");
const weekEaten = document.getElementById("weekEaten");
const weekBurn = document.getElementById("weekBurn");
const weekNet = document.getElementById("weekNet");
const sessionsCount = document.getElementById("sessionsCount");

const currentWeightEl = document.getElementById("currentWeight");
const targetWeightEl = document.getElementById("targetWeight");
const weeksLeftEl = document.getElementById("weeksLeft");
const weightInput = document.getElementById("weightInput");
const saveWeightBtn = document.getElementById("saveWeight");

const waterInput = document.getElementById("waterInput");
const saveWaterBtn = document.getElementById("saveWater");
const waterToday = document.getElementById("waterToday");

const photoFile = document.getElementById("photoFile");
const addPhotoBtn = document.getElementById("addPhoto");
const photoGrid = document.getElementById("photoGrid");

const openDrawerBtn = document.getElementById("openDrawer");
const drawer = document.getElementById("drawer");
const closeDrawerBtn = document.getElementById("closeDrawer");
const switchUserBtn = document.getElementById("switchUser");
const exportJSONBtn = document.getElementById("exportJSON");
const importFileInput = document.getElementById("importFile");

/* bottom nav */
document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");
    const tab = btn.dataset.tab;
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    document.getElementById(tab).classList.add("active");
    renderForDate(currentDate);
  });
});

/* ---------- DEFAULT OPTIONS (food + workouts) ---------- */
const FOOD_OPTIONS = {
  breakfast:[
    {id:'mine',label:'Your standard breakfast',kcal:420},
    {id:'oats',label:'Oats + whey + berries',kcal:420},
    {id:'scrambled',label:'Scrambled eggs + toast',kcal:430},
    {id:'yogurt',label:'Greek yogurt + fruit',kcal:380}
  ],
  lunch:[
    {id:'grilled',label:'Grilled chicken + rice',kcal:650},
    {id:'paneer',label:'Paneer salad bowl',kcal:520},
    {id:'kheema',label:'Chicken kheema + rice',kcal:700}
  ],
  snack:[
    {id:'fruitegg',label:'1 boiled egg + 1 fruit',kcal:140},
    {id:'nuts',label:'10 almonds',kcal:120}
  ],
  post:[
    {id:'whey',label:'Whey isolate + 1/2 banana',kcal:220}
  ],
  dinner:[
    {id:'tofu',label:'Tofu stir-fry + soup',kcal:480},
    {id:'light',label:'Light soup / khichdi',kcal:350}
  ]
};

/* Weekly workout templates (7-day cycle) */
const WORKOUTS = {
  1: { name:'Chest + Triceps + Core', exercises:[
    {title:'Bench Press',sets:4,reps:'10-12'},
    {title:'Incline DB Press',sets:3,reps:'10-12'},
    {title:'Cable Fly',sets:3,reps:'12-15'},
    {title:'Tricep Pushdowns',sets:3,reps:'12-15'}
  ]},
  2: { name:'Back + Biceps + Core', exercises:[
    {title:'Lat Pulldown / Pull-ups',sets:4,reps:'10-12'},
    {title:'Seated Cable Row',sets:3,reps:'10-12'},
    {title:'DB One-Arm Row',sets:3,reps:'12'},
    {title:'Barbell Bicep Curl',sets:3,reps:'12'}
  ]},
  3: { name:'Legs + Glutes', exercises:[
    {title:'Barbell Squats',sets:4,reps:'10'},
    {title:'Leg Press',sets:3,reps:'12'},
    {title:'Lunges',sets:3,reps:'10/leg'},
    {title:'Hip Thrust',sets:3,reps:'15'}
  ]},
  4: { name:'Shoulders + Abs', exercises:[
    {title:'Overhead Press',sets:4,reps:'10-12'},
    {title:'Lateral Raises',sets:3,reps:'12-15'},
    {title:'Rear Delt Fly',sets:3,reps:'12'},
    {title:'Russian Twists',sets:3,reps:'20'}
  ]},
  5: { name:'Full-Body HIIT', exercises:[
    {title:'Burpees',sets:3,reps:'10'},
    {title:'Kettlebell Swings',sets:3,reps:'15'},
    {title:'Jump Squats',sets:3,reps:'20'}
  ]},
  6: { name:'Core + Cardio', exercises:[
    {title:'Crunches',sets:3,reps:'20'},
    {title:'Leg Raises',sets:3,reps:'15'},
    {title:'Plank',sets:3,reps:'60 sec'}
  ]},
  7: { name:'Rest / Recovery', exercises:[
    {title:'Stretching / Yoga',sets:1,reps:'30 min'},
    {title:'Brisk Walk',sets:1,reps:'20 min'}
  ]}
};

/* ---------- HELPER: read/write user/day ---------- */
function saveState() {
  saveRaw(state);
}
function getUserState(user) {
  if (!state[user]) state[user] = emptyUser();
  return state[user];
}
function ensureDay(user, dateISO) {
  const u = getUserState(user);
  if (!u.dayData[dateISO]) {
    u.dayData[dateISO] = {
      meals: { breakfast:[], lunch:[], snack:[], post:[], dinner:[] },
      workoutBurn: 0,
      rpe: 6,
      recovery: 100,
      photos: [],
      water: 0
    };
    saveState();
  }
  return u.dayData[dateISO];
}

/* ---------- UI: user selection, overlay ---------- */
function openOverlay() { overlay.style.display = "flex"; overlay.setAttribute('aria-hidden','false'); }
function closeOverlay() { overlay.style.display = "none"; overlay.setAttribute('aria-hidden','true'); }

document.querySelectorAll(".user-btn").forEach(b => {
  b.addEventListener("click", () => {
    currentUser = b.dataset.user;
    localStorage.setItem("fittracker_currentUser", currentUser);
    closeOverlay();
    loadHeader();
    renderForDate(currentDate);
  });
});

/* quick import from overlay file input */
document.getElementById("overlayImport").addEventListener("change", (e)=>{
  const f = e.target.files[0]; if(!f) return;
  const r = new FileReader();
  r.onload = (ev) => {
    try {
      const obj = JSON.parse(ev.target.result);
      if (confirm("Import data and overwrite local state? (This will replace v4 data)")) {
        state = obj;
        saveState();
        alert("Imported.");
        renderForDate(currentDate);
      }
    } catch (err) { alert("Invalid JSON file"); }
  };
  r.readAsText(f);
});

/* ---------- UI header + date ---------- */
function loadHeader() {
  if (!currentUser) { profileTag.textContent = "👤 —"; return; }
  const u = getUserState(currentUser);
  const latestWeight = Object.keys(u.weightLog).length ? u.weightLog[Object.keys(u.weightLog).pop()] : null;
  profileTag.textContent = `${currentUser} | Weight: ${latestWeight ? latestWeight + " kg" : "-- kg"}`;
}

datePicker.value = currentDate;
datePicker.addEventListener("change", ()=>{
  currentDate = datePicker.value;
  renderForDate(currentDate);
});

/* Drawer */
openDrawerBtn.addEventListener("click", ()=>{ drawer.classList.add("open"); drawer.setAttribute('aria-hidden','false'); });
closeDrawerBtn.addEventListener("click", ()=>{ drawer.classList.remove("open"); drawer.setAttribute('aria-hidden','true'); });
switchUserBtn.addEventListener("click", ()=>{ drawer.classList.remove("open"); openOverlay(); });

/* Export/import */
exportJSONBtn.addEventListener("click", ()=> {
  const dataStr = JSON.stringify(state, null, 2);
  const blob = new Blob([dataStr], {type:'application/json'});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'fittracker_v4_backup.json'; a.click(); URL.revokeObjectURL(url);
});
importFileInput.addEventListener("change", (e)=> {
  const f = e.target.files[0]; if(!f) return;
  const r = new FileReader();
  r.onload = (ev) => {
    try {
      const obj = JSON.parse(ev.target.result);
      if (confirm("Import JSON and overwrite v4 data?")) { state = obj; saveState(); alert("Imported."); renderForDate(currentDate); }
    } catch(err){ alert("Invalid JSON"); }
  };
  r.readAsText(f);
});

/* ---------- RENDER FOOD ---------- */
function renderFoodOptions(dateISO) {
  const day = ensureDay(currentUser, dateISO);
  foodBlocks.innerHTML = '';

  ['breakfast','lunch','snack','post','dinner'].forEach(slot => {
    const block = document.createElement('div'); block.className = 'meal-block';
    block.dataset.meal = slot;
    const title = document.createElement('div'); title.className = 'meal-title'; title.textContent = slot.charAt(0).toUpperCase()+slot.slice(1);
    const list = document.createElement('div'); list.id = `meal-${slot}`; list.className = 'meal-list';

    // show selected
    if (day.meals[slot] && day.meals[slot].length) {
      day.meals[slot].forEach((m, idx)=> {
        const row = document.createElement('div'); row.className='option-row';
        row.innerHTML = `<div style="max-width:80%">${m.label || m.name}</div><div class="kcal">${m.kcal} kcal</div>`;
        // allow remove on click
        const rem = document.createElement('button'); rem.textContent = "Remove"; rem.style.marginLeft='8px';
        rem.addEventListener('click', ()=>{ day.meals[slot].splice(idx,1); saveState(); renderFoodOptions(dateISO); });
        row.querySelector('div').appendChild(rem);
        list.appendChild(row);
      });
    } else {
      const none = document.createElement('div'); none.className = 'text-muted'; none.textContent = 'No items selected';
      list.appendChild(none);
    }

    // add default options (click to add)
    const opts = FOOD_OPTIONS[slot] || [];
    opts.forEach(opt => {
      const optRow = document.createElement('div'); optRow.className='option-row';
      optRow.style.opacity = '0.9';
      optRow.innerHTML = `<div>${opt.label}</div><div class="kcal">${opt.kcal} kcal</div>`;
      optRow.addEventListener('click', ()=>{ day.meals[slot].push({name:opt.label,kcal:opt.kcal}); saveState(); renderFoodOptions(dateISO); });
      list.appendChild(optRow);
    });

    block.appendChild(title); block.appendChild(list);
    foodBlocks.appendChild(block);
  });

  updateFoodTotal(dateISO);
}

/* custom meal */
addCustomBtn.addEventListener('click', ()=>{
  const name = customName.value.trim();
  const kcal = Number(customCals.value || 0);
  const slot = customSlot.value;
  if (!name || !kcal) { alert('Enter custom name and calories'); return; }
  const day = ensureDay(currentUser, currentDate);
  const id = 'c_'+Date.now();
  const item = { id, label: name, kcal };
  day.meals[slot].push(item);
  saveState();
  customName.value=''; customCals.value='';
  renderFoodOptions(currentDate);
});

/* compute total calories for date */
function computeCaloriesForDate(dateISO) {
  const day = getUserState(currentUser).dayData[dateISO];
  if (!day) return 0;
  let total = 0;
  Object.values(day.meals).forEach(arr => arr.forEach(i => total += Number(i.kcal || 0)));
  return total;
}
function updateFoodTotal(dateISO) {
  const t = computeCaloriesForDate(dateISO);
  foodTotalEl.textContent = `${t} kcal`;
}

/* ---------- RENDER EXERCISE ---------- */
function getDayNumberForDate(dateISO) {
  // 7-day cycle index (1..7) starting from startDate
  const d = new Date(dateISO);
  const diff = Math.floor((d - startDate) / (1000*60*60*24));
  const dayNum = ((diff % 7) + 7) % 7 + 1;
  return dayNum;
}

function chooseDifficultyForDate(dateISO) {
  // if auto-prog enabled, use week-based progression
  const u = getUserState(currentUser);
  if (u.settings && u.settings.autoProgress) {
    const wk = dateToWeekIndex(dateISO);
    if (wk <= 3) return 'beginner';
    if (wk <= 6) return 'moderate';
    return 'advanced';
  }
  return u.settings.difficultyDefault || 'beginner';
}

function renderExerciseForDate(dateISO) {
  const day = ensureDay(currentUser, dateISO);
  // difficulty
  const effective = (document.getElementById('autoProg').checked) ? chooseDifficultyForDate(dateISO) : difficultySelect.value;
  difficultySelect.value = effective;

  const dayNum = getDayNumberForDate(dateISO);
  const w = WORKOUTS[dayNum];
  exerciseList.innerHTML = `<div style="font-weight:700">${w.name} — (${effective})</div>`;

  w.exercises.forEach((ex, idx) => {
    const exDiv = document.createElement('div'); exDiv.className = 'exercise-item';
    exDiv.innerHTML = `<div class="exercise-title">${ex.title}</div><div class="small-muted">Sets: ${ex.sets} • Reps: ${ex.reps}</div>`;
    // sets block
    const setsRow = document.createElement('div'); setsRow.className='sets-row';
    for(let s=1;s<=ex.sets;s++) {
      const setEl = document.createElement('div'); setEl.className='set';
      setEl.style.display='inline-flex'; setEl.style.gap='8px'; setEl.style.alignItems='center'; setEl.style.marginRight='8px';
      const cb = document.createElement('input'); cb.type='checkbox';
      const lbl = document.createElement('div'); lbl.style.minWidth='44px'; lbl.textContent='Set ' + s;
      const reps = document.createElement('input'); reps.type='number'; reps.placeholder='reps'; reps.style.width='72px';
      const weight = document.createElement('input'); weight.type='number'; weight.placeholder='kg'; weight.style.width='72px';
      // load saved if any
      const saved = day.workouts && day.workouts[idx] && day.workouts[idx][s];
      if (saved) { cb.checked = !!saved.done; reps.value = saved.reps || ''; weight.value = saved.weight || ''; }
      // save handler
      function saveSet() {
        day.workouts = day.workouts || {};
        day.workouts[idx] = day.workouts[idx] || {};
        day.workouts[idx][s] = { done: !!cb.checked, reps: reps.value ? Number(reps.value) : null, weight: weight.value ? Number(weight.value) : null };
        saveState();
      }
      cb.addEventListener('change', saveSet);
      reps.addEventListener('change', saveSet);
      weight.addEventListener('change', saveSet);

      setEl.appendChild(cb); setEl.appendChild(lbl); setEl.appendChild(reps); setEl.appendChild(weight);
      setsRow.appendChild(setEl);
    }
    exDiv.appendChild(setsRow);
    exerciseList.appendChild(exDiv);
  });

  // session burn
  sessionBurnInput.value = day.workoutBurn || 0;
  saveBurnBtn.onclick = ()=> { day.workoutBurn = Number(sessionBurnInput.value || 0); saveState(); renderAnalysisForDate(currentDate); };

  // RPE / recovery
  rpeInput.value = day.rpe || 6; rpeValue.textContent = rpeInput.value;
  rpeInput.addEventListener('input', ()=> {
    day.rpe = Number(rpeInput.value); rpeValue.textContent = rpeInput.value; saveState();
  });
  recoveryInput.value = day.recovery || 100;
  recoveryInput.addEventListener('change', ()=> { day.recovery = Number(recoveryInput.value || 100); saveState(); });
}

/* ---------- ANALYSIS ---------- */
function getWeekRange(dateISO) {
  const wk = dateToWeekIndex(dateISO);
  // compute start and end by week index
  const start = new Date(startDate.getTime() + (wk-1)*7*24*60*60*1000);
  const end = new Date(start.getTime() + 6*24*60*60*1000);
  return { week: wk, start, end };
}

function summarizeWeekForDate(dateISO) {
  const r = getWeekRange(dateISO);
  let totalEaten = 0, totalBurn = 0, sessions = 0;
  const u = getUserState(currentUser);

  for (let d = new Date(r.start); d <= r.end; d.setDate(d.getDate()+1)) {
    const iso = formatISO(new Date(d));
    const dd = u.dayData[iso];
    if (!dd) continue;
    Object.values(dd.meals).forEach(arr => arr.forEach(i => totalEaten += Number(i.kcal||0)));
    if (dd.workoutBurn && dd.workoutBurn > 0) { totalBurn += Number(dd.workoutBurn); sessions++; }
    else {
      // fallback: if any set done, estimate
      const workouts = dd.workouts || {};
      const hasDone = Object.values(workouts).some(ex => Object.values(ex).some(s => s && s.done));
      if (hasDone) { totalBurn += 400; sessions++; }
    }
  }
  return { week: r.week, start: r.start, end: r.end, totalEaten, totalBurn, sessions };
}

function renderAnalysisForDate(dateISO) {
  const s = summarizeWeekForDate(dateISO);
  weekLabel.textContent = `Week ${s.week} (${s.start.toLocaleDateString()} — ${s.end.toLocaleDateString()})`;
  weekEaten.textContent = s.totalEaten + " kcal";
  weekBurn.textContent = s.totalBurn + " kcal";
  sessionsCount.textContent = s.sessions;
  weekNet.textContent = (s.totalEaten - s.totalBurn) + " kcal";
}

/* ---------- PROFILE: weights, water, photos ---------- */
function renderProfile() {
  const u = getUserState(currentUser);
  // latest weight
  const wkeys = Object.keys(u.weightLog);
  const latestWeight = wkeys.length ? u.weightLog[wkeys[wkeys.length-1]] : null;
  currentWeightEl.textContent = latestWeight ? latestWeight + " kg" : "-- kg";
  targetWeightEl.textContent = u.settings.targetWeight + " kg";
  // weeks left until end
  const today = new Date(currentDate);
  const endDate = new Date(startDate.getTime() + (totalWeeks-1)*7*24*60*60*1000);
  const weeksLeft = Math.max(0, Math.ceil((endDate - today)/(7*24*60*60*1000)));
  weeksLeftEl.textContent = weeksLeft;

  // water
  const day = ensureDay(currentUser, currentDate);
  waterToday.textContent = `Today: ${day.water || 0} ml`;

  // photos grid
  photoGrid.innerHTML = '';
  (day.photos || []).forEach((p, idx) => {
    const img = document.createElement('img'); img.src = p; img.style.width='80px'; img.style.borderRadius='6px';
    photoGrid.appendChild(img);
  });
}

/* save weight */
saveWeightBtn.addEventListener('click', ()=> {
  const val = Number(weightInput.value || 0);
  if (!val) { alert('Enter weight'); return; }
  const weekIndex = dateToWeekIndex(currentDate);
  // save under 'weekX' or use iso-date key? We'll use 'week'+index to mirror earlier approach
  const u = getUserState(currentUser);
  u.weightLog['week'+weekIndex] = val;
  saveState();
  weightInput.value='';
  loadHeader();
  renderProfile();
  renderAnalysisForDate(currentDate);
});

/* water log */
saveWaterBtn.addEventListener('click', ()=> {
  const ml = Number(waterInput.value || 0);
  if (!ml) return;
  const day = ensureDay(currentUser, currentDate);
  day.water = (day.water || 0) + ml;
  saveState(); waterInput.value=''; renderProfile();
});

/* photos */
addPhotoBtn.addEventListener('click', ()=> photoFile.click());
photoFile.addEventListener('change', (e)=> {
  const f = e.target.files[0];
  if (!f) return;
  const reader = new FileReader();
  reader.onload = (ev)=> {
    const dataUrl = ev.target.result;
    const day = ensureDay(currentUser, currentDate);
    day.photos = day.photos || [];
    day.photos.push(dataUrl);
    saveState();
    renderProfile();
  };
  reader.readAsDataURL(f);
});

/* ---------- RENDER FOR DATE (master) ---------- */
function renderForDate(dateISO) {
  if (!currentUser) return;
  datePicker.value = dateISO;
  loadHeader();
  renderFoodOptions(dateISO);
  renderExerciseForDate(dateISO);
  renderAnalysisForDate(dateISO);
  renderProfile();
}

/* ---------- INIT ---------- */
function init() {
  // if no remembered user, show overlay
  if (!currentUser) { openOverlay(); } else { closeOverlay(); }

  // set date pick default
  datePicker.value = currentDate;

  // wire difficulty & autoProg
  const u = getUserState(currentUser || USERS[0]);
  difficultySelect.value = u.settings.difficultyDefault || 'beginner';
  autoProgCheckbox.checked = u.settings.autoProgress || false;
  autoProgCheckbox.addEventListener('change', ()=> {
    const uu = getUserState(currentUser);
    uu.settings.autoProgress = autoProgCheckbox.checked;
    saveState();
  });

  // wire save burn
  saveBurnBtn.addEventListener('click', ()=> {
    const day = ensureDay(currentUser, currentDate);
    day.workoutBurn = Number(sessionBurnInput.value || 0);
    saveState(); renderAnalysisForDate(currentDate);
  });

  // rpe input reflects number
  rpeInput.addEventListener('input', ()=> rpeValue.textContent = rpeInput.value);

  // wire export progress button (profile)
  document.getElementById('exportProgress').addEventListener('click', ()=> {
    const u = getUserState(currentUser);
    const dataStr = JSON.stringify(u, null, 2);
    const blob = new Blob([dataStr], {type:'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = `${currentUser}_progress.json`; a.click(); URL.revokeObjectURL(url);
  });

  // import label open file dialog
  document.getElementById('importLabel').addEventListener('click', ()=> importFileInput.click());

  // initial render
  if (!currentUser) currentUser = USERS[0]; // fallback
  loadHeader();
  renderForDate(currentDate);
}

init();

/* ---------- Expose small helpers for console debugging (optional) ---------- */
window._fit = {
  state,
  saveState,
  ensureDay,
  getUserState,
  STORAGE_KEY,
  LEGACY_KEY_V3
};
