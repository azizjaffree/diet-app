/* ============================================================
   FITTRACKER V4 — CORE ENGINE
   Modular, Offline-First, PWA Ready
   ============================================================ */

const log = (...a) => console.log("[FT]", ...a);

/* ---------- Local Storage Wrapper ---------- */
const FT = {
  get(key, fallback = null) {
    try {
      return JSON.parse(localStorage.getItem(key)) ?? fallback;
    } catch {
      return fallback;
    }
  },

  set(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  },

  push(key, value) {
    const arr = FT.get(key, []);
    arr.push(value);
    FT.set(key, arr);
  },

  clear(key) {
    localStorage.removeItem(key);
  }
};

/* ---------- App State ---------- */
const state = {
  today: new Date().toISOString().slice(0, 10),
  view: "food", // default tab
  user: FT.get("user", { name: "Aziz" }),
};

/* ---------- Router / Views ---------- */
function loadView(view) {
  state.view = view;
  FT.set("lastView", view);
  document.querySelectorAll(".tab").forEach(t => t.classList.remove("active"));
  const tabEl = document.querySelector(`#tab-${view}`);
  if (tabEl) tabEl.classList.add("active");

  const screen = document.getElementById("screen");
  if (!screen) return console.warn("No #screen element");
  screen.innerHTML = "";

  // Food view (enhanced)
  if (view === "food") {
    // 1. Macros Summary
    if (typeof Macros !== "undefined" && Macros.render) Macros.render(screen);

    // 2. Hydration
    if (typeof Hydration !== "undefined" && Hydration.render) Hydration.render(screen);

    // 3. Calorie AI panel (new)
    if (typeof CalorieAI !== "undefined" && CalorieAI.render) {
      const aiBox = document.createElement("div");
      screen.appendChild(aiBox);
      CalorieAI.render(aiBox);
    }

    // 4. Meals
    renderFood();

    // 5. Quick Add FAB (makes it visible only on Food tab)
    const fab = document.getElementById("fab-add");
    if (fab) fab.style.display = "block";
    return;
  } else {
    const fab = document.getElementById("fab-add");
    if (fab) fab.style.display = "none";
  }

  // Exercise view
  if (view === "exercise") {
    if (typeof PRTracking !== "undefined" && PRTracking.render) PRTracking.render(screen);
    if (typeof Recovery !== "undefined" && Recovery.render) Recovery.render(screen);
    return;
  }

  // Analysis view
  if (view === "analysis") {
    const el = document.createElement("div");
    screen.appendChild(el);
    if (typeof Macros !== "undefined" && Macros.render) Macros.render(el);
    if (typeof Hydration !== "undefined" && Hydration.render) Hydration.render(el);
    renderAnalysis();
    return;
  }

  // Profile view
  if (view === "profile") {
    const el = document.createElement("div");
    screen.appendChild(el);
    if (typeof ExportImport !== "undefined" && ExportImport.render) ExportImport.render(el);
    renderProfile();
    return;
  }
}

/* ---------- Food View Rendering ---------- */
function renderFood() {
  const screen = document.getElementById("screen");

  const meals = FT.get("meals", {
    breakfast: [],
    lunch: [],
    snack: [],
    dinner: []
  });

  const html = `
    <h2>Food</h2>
    <div class="section">
      <h3>Breakfast</h3>
      ${meals.breakfast.map(m => itemRow(m)).join("")}
    </div>

    <div class="section">
      <h3>Lunch</h3>
      ${meals.lunch.map(m => itemRow(m)).join("")}
    </div>

    <div class="section">
      <h3>Snack</h3>
      ${meals.snack.map(m => itemRow(m)).join("")}
    </div>

    <div class="section">
      <h3>Dinner</h3>
      ${meals.dinner.map(m => itemRow(m)).join("")}
    </div>
  `;

  screen.insertAdjacentHTML("beforeend", html);
}

function itemRow(m) {
  return `
    <div class="item-row">
      <span>${escapeHtml(m.name)}</span>
      <span class="kcal">${m.kcal} kcal</span>
    </div>
  `;
}

/* ---------- Exercise View ---------- */
function renderExercise() {
  const screen = document.getElementById("screen");
  screen.innerHTML = `
    <h2>Exercise</h2>
    <p>Coming in V4: PR tracker, workout logger, strength graph.</p>
  `;
}

/* ---------- Analysis ---------- */
function renderAnalysis() {
  const screen = document.getElementById("screen");
  const logs = FT.get("calorie-log", {});
  const today = logs[state.today] ?? { target: 1900, eaten: 0 };

  screen.insertAdjacentHTML("beforeend", `
    <h2>Daily Analysis</h2>
    <p><strong>Date:</strong> ${state.today}</p>
    <p><strong>Calories Target:</strong> ${today.target}</p>
    <p><strong>Eaten:</strong> ${today.eaten}</p>
  `);
}

/* ---------- Profile ---------- */
function renderProfile() {
  const screen = document.getElementById("screen");
  screen.insertAdjacentHTML("beforeend", `
    <h2>Profile</h2>
    <p>User: ${escapeHtml(state.user.name)}</p>
  `);
}

/* ---------- Quick Add Modal + helpers ---------- */
function openQuickAddModal() {
  // Prevent duplicate overlays
  if (document.getElementById("quick-add-overlay")) return;

  const overlay = document.createElement("div");
  overlay.id = "quick-add-overlay";
  overlay.style = `
      position: fixed; inset: 0; 
      background: rgba(0,0,0,0.7);
      backdrop-filter: blur(4px);
      display: flex;
      justify-content:center;
      align-items:center;
      z-index: 9999;
  `;

  overlay.innerHTML = `
      <div style="
          background: var(--card2);
          padding: 20px;
          border-radius: 14px;
          width: 90%; max-width: 420px;
          border: 1px solid var(--border);
      ">
          <h3>Quick Add Food</h3>
          <textarea id="qa-input" placeholder="e.g. 150g chicken breast"
              style="width:100%;height:60px;margin-top:8px"></textarea>

          <button id="qa-mic" style="margin-top:8px;width:100%">🎤 Speak</button>
          <button id="qa-est" style="margin-top:8px;width:100%">Estimate</button>
          
          <div id="qa-result" style="margin-top:10px"></div>

          <div id="qa-add-buttons" style="margin-top:12px;display:none;gap:6px;display:flex;flex-wrap:wrap">
              <button data-meal="breakfast">Add to Breakfast</button>
              <button data-meal="lunch">Add to Lunch</button>
              <button data-meal="snack">Add to Snack</button>
              <button data-meal="dinner">Add to Dinner</button>
          </div>

          <button style="margin-top:14px;width:100%" id="qa-close">Close</button>
      </div>
  `;

  document.body.appendChild(overlay);

  // ESTIMATE
  overlay.querySelector("#qa-est").onclick = () => {
    const text = overlay.querySelector("#qa-input").value.trim();
    if (!text) return alert("Enter something");
    const res = CalorieAI.estimateFromText(text);

    overlay.querySelector("#qa-result").innerHTML =
      `<strong>${res.kcal} kcal • ${res.protein}g</strong><br><small>${escapeHtml(res.note || "")}</small>`;

    overlay.querySelector("#qa-add-buttons").style.display = "flex";
  };

  // MEAL ADD
  overlay.querySelectorAll("#qa-add-buttons button").forEach(btn => {
    btn.onclick = () => {
      const meal = btn.dataset.meal;
      addFoodToMeal(meal, overlay.querySelector("#qa-input").value.trim());
      overlay.remove();
      loadView("food");
    };
  });

  // CLOSE
  overlay.querySelector("#qa-close").onclick = () => overlay.remove();

  // VOICE INPUT
  setupVoiceInput(overlay.querySelector("#qa-input"), overlay.querySelector("#qa-mic"));
}

function addFoodToMeal(meal, inputText) {
  if (!inputText) return;
  const res = CalorieAI.estimateFromText(inputText);
  const meals = FT.get("meals", { breakfast: [], lunch: [], snack: [], dinner: [] });

  meals[meal] = meals[meal] || [];
  meals[meal].push({
    name: inputText,
    kcal: res.kcal,
    protein: res.protein,
    ts: Date.now()
  });

  FT.set("meals", meals);
}

/* ---------- Voice support (Web Speech API) ---------- */
function setupVoiceInput(textarea, button) {
  // prefer standard API
  const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition || null;
  if (!SpeechRec) {
    if (button) button.style.display = "none";
    return;
  }

  const rec = new SpeechRec();
  rec.lang = "en-GB"; // UK-friendly by default
  rec.interimResults = false;
  rec.maxAlternatives = 1;

  if (button) {
    button.onclick = () => {
      try {
        rec.start();
        button.textContent = "🎙️ Listening...";
      } catch (e) {
        console.warn("Speech start error", e);
      }
    };
  }

  rec.onresult = (e) => {
    const t = (e.results && e.results[0] && e.results[0][0] && e.results[0][0].transcript) || "";
    if (textarea) textarea.value = t;
    if (button) button.textContent = "🎤 Speak";
  };

  rec.onend = () => {
    if (button) button.textContent = "🎤 Speak";
  };

  rec.onerror = (ev) => {
    console.warn("Speech recognition error", ev);
    if (button) button.textContent = "🎤 Speak";
  };
}

/* ---------- Init ---------- */
function init() {
  log("Initializing FitTracker V4...");

  
  const moduleNames = [
    "Macros",
    "Hydration",
    "ProgressPhotos",
    "PRTracking",
    "Recovery",
    "ExportImport",
    "CalorieAI"
  ];

  moduleNames
    .map(name => window[name])
    .filter(m => Boolean(m) && typeof m.init === "function")
    .forEach(m => {
      try { m.init(); }
      catch (err) { console.warn("Module init failed:", err); }
    });



  // restore last view
  const last = FT.get("lastView", "food");
  loadView(last);

  // attach tab click handlers
  document.querySelectorAll(".tab").forEach(tab => {
    tab.addEventListener("click", () => {
      const target = tab.dataset.view;
      loadView(target);
    });
  });

  // FAB hook (if present)
  const fab = document.getElementById("fab-add");
  if (fab) {
    fab.addEventListener("click", () => openQuickAddModal());
  }

  // set header date & username
  const ud = document.getElementById("today-date");
  if (ud) ud.textContent = new Date().toLocaleDateString();
  const un = document.getElementById("username");
  if (un) un.textContent = state.user.name || "User";
}

/* ---------- Utilities ---------- */
function escapeHtml(s) {
  return String(s || "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

window.addEventListener("load", init);
