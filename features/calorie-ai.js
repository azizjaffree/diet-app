/* features/calorie-ai.js
   Lightweight calorie estimation + suggestion module.
   Exposes CalorieAI.init(), CalorieAI.render(container), CalorieAI.estimateFromText(text)
*/

const CalorieAI = (function () {
  const KEY = "ft_calorie_ai_v1";

  /* ---------- Tiny food database (kcal per 100g or per unit) ----------
     Values are approximate. Add or adjust items as you like.
  */
  const FOOD_DB = {
  /* ----------------- Proteins: Meat / Poultry ----------------- */
  "chicken breast": { per: "g", valuePer100g: 165, proteinPer100g: 31 },
  "chicken thigh": { per: "g", valuePer100g: 209, proteinPer100g: 26 },
  "chicken whole (roast)": { per: "g", valuePer100g: 239, proteinPer100g: 27 },
  "mutton": { per: "g", valuePer100g: 294, proteinPer100g: 25 },
  "lamb": { per: "g", valuePer100g: 294, proteinPer100g: 25 },
  "beef (lean mince)": { per: "g", valuePer100g: 250, proteinPer100g: 26 },

  /* ----------------- Seafood ----------------- */
  "salmon": { per: "g", valuePer100g: 208, proteinPer100g: 20 },
  "prawns": { per: "g", valuePer100g: 99, proteinPer100g: 24 },
  "cod": { per: "g", valuePer100g: 82, proteinPer100g: 18 },
  "haddock": { per: "g", valuePer100g: 90, proteinPer100g: 19 },

  /* ----------------- Eggs & Dairy ----------------- */
  "egg": { per: "unit", valuePer100g: 143, proteinPer100g: 13, gramsPerUnit: 50 }, 
  "paneer": { per: "g", valuePer100g: 265, proteinPer100g: 18.3 },
  "tofu": { per: "g", valuePer100g: 76, proteinPer100g: 8 },
  "greek yogurt (plain)": { per: "g", valuePer100g: 59, proteinPer100g: 10 },

  /* ----------------- Lentils / Beans / Daal ----------------- */
  "red daal (cooked)": { per: "cup", valuePer100g: 116, proteinPer100g: 9, gramsPerCup: 198 },
  "urid daal (cooked)": { per: "cup", valuePer100g: 130, proteinPer100g: 11, gramsPerCup: 198 },
  "moong daal (cooked)": { per: "cup", valuePer100g: 105, proteinPer100g: 7, gramsPerCup: 198 },
  "chickpeas (boiled)": { per: "cup", valuePer100g: 164, proteinPer100g: 8.9, gramsPerCup: 164 },
  "rajma (kidney beans cooked)": { per: "cup", valuePer100g: 127, proteinPer100g: 8.7, gramsPerCup: 175 },

  /* ----------------- Oils & Fats ----------------- */
  "olive oil": { per: "ml", valuePer100g: 884/0.92, proteinPer100g: 0 }, 
  "sunflower oil": { per: "ml", valuePer100g: 884/0.92, proteinPer100g: 0 },
  "ghee": { per: "g", valuePer100g: 900, proteinPer100g: 0 },

  /* ----------------- Grains & Carbs ----------------- */
  "rice (cooked)": { per: "cup", valuePer100g: 130, proteinPer100g: 2.7, gramsPerCup: 158 },
  "basmati rice (cooked)": { per: "cup", valuePer100g: 121, proteinPer100g: 2.9, gramsPerCup: 158 },
  "oats (dry)": { per: "g", valuePer100g: 389, proteinPer100g: 17 },
  "bread (slice)": { per: "unit", valuePer100g: 265, proteinPer100g: 9, gramsPerUnit: 30 },

  /* ----------------- Fruits ----------------- */
  "banana": { per: "unit", valuePer100g: 89, proteinPer100g: 1.1, gramsPerUnit: 118 },
  "apple": { per: "unit", valuePer100g: 52, proteinPer100g: 0.3, gramsPerUnit: 182 },
  "orange": { per: "unit", valuePer100g: 47, proteinPer100g: 0.9, gramsPerUnit: 130 },
  "berries (mixed)": { per: "cup", valuePer100g: 57, proteinPer100g: 1, gramsPerCup: 148 },

  /* ----------------- Nuts ----------------- */
  "almonds": { per: "g", valuePer100g: 579, proteinPer100g: 21.2 },
  "cashews": { per: "g", valuePer100g: 553, proteinPer100g: 18 },
  "peanuts": { per: "g", valuePer100g: 567, proteinPer100g: 26 },

  /* ----------------- Protein Snacks ----------------- */
  "protein ice cream (whey)": { per: "g", valuePer100g: 150, proteinPer100g: 12 },
  "protein bar": { per: "unit", valuePer100g: 350, proteinPer100g: 30, gramsPerUnit: 60 },
  "whey protein scoop": { per: "unit", valuePer100g: 400, proteinPer100g: 80, gramsPerUnit: 30 },

  /* ----------------- Dishes / Meals ----------------- */
  "chicken biryani": { per: "g", valuePer100g: 165, proteinPer100g: 11 },
  "mutton biryani": { per: "g", valuePer100g: 195, proteinPer100g: 12 },
  "chicken curry": { per: "g", valuePer100g: 150, proteinPer100g: 12 },
  "mutton curry": { per: "g", valuePer100g: 180, proteinPer100g: 14 }
};


  /* ---------- Persistence ---------- */
  function getState() {
    return FT.get(KEY, { history: [] });
  }
  function saveState(s) {
    FT.set(KEY, s);
  }

  /* ---------- Parsing helpers ----------
     Accepts text like "200g chicken breast" or "1 cup rice" or "2 eggs" and returns estimate
  */
  function normalizeFoodName(name) {
    return name.toLowerCase().replace(/\s+/g, " ").trim();
  }

  function parseQuantityToken(tok) {
    // tok examples: "200g", "200 g", "1.5", "1/2", "2"
    tok = tok.replace(",", ".");
    if (tok.includes("/")) {
      const parts = tok.split("/").map(Number);
      if (parts.length === 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1]) && parts[1] !== 0) {
        return parts[0] / parts[1];
      }
    }
    const n = Number(tok);
    return Number.isFinite(n) ? n : null;
  }

  function estimateFromText(text) {
    // simple approach:
    // 1) find number + unit patterns (e.g., "200g chicken", "1 cup rice", "2 eggs")
    // 2) match the longest db key included in text
    // 3) compute calories accordingly
    const original = text.trim();
    const lower = original.toLowerCase();

    // find qty + unit patterns
    // patterns: (\d+(\.\d+)?)(\s*)(g|gram|grams|kg|cup|cups|tbsp|tsp|ml|l|egg|eggs|slice)
    const qtyRegex = /(\d+(\.\d+)?|\d+\/\d+)\s*(g|gram|grams|kg|cup|cups|tbsp|tablespoon|tsp|teaspoon|ml|l|slice|slices|egg|eggs|unit|units)/g;
    let match;
    const candidates = [];

    while ((match = qtyRegex.exec(lower)) !== null) {
      candidates.push({
        raw: match[0],
        qtyToken: match[1],
        unit: match[3]
      });
    }

    // fallback: try a simple "2 eggs" style, already covered above.
    // find best matching food key by checking presence
    const foodKeys = Object.keys(FOOD_DB);
    // match the longest key that exists in the string
    let bestKey = null;
    for (const k of foodKeys) {
      if (lower.includes(k) && (!bestKey || k.length > bestKey.length)) bestKey = k;
    }

    // If no explicit qty, attempt 1 unit
    let qty = null, unit = null;
    if (candidates.length > 0) {
      // pick last candidate (closest to food name usually)
      const c = candidates[candidates.length - 1];
      qty = parseQuantityToken(c.qtyToken);
      unit = c.unit;
    }

    // Utility: convert qty+unit to grams or ml when DB expects grams/cup/unit
    function computeKcalAndProteinForKey(key, qty, unit) {
      const meta = FOOD_DB[key];
      if (!meta) return null;
      // Determine grams represented by qty+unit
      let grams = null;
      let ml = null;
      // Normalize unit tokens
      const u = (unit || "").replace(/\s+/g, "");
      if (u === "g" || u === "gram" || u === "grams") {
        grams = qty;
      } else if (u === "kg") {
        grams = qty * 1000;
      } else if (u === "ml") {
        ml = qty;
      } else if (u === "l") {
        ml = qty * 1000;
      } else if (u === "cup" || u === "cups") {
        // try to use gramsPerCup if defined
        if (meta.gramsPerCup) grams = qty * meta.gramsPerCup;
        else grams = qty * 150; // fallback
      } else if (u === "slice" || u === "slices" || u === "unit" || u === "units" || u === "egg" || u === "eggs") {
        if (meta.gramsPerUnit) grams = qty * meta.gramsPerUnit;
        else {
          // if DB is unit-based (per unit), treat qty as units
          if (meta.per === "unit") {
            const kcalPerUnit = Math.round((meta.valuePer100g / 100) * (meta.gramsPerUnit || 1));
            const proteinPerUnit = Math.round((meta.proteinPer100g / 100) * (meta.gramsPerUnit || 1));
            return { kcal: Math.round(kcalPerUnit * qty), protein: Math.round(proteinPerUnit * qty) };
          }
          grams = qty * 100; // guess
        }
      } else {
        // unknown unit: assume unit count
        if (meta.per === "unit" && meta.gramsPerUnit) grams = qty * meta.gramsPerUnit;
        else grams = qty * 100; // guess fallback
      }

      // compute
      if (grams !== null) {
        // calorie calculation: valuePer100g
        const kcal = Math.round((meta.valuePer100g * grams) / 100);
        const protein = meta.proteinPer100g ? Math.round((meta.proteinPer100g * grams) / 100) : 0;
        return { kcal, protein };
      }
      if (ml !== null) {
        // approximate using density ~1g/ml for many foods (rough)
        const kcal = Math.round((meta.valuePer100g * ml) / 100);
        const protein = meta.proteinPer100g ? Math.round((meta.proteinPer100g * ml) / 100) : 0;
        return { kcal, protein };
      }
      return null;
    }

    let result = { kcal: 0, protein: 0, description: original, note: "" };

    if (bestKey) {
      // If we have a candidate qty, use it; otherwise assume 1 unit or 100g
      if (qty && unit) {
        const est = computekcalAndProteinForKey(bestKey, qty, unit);
        if (est) { result.kcal = est.kcal; result.protein = est.protein; result.note = `${qty} ${unit} ${bestKey}`; }
      } else {
        // no qty: choose sensible default
        const meta = FOOD_DB[bestKey];
        if (meta.per === "g") {
          const est = computekcalAndProteinForKey(bestKey, 100, "g");
          result.kcal = est.kcal; result.protein = est.protein; result.note = `100 g ${bestKey}`;
        } else if (meta.per === "cup") {
          const est = computekcalAndProteinForKey(bestKey, 1, "cup");
          result.kcal = est.kcal; result.protein = est.protein; result.note = `1 cup ${bestKey}`;
        } else if (meta.per === "unit") {
          const est = computekcalAndProteinForKey(bestKey, 1, "unit");
          result.kcal = est.kcal; result.protein = est.protein; result.note = `1 unit ${bestKey}`;
        } else {
          // generic fallback
          const est = computekcalAndProteinForKey(bestKey, 100, "g");
          if (est) { result.kcal = est.kcal; result.protein = est.protein; result.note = `100 g ${bestKey}`; }
        }
      }
    } else {
      // No DB match: try to parse a direct number "300 kcal" or "300kcal" in text
      const kcalDirect = lower.match(/(\d+)\s*kcal/);
      if (kcalDirect) {
        result.kcal = Number(kcalDirect[1]);
        result.note = "user kcal";
      } else {
        // fallback: try to find any number and assume grams of a generic food ~150 kcal/100g
        const num = lower.match(/(\d+(\.\d+)?)/);
        if (num) {
          const n = parseFloat(num[1]);
          // guess: if number < 20, maybe unit count -> assume 1 unit* n * 100 kcal
          if (n < 20) {
            result.kcal = Math.round(n * 100);
            result.note = "heuristic units -> kcal";
          } else {
            // assume grams
            result.kcal = Math.round((150 * n) / 100);
            result.note = "heuristic grams -> kcal";
          }
        } else {
          result.note = "no-match";
          result.kcal = 0;
          result.protein = 0;
        }
      }
    }

    // store in history
    const s = getState();
    s.history = s.history || [];
    s.history.unshift({ ts: Date.now(), input: original, estimate: result });
    if (s.history.length > 60) s.history.pop();
    saveState(s);

    return result;
  }

  /* ---------- Suggestion / target helpers ---------- */
  function suggestDailyPlanFromProfile() {
    // uses Macros.computeTargets() if available
    if (typeof Macros === "undefined" || !Macros.get) {
      return { ok: false, message: "Macros module not available" };
    }
    const profile = Macros.get();
    const targets = Macros.computeTargets(profile);
    // build a simple 4-meal split (protein-first)
    // allocate protein grams across meals evenly
    const meals = ["Breakfast", "Lunch", "Snack", "Dinner"];
    const perMealProtein = Math.round(targets.proteinG / meals.length);

    // assign calories proportionally: 30% breakfast, 30% lunch, 10% snack, 30% dinner (example)
    const split = [0.30, 0.30, 0.10, 0.30];
    const mealTargets = meals.map((m, i) => {
      const kcal = Math.round(targets.calorieTarget * split[i]);
      const protein = perMealProtein;
      return { meal: m, kcal, protein };
    });

    return { ok: true, profile, targets, mealTargets };
  }

  /* ---------- UI rendering ---------- */
  function render(container) {
    const s = getState();
    const history = s.history || [];
    const suggestion = suggestDailyPlanFromProfile();

    container.insertAdjacentHTML("beforeend", `
      <div class="section" id="calorie-ai-root">
        <h3>Calorie AI</h3>
        <div style="margin-bottom:8px">
          <textarea id="cal-ai-input" placeholder="e.g. 200g chicken breast or 1 cup rice or 2 eggs" style="width:100%;height:60px"></textarea>
          <div style="display:flex;gap:8px;margin-top:8px">
            <button id="cal-ai-estimate">Estimate</button>
            <button id="cal-ai-clear-history">Clear history</button>
          </div>
        </div>

        <div id="cal-ai-result" style="margin-bottom:8px"></div>

        <div id="cal-ai-suggestion" style="margin-top:8px">
          <strong>Daily suggestion</strong>
          <div id="cal-ai-suggestion-body"></div>
        </div>

        <div style="margin-top:10px">
          <strong>Recent estimates</strong>
          <div id="cal-ai-history" style="margin-top:6px"></div>
        </div>
      </div>
    `);

    // fill suggestion
    const sugBody = container.querySelector("#cal-ai-suggestion-body");
    if (!suggestion.ok) {
      sugBody.innerHTML = `<div style="color:var(--muted)">${suggestion.message}</div>`;
    } else {
      const t = suggestion.targets;
      const rows = suggestion.mealTargets.map(m => `<div style="display:flex;justify-content:space-between;padding:6px 0;border-top:1px solid var(--border)"><div>${m.meal}</div><div>${m.kcal} kcal • ${m.protein} g protein</div></div>`).join("");
      sugBody.innerHTML = `<div style="padding-top:6px"><div><strong>Target calories:</strong> ${t.calorieTarget} kcal (TDEE ${t.baseTDEE})</div>${rows}</div>`;
    }

    // fill history
    const histEl = container.querySelector("#cal-ai-history");
    if (!history.length) histEl.innerHTML = `<em>No recent estimates</em>`;
    else {
      histEl.innerHTML = history.slice(0, 12).map(h => {
        const est = h.estimate || {};
        return `<div style="padding:6px 0;border-top:1px solid var(--border);display:flex;justify-content:space-between">
          <div style="max-width:70%"><small>${new Date(h.ts).toLocaleString()}</small><div>${escapeHtml(h.input)}</div><small style="color:var(--muted)">${est.note||''}</small></div>
          <div style="text-align:right"><div>${est.kcal} kcal</div><div style="color:var(--muted)">${est.protein} g</div></div>
        </div>`;
      }).join("");
    }

    // handlers
    container.querySelector("#cal-ai-estimate").onclick = () => {
      const text = container.querySelector("#cal-ai-input").value.trim();
      if (!text) { alert("Type something to estimate"); return; }
      const res = estimateFromText(text);
      const out = container.querySelector("#cal-ai-result");
      out.innerHTML = `<div style="padding:8px;border:1px solid var(--border);border-radius:8px">
        <div><strong>Estimate:</strong> ${res.kcal} kcal • ${res.protein} g protein</div>
        <div style="margin-top:6px;color:var(--muted)">${res.note || ""}</div>
      </div>`;
      // refresh history display
      renderHistory(container);
    };

    container.querySelector("#cal-ai-clear-history").onclick = () => {
      const st = getState();
      st.history = [];
      saveState(st);
      renderHistory(container);
    };

    function renderHistory(containerRef) {
      const hist = getState().history || [];
      const histElLocal = containerRef.querySelector("#cal-ai-history");
      if (!hist.length) histElLocal.innerHTML = `<em>No recent estimates</em>`;
      else {
        histElLocal.innerHTML = hist.slice(0, 12).map(h => {
          const est = h.estimate || {};
          return `<div style="padding:6px 0;border-top:1px solid var(--border);display:flex;justify-content:space-between">
            <div style="max-width:70%"><small>${new Date(h.ts).toLocaleString()}</small><div>${escapeHtml(h.input)}</div><small style="color:var(--muted)">${est.note||''}</small></div>
            <div style="text-align:right"><div>${est.kcal} kcal</div><div style="color:var(--muted)">${est.protein} g</div></div>
          </div>`;
        }).join("");
      }
    }

    renderHistory(container);
  }

  /* ---------- Utility ---------- */
  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  }

  /* ---------- Initialization ---------- */
  function init() {
    // ensure state exists
    saveState(getState());
  }

  // public API
  return { init, render: function (container) {
    // render will append; ensure a container element is present
    if (!container) {
      console.warn("CalorieAI.render called without container");
      return;
    }
    render(container);
  }, estimateFromText, suggestDailyPlanFromProfile };
})();
