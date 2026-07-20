import { initializeApp } from "https://www.gstatic.com/firebasejs/12.15.0/firebase-app.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  orderBy,
  query,
  setDoc
} from "https://www.gstatic.com/firebasejs/12.15.0/firebase-firestore.js";

const dashboardRenderUrl = "/api/render/dashboard";
const entryCollectionName = "solar_daily_entries";
const configCollectionName = "solar_tracker_config";
const configDocumentId = "primary";

const bootstrap = window.SOLAR_BOOTSTRAP || {};
const sampleEntries = Array.isArray(bootstrap.sample_entries) ? bootstrap.sample_entries : [];
const defaultConfig = bootstrap.default_config || {};

function getPageName() {
  return document.body?.dataset?.page || "";
}

function sortEntries(entries) {
  return [...entries].sort((left, right) => String(left.entry_date).localeCompare(String(right.entry_date)));
}

function mergeConfig(config = {}) {
  return { ...defaultConfig, ...config };
}

function buildStatus(message, kind = "warning", usingDemoData = false) {
  return { message, kind, using_demo_data: usingDemoData };
}

function renderStatusAlert(targetId, message, kind = "warning") {
  const target = document.getElementById(targetId);
  if (!target) return;
  if (!message) {
    target.innerHTML = "";
    return;
  }
  target.innerHTML = `<div class="alert alert-${kind} border-0 shadow-sm">${message}</div>`;
}

function getFirebaseAppContext() {
  const config = window.SOLAR_FIREBASE_CONFIG || {};
  const requiredKeys = ["apiKey", "projectId", "appId"];
  const missing = requiredKeys.find((key) => !config[key]);
  if (missing) {
    throw new Error(`Firebase config is missing ${missing}`);
  }
  const app = initializeApp(config);
  const db = getFirestore(app);
  return { app, db };
}

async function loadFirestoreState(db) {
  const configSnapshot = await getDoc(doc(db, configCollectionName, configDocumentId));
  const config = configSnapshot.exists() ? mergeConfig(configSnapshot.data()) : mergeConfig();

  const entryQuery = query(collection(db, entryCollectionName), orderBy("entry_date"));
  const entrySnapshot = await getDocs(entryQuery);
  const entries = entrySnapshot.docs.map((docSnapshot) => {
    const payload = docSnapshot.data();
    return {
      entry_date: payload.entry_date || docSnapshot.id,
      irradiance_peak_wm2: Number(payload.irradiance_peak_wm2 || 0),
      production_kwh: Number(payload.production_kwh || 0),
      meter_01_import_reading: Number(payload.meter_01_import_reading || 0),
      meter_02_export_reading: Number(payload.meter_02_export_reading || 0),
      weather: payload.weather || "Unknown",
      temperature_f: payload.temperature_f ?? null,
      humidity_pct: payload.humidity_pct ?? null,
      cloud_cover_pct: payload.cloud_cover_pct ?? null,
      wind_mph: payload.wind_mph ?? null,
      notes: payload.notes || "",
      created_at: payload.created_at || "",
      updated_at: payload.updated_at || ""
    };
  });

  return {
    config,
    entries: sortEntries(entries)
  };
}

async function renderDashboard(entries, config, firebaseStatus) {
  const response = await fetch(dashboardRenderUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      entries,
      config,
      firebase_status: firebaseStatus
    })
  });
  const payload = await response.json();
  const target = document.getElementById("dashboard-root");
  if (target) {
    target.innerHTML = payload.html;
    activateInjectedScripts(target);
  }
}

function activateInjectedScripts(container) {
  const scripts = Array.from(container.querySelectorAll("script"));
  scripts.forEach((script) => {
    const replacement = document.createElement("script");
    Array.from(script.attributes).forEach((attribute) => {
      replacement.setAttribute(attribute.name, attribute.value);
    });
    replacement.textContent = script.textContent;
    script.parentNode.replaceChild(replacement, script);
  });
}

function populateEntriesTable(entries) {
  const body = document.getElementById("entries-table-body");
  if (!body) return;
  body.innerHTML = entries.map((entry) => `
    <tr>
      <td>${entry.entry_date}</td>
      <td>${Number(entry.production_kwh || 0).toFixed(1)}</td>
      <td>${Number(entry.irradiance_peak_wm2 || 0).toFixed(0)}</td>
      <td>${Number(entry.meter_01_import_reading || 0).toFixed(1)}</td>
      <td>${Number(entry.meter_02_export_reading || 0).toFixed(1)}</td>
      <td>${entry.weather || "Unknown"}</td>
      <td>${entry.notes || ""}</td>
    </tr>
  `).join("");
}

function populateSettingsForm(config) {
  const form = document.getElementById("settings-form");
  if (!form) return;
  Object.entries(config).forEach(([key, value]) => {
    const input = form.elements.namedItem(key);
    if (input) {
      input.value = value ?? "";
    }
  });
}

async function handleEntryForm(db) {
  const form = document.getElementById("entry-form");
  if (!form) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const entry = {
      entry_date: formData.get("entry_date"),
      irradiance_peak_wm2: Number(formData.get("irradiance_peak_wm2") || 0),
      production_kwh: Number(formData.get("production_kwh") || 0),
      meter_01_import_reading: Number(formData.get("meter_01_import_reading") || 0),
      meter_02_export_reading: Number(formData.get("meter_02_export_reading") || 0),
      weather: formData.get("weather") || "Unknown",
      temperature_f: formData.get("temperature_f") ? Number(formData.get("temperature_f")) : null,
      humidity_pct: formData.get("humidity_pct") ? Number(formData.get("humidity_pct")) : null,
      cloud_cover_pct: formData.get("cloud_cover_pct") ? Number(formData.get("cloud_cover_pct")) : null,
      wind_mph: formData.get("wind_mph") ? Number(formData.get("wind_mph")) : null,
      notes: formData.get("notes") || "",
      updated_at: new Date().toISOString()
    };
    await setDoc(doc(db, entryCollectionName, entry.entry_date), entry, { merge: true });
    const state = await loadFirestoreState(db);
    populateEntriesTable(state.entries.slice().reverse());
    renderStatusAlert("entries-status", "Daily entry saved to Firebase Firestore.", "success");
    form.reset();
  });
}

async function handleSettingsForm(db) {
  const form = document.getElementById("settings-form");
  if (!form) return;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const config = {
      ...defaultConfig,
      production_guarantee_kwh: Number(formData.get("production_guarantee_kwh") || 0),
      expected_offset_pct: Number(formData.get("expected_offset_pct") || 0),
      annual_home_usage_kwh: Number(formData.get("annual_home_usage_kwh") || 0),
      current_electric_rate: Number(formData.get("current_electric_rate") || 0),
      monthly_fixed_charges: Number(formData.get("monthly_fixed_charges") || 0),
      monthly_lease_payment: Number(formData.get("monthly_lease_payment") || 0),
      sunrun_escalator_pct: Number(formData.get("sunrun_escalator_pct") || 0),
      tree_removal_cost: Number(formData.get("tree_removal_cost") || 0)
    };
    await setDoc(doc(db, configCollectionName, configDocumentId), config, { merge: true });
    renderStatusAlert("settings-status", "Settings saved to Firebase Firestore.", "success");
  });
}

async function bootDashboard(db) {
  try {
    const state = await loadFirestoreState(db);
    await renderDashboard(
      state.entries.length ? state.entries : sampleEntries,
      state.config,
      buildStatus("Live Firebase data is connected in the browser.", "success", false)
    );
  } catch (error) {
    await renderDashboard(
      sampleEntries,
      mergeConfig(),
      buildStatus(
        "Browser Firebase could not load live data, so demo data is still being shown.",
        "warning",
        true
      )
    );
  }
}

async function bootEntries(db) {
  await handleEntryForm(db);
  try {
    const state = await loadFirestoreState(db);
    populateEntriesTable(state.entries.slice().reverse());
    renderStatusAlert("entries-status", "Live Firebase data is connected in the browser.", "success");
  } catch (error) {
    populateEntriesTable(sampleEntries.slice().reverse());
    renderStatusAlert(
      "entries-status",
      "Browser Firebase could not load live data, so demo entries are being shown.",
      "warning"
    );
  }
}

async function bootSettings(db) {
  await handleSettingsForm(db);
  try {
    const state = await loadFirestoreState(db);
    populateSettingsForm(state.config);
    renderStatusAlert("settings-status", "Live Firebase settings are connected in the browser.", "success");
  } catch (error) {
    populateSettingsForm(defaultConfig);
    renderStatusAlert(
      "settings-status",
      "Browser Firebase could not load live settings, so default values are being shown.",
      "warning"
    );
  }
}

async function bootPage() {
  let context;
  try {
    context = getFirebaseAppContext();
  } catch (error) {
    if (getPageName() === "dashboard") {
      await renderDashboard(
        sampleEntries,
        mergeConfig(),
        buildStatus(
          "Firebase browser setup is incomplete, so the dashboard is staying in demo mode.",
          "warning",
          true
        )
      );
    } else if (getPageName() === "entries") {
      populateEntriesTable(sampleEntries.slice().reverse());
      renderStatusAlert("entries-status", "Firebase browser setup is incomplete. Demo entries are shown.", "warning");
    } else if (getPageName() === "settings") {
      populateSettingsForm(defaultConfig);
      renderStatusAlert("settings-status", "Firebase browser setup is incomplete. Default settings are shown.", "warning");
    }
    return;
  }

  if (getPageName() === "dashboard") {
    await bootDashboard(context.db);
    return;
  }
  if (getPageName() === "entries") {
    await bootEntries(context.db);
    return;
  }
  if (getPageName() === "settings") {
    await bootSettings(context.db);
  }
}

bootPage();
