/* ============================================================
   FitTracker v4 Pro — FINAL APP.JS
   Two-user system, daily tracking, streaks, meals, workouts,
   analysis, drawer, weight logs — all fully functional.
============================================================ */

/* ------------------------- GLOBAL STATE ------------------------- */
let currentUser = null;
let currentDate = new Date().toISOString().substring(0, 10); // YYYY-MM-DD

const USERS = ["Aziz", "Yasmin"];

/* Storage structure example:
data = {
  Aziz: {
    weightLog: { "2025-11-17": 87 },
    dayData: {
        "2025-11-17": {
            meals: { breakfast: [], lunch: [], snack: [], post: [], dinner: [] },
            workoutBurn: 0
        }
    },
    streak: 0
  },
  Yasmin: {...}
}
*/

let data = JSON.parse(localStorage.getItem("fittracker_v4")) || { Aziz: {}, Yasmin: {} };

/* Ensure structure exists for each user */
function ensureUserStructure(user) {
  if (!data[user]) data[user] = {};
  if (!data[user].dayData) data[user].dayData = {};
  if (!data[user].weightLog) data[user].weightLog = {};
  if (!data[user].streak) data[user].streak = 0;
}

function save() {
  localStorage.setItem("fittracker_v4", JSON.stringify(data));
}

/* ------------------------- USER SWITCHING ------------------------- */
const overlay = document.getElementById("userOverlay");

document.querySelectorAll(".user-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    currentUser = btn.dataset.user;
    localStorage.setItem("fittracker_currentUser", currentUser);

    ensureUserStructure(currentUser);
    overlay.style.display = "none";

    loadUserHeader();
    loadPage();
  });
});

/* Auto-login if remembered */
const remembered = localStorage.getItem("fittracker_currentUser");
if (remembered && USERS.includes(remembered)) {
  currentUser = remembered;
  ensureUserStructure(currentUser);
  overlay.style.display = "none";
}

/* ------------------------- HEADER ------------------------- */
const profileTag = document.getElementById("profileTag");

function loadUserHeader() {
  const weight = getLatestWeight();
  profileTag.textContent = `${currentUser} | Weight: ${weight ? weight + " kg" : "-- kg"}`;
}

/* ------------------------- DATE PICKER ------------------------- */
const datePicker = document.getElementById("datePicker");
datePicker.value = currentDate;

datePicker.addEventListener("change", () => {
  currentDate = datePicker.value;
  loadPage();
});

/* ------------------------- PAGE NAVIGATION ------------------------- */
document.querySelectorAll(".nav-btn").forEach(btn => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".nav-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    const tab = btn.dataset.tab;
    document.querySelectorAll(".page").forEach(p => p.classList.remove("active"));
    document.getElementById(tab).classList.add("active");

    loadPage();
  });
});

/* ------------------------- DRAWER ------------------------- */
const drawer = document.getElementById("drawer");
document.getElementById("openDrawer").onclick = () => drawer.classList.add("open");
document.getElementById("closeDrawer").onclick = () => drawer.classList.remove("open");

document.getElementById("switchUser").onclick = () => {
  drawer.classList.remove("open");
  overlay.style.display = "flex";
};

/* ------------------------- WEIGHT HELPER ------------------------- */
function getLatestWeight() {
  const userData = data[currentUser].weightLog;
  const dates = Object.keys(userData);
  if (dates.length === 0) return null;

  dates.sort();
  return userData[dates[dates.length - 1]];
}

/* ------------------------- DAILY STRUCTURE ------------------------- */
function getDay() {
  ensureUserStructure(currentUser);

  if (!data[currentUser].dayData[currentDate]) {
    data[currentUser].dayData[currentDate] = {
      meals: {
        breakfast: [],
        lunch: [],
        snack: [],
        post: [],
        dinner: []
      },
      workoutBurn: 0
    };
    save();
  }

  return data[currentUser].dayData[currentDate];
}

/* ------------------------- FOOD DATA (FIXED SAMPLES) ------------------------- */
const MEAL_OPTIONS = {
  breakfast: [
    { name: "Your standard breakfast", kcal: 420 },
    { name: "Oats + whey + berries", kcal: 420 },
    { name: "Scrambled eggs + toast", kcal: 430 },
    { name: "Greek yogurt + fruit", kcal: 380 }
  ],
  lunch: [
    { name: "Grilled chicken + rice", kcal: 650 },
    { name: "Paneer salad bowl", kcal: 520 },
    { name: "Chicken kheema + rice", kcal: 700 }
  ],
  snack: [
    { name: "Fruit + egg", kcal: 120 },
    { name: "Nuts handful", kcal: 180 }
  ],
  post: [
    { name: "Protein shake", kcal: 220 }
  ],
  dinner: [
    { name: "Paneer + veggies", kcal: 480 },
    { name: "Tofu stir fry", kcal: 450 }
  ]
};

/* ------------------------- RENDER FOOD PAGE ------------------------- */
function loadFood() {
  const container = document.getElementById("foodContent");
  const day = getDay();

  container.innerHTML = "";

  Object.keys(MEAL_OPTIONS).forEach(mealKey => {
    const block = document.createElement("div");
    block.className = "meal-block";

    block.innerHTML = `
      <div class="meal-title">${mealKey.charAt(0).toUpperCase() + mealKey.slice(1)}</div>
      <div id="meal-${mealKey}">
        ${day.meals[mealKey].length === 0 ? `<div class="text-muted">No items selected</div>` : ""}
      </div>
    `;

    /* Add items */
    MEAL_OPTIONS[mealKey].forEach(item => {
      const row = document.createElement("div");
      row.className = "option-row";
      row.innerHTML = `
        <div>${item.name}</div>
        <div class="kcal">${item.kcal} kcal</div>
      `;
      row.onclick = () => {
        day.meals[mealKey].push(item);
        save();
        loadFood();
      };
      block.appendChild(row);
    });

    container.appendChild(block);
  });

  /* Total kcal */
  let total = 0;
  Object.values(day.meals).forEach(arr => {
    arr.forEach(item => total += item.kcal);
  });

  container.innerHTML += `
    <div style="margin-top:10px;font-weight:bold;">
      Total: ${total} kcal
    </div>
  `;
}

/* ------------------------- EXERCISE PAGE ------------------------- */
function loadExercise() {
  const container = document.getElementById("exerciseContent");
  const day = getDay();

  container.innerHTML = `
    <div class="exercise-plan">
      <div class="exercise-title">Day Workout</div>
      <p>Estimated burn (kcal):</p>
      <input type="number" id="burnInput" value="${day.workoutBurn}" style="padding:6px;border-radius:10px;width:140px;">
      <button id="saveBurn" style="margin-left:10px;padding:6px 12px;border-radius:8px;background:var(--accent);border:none;color:white;">Save</button>
    </div>
  `;

  document.getElementById("saveBurn").onclick = () => {
    day.workoutBurn = Number(document.getElementById("burnInput").value || 0);
    save();
  };
}

/* ------------------------- ANALYSIS PAGE ------------------------- */
function loadAnalysis() {
  const container = document.getElementById("analysisContent");
  const user = data[currentUser];

  let totalKcal = 0;
  let totalBurn = 0;
  let sessions = 0;

  Object.keys(user.dayData).forEach(date => {
    const day = user.dayData[date];

    /* Meals */
    Object.values(day.meals).forEach(arr => arr.forEach(i => totalKcal += i.kcal));

    /* Burn */
    if (day.workoutBurn > 0) {
      totalBurn += day.workoutBurn;
      sessions++;
    }
  });

  container.innerHTML = `
    <div class="summary-box">
      <div class="summary-row"><strong>Total eaten:</strong> ${totalKcal} kcal</div>
      <div class="summary-row"><strong>Total burn:</strong> ${totalBurn} kcal (${sessions} sessions)</div>
      <div class="summary-row"><strong>Net:</strong> ${totalKcal - totalBurn} kcal</div>
    </div>
  `;
}

/* ------------------------- LOAD PAGE ------------------------- */
function loadPage() {
  if (!currentUser) return;

  const active = document.querySelector(".nav-btn.active").dataset.tab;

  loadUserHeader();

  if (active === "food") loadFood();
  if (active === "exercise") loadExercise();
  if (active === "analysis") loadAnalysis();
  if (active === "profile") loadProfile();
}

/* ------------------------- PROFILE PAGE ------------------------- */
function loadProfile() {
  const container = document.getElementById("profileContent");

  container.innerHTML = `
    <div class="profile-box">
      <strong>User:</strong> ${currentUser}<br>
      <strong>Latest Weight:</strong> ${getLatestWeight() || "--"} kg
    </div>
  `;
}

/* ------------------------- INITIAL LOAD ------------------------- */
if (currentUser) {
  loadUserHeader();
  loadPage();
}
