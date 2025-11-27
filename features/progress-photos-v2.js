/* features/progress-photos.js */
const ProgressPhotos = (function () {
  const KEY = "ft_photos"; // { date: [ {id, ts, dataUrl, note} ] }

  function getAll() { return FT.get(KEY, {}); }
  function setAll(v) { FT.set(KEY, v); }

  function add(file, note = "") {
    const reader = new FileReader();
    reader.onload = function (ev) {
      const dataUrl = ev.target.result;
      const all = getAll();
      const d = new Date().toISOString().slice(0, 10);
      all[d] = all[d] || [];
      all[d].push({ id: Date.now(), ts: Date.now(), dataUrl, note });
      setAll(all);
      window.dispatchEvent(new CustomEvent("ft:photos:update"));
    };
    reader.readAsDataURL(file);
  }

  function removeById(id) {
    const all = getAll();
    Object.keys(all).forEach(date => {
      all[date] = all[date].filter(p => p.id !== id);
      if (all[date].length === 0) delete all[date];
    });
    setAll(all);
    window.dispatchEvent(new CustomEvent("ft:photos:update"));
  }

  function render(container) {
    const all = getAll();
    let html = `<div class="section"><h3>Progress Photos</h3>
      <input id="photo-file" type="file" accept="image/*"><input id="photo-note" placeholder="note" style="width:120px">
      <button id="upload-photo">Upload</button>
      <div id="photos-grid" style="display:grid;grid-template-columns:repeat(auto-fill,120px);gap:8px;margin-top:12px"></div>
    </div>`;
    container.innerHTML = html;

    const grid = container.querySelector("#photos-grid");
    const flat = [];
    Object.keys(all).sort((a,b)=>b.localeCompare(a)).forEach(date => {
      all[date].forEach(p => flat.push(p));
    });
    if (flat.length === 0) grid.innerHTML = "<em>No photos yet</em>";
    else {
      grid.innerHTML = flat.map(p => `
        <div style="border:1px solid #222;border-radius:8px;padding:6px;background:#0f0f0f">
          <img src="${p.dataUrl}" style="width:100%;height:90px;object-fit:cover;border-radius:6px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:4px">
            <small>${new Date(p.ts).toLocaleDateString()}</small>
            <button data-id="${p.id}" class="del-photo" style="font-size:12px">✕</button>
          </div>
        </div>
      `).join("");
      grid.querySelectorAll(".del-photo").forEach(btn => {
        btn.addEventListener("click", e => { removeById(Number(e.target.dataset.id)); render(container); });
      });
    }

    container.querySelector("#upload-photo").addEventListener("click", () => {
      const fileEl = container.querySelector("#photo-file");
      const note = container.querySelector("#photo-note").value || "";
      if (!fileEl.files.length) { alert("Choose a file"); return; }
      add(fileEl.files[0], note);
      setTimeout(() => render(container), 800);
    });

    window.addEventListener("ft:photos:update", () => render(container));
  }

  function init() {
    FT.set(KEY, FT.get(KEY, {}));
  }

  return { init, render, add, removeById };
})();
