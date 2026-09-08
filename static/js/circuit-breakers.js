(function () {
  "use strict";

  if (document.body.dataset.page !== "circuit-breakers") return;

  const apiPath = "/api/reference/circuit-breakers";
  const savePath = `${apiPath}/save`;
  let state = clone(window.CIRCUIT_BREAKER_BOOTSTRAP || {});

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

  function setStatus(message, tone = "success") {
    const target = document.querySelector("#circuit-editor-status");
    target.innerHTML = `<div class="alert alert-${tone} border-0 shadow-sm py-2 mb-3">${escapeHtml(message)}</div>`;
  }

  function rowClass(record) {
    const text = `${record.identification || ""} ${record.notes || ""}`.toLowerCase();
    if (text.includes("unknown") || text.includes("not yet")) return "circuit-row-unknown";
    if (text.includes("probable") || text.includes("likely")) return "circuit-row-probable";
    if (text.includes("240 v")) return "circuit-row-240v";
    return "";
  }

  function render() {
    document.querySelector("#circuit-title").value = state.title || "";
    document.querySelector("#circuit-subtitle").value = state.subtitle || "";
    document.querySelector("#circuit-updated").value = state.updated || "";
    document.querySelector("#circuit-key-note").value = state.key_note || "";
    document.querySelector("#circuit-safety-note").value = state.safety_note || "";
    const records = Array.isArray(state.records) ? state.records : [];
    document.querySelector("#circuit-row-count").textContent = records.length.toLocaleString();
    document.querySelector("#circuit-breakers-table-body").innerHTML = records.map((record, index) => `
      <tr class="${rowClass(record)}">
        <td><input class="form-control form-control-sm circuit-number-input" data-field="circuit" value="${escapeHtml(record.circuit)}" aria-label="Circuit number"></td>
        <td><input class="form-control form-control-sm" data-field="identification" value="${escapeHtml(record.identification)}" aria-label="Circuit identification"></td>
        <td><input class="form-control form-control-sm" data-field="notes" value="${escapeHtml(record.notes)}" aria-label="Status or notes"></td>
        <td><button type="button" class="btn btn-outline-danger btn-sm" data-circuit-delete="${index}">Delete</button></td>
      </tr>`).join("");
  }

  function collect() {
    return {
      title: document.querySelector("#circuit-title").value.trim(),
      subtitle: document.querySelector("#circuit-subtitle").value.trim(),
      updated: document.querySelector("#circuit-updated").value.trim(),
      key_note: document.querySelector("#circuit-key-note").value.trim(),
      safety_note: document.querySelector("#circuit-safety-note").value.trim(),
      records: [...document.querySelectorAll("#circuit-breakers-table-body tr")].map((row) => ({
        circuit: row.querySelector('[data-field="circuit"]').value.trim(),
        identification: row.querySelector('[data-field="identification"]').value.trim(),
        notes: row.querySelector('[data-field="notes"]').value.trim(),
      })).filter((row) => row.circuit || row.identification || row.notes),
    };
  }

  async function reload() {
    try {
      const response = await fetch(apiPath, { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      state = await response.json();
      render();
      setStatus("Reloaded the saved circuit directory.");
    } catch (error) {
      setStatus(`Could not reload the directory: ${error.message}`, "danger");
    }
  }

  async function save() {
    state = collect();
    try {
      const response = await fetch(savePath, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      state = await response.json();
      render();
      setStatus("Circuit directory changes saved locally.");
    } catch (error) {
      setStatus(`Could not save the directory: ${error.message}`, "danger");
    }
  }

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-circuit-reload]")) reload();
    if (event.target.closest("[data-circuit-save]")) save();
    if (event.target.closest("[data-circuit-add]")) {
      state = collect();
      state.records.push({ circuit: "", identification: "", notes: "" });
      render();
      const scroller = document.querySelector(".circuit-reference-table-scroll");
      scroller.scrollTop = scroller.scrollHeight;
    }
    const deleteButton = event.target.closest("[data-circuit-delete]");
    if (deleteButton) {
      state = collect();
      state.records.splice(Number(deleteButton.dataset.circuitDelete), 1);
      render();
    }
  });

  render();
})();
