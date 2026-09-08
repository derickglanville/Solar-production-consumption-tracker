(function () {
  "use strict";

  const page = document.body.dataset.page;
  const isLighting = page === "light-bulbs";
  const isUsage = page === "electricity-usage";
  if (!isLighting && !isUsage) return;

  const isStatic = Boolean(window.SOLAR_STATIC_SITE);
  const bootstrap = window.REFERENCE_EDITOR_BOOTSTRAP || {};
  const storageKey = isLighting
    ? "solar-reference-light-bulbs-v1"
    : "solar-reference-electricity-usage-v1";
  const apiPath = isLighting
    ? "/api/reference/light-bulbs"
    : "/api/reference/electricity-usage";
  const savePath = `${apiPath}/save`;
  let state = readStaticState() || clone(bootstrap);

  function clone(value) {
    return JSON.parse(JSON.stringify(value || {}));
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function readStaticState() {
    if (!isStatic) return null;
    try {
      const saved = window.localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : null;
    } catch (_error) {
      return null;
    }
  }

  function setStatus(message, tone = "success") {
    const target = document.querySelector("#reference-editor-status");
    if (!target) return;
    target.innerHTML = `<div class="alert alert-${tone} border-0 shadow-sm py-2 mb-3">${escapeHtml(message)}</div>`;
  }

  function renderLighting() {
    const body = document.querySelector("#light-bulbs-table-body");
    if (!body) return;
    const records = Array.isArray(state.records) ? state.records : [];
    body.innerHTML = records.map((record, index) => {
      const led = ["Yes", "No", "Unknown"].includes(record.led) ? record.led : "Unknown";
      return `
        <tr class="reference-led-${led.toLowerCase()}">
          <td><input class="form-control form-control-sm" data-field="room" value="${escapeHtml(record.room)}" aria-label="Room or location"></td>
          <td><input class="form-control form-control-sm text-end" data-field="count" type="number" min="0" step="1" value="${escapeHtml(record.count)}" aria-label="Bulb count"></td>
          <td><select class="form-select form-select-sm" data-field="led" aria-label="LED status">
            ${["Yes", "No", "Unknown"].map((option) => `<option${option === led ? " selected" : ""}>${option}</option>`).join("")}
          </select></td>
          <td><input class="form-control form-control-sm" data-field="comment" value="${escapeHtml(record.comment)}" aria-label="Comment"></td>
          <td><button type="button" class="btn btn-outline-danger btn-sm" data-delete-row="${index}">Delete</button></td>
        </tr>`;
    }).join("");
    updateLightingSummary(records);
  }

  function updateLightingSummary(records) {
    const totals = records.reduce((result, record) => {
      const count = Math.max(0, Number(record.count) || 0);
      result.total += count;
      if (record.led === "Yes") result.led += count;
      else if (record.led === "No") result.replace += count;
      else result.unknown += count;
      return result;
    }, { total: 0, led: 0, replace: 0, unknown: 0 });
    document.querySelector("#lighting-total-bulbs").textContent = totals.total.toLocaleString();
    document.querySelector("#lighting-led-bulbs").textContent = totals.led.toLocaleString();
    document.querySelector("#lighting-replace-bulbs").textContent = totals.replace.toLocaleString();
    document.querySelector("#lighting-unknown-bulbs").textContent = totals.unknown.toLocaleString();
  }

  function collectLighting() {
    return {
      ...state,
      records: [...document.querySelectorAll("#light-bulbs-table-body tr")].map((row) => ({
        room: row.querySelector('[data-field="room"]').value.trim(),
        count: Math.max(0, Number(row.querySelector('[data-field="count"]').value) || 0),
        led: row.querySelector('[data-field="led"]').value,
        comment: row.querySelector('[data-field="comment"]').value.trim(),
      })).filter((record) => record.room),
    };
  }

  function renderUsage() {
    document.querySelector("#usage-daily-range").value = state.typical_daily_range || "";
    document.querySelector("#usage-center-estimate").value = state.center_estimate || "";
    document.querySelector("#usage-intro").value = state.intro || "";

    const body = document.querySelector("#electricity-usage-table-body");
    const loads = Array.isArray(state.loads) ? state.loads : [];
    body.innerHTML = loads.map((row, index) => `
      <tr>
        <td><input class="form-control form-control-sm" data-field="load" value="${escapeHtml(row.load)}" aria-label="Electrical load"></td>
        <td><input class="form-control form-control-sm" data-field="assumed_daily_use" value="${escapeHtml(row.assumed_daily_use)}" aria-label="Assumed daily use"></td>
        <td><input class="form-control form-control-sm" data-field="estimated_kwh_day" value="${escapeHtml(row.estimated_kwh_day)}" aria-label="Estimated kilowatt-hours per day"></td>
        <td><button type="button" class="btn btn-outline-danger btn-sm" data-delete-row="${index}">Delete</button></td>
      </tr>`).join("");

    const sections = document.querySelector("#electricity-usage-sections");
    sections.innerHTML = (Array.isArray(state.sections) ? state.sections : []).map((section, index) => `
      <article class="reference-section-editor">
        <div class="d-flex gap-2 align-items-start">
          <input class="form-control form-control-sm fw-semibold" data-field="title" value="${escapeHtml(section.title)}" aria-label="Note title">
          <button type="button" class="btn btn-outline-danger btn-sm" data-delete-section="${index}">Delete</button>
        </div>
        <textarea class="form-control form-control-sm mt-2" data-field="body" rows="4" aria-label="Note details">${escapeHtml(section.body)}</textarea>
      </article>`).join("");
  }

  function collectUsage() {
    return {
      ...state,
      intro: document.querySelector("#usage-intro").value.trim(),
      typical_daily_range: document.querySelector("#usage-daily-range").value.trim(),
      center_estimate: document.querySelector("#usage-center-estimate").value.trim(),
      loads: [...document.querySelectorAll("#electricity-usage-table-body tr")].map((row) => ({
        load: row.querySelector('[data-field="load"]').value.trim(),
        assumed_daily_use: row.querySelector('[data-field="assumed_daily_use"]').value.trim(),
        estimated_kwh_day: row.querySelector('[data-field="estimated_kwh_day"]').value.trim(),
      })).filter((row) => row.load),
      sections: [...document.querySelectorAll("#electricity-usage-sections .reference-section-editor")].map((section) => ({
        title: section.querySelector('[data-field="title"]').value.trim(),
        body: section.querySelector('[data-field="body"]').value.trim(),
      })).filter((section) => section.title || section.body),
    };
  }

  function render() {
    if (isLighting) renderLighting();
    else renderUsage();
  }

  async function reload() {
    try {
      if (isStatic) {
        state = readStaticState() || clone(bootstrap);
      } else {
        const response = await fetch(apiPath, { cache: "no-store" });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        state = await response.json();
      }
      render();
      setStatus(isStatic ? "Reloaded the version saved in this browser." : "Reloaded the project data file.");
    } catch (error) {
      setStatus(`Could not reload the data: ${error.message}`, "danger");
    }
  }

  async function save() {
    state = isLighting ? collectLighting() : collectUsage();
    try {
      if (isStatic) {
        window.localStorage.setItem(storageKey, JSON.stringify(state));
        setStatus("Saved in this browser. Open the local Flask app to save edits into the project JSON file.");
      } else {
        const response = await fetch(savePath, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(state),
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        state = await response.json();
        setStatus("Saved to the project JSON file.");
      }
      render();
    } catch (error) {
      setStatus(`Could not save the changes: ${error.message}`, "danger");
    }
  }

  document.addEventListener("click", (event) => {
    const reloadButton = event.target.closest("[data-reference-reload]");
    const saveButton = event.target.closest("[data-reference-save]");
    const addButton = event.target.closest("[data-reference-add]");
    const deleteButton = event.target.closest("[data-delete-row]");
    const deleteSectionButton = event.target.closest("[data-delete-section]");

    if (reloadButton) reload();
    if (saveButton) save();
    if (addButton) {
      state = isLighting ? collectLighting() : collectUsage();
      if (isLighting) state.records.push({ room: "", count: 1, led: "Unknown", comment: "" });
      else state.loads.push({ load: "", assumed_daily_use: "", estimated_kwh_day: "" });
      render();
      const table = document.querySelector(".reference-table-scroll");
      if (table) table.scrollTop = table.scrollHeight;
    }
    if (deleteButton) {
      state = isLighting ? collectLighting() : collectUsage();
      const collection = isLighting ? state.records : state.loads;
      collection.splice(Number(deleteButton.dataset.deleteRow), 1);
      render();
    }
    if (deleteSectionButton) {
      state = collectUsage();
      state.sections.splice(Number(deleteSectionButton.dataset.deleteSection), 1);
      render();
    }
  });

  document.querySelector("#usage-add-section")?.addEventListener("click", () => {
    state = collectUsage();
    state.sections.push({ title: "", body: "" });
    render();
  });

  render();
})();
