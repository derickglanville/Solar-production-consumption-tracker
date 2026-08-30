const sunrunBootstrap = window.SUNRUN_PRODUCTION_BOOTSTRAP || window.SOLAR_BOOTSTRAP?.sunrun_production || {};
let sunrunRows = [];
let sunrunRowSequence = 0;
let selectedSunrunRowId = null;

function sunrunFormat(value, decimals = 1) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function sunrunEscape(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function showSunrunStatus(message, kind = "success") {
  const target = document.getElementById("sunrun-production-status");
  if (!target) return;
  target.innerHTML = `<div class="alert alert-${kind} border-0 shadow-sm py-2">${sunrunEscape(message)}</div>`;
}

function normalizeSunrunRows(payload) {
  return (Array.isArray(payload?.rows) ? payload.rows : []).map((row) => ({
    id: `sunrun-row-${++sunrunRowSequence}`,
    entry_date: String(row.entry_date || ""),
    production_kwh: Number(row.production_kwh || 0),
    cumulative_kwh: Number(row.end_of_day_meter_kwh || 0)
  }));
}

function sunrunTrackerToday() {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function ensureSunrunTodayRow() {
  const today = sunrunTrackerToday();
  if (sunrunRows.some((row) => row.entry_date === today)) return false;
  sunrunRows.push({
    id: `sunrun-row-${++sunrunRowSequence}`,
    entry_date: today,
    production_kwh: 0,
    cumulative_kwh: 0
  });
  return true;
}

function sortAndRecalculateSunrunRows() {
  sunrunRows.sort((left, right) => left.entry_date.localeCompare(right.entry_date));
  let cumulative = 0;
  sunrunRows.forEach((row) => {
    cumulative = Number((cumulative + Math.max(0, Number(row.production_kwh || 0))).toFixed(3));
    row.cumulative_kwh = cumulative;
  });
}

function getSunrunValidation() {
  const counts = new Map();
  const invalidIds = new Set();
  sunrunRows.forEach((row) => {
    counts.set(row.entry_date, (counts.get(row.entry_date) || 0) + 1);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.entry_date) || Number(row.production_kwh) < 0) {
      invalidIds.add(row.id);
    }
  });
  const duplicates = [...counts.entries()].filter(([, count]) => count > 1).map(([entryDate]) => entryDate);
  sunrunRows.forEach((row) => {
    if (duplicates.includes(row.entry_date)) invalidIds.add(row.id);
  });
  return { duplicates, invalidIds, valid: invalidIds.size === 0 };
}

function rebuildSunrunMonthFilter() {
  const select = document.getElementById("sunrun-production-month");
  if (!select) return;
  const previousValue = select.value || "all";
  const months = [...new Set(sunrunRows.map((row) => row.entry_date.slice(0, 7)).filter(Boolean))].sort().reverse();
  select.innerHTML = `<option value="all">All months</option>${months.map((month) => `<option value="${month}">${new Date(`${month}-01T12:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" })}</option>`).join("")}`;
  select.value = months.includes(previousValue) ? previousValue : "all";
}

function renderSunrunSummary(validation = getSunrunValidation()) {
  const selectedMonth = document.getElementById("sunrun-production-month")?.value || "all";
  const confirmedRows = sunrunRows.filter((row) => Number(row.production_kwh || 0) > 0);
  const latest = confirmedRows.at(-1);
  const monthRows = selectedMonth === "all"
    ? sunrunRows.filter((row) => row.entry_date.startsWith(sunrunRows.at(-1)?.entry_date.slice(0, 7) || ""))
    : sunrunRows.filter((row) => row.entry_date.startsWith(selectedMonth));
  const total = sunrunRows.reduce((sum, row) => sum + Number(row.production_kwh || 0), 0);
  const monthTotal = monthRows.reduce((sum, row) => sum + Number(row.production_kwh || 0), 0);
  const activeMonth = selectedMonth === "all" ? sunrunRows.at(-1)?.entry_date.slice(0, 7) : selectedMonth;

  document.getElementById("sunrun-total-production").textContent = `${sunrunFormat(total, 1)} kWh`;
  document.getElementById("sunrun-month-production").textContent = `${sunrunFormat(monthTotal, 1)} kWh`;
  document.getElementById("sunrun-month-label").textContent = activeMonth
    ? new Date(`${activeMonth}-01T12:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" })
    : "No month selected";
  document.getElementById("sunrun-latest-date").textContent = latest?.entry_date || "N/A";
  document.getElementById("sunrun-latest-production").textContent = latest ? `${sunrunFormat(latest.production_kwh, 2)} kWh` : "No confirmed production";
  document.getElementById("sunrun-record-count").textContent = sunrunRows.length.toLocaleString();
  document.getElementById("sunrun-validation-summary").textContent = validation.valid
    ? "File is ready to save"
    : `${validation.duplicates.length} duplicate date${validation.duplicates.length === 1 ? "" : "s"} found`;
}

function renderSunrunRows() {
  sortAndRecalculateSunrunRows();
  const validation = getSunrunValidation();
  const month = document.getElementById("sunrun-production-month")?.value || "all";
  const findText = document.getElementById("sunrun-production-find")?.value.trim().toLowerCase() || "";
  const newestFirst = (document.getElementById("sunrun-production-sort")?.value || "newest") === "newest";
  const visibleRows = [...sunrunRows]
    .filter((row) => month === "all" || row.entry_date.startsWith(month))
    .filter((row) => !findText || row.entry_date.toLowerCase().includes(findText));
  if (newestFirst) visibleRows.reverse();
  const body = document.getElementById("sunrun-production-body");
  if (!body) return;
  body.innerHTML = visibleRows.map((row, index) => {
    const invalid = validation.invalidIds.has(row.id);
    const confirmed = Number(row.production_kwh || 0) > 0;
    return `
      <tr data-row-id="${row.id}" class="${invalid ? "sunrun-row-invalid" : ""} ${selectedSunrunRowId === row.id ? "sunrun-row-selected" : ""}">
        <td class="sunrun-row-number">${index + 1}</td>
        <td><input type="date" class="form-control form-control-sm sunrun-date-input" value="${sunrunEscape(row.entry_date)}" aria-label="Production date"></td>
        <td><input type="number" min="0" step="0.001" class="form-control form-control-sm text-end sunrun-production-input" value="${Number(row.production_kwh || 0)}" aria-label="Solar production in kilowatt-hours"></td>
        <td class="text-end fw-semibold sunrun-cumulative-value">${sunrunFormat(row.cumulative_kwh, 3)}</td>
        <td><span class="sunrun-row-status ${confirmed ? "sunrun-row-confirmed" : "sunrun-row-pending"}">${invalid ? "Fix date" : confirmed ? "Confirmed" : "Pending"}</span></td>
        <td class="text-end"><button type="button" class="btn btn-contract btn-sm sunrun-delete-row">Delete</button></td>
      </tr>`;
  }).join("");
  const visibleProduction = visibleRows.reduce((sum, row) => sum + Number(row.production_kwh || 0), 0);
  const latestVisibleMeter = visibleRows.length
    ? Math.max(...visibleRows.map((row) => Number(row.cumulative_kwh || 0)))
    : 0;
  const foot = document.getElementById("sunrun-production-foot");
  if (foot) {
    foot.innerHTML = `<tr><td></td><th scope="row">Visible totals</th><td class="text-end">${sunrunFormat(visibleProduction, 3)}</td><td class="text-end">${sunrunFormat(latestVisibleMeter, 3)}</td><td></td><td></td></tr>`;
  }
  const visibleCount = document.getElementById("sunrun-visible-count");
  if (visibleCount) visibleCount.textContent = `${visibleRows.length.toLocaleString()} of ${sunrunRows.length.toLocaleString()} records shown`;
  renderSunrunSummary(validation);
}

function moveSunrunMonth(direction) {
  const select = document.getElementById("sunrun-production-month");
  if (!select) return;
  const values = [...select.options].map((option) => option.value).filter((value) => value !== "all");
  if (!values.length) return;
  let index = values.indexOf(select.value);
  if (index < 0) index = direction > 0 ? -1 : values.length;
  index = Math.min(values.length - 1, Math.max(0, index + direction));
  select.value = values[index];
  renderSunrunRows();
}

function focusAdjacentSunrunCell(input, direction) {
  const selector = input.classList.contains("sunrun-date-input") ? ".sunrun-date-input" : ".sunrun-production-input";
  const inputs = [...document.querySelectorAll(`#sunrun-production-body ${selector}`)];
  const currentIndex = inputs.indexOf(input);
  const nextInput = inputs[currentIndex + direction];
  if (!nextInput) return;
  nextInput.focus();
  if (typeof nextInput.select === "function") nextInput.select();
}

function getSunrunRecordPayload() {
  return sunrunRows.map((row) => ({
    entry_date: row.entry_date,
    production_kwh: Number(row.production_kwh || 0)
  }));
}

function buildSunrunCsv() {
  sortAndRecalculateSunrunRows();
  const lines = ["Date,Solar Produced (kWh),End-of-Day Meter Reading (kWh)"];
  sunrunRows.forEach((row) => {
    lines.push(`${row.entry_date},${Number(row.production_kwh || 0).toFixed(3)},${Number(row.cumulative_kwh || 0).toFixed(3)}`);
  });
  return `${lines.join("\n")}\n`;
}

function downloadSunrunCsv() {
  const validation = getSunrunValidation();
  if (!validation.valid) {
    showSunrunStatus(`Resolve duplicate or invalid dates before downloading: ${validation.duplicates.join(", ")}.`, "warning");
    return;
  }
  const blob = new Blob([buildSunrunCsv()], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "Sunrun_Daily_Production_Data.csv";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

async function reloadSunrunFile() {
  if (window.SOLAR_STATIC_SITE) {
    sunrunRows = normalizeSunrunRows(window.SOLAR_BOOTSTRAP?.sunrun_production || sunrunBootstrap);
  } else {
    const response = await fetch("/api/sunrun-production", { cache: "no-store" });
    if (!response.ok) throw new Error("Could not reload the SunRun production file.");
    sunrunRows = normalizeSunrunRows(await response.json());
  }
  const createdToday = ensureSunrunTodayRow();
  rebuildSunrunMonthFilter();
  renderSunrunRows();
  if (createdToday) {
    showSunrunStatus(`A pending production row was created for ${sunrunTrackerToday()}. Enter the final SunRun production when available.`, "info");
  }
}

async function saveSunrunFile() {
  const validation = getSunrunValidation();
  if (!validation.valid) {
    showSunrunStatus(`Save blocked. Resolve duplicate or invalid dates: ${validation.duplicates.join(", ")}.`, "warning");
    return;
  }
  if (window.SOLAR_STATIC_SITE) {
    downloadSunrunCsv();
    showSunrunStatus("GitHub Pages cannot write the repository file directly. The corrected CSV was downloaded for local replacement.", "info");
    return;
  }
  const response = await fetch("/api/sunrun-production/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ records: getSunrunRecordPayload() })
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(payload.error || "Could not save the SunRun production file.");
  sunrunRows = normalizeSunrunRows(payload);
  rebuildSunrunMonthFilter();
  renderSunrunRows();
  showSunrunStatus("SunRun production file saved and cumulative totals recalculated. Reload the dashboard or use Force Load Data to synchronize the corrected production values.");
}

function addSunrunRow() {
  const latestDate = sunrunRows.at(-1)?.entry_date;
  const nextDate = latestDate ? new Date(`${latestDate}T12:00:00`) : new Date();
  if (latestDate) nextDate.setDate(nextDate.getDate() + 1);
  const entryDate = [nextDate.getFullYear(), String(nextDate.getMonth() + 1).padStart(2, "0"), String(nextDate.getDate()).padStart(2, "0")].join("-");
  sunrunRows.push({ id: `sunrun-row-${++sunrunRowSequence}`, entry_date: entryDate, production_kwh: 0, cumulative_kwh: 0 });
  rebuildSunrunMonthFilter();
  document.getElementById("sunrun-production-month").value = entryDate.slice(0, 7);
  renderSunrunRows();
}

function initializeSunrunProductionEditor() {
  if (document.body?.dataset?.page !== "sunrun-production") return;
  sunrunRows = normalizeSunrunRows(sunrunBootstrap);
  const createdToday = ensureSunrunTodayRow();
  rebuildSunrunMonthFilter();
  renderSunrunRows();

  document.getElementById("sunrun-production-body")?.addEventListener("change", (event) => {
    const rowElement = event.target.closest("tr[data-row-id]");
    const row = sunrunRows.find((item) => item.id === rowElement?.dataset.rowId);
    if (!row) return;
    if (event.target.classList.contains("sunrun-date-input")) row.entry_date = event.target.value;
    if (event.target.classList.contains("sunrun-production-input")) row.production_kwh = Math.max(0, Number(event.target.value || 0));
    rebuildSunrunMonthFilter();
    renderSunrunRows();
  });
  document.getElementById("sunrun-production-body")?.addEventListener("click", (event) => {
    const button = event.target.closest(".sunrun-delete-row");
    const rowElement = event.target.closest("tr[data-row-id]");
    if (button) {
      const rowId = rowElement?.dataset.rowId;
      sunrunRows = sunrunRows.filter((row) => row.id !== rowId);
      if (selectedSunrunRowId === rowId) selectedSunrunRowId = null;
      rebuildSunrunMonthFilter();
      renderSunrunRows();
      return;
    }
    if (rowElement) {
      selectedSunrunRowId = rowElement.dataset.rowId;
      document.querySelectorAll("#sunrun-production-body tr").forEach((row) => row.classList.toggle("sunrun-row-selected", row === rowElement));
    }
  });
  document.getElementById("sunrun-production-body")?.addEventListener("keydown", (event) => {
    if (!event.target.matches(".sunrun-date-input, .sunrun-production-input")) return;
    if (event.key === "ArrowUp" || event.key === "ArrowDown") {
      event.preventDefault();
      focusAdjacentSunrunCell(event.target, event.key === "ArrowUp" ? -1 : 1);
    }
  });
  document.getElementById("sunrun-production-month")?.addEventListener("change", renderSunrunRows);
  document.getElementById("sunrun-production-find")?.addEventListener("input", (event) => {
    const month = document.getElementById("sunrun-production-month");
    if (event.target.value.trim() && month) month.value = "all";
    renderSunrunRows();
  });
  document.getElementById("sunrun-production-sort")?.addEventListener("change", renderSunrunRows);
  document.getElementById("sunrun-month-previous")?.addEventListener("click", () => moveSunrunMonth(1));
  document.getElementById("sunrun-month-next")?.addEventListener("click", () => moveSunrunMonth(-1));
  document.getElementById("sunrun-show-latest")?.addEventListener("click", () => {
    const select = document.getElementById("sunrun-production-month");
    const find = document.getElementById("sunrun-production-find");
    const sort = document.getElementById("sunrun-production-sort");
    if (select) select.value = "all";
    if (find) find.value = "";
    if (sort) sort.value = "newest";
    renderSunrunRows();
    document.querySelector(".sunrun-production-table-scroll")?.scrollTo({ top: 0, behavior: "smooth" });
  });
  document.getElementById("sunrun-production-new")?.addEventListener("click", addSunrunRow);
  document.getElementById("sunrun-production-recalculate")?.addEventListener("click", () => {
    renderSunrunRows();
    showSunrunStatus("Cumulative meter totals recalculated in the editor. Save to update the source file.", "info");
  });
  document.getElementById("sunrun-production-reload")?.addEventListener("click", async () => {
    try {
      await reloadSunrunFile();
      showSunrunStatus("SunRun production file reloaded.");
    } catch (error) {
      showSunrunStatus(error.message, "danger");
    }
  });
  document.getElementById("sunrun-production-save")?.addEventListener("click", async () => {
    try {
      await saveSunrunFile();
    } catch (error) {
      showSunrunStatus(error.message, "danger");
    }
  });
  document.getElementById("sunrun-production-download")?.addEventListener("click", downloadSunrunCsv);

  const validation = getSunrunValidation();
  if (!validation.valid) {
    showSunrunStatus(`The source file contains duplicate dates (${validation.duplicates.join(", ")}). Remove the duplicate row before saving.`, "warning");
  } else if (createdToday) {
    showSunrunStatus(`A pending production row was created for ${sunrunTrackerToday()}. Enter the final SunRun production when available.`, "info");
  }
}

document.addEventListener("DOMContentLoaded", initializeSunrunProductionEditor);
