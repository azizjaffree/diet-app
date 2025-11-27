/* features/macros.js
   Simple macros + calorie target module
   Exposes: Macros.init(), Macros.render(container)
*/
const Macros = (function () {
  const KEY = "ft_macros";

  function defaultProfile() {
    return {
      sex: "male",
      age: 30,
      weightKg: 75,
      heightCm: 175,
      activity: 1.375, // light active
      goal: "maintain", // deficit/surplus/maintain
      calorieTarget: null,
      macros: { proteinPct: 30, carbsPct: 40, fatPct: 30 }
    };
  }

  function get() {
    return FT.get(KEY, defaultProfile());
  }
  function set(v) { FT.set(KEY, v); }

  // Mifflin-St Jeor BMR
  function bmr(profile) {
    const { sex, weightKg, heightCm, age } = profile;
    let base = 10 * weightKg + 6.25 * heightCm - 5 * age;
    base += sex === "male" ? 5 : -161;
    return Math.round(base);
  }

  function tdee(profile) {
    return Math.round(bmr(profile) * profile.activity);
  }

  function computeTargets(profile) {
    const baseTDEE = tdee(profile);
    let calorieTarget = baseTDEE;
    if (profile.goal === "deficit") calorieTarget = Math.round(baseTDEE * 0.85);
    if (profile.goal === "surplus") calorieTarget = Math.round(baseTDEE * 1.1);
    // allow override
    profile.calorieTarget = profile.calorieTarget || calorieTarget;
    // macros grams
    const p = profile.macros.proteinPct / 100;
    const c = profile.macros.carbsPct / 100;
    const f = profile.macros.fatPct / 100;
    const proteinG = Math.round((profile.calorieTarget * p) / 4);
    const carbsG = Math.round((profile.calorieTarget * c) / 4);
    const fatG = Math.round((profile.calorieTarget * f) / 9);
    return { calorieTarget: profile.calorieTarget, proteinG, carbsG, fatG, baseTDEE };
  }

  function saveProfileFromForm(form) {
    const profile = get();
    profile.sex = form.sex.value;
    profile.age = Number(form.age.value) || profile.age;
    profile.weightKg = Number(form.weight.value) || profile.weightKg;
    profile.heightCm = Number(form.height.value) || profile.heightCm;
    profile.activity = Number(form.activity.value) || profile.activity;
    profile.goal = form.goal.value;
    profile.calorieTarget = form.calorieTarget.value ? Number(form.calorieTarget.value) : null;
    profile.macros.proteinPct = Number(form.proteinPct.value) || profile.macros.proteinPct;
    profile.macros.carbsPct = Number(form.carbsPct.value) || profile.macros.carbsPct;
    profile.macros.fatPct = Number(form.fatPct.value) || profile.macros.fatPct;
    set(profile);
  }

  function render(container) {
    const profile = get();
    const t = computeTargets(profile);
    container.innerHTML = `
      <div class="section">
        <h3>Profile & Targets</h3>
        <form id="macros-form">
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <label>Sex
              <select name="sex"><option value="male">Male</option><option value="female">Female</option></select>
            </label>
            <label>Age <input name="age" type="number" value="${profile.age}" style="width:80px"></label>
            <label>Weight kg <input name="weight" type="number" value="${profile.weightKg}" style="width:90px"></label>
            <label>Height cm <input name="height" type="number" value="${profile.heightCm}" style="width:90px"></label>
            <label>Activity
              <select name="activity">
                <option value="1.2">Sedentary</option>
                <option value="1.375">Light</option>
                <option value="1.55">Moderate</option>
                <option value="1.725">Very active</option>
              </select>
            </label>
            <label>Goal
              <select name="goal">
                <option value="maintain">Maintain</option>
                <option value="deficit">Lose</option>
                <option value="surplus">Gain</option>
              </select>
            </label>
            <label>Calorie override <input name="calorieTarget" type="number" placeholder="optional" style="width:120px"></label>
          </div>
          <div style="margin-top:8px">
            Macros % — Protein <input name="proteinPct" type="number" value="${profile.macros.proteinPct}" style="width:70px"> 
            Carbs <input name="carbsPct" type="number" value="${profile.macros.carbsPct}" style="width:70px"> 
            Fat <input name="fatPct" type="number" value="${profile.macros.fatPct}" style="width:70px">
          </div>
          <div style="margin-top:10px">
            <button id="save-macros" type="button">Save</button>
          </div>
        </form>
        <div style="margin-top:12px">
          <strong>BMR:</strong> ${bmr(profile)} kcal · <strong>TDEE:</strong> ${t.baseTDEE} kcal<br>
          <strong>Target calories:</strong> ${t.calorieTarget} kcal<br>
          <strong>Macros:</strong> ${t.proteinG} g protein • ${t.carbsG} g carbs • ${t.fatG} g fat
        </div>
      </div>
    `;

    // set selects to current values
    const form = container.querySelector("#macros-form");
    form.sex.value = profile.sex;
    form.activity.value = profile.activity;
    form.goal.value = profile.goal;
    form.proteinPct.value = profile.macros.proteinPct;
    form.carbsPct.value = profile.macros.carbsPct;
    form.fatPct.value = profile.macros.fatPct;
    if (profile.calorieTarget) form.calorieTarget.value = profile.calorieTarget;

    container.querySelector("#save-macros").addEventListener("click", () => {
      saveProfileFromForm(form);
      const refreshed = get();
      const newts = computeTargets(refreshed);
      // simple re-render of this container
      render(container);
      alert("Saved macros & profile.");
    });
  }

  function init() {
    const p = get();
    set(p); // ensure defaults exist
  }

  return { init, render, get, set, computeTargets };
})();
