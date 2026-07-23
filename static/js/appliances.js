const applianceBootstrap = window.APPLIANCES_BOOTSTRAP || {};
const applianceConfig = window.SOLAR_BOOTSTRAP?.default_config || {};
let appliancesPopoutOpen = false;
let appliancesTableHomeParent = null;
let appliancesTableHomeNextSibling = null;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatNumber(value, decimals = 1) {
  const numeric = Number(value || 0);
  return numeric.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}

function formatWhole(value) {
  return Number(value || 0).toLocaleString(undefined, {
    maximumFractionDigits: 0
  });
}

function formatCurrency(value) {
  return Number(value || 0).toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  });
}

function showApplianceStatus(message, kind = "success") {
  const container = document.getElementById("appliances-status");
  if (!container) return;
  container.innerHTML = `<div class="alert alert-${kind} border-0 shadow-sm">${message}</div>`;
}

function setAppliancesPopout(open) {
  appliancesPopoutOpen = Boolean(open);
  document.body?.classList.toggle("appliances-popout-active", appliancesPopoutOpen);
  const button = document.getElementById("appliances-popout");
  const shell = document.getElementById("appliances-popout-shell");
  const mount = document.getElementById("appliances-popout-mount");
  const panel = document.getElementById("appliances-table-panel");
  if (button) {
    button.textContent = appliancesPopoutOpen ? "Close Pop Out" : "Pop Out Table";
  }
  if (!shell || !mount || !panel) return;

  if (!appliancesTableHomeParent) {
    appliancesTableHomeParent = panel.parentNode;
    appliancesTableHomeNextSibling = panel.nextSibling;
  }

  if (appliancesPopoutOpen) {
    shell.classList.remove("d-none");
    shell.setAttribute("aria-hidden", "false");
    mount.appendChild(panel);
    return;
  }

  shell.classList.add("d-none");
  shell.setAttribute("aria-hidden", "true");
  if (appliancesTableHomeParent) {
    if (appliancesTableHomeNextSibling && appliancesTableHomeNextSibling.parentNode === appliancesTableHomeParent) {
      appliancesTableHomeParent.insertBefore(panel, appliancesTableHomeNextSibling);
    } else {
      appliancesTableHomeParent.appendChild(panel);
    }
  }
}

function clearApplianceStatus() {
  const container = document.getElementById("appliances-status");
  if (container) {
    container.innerHTML = "";
  }
}

function computeDerived(record) {
  const typicalKw = Number(record.typical_kw || 0);
  const hoursPerDay = Number(record.typical_hours_per_day || 0);
  const dailyKwh = Number((typicalKw * hoursPerDay).toFixed(2));
  const monthlyKwh = Number((dailyKwh * 30).toFixed(2));
  return {
    ...record,
    typical_kw: typicalKw,
    typical_hours_per_day: hoursPerDay,
    estimated_daily_kwh: dailyKwh,
    estimated_monthly_kwh: monthlyKwh
  };
}

function buildRecommendation(record) {
  const name = String(record.appliance || "").toLowerCase();
  const monthlyKwh = Number(record.estimated_monthly_kwh || 0);
  if (name.includes("portable ac")) {
    return "High summer load. Seal the room, clean the filter, and consider a higher-efficiency cooling option.";
  }
  if (name.includes("ductless air ac")) {
    return "Major cooling load. Clean filters and use setback temperatures to reduce runtime.";
  }
  if (name.includes("electric base heater")) {
    return "Resistance heat is expensive. Reduce runtime where possible and consider a heat-pump upgrade.";
  }
  if (name.includes("clothes dryer")) {
    return "Run full loads, clean the vent, and use lower-heat cycles when practical.";
  }
  if (name.includes("dehumid")) {
    return "Long runtime adds up. Raise the humidity setpoint a bit and keep the area sealed.";
  }
  if (name.includes("refrig") || name.includes("freezer")) {
    return "Check seals and keep coils clean so the compressor does not run longer than needed.";
  }
  if (name.includes("oven") || name.includes("dishwasher")) {
    return "Batch cooking or washing helps. Eco modes can reduce energy use.";
  }
  if (name.includes("tv") || name.includes("monitor") || name.includes("computer")) {
    return "Enable sleep timers and aggressive power-saving settings.";
  }
  if (name.includes("lamp")) {
    return "Low load if LED. Swap any remaining non-LED bulbs first.";
  }
  if (monthlyKwh >= 180) {
    return "One of the largest estimated users. Reducing daily runtime could have a noticeable impact.";
  }
  if (monthlyKwh >= 75) {
    return "Worth monitoring. Small runtime cuts may still help.";
  }
  return "Lower estimated load. Focus on larger monthly users first.";
}

function sortRecords(records) {
  return [...records].sort((left, right) => {
    const monthlyDifference = Number(right.estimated_monthly_kwh || 0) - Number(left.estimated_monthly_kwh || 0);
    if (monthlyDifference !== 0) {
      return monthlyDifference;
    }
    return String(left.appliance || "").localeCompare(String(right.appliance || ""));
  });
}

function readTableRecords() {
  const rows = [...document.querySelectorAll("#appliances-table-body tr")];
  return sortRecords(
    rows.map((row) =>
      computeDerived({
        appliance: row.dataset.appliance || "",
        room: row.dataset.room || "",
        typical_kw: row.querySelector('[data-field="typical_kw"]')?.value || 0,
        typical_hours_per_day: row.querySelector('[data-field="typical_hours_per_day"]')?.value || 0,
        recommendation: row.querySelector('[data-field="recommendation"]')?.value || "",
        estimated_source: row.querySelector('[data-field="estimated_source"]')?.value || "User updated",
        notes: row.querySelector('[data-field="notes"]')?.value || ""
      })
    )
  );
}

function updateSummary(records) {
  const totalMonthly = records.reduce((sum, record) => sum + Number(record.estimated_monthly_kwh || 0), 0);
  const totalDaily = records.reduce((sum, record) => sum + Number(record.estimated_daily_kwh || 0), 0);
  const currentElectricRate = Number(applianceConfig.current_electric_rate || 0);
  const expectedOffsetPct = Number(applianceConfig.expected_offset_pct || 0);
  const monthlyEstimatedCost = totalMonthly * currentElectricRate;
  const solarOffsetValue = monthlyEstimatedCost * (expectedOffsetPct / 100);
  const highestKw = records[0]
    ? [...records].sort((left, right) => Number(right.typical_kw || 0) - Number(left.typical_kw || 0))[0]
    : null;
  const highestMonthly = records[0] || null;
  const roomTotals = records.reduce((accumulator, record) => {
    const room = record.room || "Unknown";
    accumulator.set(room, (accumulator.get(room) || 0) + Number(record.estimated_monthly_kwh || 0));
    return accumulator;
  }, new Map());
  const topRoomEntry = [...roomTotals.entries()].sort((left, right) => right[1] - left[1])[0] || null;

  document.getElementById("appliance-total-monthly").textContent = `${formatWhole(totalMonthly)} kWh`;
  document.getElementById("appliance-total-daily").textContent = `${formatNumber(totalDaily, 1)} kWh`;
  document.getElementById("appliance-monthly-cost").textContent = formatCurrency(monthlyEstimatedCost);
  document.getElementById("appliance-monthly-cost-label").textContent = `At $${currentElectricRate.toFixed(2)}/kWh.`;
  document.getElementById("appliance-solar-offset").textContent = formatCurrency(solarOffsetValue);
  document.getElementById("appliance-solar-offset-label").textContent = `Based on your expected ${expectedOffsetPct.toFixed(0)}% solar offset.`;
  document.getElementById("appliance-highest-kw").textContent = highestKw
    ? `${formatNumber(highestKw.typical_kw, 2)} kW`
    : "-";
  document.getElementById("appliance-highest-kw-label").textContent = highestKw
    ? `${highestKw.appliance} in ${highestKw.room}`
    : "Largest single-device kW estimate.";
  document.getElementById("appliance-highest-monthly").textContent = highestMonthly
    ? `${formatWhole(highestMonthly.estimated_monthly_kwh)} kWh`
    : "-";
  document.getElementById("appliance-highest-monthly-label").textContent = highestMonthly
    ? `${highestMonthly.appliance} in ${highestMonthly.room}`
    : "Most likely monthly energy driver.";
  document.getElementById("appliance-record-count").textContent = String(records.length);
  document.getElementById("appliance-room-count").textContent = String(new Set(records.map((record) => record.room)).size);
  document.getElementById("appliance-top-room").textContent = topRoomEntry
    ? `${topRoomEntry[0]} (${formatWhole(topRoomEntry[1])} kWh/mo)`
    : "-";

  const topList = document.getElementById("appliance-top-list");
  if (topList) {
    topList.innerHTML = records
      .slice(0, 8)
      .map(
        (record, index) => `
          <div class="appliance-top-item">
            <div>
              <strong>${index + 1}. ${escapeHtml(record.appliance)}</strong>
              <span>${escapeHtml(record.room)}</span>
            </div>
            <div class="text-end">
              <strong>${formatWhole(record.estimated_monthly_kwh)} kWh/mo</strong>
              <span>${formatNumber(record.typical_kw, 2)} kW x ${formatNumber(record.typical_hours_per_day, 1)} h/day</span>
            </div>
          </div>
        `
      )
      .join("");
  }
}

function renderTable(records) {
  const body = document.getElementById("appliances-table-body");
  if (!body) return;

  body.innerHTML = sortRecords(records)
    .map(
      (record) => `
        <tr data-appliance="${escapeHtml(record.appliance)}" data-room="${escapeHtml(record.room)}" data-monthly-kwh="${Number(record.estimated_monthly_kwh || 0)}">
          <td class="appliance-name-cell">
            <strong>${escapeHtml(record.appliance)}</strong>
          </td>
          <td>${escapeHtml(record.room)}</td>
          <td class="text-end appliance-input-cell">
            <input type="number" step="0.01" min="0" class="form-control form-control-sm appliance-number-input" data-field="typical_kw" value="${Number(record.typical_kw || 0)}">
          </td>
          <td class="text-end appliance-input-cell">
            <input type="number" step="0.1" min="0" class="form-control form-control-sm appliance-number-input" data-field="typical_hours_per_day" value="${Number(record.typical_hours_per_day || 0)}">
          </td>
          <td class="text-end" data-display="estimated_daily_kwh">${formatNumber(record.estimated_daily_kwh, 2)}</td>
          <td class="text-end" data-display="estimated_monthly_kwh">${formatNumber(record.estimated_monthly_kwh, 1)}</td>
          <td class="appliance-recommendation-cell">
            <textarea class="form-control form-control-sm appliance-compact-textarea" rows="2" data-field="recommendation">${escapeHtml(record.recommendation || buildRecommendation(record))}</textarea>
          </td>
          <td class="appliance-source-cell">
            <input type="text" class="form-control form-control-sm" data-field="estimated_source" value="${escapeHtml(record.estimated_source || "")}">
          </td>
          <td class="appliance-notes-cell">
            <textarea class="form-control form-control-sm appliance-compact-textarea appliance-notes-input" rows="2" data-field="notes">${escapeHtml(record.notes || "")}</textarea>
          </td>
          <td class="text-center">
            <button type="button" class="btn btn-outline-danger btn-sm appliance-delete-button">Delete</button>
          </td>
        </tr>
      `
    )
    .join("");

  updateSummary(sortRecords(records));
  applyLoadBands();
}

function recalculateVisibleRows() {
  const records = readTableRecords();
  const rowMap = new Map(records.map((record) => [`${record.appliance}||${record.room}`, record]));

  document.querySelectorAll("#appliances-table-body tr").forEach((row) => {
    const key = `${row.dataset.appliance || ""}||${row.dataset.room || ""}`;
    const record = rowMap.get(key);
    if (!record) return;
    const dailyCell = row.querySelector('[data-display="estimated_daily_kwh"]');
    const monthlyCell = row.querySelector('[data-display="estimated_monthly_kwh"]');
    if (dailyCell) dailyCell.textContent = formatNumber(record.estimated_daily_kwh, 2);
    if (monthlyCell) monthlyCell.textContent = formatNumber(record.estimated_monthly_kwh, 1);
    row.dataset.monthlyKwh = String(Number(record.estimated_monthly_kwh || 0));
  });

  updateSummary(records);
  applyLoadBands();
}

function applyLoadBands() {
  const rows = [...document.querySelectorAll("#appliances-table-body tr")];
  if (!rows.length) return;

  rows.forEach((row) => {
    const monthlyKwh = Number(row.dataset.monthlyKwh || 0);
    row.classList.remove("appliance-load-high", "appliance-load-medium", "appliance-load-low");

    if (monthlyKwh >= 112) {
      row.classList.add("appliance-load-high");
      return;
    }

    if (monthlyKwh >= 19 && monthlyKwh < 112) {
      row.classList.add("appliance-load-medium");
      return;
    }

    row.classList.add("appliance-load-low");
  });
}

async function loadAppliances() {
  const response = await fetch("/api/appliances");
  if (!response.ok) {
    throw new Error(`Appliance workbook request failed with status ${response.status}`);
  }
  return response.json();
}

async function saveAppliances(records) {
  const response = await fetch("/api/appliances/save", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ records })
  });
  if (!response.ok) {
    throw new Error(`Appliance workbook save failed with status ${response.status}`);
  }
  return response.json();
}

function attachEvents() {
  document.getElementById("appliances-table-body")?.addEventListener("input", (event) => {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
      clearApplianceStatus();
      recalculateVisibleRows();
    }
  });

  document.getElementById("appliances-table-body")?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (!target.classList.contains("appliance-delete-button")) return;
    const row = target.closest("tr");
    if (!row) return;
    row.remove();
    clearApplianceStatus();
    recalculateVisibleRows();
    showApplianceStatus("Record removed from the table. Save to write the change into the workbook.", "warning");
  });

  document.getElementById("appliances-new")?.addEventListener("click", () => {
    const records = readTableRecords();
    records.unshift(
      computeDerived({
        appliance: "New Appliance",
        room: "Unassigned",
        typical_kw: 0.1,
        typical_hours_per_day: 1,
        recommendation: "Add a device-specific efficiency recommendation.",
        estimated_source: "User added",
        notes: "New row. Update appliance name, usage, and notes."
      })
    );
    renderTable(records);
    showApplianceStatus("New record added at the top. Save to write it into the workbook.", "success");
  });

  document.getElementById("appliances-popout")?.addEventListener("click", () => {
    setAppliancesPopout(!appliancesPopoutOpen);
  });

  document.getElementById("appliances-popout-close")?.addEventListener("click", () => {
    setAppliancesPopout(false);
  });

  document.getElementById("appliances-popout-shell")?.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof HTMLElement)) return;
    if (target.dataset.closePopout === "true") {
      setAppliancesPopout(false);
    }
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && appliancesPopoutOpen) {
      setAppliancesPopout(false);
    }
  });

  document.getElementById("appliances-reload")?.addEventListener("click", async () => {
    try {
      showApplianceStatus("Reloading appliance workbook...", "secondary");
      const payload = await loadAppliances();
      renderTable(payload.records || []);
      showApplianceStatus("Workbook reloaded from disk.", "success");
    } catch (error) {
      showApplianceStatus(error.message || "Unable to reload the appliance workbook.", "danger");
    }
  });

  document.getElementById("appliances-save")?.addEventListener("click", async () => {
    try {
      showApplianceStatus("Saving appliance updates to the workbook...", "secondary");
      const payload = await saveAppliances(readTableRecords());
      renderTable(payload.records || []);
      showApplianceStatus("Appliance estimates saved to Appliances.xlsx.", "success");
    } catch (error) {
      showApplianceStatus(error.message || "Unable to save the appliance workbook.", "danger");
    }
  });
}

function initAppliancesPage() {
  if (document.body?.dataset?.page !== "appliances") return;
  renderTable(applianceBootstrap.records || []);
  attachEvents();
}

initAppliancesPage();
