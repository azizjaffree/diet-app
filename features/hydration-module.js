/* features/hydration.js */
const Hydration = (function () {
  const KEY = "ft_hydration"; // object keyed by date

  function todayKey() {
    return new Date().toISOString().slice(0, 10);
  }
  function getAll() { return FT.get(KEY, {}); }
  function saveAll(o) { FT.set(KEY, o); }

  function add(amountMl) {
    const all = getAll();
    const d = todayKey();
    all[d] = all[d] || { goalMl: 3000, drank: 0 };
    all[d].drank = (all[d].drank || 0) + Number(amountMl);
    saveAll(all);
  }
  function setGoal(ml) {
    const all = getAll();
    const d = todayKey();
    all[d] = all[d] || { goalMl: ml, drank: 0 };
    all[d].goalMl = ml;
    saveAll(all);
  }

  function render(container) {
    const all = getAll();
    const d = todayKey();
    const today = all[d] || { goalMl: 3000, drank: 0 };
    const pct = Math.min(100, Math.round((today.drank / today.goalMl) * 100));
    container.innerHTML = `
      <div class="section">
        <h3>Hydration</h3>
        <p>Goal: <strong>${today.goalMl} ml</strong> · Drank: <strong>${today.drank} ml</strong> (${pct}%)</p>
        <div style="height:10px;background:#222;border-radius:6px;overflow:hidden;margin-bottom:10px">
          <div style="width:${pct}%;height:100%;background:linear-gradient(90deg,#6ee7b7,#34d399)"></div>
        </div>

        <div style="display:flex;gap:8px;flex-wrap:wrap">
          <button id="add-250" type="button">+250 ml</button>
          <button id="add-500" type="button">+500 ml</button>
          <button id="reset-h" type="button">Reset</button>
          <label>Set goal <input id="set-goal" type="number" placeholder="ml" style="width:100px"></label>
        </div>
      </div>
    `;
    container.querySelector("#add-250").onclick = () => { add(250); render(container); };
    container.querySelector("#add-500").onclick = () => { add(500); render(container); };
    container.querySelector("#reset-h").onclick = () => {
      const all = getAll(); all[d] = { goalMl: today.goalMl, drank: 0 }; saveAll(all); render(container);
    };
    container.querySelector("#set-goal").onchange = (e) => {
      const val = Number(e.target.value) || today.goalMl;
      setGoal(val); render(container);
    };
  }

  function init() {
    const all = getAll();
    const d = todayKey();
    if (!all[d]) {
      all[d] = { goalMl: 3000, drank: 0 }; saveAll(all);
    }
  }

  return { init, render, add, setGoal };
})();
