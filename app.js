/* ============================================================
   FITTRACKER V4 — CORE ENGINE
   Clean V3 layout + V4 features
   ============================================================ */

/* ---------- Logging Helper ---------- */
const log = (...a) => console.log("[FT]", ...a);

/* ---------- Local Storage Wrapper ---------- */
const FT = {
  get(user, key, fallback = null) {
    const raw = localStorage.getItem(`FT_${user}_${key}`);
    if (!raw) return fallback;
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  },

  set(user, key, value) {
    localStorage.setItem(`FT_${user}_${key}`, JSON.stringify(value));
  },

  clearUser(user) {
    Object.keys(localStorage)
      .filter(k => k.startsWith(`FT_${user}_`))
      .forEach(k => localStorage.removeItem(k));
  }
};

/* ---------- App State ---------- */
let CURRENT_USER = null;
let CURRENT_DATE = new Date().toISOString().slice(0, 10);

/* ---------- DOM elements ---------- */
const pages = {
  food: document.getElementById("food"),
  exercise: document.getElementById("exercise"),
  analysis: document.getElementById("analysis"),
  profile: document.getElementById("profile")
};

const drawer = document.getElementById("drawer");
const datePicker = document.getElementById("datePicker");
const profileTag = document.getElementById("profileTag");

/* ============================================================
   USER SELECTION
   ============================================================ */
document.querySelectorAll(".user-btn").forEach(btn => {
  btn.onclick = () => {
    CURRENT_USER = btn.dataset.user;
    document.getElementById("userOverlay").style.display = "none";

    profileTag.textContent = `User: ${CURRENT_USER}`;
    datePicker.value = CURRENT_DATE;

    loadAllPages();
  };
});

/* ============================================================
   DATE CHANGE
   ============================================================ */
datePicker.addEventListener("change", () => {
  CURRENT_DATE = datePicker.value;
  loadAllPages();
});

/* ============================================================
   NAVIGATION TABS
   ============================================================ */
document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.onclick = () => {
    const tab = btn.dataset.tab;

/* ============================================================
   CHUNK 3 — EXERCISE ENGINE
   - Difficulty: beginner / moderate / advanced
   - Auto-progression by week
   - Per-exercise sets UI (save per-set: done/reps/weight)
   - Session burn, RPE, Recovery
   - Data stored with FT.set / FT.get under key ex_<DATE>
   ============================================================ */

/* ------- Config (week start & total) ------- */
const START_DATE = new Date("2025-11-10"); // same baseline as project plan
const TOTAL_WEEKS = 10;

/* ------- Workout Library (7-day cycle) ------- */
const WORKOUT_LIBRARY = {
  1: { name: "Chest + Triceps + Core", exercises: [
        { title: "Bench Press", sets: 4, reps: "10-12" },
        { title: "Incline DB Press", sets: 3, reps: "10-12" },
        { title: "Cable Fly", sets: 3, reps: "12-15" },
        { title: "Tricep Pushdowns", sets: 3, reps: "12-15" }
      ]},
  2: { name: "Back + Biceps + Core", exercises: [
        { title: "Lat Pulldown / Pull-ups", sets: 4, reps: "10-12" },
        { title: "Seated Cable Row", sets: 3, reps: "10-12" },
        { title: "DB One-Arm Row", sets: 3, reps: "10" },
        { title: "Barbell Bicep Curl", sets: 3, reps: "12" }
      ]},
  3: { name: "Legs + Glutes", exercises: [
        { title: "Barbell Squats", sets: 4, reps: "8-10" },
        { title: "Leg Press", sets: 3, reps: "12" },
        { title: "Lunges", sets: 3, reps: "10/leg" },
        { title: "Hip Thrust", sets: 3, reps: "12-15" }
      ]},
  4: { name: "Shoulders + Abs", exercises: [
        { title: "Overhead Press", sets: 4, reps: "10-12" },
        { title: "Lateral Raises", sets: 3, reps: "12-15" },
        { title: "Rear Delt Fly", sets: 3, reps: "12" },
        { title: "Russian Twists", sets: 3, reps: "20" }
      ]},
  5: { name: "Full-Body HIIT", exercises: [
        { title: "Burpees", sets: 3, reps: "10" },
        { title: "Kettlebell Swings", sets: 3, reps: "15" },
        { title: "Jump Squats", sets: 3, reps: "20" }
      ]},
  6: { name: "Core + Cardio", exercises: [
        { title: "Crunches", sets: 3, reps: "20" },
        { title: "Leg Raises", sets: 3, reps: "15" },
        { title: "Plank", sets: 3, reps: "60s" }
      ]},
  7: { name: "Rest / Recovery", exercises: [
        { title: "Stretching / Yoga", sets: 1, reps: "30 min" },
        { title: "Brisk Walk", sets: 1, reps: "20 min" }
      ]}
};

/* ------- Helpers: date <-> week/day ------- */
function formatISODate(d) {
  if (typeof d === "string" && d.length === 10) return d;
  const dt = d instanceof Date ? d : new Date(d);
  return dt.toISOString().split("T")[0];
}
function dayIndexFromDate(dateISO) {
  const dt = new Date(dateISO);
  const diff = Math.floor((dt - START_DATE) / (1000*60*60*24));
  // cycle 1..7
  return ((diff % 7) + 7) % 7 + 1;
}
function weekIndexFromDate(dateISO) {
  const dt = new Date(dateISO);
  const diff = Math.floor((dt - START_DATE) / (1000*60*60*24));
  const wk = Math.floor(diff / 7) + 1;
  return Math.max(1, Math.min(TOTAL_WEEKS, wk));
}

/* ------- Exercise state storage helpers ------- */
function getExerciseState(dateISO) {
  const key = `ex_${formatISODate(dateISO)}`;
  return FT.get(CURRENT_USER, key, {
    sets: {},        // exIdx -> { setNumber -> { done, reps, weight } }
    sessionBurn: 0,
    rpe: 6,
    recovery: 100
  });
}
function setExerciseState(dateISO, obj) {
  const key = `ex_${formatISODate(dateISO)}`;
  FT.set(CURRENT_USER, key, obj);
}

/* ------- Difficulty scaling ------- */
/*
  Strategy:
   - beginner: base sets
   - moderate: +1 set to compound (first exercise) and slightly higher reps tolerance
   - advanced: +2 sets to compound, core accessories +1 set
*/
function effectiveSetsFor(exercise, difficulty) {
  const base = Number(exercise.sets || 3);
  if (difficulty === "beginner") return base;
  if (difficulty === "moderate") {
    // give +1 on compound (first exercise)
    return base + (exercise._isCompound ? 1 : 0);
  }
  // advanced
  return base + (exercise._isCompound ? 2 : 1);
}

/* Mark compound exercises for simple scaling heuristic */
function markCompoundFlags(exList) {
  return exList.map((ex, idx) => {
    // treat first exercise as compound
    return Object.assign({}, ex, { _isCompound: idx === 0 });
  });
}

/* ------- Render Exercise UI ------- */
function renderExercise() {
  if (!CURRENT_USER) return;
  const dateISO = formatISODate(CURRENT_DATE);
  const container = document.getElementById("exerciseContent");
  container.innerHTML = ""; // clear

  // deduce workout of day
  const dayNum = dayIndexFromDate(dateISO);
  const wkIndex = weekIndexFromDate(dateISO);

  const workout = WORKOUT_LIBRARY[dayNum];
  if (!workout) {
    container.innerHTML = `<div class="exercise-block">No workout configured for day ${dayNum}.</div>`;
    return;
  }

  // determine difficulty: UI dropdown may be present in DOM; check auto-progression checkbox
  const autoProg = document.getElementById("autoProgression") && document.getElementById("autoProgression").checked;
  let difficulty = (document.getElementById("difficultySelect") && document.getElementById("difficultySelect").value) || "beginner";
  if (autoProg) {
    if (wkIndex <= 3) difficulty = "beginner";
    else if (wkIndex <= 6) difficulty = "moderate";
    else difficulty = "advanced";
    // update dropdown to reflect auto mode (not persisted here)
    if (document.getElementById("difficultySelect")) document.getElementById("difficultySelect").value = difficulty;
  }

  // header
  const header = document.createElement("div");
  header.className = "exercise-block";
  header.innerHTML = `<div style="font-weight:800">${workout.name} — <span style="font-weight:600">${difficulty.toUpperCase()}</span></div>
                      <div class="small muted">Week ${wkIndex} • Day ${dayNum}</div>`;
  container.appendChild(header);

  // load saved state for this date
  const exState = getExerciseState(dateISO);
  const exList = markCompoundFlags(workout.exercises);

  exList.forEach((ex, exIdx) => {
    const effectiveSets = effectiveSetsFor(ex, difficulty);
    const exDiv = document.createElement("div");
    exDiv.className = "exercise-block";
    exDiv.innerHTML = `<div class="exercise-title">${ex.title}</div>
                       <div class="small muted">Suggested: ${effectiveSets} sets • Reps: ${ex.reps}</div>`;

    // sets
    const setsContainer = document.createElement("div");
    setsContainer.className = "set-collection";
    setsContainer.style.marginTop = "10px";

    for (let s = 1; s <= effectiveSets; s++) {
      const setRow = document.createElement("div");
      setRow.className = "set-row";
      setRow.style.alignItems = "center";

      const cb = document.createElement("input");
      cb.type = "checkbox";
      cb.style.transform = "scale(1.05)";
      // prefill saved if exists
      if (exState.sets && exState.sets[exIdx] && exState.sets[exIdx][s]) {
        cb.checked = !!exState.sets[exIdx][s].done;
      }

      const lbl = document.createElement("div");
      lbl.textContent = "Set " + s;
      lbl.style.minWidth = "56px";
      lbl.style.fontWeight = "600";

      const repsInput = document.createElement("input");
      repsInput.type = "number";
      repsInput.placeholder = "reps";
      repsInput.style.width = "70px";
      if (exState.sets && exState.sets[exIdx] && exState.sets[exIdx][s] && exState.sets[exIdx][s].reps !== null) {
        repsInput.value = exState.sets[exIdx][s].reps;
      }

      const weightInput = document.createElement("input");
      weightInput.type = "number";
      weightInput.placeholder = "kg";
      weightInput.style.width = "70px";
      if (exState.sets && exState.sets[exIdx] && exState.sets[exIdx][s] && exState.sets[exIdx][s].weight !== null) {
        weightInput.value = exState.sets[exIdx][s].weight;
      }

      // save handler
      function saveSetState() {
        // ensure structure
        exState.sets = exState.sets || {};
        exState.sets[exIdx] = exState.sets[exIdx] || {};
        exState.sets[exIdx][s] = {
          done: !!cb.checked,
          reps: repsInput.value ? Number(repsInput.value) : null,
          weight: weightInput.value ? Number(weightInput.value) : null
        };
        setExerciseState(dateISO, exState);
        // update analysis (conservative burn estimate)
        renderAnalysis(); // keep analysis updated
      }

      cb.addEventListener("change", saveSetState);
      repsInput.addEventListener("change", saveSetState);
      weightInput.addEventListener("change", saveSetState);

      setRow.appendChild(cb);
      setRow.appendChild(lbl);
      setRow.appendChild(repsInput);
      setRow.appendChild(weightInput);

      setsContainer.appendChild(setRow);
    } // end sets loop

    exDiv.appendChild(setsContainer);
    container.appendChild(exDiv);
  });

  // Session burn + RPE + Recovery controls (rendered once per day)
  const controls = document.createElement("div");
  controls.className = "exercise-block";
  controls.style.display = "flex";
  controls.style.flexDirection = "column";
  controls.style.gap = "10px";
  controls.style.marginTop = "12px";

  // Session burn input
  const burnRow = document.createElement("div");
  burnRow.style.display = "flex";
  burnRow.style.alignItems = "center";
  burnRow.style.gap = "8px";

  const burnLabel = document.createElement("div");
  burnLabel.textContent = "Estimated session burn (kcal):";
  burnLabel.style.minWidth = "200px";

  const burnInput = document.createElement("input");
  burnInput.type = "number";
  burnInput.className = "small-input";
  burnInput.style.width = "120px";
  burnInput.value = exState.sessionBurn || 0;

  const saveBurnBtn = document.createElement("button");
  saveBurnBtn.className = "user-btn";
  saveBurnBtn.textContent = "Save burn";

  saveBurnBtn.onclick = () => {
    exState.sessionBurn = Number(burnInput.value || 0);
    setExerciseState(dateISO, exState);
    renderAnalysis(); // update analysis view
    alert("Session burn saved");
  };

  burnRow.appendChild(burnLabel);
  burnRow.appendChild(burnInput);
  burnRow.appendChild(saveBurnBtn);

  // RPE slider
  const rpeRow = document.createElement("div");
  rpeRow.style.display = "flex";
  rpeRow.style.alignItems = "center";
  rpeRow.style.gap = "12px";

  const rpeLabel = document.createElement("div");
  rpeLabel.textContent = "RPE:";
  rpeLabel.style.minWidth = "50px";

  const rpeSlider = document.createElement("input");
  rpeSlider.type = "range";
  rpeSlider.min = 1;
  rpeSlider.max = 10;
  rpeSlider.value = exState.rpe || 6;
  rpeSlider.style.width = "160px";

  const rpeValue = document.createElement("div");
  rpeValue.textContent = rpeSlider.value;
  rpeValue.className = "small muted";

  rpeSlider.oninput = () => {
    rpeValue.textContent = rpeSlider.value;
    exState.rpe = Number(rpeSlider.value);
    setExerciseState(dateISO, exState);
  };

  rpeRow.appendChild(rpeLabel);
  rpeRow.appendChild(rpeSlider);
  rpeRow.appendChild(rpeValue);

  // Recovery input
  const recRow = document.createElement("div");
  recRow.style.display = "flex";
  recRow.style.alignItems = "center";
  recRow.style.gap = "8px";

  const recLabel = document.createElement("div");
  recLabel.textContent = "Recovery (%):";
  recLabel.style.minWidth = "120px";

  const recInput = document.createElement("input");
  recInput.type = "number";
  recInput.className = "small-input";
  recInput.style.width = "100px";
  recInput.value = exState.recovery || 100;

  recInput.onchange = () => {
    exState.recovery = Number(recInput.value || 100);
    setExerciseState(dateISO, exState);
  };

  recRow.appendChild(recLabel);
  recRow.appendChild(recInput);

  // append control rows
  controls.appendChild(burnRow);
  controls.appendChild(rpeRow);
  controls.appendChild(recRow);

  container.appendChild(controls);
}

/* ------- Public helper to save a manual set state (optional API) ------- */
function saveSingleSet(dateISO, exIdx, setNumber, payload) {
  const state = getExerciseState(dateISO);
  state.sets = state.sets || {};
  state.sets[exIdx] = state.sets[exIdx] || {};
  state.sets[exIdx][setNumber] = payload;
  setExerciseState(dateISO, state);
}

/* ------- On-demand render helper used by other chunks ------- */
function renderExerciseForCurrentDate() {
  renderExercise();
}

/* Ensure exercise UI updates when difficulty or auto-prog toggles changed */
const difficultyEl = document.getElementById("difficultySelect");
const autoProgEl = document.getElementById("autoProgression");
if (difficultyEl) difficultyEl.addEventListener("change", ()=> renderExercise());
if (autoProgEl) autoProgEl.addEventListener("change", ()=> renderExercise());

/* Update if date changes (already wired in chunk1) */
/* ============================================================
   CHUNK 4 — ANALYSIS ENGINE
   - Weekly calories eaten
   - Weekly burn
   - Weekly net (eaten – burn)
   - Weight tracking per week (1..10)
   - Weight chart (canvas)
   - On-track / off-track logic
   - Weekly notes + auto-summary
   ============================================================ */

/* ---- Helpers from earlier chunks ---- */
function dateISO(d){ return (new Date(d)).toISOString().split("T")[0]; }

/* ---- Week range helper ---- */
function getWeekRange(dateISO) {
  const dt = new Date(dateISO);
  const diffDays = Math.floor((dt - START_DATE) / (1000*60*60*24));
  const weekIndex = Math.floor(diffDays / 7) + 1;
  const wk = Math.max(1, Math.min(TOTAL_WEEKS, weekIndex));
  
  const start = new Date(START_DATE.getTime() + (wk-1)*7*86400000);
  const end   = new Date(start.getTime() + 6*86400000);

  return { week: wk, start, end };
}

/* ============================================================
   WEEKLY CALCULATION
   ============================================================ */

function caloriesEaten(dateISO) {
  const foodState = getFoodState(dateISO);
  if (!foodState) return 0;

  let total = 0;
  Object.keys(foodState.meals).forEach(mealKey => {
    const ids = foodState.meals[mealKey];
    ids.forEach(id => {
      const def = FOOD_LIBRARY[mealKey].find(x => x.id === id);
      if (def) total += def.kcal;
    });
  });

  // plus custom meals
  (foodState.customMeals || []).forEach(obj => { total += obj.kcal; });

  return total;
}

function weeklySummary(dateISO) {
  const r = getWeekRange(dateISO);
  let eaten = 0, burn = 0, sessions = 0;

  for (let d = new Date(r.start); d <= r.end; d.setDate(d.getDate() + 1)) {
    const iso = dateISO(d);
    eaten += caloriesEaten(iso);

    const ex = getExerciseState(iso);
    if (!ex) continue;

    if (ex.sessionBurn) {
      burn += ex.sessionBurn;
      sessions++;
    } else {
      // fallback: count done sets as 200 kcal session
      let doneSets = 0;
      Object.values(ex.sets || {}).forEach(exObj => {
        Object.values(exObj).forEach(s => { if (s.done) doneSets++; });
      });
      if (doneSets > 0) {
        burn += 200; 
        sessions++;
      }
    }
  }

  return { 
    week: r.week,
    start: r.start, 
    end: r.end,
    eaten, 
    burn, 
    net: eaten - burn,
    sessions
  };
}

/* ============================================================
   WEIGHT TRACKING
   ============================================================ */

function getWeight(week) {
  return FT.get(CURRENT_USER, `weight_week_${week}`, null);
}
function setWeight(week, kg) {
  FT.set(CURRENT_USER, `weight_week_${week}`, kg);
}

/* Draw weight chart (canvas) */
function drawWeightChart(summaryBox) {
  let canvas = document.getElementById("weightChartCanvas");
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.id = "weightChartCanvas";
    canvas.width = 380;
    canvas.height = 180;
    summaryBox.appendChild(canvas);
  }

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0,0,canvas.width,canvas.height);

  const userData = [];
  const targetData = [];
  for (let i=1; i<=TOTAL_WEEKS; i++) {
    const wt = getWeight(i);
    userData.push(wt !== null ? wt : null);

    const t = 87 - ((i-1)*(87-77)/(TOTAL_WEEKS-1));
    targetData.push(t);
  }

  const allVals = targetData.concat(userData.filter(x=>x!==null));
  const minY = Math.min(...allVals) - 1;
  const maxY = Math.max(...allVals) + 1;

  /* helper: map weight -> Y pixel */
  const mapY = v => {
    return 10 + ((maxY - v) / (maxY - minY)) * (canvas.height - 20);
  };
  const mapX = w => 10 + (w-1) * ((canvas.width - 20)/(TOTAL_WEEKS - 1));

  // grid lines
  ctx.strokeStyle = "rgba(255,255,255,0.08)";
  for (let g=0; g<4; g++){
    const y = 10 + g*((canvas.height - 20)/3);
    ctx.beginPath();
    ctx.moveTo(0,y);
    ctx.lineTo(canvas.width,y);
    ctx.stroke();
  }

  // draw target line
  ctx.strokeStyle = "#ffd24d";
  ctx.setLineDash([6,4]);
  ctx.beginPath();
  targetData.forEach((v,i)=>{
    const x = mapX(i+1), y = mapY(v);
    if (i===0) ctx.moveTo(x,y);
    else ctx.lineTo(x,y);
  });
  ctx.stroke();
  ctx.setLineDash([]);

  // draw user line
  ctx.strokeStyle = "#0a84ff";
  ctx.beginPath();
  let started = false;
  userData.forEach((v,i)=>{
    if (v===null) return;
    const x = mapX(i+1), y = mapY(v);
    if (!started){ ctx.moveTo(x,y); started=true; }
    else ctx.lineTo(x,y);
    ctx.fillStyle="#0a84ff";
    ctx.beginPath(); ctx.arc(x,y,3,0,6.28); ctx.fill();
  });
  ctx.stroke();

  // legend
  ctx.fillStyle = "#fff";
  ctx.font = "12px sans-serif";
  ctx.fillText("Target",10,canvas.height-4);
  ctx.fillStyle = "#0a84ff";
  ctx.fillText("You",70,canvas.height-4);
}

/* ============================================================
   RENDER ANALYSIS PAGE
   ============================================================ */

function renderAnalysis() {
  if (!CURRENT_USER) return;

  const dateISOString = dateISO(CURRENT_DATE);
  const s = weeklySummary(dateISOString);
  const container = document.getElementById("analysisContent");
  container.innerHTML = "";

  /* Weekly Summary Box */
  const box = document.createElement("div");
  box.className = "summary-box";

  box.innerHTML = `
    <div><strong>Week ${s.week}:</strong> ${s.start.toDateString()} — ${s.end.toDateString()}</div>
    <div class="summary-row">Calories eaten: <strong>${s.eaten}</strong></div>
    <div class="summary-row">Workout burn: <strong>${s.burn}</strong> (${s.sessions} sessions)</div>
    <div class="summary-row">Net: <strong>${s.net}</strong> kcal</div>
  `;

  container.appendChild(box);

  /* Weight section */
  const weightBox = document.createElement("div");
  weightBox.className = "summary-box";
  weightBox.innerHTML = `
    <strong>Weight Tracking</strong><br>
    <div style="margin-top:8px; display:flex; gap:8px; align-items:center;">
      <div>Week:</div>
      <select id="weightWeekSelect" class="small-input"></select>
      <input id="weightValueInput" type="number" class="small-input" placeholder="kg" style="width:100px">
      <button id="saveWeightBtn" class="user-btn" style="padding:6px 12px;">Save</button>
    </div>
    <div id="trackStatus" class="small muted" style="margin-top:10px;"></div>
  `;

  container.appendChild(weightBox);

  // populate week select
  const sel = document.getElementById("weightWeekSelect");
  sel.innerHTML = "";
  for (let i=1; i<=TOTAL_WEEKS; i++){
    const op = document.createElement("option");
    op.value = i;
    op.textContent = "Week " + i;
    sel.appendChild(op);
  }
  sel.value = s.week;

  // prefill weight if exists
  const existing = getWeight(s.week);
  if (existing !== null) document.getElementById("weightValueInput").value = existing;

  // save handler
  document.getElementById("saveWeightBtn").onclick = () => {
    const wk = Number(sel.value);
    const kg = Number(document.getElementById("weightValueInput").value);
    if (!kg) { alert("Enter weight"); return; }

    setWeight(wk, kg);
    alert("Weight saved");

    renderAnalysis(); // rerender to update chart + status
  };

  // draw chart
  drawWeightChart(weightBox);

  // on-track status
  const lastW = getWeight(s.week);
  const targetForWeek = 87 - ((s.week-1)*(87-77)/(TOTAL_WEEKS-1));

  const statusBox = document.getElementById("trackStatus");
  if (lastW !== null) {
    if (lastW <= targetForWeek + 0.3) {
      statusBox.innerHTML = `<span style="color:#7cffb2;font-weight:700">On Track ✓</span> — ${lastW} kg vs ${targetForWeek.toFixed(1)} target`;
    } else {
      statusBox.innerHTML = `<span style="color:#ff8b8b;font-weight:700">Off Track ✕</span> — ${lastW} kg vs ${targetForWeek.toFixed(1)} target`;
    }
  }

  /* Weekly notes */
  const notesBox = document.createElement("div");
  notesBox.className = "summary-box";
  notesBox.innerHTML = `
    <strong>Weekly Notes</strong><br>
    <textarea id="weeklyNotes" style="width:100%;height:90px;margin-top:10px;"></textarea>
    <button id="autoSummaryBtn" class="user-btn" style="margin-top:10px;">Generate Auto Summary</button>
  `;

  container.appendChild(notesBox);

  // load+save notes
  const noteKey = `notes_week_${s.week}`;
  const savedNotes = FT.get(CURRENT_USER, noteKey, "");
  document.getElementById("weeklyNotes").value = savedNotes;

  document.getElementById("weeklyNotes").onchange = () => {
    FT.set(CURRENT_USER, noteKey, document.getElementById("weeklyNotes").value);
  };

  // auto summary
  document.getElementById("autoSummaryBtn").onclick = () => {
    const txt =
`Week ${s.week} Summary:
• Calories Eaten: ${s.eaten}
• Workout Burn: ${s.burn} (${s.sessions} sessions)
• Net: ${s.net} kcal
• Weight Target: ${targetForWeek.toFixed(1)} kg
• Actual Weight: ${lastW !== null ? lastW + " kg" : "not logged"}

Overall Progress:
${lastW !== null ? (lastW <= targetForWeek + 0.3 ? "✔ On Track" : "✖ Behind Target") : "Weight not logged"}`;

    document.getElementById("weeklyNotes").value = txt;
    FT.set(CURRENT_USER, noteKey, txt);
  };
}

/* Re-render when the tab is opened */
document.querySelector("[data-tab='analysis']").addEventListener("click", () => {
  renderAnalysis();
});
     

    // make tab active
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    // show page
    Object.keys(pages).forEach(p => pages[p].classList.remove("active"));
    pages[tab].classList.add("active");

    loadAllPages();
  };
});

/* ============================================================
   SIDE DRAWER
   ============================================================ */
document.getElementById("openDrawer").onclick = () => drawer.classList.add("open");
document.getElementById("closeDrawer").onclick = () => drawer.classList.remove("open");

document.getElementById("switchUser").onclick = () => {
  drawer.classList.remove("open");
  document.getElementById("userOverlay").style.display = "flex";
};

document.getElementById("resetData").onclick = () => {
  if (!CURRENT_USER) return;
  if (!confirm("Reset all data for this user?")) return;

  FT.clearUser(CURRENT_USER);
  loadAllPages();
  alert("User data cleared.");
};

/* ============================================================
   EXPORT DATA
   ============================================================ */
document.getElementById("exportData").onclick = () => {
  const obj = {};
  Object.keys(localStorage).forEach(k => {
    if (k.startsWith(`FT_${CURRENT_USER}_`)) {
      obj[k] = JSON.parse(localStorage.getItem(k));
    }
  });

  const blob = new Blob([JSON.stringify(obj, null, 2)], {
    type: "application/json"
  });

  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = `${CURRENT_USER}_backup.json`;
  a.click();
};

/* ============================================================
   IMPORT DATA
   ============================================================ */
document.getElementById("importData").onclick = () => {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = ".json";

  input.onchange = e => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const data = JSON.parse(reader.result);

      Object.keys(data).forEach(k => {
        localStorage.setItem(k, JSON.stringify(data[k]));
      });

      alert("Import completed.");
      loadAllPages();
    };

    reader.readAsText(file);
  };

  input.click();
};

/* ============================================================
   MIGRATE V3 → V4
   ============================================================ */
document.getElementById("runMigration").onclick = () => {
  alert("Migration engine will run now (dummy placeholder).");
  // You will receive full migration logic in later chunk
};

/* ============================================================
   PAGE LOADER
   ============================================================ */
function loadAllPages() {
  if (!CURRENT_USER) return;

  renderFood();
  renderExercise();
  renderAnalysis();
  renderProfile();
}

/* ============================================================
   FOOD ENGINE — V3 LAYOUT (CLEAN)
   ============================================================ */

const FOOD_MAP = {
  breakfast: [
    { id: "my_breakfast", label: "2 egg whites + 1 whole egg + toast + 1 tsp peanut butter + fruit", kcal: 420 },
    { id: "oats", label: "Oats + whey + berries", kcal: 410 },
    { id: "scrambled", label: "Scrambled eggs + toast", kcal: 380 }
  ],

  lunch: [
    { id: "kheema", label: "Chicken kheema + 1 cup rice + veggies", kcal: 650 },
    { id: "chicken_rice", label: "Grilled chicken + brown rice + salad", kcal: 600 },
    { id: "paneer_veg", label: "Paneer + veggies + ½ cup rice", kcal: 550 }
  ],

  snack: [
    { id: "egg_fruit", label: "1 boiled egg + 1 fruit", kcal: 140 },
    { id: "almonds", label: "10 almonds + tea", kcal: 120 },
    { id: "protein_bar", label: "Low sugar protein bar", kcal: 200 }
  ],

  postwo: [
    { id: "whey", label: "Whey isolate + ½ banana", kcal: 220 },
    { id: "whey_oats", label: "Whey + oats", kcal: 280 }
  ],

  dinner: [
    { id: "tofu", label: "Tofu stir fry + soup", kcal: 420 },
    { id: "omelette", label: "Egg omelette + salad", kcal: 380 },
    { id: "light_khichdi", label: "Light khichdi", kcal: 350 }
  ]
};

/* ============================================================
   Retrieve Meals for Current User + Date
   ============================================================ */
function getMealState() {
  const key = `meals_${CURRENT_DATE}`;
  return FT.get(CURRENT_USER, key, {
    breakfast: [],
    lunch: [],
    snack: [],
    postwo: [],
    dinner: [],
    custom: []
  });
}

/* ============================================================
   Save Meals
   ============================================================ */
function saveMealState(state) {
  FT.set(CURRENT_USER, `meals_${CURRENT_DATE}`, state);
}

/* ============================================================
   Render Meal Block
   ============================================================ */
function mealBlockHTML(mealKey, mealName, mealOptions, state) {
  return `
    <div class="food-block">
      <div class="food-title">${mealName}</div>

      ${mealOptions.map(opt => `
        <div class="food-option">
          <label>
            <input type="checkbox"
                   data-meal="${mealKey}"
                   data-id="${opt.id}"
                   ${state[mealKey].includes(opt.id) ? "checked" : ""}>
            ${opt.label}
          </label>
          <span class="kcal">${opt.kcal} kcal</span>
        </div>
      `).join("")}

      ${state.custom
        .filter(c => c.meal === mealKey)
        .map(c => `
        <div class="food-option">
          <label>
            <input type="checkbox"
                   data-meal="${mealKey}"
                   data-id="${c.id}"
                   ${state[mealKey].includes(c.id) ? "checked" : ""}>
            ${c.label} (custom)
          </label>
          <span class="kcal">${c.kcal} kcal</span>
        </div>
      `).join("")}
    </div>
  `;
}

/* ============================================================
   Render Food Page
   ============================================================ */
function renderFood() {
  const wrapper = document.getElementById("foodContent");
  const state = getMealState();

  wrapper.innerHTML = `
    <div class="food-block" style="padding:14px;margin-bottom:20px;">
      <strong>Meal Timing:</strong><br>
      Breakfast 09:30 • Lunch 13:30 • Snack 16:00 • Post-WO 19:30 • Dinner 21:00
    </div>

    ${mealBlockHTML("breakfast", "Breakfast", FOOD_MAP.breakfast, state)}
    ${mealBlockHTML("lunch", "Lunch", FOOD_MAP.lunch, state)}
    ${mealBlockHTML("snack", "Snack", FOOD_MAP.snack, state)}
    ${mealBlockHTML("postwo", "Post-Workout", FOOD_MAP.postwo, state)}
    ${mealBlockHTML("dinner", "Dinner", FOOD_MAP.dinner, state)}

    <div class="food-block">
      <div class="food-title">Add Custom Meal</div>
      <input id="customName" placeholder="Meal name" class="set-input" style="width:65%;padding:8px;">
      <input id="customKcal" type="number" placeholder="kcal" class="set-input" style="width:30%;padding:8px;">
      
      <select id="customTarget" class="set-input" style="margin-top:10px;padding:8px;width:100%;">
        <option value="breakfast">Breakfast</option>
        <option value="lunch">Lunch</option>
        <option value="snack">Snack</option>
        <option value="postwo">Post-Workout</option>
        <option value="dinner">Dinner</option>
      </select>

      <button id="addCustomBtn" class="user-btn" style="margin-top:14px;width:100%;">Add</button>
    </div>

    <div class="analysis-block">
      <div style="font-size:18px;font-weight:bold;">Total Calories Today</div>
      <div id="foodTotalKcal" style="margin-top:8px;font-size:22px;color:#b084ff;">0 kcal</div>
    </div>
  `;

  attachFoodEvents();
  updateDailyCalories();
}

/* ============================================================
   Attach Events — Checkbox + Custom Add
   ============================================================ */
function attachFoodEvents() {
  const state = getMealState();

  document.querySelectorAll("#foodContent input[type='checkbox']").forEach(cb => {
    cb.addEventListener("change", () => {
      const meal = cb.dataset.meal;
      const id = cb.dataset.id;

      if (cb.checked) {
        if (!state[meal].includes(id)) state[meal].push(id);
      } else {
        state[meal] = state[meal].filter(x => x !== id);
      }

      saveMealState(state);
      updateDailyCalories();
    });
  });

  document.getElementById("addCustomBtn").onclick = () => {
    const name = document.getElementById("customName").value.trim();
    const kcal = Number(document.getElementById("customKcal").value.trim());
    const target = document.getElementById("customTarget").value;

    if (!name || !kcal) {
      alert("Enter name & kcal");
      return;
    }

    const id = `custom_${Date.now()}`;

    state.custom.push({
      id,
      label: name,
      kcal,
      meal: target
    });

    state[target].push(id);

    saveMealState(state);
    renderFood();
  };
}

/* ============================================================
   Calculate Daily Calories
   ============================================================ */
function updateDailyCalories() {
  const state = getMealState();
  let total = 0;

  const addKcal = (mealKey, id) => {
    const def = FOOD_MAP[mealKey].find(x => x.id === id);
    if (def) {
      total += def.kcal;
      return;
    }

    const custom = state.custom.find(c => c.id === id);
    if (custom) total += custom.kcal;
  };

  ["breakfast", "lunch", "snack", "postwo", "dinner"].forEach(mealKey => {
    state[mealKey].forEach(id => addKcal(mealKey, id));
  });

  document.getElementById("foodTotalKcal").textContent = `${total} kcal`;

  // store for analysis
  FT.set(CURRENT_USER, `cals_${CURRENT_DATE}`, total);
}
/* ============================================================
   CHUNK 5 — PROFILE ENGINE
   - Hydration tracker
   - Macro goals
   - PR tracking (bench/squat/deadlift/any)
   - Profile overview
   ============================================================ */

/* ---------- HELPERS ---------- */
function getProfile() {
  return FT.get(CURRENT_USER, "profile", {
    startWeight: 87,
    goalWeight: 77,
    macroProtein: 150,
    macroCarbs: 180,
    macroFats: 60,
    hydrationTarget: 2500 // ml
  });
}

function saveProfile(obj) {
  FT.set(CURRENT_USER, "profile", obj);
}

/* ---------- HYDRATION ---------- */
function getHydration(dateISO) {
  return FT.get(CURRENT_USER, `hydration_${dateISO}`, { current: 0 });
}
function saveHydration(dateISO, obj) {
  FT.set(CURRENT_USER, `hydration_${dateISO}`, obj);
}

/* ---------- PERSONAL RECORDS (PRS) ---------- */
function getPRs() {
  return FT.get(CURRENT_USER, "prs", []);
}
function savePRs(arr) {
  FT.set(CURRENT_USER, "prs", arr);
}

/* ============================================================
   RENDER PROFILE
   ============================================================ */
function renderProfile() {
  if (!CURRENT_USER) return;
  const container = document.getElementById("profileContent");
  const P = getProfile();

  const todayISO = CURRENT_DATE;
  const hydro = getHydration(todayISO);

  const hydrationPercent = Math.min(100, Math.round((hydro.current / P.hydrationTarget) * 100));

  container.innerHTML = `
    <div class="profile-box">
      <h3>Profile Overview</h3>
      <div><strong>User:</strong> ${CURRENT_USER}</div>
      <div><strong>Start Weight:</strong> ${P.startWeight} kg</div>
      <div><strong>Goal Weight:</strong> ${P.goalWeight} kg</div>
    </div>

    <div class="profile-box">
      <h3>Hydration</h3>
      <div style="font-size:18px;">${hydro.current} ml / ${P.hydrationTarget} ml</div>
      <div style="margin:10px 0; height:14px; background:#222; border-radius:12px;">
        <div style="width:${hydrationPercent}%; height:100%; background:#7eaaff; border-radius:12px;"></div>
      </div>

      <div style="display:flex; gap:10px;">
        <button id="waterPlus" class="user-btn" style="flex:1;">+250 ml</button>
        <button id="waterMinus" class="user-btn" style="flex:1;">-250 ml</button>
      </div>
    </div>

    <div class="profile-box">
      <h3>Macro Targets</h3>

      <label>Protein (g)</label>
      <input id="macroProtein" class="set-input" type="number" value="${P.macroProtein}" />

      <label style="margin-top:10px;">Carbs (g)</label>
      <input id="macroCarbs" class="set-input" type="number" value="${P.macroCarbs}" />

      <label style="margin-top:10px;">Fats (g)</label>
      <input id="macroFats" class="set-input" type="number" value="${P.macroFats}" />

      <button id="saveMacros" class="user-btn" style="margin-top:12px;width:100%;">Save Macros</button>
    </div>

    <div class="profile-box">
      <h3>Personal Records (PRs)</h3>

      <div id="prList">
        ${getPRs().map((p, idx) => `
          <div class="food-option" style="justify-content:space-between;">
            <div>${p.name}: <strong>${p.weight} kg</strong></div>
            <button class="user-btn" data-pr="${idx}" style="padding:4px 10px;">Edit</button>
          </div>
        `).join("")}
      </div>

      <h4 style="margin-top:12px;">Add New PR</h4>
      <input id="prName" class="set-input" placeholder="Exercise (Bench, Squat...)" />
      <input id="prWeight" class="set-input" type="number" placeholder="kg" style="margin-top:6px;" />
      <button id="addPR" class="user-btn" style="margin-top:10px;width:100%;">Add PR</button>
    </div>
  `;

  /* ---------- HYDRATION EVENTS ---------- */
  document.getElementById("waterPlus").onclick = () => {
    hydro.current += 250;
    saveHydration(todayISO, hydro);
    renderProfile();
  };
  document.getElementById("waterMinus").onclick = () => {
    hydro.current = Math.max(0, hydro.current - 250);
    saveHydration(todayISO, hydro);
    renderProfile();
  };

  /* ---------- SAVE MACROS ---------- */
  document.getElementById("saveMacros").onclick = () => {
    P.macroProtein = Number(document.getElementById("macroProtein").value);
    P.macroCarbs = Number(document.getElementById("macroCarbs").value);
    P.macroFats = Number(document.getElementById("macroFats").value);
    saveProfile(P);
    alert("Macros saved");
  };

  /* ---------- ADD PR ---------- */
  document.getElementById("addPR").onclick = () => {
    const name = document.getElementById("prName").value.trim();
    const weight = Number(document.getElementById("prWeight").value);
    if (!name || !weight) return alert("Enter name & weight");

    const arr = getPRs();
    arr.push({ name, weight });
    savePRs(arr);

    renderProfile();
  };

  /* ---------- EDIT PR ---------- */
  document.querySelectorAll("[data-pr]").forEach(btn => {
    btn.onclick = () => {
      const idx = Number(btn.dataset.pr);
      const arr = getPRs();
      const cur = arr[idx];

      const newW = prompt(`Update ${cur.name} PR (kg):`, cur.weight);
      if (!newW) return;

      arr[idx].weight = Number(newW);
      savePRs(arr);

      renderProfile();
    };
  });
}

/* Re-render when tab opens */
document.querySelector("[data-tab='profile']").addEventListener("click", () => {
  renderProfile();
});
/* ============================================================
   CHUNK 6 — RECOVERY ENGINE (Auto Fatigue + Rest Logic)
   - Tracks muscle recovery based on workout type
   - Uses RPE to scale fatigue
   - Recommends “Train / Caution / Rest”
   - Stores per-user per-date
   ============================================================ */

/* ------------------------------------------
   Recovery storage helpers
------------------------------------------- */

function getRecovery(dateISO) {
  return FT.get(CURRENT_USER, `recovery_${dateISO}`, {
    chest: 0,
    back: 0,
    shoulders: 0,
    legs: 0,
    arms: 0,
    core: 0
  });
}

function saveRecovery(dateISO, obj) {
  FT.set(CURRENT_USER, `recovery_${dateISO}`, obj);
}

/* Muscle groups used by each workout */
const MUSCLE_MAP = {
  "Chest + Triceps + Core": ["chest", "arms", "core"],
  "Back + Biceps + Core": ["back", "arms", "core"],
  "Legs + Glutes": ["legs"],
  "Shoulders + Abs": ["shoulders", "core"],
  "Full-Body HIIT": ["legs", "core", "arms", "shoulders", "back", "chest"],
  "Core + Cardio": ["core"],
  "Rest / Recovery": []
};

/* Recovery decay: muscles recover X points per day */
const RECOVERY_DECAY = 35; // percent per day

/* Fatigue levels based on RPE */
function fatigueFromRPE(rpe) {
  if (rpe <= 4) return 15;  // light
  if (rpe <= 6) return 25;  // medium
  if (rpe <= 8) return 40;  // heavy
  return 55;                // max
}

/* ------------------------------------------
   Apply fatigue from a completed workout
------------------------------------------- */

function applyWorkoutFatigue(dateISO, workoutName, rpe) {
  const rec = getRecovery(dateISO);
  const muscles = MUSCLE_MAP[workoutName] || [];
  const fatigue = fatigueFromRPE(rpe);

  muscles.forEach(m => {
    rec[m] = Math.min(100, rec[m] + fatigue);
  });

  saveRecovery(dateISO, rec);
}

/* ------------------------------------------
   Daily Recovery Reset (next day decay)
------------------------------------------- */

function decayPreviousRecovery(dateISO) {
  const prev = getRecovery(dateISO);
  
  const keys = Object.keys(prev);
  keys.forEach(k => {
    prev[k] = Math.max(0, prev[k] - RECOVERY_DECAY);
  });

  saveRecovery(dateISO, prev);
}

/* ------------------------------------------
   Recommendation Engine
------------------------------------------- */

function recoveryRecommendation(todayISO) {
  const rec = getRecovery(todayISO);
  let output = [];

  Object.keys(rec).forEach(m => {
    const v = rec[m];

    if (v < 30) {
      output.push({ muscle: m, status: "Train", color: "#7cffb2" });
    } else if (v < 60) {
      output.push({ muscle: m, status: "Caution", color: "#ffd24d" });
    } else {
      output.push({ muscle: m, status: "Rest", color: "#ff6b6b" });
    }
  });

  return output;
}

/* ============================================================
   Inject RECOVERY BOX into the Exercise Page
   ============================================================ */

function renderRecoveryBox(workoutName) {
  const container = document.getElementById("exerciseContent");

  const todayISO = CURRENT_DATE;
  const rec = getRecovery(todayISO);
  const recList = recoveryRecommendation(todayISO);

  // Remove previous box if exists
  const old = document.getElementById("recoveryBox");
  if (old) old.remove();

  const box = document.createElement("div");
  box.className = "exercise-plan";
  box.id = "recoveryBox";

  box.innerHTML = `
    <h3 style="margin-bottom:10px;">Muscle Recovery Status</h3>
    ${recList.map(r => `
      <div class="food-option" style="justify-content:space-between;">
        <div style="text-transform:capitalize;">${r.muscle}</div>
        <div style="color:${r.color};font-weight:700;">${r.status}</div>
      </div>
    `).join("")}

    <div style="margin-top:14px;">
      <strong>Today's workout:</strong> ${workoutName}
    </div>

    <div class="food-option" style="margin-top:10px;">
      <label style="flex:1;">RPE used:</label>
      <div><strong>${FT.get(CURRENT_USER, `rpe_${todayISO}`, 6)}</strong></div>
    </div>
  `;

  container.prepend(box);
}

/* ============================================================
   Hook into Exercise Save Flow (Chunk 3 Integration)
   ============================================================ */

function finalizeRecoveryForToday() {
  const iso = CURRENT_DATE;
  const workout = determineWorkoutNameForDate(iso);
  const rpe = FT.get(CURRENT_USER, `rpe_${iso}`, 6);

  // 1. Apply fatigue
  applyWorkoutFatigue(iso, workout, rpe);

  // 2. Tomorrow: decay old recovery (auto)
  //    When date changes, this will run automatically via renderController()
}

/* Run recovery box whenever Exercise tab opens */
document.querySelector("[data-tab='exercise']").addEventListener("click", () => {
  const wName = determineWorkoutNameForDate(CURRENT_DATE);
  renderRecoveryBox(wName);
});

/* Also after saving RPE */
document.addEventListener("saveRPE", () => {
  const wName = determineWorkoutNameForDate(CURRENT_DATE);
  renderRecoveryBox(wName);
});
/* ============================================================
   CHUNK 7 — SUGGESTIONS ENGINE (Daily Coaching)
   Shows recommendations based on:
   - Calories eaten
   - Net weekly calories
   - Recovery fatigue
   - Workout intensity (difficulty)
   - RPE
   - Hydration
   - Weight progress
   ============================================================ */

function getTodayCals() {
  return FT.get(CURRENT_USER, `cals_${CURRENT_DATE}`, 0);
}

function getTodayBurn() {
  const ex = getExerciseState(CURRENT_DATE);
  if (!ex) return 0;
  return ex.sessionBurn || 0;
}

function getTodayHydration() {
  return FT.get(CURRENT_USER, `hydration_${CURRENT_DATE}`, { current: 0 }).current;
}

function getWeeklyNetCalories() {
  const s = weeklySummary(CURRENT_DATE);
  return s.net;
}

function getTodayRPE() {
  return FT.get(CURRENT_USER, `rpe_${CURRENT_DATE}`, 6);
}

function getRecoveryLevels() {
  return getRecovery(CURRENT_DATE);
}

function getLastRecordedWeight() {
  let last = null;
  for (let w = 10; w >= 1; w--) {
    const val = getWeight(w);
    if (val !== null) {
      last = val;
      break;
    }
  }
  return last;
}

/* ============================================================
   Build Suggestions
   ============================================================ */

function generateDailySuggestions() {
  const cals = getTodayCals();
  const burn = getTodayBurn();
  const hydration = getTodayHydration();
  const netWeekly = getWeeklyNetCalories();
  const rpe = getTodayRPE();
  const recovery = getRecoveryLevels();
  const weight = getLastRecordedWeight();

  let tips = [];

  /* ----- CALORIE GUIDANCE ----- */
  if (cals < 1500) {
    tips.push("• Your calories are low today — add +150 to +200 kcal to avoid muscle loss.");
  } else if (cals > 2300) {
    tips.push("• You are above your daily target — reduce dinner portion slightly.");
  } else {
    tips.push("• Perfect calorie intake range today.");
  }

  /* ----- NET WEEKLY CALORIES ----- */
  if (netWeekly > 2000) {
    tips.push("• Your weekly net is too high — tighten food intake for 2 days.");
  } else if (netWeekly < -2500) {
    tips.push("• Your deficit is large — eat +100 kcal tomorrow to maintain energy.");
  } else {
    tips.push("• Weekly net calories are on target.");
  }

  /* ----- HYDRATION ----- */
  if (hydration < 1500) {
    tips.push("• Drink at least +1 more bottle of water today.");
  } else {
    tips.push("• Hydration level looks good.");
  }

  /* ----- RPE FATIGUE ----- */
  if (rpe >= 8) {
    tips.push("• Today's RPE was high — consider light cardio or stretching tomorrow.");
  }

  /* ----- MUSCLE RECOVERY ----- */
  Object.keys(recovery).forEach(m => {
    if (recovery[m] >= 60) {
      tips.push(`• Your ${m} muscles need rest — avoid training them tomorrow.`);
    }
  });

  /* ----- WEIGHT TREND ----- */
  if (weight !== null) {
    const weekRange = getWeekRange(CURRENT_DATE);
    const target = 87 - ((weekRange.week - 1) * (10 / (TOTAL_WEEKS - 1)));

    if (weight > target + 0.5) {
      tips.push("• Your weight trend is behind target — reduce carbs by 30g tomorrow.");
    } else {
      tips.push("• Weight trend is within target — keep consistent.");
    }
  }

  return tips;
}

/* ============================================================
   Render Suggestions Box in Analysis Page
   ============================================================ */

function renderSuggestions() {
  const container = document.getElementById("analysisContent");

  // remove existing
  const old = document.getElementById("suggestBox");
  if (old) old.remove();

  const box = document.createElement("div");
  box.className = "summary-box";
  box.id = "suggestBox";

  const tips = generateDailySuggestions();

  box.innerHTML = `
    <h3 style="margin-bottom:10px;">Daily Suggestions</h3>
    ${tips.map(t => `<div class="summary-row"> ${t} </div>`).join("")}
  `;

  container.appendChild(box);
}

/* automatically render when opening Analysis tab */
document.querySelector("[data-tab='analysis']").addEventListener("click", () => {
  setTimeout(renderSuggestions, 70);
});
/* ============================================================
   CHUNK 8 — WEEKLY PDF GENERATOR
   Works by generating a printable HTML and triggering window.print()
   User saves it as PDF (mobile & desktop supported)
   ============================================================ */

function buildWeeklyPDFHTML(summary, suggestions, weight, macros, hydrationAvg, prs) {

  return `
    <html>
    <head>
      <title>Weekly Report - Week ${summary.week}</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto;
          padding: 20px;
          line-height: 1.4;
          color: #222;
        }
        h1 { margin-bottom: 6px; }
        h2 { margin-top: 18px; }
        .box {
          border: 1px solid #ccc;
          padding: 12px;
          border-radius: 8px;
          margin-top: 12px;
        }
        .row { margin: 4px 0; }
        ul { margin-top: 4px; }
      </style>
    </head>

    <body>

      <h1>Weekly Fitness Report</h1>
      <div>Week ${summary.week}: 
        ${summary.start.toDateString()} — ${summary.end.toDateString()}
      </div>
      <div><strong>User:</strong> ${CURRENT_USER}</div>

      <div class="box">
        <h2>Calories Summary</h2>
        <div class="row"><strong>Total Calories Eaten:</strong> ${summary.eaten}</div>
        <div class="row"><strong>Total Workout Burn:</strong> ${summary.burn}</div>
        <div class="row"><strong>Net Calories:</strong> ${summary.net}</div>
        <div class="row"><strong>Workout Sessions:</strong> ${summary.sessions}</div>
      </div>

      <div class="box">
        <h2>Weight Progress</h2>
        <div><strong>Last Recorded Weight:</strong> ${weight ? weight + " kg" : "Not logged"}</div>
      </div>

      <div class="box">
        <h2>Macros</h2>
        <div><strong>Protein:</strong> ${macros.macroProtein} g/day</div>
        <div><strong>Carbs:</strong> ${macros.macroCarbs} g/day</div>
        <div><strong>Fats:</strong> ${macros.macroFats} g/day</div>
      </div>

      <div class="box">
        <h2>Hydration</h2>
        <div><strong>Daily Average:</strong> ${hydrationAvg} ml</div>
      </div>

      <div class="box">
        <h2>Personal Records</h2>
        ${
          prs.length > 0 ?
          `<ul>
            ${prs.map(p => `<li>${p.name}: <strong>${p.weight} kg</strong></li>`).join("")}
          </ul>` :
          "No PRs logged"
        }
      </div>

      <div class="box">
        <h2>AI Suggestions Summary</h2>
        <ul>
          ${suggestions.map(s => `<li>${s}</li>`).join("")}
        </ul>
      </div>

    </body>
    </html>
  `;
}

/* ============================================================
   Convert Weekly Data → PDF via Print Dialog
   ============================================================ */

function generateWeeklyPDF() {

  const weekData = weeklySummary(CURRENT_DATE);
  const weightVal = getWeight(weekData.week);
  const profile = getProfile();
  const prs = getPRs();

  const suggestions = generateDailySuggestions();

  /* Hydration average (7 days) */
  let hydSum = 0, hydDays = 0;
  for (let d = new Date(weekData.start); d <= weekData.end; d.setDate(d.getDate() + 1)) {
    const iso = d.toISOString().split("T")[0];
    const hyd = getHydration(iso);
    if (hyd) {
      hydSum += hyd.current || 0;
      hydDays++;
    }
  }
  const hydrationAvg = hydDays > 0 ? Math.round(hydSum / hydDays) : 0;

  const html = buildWeeklyPDFHTML(
    weekData,
    suggestions,
    weightVal,
    profile,
    hydrationAvg,
    prs
  );

  const win = window.open("", "_blank");
  win.document.write(html);
  win.document.close();

  setTimeout(() => {
    win.print();
  }, 300);
}

/* ============================================================
   ADD BUTTON TO ANALYSIS PAGE
   ============================================================ */

function injectPDFButton() {
  const container = document.getElementById("analysisContent");
  if (!container) return;

  // remove previous button if exists
  const old = document.getElementById("pdfButton");
  if (old) old.remove();

  const btn = document.createElement("button");
  btn.id = "pdfButton";
  btn.textContent = "Download Weekly PDF";
  btn.className = "user-btn";
  btn.style = "width:100%; margin-top:16px; padding:12px;";

  btn.onclick = () => {
    generateWeeklyPDF();
  };

  container.appendChild(btn);
}

/* Inject automatically when entering Analysis tab */
document.querySelector("[data-tab='analysis']").addEventListener("click", () => {
  setTimeout(injectPDFButton, 120);
});
/* ============================================================
   CHUNK 9 — V3 → V4 MIGRATION ENGINE
   Imports v3 JSON and converts it into the new v4 format
   ============================================================ */

function migrateV3toV4(v3data, targetUser) {
  if (!v3data) return;

  console.log("Starting V3 → V4 migration...");

  // Ensure user data exists
  if (!STATE.users[targetUser]) {
    STATE.users[targetUser] = createEmptyUserState();
  }

  const u = STATE.users[targetUser];

  /* ==============================
     1 — MIGRATE COMPLETED DAYS
     ============================== */
  if (v3data.completedDays) {
    u.completedDays = { ...v3data.completedDays };
  }

  /* ==============================
     2 — MIGRATE MEALS (daily logs)
     ============================== */
  if (v3data.meals) {
    for (const dateKey in v3data.meals) {
      const entry = v3data.meals[dateKey];

      u.meals[dateKey] = {
        breakfast: entry.breakfast || { selected: [] },
        lunch: entry.lunch || { selected: [] },
        snack: entry.snack || { selected: [] },
        post: entry.post || { selected: [] },
        dinner: entry.dinner || { selected: [] },
        custom: entry.custom || []
      };
    }
  }

  /* ==============================
     3 — MIGRATE EXERCISES
     ============================== */
  if (v3data.exercises) {
    for (const dateKey in v3data.exercises) {
      const entry = v3data.exercises[dateKey];

      u.exercises[dateKey] = {};

      // Each exercise index with sets
      for (const exIdx in entry) {
        if (exIdx === "sessionBurn") continue;
        u.exercises[dateKey][exIdx] = entry[exIdx];
      }

      // session burn
      if (entry.sessionBurn) {
        u.exercises[dateKey].sessionBurn = entry.sessionBurn;
      }
    }
  }

  /* ==============================
     4 — MIGRATE WEIGHTS (weekly)
     ============================== */
  if (v3data.weights) {
    for (const w in v3data.weights) {
      u.weights[w] = v3data.weights[w];
    }
  }

  /* ==============================
     5 — MIGRATE NOTES
     ============================== */
  if (v3data.notes) {
    u.notes = { ...v3data.notes };
  }

  /* ==============================
     6 — MIGRATE STREAK
     ============================== */
  if (v3data.completedDays) {
    u.completedDays = { ...v3data.completedDays };
  }

  /* ==============================
     7 — HYDRATION & PROFILES DEFAULTS
     ============================== */
  if (!u.hydration) u.hydration = {};
  if (!u.profile) {
    u.profile = {
      macroProtein: 140,
      macroCarbs: 180,
      macroFats: 60,
      dailyWaterGoal: 2800
    };
  }

  /* ==============================
     8 — MIGRATE ANY UNKNOWN FIELDS SAFELY
     ============================== */
  for (const key in v3data) {
    if (
      key !== "meals" &&
      key !== "exercises" &&
      key !== "weights" &&
      key !== "completedDays" &&
      key !== "notes"
    ) {
      u[key] = v3data[key];
    }
  }

  console.log("Migration finished:", u);

  saveState();
  return true;
}

/* ============================================================
   FILE INPUT HANDLER FOR V3 BACKUP
   Automatically detects V3 structure and migrates it
   ============================================================ */

function importV3File(e) {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();

  reader.onload = function (ev) {
    try {
      const obj = JSON.parse(ev.target.result);

      // Detect if file is V3 format
      const isV3 =
        obj.meals ||
        obj.exercises ||
        obj.weights ||
        obj.completedDays;

      if (!isV3) {
        alert("❌ Not a valid V3 backup file.");
        return;
      }

      // Ask user where to migrate
      const targetUser = CURRENT_USER || "Aziz";

      const ok = confirm(
        `Import V3 data into user: ${targetUser}?\n\n` +
        `This will merge without deleting any V4 data.`
      );

      if (!ok) return;

      migrateV3toV4(obj, targetUser);

      alert("✅ V3 data imported successfully.");
      location.reload();

    } catch (err) {
      console.error(err);
      alert("❌ Invalid JSON file.");
    }
  };

  reader.readAsText(file);
}

/* ============================================================
   ADD IMPORT BUTTON INTO DRAWER
   ============================================================ */

function injectV3ImportButton() {
  const drawer = document.getElementById("drawer");
  if (!drawer) return;

  const existing = document.getElementById("importV3Btn");
  if (existing) return;

  const btn = document.createElement("label");
  btn.id = "importV3Btn";
  btn.className = "drawer-item";
  btn.style.cursor = "pointer";
  btn.innerHTML = `
    📥 Import V3 Backup
    <input id="importV3File" type="file" accept="application/json" style="display:none;" />
  `;

  drawer.insertBefore(btn, drawer.firstChild.nextSibling);

  document.getElementById("importV3File")
    .addEventListener("change", importV3File);
}

// Auto-add button on page load
setTimeout(injectV3ImportButton, 500);
