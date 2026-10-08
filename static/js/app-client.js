import { initializeApp } from "firebase/app";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  initializeFirestore,
  orderBy,
  query,
  runTransaction,
  setDoc as firebaseSetDoc
} from "firebase/firestore";

async function setDoc(reference, values, options) {
  if (reference.parent.id !== entryCollectionName) return firebaseSetDoc(reference, values, options);
  if (!activeFirestoreDb) throw new Error("Historical Entries is not connected to Firebase yet. Refresh the page and try again.");
  return runTransaction(activeFirestoreDb, async (transaction) => {
    const current = await transaction.get(reference);
    const existing = current.exists() ? current.data() : {};
    // A simulator can be running in a browser with an older in-memory copy of
    // this row.  Check the current Firestore document inside the transaction
    // so that stale automatic work can never replace a confirmed manual meter
    // reading.
    const preserveConfirmedMeters = existing.meter_values_confirmed === true
      && values.meter_values_confirmed === false;
    const protectedValues = preserveConfirmedMeters
      ? {
        ...values,
        meter_01_import_reading: existing.meter_01_import_reading,
        meter_02_export_reading: existing.meter_02_export_reading,
        meter_values_confirmed: true,
        meter_values_estimated: false,
        meter_values_calibrated: existing.meter_values_calibrated === true,
        estimated: existing.estimated === true
      }
      : values;
    const revisions = Array.isArray(existing.entry_revisions) ? existing.entry_revisions : [];
    const nextRevisions = current.exists()
      ? [{ saved_at: new Date().toISOString(), reason: "Before update", snapshot: revisionSnapshot(existing) }, ...revisions].slice(0, 50)
      : revisions;
    transaction.set(reference, { ...protectedValues, entry_revisions: nextRevisions }, options || {});
  });
}

function revisionSnapshot(entry) {
  const { entry_revisions, ...snapshot } = entry || {};
  return snapshot;
}

function revisionFingerprint(value) {
  if (Array.isArray(value)) return value.map(revisionFingerprint);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, revisionFingerprint(value[key])]));
  return value;
}

async function restoreEntryRevision(reference, snapshot, current, entryDate) {
  if (!snapshot || snapshot.entry_date !== entryDate) throw new Error("This saved version does not belong to the selected date.");
  if (!activeFirestoreDb) throw new Error("Historical Entries is not connected to Firebase yet. Refresh the page and try again.");
  await runTransaction(activeFirestoreDb, async (transaction) => {
    const latest = await transaction.get(reference);
    if (!latest.exists() || JSON.stringify(revisionFingerprint(latest.data())) !== JSON.stringify(revisionFingerprint(current))) throw new Error("This entry changed while you reviewed it. Close History and reopen it to review the latest values.");
    const existingRevisions = Array.isArray(latest.data().entry_revisions) ? latest.data().entry_revisions : [];
    const nextRevisions = [{ saved_at: new Date().toISOString(), reason: "Before restore", snapshot: revisionSnapshot(latest.data()) }, ...existingRevisions].slice(0, 50);
    transaction.set(reference, { ...snapshot, entry_date: entryDate, updated_at: new Date().toISOString(), entry_revisions: nextRevisions });
  });
}

async function showEntryHistory(entryDate) {
  const dialog = document.createElement("dialog");
  dialog.className = "entry-revision-dialog";
  dialog.innerHTML = `<header><h2>History · ${escapeHtml(entryDate)}</h2><button type="button" data-close>Close</button></header><p>Choose a saved version to compare its M01, M02, and solar production readings. Restoring also preserves the current version.</p><div data-content>Loading saved versions…</div>`;
  document.body.appendChild(dialog);
  dialog.querySelector("[data-close]").onclick = () => dialog.close();
  dialog.addEventListener("close", () => dialog.remove());
  dialog.showModal();
  const content = dialog.querySelector("[data-content]");
  if (!activeFirestoreDb) {
    content.textContent = "History is not ready yet. Refresh the page and try again.";
    return;
  }
  const reference = doc(activeFirestoreDb, entryCollectionName, entryDate);
  try {
    const currentDoc = await getDoc(reference);
    const current = currentDoc.data() || {};
    const versions = Array.isArray(current.entry_revisions) ? current.entry_revisions : [];
    if (!versions.length) { content.textContent = "No saved revisions yet. Current values will be preserved when this entry is next updated by the app."; return; }
    content.innerHTML = `<label>Saved version <select data-versions>${versions.map((version, index) => `<option value="${index}">${escapeHtml(new Date(version.saved_at).toLocaleString())} — ${escapeHtml(version.reason || "Before update")}</option>`).join("")}</select></label><div data-preview></div><button type="button" data-restore>Restore Selected Version</button><p role="status" data-status></p>`;
    const select = content.querySelector("[data-versions]");
    const displayReading = (value) => Number.isFinite(Number(value)) ? `${Number(value).toFixed(1)} kWh` : "—";
    const preview = () => {
      const snapshot = versions[Number(select.value)].snapshot;
      const readings = [
        ["M01 · Grid import", "meter_01_import_reading"],
        ["M02 · Grid export", "meter_02_export_reading"],
        ["Power · Solar production", "production_kwh"]
      ];
      content.querySelector("[data-preview]").innerHTML = `<div class="entry-revision-table"><table><thead><tr><th>Reading</th><th>Current</th><th>Selected version</th></tr></thead><tbody>${readings.map(([label, key]) => `<tr><th>${label}</th><td>${escapeHtml(displayReading(current[key]))}</td><td>${escapeHtml(displayReading(snapshot[key]))}</td></tr>`).join("")}</tbody></table></div>`;
    };
    select.onchange = preview;
    preview();
    content.querySelector("[data-restore]").onclick = async (event) => {
      const restoreButton = event.currentTarget;
      const status = content.querySelector("[data-status]");
      restoreButton.disabled = true;
      select.disabled = true;
      try {
        const snapshot = versions[Number(select.value)].snapshot;
        await restoreEntryRevision(reference, snapshot, current, entryDate);
        status.textContent = "Version restored. The previous values are saved in History.";
        window.dispatchEvent(new CustomEvent("solar-entry-restored"));
      } catch (error) {
        status.textContent = `Could not complete restore: ${error.message}`;
        restoreButton.disabled = false;
        select.disabled = false;
      }
    };
  } catch (error) { content.textContent = `Could not load history: ${error.message}`; }
}

const dashboardRenderUrl = "/api/render/dashboard";

async function renderDashboardUnified(entries, config, firebaseStatus) {
  const target = document.getElementById("dashboard-root");
  if (!target) {
    return;
  }

  const displayEntries = buildFileBackedDashboardEntries(entries);
  const metricsEntries = buildComputedEntries(displayEntries, config);

  try {
    const metrics = calculateDashboardMetricsClient(metricsEntries, config);
    const alerts = buildAlertsClient(metricsEntries, config);
    dashboardAiState.entries = metricsEntries;
    dashboardAiState.config = config;
    dashboardAiState.metrics = metrics;
    target.innerHTML = renderDashboardHtmlClient(
      metricsEntries,
      metrics,
      config,
      firebaseStatus,
      alerts
    );
    setupDashboardViewToggle();
    setupAiAssistant();
    renderDashboardChartsClient(metricsEntries, config);
    setupChartPopouts(target);
    setupValidatedLocalDashboardLinks(target);
    window.initializeSolarPathTrackers?.(target);
  } catch (error) {
    console.error("Dashboard rendering error", error);
    setupChartPopouts(target);
  }
}
const entryCollectionName = "solar_daily_entries";
const configCollectionName = "solar_tracker_config";
const configDocumentId = "primary";
// The NYSEG CSV is the sole source for cumulative M01/M02 values. Dates after
// this server-confirmed endpoint stay pending until the next reviewed import.
let validatedNysegThrough = "";
const meterSimulationMonitorStartMinute = 0;
const meterSimulationMonitorEndMinute = 23 * 60 + 59;
const meterSimulationMonitorIntervalMinutes = 5;
const dailyAutoCreateHour = 6;
const dailyAutoCreateMinute = 30;
const oneTimeManualAutoCreateDate = "2026-07-22";
const oneTimeManualAutoCreateStorageKey = "solar-one-time-autocreate-2026-07-22";
const yorktownHeightsLocation = {
  latitude: 41.2706,
  longitude: -73.7774,
  label: "Yorktown Heights, NY",
  timezone: "America/New_York"
};
const WEATHER_FACTORS = {
  Sunny: 1.05,
  Cloudy: 0.82,
  Smoke: 0.72,
  Rain: 0.58,
  Snow: 0.45,
  Overcast: 0.64,
  "Extreme Heat": 0.92,
  Wind: 0.95,
  Unknown: 0.8
};
const entryLookupOverrides = {
  "2026-07-21": {
    irradiance_peak_wm2: 460,
    production_kwh: 36.5,
    weather: "Overcast",
    temperature_f: 77,
    temperature_high_f: 77,
    temperature_low_f: 68,
    humidity_pct: 72,
    cloud_cover_pct: 85,
    wind_mph: 12,
    notes: "Estimated from Yorktown Heights forecast: overcast conditions with late thunderstorms expected. Update with actual production and meter readings when available."
  },
  "2026-07-22": {
    irradiance_peak_wm2: 922,
    production_kwh: 29.2,
    meter_01_import_reading: 126,
    meter_02_export_reading: 305,
    weather: "Sunny",
    temperature_f: 72.5,
    temperature_high_f: 79,
    temperature_low_f: 66,
    humidity_pct: 57,
    cloud_cover_pct: 22,
    wind_mph: 9,
    notes: "Estimated placeholder based on recent weather and meter progression. Replace with actual Sunrun and NYSEG values when available."
  }
};
const recentHistoricalBackfillEntries = [
  {
    entry_date: "2026-07-21",
    irradiance_peak_wm2: 460,
    production_kwh: 36.5,
    meter_01_import_reading: 107,
    meter_02_export_reading: 250,
    weather: "Overcast",
    temperature_f: 70.5,
    temperature_high_f: 76,
    temperature_low_f: 65,
    humidity_pct: 72,
    cloud_cover_pct: 85,
    wind_mph: 12,
    estimated: true,
    lookup_source: "override",
    notes: "Estimated from Yorktown Heights forecast: overcast conditions with late thunderstorms expected. Update with actual production and meter readings when available."
  },
  {
    entry_date: "2026-07-22",
    irradiance_peak_wm2: 922,
    production_kwh: 29.2,
    meter_01_import_reading: 126,
    meter_02_export_reading: 305,
    weather: "Sunny",
    temperature_f: 72.5,
    temperature_high_f: 79,
    temperature_low_f: 66,
    humidity_pct: 57,
    cloud_cover_pct: 22,
    wind_mph: 9,
    estimated: true,
    lookup_source: "override",
    notes: "Estimated placeholder based on recent weather and meter progression. Replace with actual Sunrun and NYSEG values when available."
  },
  {
    entry_date: "2026-07-23",
    irradiance_peak_wm2: 367,
    production_kwh: 5.0,
    meter_01_import_reading: 137.3,
    meter_02_export_reading: 343.4,
    weather: "Sunny",
    temperature_high_f: 83,
    temperature_low_f: 68,
    estimated: true,
    lookup_source: "intraday-placeholder",
    notes: "Live intraday placeholder for Thursday, July 23, 2026. Replace with actual end-of-day production and meter readings."
  }
];

const bootstrap = window.SOLAR_BOOTSTRAP || {};
const trackerTodayBootstrap = /^\d{4}-\d{2}-\d{2}$/.test(String(bootstrap.tracker_today || ""))
  ? String(bootstrap.tracker_today)
  : "";
const sampleEntries = Array.isArray(bootstrap.sample_entries) ? bootstrap.sample_entries : [];
const defaultConfig = bootstrap.default_config || {};
const aiBootstrapStatus = bootstrap.ai_status || {};
const historicalUsageBootstrap = bootstrap.historical_usage || {};
const monthlyBillBootstrap = bootstrap.monthly_bill || {};
const sunrunProductionBootstrap = bootstrap.sunrun_production || { available: false, by_date: {} };
const nysegIntervalBootstrap = bootstrap.nyseg_interval || { available: false, daily: [] };
const dashboardCompactModeStorageKey = "solar-dashboard-compact-mode";
const localSnapshotSyncStorageKey = "solar-local-json-last-sync-hour";
const entriesSnapshotStorageKey = "solar-data-entry-snapshot-v1";
const localSnapshotSyncStartHour = 9;
const localSnapshotSyncEndHour = 20;
let localSnapshotSyncTimer = null;
let meterSimulationSyncTimer = null;
let dailyEntryAutoCreateTimer = null;
let meterSimulationLastAttemptedRunKey = "";
let meterSimulationCheckpoints = [];
let entriesPageState = {
  entries: [],
  selectedDate: "",
  monthFilter: "All",
  weatherFilter: "All",
  config: mergeConfig()
};
let activeFirestoreDb = null;
const meterSimulationSchedule = [
  { label: "9:00 AM", hour: 9, minute: 0, importWeight: 0.00, exportWeight: 0.00 },
  { label: "11:00 AM", hour: 11, minute: 0, importWeight: 0.30, exportWeight: 0.20 },
  { label: "1:00 PM", hour: 13, minute: 0, importWeight: 0.55, exportWeight: 0.45 },
  { label: "3:00 PM", hour: 15, minute: 0, importWeight: 0.72, exportWeight: 0.68 },
  { label: "5:00 PM", hour: 17, minute: 0, importWeight: 0.86, exportWeight: 0.88 },
  { label: "7:00 PM", hour: 19, minute: 0, importWeight: 0.96, exportWeight: 0.97 },
  { label: "8:00 PM", hour: 20, minute: 0, importWeight: 1.00, exportWeight: 1.00 }
];
const meterImportProfiles = {
  Sunny: [0.70, 0.70, 0.70, 0.70, 0.72, 0.86, 1.00],
  Cloudy: [0.58, 0.63, 0.69, 0.76, 0.84, 0.93, 1.00],
  Wet: [0.52, 0.60, 0.68, 0.77, 0.85, 0.94, 1.00],
  Unknown: [0.58, 0.64, 0.70, 0.77, 0.85, 0.94, 1.00]
};
let dashboardAiState = {
  entries: [],
  config: defaultConfig,
  metrics: null,
  openaiConfigured: Boolean(aiBootstrapStatus.openai_configured),
  historicalUsage: historicalUsageBootstrap,
  monthlyBill: monthlyBillBootstrap
};

function getPageName() {
  return document.body?.dataset?.page || "";
}

function isLocalSnapshotMode() {
  return String(document.body?.dataset?.localSnapshotMode || "false") === "true";
}

function isStaticSite() {
  return Boolean(window.SOLAR_STATIC_SITE);
}

function getAssetBase() {
  return window.SOLAR_ASSET_BASE || "/static";
}

function getAssetUrl(path) {
  return `${getAssetBase().replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

function getTodayIsoDate() {
  if (trackerTodayBootstrap) {
    return trackerTodayBootstrap;
  }
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: yorktownHeightsLocation.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  const dateParts = Object.fromEntries(
    formatter.formatToParts(new Date())
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
  return `${dateParts.year}-${dateParts.month}-${dateParts.day}`;
}

function shiftIsoDate(isoDate, offsetDays) {
  const dateValue = new Date(`${isoDate}T00:00:00`);
  dateValue.setDate(dateValue.getDate() + offsetDays);
  const year = dateValue.getFullYear();
  const month = String(dateValue.getMonth() + 1).padStart(2, "0");
  const day = String(dateValue.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatIsoWeekday(isoDate) {
  const match = String(isoDate || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return "-";
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString("en-US", {
    weekday: "short"
  });
}

function formatIsoDateForDisplay(isoDate) {
  const match = String(isoDate || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return String(isoDate || "Unknown date");
  const [, year, month, day] = match;
  return new Date(Number(year), Number(month) - 1, Number(day)).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric"
  });
}

function shouldHideEntryFromDisplay(entry) {
  if (!entry) return true;
  const entryDate = String(entry.entry_date || "");
  const todayIsoDate = getTodayIsoDate();
  return entryDate > todayIsoDate;
}

function getDisplayEntries(entries) {
  return sortEntries(entries).filter((entry) => !shouldHideEntryFromDisplay(entry));
}

function isAtOrAfterAutoCreateTime(now = new Date()) {
  const hours = now.getHours();
  const minutes = now.getMinutes();
  return hours > dailyAutoCreateHour || (hours === dailyAutoCreateHour && minutes >= dailyAutoCreateMinute);
}

function shouldRunOneTimeManualAutoCreate(entryDate = getTodayIsoDate()) {
  if (String(entryDate) !== oneTimeManualAutoCreateDate) {
    return false;
  }
  try {
    return window.localStorage.getItem(oneTimeManualAutoCreateStorageKey) !== "done";
  } catch (error) {
    return true;
  }
}

function markOneTimeManualAutoCreateComplete() {
  try {
    window.localStorage.setItem(oneTimeManualAutoCreateStorageKey, "done");
  } catch (error) {
    // Ignore storage failures and allow the normal schedule to continue.
  }
}

function isPastIsoDate(entryDate) {
  return String(entryDate) < String(getTodayIsoDate());
}

function daysBeforeToday(entryDate) {
  const entryTime = Date.parse(`${entryDate}T12:00:00Z`);
  const todayTime = Date.parse(`${getTodayIsoDate()}T12:00:00Z`);
  if (!Number.isFinite(entryTime) || !Number.isFinite(todayTime)) return null;
  return Math.round((todayTime - entryTime) / 86_400_000);
}

function useRecentForecastHistory(entryDate) {
  const ageInDays = daysBeforeToday(entryDate);
  return ageInDays !== null && ageInDays >= 0 && ageInDays <= 5;
}

function mapWeatherCodeToLabel(code) {
  const value = Number(code);
  if ([0, 1].includes(value)) return "Sunny";
  if ([2, 3, 45, 48].includes(value)) return "Cloudy";
  if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(value)) return "Rain";
  if ([71, 73, 75, 77, 85, 86].includes(value)) return "Snow";
  if ([95, 96, 99].includes(value)) return "Wind";
  return "Unknown";
}

function averageNumericValues(values) {
  const valid = values.filter((value) => Number.isFinite(Number(value)));
  return valid.length ? mean(valid.map((value) => Number(value))) : null;
}

function maxNumericValue(values) {
  const valid = values.filter((value) => Number.isFinite(Number(value)));
  return valid.length ? Math.max(...valid.map((value) => Number(value))) : null;
}

function minNumericValue(values) {
  const valid = values.filter((value) => Number.isFinite(Number(value)));
  return valid.length ? Math.min(...valid.map((value) => Number(value))) : null;
}

function pickDominantWeatherLabel(labels) {
  if (!labels.length) return "Unknown";
  const counts = new Map();
  labels.forEach((label) => {
    counts.set(label, (counts.get(label) || 0) + 1);
  });
  return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] || "Unknown";
}

async function fetchOpenMeteoLookupValues(entryDate) {
  const hourlyFields = [
    "shortwave_radiation",
    "shortwave_radiation_instant",
    "temperature_2m",
    "relative_humidity_2m",
    "cloud_cover",
    "wind_speed_10m",
    "weather_code"
  ];
  const useArchive = isPastIsoDate(entryDate) && !useRecentForecastHistory(entryDate);
  const baseUrl = useArchive
    ? "https://archive-api.open-meteo.com/v1/archive"
    : "https://api.open-meteo.com/v1/forecast";

  const url = new URL(baseUrl);
  url.searchParams.set("latitude", String(yorktownHeightsLocation.latitude));
  url.searchParams.set("longitude", String(yorktownHeightsLocation.longitude));
  url.searchParams.set("hourly", hourlyFields.join(","));
  url.searchParams.set("daily", "sunrise,sunset");
  url.searchParams.set("temperature_unit", "fahrenheit");
  url.searchParams.set("wind_speed_unit", "mph");
  url.searchParams.set("timezone", yorktownHeightsLocation.timezone);

  if (isPastIsoDate(entryDate)) {
    url.searchParams.set("start_date", entryDate);
    url.searchParams.set("end_date", entryDate);
  } else {
    url.searchParams.set("forecast_days", "16");
  }

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Open-Meteo request failed with status ${response.status}`);
  }

  const payload = await response.json();
  const hourly = payload?.hourly;
  if (!hourly?.time?.length) {
    throw new Error("Open-Meteo response did not include hourly data");
  }

  const dayPrefix = `${entryDate}T`;
  const matchingIndexes = hourly.time
    .map((timeValue, index) => (String(timeValue).startsWith(dayPrefix) ? index : -1))
    .filter((index) => index >= 0);

  if (!matchingIndexes.length) {
    throw new Error(`Open-Meteo returned no hourly rows for ${entryDate}`);
  }

  const shortwaveValues = matchingIndexes.map((index) => Number(
    hourly.shortwave_radiation_instant?.[index] ?? hourly.shortwave_radiation?.[index] ?? 0
  ));
  const temperatureValues = matchingIndexes.map((index) => Number(hourly.temperature_2m?.[index]));
  const humidityValues = matchingIndexes.map((index) => Number(hourly.relative_humidity_2m?.[index]));
  const cloudValues = matchingIndexes.map((index) => Number(hourly.cloud_cover?.[index]));
  const windValues = matchingIndexes.map((index) => Number(hourly.wind_speed_10m?.[index]));
  const irradianceHourlyProfile = matchingIndexes.map((index) => {
    const timestamp = String(hourly.time?.[index] || "");
    const timeMatch = /T(\d{2}):(\d{2})/.exec(timestamp);
    return {
      minute_of_day: timeMatch ? Number(timeMatch[1]) * 60 + Number(timeMatch[2]) : 0,
      irradiance_wm2: Number(
        hourly.shortwave_radiation_instant?.[index] ?? hourly.shortwave_radiation?.[index] ?? 0
      ),
      cloud_cover_pct: parseOptionalNumber(hourly.cloud_cover?.[index])
    };
  });
  const daylightIndexes = matchingIndexes.filter((index) => Number(hourly.shortwave_radiation?.[index] ?? 0) > 0);
  const weatherIndexes = daylightIndexes.length ? daylightIndexes : matchingIndexes;
  const weatherLabels = weatherIndexes.map((index) => mapWeatherCodeToLabel(hourly.weather_code?.[index]));
  const peakIrradiance = Math.round(maxNumericValue(shortwaveValues) || 0);
  const sourceKind = useArchive
    ? "historical archive"
    : isPastIsoDate(entryDate)
      ? "recent forecast-history"
      : "forecast";
  const dailyIndex = Array.isArray(payload?.daily?.time)
    ? payload.daily.time.findIndex((value) => String(value) === String(entryDate))
    : -1;
  const sunriseTime = dailyIndex >= 0 ? String(payload.daily.sunrise?.[dailyIndex] || "") : "";
  const sunsetTime = dailyIndex >= 0 ? String(payload.daily.sunset?.[dailyIndex] || "") : "";

  return {
    irradiance_peak_wm2: peakIrradiance,
    irradiance_hourly_profile: irradianceHourlyProfile,
    weather: pickDominantWeatherLabel(weatherLabels),
    temperature_f: roundToStep(averageNumericValues(temperatureValues), 1),
    temperature_high_f: roundToStep(maxNumericValue(temperatureValues), 1),
    temperature_low_f: roundToStep(minNumericValue(temperatureValues), 1),
    humidity_pct: roundToStep(averageNumericValues(humidityValues), 1),
    cloud_cover_pct: roundToStep(averageNumericValues(cloudValues), 1),
    wind_mph: roundToStep(maxNumericValue(windValues), 1),
    sunrise_time: sunriseTime,
    sunset_time: sunsetTime,
    lookup_source: `open-meteo-${isPastIsoDate(entryDate) ? "historical" : "forecast"}`,
    notes: `Auto-filled from Open-Meteo ${sourceKind} data for ${yorktownHeightsLocation.label}. Irradiance is the full local day's peak instantaneous global horizontal irradiance (GHI).`
  };
}

function sortEntries(entries) {
  return [...entries].sort((left, right) => String(left.entry_date).localeCompare(String(right.entry_date)));
}

function sum(values) {
  return values.reduce((total, value) => total + Number(value || 0), 0);
}

function mean(values) {
  return values.length ? sum(values) / values.length : 0;
}

function mergeConfig(config = {}) {
  return { ...defaultConfig, ...config };
}

function normalizeMeterSimulationCheckpoints(checkpoints) {
  return (Array.isArray(checkpoints) ? checkpoints : [])
    .map((checkpoint) => ({
      entry_date: String(checkpoint.entry_date || ""),
      checkpoint_time: String(checkpoint.checkpoint_time || ""),
      minute_of_day: Number(checkpoint.minute_of_day),
      weather_bucket: normalizeWeatherBucket(checkpoint.weather_bucket),
      predicted_m01: Number(checkpoint.predicted_m01),
      predicted_m02: Number(checkpoint.predicted_m02),
      actual_m01: Number(checkpoint.actual_m01),
      actual_m02: Number(checkpoint.actual_m02),
      base_m01: parseOptionalNumber(checkpoint.base_m01),
      base_m02: parseOptionalNumber(checkpoint.base_m02),
      irradiance_peak_wm2: parseOptionalNumber(checkpoint.irradiance_peak_wm2),
      cloud_cover_pct: parseOptionalNumber(checkpoint.cloud_cover_pct),
      humidity_pct: parseOptionalNumber(checkpoint.humidity_pct),
      import_error: Number(checkpoint.import_error),
      export_error: Number(checkpoint.export_error),
      recorded_at: String(checkpoint.recorded_at || "")
    }))
    .filter((checkpoint) => (
      checkpoint.entry_date &&
      Number.isFinite(checkpoint.minute_of_day) &&
      Number.isFinite(checkpoint.import_error) &&
      Number.isFinite(checkpoint.export_error) &&
      Math.abs(checkpoint.import_error) <= 75 &&
      Math.abs(checkpoint.export_error) <= 150
    ))
    .slice(-200);
}

function hasValidatedNysegMeters(entryDate) {
  return !validatedNysegThrough || String(entryDate || "") <= validatedNysegThrough;
}

async function loadValidatedNysegThrough() {
  if (isStaticSite()) return "";
  try {
    const response = await fetch("/api/nyseg-meter-intervals");
    const payload = await response.json();
    validatedNysegThrough = response.ok && payload?.available && /^\d{4}-\d{2}-\d{2}$/.test(payload.source_end || "")
      ? payload.source_end
      : "";
  } catch (error) {
    console.warn("Could not determine the latest validated NYSEG date.", error);
    validatedNysegThrough = "";
  }
  return validatedNysegThrough;
}

function parseOptionalNumber(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string" && value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function roundToStep(value, decimals = 1) {
  const parsed = parseOptionalNumber(value);
  if (parsed === null) return null;
  return Number(parsed.toFixed(decimals));
}

function formatFormFieldValue(key, value) {
  if (value === null || value === undefined) return "";
  if (
    [
      "irradiance_peak_wm2",
      "production_kwh",
      "meter_01_import_reading",
      "meter_02_export_reading",
      "temperature_f",
      "temperature_high_f",
      "temperature_low_f",
      "humidity_pct",
      "cloud_cover_pct",
      "wind_mph"
    ].includes(key)
  ) {
    const rounded = roundToStep(value, 1);
    return rounded ?? "";
  }
  return value;
}

function normalizeEntry(entry) {
  return {
    entry_date: entry.entry_date,
    irradiance_peak_wm2: Number(entry.irradiance_peak_wm2 || 0),
    production_kwh: Number(entry.production_kwh || 0),
    meter_01_import_reading: Number(entry.meter_01_import_reading || 0),
    meter_02_export_reading: Number(entry.meter_02_export_reading || 0),
    weather: entry.weather || "Unknown",
    temperature_f: parseOptionalNumber(entry.temperature_f),
    temperature_high_f: parseOptionalNumber(entry.temperature_high_f),
    temperature_low_f: parseOptionalNumber(entry.temperature_low_f),
    humidity_pct: parseOptionalNumber(entry.humidity_pct),
    cloud_cover_pct: parseOptionalNumber(entry.cloud_cover_pct),
    wind_mph: parseOptionalNumber(entry.wind_mph),
    sunrise_time: entry.sunrise_time || "",
    sunset_time: entry.sunset_time || "",
    notes: entry.notes || "",
    notes_manual: Boolean(entry.notes_manual),
    estimated: Boolean(entry.estimated),
    lookup_source: entry.lookup_source || "",
    irradiance_method: entry.irradiance_method || "",
    irradiance_verified_at: entry.irradiance_verified_at || "",
    irradiance_hourly_profile: (Array.isArray(entry.irradiance_hourly_profile)
      ? entry.irradiance_hourly_profile
      : [])
      .map((point) => ({
        minute_of_day: Number(point.minute_of_day || 0),
        irradiance_wm2: Math.max(0, Number(point.irradiance_wm2 || 0)),
        cloud_cover_pct: parseOptionalNumber(point.cloud_cover_pct)
      }))
      .filter((point) => Number.isFinite(point.minute_of_day) && Number.isFinite(point.irradiance_wm2))
      .sort((left, right) => left.minute_of_day - right.minute_of_day)
      .slice(0, 48),
    meter_values_estimated: Boolean(entry.meter_values_estimated),
    meter_values_confirmed: Boolean(entry.meter_values_confirmed),
    meter_values_calibrated: Boolean(entry.meter_values_calibrated),
    meter_simulation_weather: entry.meter_simulation_weather || "",
    meter_simulation_basis: entry.meter_simulation_basis || "",
    meter_simulation_updated_at: entry.meter_simulation_updated_at || "",
    meter_simulation_schedule_key: entry.meter_simulation_schedule_key || "",
    meter_simulation_schedule_label: entry.meter_simulation_schedule_label || "",
    meter_simulation_run_key: entry.meter_simulation_run_key || "",
    meter_simulation_run_label: entry.meter_simulation_run_label || "",
    meter_simulation_run_type: entry.meter_simulation_run_type || "",
    meter_simulation_model_signature: entry.meter_simulation_model_signature || "",
    meter_simulation_runs: Array.isArray(entry.meter_simulation_runs)
      ? entry.meter_simulation_runs
        .filter((run) => run && run.run_key)
        .map((run) => ({
          run_key: String(run.run_key),
          run_label: run.run_label || "",
          run_type: run.run_type || "incremental",
          minute_of_day: Number(run.minute_of_day || 0),
          meter_01_import_reading: Number(run.meter_01_import_reading || 0),
          meter_02_export_reading: Number(run.meter_02_export_reading || 0),
          previous_meter_01_import_reading: parseOptionalNumber(run.previous_meter_01_import_reading),
          previous_meter_02_export_reading: parseOptionalNumber(run.previous_meter_02_export_reading),
          weather: run.weather || "Unknown",
          irradiance_peak_wm2: Number(run.irradiance_peak_wm2 || 0),
          cloud_cover_pct: parseOptionalNumber(run.cloud_cover_pct),
          humidity_pct: parseOptionalNumber(run.humidity_pct),
          wind_mph: parseOptionalNumber(run.wind_mph),
          model_basis: run.model_basis || "",
          calibration_basis: run.calibration_basis || "",
          overnight_import_kwh: Number(run.overnight_import_kwh || 0),
          overnight_basis: run.overnight_basis || "",
          sunrise_time: run.sunrise_time || "",
          sunset_time: run.sunset_time || "",
          solar_window_basis: run.solar_window_basis || "",
          recorded_at: run.recorded_at || ""
        }))
        .sort((left, right) => left.minute_of_day - right.minute_of_day)
      : [],
    created_at: entry.created_at || "",
    updated_at: entry.updated_at || ""
  };
}

function getSunrunProductionRecord(entryDate) {
  return sunrunProductionBootstrap?.by_date?.[String(entryDate)] || null;
}

function getNysegIntervalRecord(entryDate) {
  return (nysegIntervalBootstrap?.daily || []).find((record) => String(record.date) === String(entryDate)) || null;
}

function getDashboardFileThroughDate() {
  const twoDaysAgo = shiftIsoDate(getTodayIsoDate(), -2);
  const sunrunDate = String(sunrunProductionBootstrap?.latest_available_date || "");
  const nysegDate = String(nysegIntervalBootstrap?.source_end || "");
  const candidates = [twoDaysAgo, sunrunDate, nysegDate]
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value));
  return candidates.length === 3 ? candidates.sort()[0] : "";
}

function buildFileBackedDashboardEntries(entries) {
  const fileThroughDate = getDashboardFileThroughDate();
  if (!fileThroughDate) return [];
  return sortEntries(entries)
    .filter((entry) => {
      const entryDate = String(entry.entry_date || "");
      const sunrun = getSunrunProductionRecord(entryDate);
      return entryDate <= fileThroughDate && Boolean(sunrun?.available) && Boolean(getNysegIntervalRecord(entryDate));
    })
    .map((entry) => normalizeEntry({
      ...entry,
      production_kwh: Number(getSunrunProductionRecord(entry.entry_date)?.production_kwh || 0),
      estimated: false,
      lookup_source: "source-files"
    }));
}

function applySunrunProductionToEntry(entry) {
  const normalized = normalizeEntry(entry);
  const sunrunRecord = getSunrunProductionRecord(normalized.entry_date);
  if (!sunrunRecord || !sunrunRecord.available) {
    return normalized;
  }

  return normalizeEntry({
    ...normalized,
    production_kwh: Number(sunrunRecord.production_kwh || normalized.production_kwh || 0),
    estimated: false
  });
}

function applySunrunProductionToEntries(entries) {
  return sortEntries(entries.map((entry) => applySunrunProductionToEntry(entry)));
}

function isPlaceholderLikeEntry(entry) {
  return (
    Number(entry.production_kwh || 0) === 0 &&
    Number(entry.irradiance_peak_wm2 || 0) === 0 &&
    Number(entry.meter_01_import_reading || 0) === 0 &&
    Number(entry.meter_02_export_reading || 0) === 0 &&
    (entry.weather || "Unknown") === "Unknown" &&
    !entry.estimated
  );
}

function buildFallbackLookupValues(entryDate, entries) {
  const shiftIsoDate = (isoDate, offsetDays) => {
    const dateValue = new Date(`${isoDate}T00:00:00`);
    dateValue.setDate(dateValue.getDate() + offsetDays);
    const year = dateValue.getFullYear();
    const month = String(dateValue.getMonth() + 1).padStart(2, "0");
    const day = String(dateValue.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  };

  const todayIsoDate = getTodayIsoDate();
  const yesterdayIsoDate = shiftIsoDate(todayIsoDate, -1);
  const analogDate =
    String(entryDate) === todayIsoDate
      ? shiftIsoDate(todayIsoDate, -3)
      : String(entryDate) === yesterdayIsoDate
        ? shiftIsoDate(todayIsoDate, -4)
        : null;

  const analogEntry = analogDate
    ? entries.find((entry) => String(entry.entry_date) === String(analogDate))
    : null;

  if (analogEntry) {
    return {
      irradiance_peak_wm2: Math.round(Number(analogEntry.irradiance_peak_wm2 || 0) * 0.96),
      production_kwh: Number(Number(analogEntry.production_kwh || 0).toFixed(1)),
      weather: analogEntry.weather || "Unknown",
      temperature_f: analogEntry.temperature_f ?? null,
      temperature_high_f: analogEntry.temperature_high_f ?? analogEntry.temperature_f ?? null,
      temperature_low_f: analogEntry.temperature_low_f ?? analogEntry.temperature_f ?? null,
      humidity_pct: analogEntry.humidity_pct ?? null,
      cloud_cover_pct: analogEntry.cloud_cover_pct ?? null,
      wind_mph: analogEntry.wind_mph ?? null,
      lookup_source: "fallback-analog-day",
      notes: `Estimated placeholder aligned to recent analog day (${analogEntry.entry_date}) so the latest dashboard production stays closer to the recent pattern until SunRun publishes the actual day.`
    };
  }

  const previousEntry = getMostRecentEntryBefore(entries, entryDate);
  if (!previousEntry) {
    return {
      irradiance_peak_wm2: 600,
      production_kwh: 42,
      weather: "Unknown",
      temperature_f: null,
      temperature_high_f: null,
      temperature_low_f: null,
      humidity_pct: null,
      cloud_cover_pct: null,
      wind_mph: null,
      lookup_source: "fallback-default",
      notes: "Estimated placeholder created from default lookup values. Update with actual weather and production data."
    };
  }

  return {
    irradiance_peak_wm2: Math.round(Number(previousEntry.irradiance_peak_wm2 || 0) * 0.82),
    production_kwh: Number((Number(previousEntry.production_kwh || 0) * 0.8).toFixed(1)),
    weather: previousEntry.weather || "Unknown",
    temperature_f: previousEntry.temperature_f ?? null,
    temperature_high_f: previousEntry.temperature_high_f ?? previousEntry.temperature_f ?? null,
    temperature_low_f: previousEntry.temperature_low_f ?? previousEntry.temperature_f ?? null,
    humidity_pct: previousEntry.humidity_pct ?? null,
    cloud_cover_pct: previousEntry.cloud_cover_pct ?? null,
    wind_mph: previousEntry.wind_mph ?? null,
    lookup_source: "fallback-prior-entry",
    notes: `Estimated placeholder created from the most recent prior entry (${previousEntry.entry_date}). Update with actual values when available.`
  };
}

async function buildEstimatedLookupValues(entryDate, entries) {
  const fallbackValues = buildFallbackLookupValues(entryDate, entries);

  try {
    const liveValues = await fetchOpenMeteoLookupValues(entryDate);
    return {
      ...fallbackValues,
      ...liveValues,
      production_kwh: fallbackValues.production_kwh
    };
  } catch (error) {
    if (entryLookupOverrides[entryDate]) {
      return {
        ...entryLookupOverrides[entryDate],
        lookup_source: "override"
      };
    }
    return {
      ...fallbackValues,
      lookup_source: fallbackValues.lookup_source || "fallback",
      notes: `${fallbackValues.notes} Open-Meteo auto-fill was unavailable, so fallback estimates were used.`
    };
  }
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
  if (!activeFirestoreDb) {
    const app = initializeApp(config);
    activeFirestoreDb = initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true
    });
  }
  return { db: activeFirestoreDb };
}

function withTimeout(promise, timeoutMs, message) {
  let timeoutId;
  const timeout = new Promise((resolve, reject) => {
    timeoutId = window.setTimeout(() => reject(new Error(message)), timeoutMs);
  });
  return Promise.race([promise, timeout]).finally(() => window.clearTimeout(timeoutId));
}

function entryNeedsTemperatureBackfill(entry) {
  return (
    parseOptionalNumber(entry?.temperature_high_f) === null ||
    parseOptionalNumber(entry?.temperature_low_f) === null
  );
}

function hasFirestoreRestValue(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function decodeFirestoreRestValue(value) {
  if (!value || typeof value !== "object") return value;
  if (hasFirestoreRestValue(value, "nullValue")) return null;
  if (hasFirestoreRestValue(value, "booleanValue")) return value.booleanValue;
  if (hasFirestoreRestValue(value, "integerValue") || hasFirestoreRestValue(value, "doubleValue")) return Number(value.integerValue ?? value.doubleValue);
  if (hasFirestoreRestValue(value, "stringValue")) return value.stringValue;
  if (hasFirestoreRestValue(value, "timestampValue")) return value.timestampValue;
  if (hasFirestoreRestValue(value, "arrayValue")) return (value.arrayValue.values || []).map(decodeFirestoreRestValue);
  if (hasFirestoreRestValue(value, "mapValue")) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, item]) => [key, decodeFirestoreRestValue(item)]));
  return value;
}

function decodeFirestoreRestDocument(document) {
  return Object.fromEntries(Object.entries(document?.fields || {}).map(([key, value]) => [key, decodeFirestoreRestValue(value)]));
}

async function loadFirestoreRestState() {
  const config = window.SOLAR_FIREBASE_CONFIG || {};
  const baseUrl = `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(config.projectId)}/databases/(default)/documents`;
  const key = encodeURIComponent(config.apiKey || "");
  const [configResponse, entriesResponse] = await Promise.all([
    fetch(`${baseUrl}/${configCollectionName}/${configDocumentId}?key=${key}`, { cache: "no-store" }),
    fetch(`${baseUrl}/${entryCollectionName}?orderBy=entry_date&pageSize=500&key=${key}`, { cache: "no-store" })
  ]);
  if (!configResponse.ok || !entriesResponse.ok) {
    throw new Error(`Firebase HTTPS read failed (${configResponse.status}/${entriesResponse.status}).`);
  }
  const [configDocument, entriesPayload] = await Promise.all([configResponse.json(), entriesResponse.json()]);
  const resolvedConfig = mergeConfig(decodeFirestoreRestDocument(configDocument));
  meterSimulationCheckpoints = normalizeMeterSimulationCheckpoints(resolvedConfig.meter_simulation_checkpoints);
  const entries = (entriesPayload.documents || []).map((document) => {
    const values = decodeFirestoreRestDocument(document);
    return normalizeEntry({ entry_date: values.entry_date || document.name.split("/").pop(), ...values });
  });
  return { config: resolvedConfig, entries: applySunrunProductionToEntries(entries), connection: "rest" };
}

async function loadFirestoreState(db) {
  try {
    const configSnapshot = await withTimeout(getDoc(doc(db, configCollectionName, configDocumentId)), 8000, "Firebase SDK configuration request timed out.");
    const config = configSnapshot.exists() ? mergeConfig(configSnapshot.data()) : mergeConfig();
    meterSimulationCheckpoints = normalizeMeterSimulationCheckpoints(config.meter_simulation_checkpoints);
    const entryQuery = query(collection(db, entryCollectionName), orderBy("entry_date"));
    const entrySnapshot = await withTimeout(getDocs(entryQuery), 8000, "Firebase SDK entries request timed out.");
    const entries = entrySnapshot.docs.map((docSnapshot) => normalizeEntry({ entry_date: docSnapshot.data().entry_date || docSnapshot.id, ...docSnapshot.data() }));
    return { config, entries: applySunrunProductionToEntries(entries), connection: "sdk" };
  } catch (sdkError) {
    try {
      return await loadFirestoreRestState();
    } catch (restError) {
      throw new Error(`Firebase SDK and HTTPS reads both failed. ${restError.message}`);
    }
  }
}

function setEntriesFirebaseStatus(kind, message) {
  const target = document.getElementById("entries-firebase-status");
  if (!target) return;
  target.className = `entries-firebase-status entries-firebase-status-${kind}`;
  target.textContent = message;
}

function saveEntriesSnapshot(entries, config) {
  const snapshot = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    entries,
    config
  };
  try {
    window.localStorage.setItem(entriesSnapshotStorageKey, JSON.stringify(snapshot));
    return snapshot;
  } catch (error) {
    console.warn("Data Entry JSON snapshot was not saved:", error);
    return null;
  }
}

function loadEntriesSnapshot() {
  try {
    const rawSnapshot = window.localStorage.getItem(entriesSnapshotStorageKey);
    if (!rawSnapshot) return null;
    const snapshot = JSON.parse(rawSnapshot);
    if (!Array.isArray(snapshot?.entries) || !snapshot.entries.length) return null;
    return snapshot;
  } catch (error) {
    console.warn("Data Entry JSON snapshot could not be read:", error);
    return null;
  }
}

function formatEntriesSnapshotDate(snapshot) {
  const date = new Date(snapshot?.generated_at || "");
  return Number.isNaN(date.getTime()) ? "an earlier session" : date.toLocaleString();
}

function getEasternClockParts(now = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: yorktownHeightsLocation.timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  });
  return Object.fromEntries(
    formatter.formatToParts(now)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );
}

function getLocalSnapshotHourKey(now = new Date()) {
  const parts = getEasternClockParts(now);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}`;
}

function isWithinLocalSnapshotHours(now = new Date()) {
  const hour = Number(getEasternClockParts(now).hour);
  return hour >= localSnapshotSyncStartHour && hour <= localSnapshotSyncEndHour;
}

async function writeLocalApplicationSnapshot(db) {
  if (isStaticSite()) return null;
  const state = await loadFirestoreState(db);
  const response = await fetch("/api/local-data-snapshot", {
    method: "POST",
    cache: "no-store",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      entries: state.entries,
      config: state.config
    })
  });
  const result = await response.json();
  if (!response.ok || !result.saved) {
    throw new Error(result.message || "The local JSON snapshot could not be saved.");
  }
  window.localStorage.setItem(localSnapshotSyncStorageKey, getLocalSnapshotHourKey());
  return result;
}

async function runScheduledLocalSnapshotSync(db, { force = false } = {}) {
  if (isStaticSite()) return;
  const hourKey = getLocalSnapshotHourKey();
  const lastHourKey = window.localStorage.getItem(localSnapshotSyncStorageKey);
  if (!force && (!isWithinLocalSnapshotHours() || lastHourKey === hourKey)) return;
  try {
    await writeLocalApplicationSnapshot(db);
  } catch (error) {
    console.warn("Local application JSON snapshot was not updated:", error);
  }
}

function startLocalSnapshotScheduler(db) {
  if (isStaticSite() || localSnapshotSyncTimer) return;
  // Create or refresh the file immediately, then write once per Eastern clock hour from 9 AM through 8 PM.
  runScheduledLocalSnapshotSync(db, { force: true });
  localSnapshotSyncTimer = window.setInterval(
    () => runScheduledLocalSnapshotSync(db),
    60_000
  );
}

async function syncSunrunProductionIntoEntries(db, entries) {
  if (!sunrunProductionBootstrap?.available) {
    return { entries, updated: false, count: 0 };
  }

  const todayIsoDate = getTodayIsoDate();
  const existingDates = new Set(entries.map((entry) => String(entry.entry_date)));
  const missingSunrunRecords = Object.values(sunrunProductionBootstrap.by_date || {})
    .filter((record) => (
      record?.available &&
      String(record.entry_date || "") <= todayIsoDate &&
      !existingDates.has(String(record.entry_date || ""))
    ))
    .sort((left, right) => String(left.entry_date).localeCompare(String(right.entry_date)));

  const workingEntries = sortEntries(entries.map((entry) => normalizeEntry(entry)));
  const sunrunRowsByDate = new Map(
    (sunrunProductionBootstrap.rows || []).map((record) => [String(record.entry_date || ""), record])
  );
  const updates = [];
  for (const entry of workingEntries) {
    const sunrunRecord = getSunrunProductionRecord(entry.entry_date);
    if (!sunrunRecord || !sunrunRecord.available) {
      const sourceRow = sunrunRowsByDate.get(String(entry.entry_date));
      const wasIncorrectlyConfirmedPlaceholder = (
        sourceRow &&
        !sourceRow.available &&
        Number(entry.production_kwh || 0) === 0 &&
        !entry.estimated
      );
      if (wasIncorrectlyConfirmedPlaceholder) {
        let pendingProduction = 0;
        if (String(entry.entry_date) === todayIsoDate) {
          const pendingValues = buildFallbackLookupValues(entry.entry_date, workingEntries);
          const progress = getIntradayProgressShares(
            entry.entry_date,
            getClockMinutes(),
            entry.weather || pendingValues.weather
          );
          pendingProduction = Number((
            Number(pendingValues.production_kwh || 0) * progress.productionShare
          ).toFixed(1));
        }
        updates.push(normalizeEntry({
          ...entry,
          production_kwh: pendingProduction,
          estimated: true,
          notes: String(entry.entry_date) === todayIsoDate && !entry.notes_manual
            ? "Pending final production data from SunRun; the displayed production is an intraday estimate."
            : entry.notes,
          updated_at: new Date().toISOString()
        }));
      }
      continue;
    }

    const sunrunProduction = Number(sunrunRecord.production_kwh || 0);
    const currentProduction = Number(entry.production_kwh || 0);
    if (Math.abs(sunrunProduction - currentProduction) < 0.05 && !entry.estimated) {
      continue;
    }

    updates.push(
      normalizeEntry({
        ...entry,
        production_kwh: sunrunProduction,
        estimated: false,
        updated_at: new Date().toISOString()
      })
    );
  }

  for (const sunrunRecord of missingSunrunRecords) {
    const entryDate = String(sunrunRecord.entry_date);
    const estimatedValues = await buildEstimatedLookupValues(entryDate, workingEntries);
    const generatedEntry = buildIntradayEstimatedEntry(
      entryDate,
      workingEntries,
      estimatedValues,
      "SunRun CSV recovery"
    );
    const previousEntry = getMostRecentEntryBefore(workingEntries, entryDate);
    const nextEntry = workingEntries.find((entry) => String(entry.entry_date) > entryDate) || null;
    let meter01 = Number(generatedEntry.meter_01_import_reading || 0);
    let meter02 = Number(generatedEntry.meter_02_export_reading || 0);
    let meterBasis = "estimated from the preceding cumulative readings";

    if (previousEntry && nextEntry) {
      const previousTime = Date.parse(`${previousEntry.entry_date}T12:00:00Z`);
      const nextTime = Date.parse(`${nextEntry.entry_date}T12:00:00Z`);
      const entryTime = Date.parse(`${entryDate}T12:00:00Z`);
      const span = nextTime - previousTime;
      const progress = span > 0 ? (entryTime - previousTime) / span : 0;
      meter01 = Number((
        Number(previousEntry.meter_01_import_reading || 0) +
        ((Number(nextEntry.meter_01_import_reading || 0) - Number(previousEntry.meter_01_import_reading || 0)) * progress)
      ).toFixed(1));
      meter02 = Number((
        Number(previousEntry.meter_02_export_reading || 0) +
        ((Number(nextEntry.meter_02_export_reading || 0) - Number(previousEntry.meter_02_export_reading || 0)) * progress)
      ).toFixed(1));
      meterBasis = `interpolated between ${previousEntry.entry_date} and ${nextEntry.entry_date}`;
    }

    const recoveredEntry = normalizeEntry({
      ...generatedEntry,
      production_kwh: Number(sunrunRecord.production_kwh || 0),
      meter_01_import_reading: meter01,
      meter_02_export_reading: meter02,
      estimated: false,
      meter_values_estimated: true,
      meter_values_confirmed: false,
      lookup_source: "sunrun-csv",
      notes: `Production recovered from the SunRun CSV. M01/M02 are ${meterBasis} and should be replaced if actual smart meter readings become available.`,
      updated_at: new Date().toISOString()
    });
    updates.push(recoveredEntry);
    workingEntries.push(recoveredEntry);
    workingEntries.sort((left, right) => String(left.entry_date).localeCompare(String(right.entry_date)));
  }

  if (!updates.length) {
    return { entries: applySunrunProductionToEntries(entries), updated: false, count: 0 };
  }

  for (const entry of updates) {
    await setDoc(doc(db, entryCollectionName, entry.entry_date), entry, { merge: true });
  }

  const refreshedState = await loadFirestoreState(db);
  return { entries: refreshedState.entries, updated: true, count: updates.length };
}

async function backfillMissingTemperatureRanges(db, entries) {
  const candidates = sortEntries(entries).filter((entry) => entryNeedsTemperatureBackfill(entry));
  if (!candidates.length) {
    return { entries, updated: false, count: 0 };
  }

  const updatedEntries = new Map(entries.map((entry) => [entry.entry_date, normalizeEntry(entry)]));
  let changedCount = 0;

  for (const entry of candidates) {
    try {
      const lookupValues = await buildEstimatedLookupValues(entry.entry_date, [...updatedEntries.values()]);
      const high = parseOptionalNumber(lookupValues.temperature_high_f);
      const low = parseOptionalNumber(lookupValues.temperature_low_f);
      const avg = parseOptionalNumber(lookupValues.temperature_f);

      if (high === null && low === null && avg === null) {
        continue;
      }

      const mergedEntry = normalizeEntry({
        ...entry,
        temperature_f: avg ?? entry.temperature_f ?? null,
        temperature_high_f: high ?? entry.temperature_high_f ?? entry.temperature_f ?? null,
        temperature_low_f: low ?? entry.temperature_low_f ?? entry.temperature_f ?? null,
        humidity_pct: lookupValues.humidity_pct ?? entry.humidity_pct ?? null,
        cloud_cover_pct: lookupValues.cloud_cover_pct ?? entry.cloud_cover_pct ?? null,
        wind_mph: lookupValues.wind_mph ?? entry.wind_mph ?? null,
        lookup_source: lookupValues.lookup_source || entry.lookup_source || "manual",
        updated_at: new Date().toISOString()
      });

      await setDoc(doc(db, entryCollectionName, entry.entry_date), mergedEntry, { merge: true });
      updatedEntries.set(entry.entry_date, mergedEntry);
      changedCount += 1;
    } catch (error) {
      // Leave rows untouched if the weather lookup is temporarily unavailable.
    }
  }

  if (!changedCount) {
    return { entries, updated: false, count: 0 };
  }

  return {
    entries: sortEntries([...updatedEntries.values()]),
    updated: true,
    count: changedCount
  };
}

function entryNeedsIrradianceRevalidation(entry) {
  if (String(entry.entry_date) > String(getTodayIsoDate())) return false;
  if (
    entry.irradiance_method === "open-meteo-hourly-instant-ghi-v3" &&
    Array.isArray(entry.irradiance_hourly_profile) &&
    entry.irradiance_hourly_profile.length >= 20
  ) return false;
  if (String(entry.entry_date) === String(getTodayIsoDate())) return true;
  const irradiance = Number(entry.irradiance_peak_wm2 || 0);
  const source = String(entry.lookup_source || "").toLowerCase();
  return (
    irradiance < 450 ||
    source.startsWith("fallback")
  );
}

async function revalidateSuspiciousIrradiancePeaks(db, entries) {
  const candidates = sortEntries(entries)
    .filter((entry) => entryNeedsIrradianceRevalidation(entry))
    .slice(-14);
  if (!candidates.length) {
    return { entries, updated: false, count: 0 };
  }

  const updatedEntries = new Map(entries.map((entry) => [entry.entry_date, normalizeEntry(entry)]));
  let changedCount = 0;

  for (const entry of candidates) {
    try {
      const lookupValues = await fetchOpenMeteoLookupValues(entry.entry_date);
      const correctedPeak = Number(lookupValues.irradiance_peak_wm2 || 0);
      if (correctedPeak <= 0 || Math.abs(correctedPeak - Number(entry.irradiance_peak_wm2 || 0)) < 1) {
        continue;
      }

      const existingNotes = String(entry.notes || "");
      const canReplaceNotes = !entry.notes_manual && String(entry.lookup_source || "").toLowerCase() !== "manual" &&
        (!existingNotes || /auto-filled|fallback|placeholder/i.test(existingNotes));
      const mergedEntry = normalizeEntry({
        ...entry,
        irradiance_peak_wm2: correctedPeak,
        weather: lookupValues.weather || entry.weather || "Unknown",
        temperature_f: lookupValues.temperature_f ?? entry.temperature_f ?? null,
        temperature_high_f: lookupValues.temperature_high_f ?? entry.temperature_high_f ?? null,
        temperature_low_f: lookupValues.temperature_low_f ?? entry.temperature_low_f ?? null,
        humidity_pct: lookupValues.humidity_pct ?? entry.humidity_pct ?? null,
        cloud_cover_pct: lookupValues.cloud_cover_pct ?? entry.cloud_cover_pct ?? null,
        wind_mph: lookupValues.wind_mph ?? entry.wind_mph ?? null,
        sunrise_time: lookupValues.sunrise_time || entry.sunrise_time || "",
        sunset_time: lookupValues.sunset_time || entry.sunset_time || "",
        lookup_source: lookupValues.lookup_source || entry.lookup_source || "manual",
        irradiance_method: "open-meteo-hourly-instant-ghi-v3",
        irradiance_verified_at: new Date().toISOString(),
        irradiance_hourly_profile: lookupValues.irradiance_hourly_profile || entry.irradiance_hourly_profile || [],
        notes: canReplaceNotes ? lookupValues.notes : existingNotes,
        updated_at: new Date().toISOString()
      });

      await setDoc(doc(db, entryCollectionName, entry.entry_date), mergedEntry, { merge: true });
      updatedEntries.set(entry.entry_date, mergedEntry);
      changedCount += 1;
    } catch (error) {
      // Keep the current value when the weather service is temporarily unavailable.
    }
  }

  return {
    entries: sortEntries([...updatedEntries.values()]),
    updated: changedCount > 0,
    count: changedCount
  };
}

function looksLikeOnlyPlaceholderData(entries) {
  if (!entries.length) return true;
  if (entries.length > 1) return false;
  const [entry] = entries;
  return (
    Number(entry.production_kwh || 0) === 0 &&
    Number(entry.irradiance_peak_wm2 || 0) === 0 &&
    Number(entry.meter_01_import_reading || 0) === 0 &&
    Number(entry.meter_02_export_reading || 0) === 0 &&
    String(entry.notes || "").includes("placeholder")
  );
}

async function backfillStarterEntriesIfNeeded(db, entries) {
  if (!sampleEntries.length) {
    return { entries, backfilled: false };
  }

  const existingDates = new Set(entries.map((entry) => entry.entry_date));
  const missingStarterEntries = sampleEntries
    .map((entry) => normalizeEntry(entry))
    .filter((entry) => !existingDates.has(entry.entry_date));

  if (!missingStarterEntries.length) {
    return { entries, backfilled: false };
  }

  for (const entry of missingStarterEntries) {
    await setDoc(doc(db, entryCollectionName, entry.entry_date), {
      ...entry,
      notes: entry.notes || "Starter history restored from the built-in sample data.",
      created_at: entry.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, { merge: true });
  }

  const refreshedState = await loadFirestoreState(db);
  return { entries: refreshedState.entries, backfilled: true };
}

function buildComputedEntries(entries, config = defaultConfig) {
  if (!entries.length) return [];
  const sortedEntries = sortEntries(entries);

  return sortedEntries.map((entry, index, list) => {
    const currentDate = new Date(`${entry.entry_date}T00:00:00`);
    const nysegInterval = getNysegIntervalRecord(entry.entry_date);
    const dailyImport = Number(nysegInterval?.import_kwh || 0);
    const dailyExport = Number(nysegInterval?.export_kwh || 0);
    const production = Number(entry.production_kwh || 0);
    // Energy delivered to the home follows the physical balance from the two
    // downloaded source files: solar production + grid import - grid export.
    const totalHomeConsumption = Math.max(0, production + dailyImport - dailyExport);
    const fileBackedSelfConsumption = Math.max(0, production - dailyExport);
    const rollingWindow = list.slice(Math.max(0, index - 6), index + 1);

    return {
      ...entry,
      currentDate,
      estimated: false,
      daily_import_kwh: dailyImport,
      daily_export_kwh: dailyExport,
      estimated_daytime_house_usage_kwh: totalHomeConsumption,
      estimated_self_consumption_kwh: fileBackedSelfConsumption,
      estimated_total_home_consumption_kwh: totalHomeConsumption,
      solar_offset_pct: totalHomeConsumption > 0 ? (fileBackedSelfConsumption / totalHomeConsumption) * 100 : 0,
      rolling_7_day_prod: mean(rollingWindow.map((item) => Number(item.production_kwh || 0)))
    };
  });
}

function classifyIrradiancePointsClient(entries) {
  if (!entries.length) return [];
  const irradianceValues = entries.map((entry) => Number(entry.irradiance_peak_wm2 || 0)).sort((a, b) => a - b);
  const productionValues = entries.map((entry) => Number(entry.production_kwh || 0)).sort((a, b) => a - b);
  const irradianceMedian = irradianceValues[Math.floor(irradianceValues.length / 2)] || 0;
  const productionMedian = productionValues[Math.floor(productionValues.length / 2)] || 0;

  return entries.map((entry) => {
    let anomalyLabel = "Observed";
    let anomalyReason = "Production and irradiance look consistent with the recent trend.";
    let anomalyText = "";
    const irradiance = Number(entry.irradiance_peak_wm2 || 0);
    const production = Number(entry.production_kwh || 0);
    const baseline = Number(entry.rolling_7_day_prod || production || 0);

    if (entry.estimated) {
      anomalyLabel = "Estimated";
      anomalyReason = "This point uses placeholder production logic and should be replaced with actual Sunrun production.";
      anomalyText = "Estimated";
    } else if (irradiance >= Math.max(irradianceMedian, 700) && baseline > 0 && production <= baseline * 0.55) {
      anomalyLabel = "Likely Underperformance";
      anomalyReason = "Irradiance was strong, but production was much lower than the recent baseline.";
      anomalyText = "Likely Underperformance";
    } else if (irradiance >= Math.max(irradianceMedian, 650) && productionMedian > 0 && production <= productionMedian * 0.7) {
      anomalyLabel = "Needs Review";
      anomalyReason = "Irradiance was decent, but production landed well below the typical range.";
      anomalyText = "Needs Review";
    }

    return {
      ...entry,
      anomaly_label: anomalyLabel,
      anomaly_reason: anomalyReason,
      anomaly_text: anomalyText
    };
  });
}

function calculateDashboardMetricsClient(entries, config) {
  if (!entries.length) {
    return {
      today_production: 0,
      yesterday_production: 0,
      today_import: 0,
      today_export: 0,
      today_irradiance: 0,
      weekly_average: 0,
      monthly_average: 0,
      ytd_production: 0,
      average_daily_production: 0,
      annual_projection: 0,
      guarantee_progress_pct: 0,
      projection_vs_guarantee_kwh: 0,
      projection_vs_guarantee_pct: 0,
      highest_production_day: 0,
      lowest_production_day: 0,
      consecutive_poor_days: 0,
      estimated_self_consumption: 0,
      total_home_consumption: 0,
      solar_offset_pct: 0,
      electricity_value_produced: 0,
      grid_cost: 0,
      lease_cost: 0,
      observed_months: 0,
      monthly_savings: 0,
      annual_savings: 0,
      lifetime_savings: 0,
      tree_payback_months: null,
      confirmed_entry_count: 0,
      estimated_entry_count: 0,
      projection_uses_estimated: false,
      latest_production_estimated: false,
      latest_confirmed_production_date_label: "N/A",
      confirmed_production_total: 0,
      confirmed_average_daily_production: 0,
      confirmed_best_day_production: 0,
      cumulative_guarantee_progress_pct: 0,
      meter_export_since_install: 0,
      meter_import_since_install: 0,
      net_export_since_install: 0,
      smart_meter_start_label: String(config.smart_meter_install_date || "N/A"),
      today_pending_sunrun: false,
      yesterday_pending_sunrun: false
    };
  }

  const todayIsoDate = getTodayIsoDate();
  const today = entries[entries.length - 1];
  const yesterday = entries.length > 1 ? entries[entries.length - 2] : today;
  const currentMonth = today.currentDate.getMonth();
  const trailingWeek = entries.slice(-7);
  const monthlyEntries = entries.filter((entry) => entry.currentDate.getMonth() === currentMonth);
  const confirmedEntries = entries.filter((entry) => !entry.estimated);
  const latestConfirmedEntry = confirmedEntries.length ? confirmedEntries[confirmedEntries.length - 1] : today;
  const projectionEntries = confirmedEntries.length ? confirmedEntries : entries;
  const avgDaily = mean(projectionEntries.map((entry) => Number(entry.production_kwh || 0)));
  const annualProjection = avgDaily * 365;
  const guarantee = Number(config.production_guarantee_kwh || 0);
  const guaranteeProgress = guarantee ? (annualProjection / guarantee) * 100 : 0;
  const projectionVsGuaranteeKwh = annualProjection - guarantee;
  const projectionVsGuaranteePct = guarantee ? (projectionVsGuaranteeKwh / guarantee) * 100 : 0;
  const guaranteedDaily = guarantee ? guarantee / 365 : 0;
  let consecutivePoorDays = 0;
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    if (Number(entries[index].production_kwh || 0) < guaranteedDaily) consecutivePoorDays += 1;
    else break;
  }
  const observedMonths = Math.max(1, new Set(entries.map((entry) => `${entry.currentDate.getFullYear()}-${entry.currentDate.getMonth() + 1}`)).size);
  const electricRate = Number(config.current_electric_rate || 0);
  const electricityValueProduced = sum(entries.map((entry) => entry.production_kwh)) * electricRate;
  const gridCost = sum(entries.map((entry) => entry.daily_import_kwh)) * electricRate
    + (Number(config.monthly_fixed_charges || 0) * observedMonths);
  const leaseCost = Number(config.monthly_lease_payment || 0) * observedMonths;
  const monthlySavings = observedMonths ? (electricityValueProduced - gridCost - leaseCost) / observedMonths : 0;
  const annualSavings = monthlySavings * 12;
  const lifetimeSavings = annualSavings * Number(config.lease_term_years || 25);
  const treePaybackMonths = monthlySavings > 0 ? Number(config.tree_removal_cost || 0) / monthlySavings : null;
  const confirmedProductionTotal = sum((confirmedEntries.length ? confirmedEntries : entries).map((entry) => Number(entry.production_kwh || 0)));
  const confirmedAverageDailyProduction = mean((confirmedEntries.length ? confirmedEntries : entries).map((entry) => Number(entry.production_kwh || 0)));
  const confirmedBestDayProduction = Math.max(...(confirmedEntries.length ? confirmedEntries : entries).map((entry) => Number(entry.production_kwh || 0)));
  const cumulativeGuaranteeProgressPct = guarantee ? (confirmedProductionTotal / guarantee) * 100 : 0;
  const smartMeterStartLabel = String(config.smart_meter_install_date || "N/A");
  const smartMeterStartDate = config.smart_meter_install_date ? new Date(`${config.smart_meter_install_date}T00:00:00`) : null;
  const smartMeterEntries = smartMeterStartDate
    ? entries.filter((entry) => entry.currentDate >= smartMeterStartDate)
    : entries;
  const meterExportSinceInstall = sum(smartMeterEntries.map((entry) => Number(entry.daily_export_kwh || 0)));
  const meterImportSinceInstall = sum(smartMeterEntries.map((entry) => Number(entry.daily_import_kwh || 0)));
  const netExportSinceInstall = meterExportSinceInstall - meterImportSinceInstall;

  return {
    today_production: Number(today.production_kwh || 0),
    yesterday_production: Number(yesterday.production_kwh || 0),
    today_import: Number(today.daily_import_kwh || 0),
    today_export: Number(today.daily_export_kwh || 0),
    today_irradiance: Number(today.irradiance_peak_wm2 || 0),
    weekly_average: mean(trailingWeek.map((entry) => entry.production_kwh)),
    monthly_average: mean(monthlyEntries.map((entry) => entry.production_kwh)),
    ytd_production: sum(entries.map((entry) => entry.production_kwh)),
    average_daily_production: avgDaily,
    annual_projection: annualProjection,
    guarantee_progress_pct: guaranteeProgress,
    projection_vs_guarantee_kwh: projectionVsGuaranteeKwh,
    projection_vs_guarantee_pct: projectionVsGuaranteePct,
    highest_production_day: Math.max(...entries.map((entry) => Number(entry.production_kwh || 0))),
    lowest_production_day: Math.min(...entries.map((entry) => Number(entry.production_kwh || 0))),
    consecutive_poor_days: consecutivePoorDays,
    estimated_self_consumption: sum(entries.map((entry) => entry.estimated_self_consumption_kwh)),
    total_home_consumption: sum(entries.map((entry) => entry.estimated_total_home_consumption_kwh)),
    solar_offset_pct: mean(entries.map((entry) => entry.solar_offset_pct)),
    electricity_value_produced: electricityValueProduced,
    grid_cost: gridCost,
    lease_cost: leaseCost,
    observed_months: observedMonths,
    monthly_savings: monthlySavings,
    annual_savings: annualSavings,
    lifetime_savings: lifetimeSavings,
    tree_payback_months: treePaybackMonths,
    confirmed_entry_count: confirmedEntries.length,
    estimated_entry_count: entries.filter((entry) => entry.estimated).length,
    projection_uses_estimated: confirmedEntries.length === 0,
    latest_production_estimated: Boolean(today.estimated),
    latest_confirmed_production_date_label: String(latestConfirmedEntry.entry_date || "N/A"),
    confirmed_production_total: confirmedProductionTotal,
    confirmed_average_daily_production: confirmedAverageDailyProduction,
    confirmed_best_day_production: confirmedBestDayProduction,
    cumulative_guarantee_progress_pct: cumulativeGuaranteeProgressPct,
    meter_export_since_install: meterExportSinceInstall,
    meter_import_since_install: meterImportSinceInstall,
    net_export_since_install: netExportSinceInstall,
    smart_meter_start_label: smartMeterStartLabel,
    today_pending_sunrun: Boolean(today.estimated && String(today.entry_date) === todayIsoDate),
    yesterday_pending_sunrun: Boolean(yesterday.estimated && String(yesterday.entry_date) === shiftIsoDate(todayIsoDate, -1))
  };
}

function buildOperationalSnapshotHtml(metrics) {
  return `
    <section class="mb-4">
      <div class="card tracker-card operational-snapshot-card">
        <div class="card-body">
          <div class="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-3">
            <div>
              <p class="eyebrow mb-2">Operational Snapshot</p>
              <h2 class="h5 mb-1">Current production and smart meter summary</h2>
              <p class="text-muted mb-0">Calculated only from matching downloaded SunRun and NYSEG file days, with the shared two-day reporting delay applied.</p>
            </div>
            <span class="operational-snapshot-date">Latest matched file day: ${metrics.latest_confirmed_production_date_label}</span>
          </div>
          <div class="info-grid operational-snapshot-grid mb-3">
            <div><span>Final Production Through ${metrics.latest_confirmed_production_date_label}</span><strong>${formatNumber(metrics.confirmed_production_total, 1, 1)} kWh</strong></div>
            <div><span>Average Final Day</span><strong>${formatNumber(metrics.confirmed_average_daily_production, 1, 1)} kWh/day</strong></div>
            <div><span>Best Day</span><strong>${formatNumber(metrics.confirmed_best_day_production, 1, 1)} kWh</strong></div>
            <div><span>Cumulative Guarantee Progress</span><strong>${formatNumber(metrics.cumulative_guarantee_progress_pct, 1, 1)}%</strong></div>
            <div><span>Meter Export Since ${metrics.smart_meter_start_label}</span><strong>${formatNumber(metrics.meter_export_since_install, 1, 1)} kWh</strong></div>
            <div><span>Meter Import Since ${metrics.smart_meter_start_label}</span><strong>${formatNumber(metrics.meter_import_since_install, 1, 1)} kWh</strong></div>
            <div><span>Net Export Since ${metrics.smart_meter_start_label}</span><strong>${formatNumber(metrics.net_export_since_install, 1, 1)} kWh</strong></div>
          </div>
          <div class="tracker-modal-note operational-snapshot-note">
            Production is measured by SunRun. Import and export are measured by NYSEG. Home energy delivered = production - export + import. Projected annual production remains in the Annual Projection card above to avoid duplication.
          </div>
          <div class="row g-3 mt-1">
            <div class="col-xl-6">
              <div class="chart-popout-frame" data-chart-popout-label="Daily SunRun Production">
                <button type="button" class="btn btn-contract btn-sm chart-popout-button" data-chart-popout>Pop Out</button>
                <div id="operational-production-chart" class="dashboard-chart operational-chart-embedded"></div>
              </div>
            </div>
            <div class="col-xl-6">
              <div class="chart-popout-frame" data-chart-popout-label="Production, Grid Import/Export and Estimated Usage">
                <button type="button" class="btn btn-contract btn-sm chart-popout-button" data-chart-popout>Pop Out</button>
                <div id="operational-balance-chart" class="dashboard-chart operational-chart-embedded"></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
}

function buildEnergyImpactSummaryClient(metrics, config) {
  const averageHomeDayKwh = Number(config.annual_home_usage_kwh || 0) / 365 || 0;
  const todayHouseDays = averageHomeDayKwh ? Number(metrics.today_production || 0) / averageHomeDayKwh : 0;
  const ytdHouseDays = averageHomeDayKwh ? Number(metrics.ytd_production || 0) / averageHomeDayKwh : 0;
  const evKwhPerMile = 0.30;
  const todayEvMiles = evKwhPerMile ? Number(metrics.today_production || 0) / evKwhPerMile : 0;
  const ytdEvMiles = evKwhPerMile ? Number(metrics.ytd_production || 0) / evKwhPerMile : 0;
  const averageHomeHoursSupported = todayHouseDays * 24;

  return {
    averageHomeDayKwh,
    todayHouseDays,
    ytdHouseDays,
    todayEvMiles,
    ytdEvMiles,
    averageHomeHoursSupported,
    evKwhPerMile
  };
}

function buildAlertsClient(entries, config) {
  if (!entries.length) return [];
  const latest = entries[entries.length - 1];
  const guarantee = Number(config.production_guarantee_kwh || 0);
  const guaranteedDaily = guarantee ? guarantee / 365 : 0;
  const confirmedEntries = entries.filter((entry) => !entry.estimated);
  const projectionEntries = confirmedEntries.length ? confirmedEntries : entries;
  const annualProjection = mean(projectionEntries.map((entry) => Number(entry.production_kwh || 0))) * 365;
  const projectionDifference = annualProjection - guarantee;
  const projectionDifferencePct = guarantee ? (projectionDifference / guarantee) * 100 : 0;
  const overallPosition = projectionDifference >= 0
    ? `ahead by ${formatNumber(projectionDifference, 0, 0)} kWh (${formatNumber(projectionDifferencePct, 1, 1)}%)`
    : `behind by ${formatNumber(Math.abs(projectionDifference), 0, 0)} kWh (${formatNumber(Math.abs(projectionDifferencePct), 1, 1)}%)`;
  const alerts = [];

  if (latest.estimated) {
    alerts.push(
      `Latest day (${latest.entry_date}) is estimated or awaiting final SunRun data, so its ${formatNumber(latest.production_kwh, 1, 1)} kWh should not be treated as final. ` +
      `Confirmed production projects to ${formatNumber(annualProjection, 0, 0)} kWh/year, ${overallPosition} versus the ${formatNumber(guarantee, 0, 0)} kWh guarantee.`
    );
  } else if (latest.production_kwh < guaranteedDaily) {
    const dailyShortfall = guaranteedDaily - Number(latest.production_kwh || 0);
    alerts.push(
      `Daily context (${latest.entry_date}): ${formatNumber(latest.production_kwh, 1, 1)} kWh was ${formatNumber(dailyShortfall, 1, 1)} kWh below the ${formatNumber(guaranteedDaily, 1, 1)} kWh daily guarantee pace. ` +
      `Overall production still projects to ${formatNumber(annualProjection, 0, 0)} kWh/year, ${overallPosition}. A single low day does not indicate contract underperformance.`
    );
  }
  const recentImportMean = mean(entries.slice(-7).map((entry) => entry.daily_import_kwh));
  if (recentImportMean > 0 && latest.daily_import_kwh > recentImportMean * 1.5) {
    alerts.push("Large import increase detected versus recent average.");
  }
  if (latest.weather === "Sunny" && latest.daily_export_kwh <= 0) alerts.push("No exports recorded on a sunny day.");
  if (annualProjection < guarantee) {
    alerts.push(
      `Contract pace warning: confirmed production projects to ${formatNumber(annualProjection, 0, 0)} kWh/year, ` +
      `${formatNumber(Math.abs(projectionDifference), 0, 0)} kWh (${formatNumber(Math.abs(projectionDifferencePct), 1, 1)}%) below the ${formatNumber(guarantee, 0, 0)} kWh guarantee.`
    );
  }
  return alerts;
}

function formatNumber(value, maximumFractionDigits = 0, minimumFractionDigits = 0) {
  return Number(value || 0).toLocaleString(undefined, {
    minimumFractionDigits,
    maximumFractionDigits
  });
}

function formatCurrency(value) {
  return `$${formatNumber(value, 0, 0)}`;
}

function buildAiPanelHtml(openaiConfigured) {
  const prompts = Array.isArray(aiBootstrapStatus.suggested_prompts) && aiBootstrapStatus.suggested_prompts.length
    ? aiBootstrapStatus.suggested_prompts
    : [
      "Am I on track to hit my guarantee?",
      "What caused today's low production?",
      "Compare this month to last month.",
      "Estimate next month's production."
    ];
  return `
    <section class="card tracker-card mb-4 ai-panel">
      <div class="card-body">
        <div class="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-3">
          <div>
            <p class="eyebrow mb-2">AI Solar Analyst</p>
            <h2 class="h5 mb-1">Ask questions about your production, savings, and guarantee trend</h2>
            <p class="text-muted mb-0">This phase includes grounded dashboard answers, forecasts, and anomaly checks. OpenAI enhancement is optional.</p>
          </div>
          <div class="d-flex flex-wrap gap-2 align-items-center">
            <span class="ai-status-pill ${openaiConfigured ? "ai-status-pill-success" : ""}" id="ai-provider-pill">
              ${openaiConfigured ? "OpenAI Ready" : "Rules Mode"}
            </span>
            <button type="button" class="btn btn-contract btn-sm ai-collapse-toggle" data-bs-toggle="collapse" data-bs-target="#ai-panel-collapse" aria-expanded="false" aria-controls="ai-panel-collapse" id="ai-panel-toggle">Show AI Tools</button>
          </div>
        </div>
        <p class="text-muted small mb-3">AI tools are collapsed by default. Use the button on the right to open or hide them.</p>
        <div class="collapse" id="ai-panel-collapse">
          <div class="ai-prompt-list mb-3" id="ai-prompt-list">
            ${prompts.map((prompt) => `<button type="button" class="btn btn-contract btn-sm ai-prompt-chip" data-ai-prompt="${escapeHtml(prompt)}">${escapeHtml(prompt)}</button>`).join("")}
          </div>
          <form id="ai-ask-form" class="ai-ask-form">
            <div class="row g-3 align-items-end">
              <div class="col-lg-9">
                <label for="ai-question-input" class="form-label">Ask a question</label>
                <textarea id="ai-question-input" class="form-control ai-question-input" rows="3" placeholder="Example: Am I on track to hit my guarantee?"></textarea>
              </div>
              <div class="col-lg-3">
                <div class="d-grid gap-2">
                  <button type="submit" class="btn btn-sun" id="ai-ask-button">Ask AI</button>
                  <button type="button" class="btn btn-contract" id="ai-reset-button">Reset</button>
                </div>
              </div>
            </div>
          </form>
          <div class="ai-answer-panel mt-3" id="ai-answer-panel">
            <div class="d-flex flex-wrap justify-content-between align-items-center gap-2 mb-2">
              <strong id="ai-answer-title">AI Solar Analyst</strong>
              <span class="ai-answer-meta" id="ai-answer-meta">${openaiConfigured ? "OpenAI enhancement available" : "Grounded local analysis"}</span>
            </div>
            <p class="mb-2" id="ai-answer-text">Ask a question or tap one of the prompt chips to generate a grounded solar analysis.</p>
            <ul class="mb-2 ai-answer-list" id="ai-answer-list">
              <li>Track guarantee pace against current annual projection.</li>
              <li>Explain lower production days from irradiance, weather, and recent trend data.</li>
              <li>Estimate tomorrow, next month, and annual savings from current dashboard data.</li>
            </ul>
            <small class="text-muted" id="ai-answer-disclaimer">This phase uses the current dashboard dataset and does not yet include inverter-level telemetry or external forecast APIs.</small>
          </div>
        </div>
      </div>
    </section>
  `;
}

function buildHistoricalUsagePanelHtml(historicalUsage, config) {
  const workbookHref = isStaticSite() ? "NYSEG%20Bill/NYSEG%20Bill.xlsx" : "/documents/nyseg-bill/view";
  if (!historicalUsage?.available) {
    return `
      <section class="row g-3 mb-4">
        <div class="col-12">
          <div class="card tracker-card">
            <div class="card-body">
              <p class="eyebrow mb-2">Historic NYSEG Baseline</p>
              <h2 class="h5 mb-2">Pre-solar usage workbook analysis</h2>
              <div class="tracker-modal-note">No historical workbook source is currently loaded.</div>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  const varianceDirection = Number(historicalUsage.versus_expected_annual_kwh || 0) >= 0 ? "high" : "low";
  return `
    <section class="row g-3 mb-4">
      <div class="col-lg-7">
        <div class="card tracker-card h-100">
          <div class="card-body">
            <div class="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-3">
              <div>
                <p class="eyebrow mb-2">Historic NYSEG Baseline</p>
                <h2 class="h5 mb-1">Pre-solar usage workbook analysis</h2>
                <p class="text-muted mb-0">This section uses your uploaded NYSEG bill workbook as a baseline source for judging the effectiveness of the solar system.</p>
              </div>
              <div class="d-flex flex-wrap gap-2 align-items-center">
                <span class="ai-status-pill ai-status-pill-success">Workbook Loaded</span>
                <a class="btn btn-contract btn-sm" href="${workbookHref}">View Spreadsheet</a>
              </div>
            </div>
            <div class="info-grid mb-3">
              <div><span>History Window</span><strong>${escapeHtml(historicalUsage.start_date)} to ${escapeHtml(historicalUsage.end_date)}</strong></div>
              <div><span>Monthly Records</span><strong>${formatNumber(historicalUsage.record_count, 0, 0)}</strong></div>
              <div><span>Avg Monthly Usage</span><strong>${formatNumber(historicalUsage.average_monthly_kwh, 0, 0)} kWh</strong></div>
              <div><span>Annualized Baseline</span><strong>${formatNumber(historicalUsage.annualized_kwh, 0, 0)} kWh</strong></div>
              <div><span>Expected Annual Usage</span><strong>${formatNumber(config.annual_home_usage_kwh, 0, 0)} kWh</strong></div>
              <div><span>Variance vs Expected</span><strong>${formatNumber(Math.abs(historicalUsage.versus_expected_annual_kwh || 0), 0, 0)} kWh ${varianceDirection}</strong></div>
              <div><span>Highest Monthly Read</span><strong>${formatNumber(historicalUsage.maximum_kwh, 0, 0)} kWh</strong></div>
              <div><span>Lowest Monthly Read</span><strong>${formatNumber(historicalUsage.minimum_kwh, 0, 0)} kWh</strong></div>
            </div>
            <div class="tracker-modal-note">
              Meter ${escapeHtml(historicalUsage.meter_label || "source")} includes ${formatNumber(historicalUsage.actual_read_count, 0, 0)} NYSEG reads and ${formatNumber(historicalUsage.calculated_read_count, 0, 0)} calculated reads. Use this as the pre-solar baseline when comparing grid dependence and estimated solar offset.
            </div>
          </div>
        </div>
      </div>
      <div class="col-lg-5">
        <div class="card tracker-card h-100">
          <div class="card-body">
            <h2 class="h5 mb-3">Baseline Effectiveness Notes</h2>
            <div class="tracker-modal-math">
              <div class="tracker-modal-step">
                <strong>1. Baseline Context</strong>
                <p>The workbook annualizes to roughly ${formatNumber(historicalUsage.annualized_kwh, 0, 0)} kWh/year before solar activation on ${escapeHtml(config.activation_date || "")}.</p>
              </div>
              <div class="tracker-modal-step">
                <strong>2. Compare to Contract Assumption</strong>
                <p>Sunrun planning assumed ${formatNumber(config.annual_home_usage_kwh, 0, 0)} kWh/year, so this workbook is ${Number(historicalUsage.versus_expected_annual_kwh || 0) >= 0 ? `about ${formatNumber(historicalUsage.versus_expected_annual_kwh, 0, 0)} kWh higher` : `about ${formatNumber(Math.abs(historicalUsage.versus_expected_annual_kwh || 0), 0, 0)} kWh lower`}.</p>
              </div>
              <div class="tracker-modal-step">
                <strong>3. Use in Solar Analysis</strong>
                <p>This gives the dashboard and AI analyst a historical benchmark for judging whether current solar offset and import behavior look effective versus pre-solar usage.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
}

function buildMonthlyBillPanelHtml(monthlyBill) {
  const usage = monthlyBill?.usage_totals || {};
  const net = monthlyBill?.net_metering || {};
  const billingRows = (monthlyBill?.billing_records || []).map((row) => `
    <tr>
      <td><strong>${escapeHtml(row.billing_start_date)} to ${escapeHtml(row.billing_end_date)}</strong><small>${formatNumber(row.days_in_period, 0, 0)} days</small></td>
      <td>${formatNumber(row.imported_kwh, 0, 0)} kWh</td>
      <td>${formatCurrency(row.delivery_charges)}</td><td>${formatCurrency(row.supply_charges)}</td>
      <td>${formatCurrency(row.taxes)}</td><td>${formatCurrency(row.miscellaneous_charges)}</td>
      <td><strong>${formatCurrency(row.total_energy_charges)}</strong></td><td>${formatCurrency(row.amount_due)}</td>
    </tr>`).join("");
  const netRows = (monthlyBill?.billing_records || []).map((row) => `
    <tr>
      <td><strong>${escapeHtml(row.billing_end_date)}</strong><small title="${escapeHtml(row.meter_note || "")}">${escapeHtml(row.net_direction)}</small></td>
      <td>${formatNumber(row.imported_kwh, 0, 0)}</td><td>${formatNumber(row.exported_kwh, 0, 0)}</td>
      <td class="${Number(row.net_grid_kwh) <= 0 ? "nyseg-net-positive" : "nyseg-net-negative"}">${Number(row.net_grid_kwh) >= 0 ? "+" : ""}${formatNumber(row.net_grid_kwh, 0, 0)}</td>
    </tr>`).join("");
  const usageRows = (monthlyBill?.usage_records || []).map((row) => `
    <tr><td><strong>${escapeHtml(row.month_label)}</strong></td><td>${escapeHtml(row.billing_start_date)} to ${escapeHtml(row.billing_end_date)}</td><td>${formatNumber(row.usage_kwh, 0, 0)} kWh</td><td>${formatCurrency(row.cost)}</td><td>$${formatNumber(row.effective_rate_per_kwh, 3, 3)}</td><td>${formatNumber(row.average_temperature_f, 0, 0)}°F</td></tr>`).join("");
  const sourceActions = isStaticSite()
    ? `<span class="ai-status-pill" title="Raw NYSEG files contain private account information and remain local">Source Files: Local Only</span>`
    : `<a class="btn btn-contract btn-sm" href="/documents/nyseg-bill/view">Historic Spreadsheet</a><a class="btn btn-contract btn-sm" href="/documents/nyseg-monthly-bill/view">Latest Bill</a>`;

  if (monthlyBill?.available && (billingRows || usageRows)) {
    return `
      <section class="mb-4"><div class="card tracker-card nyseg-baseline-card"><div class="card-body">
        <div class="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-3">
          <div><p class="eyebrow mb-2">Historic NYSEG Baseline</p><h2 class="h5 mb-1">Monthly usage, billing, and net-metering history</h2><p class="text-muted mb-0">Usage comes from the NYSEG monthly export. Charge details and meter registers come from the bill PDFs.</p></div>
          <div class="d-flex flex-wrap gap-2 align-items-center"><span class="ai-status-pill ai-status-pill-success">${formatNumber(usage.record_count, 0, 0)} Usage Months</span><span class="ai-status-pill ai-status-pill-success">${formatNumber(monthlyBill.billing_totals?.record_count, 0, 0)} Bills Reviewed</span>${sourceActions}</div>
        </div>
        <div class="nyseg-baseline-summary mb-3">
          <div class="nyseg-summary-tile"><span>Average Monthly Usage</span><strong>${formatNumber(usage.average_monthly_kwh, 0, 0)} kWh</strong><small>${escapeHtml(usage.start_date || "")} to ${escapeHtml(usage.end_date || "")}</small></div>
          <div class="nyseg-summary-tile"><span>Average Monthly Usage Cost</span><strong>${formatCurrency(usage.average_monthly_cost)}</strong><small>$${formatNumber(usage.effective_rate_per_kwh, 3, 3)}/kWh blended</small></div>
          <div class="nyseg-summary-tile nyseg-summary-tile-import"><span>Bill-Period Import</span><strong>${formatNumber(net.billing_period_import_kwh, 0, 0)} kWh</strong><small>Includes 419 kWh on the replaced meter</small></div>
          <div class="nyseg-summary-tile nyseg-summary-tile-export"><span>Smart-Meter Export</span><strong>${formatNumber(net.export_kwh, 0, 0)} kWh</strong><small>Register 02 across available solar bills</small></div>
          <div class="nyseg-summary-tile nyseg-summary-tile-net"><span>Bill-Period Net Position</span><strong>${formatNumber(Math.abs(net.billing_period_net_kwh || 0), 0, 0)} kWh ${escapeHtml((net.billing_period_direction || "").toLowerCase())}</strong><small>Import minus export; negative means surplus export</small></div>
        </div>
        <div class="nyseg-baseline-layout">
          <article class="nyseg-data-panel nyseg-data-panel-wide"><div class="nyseg-panel-heading"><div><h3>Historical Billing Month to Month</h3><p>Energy usage and itemized electricity charges from each PDF.</p></div></div><div class="nyseg-table-scroll"><table class="table nyseg-data-table mb-0"><thead><tr><th>Billing Period</th><th>Used</th><th>Delivery</th><th>Supply</th><th>Taxes</th><th>Misc.</th><th>Energy Total</th><th>Amount Due</th></tr></thead><tbody>${billingRows}</tbody></table></div><p class="nyseg-table-footnote">Amount Due can include prior balances, budget billing, or payment-plan amounts. Energy Total is the better month-to-month electricity-charge comparison.</p></article>
          <article class="nyseg-data-panel"><div class="nyseg-panel-heading"><div><h3>Net Metering</h3><p>Register 01 import versus Register 02 export.</p></div></div><div class="nyseg-table-scroll nyseg-table-scroll-compact"><table class="table nyseg-data-table mb-0"><thead><tr><th>Period</th><th>Import</th><th>Export</th><th>Net</th></tr></thead><tbody>${netRows}</tbody></table></div><div class="tracker-modal-note mt-2">The meter-transition bill includes 419 kWh from the old meter. Smart-meter-only totals are ${formatNumber(net.smart_meter_import_kwh, 0, 0)} kWh imported and ${formatNumber(net.export_kwh, 0, 0)} kWh exported.</div></article>
          <article class="nyseg-data-panel nyseg-data-panel-full"><div class="nyseg-panel-heading"><div><h3>Usage Data Month to Month</h3><p>Scrollable NYSEG export history, newest month first.</p></div></div><div class="nyseg-table-scroll nyseg-usage-scroll"><table class="table nyseg-data-table mb-0"><thead><tr><th>Month</th><th>Billing Period</th><th>Usage</th><th>Usage Cost</th><th>Effective $/kWh</th><th>Avg. Temp.</th></tr></thead><tbody>${usageRows}</tbody></table></div></article>
        </div>
      </div></div></section>`;
  }
  const legacyBillHref = isStaticSite() ? "NYSEG%20Bill/Bills/08_06_26%20-%2009_03_26.pdf" : "/documents/nyseg-monthly-bill/view";
  if (!monthlyBill?.available) {
    return `
      <section class="row g-3 mb-4">
        <div class="col-12">
          <div class="card tracker-card">
            <div class="card-body">
              <p class="eyebrow mb-2">Monthly Bill Reference</p>
              <h2 class="h5 mb-2">Integrated NYSEG bill context</h2>
              <div class="tracker-modal-note">No monthly bill reference is currently loaded.</div>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  return `
    <section class="row g-3 mb-4">
      <div class="col-lg-7">
        <div class="card tracker-card h-100">
          <div class="card-body">
            <div class="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-3">
              <div>
                <p class="eyebrow mb-2">Monthly Bill Reference</p>
                <h2 class="h5 mb-1">Integrated NYSEG bill context</h2>
                <p class="text-muted mb-0">Use this bill reference to compare billed utility behavior against the solar-era dashboard and the historic workbook baseline.</p>
              </div>
              <div class="d-flex flex-wrap gap-2 align-items-center">
                <span class="ai-status-pill ai-status-pill-success">Bill Loaded</span>
                <a class="btn btn-contract btn-sm" href="${legacyBillHref}">View Bill</a>
              </div>
            </div>
            <div class="info-grid mb-3">
              <div><span>Statement Date</span><strong>${escapeHtml(monthlyBill.statement_date || "")}</strong></div>
              <div><span>Billing Period</span><strong>${escapeHtml(monthlyBill.billing_start_date || "")} to ${escapeHtml(monthlyBill.billing_end_date || "")}</strong></div>
              <div><span>Amount Due</span><strong>${formatCurrency(monthlyBill.amount_due)}</strong></div>
              <div><span>Energy Charges</span><strong>${formatCurrency(monthlyBill.total_energy_charges)}</strong></div>
              <div><span>Current Usage</span><strong>${formatNumber(monthlyBill.current_usage_kwh, 0, 0)} kWh</strong></div>
              <div><span>Avg Daily Use</span><strong>${formatNumber(monthlyBill.average_daily_use_kwh, 0, 0)} kWh/day</strong></div>
              <div><span>Prior Year Daily Use</span><strong>${formatNumber(monthlyBill.prior_year_average_daily_use_kwh, 0, 0)} kWh/day</strong></div>
              <div><span>Budget Billing</span><strong>${formatCurrency(monthlyBill.budget_billing_amount)}</strong></div>
            </div>
            <div class="tracker-modal-note">
              The file name says July 2027, but the bill content shows a statement date of ${escapeHtml(monthlyBill.statement_date || "")}. The app uses the statement date as the source of truth for context.
            </div>
          </div>
        </div>
      </div>
      <div class="col-lg-5">
        <div class="card tracker-card h-100">
          <div class="card-body">
            <h2 class="h5 mb-3">Bill Context Notes</h2>
            <div class="tracker-modal-math">
              <div class="tracker-modal-step">
                <strong>1. Low Utility Usage During Solar Era</strong>
                <p>The bill shows ${formatNumber(monthlyBill.current_usage_kwh, 0, 0)} kWh over ${formatNumber(monthlyBill.days_in_period, 0, 0)} days, versus a prior-year daily average of ${formatNumber(monthlyBill.prior_year_average_daily_use_kwh, 0, 0)} kWh/day.</p>
              </div>
              <div class="tracker-modal-step">
                <strong>2. Billing Structure Still Matters</strong>
                <p>The amount due is driven mostly by budget billing and agreement structure, not only the energy-charge subtotal of ${formatCurrency(monthlyBill.total_energy_charges)}.</p>
              </div>
              <div class="tracker-modal-step">
                <strong>3. Use With Solar Dashboard</strong>
                <p>This bill adds practical billing context around why low imported usage does not always translate directly into a low amount due.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  `;
}

function isDashboardCompactModeEnabled() {
  return window.localStorage?.getItem(dashboardCompactModeStorageKey) === "true";
}

function updateDashboardViewToggleLabels(isCompactMode) {
  document.querySelectorAll("[data-dashboard-view-toggle]").forEach((button) => {
    button.textContent = isCompactMode ? "Standard View" : "Field Mode";
    button.setAttribute("aria-pressed", String(isCompactMode));
    button.classList.toggle("dashboard-view-button-active", isCompactMode);
  });
}

function resizeDashboardCharts() {
  if (typeof Plotly === "undefined") return;
  const chartHeight = document.body.classList.contains("dashboard-compact-mode") ? 210 : 320;
  document.querySelectorAll(".dashboard-chart, .dashboard-chart-embedded .js-plotly-plot").forEach((chart) => {
    try {
      Plotly.relayout(chart, { height: chartHeight });
      Plotly.Plots.resize(chart);
    } catch (error) {
      // Ignore elements that are wrappers instead of direct Plotly nodes.
    }
  });
}

function applyDashboardCompactMode(isCompactMode) {
  if (getPageName() !== "dashboard") return;
  document.body.classList.toggle("dashboard-compact-mode", isCompactMode);
  updateDashboardViewToggleLabels(isCompactMode);
  window.localStorage?.setItem(dashboardCompactModeStorageKey, String(isCompactMode));
  window.setTimeout(resizeDashboardCharts, 30);
}

function setupDashboardViewToggle() {
  if (getPageName() !== "dashboard") return;
  document.querySelectorAll("[data-dashboard-view-toggle]").forEach((button) => {
    if (button.dataset.boundToggle === "true") return;
    button.dataset.boundToggle = "true";
    button.addEventListener("click", () => {
      const nextState = !document.body.classList.contains("dashboard-compact-mode");
      applyDashboardCompactMode(nextState);
    });
  });
  applyDashboardCompactMode(isDashboardCompactModeEnabled());
}

function setAiAnswerDisplay(result, isLoading = false) {
  const panel = document.getElementById("ai-answer-panel");
  const title = document.getElementById("ai-answer-title");
  const meta = document.getElementById("ai-answer-meta");
  const text = document.getElementById("ai-answer-text");
  const list = document.getElementById("ai-answer-list");
  const disclaimer = document.getElementById("ai-answer-disclaimer");
  const providerPill = document.getElementById("ai-provider-pill");
  if (!panel || !title || !meta || !text || !list || !disclaimer) return;

  panel.classList.toggle("ai-answer-loading", isLoading);
  if (!result) return;

  title.textContent = result.title || "AI Solar Analyst";
  meta.textContent = result.provider === "openai"
    ? "OpenAI-enhanced grounded answer"
    : "Grounded dashboard analysis";
  text.textContent = result.answer || "";
  list.innerHTML = (result.bullets || []).map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("");
  disclaimer.textContent = result.disclaimer || "";

  if (providerPill) {
    const ready = Boolean(result.openai_configured || result.provider === "openai");
    providerPill.textContent = result.provider === "openai" ? "OpenAI Answer" : (ready ? "OpenAI Ready" : "Rules Mode");
    providerPill.classList.toggle("ai-status-pill-success", ready);
  }
}

function buildLocalAiAnswer(question) {
  const normalized = String(question || "").trim().toLowerCase();
  const entries = dashboardAiState.entries || [];
  const metrics = dashboardAiState.metrics || {};
  const latest = entries.length ? entries[entries.length - 1] : null;
  const monthlyBill = dashboardAiState.monthlyBill || {};
  const rollingAverage = entries.length
    ? mean(entries.slice(-7).map((entry) => Number(entry.production_kwh || 0)))
    : 0;
  const rollingIrradiance = entries.length
    ? mean(entries.slice(-7).map((entry) => Number(entry.irradiance_peak_wm2 || 0)))
    : 0;

  if (normalized.includes("inverter")) {
    return {
      title: "Inverter Check",
      answer: "I cannot reliably determine inverter underperformance yet.",
      bullets: [
        "The current dataset is system-level only.",
        "There is no inverter-by-inverter production feed connected yet.",
        "SolarEdge inverter telemetry would unlock a real underperformance comparison."
      ],
      provider: "rules",
      disclaimer: "This local fallback uses only the dashboard data already loaded in the browser.",
      openai_configured: dashboardAiState.openaiConfigured
    };
  }

  if (normalized.includes("tomorrow")) {
    const irradianceFactor = rollingIrradiance > 0 && latest
      ? Math.min(1.15, Math.max(0.7, Number(latest.irradiance_peak_wm2 || 0) / rollingIrradiance))
      : 1;
    const forecast = ((rollingAverage * 0.65) + (Number(metrics.today_production || 0) * 0.35)) * irradianceFactor;
    return {
      title: "Tomorrow Forecast",
      answer: `My best short-term estimate for tomorrow is about ${formatNumber(forecast, 1, 1)} kWh.`,
      bullets: [
        `Recent 7-day production average: ${formatNumber(rollingAverage, 1, 1)} kWh.`,
        `Latest irradiance: ${formatNumber(latest?.irradiance_peak_wm2 || 0, 0, 0)} W/m².`,
        "This is a trend-based forecast, not a true external weather forecast."
      ],
      provider: "rules",
      disclaimer: "This local fallback uses only the dashboard data already loaded in the browser.",
      openai_configured: dashboardAiState.openaiConfigured
    };
  }

  if (normalized.includes("next month")) {
    const estimate = rollingAverage * 30;
    return {
      title: "Next Month Estimate",
      answer: `My current estimate for next month is about ${formatNumber(estimate, 0, 0)} kWh.`,
      bullets: [
        `That is based on a recent daily run rate of ${formatNumber(rollingAverage, 1, 1)} kWh.`,
        "This estimate is lightweight and should improve as more history accumulates.",
        "It does not yet include external weather forecast data."
      ],
      provider: "rules",
      disclaimer: "This local fallback uses only the dashboard data already loaded in the browser.",
      openai_configured: dashboardAiState.openaiConfigured
    };
  }

  if (normalized.includes("compare") && normalized.includes("month")) {
    return {
      title: "Month Comparison",
      answer: `Year-to-date production is ${formatNumber(metrics.ytd_production || 0, 1, 1)} kWh.`,
      bullets: [
        `Current monthly average: ${formatNumber(metrics.monthly_average || 0, 1, 1)} kWh/day.`,
        `Recent 7-day average: ${formatNumber(metrics.weekly_average || 0, 1, 1)} kWh/day.`,
        "For a richer month-over-month comparison, use the local Flask app where the AI route adds more contextual reasoning."
      ],
      provider: "rules",
      disclaimer: "This local fallback uses only the dashboard data already loaded in the browser.",
      openai_configured: dashboardAiState.openaiConfigured
    };
  }

  if (normalized.includes("saving")) {
    return {
      title: "Savings Outlook",
      answer: `The current estimated annual savings are ${formatCurrency(metrics.annual_savings || 0)}.`,
      bullets: [
        `Estimated monthly savings: ${formatCurrency(metrics.monthly_savings || 0)}.`,
        `Estimated solar offset: ${formatNumber(metrics.solar_offset_pct || 0, 1, 1)}%.`,
        "This includes the current rate, fixed charges, lease payment, and estimated self-consumption logic."
      ],
      provider: "rules",
      disclaimer: "This local fallback uses only the dashboard data already loaded in the browser.",
      openai_configured: dashboardAiState.openaiConfigured
    };
  }

  if (normalized.includes("bill") || normalized.includes("amount due") || normalized.includes("budget billing") || normalized.includes("payment agreement")) {
    if (!monthlyBill.available) {
      return {
        title: "Bill Reference",
        answer: "I do not have a monthly bill reference loaded yet.",
        bullets: [
          "Add a monthly bill PDF to compare billed behavior against solar production and grid imports."
        ],
        provider: "rules",
        disclaimer: "This local fallback uses only the dashboard data already loaded in the browser.",
        openai_configured: dashboardAiState.openaiConfigured
      };
    }
    return {
      title: "Bill Reference",
      answer: `The current bill reference shows an amount due of ${formatCurrency(monthlyBill.amount_due)} even though the energy charges subtotal is only ${formatCurrency(monthlyBill.total_energy_charges)}.`,
      bullets: [
        `Budget billing amount: ${formatCurrency(monthlyBill.budget_billing_amount)}.`,
        `Payment agreement amount: ${formatCurrency(monthlyBill.payment_agreement_amount)}.`,
        `Current usage during the billing period: ${formatNumber(monthlyBill.current_usage_kwh, 0, 0)} kWh over ${formatNumber(monthlyBill.days_in_period, 0, 0)} days.`
      ],
      provider: "rules",
      disclaimer: "This local fallback combines the bill reference with the current dashboard data already in the browser.",
      openai_configured: dashboardAiState.openaiConfigured
    };
  }

  if (normalized.includes("cause") || normalized.includes("why") || normalized.includes("low production")) {
    return {
      title: "Low Production Analysis",
      answer: "Here is my best explanation for the lower production day.",
      bullets: [
        `Today's production is ${formatNumber(metrics.today_production || 0, 1, 1)} kWh versus a recent average of ${formatNumber(rollingAverage, 1, 1)} kWh.`,
        `Today's irradiance is ${formatNumber(metrics.today_irradiance || 0, 0, 0)} W/m² versus a recent average of ${formatNumber(rollingIrradiance, 0, 0)} W/m².`,
        `Recorded weather: ${latest?.weather || "Unknown"}.`
      ],
      provider: "rules",
      disclaimer: "This local fallback uses only the dashboard data already loaded in the browser.",
      openai_configured: dashboardAiState.openaiConfigured
    };
  }

  if (normalized.includes("anomal") || normalized.includes("issue") || normalized.includes("alert")) {
    return {
      title: "Anomaly Scan",
      answer: "I checked the recent production and grid-flow pattern for anomalies.",
      bullets: [
        `Current projection: ${formatNumber(metrics.annual_projection || 0, 0, 0)} kWh.`,
        `Consecutive poor days: ${metrics.consecutive_poor_days || 0}.`,
        `Today's export/import: ${formatNumber(metrics.today_export || 0, 1, 1)} / ${formatNumber(metrics.today_import || 0, 1, 1)} kWh.`
      ],
      provider: "rules",
      disclaimer: "This local fallback uses only the dashboard data already loaded in the browser.",
      openai_configured: dashboardAiState.openaiConfigured
    };
  }

  if (normalized.includes("effective") || normalized.includes("effectiveness") || normalized.includes("baseline") || normalized.includes("historical") || normalized.includes("pre-solar")) {
    const historicalUsage = dashboardAiState.historicalUsage || {};
    if (!historicalUsage.available) {
      return {
        title: "Historic Baseline Analysis",
        answer: "I do not have a historical NYSEG workbook loaded yet for a pre-solar baseline comparison.",
        bullets: [
          "Add the historic usage workbook so the AI can compare solar-era behavior against pre-solar consumption."
        ],
        provider: "rules",
        disclaimer: "This local fallback uses only the dashboard data already loaded in the browser.",
        openai_configured: dashboardAiState.openaiConfigured
      };
    }
    return {
      title: "Historic Baseline Analysis",
      answer: `The historical NYSEG workbook suggests a pre-solar annualized usage baseline of about ${formatNumber(historicalUsage.annualized_kwh, 0, 0)} kWh, which is close to the contract-era expectation.`,
      bullets: [
        `Historical average monthly usage: ${formatNumber(historicalUsage.average_monthly_kwh, 0, 0)} kWh.`,
        `Historical annualized usage: ${formatNumber(historicalUsage.annualized_kwh, 0, 0)} kWh.`,
        `Current estimated solar offset: ${formatNumber(metrics.solar_offset_pct || 0, 1, 1)}%.`
      ],
      provider: "rules",
      disclaimer: "This local fallback combines the loaded workbook baseline with the current dashboard data already in the browser.",
      openai_configured: dashboardAiState.openaiConfigured
    };
  }

  return {
    title: "Guarantee Check",
    answer: (metrics.projection_vs_guarantee_kwh || 0) >= 0
      ? `Yes, the current run rate is ahead of the contract guarantee by about ${formatNumber(Math.abs(metrics.projection_vs_guarantee_kwh || 0), 0, 0)} kWh.`
      : `Right now the run rate is behind the contract guarantee by about ${formatNumber(Math.abs(metrics.projection_vs_guarantee_kwh || 0), 0, 0)} kWh.`,
    bullets: [
      `Annual projection: ${formatNumber(metrics.annual_projection || 0, 0, 0)} kWh.`,
      `Guarantee progress: ${formatNumber(metrics.guarantee_progress_pct || 0, 1, 1)}%.`,
      `Estimated annual savings: ${formatCurrency(metrics.annual_savings || 0)}.`
    ],
    provider: "rules",
    disclaimer: "This local fallback uses only the dashboard data already loaded in the browser.",
    openai_configured: dashboardAiState.openaiConfigured
  };
}

async function askDashboardAi(question) {
  if (!question.trim()) {
    return;
  }

  setAiAnswerDisplay({
    title: "AI Solar Analyst",
    answer: "Working on your solar analysis...",
    bullets: ["Reviewing production, irradiance, grid flow, and guarantee metrics."],
    provider: "rules",
    disclaimer: "Please wait while the dashboard analyzes the current dataset.",
    openai_configured: dashboardAiState.openaiConfigured
  }, true);

  if (!isStaticSite()) {
    try {
      const response = await fetch("/api/ai/ask", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question,
          entries: dashboardAiState.entries,
          config: dashboardAiState.config
        })
      });
      if (response.ok) {
        const result = await response.json();
        setAiAnswerDisplay(result, false);
        return;
      }
    } catch (error) {
      // Fall back to browser rules below.
    }
  }

  setAiAnswerDisplay(buildLocalAiAnswer(question), false);
}

function setupAiAssistant() {
  if (getPageName() !== "dashboard") return;
  const form = document.getElementById("ai-ask-form");
  const input = document.getElementById("ai-question-input");
  const resetButton = document.getElementById("ai-reset-button");
  const collapseElement = document.getElementById("ai-panel-collapse");
  const toggleButton = document.getElementById("ai-panel-toggle");
  if (!form || !input) return;

  if (collapseElement && toggleButton && !collapseElement.dataset.boundCollapse) {
    collapseElement.dataset.boundCollapse = "true";
    collapseElement.addEventListener("show.bs.collapse", () => {
      toggleButton.textContent = "Hide AI";
      toggleButton.setAttribute("aria-expanded", "true");
    });
    collapseElement.addEventListener("hide.bs.collapse", () => {
      toggleButton.textContent = "Show AI Tools";
      toggleButton.setAttribute("aria-expanded", "false");
    });
    toggleButton.textContent = collapseElement.classList.contains("show") ? "Hide AI" : "Show AI Tools";
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    await askDashboardAi(input.value);
  });

  document.querySelectorAll("[data-ai-prompt]").forEach((button) => {
    button.addEventListener("click", async () => {
      input.value = button.dataset.aiPrompt || "";
      await askDashboardAi(input.value);
    });
  });

  if (resetButton) {
    resetButton.addEventListener("click", () => {
      input.value = "";
      setAiAnswerDisplay({
        title: "AI Solar Analyst",
        answer: "Ask a question or tap one of the prompt chips to generate a grounded solar analysis.",
        bullets: [
          "Track guarantee pace against current annual projection.",
          "Explain lower production days from irradiance, weather, and recent trend data.",
          "Estimate tomorrow, next month, and annual savings from current dashboard data."
        ],
        provider: "rules",
        disclaimer: "This phase uses the current dashboard dataset and does not yet include inverter-level telemetry or external forecast APIs.",
        openai_configured: dashboardAiState.openaiConfigured
      }, false);
    });
  }
}

function buildSolarPathTrackerHtml(entry = {}, config = {}, entries = []) {
  const encodedProfile = encodeURIComponent(JSON.stringify(
    Array.isArray(entry.irradiance_hourly_profile) ? entry.irradiance_hourly_profile : []
  ));
  const weather = escapeHtml(entry.weather || "Unknown");
  return `
    <section
      class="solar-path-tracker tracker-card mb-4"
      data-solar-path-tracker
      data-entry-date="${escapeHtml(entry.entry_date || "")}"
      data-weather="${weather}"
      data-cloud-cover="${entry.cloud_cover_pct ?? ""}"
      data-irradiance-peak="${Number(entry.irradiance_peak_wm2 || 0)}"
      data-daily-production="${Number(entry.production_kwh || 0)}"
      data-system-size="${Number(config.system_size_kw_dc || 18.45)}"
      data-hourly-profile="${encodedProfile}"
      data-entry-history="${escapeHtml(encodeURIComponent(JSON.stringify(entries || [])))}"
    >
      <button class="solar-path-summary" type="button" data-solar-path-toggle aria-expanded="false">
        <span class="solar-path-summary-title"><span class="eyebrow">Live Solar Tracker</span><strong>The Sun's Path Across Yorktown Heights</strong></span>
        <span class="solar-path-summary-live">
          <span><small>Sun position</small><strong data-solar-summary-position>Calculating...</strong></span>
          <span><small>Estimated now</small><strong data-solar-summary-power>-- kW</strong></span>
          <span><small>Sky</small><strong data-solar-summary-weather>${weather}</strong></span>
        </span>
        <span class="solar-path-expand-label"><span data-solar-toggle-label>Expand tracker</span><span class="solar-path-chevron" aria-hidden="true">⌄</span></span>
      </button>
      <div class="solar-path-panel" data-solar-path-panel hidden>
        <div class="solar-review-controls" aria-label="Solar path review controls">
          <div class="solar-review-date-group"><label>Review Date</label><div class="solar-review-button-row"><button type="button" data-solar-previous-day title="Review the previous day">Previous</button><input type="date" data-solar-review-date><button type="button" data-solar-next-day title="Review the next day">Next</button></div><label class="solar-location-label">Arc Location<select data-solar-location><option value="yorktown" selected>Yorktown Heights, NY</option><option value="dallas">Dallas, TX</option><option value="negril">Negril, Jamaica</option></select></label></div>
          <div class="solar-review-time-group"><div class="solar-review-time-heading"><label>Time of Day</label><strong data-solar-review-time-label>Live now</strong></div><input type="range" min="360" max="1200" step="15" data-solar-review-time><div class="solar-review-button-row"><button type="button" data-solar-previous-hour>-1 Hour</button><button type="button" data-solar-play>Play Day</button><button type="button" data-solar-next-hour>+1 Hour</button><button type="button" class="solar-live-button" data-solar-live>Live Now</button></div></div>
        </div>
        <div class="solar-sky" data-solar-sky>
          <div class="solar-sky-stars" aria-hidden="true"></div><div class="solar-cloud solar-cloud-one" aria-hidden="true"></div><div class="solar-cloud solar-cloud-two" aria-hidden="true"></div><div class="solar-rain" aria-hidden="true"></div>
          <div class="solar-editorial-head"><span data-solar-window-kicker>Today's Solar Window</span><h2 data-solar-editorial-title>The Sun's Path Across the Sky</h2><p data-solar-editorial-meta>Yorktown Heights, NY</p></div>
          <div class="solar-insight-card"><span data-solar-interpretation-kicker>Live interpretation</span><strong data-solar-insight-title>Reading the sky...</strong><p data-solar-insight>Current conditions and solar position will appear here.</p></div>
          <svg class="solar-arc" viewBox="0 0 1000 360" preserveAspectRatio="none" role="img" aria-label="Current day's calculated sun path"><path data-solar-arc-path></path></svg>
          <div class="solar-hour-markers" data-solar-hour-markers aria-hidden="true"></div><div class="solar-current-sun" data-solar-marker aria-hidden="true"><span>Now</span></div><div class="solar-horizon"></div>
          <div class="solar-compass" aria-hidden="true"><span>NE<br><small>45°</small></span><span>E<br><small>90°</small></span><span>S<br><small>180°</small></span><span>W<br><small>270°</small></span><span>NW<br><small>315°</small></span></div>
          <div class="solar-sky-caption"><strong data-solar-sky-title>Current sky</strong><span data-solar-sky-detail>Loading weather and irradiance...</span></div>
        </div>
        <div class="solar-path-detail-grid">
          <div><span>Local Time</span><strong data-solar-local-time>--</strong><small>America/New_York</small></div>
          <div><span>Sun Position</span><strong data-solar-position>--</strong><small data-solar-direction>--</small></div>
          <div><span>Solar Window</span><strong data-solar-window>--</strong><small data-solar-noon>--</small></div>
          <div><span>Current Irradiance</span><strong data-solar-irradiance>-- W/m²</strong><small data-solar-irradiance-source>Open-Meteo hourly</small></div>
          <div><span>Estimated Current Power</span><strong data-solar-power>-- kW</strong><small data-solar-energy-pace>-- kWh per hour at this pace</small></div>
          <div><span>Sunrun Daily Record</span><strong data-solar-daily-production>-- kWh</strong><small data-solar-record-date>--</small></div>
        </div>
        <div class="solar-reference-band">
          <div class="solar-path-table-wrap"><table class="table solar-path-table mb-0"><thead><tr><th>Time</th><th>Azimuth</th><th>Elevation</th><th>Estimated Power</th></tr></thead><tbody data-solar-hourly-rows></tbody></table></div>
          <aside class="solar-takeaways"><span class="solar-takeaways-kicker">Key Takeaways</span><h3>What today's path means</h3><ul data-solar-takeaways><li>Calculating today's solar story...</li></ul></aside>
        </div>
        <p class="solar-path-disclaimer mb-0">Sun position is calculated for Yorktown Heights. Current power is an estimate based on Open-Meteo irradiance and an 86% system derate; Sunrun remains the source of final daily production.</p>
      </div>
    </section>`;
}

function renderDashboardHtmlClient(entries, metrics, config, firebaseStatus, alerts) {
  const recentEntries = getDisplayEntries(entries).slice(-10).reverse();
  const energyImpact = buildEnergyImpactSummaryClient(metrics, config);
  const summaryHref = isStaticSite() ? "contract-summary.html" : "/contract-summary";
  const contractHref = isStaticSite() ? "Documents/SunRun Solar Contract.pdf" : "/documents/sunrun-contract";
  const entriesHref = isStaticSite() ? "entries.html?autocreate=1" : "/entries?autocreate=1";
  const leftImageUrl = getAssetUrl("images/solar-home-side.png");
  const rightImageUrl = getAssetUrl("images/solar-farm-side.png");
  const firebaseStatusTitle =
    firebaseStatus?.kind === "success"
      ? "Firebase connected"
      : firebaseStatus?.kind === "local"
        ? "Local snapshot loaded"
      : firebaseStatus?.kind === "loading"
        ? "Connecting to Firebase"
        : "Firestore connection issue";
  const firebaseStatusPill = firebaseStatus?.using_demo_data
    ? (firebaseStatus?.kind === "loading" ? "Using startup data" : "Showing demo data")
    : "";
  return `
    <div class="dashboard-editorial-shell">
      <aside class="dashboard-side-panel">
        <div class="dashboard-side-frame">
          <img src="${leftImageUrl}" alt="Residential home with rooftop solar panels">
          <div class="dashboard-side-overlay">
            <span class="dashboard-side-kicker">Residential Array</span>
            <strong>Home-scale production context</strong>
            <p>Keep rooftop system performance visible alongside production, weather, and household energy flow.</p>
          </div>
        </div>
      </aside>
      <div class="dashboard-main-column">
        <section class="hero-panel mb-4">
          <div class="dashboard-hero-layout">
            <div class="dashboard-hero-copy">
              <p class="eyebrow mb-2">Sunrun + NYSEG + Irradiance + Weather</p>
              <h1 class="hero-title mb-2">Solar performance and guarantee tracking</h1>
              <div class="dashboard-hero-actions">
                <button type="button" class="btn btn-contract btn-sm" data-dashboard-view-toggle aria-pressed="false">Field Mode</button>
                <button type="button" class="btn btn-contract btn-sm" data-bs-toggle="modal" data-bs-target="#dashboardIntroModal">About</button>
                <button type="button" class="btn btn-sun btn-sm" onclick="window.location.assign(window.location.pathname + '?refresh=' + Date.now())" title="Re-read the SunRun CSV and refresh live Firebase data">Force Load Data</button>
                <a class="btn btn-sun btn-sm" href="${isStaticSite() ? '#' : '/nyseg-usage-file/daily'}"${isStaticSite() ? ' aria-disabled="true" title="The NYSEG file is available in the local app only"' : ''}>View NYSEG and Sunrun Files</a>
                <a class="btn btn-contract btn-sm" href="${isStaticSite() ? "light-bulbs.html" : "/light-bulbs"}">Light Bulbs</a>
                <a class="btn btn-contract btn-sm" href="${isStaticSite() ? "electricity-usage.html" : "/electricity-usage"}">Electricity Usage</a>
                ${isStaticSite()
                  ? '<span class="btn btn-contract btn-sm disabled" title="The private circuit directory is available in the local app only">Circuit Breakers (Local)</span>'
                  : '<a class="btn btn-contract btn-sm" href="/circuit-breakers" target="_blank" rel="noopener noreferrer">Circuit Breakers</a>'}
              </div>
            </div>
            <div class="stat-callout dashboard-projection-callout">
              <div class="d-flex justify-content-between align-items-start gap-2">
                <span class="small-label mb-0">Annual Projection</span>
                <button type="button" class="metric-info-button" data-bs-toggle="modal" data-bs-target="#annualProjectionModal" aria-label="Explain annual projection calculation">?</button>
              </div>
              <div class="callout-value">${formatNumber(metrics.annual_projection, 0, 0)} kWh</div>
              <div class="projection-difference ${metrics.projection_vs_guarantee_kwh >= 0 ? "text-success" : "text-danger"}">
                ${metrics.projection_vs_guarantee_kwh >= 0 ? "Ahead" : "Behind"} ${formatNumber(Math.abs(metrics.projection_vs_guarantee_kwh), 0, 0)} kWh (${formatNumber(Math.abs(metrics.projection_vs_guarantee_pct), 1, 1)}%)
              </div>
            </div>
          </div>
        </section>
        ${buildSolarPathTrackerHtml(entries.length ? entries[entries.length - 1] : {}, config, entries)}
        ${firebaseStatus?.message ? `<section class="mb-4"><div class="status-banner ${firebaseStatus.kind === "success" ? "status-banner-success" : ""}"><div><p class="status-title mb-1">${firebaseStatusTitle}</p><p class="mb-0">${firebaseStatus.message}</p></div>${firebaseStatusPill ? `<span class="status-pill">${firebaseStatusPill}</span>` : ""}</div></section>` : ""}
        ${alerts.length ? `<section class="mb-4"><div class="card tracker-card"><div class="card-body"><h2 class="h5 mb-3">Alerts &amp; Context</h2><div class="d-flex flex-column gap-2">${alerts.map((alert) => `<div class="badge text-bg-warning p-2 text-wrap text-start lh-base">${alert}</div>`).join("")}</div></div></div></section>` : ""}
        ${buildAiPanelHtml(dashboardAiState.openaiConfigured)}
        <section class="row g-2 mb-4 dashboard-summary-row">
          <div class="col-md-6 col-xl-3"><div class="metric-card dashboard-summary-metric sun" title="${metrics.today_pending_sunrun ? "Today's value is pending final data from SunRun. " : ""}Yesterday: ${formatNumber(metrics.yesterday_production, 1, 1)} kWh${metrics.yesterday_pending_sunrun ? "; yesterday is also pending final SunRun data" : ""}."><span>Today's Production</span><strong>${formatNumber(metrics.today_production, 1, 1)} kWh</strong>${metrics.today_pending_sunrun ? '<span class="metric-status-dot" aria-label="Pending final SunRun data"></span>' : ""}</div></div>
          <div class="col-md-6 col-xl-3"><div class="metric-card dashboard-summary-metric export" title="Today's grid import: ${formatNumber(metrics.today_import, 1, 1)} kWh."><span>Today's Export</span><span class="metric-corner-detail">Import ${formatNumber(metrics.today_import, 1, 1)}</span><strong>${formatNumber(metrics.today_export, 1, 1)} kWh</strong></div></div>
          <div class="col-md-6 col-xl-3"><div class="metric-card dashboard-summary-metric sky" title="Current 7-day average production: ${formatNumber(metrics.weekly_average, 1, 1)} kWh."><span>Today's Irradiance</span><strong>${formatNumber(metrics.today_irradiance, 0, 0)} W/m²</strong></div></div>
          <div class="col-md-6 col-xl-3"><div class="metric-card dashboard-summary-metric money" title="Estimated annual savings: ${formatCurrency(metrics.annual_savings)}. Use the help button for the full calculation."><div class="d-flex justify-content-between align-items-start gap-2"><span>Monthly Savings</span><button type="button" class="metric-info-button" data-bs-toggle="modal" data-bs-target="#monthlySavingsModal">?</button></div><strong>${formatCurrency(metrics.monthly_savings)}</strong></div></div>
        </section>
        ${buildOperationalSnapshotHtml(metrics)}
        <section class="row g-3 mb-4">
          <div class="col-lg-8"><div class="card tracker-card h-100"><div class="card-body"><div class="d-flex justify-content-between align-items-start gap-2 mb-2"><h2 class="h5 mb-0">Production Overview</h2><button type="button" class="metric-info-button" data-bs-toggle="modal" data-bs-target="#productionOverviewModal" aria-label="Explain production overview">?</button></div>${metrics.estimated_entry_count ? `<div class="tracker-inline-warning mb-3">${metrics.latest_production_estimated ? "Today's production is currently estimated." : "Some production rows are estimated."} Estimated bars are hatched, and annual projection uses confirmed rows by default${metrics.projection_uses_estimated ? " because no confirmed production rows exist yet." : ""}.</div>` : ""}<div class="chart-popout-frame" data-chart-popout-label="Production Overview"><button type="button" class="btn btn-contract btn-sm chart-popout-button" data-chart-popout>Pop Out</button><div id="daily-chart" class="dashboard-chart"></div></div><div class="energy-impact-panel mt-3"><div class="d-flex flex-wrap justify-content-between align-items-start gap-3 mb-3"><div><h3 class="h6 mb-1">What This Energy Could Do</h3><p class="text-muted mb-0">A quick real-world translation of your solar output using your historic household baseline and a typical EV efficiency.</p></div><span class="energy-impact-assumption">${formatNumber(energyImpact.averageHomeDayKwh, 1, 1)} kWh/day home use • ${formatNumber(energyImpact.evKwhPerMile, 2, 2)} kWh/EV mile</span></div><div class="info-grid energy-impact-grid"><div><span>Today's Output</span><strong>${formatNumber(metrics.today_production, 1, 1)} kWh</strong><small>Enough for about ${formatNumber(energyImpact.averageHomeHoursSupported, 0, 0)} hours of whole-home usage at your historic average.</small></div><div><span>House Coverage</span><strong>${formatNumber(energyImpact.todayHouseDays, 2, 2)} days</strong><small>Based on your pre-solar average of ${formatNumber(energyImpact.averageHomeDayKwh, 1, 1)} kWh per day.</small></div><div><span>EV Range Equivalent</span><strong>${formatNumber(energyImpact.todayEvMiles, 0, 0)} miles</strong><small>Approximate EV driving range that one day of solar production could provide.</small></div><div><span>Year-To-Date Impact</span><strong>${formatNumber(energyImpact.ytdHouseDays, 1, 1)} home-days</strong><small>That same production is roughly equal to ${formatNumber(energyImpact.ytdEvMiles, 0, 0)} EV miles so far.</small></div><div><span>Total Energy To Date</span><strong>${formatNumber(metrics.ytd_production, 1, 1)} kWh</strong><small>Enough cumulative solar energy to cover about ${formatNumber(energyImpact.ytdHouseDays, 1, 1)} full home-days or roughly ${formatNumber(energyImpact.ytdEvMiles, 0, 0)} EV miles.</small></div></div></div></div></div></div>
          <div class="col-lg-4"><div class="card tracker-card h-100"><div class="card-body"><div class="d-flex justify-content-between align-items-start gap-3 mb-3"><h2 class="h5 mb-0">Contract Progress</h2><div class="d-flex flex-wrap gap-2 justify-content-end"><a class="btn btn-contract btn-sm" href="${summaryHref}">Summary</a><a class="btn btn-contract btn-sm" href="${contractHref}" target="_blank" rel="noopener noreferrer">PDF</a></div></div><div class="progress tracker-progress mb-3"><div class="progress-bar" role="progressbar" style="width: ${Math.min(metrics.guarantee_progress_pct, 100)}%"></div></div><div class="info-grid"><div><span>Guarantee</span><strong>${formatNumber(config.production_guarantee_kwh, 0, 0)} kWh</strong></div><div><span>Progress</span><strong>${formatNumber(metrics.guarantee_progress_pct, 1, 1)}%</strong></div><div><span>YTD Production</span><strong>${formatNumber(metrics.ytd_production, 1, 1)} kWh</strong></div><div><span>Avg Daily</span><strong>${formatNumber(metrics.average_daily_production, 1, 1)} kWh</strong></div><div><span>Best Day</span><strong>${formatNumber(metrics.highest_production_day, 1, 1)} kWh</strong></div><div><span>Lowest Day</span><strong>${formatNumber(metrics.lowest_production_day, 1, 1)} kWh</strong></div><div><span>Consecutive Poor Days</span><strong>${metrics.consecutive_poor_days}</strong></div><div><span>Monthly Avg</span><strong>${formatNumber(metrics.monthly_average, 1, 1)} kWh</strong></div></div></div></div></div>
        </section>
        <section class="row g-3 mb-4">
          <div class="col-lg-6"><div class="card tracker-card h-100"><div class="card-body"><h2 class="h5 mb-3">Grid Flow and Virtual Consumption Monitor</h2><div class="chart-popout-frame" data-chart-popout-label="Grid Flow and Virtual Consumption Monitor"><button type="button" class="btn btn-contract btn-sm chart-popout-button" data-chart-popout>Pop Out</button><div id="flow-chart" class="dashboard-chart"></div></div></div></div></div>
          <div class="col-lg-6"><div class="card tracker-card h-100"><div class="card-body"><h2 class="h5 mb-3">Solar Offset Snapshot</h2><div class="info-grid"><div><span>Estimated Self Consumption</span><strong>${formatNumber(metrics.estimated_self_consumption, 1, 1)} kWh</strong></div><div><span>Total Home Consumption</span><strong>${formatNumber(metrics.total_home_consumption, 1, 1)} kWh</strong></div><div><span>Solar Offset</span><strong>${formatNumber(metrics.solar_offset_pct, 1, 1)}%</strong></div><div><span>Expected Offset</span><strong>${formatNumber(config.expected_offset_pct, 1, 1)}%</strong></div><div><span>Electricity Value Produced</span><strong>${formatCurrency(metrics.electricity_value_produced)}</strong></div><div><span>Grid Cost</span><strong>${formatCurrency(metrics.grid_cost)}</strong></div><div><span>Lease Cost</span><strong>${formatCurrency(metrics.lease_cost)}</strong></div><div><span>Lifetime Savings</span><strong>${formatCurrency(metrics.lifetime_savings)}</strong></div><div><span>Tree Removal Payback</span><strong>${metrics.tree_payback_months ? `${formatNumber(metrics.tree_payback_months, 1, 1)} months` : "N/A"}</strong></div></div></div></div></div>
        </section>
        ${buildMonthlyBillPanelHtml(dashboardAiState.monthlyBill)}
        <section class="row g-3 mb-4">
          <div class="col-lg-4"><div class="card tracker-card h-100"><div class="card-body"><div class="chart-popout-frame" data-chart-popout-label="Production and Irradiance Trend"><button type="button" class="btn btn-contract btn-sm chart-popout-button" data-chart-popout>Pop Out</button><div id="irradiance-chart" class="dashboard-chart"></div></div></div></div></div>
          <div class="col-lg-4"><div class="card tracker-card h-100"><div class="card-body"><div class="chart-popout-frame" data-chart-popout-label="Daily Production by Weather"><button type="button" class="btn btn-contract btn-sm chart-popout-button" data-chart-popout>Pop Out</button><div id="weather-chart" class="dashboard-chart"></div></div></div></div></div>
          <div class="col-lg-4"><div class="card tracker-card h-100"><div class="card-body"><div class="chart-popout-frame" data-chart-popout-label="Monthly Progress vs Guarantee"><button type="button" class="btn btn-contract btn-sm chart-popout-button" data-chart-popout>Pop Out</button><div id="monthly-chart" class="dashboard-chart"></div></div></div></div></div>
        </section>
        <section class="card tracker-card"><div class="card-body"><div class="d-flex justify-content-between align-items-center mb-3"><h2 class="h5 mb-0">Recent Entries</h2><a href="${entriesHref}" class="btn btn-sun btn-sm">Add Daily Entry</a></div><div class="table-responsive"><table class="table align-middle"><thead><tr><th>Date</th><th>Production</th><th>Irradiance</th><th>Meter 01</th><th>Meter 02</th><th>Weather</th><th>High</th><th>Low</th></tr></thead><tbody>${recentEntries.map((entry) => `<tr><td>${entry.entry_date}</td><td>${formatNumber(entry.production_kwh, 1, 1)} kWh</td><td>${formatNumber(entry.irradiance_peak_wm2, 0, 0)}</td><td>${formatNumber(entry.meter_01_import_reading, 1, 1)}</td><td>${formatNumber(entry.meter_02_export_reading, 1, 1)}</td><td>${renderWeatherCell(entry)}</td><td>${formatTemperatureCellValue(entry.temperature_high_f)}</td><td>${formatTemperatureCellValue(entry.temperature_low_f)}</td></tr>`).join("")}</tbody></table></div></div></section>
      </div>
      <aside class="dashboard-side-panel">
        <div class="dashboard-side-frame">
          <img src="${rightImageUrl}" alt="Solar farm at sunrise">
          <div class="dashboard-side-overlay">
            <span class="dashboard-side-kicker">Utility Perspective</span>
            <strong>Grid-scale reference frame</strong>
            <p>Balance residential performance against export behavior, annual projections, and contract progress.</p>
          </div>
        </div>
      </aside>
    </div>
    <div class="modal fade" id="annualProjectionModal" tabindex="-1" aria-hidden="true"><div class="modal-dialog modal-lg modal-dialog-centered"><div class="modal-content tracker-modal"><div class="modal-header border-0 pb-0"><div><p class="eyebrow mb-2">Projection Help</p><h2 class="modal-title h4 mb-0">How Annual Projection Is Calculated</h2></div><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body pt-3"><div class="info-grid mb-4"><div><span>Average Daily Production</span><strong>${formatNumber(metrics.average_daily_production, 1, 1)} kWh/day</strong></div><div><span>Projected Annual Output</span><strong>${formatNumber(metrics.annual_projection, 0, 0)} kWh/year</strong></div><div><span>Contract Guarantee</span><strong>${formatNumber(config.production_guarantee_kwh, 0, 0)} kWh/year</strong></div><div><span>Difference</span><strong>${metrics.projection_vs_guarantee_kwh >= 0 ? "Ahead" : "Behind"} ${formatNumber(Math.abs(metrics.projection_vs_guarantee_kwh), 0, 0)} kWh</strong></div></div><div class="tracker-modal-math"><div class="tracker-modal-step"><strong>1. Find the current daily run rate</strong><p>The app averages confirmed production entries first and only falls back to estimated rows if no confirmed rows exist yet.</p><code>${formatNumber(metrics.average_daily_production, 1, 1)} kWh/day from ${metrics.confirmed_entry_count || metrics.estimated_entry_count} ${metrics.confirmed_entry_count ? "confirmed" : "estimated"} row(s)</code></div><div class="tracker-modal-step"><strong>2. Project that run rate across a full year</strong><p>Annual Projection = Average Daily Production × 365 days.</p><code>${formatNumber(metrics.average_daily_production, 1, 1)} × 365 = ${formatNumber(metrics.annual_projection, 0, 0)} kWh</code></div><div class="tracker-modal-step"><strong>3. Compare it to the Sunrun guarantee</strong><p>The projected annual output is compared against your contract guarantee of ${formatNumber(config.production_guarantee_kwh, 0, 0)} kWh/year.</p><code>${metrics.projection_vs_guarantee_kwh >= 0 ? "Ahead" : "Behind"} ${formatNumber(Math.abs(metrics.projection_vs_guarantee_kwh), 0, 0)} kWh (${formatNumber(Math.abs(metrics.projection_vs_guarantee_pct), 1, 1)}%)</code></div></div><p class="text-muted small mt-3 mb-0">This is a running projection based on the data recorded so far. Confirmed production rows are used by default so placeholder days do not distort contract tracking.</p></div></div></div></div>
    <div class="modal fade" id="productionOverviewModal" tabindex="-1" aria-hidden="true"><div class="modal-dialog modal-lg modal-dialog-centered"><div class="modal-content tracker-modal"><div class="modal-header border-0 pb-0"><div><p class="eyebrow mb-2">Chart Help</p><h2 class="modal-title h4 mb-0">How Production Overview Works</h2></div><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body pt-3"><div class="tracker-modal-math"><div class="tracker-modal-step"><strong>Confirmed vs Estimated bars</strong><p>Solid gold bars are confirmed production values. Hatched lighter bars are estimated placeholder values that should be replaced with actual Sunrun production when available.</p></div><div class="tracker-modal-step"><strong>Why Wednesday, July 22, 2026 can look lower than Tuesday, July 21, 2026</strong><p>Weather labels like rainy or sunny come from Open-Meteo, but estimated production rows still come from the app's placeholder logic, not from Sunrun. That means a rainy day can appear more productive than the next day if one or both rows are still estimated.</p></div><div class="tracker-modal-step"><strong>What the blue line means</strong><p>The blue line is the rolling 7-day average. It smooths the bars so you can see the broader trend instead of reacting to one day by itself.</p></div><div class="tracker-modal-step"><strong>How contract tracking stays grounded</strong><p>Annual projection and guarantee pace use confirmed production rows by default. Estimated rows remain visible for context, but they do not drive contract conclusions unless no confirmed rows exist yet.</p></div></div><p class="text-muted small mt-3 mb-0">Best practice: replace each estimated day with the real Sunrun production as soon as it is available. That makes the chart, warnings, and contract projection much more trustworthy.</p></div></div></div></div>
    <div class="modal fade" id="annualProjectionModal" tabindex="-1" aria-hidden="true"><div class="modal-dialog modal-lg modal-dialog-centered"><div class="modal-content tracker-modal"><div class="modal-header border-0 pb-0"><div><p class="eyebrow mb-2">Projection Help</p><h2 class="modal-title h4 mb-0">How Annual Projection Is Calculated</h2></div><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body pt-3"><div class="info-grid mb-4"><div><span>Average Daily Production</span><strong>${formatNumber(metrics.average_daily_production, 1, 1)} kWh/day</strong></div><div><span>Projected Annual Output</span><strong>${formatNumber(metrics.annual_projection, 0, 0)} kWh/year</strong></div><div><span>Contract Guarantee</span><strong>${formatNumber(config.production_guarantee_kwh, 0, 0)} kWh/year</strong></div><div><span>Difference</span><strong>${metrics.projection_vs_guarantee_kwh >= 0 ? "Ahead" : "Behind"} ${formatNumber(Math.abs(metrics.projection_vs_guarantee_kwh), 0, 0)} kWh</strong></div></div><div class="tracker-modal-math"><div class="tracker-modal-step"><strong>1. Find the current daily run rate</strong><p>The app averages confirmed production entries first and only falls back to estimated rows if no confirmed rows exist yet.</p><code>${formatNumber(metrics.average_daily_production, 1, 1)} kWh/day from ${metrics.confirmed_entry_count || metrics.estimated_entry_count} ${metrics.confirmed_entry_count ? "confirmed" : "estimated"} row(s)</code></div><div class="tracker-modal-step"><strong>2. Project that run rate across a full year</strong><p>Annual Projection = Average Daily Production × 365 days.</p><code>${formatNumber(metrics.average_daily_production, 1, 1)} × 365 = ${formatNumber(metrics.annual_projection, 0, 0)} kWh</code></div><div class="tracker-modal-step"><strong>3. Compare it to the Sunrun guarantee</strong><p>The projected annual output is compared against your contract guarantee of ${formatNumber(config.production_guarantee_kwh, 0, 0)} kWh/year.</p><code>${metrics.projection_vs_guarantee_kwh >= 0 ? "Ahead" : "Behind"} ${formatNumber(Math.abs(metrics.projection_vs_guarantee_kwh), 0, 0)} kWh (${formatNumber(Math.abs(metrics.projection_vs_guarantee_pct), 1, 1)}%)</code></div></div><p class="text-muted small mt-3 mb-0">This is a running projection based on the data recorded so far. Confirmed production rows are used by default so placeholder days do not distort contract tracking.</p></div></div></div></div>
    <div class="modal fade" id="dashboardIntroModal" tabindex="-1" aria-hidden="true"><div class="modal-dialog modal-lg modal-dialog-centered"><div class="modal-content tracker-modal"><div class="modal-header border-0 pb-0"><div><p class="eyebrow mb-2">Dashboard Overview</p><h2 class="modal-title h4 mb-0">What this dashboard is tracking</h2></div><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body pt-3"><div class="tracker-modal-math"><div class="tracker-modal-step"><strong>Production and Grid Flow</strong><p>Tracks daily production, import, export, and rolling averages so you can see how the system is behaving day to day.</p></div><div class="tracker-modal-step"><strong>Virtual Consumption Estimate</strong><p>Because there are no consumption CTs installed, the app estimates self-consumption and home usage from production, grid readings, seasonality, and weather.</p></div><div class="tracker-modal-step"><strong>Contract Tracking</strong><p>Compares observed average production against the Sunrun production guarantee and shows whether your current pace is ahead or behind.</p></div><div class="tracker-modal-step"><strong>Financial View</strong><p>Estimates electricity value, grid cost, lease cost, and monthly or annual savings using the current settings saved in the app.</p></div></div></div></div></div></div>
    <div class="modal fade" id="monthlySavingsModal" tabindex="-1" aria-hidden="true"><div class="modal-dialog modal-lg modal-dialog-centered"><div class="modal-content tracker-modal"><div class="modal-header border-0 pb-0"><div><p class="eyebrow mb-2">Financial Breakdown</p><h2 class="modal-title h4 mb-0">How Monthly Savings Is Calculated</h2></div><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body pt-3"><div class="info-grid mb-4"><div><span>Observed Months</span><strong>${metrics.observed_months}</strong></div><div><span>Electric Rate</span><strong>$${formatNumber(config.current_electric_rate,2,2)}/kWh</strong></div><div><span>Monthly Fixed Charges</span><strong>$${formatNumber(config.monthly_fixed_charges,2,2)}</strong></div><div><span>Monthly Lease Payment</span><strong>$${formatNumber(config.monthly_lease_payment,2,2)}</strong></div></div><div class="tracker-modal-math"><div class="tracker-modal-step"><strong>1. Electricity Value Produced</strong><p>Total solar production × electric rate</p><code>${formatCurrency(metrics.electricity_value_produced)}</code></div><div class="tracker-modal-step"><strong>2. Grid Cost</strong><p>(Total imported kWh × electric rate) + (monthly fixed charges × observed months)</p><code>${formatCurrency(metrics.grid_cost)}</code></div><div class="tracker-modal-step"><strong>3. Lease Cost</strong><p>Monthly lease payment × observed months</p><code>${formatCurrency(metrics.lease_cost)}</code></div><div class="tracker-modal-step"><strong>4. Monthly Savings</strong><p>(Electricity value produced - grid cost - lease cost) ÷ observed months</p><code>${formatCurrency(metrics.monthly_savings)}</code></div><div class="tracker-modal-step"><strong>5. Annual Savings</strong><p>Monthly savings × 12</p><code>${formatCurrency(metrics.annual_savings)}</code></div></div></div></div></div></div>
  `;
}

function renderDashboardChartsClient(entries, config = {}) {
  const visibleEntries = getDisplayEntries(entries);
  if (typeof Plotly === "undefined" || !visibleEntries.length) return;
  const classifiedEntries = classifyIrradiancePointsClient(visibleEntries);
  const dates = classifiedEntries.map((entry) => entry.entry_date);
  const compactMode = document.body.classList.contains("dashboard-compact-mode");
  const chartHeight = compactMode ? 210 : 320;
  const baseLayout = { margin: { l: 20, r: 20, t: 48, b: 32 }, template: "plotly_white", height: chartHeight };

  const plotConfig = { responsive: true, displayModeBar: false };

  Plotly.newPlot("daily-chart", [
    { type: "bar", x: dates, y: classifiedEntries.map((entry) => entry.estimated ? null : entry.production_kwh), name: "Confirmed Production (kWh)", marker: { color: "#e3a008" } },
    { type: "bar", x: dates, y: classifiedEntries.map((entry) => entry.estimated ? entry.production_kwh : null), name: "Estimated Production (kWh)", marker: { color: "#f6c86a", pattern: { shape: "/" } } },
    { type: "scatter", x: dates, y: classifiedEntries.map((entry) => entry.rolling_7_day_prod), name: "7-Day Average", line: { color: "#0f4c81", width: 3 } }
  ], { ...baseLayout, title: { text: "Daily Production" }, bargap: 0.12, barmode: "overlay" }, plotConfig);

  Plotly.newPlot("flow-chart", [
    { type: "scatter", x: dates, y: classifiedEntries.map((entry) => entry.daily_import_kwh), name: "Import", line: { color: "#b42318" } },
    { type: "scatter", x: dates, y: classifiedEntries.map((entry) => entry.daily_export_kwh), name: "Export", line: { color: "#157f3b" } },
    { type: "scatter", x: dates, y: classifiedEntries.map((entry) => entry.estimated_self_consumption_kwh), name: "Estimated Self Consumption", line: { color: "#0f4c81", dash: "dot" } }
  ], { ...baseLayout, title: { text: "Grid Flow and Estimated Self Consumption" } }, plotConfig);

  Plotly.newPlot("operational-production-chart", [{
    type: "scatter",
    mode: "lines+markers",
    x: dates,
    y: classifiedEntries.map((entry) => Number(entry.production_kwh || 0)),
    name: "SunRun Production",
    line: { color: "#2f6f3e", width: 3 },
    marker: {
      size: 10,
      color: classifiedEntries.map((entry) => Number(entry.production_kwh || 0)),
      colorscale: [
        [0.0, "#0f4c81"],
        [0.4, "#2a8ac7"],
        [0.7, "#f2b94b"],
        [1.0, "#e26a2c"]
      ],
      line: { width: 1, color: "#ffffff" }
    }
  }], {
    ...baseLayout,
    title: { text: "Daily SunRun Production" },
    xaxis: { tickangle: -45 },
    yaxis: { title: "kWh" }
  }, plotConfig);

  Plotly.newPlot("operational-balance-chart", [
    { type: "bar", x: dates, y: classifiedEntries.map((entry) => Number(entry.production_kwh || 0)), name: "SunRun Production", marker: { color: "#e26a2c" } },
    { type: "bar", x: dates, y: classifiedEntries.map((entry) => Number(entry.daily_import_kwh || 0)), name: "Grid Import", marker: { color: "#157f3b" } },
    { type: "bar", x: dates, y: classifiedEntries.map((entry) => Number(entry.daily_export_kwh || 0)), name: "Grid Export", marker: { color: "#2a8ac7" } },
    { type: "bar", x: dates, y: classifiedEntries.map((entry) => Number(entry.estimated_total_home_consumption_kwh || 0)), name: "Estimated Home Usage", marker: { color: "#8c3fa8" } }
  ], {
    ...baseLayout,
    title: { text: "Production, Grid Import/Export and Estimated Usage" },
    barmode: "group",
    xaxis: { tickangle: -45 },
    yaxis: { title: "kWh" },
    legend: {
      orientation: "h",
      yanchor: "bottom",
      y: -0.36,
      xanchor: "left",
      x: 0,
      font: { size: 11 }
    }
  }, plotConfig);

  Plotly.newPlot("irradiance-chart", [
    {
      type: "bar",
      x: dates,
      y: classifiedEntries.map((entry) => Number(entry.production_kwh || 0)),
      name: "Production",
      marker: { color: "#e3a008" },
      customdata: classifiedEntries.map((entry) => entry.weather || "Unknown"),
      hovertemplate: "Date: %{x}<br>Production: %{y:.1f} kWh<br>Weather: %{customdata}<extra></extra>"
    },
    {
      type: "scatter",
      x: dates,
      y: classifiedEntries.map((entry) => Number(entry.irradiance_peak_wm2 || 0)),
      name: "Irradiance",
      mode: "lines+markers",
      line: { color: "#0f4c81", width: 3 },
      marker: { size: 8 },
      yaxis: "y2",
      hovertemplate: "Date: %{x}<br>Irradiance: %{y:.0f} W/m²<extra></extra>"
    }
  ], {
    ...baseLayout,
    title: { text: "Production and Irradiance Trend" },
    yaxis: { title: "Production (kWh)" },
    yaxis2: { title: "Irradiance (W/m²)", overlaying: "y", side: "right", showgrid: false },
    legend: {
      orientation: "h",
      yanchor: "bottom",
      y: 1.02,
      xanchor: "left",
      x: 0,
      font: { size: 11 }
    }
  }, plotConfig);

  const guaranteedDaily = Number(config.production_guarantee_kwh || 0) ? Number(config.production_guarantee_kwh || 0) / 365 : 0;
  const weatherColors = {
    Sunny: "#f2b94b",
    Cloudy: "#7c96ad",
    Overcast: "#58728d",
    Rain: "#3b82f6",
    Snow: "#94a3b8",
    Smoke: "#a16207",
    "Extreme Heat": "#ef4444",
    Wind: "#14b8a6",
    Unknown: "#94a3b8"
  };
  const productionAverage = mean(classifiedEntries.map((entry) => Number(entry.production_kwh || 0)));
  Plotly.newPlot("weather-chart", [
    {
      type: "bar",
      x: dates,
      y: classifiedEntries.map((entry) => Number(entry.production_kwh || 0)),
      name: "Daily Production",
      marker: { color: classifiedEntries.map((entry) => weatherColors[entry.weather] || "#94a3b8") },
      customdata: classifiedEntries.map((entry) => entry.weather || "Unknown"),
      hovertemplate: "Date: %{x}<br>Production: %{y:.1f} kWh<br>Weather: %{customdata}<extra></extra>"
    },
    {
      type: "scatter",
      x: dates,
      y: dates.map(() => productionAverage),
      name: "Overall Average",
      mode: "lines",
      line: { color: "#0f4c81", width: 3, dash: "dot" }
    },
    ...(guaranteedDaily > 0 ? [{
      type: "scatter",
      x: dates,
      y: dates.map(() => guaranteedDaily),
      name: "Guarantee Daily Target",
      mode: "lines",
      line: { color: "#b42318", width: 2, dash: "dash" }
    }] : [])
  ], {
    ...baseLayout,
    title: { text: "Daily Production by Weather" },
    legend: {
      orientation: "h",
      yanchor: "bottom",
      y: 1.02,
      xanchor: "left",
      x: 0,
      font: { size: 11 }
    }
  }, plotConfig);

  const monthSummary = Object.values(classifiedEntries.reduce((accumulator, entry) => {
    const monthKey = entry.entry_date.slice(0, 7);
    const currentDate = entry.currentDate;
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    accumulator[monthKey] = accumulator[monthKey] || {
      month: monthKey,
      total: 0,
      observedDates: new Set(),
      daysInMonth
    };
    accumulator[monthKey].total += Number(entry.production_kwh || 0);
    accumulator[monthKey].observedDates.add(entry.entry_date);
    return accumulator;
  }, {})).map((item) => {
    const observedDays = item.observedDates.size || 1;
    return {
      month: item.month,
      actual: item.total,
      projected: (item.total / observedDays) * item.daysInMonth,
      guarantee: guaranteedDaily * item.daysInMonth
    };
  });
  Plotly.newPlot("monthly-chart", [
    { type: "bar", x: monthSummary.map((item) => item.month), y: monthSummary.map((item) => item.actual), name: "Actual To Date", marker: { color: "#157f3b" } },
    { type: "bar", x: monthSummary.map((item) => item.month), y: monthSummary.map((item) => item.projected), name: "Projected Month End", marker: { color: "#e3a008" } },
    { type: "bar", x: monthSummary.map((item) => item.month), y: monthSummary.map((item) => item.guarantee), name: "Guarantee Pace", marker: { color: "#7c96ad" } }
  ], {
    ...baseLayout,
    title: { text: "Monthly Progress vs Guarantee" },
    barmode: "group",
    legend: {
      orientation: "h",
      yanchor: "bottom",
      y: 1.02,
      xanchor: "left",
      x: 0,
      font: { size: 11 }
    }
  }, plotConfig);
}

async function renderDashboard(entries, config, firebaseStatus) {
  const aiEntries = buildComputedEntries(getDisplayEntries(entries), config);
  dashboardAiState.entries = aiEntries;
  dashboardAiState.config = config;
  dashboardAiState.metrics = calculateDashboardMetricsClient(aiEntries, config);
  if (isStaticSite()) {
    const computedEntries = aiEntries;
    const metrics = dashboardAiState.metrics;
    const alerts = buildAlertsClient(computedEntries, config);
    const target = document.getElementById("dashboard-root");
    if (target) {
      target.innerHTML = renderDashboardHtmlClient(computedEntries, metrics, config, firebaseStatus, alerts);
      setupDashboardViewToggle();
      setupAiAssistant();
      renderDashboardChartsClient(computedEntries, config);
      setupChartPopouts(target);
    }
    return;
  }
  const response = await fetch(dashboardRenderUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      entries: aiEntries,
      config,
      firebase_status: firebaseStatus
    })
  });
  const payload = await response.json();
  const target = document.getElementById("dashboard-root");
  if (target) {
    target.innerHTML = payload.html;
    activateInjectedScripts(target);
    setupDashboardViewToggle();
    dashboardAiState.openaiConfigured = Boolean(payload.ai_status?.openai_configured ?? dashboardAiState.openaiConfigured);
    dashboardAiState.historicalUsage = payload.historical_usage || dashboardAiState.historicalUsage;
    dashboardAiState.monthlyBill = payload.monthly_bill || dashboardAiState.monthlyBill;
    setupAiAssistant();
    setupChartPopouts(target);
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

let activeChartPopout = null;

function resizePlotlyWithin(container, sizingElement = container) {
  if (typeof Plotly === "undefined" || !container) return;
  const plotNodes = container.matches?.(".js-plotly-plot")
    ? [container]
    : [...container.querySelectorAll(".js-plotly-plot")];
  const sizingRect = sizingElement?.getBoundingClientRect?.();

  plotNodes.forEach((plotNode) => {
    try {
      const fallbackBox = plotNode.closest(".dashboard-chart") || plotNode.parentElement;
      const rect = sizingRect?.width > 0 && sizingRect?.height > 0
        ? sizingRect
        : fallbackBox?.getBoundingClientRect?.();
      if (rect && rect.width > 0 && rect.height > 0) {
        Plotly.relayout(plotNode, {
          autosize: false,
          width: Math.floor(rect.width),
          height: Math.floor(rect.height)
        });
      }
      Plotly.Plots.resize(plotNode);
    } catch (error) {
      // Ignore individual resize failures so the overlay can still open.
    }
  });
}

function closeChartPopout() {
  if (!activeChartPopout) return;
  const { overlay, chartNode, placeholder, resizeHandler } = activeChartPopout;
  if (resizeHandler) {
    window.removeEventListener("resize", resizeHandler);
  }
  chartNode.classList.remove("dashboard-chart-popout-active");
  if (placeholder?.parentNode) {
    placeholder.parentNode.insertBefore(chartNode, placeholder);
    placeholder.remove();
  }
  overlay.remove();
  document.body.classList.remove("chart-popout-active");
  requestAnimationFrame(() => {
    resizePlotlyWithin(chartNode);
    setTimeout(() => resizePlotlyWithin(chartNode), 80);
  });
  activeChartPopout = null;
}

function openChartPopout(frame) {
  if (!frame) return;
  if (activeChartPopout) {
    closeChartPopout();
  }

  const chartNode = frame.querySelector("[data-chart-popout-content], .dashboard-chart, .nyseg-file-comparison-chart");
  if (!chartNode) return;

  const label = frame.getAttribute("data-chart-popout-label") || "Chart";
  const placeholder = document.createElement("div");
  placeholder.className = "chart-popout-placeholder";
  chartNode.parentNode.insertBefore(placeholder, chartNode);

  const overlay = document.createElement("div");
  overlay.className = "chart-popout-shell";
  overlay.innerHTML = `
    <div class="chart-popout-backdrop" data-chart-popout-close></div>
    <div class="chart-popout-dialog" role="dialog" aria-modal="true" aria-label="${label}">
      <div class="chart-popout-header">
        <div>
          <p class="eyebrow mb-2">Expanded Chart</p>
          <h2 class="h5 mb-0">${label}</h2>
        </div>
        <button type="button" class="btn btn-contract btn-sm" data-chart-popout-close>Close</button>
      </div>
      <div class="chart-popout-body"></div>
    </div>
  `;

  const popoutBody = overlay.querySelector(".chart-popout-body");
  popoutBody.appendChild(chartNode);
  chartNode.classList.add("dashboard-chart-popout-active");
  overlay.querySelectorAll("[data-chart-popout-close]").forEach((element) => {
    element.addEventListener("click", closeChartPopout);
  });
  document.body.appendChild(overlay);
  document.body.classList.add("chart-popout-active");
  const resizeHandler = () => resizePlotlyWithin(chartNode, popoutBody);
  window.addEventListener("resize", resizeHandler);
  activeChartPopout = { overlay, chartNode, placeholder, resizeHandler };

  requestAnimationFrame(() => {
    requestAnimationFrame(resizeHandler);
  });
  setTimeout(resizeHandler, 100);
  setTimeout(resizeHandler, 350);
}

function setupChartPopouts(root = document) {
  root.querySelectorAll("[data-chart-popout]").forEach((button) => {
    if (button.dataset.chartPopoutBound === "true") return;
    button.dataset.chartPopoutBound = "true";
    button.addEventListener("click", () => {
      openChartPopout(button.closest(".chart-popout-frame"));
    });
  });
}

function setupValidatedLocalDashboardLinks(root = document) {
  root.querySelectorAll("[data-validated-local-dashboard]").forEach((button) => {
    if (button.dataset.validationBound === "true") return;
    button.dataset.validationBound = "true";
    button.addEventListener("click", async () => {
      const originalLabel = button.textContent;
      button.disabled = true;
      button.textContent = "Checking...";

      try {
        const response = await fetch("/api/validate-local-dashboard", {
          cache: "no-store",
          headers: { Accept: "application/json" }
        });
        const result = await response.json();
        if (!response.ok || !result.available) {
          throw new Error(result.message || "The local dashboard did not respond.");
        }

        const targetUrl = result.url || button.dataset.targetUrl;
        const openedWindow = window.open(targetUrl, "_blank", "noopener,noreferrer");
        if (!openedWindow) {
          window.location.assign(targetUrl);
        }
      } catch (error) {
        window.alert(
          `The local dashboard at ${button.dataset.targetUrl} is not available. Start it and try again.`
        );
      } finally {
        button.disabled = false;
        button.textContent = originalLabel;
      }
    });
  });
}

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && activeChartPopout) {
    closeChartPopout();
  }
});

function getEntryByDate(entryDate) {
  return entriesPageState.entries.find((entry) => entry.entry_date === entryDate) || null;
}

function getMostRecentEntryBefore(entries, entryDate) {
  const priorEntries = entries
    .filter((entry) => String(entry.entry_date) < String(entryDate))
    .sort((left, right) => String(left.entry_date).localeCompare(String(right.entry_date)));
  return priorEntries.length ? priorEntries[priorEntries.length - 1] : null;
}

function median(values) {
  const sorted = values
    .map(Number)
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((left, right) => left - right);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function signedMedian(values) {
  const sorted = values
    .map(Number)
    .filter(Number.isFinite)
    .sort((left, right) => left - right);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function normalizeWeatherBucket(weather) {
  const value = String(weather || "Unknown").trim().toLowerCase();
  if (value.includes("sun") || value.includes("clear")) return "Sunny";
  if (
    value.includes("cloud") ||
    value.includes("overcast") ||
    value.includes("smoke") ||
    value.includes("fog")
  ) {
    return "Cloudy";
  }
  if (
    value.includes("rain") ||
    value.includes("storm") ||
    value.includes("snow") ||
    value.includes("sleet")
  ) {
    return "Wet";
  }
  return value && value !== "unknown"
    ? value.charAt(0).toUpperCase() + value.slice(1)
    : "Unknown";
}

function getHistoricalMeterDeltas(entries, entryDate, targetWeather = "Unknown") {
  const priorEntries = entries
    .filter((entry) => String(entry.entry_date) < String(entryDate))
    .sort((left, right) => String(left.entry_date).localeCompare(String(right.entry_date)));
  const importDeltas = [];
  const exportDeltas = [];
  const weatherImportDeltas = [];
  const weatherExportDeltas = [];
  const weatherBucket = normalizeWeatherBucket(targetWeather);

  for (let index = 1; index < priorEntries.length; index += 1) {
    const previous = priorEntries[index - 1];
    const current = priorEntries[index];
    if (current.meter_values_estimated) continue;
    const importDelta = Number(current.meter_01_import_reading || 0) - Number(previous.meter_01_import_reading || 0);
    const exportDelta = Number(current.meter_02_export_reading || 0) - Number(previous.meter_02_export_reading || 0);
    const weatherMatches = (
      weatherBucket !== "Unknown" &&
      normalizeWeatherBucket(current.weather) === weatherBucket
    );
    if (importDelta >= 0 && importDelta <= 150) {
      importDeltas.push(importDelta);
      if (weatherMatches) weatherImportDeltas.push(importDelta);
    }
    if (exportDelta >= 0 && exportDelta <= 200) {
      exportDeltas.push(exportDelta);
      if (weatherMatches) weatherExportDeltas.push(exportDelta);
    }
  }

  const hasWeatherSample = weatherImportDeltas.length >= 2 && weatherExportDeltas.length >= 2;
  const selectedImportDeltas = hasWeatherSample ? weatherImportDeltas : importDeltas;
  const selectedExportDeltas = hasWeatherSample ? weatherExportDeltas : exportDeltas;

  return {
    importDelta: Math.max(1, median(selectedImportDeltas) || 18),
    exportDelta: Math.max(1, median(selectedExportDeltas) || 43),
    weatherBucket,
    basis: hasWeatherSample ? "weather-matched" : "overall-history",
    sampleCount: hasWeatherSample
      ? Math.min(weatherImportDeltas.length, weatherExportDeltas.length)
      : Math.min(importDeltas.length, exportDeltas.length)
  };
}

function getLearnedOvernightImport(entries, entryDate) {
  const sortedEntries = sortEntries(entries).reverse();
  const checkpointSamples = normalizeMeterSimulationCheckpoints(meterSimulationCheckpoints)
    .filter((checkpoint) => (
      checkpoint.entry_date <= String(entryDate) &&
      checkpoint.weather_bucket === "Sunny" &&
      checkpoint.minute_of_day >= 9 * 60 &&
      checkpoint.minute_of_day <= 15 * 60 + 30
    ))
    .map((checkpoint) => {
      const priorEntry = getMostRecentEntryBefore(sortedEntries, checkpoint.entry_date);
      const baseImport = checkpoint.base_m01 ?? Number(priorEntry?.meter_01_import_reading || 0);
      return checkpoint.actual_m01 - baseImport;
    })
    .filter((value) => Number.isFinite(value) && value >= 0 && value <= 50);

  if (checkpointSamples.length) {
    return {
      value: median(checkpointSamples),
      basis: `${checkpointSamples.length} actual sunny daytime checkpoint${checkpointSamples.length === 1 ? "" : "s"}`,
      sampleCount: checkpointSamples.length
    };
  }

  const priorEntries = sortedEntries
    .filter((entry) => String(entry.entry_date) < String(entryDate))
    .sort((left, right) => String(left.entry_date).localeCompare(String(right.entry_date)));
  const sunnyDailySamples = [];
  const allDailySamples = [];
  for (let index = 1; index < priorEntries.length; index += 1) {
    const previous = priorEntries[index - 1];
    const current = priorEntries[index];
    if (current.meter_values_estimated) continue;
    const dailyImport = (
      Number(current.meter_01_import_reading || 0) -
      Number(previous.meter_01_import_reading || 0)
    );
    if (!Number.isFinite(dailyImport) || dailyImport < 0 || dailyImport > 75) continue;
    allDailySamples.push(dailyImport);
    if (normalizeWeatherBucket(current.weather) === "Sunny") {
      sunnyDailySamples.push(dailyImport);
    }
  }
  const selected = sunnyDailySamples.length ? sunnyDailySamples : allDailySamples;
  return {
    value: selected.length ? median(selected) : 0,
    basis: selected.length
      ? `${selected.length} confirmed ${sunnyDailySamples.length ? "sunny " : ""}daily import change${selected.length === 1 ? "" : "s"}`
      : "awaiting actual import history",
    sampleCount: selected.length
  };
}

function getImportWeightForWeather(point, weather) {
  const index = meterSimulationSchedule.findIndex((candidate) => (
    candidate.hour === point.hour && candidate.minute === point.minute
  ));
  const bucket = normalizeWeatherBucket(weather);
  const profile = meterImportProfiles[bucket] || meterImportProfiles.Unknown;
  if (index < 0) return Number(point.importWeight || 0);
  const overnightShare = Number(profile[0] || 0);
  const daylightRange = Math.max(0.01, 1 - overnightShare);
  return Math.min(1, Math.max(0, (Number(profile[index] || 0) - overnightShare) / daylightRange));
}

function getHourlyIrradianceAtMinute(profile, minuteOfDay) {
  const points = (Array.isArray(profile) ? profile : [])
    .filter((point) => Number.isFinite(Number(point.minute_of_day)) && Number.isFinite(Number(point.irradiance_wm2)))
    .sort((left, right) => Number(left.minute_of_day) - Number(right.minute_of_day));
  if (!points.length) return null;
  const targetMinute = Math.min(24 * 60 - 1, Math.max(0, Number(minuteOfDay || 0)));
  if (targetMinute <= Number(points[0].minute_of_day)) return Number(points[0].irradiance_wm2 || 0);
  if (targetMinute >= Number(points[points.length - 1].minute_of_day)) {
    return Number(points[points.length - 1].irradiance_wm2 || 0);
  }
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const next = points[index];
    if (targetMinute > Number(next.minute_of_day)) continue;
    const span = Math.max(1, Number(next.minute_of_day) - Number(previous.minute_of_day));
    const progress = (targetMinute - Number(previous.minute_of_day)) / span;
    return Number(previous.irradiance_wm2) + (
      (Number(next.irradiance_wm2) - Number(previous.irradiance_wm2)) * progress
    );
  }
  return 0;
}

function getHourlyIrradianceMetrics(entry = {}, minuteOfDay = getClockMinutes()) {
  const profile = Array.isArray(entry.irradiance_hourly_profile)
    ? entry.irradiance_hourly_profile
    : [];
  if (profile.length < 20) {
    return {
      available: false,
      currentIrradiance: Number(entry.irradiance_peak_wm2 || 0),
      energyProgress: null,
      dailyEnergyRatio: null,
      lowLightProgress: null,
      basis: "daily peak fallback"
    };
  }

  const { sunriseMinute, sunsetMinute } = getSolarWindow(entry);
  const boundedMinute = Math.min(24 * 60 - 1, Math.max(0, Number(minuteOfDay || 0)));
  let totalActualEnergy = 0;
  let cumulativeActualEnergy = 0;
  let totalClearEnergy = 0;
  let cumulativeLowLightBurden = 0;
  let daylightSamples = 0;

  for (let sampleMinute = sunriseMinute; sampleMinute <= sunsetMinute; sampleMinute += 15) {
    const daylightFraction = Math.min(1, Math.max(
      0,
      (sampleMinute - sunriseMinute) / Math.max(1, sunsetMinute - sunriseMinute)
    ));
    const clearReference = Math.max(0, 900 * Math.sin(Math.PI * daylightFraction));
    const actualIrradiance = Math.max(0, Number(
      getHourlyIrradianceAtMinute(profile, sampleMinute) || 0
    ));
    totalActualEnergy += actualIrradiance;
    totalClearEnergy += clearReference;
    daylightSamples += 1;
    if (sampleMinute <= boundedMinute) {
      cumulativeActualEnergy += actualIrradiance;
      if (clearReference >= 120) {
        const availability = actualIrradiance / clearReference;
        cumulativeLowLightBurden += Math.max(0, (0.35 - availability) / 0.35);
      }
    }
  }

  return {
    available: true,
    currentIrradiance: Math.max(0, Number(getHourlyIrradianceAtMinute(profile, boundedMinute) || 0)),
    energyProgress: totalActualEnergy > 0
      ? Math.min(1, Math.max(0, cumulativeActualEnergy / totalActualEnergy))
      : 0,
    dailyEnergyRatio: totalClearEnergy > 0
      ? Math.min(1.2, Math.max(0, totalActualEnergy / totalClearEnergy))
      : 0,
    lowLightProgress: daylightSamples > 0
      ? Math.min(1, Math.max(0, cumulativeLowLightBurden / daylightSamples))
      : 0,
    basis: "Open-Meteo hourly irradiance curve"
  };
}

function getWeatherMeterFactors(entry = {}, minuteOfDay = getClockMinutes()) {
  const weatherBucket = normalizeWeatherBucket(entry.weather);
  const irradiance = Math.max(0, Number(entry.irradiance_peak_wm2 || 0));
  const cloudCover = Math.min(100, Math.max(0, Number(entry.cloud_cover_pct || 0)));
  const hourlyMetrics = getHourlyIrradianceMetrics(entry, minuteOfDay);
  const irradianceRatio = hourlyMetrics.available
    ? hourlyMetrics.dailyEnergyRatio
    : Math.min(1, irradiance / 900);

  if (weatherBucket === "Wet") {
    return {
      exportFactor: Math.min(0.12, Math.max(0.03, irradianceRatio * 0.35)),
      daylightImportFactor: 0.65,
      basis: "wet-weather suppression"
    };
  }
  if (weatherBucket === "Cloudy") {
    const extremeCloud = irradiance <= 250 || cloudCover >= 85;
    return {
      exportFactor: Math.min(0.45, Math.max(0.05, irradianceRatio * 0.55)),
      daylightImportFactor: extremeCloud ? 0.35 : 0,
      basis: extremeCloud ? "extreme-cloud suppression" : "cloud-adjusted production"
    };
  }
  if (weatherBucket === "Sunny") {
    return {
      exportFactor: Math.min(1, Math.max(0.65, irradianceRatio)),
      daylightImportFactor: 0,
      basis: "sunny-day production"
    };
  }
  return {
    exportFactor: Math.min(0.65, Math.max(0.15, irradianceRatio * 0.7)),
    daylightImportFactor: irradiance <= 200 ? 0.25 : 0,
    basis: "limited-weather fallback"
  };
}

function weightedMedian(samples) {
  const usable = samples
    .filter((sample) => Number.isFinite(sample.value) && Number.isFinite(sample.weight) && sample.weight > 0)
    .sort((left, right) => left.value - right.value);
  if (!usable.length) return 0;
  const totalWeight = sum(usable.map((sample) => sample.weight));
  let cumulativeWeight = 0;
  for (const sample of usable) {
    cumulativeWeight += sample.weight;
    if (cumulativeWeight >= totalWeight / 2) return sample.value;
  }
  return usable[usable.length - 1].value;
}

function getCheckpointSimilarityWeight(checkpoint, entryDate, minuteOfDay, targetEntry = {}) {
  const targetWeather = normalizeWeatherBucket(targetEntry.weather);
  const timeDistance = Math.abs(checkpoint.minute_of_day - minuteOfDay);
  const timeWeight = Math.exp(-timeDistance / 150);
  const weatherWeight = checkpoint.weather_bucket === targetWeather
    ? 1
    : checkpoint.weather_bucket === "Unknown" || targetWeather === "Unknown"
      ? 0.6
      : 0.28;
  const targetHourlyIrradiance = getHourlyIrradianceMetrics(targetEntry, minuteOfDay);
  const targetIrradiance = targetHourlyIrradiance.available
    ? targetHourlyIrradiance.currentIrradiance
    : parseOptionalNumber(targetEntry.irradiance_peak_wm2);
  const irradianceWeight = targetIrradiance !== null && checkpoint.irradiance_peak_wm2 !== null
    ? Math.exp(-Math.abs(checkpoint.irradiance_peak_wm2 - targetIrradiance) / 220)
    : 0.72;
  const targetCloud = parseOptionalNumber(targetEntry.cloud_cover_pct);
  const cloudWeight = targetCloud !== null && checkpoint.cloud_cover_pct !== null
    ? Math.exp(-Math.abs(checkpoint.cloud_cover_pct - targetCloud) / 32)
    : 0.78;
  const ageDays = Math.max(
    0,
    Math.round((new Date(`${entryDate}T00:00:00`) - new Date(`${checkpoint.entry_date}T00:00:00`)) / 86400000)
  );
  const recencyWeight = 1 / (1 + ageDays / 45);
  return timeWeight * weatherWeight * irradianceWeight * cloudWeight * recencyWeight;
}

function getMeterSimulationCorrection(
  entryDate,
  weather,
  minuteOfDay,
  checkpoints = meterSimulationCheckpoints,
  modelContext = null
) {
  const weatherBucket = normalizeWeatherBucket(weather);
  const usable = normalizeMeterSimulationCheckpoints(checkpoints);
  const sameDay = usable
    .filter((checkpoint) => (
      checkpoint.entry_date === String(entryDate) &&
      checkpoint.minute_of_day <= minuteOfDay
    ))
    .sort((left, right) => left.minute_of_day - right.minute_of_day);

  if (sameDay.length) {
    const latest = sameDay[sameDay.length - 1];
    if (modelContext) {
      const checkpointWeatherFactors = getWeatherMeterFactors(modelContext.entry, latest.minute_of_day);
      const checkpointProgress = getMeterProgressForMinute(
        modelContext.entry,
        latest.minute_of_day,
        checkpointWeatherFactors
      );
      const checkpointCycle = checkpointProgress.solarCycle;
      const checkpointRawImport = (
        modelContext.baseImport +
        modelContext.overnightImport * checkpointCycle.preSunriseProgress +
        modelContext.overnightImport * checkpointCycle.postSunsetProgress +
        modelContext.daylightImportDelta *
          checkpointProgress.daylightImportProgress
      );
      const checkpointRawExport = (
        modelContext.baseExport +
        modelContext.exportDelta *
          checkpointWeatherFactors.exportFactor *
          checkpointProgress.exportProgress
      );
      return {
        importOffset: latest.actual_m01 - checkpointRawImport,
        exportOffset: latest.actual_m02 - checkpointRawExport,
        basis: `today checkpoint at ${latest.checkpoint_time}`,
        sampleCount: 1,
        checkpointMinute: latest.minute_of_day
      };
    }
    return {
      importOffset: latest.import_error,
      exportOffset: latest.export_error,
      basis: `today checkpoint at ${latest.checkpoint_time}`,
      sampleCount: 1,
      checkpointMinute: latest.minute_of_day
    };
  }

  const targetEntry = modelContext?.entry || { weather };
  const weightedCandidates = usable
    .filter((checkpoint) => checkpoint.entry_date < String(entryDate))
    .map((checkpoint) => ({
      checkpoint,
      weight: getCheckpointSimilarityWeight(checkpoint, entryDate, minuteOfDay, targetEntry)
    }))
    .filter((candidate) => candidate.weight >= 0.025)
    .sort((left, right) => right.weight - left.weight)
    .slice(0, 12);

  return {
    importOffset: weightedCandidates.length
      ? weightedMedian(weightedCandidates.map(({ checkpoint, weight }) => ({ value: checkpoint.import_error, weight })))
      : 0,
    exportOffset: weightedCandidates.length
      ? weightedMedian(weightedCandidates.map(({ checkpoint, weight }) => ({ value: checkpoint.export_error, weight })))
      : 0,
    basis: weightedCandidates.length
      ? `${weatherBucket} weather + irradiance weighted history`
      : "no calibration checkpoints yet",
    sampleCount: weightedCandidates.length,
    checkpointMinute: null
  };
}

function formatCalibrationError(value) {
  const number = Number(value || 0);
  const sign = number > 0 ? "+" : "";
  const severity = Math.abs(number) <= 2 ? "calibration-error-good" : Math.abs(number) <= 7 ? "calibration-error-medium" : "calibration-error-high";
  return `<span class="${severity}">${sign}${number.toFixed(1)}</span>`;
}

function renderCalibrationHistory() {
  const body = document.getElementById("entry-meter-calibration-history");
  const count = document.getElementById("entry-meter-calibration-count");
  if (!body || !count) return;
  const checkpoints = normalizeMeterSimulationCheckpoints(meterSimulationCheckpoints)
    .sort((left, right) => {
      const dateOrder = String(right.entry_date).localeCompare(String(left.entry_date));
      return dateOrder || right.minute_of_day - left.minute_of_day;
    });
  count.textContent = `${checkpoints.length} record${checkpoints.length === 1 ? "" : "s"}`;
  body.innerHTML = checkpoints.length
    ? checkpoints.map((checkpoint) => `
      <tr>
        <td>${escapeHtml(checkpoint.entry_date)}</td>
        <td>${escapeHtml(checkpoint.checkpoint_time)}</td>
        <td>${escapeHtml(checkpoint.weather_bucket)}</td>
        <td>${checkpoint.irradiance_peak_wm2 === null ? "-" : checkpoint.irradiance_peak_wm2.toFixed(0)}</td>
        <td>${checkpoint.predicted_m01.toFixed(1)}</td>
        <td>${checkpoint.actual_m01.toFixed(1)}</td>
        <td>${formatCalibrationError(checkpoint.actual_m01 - checkpoint.predicted_m01)}</td>
        <td>${checkpoint.predicted_m02.toFixed(1)}</td>
        <td>${checkpoint.actual_m02.toFixed(1)}</td>
        <td>${formatCalibrationError(checkpoint.actual_m02 - checkpoint.predicted_m02)}</td>
      </tr>
    `).join("")
    : '<tr><td colspan="10" class="text-muted text-center py-3">No training checkpoints recorded yet.</td></tr>';
}

function setupCalibrationHistoryPopout() {
  const history = document.querySelector(".meter-calibration-history");
  const button = document.getElementById("entry-meter-calibration-popout");
  if (!history || !button || button.dataset.popoutReady === "true") return;
  button.dataset.popoutReady = "true";
  let restorePlaceholder = null;

  const closePopout = () => {
    history.classList.remove("meter-calibration-history-popout");
    document.body.classList.remove("meter-calibration-popout-open");
    button.textContent = "Pop Out";
    button.setAttribute("aria-expanded", "false");
    if (restorePlaceholder?.parentNode) {
      restorePlaceholder.parentNode.insertBefore(history, restorePlaceholder);
      restorePlaceholder.remove();
      restorePlaceholder = null;
    }
  };

  button.setAttribute("aria-expanded", "false");
  button.addEventListener("click", () => {
    if (history.classList.contains("meter-calibration-history-popout")) {
      closePopout();
      return;
    }
    restorePlaceholder = document.createComment("prediction-history-popout-location");
    history.parentNode.insertBefore(restorePlaceholder, history);
    document.body.appendChild(history);
    history.classList.add("meter-calibration-history-popout");
    document.body.classList.add("meter-calibration-popout-open");
    button.textContent = "Close";
    button.setAttribute("aria-expanded", "true");
    history.querySelector(".meter-calibration-history-window")?.scrollTo({ top: 0, left: 0 });
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && history.classList.contains("meter-calibration-history-popout")) {
      closePopout();
    }
  });
}

function getClockMinutes(now = new Date()) {
  const parts = getEasternClockParts(now);
  return Number(parts.hour) * 60 + Number(parts.minute);
}

function parseSolarEventMinute(value, fallbackMinute) {
  const match = /T(\d{1,2}):(\d{2})/.exec(String(value || ""));
  if (!match) return fallbackMinute;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return Number.isFinite(hour) && Number.isFinite(minute)
    ? hour * 60 + minute
    : fallbackMinute;
}

function getSolarWindow(entry = {}) {
  const sunriseMinute = parseSolarEventMinute(entry.sunrise_time, 6 * 60);
  const sunsetMinute = parseSolarEventMinute(entry.sunset_time, 20 * 60);
  return {
    sunriseMinute,
    sunsetMinute: Math.max(sunriseMinute + 60, sunsetMinute),
    basis: entry.sunrise_time && entry.sunset_time
      ? "Open-Meteo sunrise/sunset"
      : "seasonal fallback solar window"
  };
}

function getSolarCycleProgress(minuteOfDay, entry = {}) {
  const { sunriseMinute, sunsetMinute, basis } = getSolarWindow(entry);
  const boundedMinute = Math.min(24 * 60 - 1, Math.max(0, minuteOfDay));
  const daylightMinutes = Math.max(1, sunsetMinute - sunriseMinute);
  const nightMinutes = Math.max(1, (24 * 60 - sunsetMinute) + sunriseMinute);
  const daylightLinear = Math.min(
    1,
    Math.max(0, (boundedMinute - sunriseMinute) / daylightMinutes)
  );
  const daylightProgress = 0.5 - (0.5 * Math.cos(Math.PI * daylightLinear));
  const preSunriseProgress = boundedMinute < sunriseMinute
    ? boundedMinute / Math.max(1, sunriseMinute)
    : 1;
  const postSunsetProgress = boundedMinute > sunsetMinute
    ? (boundedMinute - sunsetMinute) / nightMinutes
    : 0;
  return {
    sunriseMinute,
    sunsetMinute,
    basis,
    daylightProgress,
    preSunriseProgress,
    postSunsetProgress
  };
}

function getMeterProgressForMinute(entry, minuteOfDay, weatherFactors) {
  const solarCycle = getSolarCycleProgress(minuteOfDay, entry);
  const hourlyIrradiance = getHourlyIrradianceMetrics(entry, minuteOfDay);
  return {
    solarCycle,
    hourlyIrradiance,
    exportProgress: hourlyIrradiance.available
      ? hourlyIrradiance.energyProgress
      : solarCycle.daylightProgress,
    daylightImportProgress: hourlyIrradiance.available
      ? Math.max(
        weatherFactors.daylightImportFactor * solarCycle.daylightProgress,
        hourlyIrradiance.lowLightProgress
      )
      : weatherFactors.daylightImportFactor * solarCycle.daylightProgress
  };
}

function buildMeterSimulation(entryDate, entries, options = {}) {
  const previousEntry = getMostRecentEntryBefore(entries, entryDate);
  const targetEntry = entries.find((entry) => String(entry.entry_date) === String(entryDate));
  const deltas = getHistoricalMeterDeltas(entries, entryDate, targetEntry?.weather);
  const overnightImport = getLearnedOvernightImport(entries, entryDate);
  const expectedTotalImport = Math.max(deltas.importDelta, overnightImport.value);
  const daylightImportDelta = Math.max(0, expectedTotalImport - overnightImport.value);
  const baseImport = Number(previousEntry?.meter_01_import_reading || 0);
  const baseExport = Number(previousEntry?.meter_02_export_reading || 0);
  const currentMinute = Number.isFinite(Number(options.minuteOfDay))
    ? Number(options.minuteOfDay)
    : getClockMinutes();
  const weatherFactors = getWeatherMeterFactors(targetEntry, currentMinute);
  const currentProgress = getMeterProgressForMinute(targetEntry, currentMinute, weatherFactors);
  const solarCycle = currentProgress.solarCycle;
  const isToday = String(entryDate) === String(getTodayIsoDate());
  const currentPreSunriseImport = overnightImport.value * solarCycle.preSunriseProgress;
  const currentPostSunsetImport = overnightImport.value * solarCycle.postSunsetProgress;
  const currentDaylightImport = (
    daylightImportDelta *
    currentProgress.daylightImportProgress
  );
  const rawCurrentImport = Number(
    (
      baseImport +
      (isToday
        ? currentPreSunriseImport + currentPostSunsetImport + currentDaylightImport
        : expectedTotalImport)
    ).toFixed(1)
  );
  const rawCurrentExport = Number(
    (
      baseExport +
      deltas.exportDelta *
        weatherFactors.exportFactor *
        (isToday ? currentProgress.exportProgress : 1)
    ).toFixed(1)
  );
  const correctionModelContext = {
    entry: targetEntry,
    baseImport,
    baseExport,
    overnightImport: overnightImport.value,
    daylightImportDelta,
    daylightImportFactor: weatherFactors.daylightImportFactor,
    exportDelta: deltas.exportDelta,
    exportFactor: weatherFactors.exportFactor
  };
  const correction = getMeterSimulationCorrection(
    entryDate,
    targetEntry?.weather,
    currentMinute,
    meterSimulationCheckpoints,
    correctionModelContext
  );

  return {
    previousEntry,
    baseImport,
    baseExport,
    importDelta: expectedTotalImport,
    overnightImport: overnightImport.value,
    overnightBasis: overnightImport.basis,
    overnightSampleCount: overnightImport.sampleCount,
    daylightImportDelta,
    solarCycle,
    exportDelta: deltas.exportDelta,
    exportFactor: weatherFactors.exportFactor,
    daylightImportFactor: weatherFactors.daylightImportFactor,
    weatherFactorBasis: weatherFactors.basis,
    solarProfileBasis: currentProgress.hourlyIrradiance.basis,
    currentIrradiance: currentProgress.hourlyIrradiance.currentIrradiance,
    irradianceEnergyProgress: currentProgress.exportProgress,
    weatherBucket: deltas.weatherBucket,
    basis: deltas.basis,
    sampleCount: deltas.sampleCount,
    currentMinute,
    rawCurrentImport,
    rawCurrentExport,
    calibration: correction,
    currentImport: Number((rawCurrentImport + correction.importOffset).toFixed(1)),
    currentExport: Number((rawCurrentExport + correction.exportOffset).toFixed(1)),
    rows: meterSimulationSchedule.map((point) => {
      const pointMinute = point.hour * 60 + point.minute;
      const pointWeatherFactors = getWeatherMeterFactors(targetEntry, pointMinute);
      const pointProgress = getMeterProgressForMinute(targetEntry, pointMinute, pointWeatherFactors);
      const pointSolarCycle = pointProgress.solarCycle;
      const pointCorrection = getMeterSimulationCorrection(
        entryDate,
        targetEntry?.weather,
        pointMinute,
        meterSimulationCheckpoints,
        correctionModelContext
      );
      return {
        ...point,
        importWeight: Math.max(pointSolarCycle.postSunsetProgress, pointProgress.daylightImportProgress),
        exportWeight: pointProgress.exportProgress,
        meter01: Number(
          (
            baseImport +
            overnightImport.value * pointSolarCycle.preSunriseProgress +
            overnightImport.value * pointSolarCycle.postSunsetProgress +
            daylightImportDelta *
              pointProgress.daylightImportProgress +
            pointCorrection.importOffset
          ).toFixed(1)
        ),
        meter02: Number(
          (
            baseExport +
            deltas.exportDelta *
              pointWeatherFactors.exportFactor *
              pointProgress.exportProgress +
            pointCorrection.exportOffset
          ).toFixed(1)
        )
      };
    })
  };
}

function weightedQuantile(samples, quantile) {
  const usable = samples.filter((sample) => Number.isFinite(sample.value) && Number.isFinite(sample.weight) && sample.weight > 0).sort((a, b) => a.value - b.value);
  if (!usable.length) return 0;
  const target = sum(usable.map((sample) => sample.weight)) * Math.min(1, Math.max(0, quantile));
  let running = 0;
  for (const sample of usable) { running += sample.weight; if (running >= target) return sample.value; }
  return usable[usable.length - 1].value;
}

function checkpointMoment(checkpoint) { return `${checkpoint.entry_date}T${String(checkpoint.minute_of_day).padStart(4, "0")}`; }

function getV2IntervalHours(checkpoint, checkpoints, entries) {
  const priorSameDay = checkpoints.filter((item) => item.entry_date === checkpoint.entry_date && item.minute_of_day < checkpoint.minute_of_day).sort((a, b) => b.minute_of_day - a.minute_of_day)[0];
  if (priorSameDay) return Math.max(0.25, (checkpoint.minute_of_day - priorSameDay.minute_of_day) / 60);
  const priorEntry = getMostRecentEntryBefore(entries, checkpoint.entry_date);
  if (!priorEntry) return 24;
  const days = Math.max(1, Math.round((new Date(`${checkpoint.entry_date}T00:00:00`) - new Date(`${priorEntry.entry_date}T00:00:00`)) / 86400000));
  return days * 24;
}

function getCalibrationV2Samples(entryDate, minuteOfDay, targetEntry, entries, checkpoints, cutoff = null) {
  const target = { entry_date: String(entryDate), minute_of_day: Number(minuteOfDay) };
  const eligible = normalizeMeterSimulationCheckpoints(checkpoints).filter((checkpoint) => {
    if (checkpoint.entry_date > target.entry_date || (checkpoint.entry_date === target.entry_date && checkpoint.minute_of_day >= target.minute_of_day)) return false;
    return !cutoff || checkpointMoment(checkpoint) < cutoff;
  });
  const targetInterval = getV2IntervalHours(target, eligible, entries);
  return eligible.map((checkpoint) => {
    const hours = getV2IntervalHours(checkpoint, eligible, entries);
    const weight = getCheckpointSimilarityWeight(checkpoint, entryDate, minuteOfDay, targetEntry) * Math.min(1.5, Math.max(0.35, Math.sqrt(targetInterval / hours)));
    return { checkpoint, weight, importRate: (checkpoint.actual_m01 - checkpoint.predicted_m01) / hours, exportRate: (checkpoint.actual_m02 - checkpoint.predicted_m02) / hours };
  }).filter((sample) => sample.weight >= 0.02).sort((a, b) => b.weight - a.weight).slice(0, 18).map((sample) => ({ ...sample, targetInterval }));
}

function buildCalibrationEngineV2(entryDate, entries, options = {}) {
  const minuteOfDay = Number.isFinite(Number(options.minuteOfDay)) ? Number(options.minuteOfDay) : getClockMinutes();
  const targetEntry = entries.find((entry) => String(entry.entry_date) === String(entryDate)) || {};
  const v1 = options.v1 || buildMeterSimulation(entryDate, entries, { minuteOfDay });
  const checkpoints = options.checkpoints || meterSimulationCheckpoints;
  const sameDayAnchor = normalizeMeterSimulationCheckpoints(checkpoints).filter((item) => item.entry_date === String(entryDate) && item.minute_of_day <= minuteOfDay).at(-1);
  const samples = getCalibrationV2Samples(entryDate, minuteOfDay, targetEntry, entries, checkpoints, options.cutoff || null);
  const intervalHours = samples[0]?.targetInterval || 24;
  const importBias = sameDayAnchor ? 0 : weightedMedian(samples.map((sample) => ({ value: sample.importRate * intervalHours, weight: sample.weight })));
  const exportBias = sameDayAnchor ? 0 : weightedMedian(samples.map((sample) => ({ value: sample.exportRate * intervalHours, weight: sample.weight })));
  const importResidual = samples.map((sample) => ({ value: Math.abs(sample.importRate * intervalHours - importBias), weight: sample.weight }));
  const exportResidual = samples.map((sample) => ({ value: Math.abs(sample.exportRate * intervalHours - exportBias), weight: sample.weight }));
  const importRange = Math.max(1.5, weightedQuantile(importResidual, 0.8) * 1.35);
  const exportRange = Math.max(2.5, weightedQuantile(exportResidual, 0.8) * 1.35);
  const currentImport = Number((v1.currentImport + importBias).toFixed(1));
  const currentExport = Number((v1.currentExport + exportBias).toFixed(1));
  const eodV1 = buildMeterSimulation(entryDate, entries, { minuteOfDay: 20 * 60 });
  const eodImport = Number((eodV1.currentImport + importBias).toFixed(1));
  const eodExport = Number((eodV1.currentExport + exportBias).toFixed(1));
  return { version: "V2", mode: "shadow", currentImport, currentExport, eodImport, eodExport, importBias, exportBias, intervalHours, sampleCount: samples.length, sameDayAnchor: Boolean(sameDayAnchor), confidence: { importLow: Number((currentImport - importRange).toFixed(1)), importHigh: Number((currentImport + importRange).toFixed(1)), exportLow: Number((currentExport - exportRange).toFixed(1)), exportHigh: Number((currentExport + exportRange).toFixed(1)) }, eodConfidence: { importLow: Number((eodImport - importRange).toFixed(1)), importHigh: Number((eodImport + importRange).toFixed(1)), exportLow: Number((eodExport - exportRange).toFixed(1)), exportHigh: Number((eodExport + exportRange).toFixed(1)) }, basis: sameDayAnchor ? `today's actual checkpoint + ${samples.length} similar historical checkpoints` : `${samples.length} weather, irradiance, cloud, time and interval-weighted checkpoints` };
}

function backtestCalibrationEngineV2(entries, checkpoints = meterSimulationCheckpoints) {
  const ordered = normalizeMeterSimulationCheckpoints(checkpoints).sort((a, b) => checkpointMoment(a).localeCompare(checkpointMoment(b)));
  const results = [];
  for (const checkpoint of ordered) {
    const prior = ordered.filter((item) => checkpointMoment(item) < checkpointMoment(checkpoint));
    if (prior.length < 8) continue;
    const targetEntry = entries.find((entry) => entry.entry_date === checkpoint.entry_date) || {};
    const samples = getCalibrationV2Samples(checkpoint.entry_date, checkpoint.minute_of_day, targetEntry, entries, prior, checkpointMoment(checkpoint));
    if (samples.length < 4) continue;
    const hours = samples[0].targetInterval;
    const importBias = weightedMedian(samples.map((sample) => ({ value: sample.importRate * hours, weight: sample.weight })));
    const exportBias = weightedMedian(samples.map((sample) => ({ value: sample.exportRate * hours, weight: sample.weight })));
    results.push({ v1Import: Math.abs(checkpoint.actual_m01 - checkpoint.predicted_m01), v1Export: Math.abs(checkpoint.actual_m02 - checkpoint.predicted_m02), v2Import: Math.abs(checkpoint.actual_m01 - (checkpoint.predicted_m01 + importBias)), v2Export: Math.abs(checkpoint.actual_m02 - (checkpoint.predicted_m02 + exportBias)) });
  }
  const average = (key) => results.length ? sum(results.map((row) => row[key])) / results.length : 0;
  const v1Mae = (average("v1Import") + average("v1Export")) / 2;
  const v2Mae = (average("v2Import") + average("v2Export")) / 2;
  return { sampleCount: results.length, v1Mae, v2Mae, improvementPct: v1Mae ? ((v1Mae - v2Mae) / v1Mae) * 100 : 0, improved: results.length >= 8 && v2Mae < v1Mae };
}
function openCalibrationV2Popout({ simulation, calibrationV2, v2Backtest, v2DifferenceImport, v2DifferenceExport, currentTime }) {
  document.querySelector(".calibration-v2-popout-shell")?.remove();
  const backtestAvailable = v2Backtest.sampleCount >= 8;
  const result = !backtestAvailable
    ? "Not enough independent prior checkpoints are available yet to judge V2."
    : v2Backtest.improved
      ? `V2's average absolute error was ${Math.abs(v2Backtest.improvementPct).toFixed(1)}% lower than V1's.`
      : `V2's average absolute error was ${Math.abs(v2Backtest.improvementPct).toFixed(1)}% higher than V1's, so it remains an observer.`;
  const signed = (value) => `${value >= 0 ? "+" : ""}${value.toFixed(1)}`;
  const shell = document.createElement("div");
  shell.className = "calibration-v2-popout-shell";
  shell.innerHTML = `
    <div class="calibration-v2-popout-backdrop" data-calibration-v2-close></div>
    <section class="calibration-v2-popout-dialog" role="dialog" aria-modal="true" aria-labelledby="calibration-v2-popout-title">
      <div class="calibration-v2-heading mb-3">
        <div><p class="eyebrow mb-1">Calibration review</p><h3 id="calibration-v2-popout-title">Calibration Engine V2 · Shadow Mode</h3><p>Current evaluation at ${escapeHtml(currentTime)}. V1 continues to save the working M01/M02 values.</p></div>
        <button type="button" class="btn btn-contract btn-sm" data-calibration-v2-close>Close</button>
      </div>
      <div class="calibration-v2-popout-grid">
        <section class="calibration-v2-popout-section"><h4>Current prediction</h4><table class="calibration-v2-compare"><thead><tr><th>Meter</th><th>V1 active</th><th>V2 observer</th><th>V2 likely range</th><th>V2 − V1</th></tr></thead><tbody><tr><td>M01 import</td><td>${simulation.currentImport.toFixed(1)}</td><td>${calibrationV2.currentImport.toFixed(1)}</td><td>${calibrationV2.confidence.importLow.toFixed(1)}–${calibrationV2.confidence.importHigh.toFixed(1)}</td><td>${signed(v2DifferenceImport)}</td></tr><tr><td>M02 export</td><td>${simulation.currentExport.toFixed(1)}</td><td>${calibrationV2.currentExport.toFixed(1)}</td><td>${calibrationV2.confidence.exportLow.toFixed(1)}–${calibrationV2.confidence.exportHigh.toFixed(1)}</td><td>${signed(v2DifferenceExport)}</td></tr></tbody></table></section>
        <section class="calibration-v2-popout-section"><h4>End-of-day view</h4><p>Using the readings and conditions currently known, V2 expects M01 to finish near <strong>${calibrationV2.eodImport.toFixed(1)}</strong> and M02 near <strong>${calibrationV2.eodExport.toFixed(1)}</strong>. A new actual meter checkpoint updates this forecast immediately.</p></section>
        <section class="calibration-v2-popout-section"><h4>Backtest against recorded history</h4><p><strong>${backtestAvailable ? `${v2Backtest.sampleCount} independent checkpoints tested` : "Backtest pending"}</strong></p><table class="calibration-v2-compare"><thead><tr><th>Estimator</th><th>Mean absolute error</th></tr></thead><tbody><tr><td>V1 active</td><td>${v2Backtest.v1Mae.toFixed(1)} meter units</td></tr><tr><td>V2 shadow</td><td>${v2Backtest.v2Mae.toFixed(1)} meter units</td></tr></tbody></table><p class="mt-2">${result}</p></section>
        <section class="calibration-v2-popout-section"><h4>How V2 learns</h4><ul><li>Uses prior actual-versus-predicted checkpoint errors.</li><li>Gives more weight to days with similar weather, irradiance, cloud cover, time, and recent conditions.</li><li>Scales corrections for the actual interval between readings, rather than assuming 24 hours.</li><li>Uses the spread of comparable errors to show a likely range.</li></ul></section>
      </div>
      <p class="calibration-v2-note"><strong>Decision rule:</strong> V2 will stay in Shadow Mode for the two-week comparison period. It cannot replace V1 until its backtest and live checkpoint results consistently show lower error.</p>
    </section>`;
  const closeOnEscape = (event) => { if (event.key === "Escape") close(); };
  const close = () => { shell.remove(); document.removeEventListener("keydown", closeOnEscape); };
  shell.querySelectorAll("[data-calibration-v2-close]").forEach((button) => button.addEventListener("click", close));
  document.addEventListener("keydown", closeOnEscape);
  document.body.appendChild(shell);
  shell.querySelector("button")?.focus();
}
function renderMeterSimulation(entryDate = entriesPageState.selectedDate, { autoApply = false } = {}) {
  const summary = document.getElementById("entry-meter-sim-summary");
  const body = document.getElementById("entry-meter-sim-body");
  const form = document.getElementById("entry-form");
  renderCalibrationHistory();
  if (!summary || !body || !form || !entryDate) return null;

  const simulation = buildMeterSimulation(entryDate, entriesPageState.entries);
  const calibrationV2 = buildCalibrationEngineV2(entryDate, entriesPageState.entries, { v1: simulation });
  const v2Backtest = backtestCalibrationEngineV2(entriesPageState.entries);
  const v2Panel = document.getElementById("entry-calibration-v2-panel");
  if (v2Panel) {
    const v2DifferenceImport = calibrationV2.currentImport - simulation.currentImport;
    const v2DifferenceExport = calibrationV2.currentExport - simulation.currentExport;
    const backtestAvailable = v2Backtest.sampleCount >= 8;
    const backtestMessage = !backtestAvailable
      ? "V2 is still gathering enough history for a reliable backtest."
      : v2Backtest.improved
        ? `V2 reduced average checkpoint error by ${Math.abs(v2Backtest.improvementPct).toFixed(1)}% in the backtest.`
        : `V2 is currently ${Math.abs(v2Backtest.improvementPct).toFixed(1)}% less accurate than V1 in the backtest, so V1 remains in control.`;
    const v2Status = backtestAvailable && !v2Backtest.improved ? "is-watch" : "";
    const currentTime = formatMeterSimulationRunLabel(getClockMinutes());
    v2Panel.innerHTML = `
      <div class="calibration-v2-heading">
        <div>
          <h3>Calibration Engine V2 <span class="calibration-v2-status ${v2Status}">Shadow mode</span></h3>
          <p>V2 is observing today’s conditions and checkpoints. It does not write meter readings; V1 remains the active estimator while the two are compared.</p>
        </div>
        <button type="button" class="btn btn-contract btn-sm" id="entry-calibration-v2-popout" aria-haspopup="dialog">View details</button>
      </div>
      <div class="calibration-v2-metrics">
        <div class="calibration-v2-metric"><span>V2 M01 now</span><strong>${calibrationV2.currentImport.toFixed(1)}</strong><small>Likely range ${calibrationV2.confidence.importLow.toFixed(1)}–${calibrationV2.confidence.importHigh.toFixed(1)} · V1 ${simulation.currentImport.toFixed(1)}</small></div>
        <div class="calibration-v2-metric"><span>V2 M02 now</span><strong>${calibrationV2.currentExport.toFixed(1)}</strong><small>Likely range ${calibrationV2.confidence.exportLow.toFixed(1)}–${calibrationV2.confidence.exportHigh.toFixed(1)} · V1 ${simulation.currentExport.toFixed(1)}</small></div>
        <div class="calibration-v2-metric"><span>End-of-day forecast</span><strong>M01 ${calibrationV2.eodImport.toFixed(1)}</strong><small>M02 ${calibrationV2.eodExport.toFixed(1)} · recalculates after each actual checkpoint</small></div>
        <div class="calibration-v2-metric"><span>V2 accuracy vs V1</span><strong>${backtestAvailable ? `${v2Backtest.improvementPct >= 0 ? "+" : ""}${v2Backtest.improvementPct.toFixed(1)}%` : "Pending"}</strong><small>${v2Backtest.sampleCount} comparable checkpoints · V1 MAE ${v2Backtest.v1Mae.toFixed(1)}, V2 ${v2Backtest.v2Mae.toFixed(1)}</small></div>
      </div>
      <p class="calibration-v2-note"><strong>What this means:</strong> ${escapeHtml(calibrationV2.basis)} ${escapeHtml(backtestMessage)}</p>`;
    const popoutButton = document.getElementById("entry-calibration-v2-popout");
    popoutButton?.addEventListener("click", () => openCalibrationV2Popout({ simulation, calibrationV2, v2Backtest, v2DifferenceImport, v2DifferenceExport, currentTime }));
  }
  const basisDescription = simulation.basis === "weather-matched"
    ? `${escapeHtml(simulation.weatherBucket)} historical median (${simulation.sampleCount} comparable days)`
    : `overall historical median (${simulation.sampleCount} usable days; limited ${escapeHtml(simulation.weatherBucket)} history)`;
  summary.innerHTML = `
    Prior cumulative readings: <strong>M01 ${simulation.baseImport.toFixed(1)}</strong> and
    <strong>M02 ${simulation.baseExport.toFixed(1)}</strong>.
    Weather-adjusted basis: <strong>${basisDescription}</strong>.
    Daily change: <strong>+${simulation.importDelta.toFixed(1)} import</strong> and
    <strong>+${simulation.exportDelta.toFixed(1)} export</strong>.
    Learned overnight import: <strong>${simulation.overnightImport.toFixed(1)} kWh</strong>
    from <strong>${escapeHtml(simulation.overnightBasis)}</strong>.
    Solar window: <strong>${formatMeterSimulationRunLabel(simulation.solarCycle.sunriseMinute)}</strong>
    to <strong>${formatMeterSimulationRunLabel(simulation.solarCycle.sunsetMinute)}</strong>
    (${escapeHtml(simulation.solarCycle.basis)}).
    M01 accumulates outside that window; M02 accumulates during it.
    Weather behavior: <strong>${escapeHtml(simulation.weatherFactorBasis)}</strong>
    (${Math.round(simulation.exportFactor * 100)}% of the historical export curve).
    Solar activity: <strong>${escapeHtml(simulation.solarProfileBasis)}</strong>
    (${simulation.currentIrradiance.toFixed(0)} W/m² now; ${Math.round(simulation.irradianceEnergyProgress * 100)}% of today's modeled solar energy reached).
    Calibration: <strong>${escapeHtml(simulation.calibration.basis)}</strong>
    (${simulation.calibration.importOffset >= 0 ? "+" : ""}${simulation.calibration.importOffset.toFixed(1)} M01,
    ${simulation.calibration.exportOffset >= 0 ? "+" : ""}${simulation.calibration.exportOffset.toFixed(1)} M02).
    Current simulated values for ${escapeHtml(entryDate)} are
    <strong>M01 ${simulation.currentImport.toFixed(1)}</strong> and
    <strong>M02 ${simulation.currentExport.toFixed(1)}</strong>.
  `;
  body.innerHTML = simulation.rows.map((row) => `
    <tr>
      <td>${row.label}</td>
      <td class="text-end">${Math.round(row.importWeight * 100)}%</td>
      <td class="text-end">${Math.round(row.exportWeight * 100)}%</td>
      <td class="text-end">${row.meter01.toFixed(1)}</td>
      <td class="text-end">${row.meter02.toFixed(1)}</td>
    </tr>
  `).join("");

  if (autoApply) {
    form.elements.namedItem("meter_01_import_reading").value = simulation.currentImport.toFixed(1);
    form.elements.namedItem("meter_02_export_reading").value = simulation.currentExport.toFixed(1);
  }
  return simulation;
}

function formatMeterSimulationTimestamp(timestamp) {
  if (!timestamp) return "Not run yet";
  const parsed = new Date(timestamp);
  if (Number.isNaN(parsed.getTime())) return "Not run yet";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: yorktownHeightsLocation.timezone,
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    timeZoneName: "short"
  }).format(parsed);
}

function updateMeterSimulationTimestamp(entry) {
  const target = document.getElementById("entry-meter-sim-timestamp");
  if (!target) return;
  const timestamp = formatMeterSimulationTimestamp(entry?.meter_simulation_updated_at);
  target.textContent = entry?.meter_simulation_run_label
    ? `${entry.meter_simulation_run_label} · ${timestamp}`
    : timestamp;
  target.title = entry?.meter_simulation_updated_at || "No saved simulation timestamp";
}

function renderMeterSimulationDialog(entryDate) {
  const dialog = document.getElementById("entry-meter-sim-dialog");
  const title = document.getElementById("entry-meter-sim-dialog-title");
  const meta = document.getElementById("entry-meter-sim-dialog-meta");
  const body = document.getElementById("entry-meter-sim-dialog-body");
  const runBody = document.getElementById("entry-meter-sim-run-dialog-body");
  const summary = document.getElementById("entry-meter-sim-dialog-summary");
  if (!dialog || !title || !meta || !body || !runBody || !summary || !entryDate) return null;

  const entry = getEntryByDate(entryDate);
  const simulation = buildMeterSimulation(entryDate, entriesPageState.entries);
  title.textContent = `${entryDate} daily meter estimates`;
  const runLabel = entry?.meter_simulation_run_label
    ? `${entry.meter_simulation_run_label} · `
    : "";
  meta.textContent = `Last saved simulation: ${runLabel}${formatMeterSimulationTimestamp(entry?.meter_simulation_updated_at)} · Weather: ${simulation.weatherBucket}`;
  body.innerHTML = simulation.rows.map((row) => `
    <tr>
      <td><strong>${row.label}</strong></td>
      <td>${Math.round(row.importWeight * 100)}%</td>
      <td>${Math.round(row.exportWeight * 100)}%</td>
      <td>${row.meter01.toFixed(1)}</td>
      <td>${row.meter02.toFixed(1)}</td>
    </tr>
  `).join("");
  const recordedRuns = entry?.meter_simulation_runs || [];
  runBody.innerHTML = recordedRuns.length
    ? recordedRuns.map((run) => `
      <tr>
        <td><strong>${escapeHtml(run.run_label)}</strong></td>
        <td>${
          run.run_type === "checkpoint"
            ? "Checkpoint"
            : run.run_type === "hourly"
              ? "Hourly check"
              : "Earlier 15-minute check"
        }</td>
        <td>${run.meter_01_import_reading.toFixed(1)}</td>
        <td>${run.meter_02_export_reading.toFixed(1)}</td>
        <td>${escapeHtml(run.weather)}</td>
        <td>${run.cloud_cover_pct === null ? "—" : `${run.cloud_cover_pct.toFixed(0)}%`}</td>
        <td>${formatMeterSimulationTimestamp(run.recorded_at)}</td>
      </tr>
    `).join("")
    : `<tr><td colspan="7" class="text-muted">No hourly monitoring checks have been recorded for this date yet.</td></tr>`;
  summary.innerHTML = `
    Historical basis: <strong>${escapeHtml(simulation.basis)}</strong>
    (${simulation.sampleCount} usable day${simulation.sampleCount === 1 ? "" : "s"}).
    Expected daily change: <strong>+${simulation.importDelta.toFixed(1)} M01</strong> and
    <strong>+${simulation.exportDelta.toFixed(1)} M02</strong>.
    Learned overnight import: <strong>${simulation.overnightImport.toFixed(1)} kWh</strong>
    from <strong>${escapeHtml(simulation.overnightBasis)}</strong>.
    Solar window: <strong>${formatMeterSimulationRunLabel(simulation.solarCycle.sunriseMinute)}</strong>
    to <strong>${formatMeterSimulationRunLabel(simulation.solarCycle.sunsetMinute)}</strong>.
    Weather behavior: <strong>${escapeHtml(simulation.weatherFactorBasis)}</strong>
    (${Math.round(simulation.exportFactor * 100)}% of the historical export curve).
    Solar activity: <strong>${escapeHtml(simulation.solarProfileBasis)}</strong>
    (${simulation.currentIrradiance.toFixed(0)} W/m² at the selected time; ${Math.round(simulation.irradianceEnergyProgress * 100)}% of the modeled daily solar energy reached).
    Calibration: <strong>${escapeHtml(simulation.calibration.basis)}</strong>
    (${simulation.calibration.importOffset >= 0 ? "+" : ""}${simulation.calibration.importOffset.toFixed(1)} M01,
    ${simulation.calibration.exportOffset >= 0 ? "+" : ""}${simulation.calibration.exportOffset.toFixed(1)} M02).
    <strong>${recordedRuns.length}</strong> monitoring check${recordedRuns.length === 1 ? "" : "s"} recorded.
  `;
  return simulation;
}

function parseCheckpointTime(value) {
  const match = /^(\d{1,2}):(\d{2})$/.exec(String(value || ""));
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return hour * 60 + minute;
}

function formatCheckpointTime(minuteOfDay) {
  const hour = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

function shouldAutoSimulateMeters(entry) {
  if (!entry || String(entry.entry_date) !== String(getTodayIsoDate())) return false;
  // Today's row is always model-managed. A manual reading or calibration is
  // an anchor for the next prediction, not a reason to stop hourly updates.
  return true;
}

async function persistMeterSimulation(db, entryDate, simulation, entries, { force = false } = {}) {
  const existingEntry = entries.find((entry) => String(entry.entry_date) === String(entryDate));
  if (!existingEntry || (existingEntry.meter_values_confirmed && !force)) {
    return existingEntry || null;
  }

  const timestamp = new Date().toISOString();
  const simulatedImport = Math.max(
    Number(existingEntry.meter_01_import_reading || 0),
    Number(simulation.currentImport || 0)
  );
  const simulatedExport = Math.max(
    Number(existingEntry.meter_02_export_reading || 0),
    Number(simulation.currentExport || 0)
  );
  const existingRuns = Array.isArray(existingEntry.meter_simulation_runs)
    ? existingEntry.meter_simulation_runs
    : [];
  const calibrationV2 = buildCalibrationEngineV2(entryDate, entries, { minuteOfDay: simulation.currentMinute, v1: simulation });
  const monitoringRun = simulation.runKey
    ? {
      run_key: simulation.runKey,
      run_label: simulation.runLabel,
      run_type: simulation.runType,
      minute_of_day: simulation.currentMinute,
      meter_01_import_reading: simulatedImport,
      meter_02_export_reading: simulatedExport,
      previous_meter_01_import_reading: Number(existingEntry.meter_01_import_reading || 0),
      previous_meter_02_export_reading: Number(existingEntry.meter_02_export_reading || 0),
      weather: existingEntry.weather || simulation.weatherBucket || "Unknown",
      irradiance_peak_wm2: Number(existingEntry.irradiance_peak_wm2 || 0),
      cloud_cover_pct: parseOptionalNumber(existingEntry.cloud_cover_pct),
      humidity_pct: parseOptionalNumber(existingEntry.humidity_pct),
      wind_mph: parseOptionalNumber(existingEntry.wind_mph),
      model_basis: simulation.basis,
      calibration_basis: simulation.calibration?.basis || "",
      calibration_v2: calibrationV2,
      calibration_v2_mode: "shadow",
      overnight_import_kwh: simulation.overnightImport,
      overnight_basis: simulation.overnightBasis,
      sunrise_time: existingEntry.sunrise_time || "",
      sunset_time: existingEntry.sunset_time || "",
      solar_window_basis: simulation.solarCycle?.basis || "",
      recorded_at: timestamp
    }
    : null;
  const recordedRuns = monitoringRun
    ? [
      ...existingRuns.filter((run) => run.run_key !== monitoringRun.run_key),
      monitoringRun
    ].sort((left, right) => Number(left.minute_of_day || 0) - Number(right.minute_of_day || 0))
    : existingRuns;
  const simulatedEntry = normalizeEntry({
    ...existingEntry,
    meter_01_import_reading: simulatedImport,
    meter_02_export_reading: simulatedExport,
    meter_values_estimated: true,
    meter_values_confirmed: false,
    meter_simulation_weather: simulation.weatherBucket,
    meter_simulation_basis: simulation.basis,
    meter_simulation_updated_at: timestamp,
    meter_simulation_schedule_key: simulation.scheduleKey || existingEntry.meter_simulation_schedule_key || "",
    meter_simulation_schedule_label: simulation.scheduleLabel || existingEntry.meter_simulation_schedule_label || "",
    meter_simulation_run_key: simulation.runKey || existingEntry.meter_simulation_run_key || "",
    meter_simulation_run_label: simulation.runLabel || existingEntry.meter_simulation_run_label || "",
    meter_simulation_run_type: simulation.runType || existingEntry.meter_simulation_run_type || "",
    meter_simulation_model_signature: simulation.modelSignature || existingEntry.meter_simulation_model_signature || "",
    meter_simulation_runs: recordedRuns,
    updated_at: timestamp
  });

  await setDoc(doc(db, entryCollectionName, entryDate), simulatedEntry, { merge: true });
  const priorV2 = entriesPageState.config?.calibration_engine_v2 || {};
  await setDoc(doc(db, configCollectionName, configDocumentId), {
    calibration_engine_v2: { version: "2", mode: "shadow", started_at: priorV2.started_at || timestamp, review_after: priorV2.review_after || new Date(Date.now() + 14 * 86400000).toISOString(), last_run_at: timestamp, backtest: backtestCalibrationEngineV2(entries, meterSimulationCheckpoints) }
  }, { merge: true });
  return simulatedEntry;
}

function formatMeterSimulationRunLabel(minuteOfDay) {
  const hour24 = Math.floor(minuteOfDay / 60);
  const minute = minuteOfDay % 60;
  const suffix = hour24 >= 12 ? "PM" : "AM";
  const hour12 = hour24 % 12 || 12;
  return `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

function getLatestDueMeterSimulationRun(minuteOfDay = getClockMinutes()) {
  if (minuteOfDay < meterSimulationMonitorStartMinute) return null;
  const boundedMinute = Math.min(minuteOfDay, meterSimulationMonitorEndMinute);
  const runMinute = meterSimulationMonitorStartMinute + (
    Math.floor(
      (boundedMinute - meterSimulationMonitorStartMinute) /
      meterSimulationMonitorIntervalMinutes
    ) * meterSimulationMonitorIntervalMinutes
  );
  const checkpoint = meterSimulationSchedule.find(
    (point) => (point.hour * 60 + point.minute) === runMinute
  );
  return {
    minuteOfDay: runMinute,
    label: checkpoint?.label || formatMeterSimulationRunLabel(runMinute),
    type: checkpoint ? "checkpoint" : "hourly",
    checkpoint
  };
}

async function syncTodaySimulatedMeters(db) {
  const today = getTodayIsoDate();
  // Persist the same live-time calculation shown in Calibration Checkpoint,
  // rather than a stale top-of-hour estimate.
  const runMinuteOfDay = getClockMinutes();
  const checkpoint = meterSimulationSchedule.find((point) => point.hour * 60 + point.minute === runMinuteOfDay);
  const dueRun = {
    minuteOfDay: runMinuteOfDay,
    label: checkpoint?.label || formatMeterSimulationRunLabel(runMinuteOfDay),
    type: checkpoint ? "checkpoint" : "five-minute",
    checkpoint
  };
  const runHour = Math.floor(runMinuteOfDay / 60);
  const runMinute = runMinuteOfDay % 60;
  const runKey = `${today}T${String(runHour).padStart(2, "0")}:${String(runMinute).padStart(2, "0")}`;
  if (meterSimulationLastAttemptedRunKey === runKey) return null;

  let state = await loadFirestoreState(db);
  let todayEntry = state.entries.find((entry) => String(entry.entry_date) === String(today));
  if (!todayEntry) {
    const creation = await ensureDailyPlaceholderRecord(db, state.entries, {
      forceCreate: true,
      entryDate: today,
      sourceLabel: "hourly meter monitoring"
    });
    if (!creation.entry) return null;
    state = await loadFirestoreState(db);
    todayEntry = state.entries.find((entry) => String(entry.entry_date) === String(today));
  }
  if (!todayEntry) return null;

  const latestTodayCheckpoint = normalizeMeterSimulationCheckpoints(meterSimulationCheckpoints)
    .filter((checkpoint) => checkpoint.entry_date === String(today))
    .sort((left, right) => left.minute_of_day - right.minute_of_day)
    .at(-1);
  if (latestTodayCheckpoint?.minute_of_day > dueRun.minuteOfDay) {
    // Do not replay an older hourly estimate over a newer observed reading.
    // The next hourly run will continue forward from this calibration anchor.
    meterSimulationLastAttemptedRunKey = runKey;
    return { entry: todayEntry, simulation: null, updated: false };
  }

  try {
    // Refresh the hourly solar curve before every due meter run so changing
    // cloud conditions affect the same hour's M01/M02 estimate.
    const refreshedEntry = await refreshEntryLookupFields(db, today);
    todayEntry = refreshedEntry;
    state = {
      ...state,
      entries: state.entries.map((entry) => (
        String(entry.entry_date) === String(today) ? refreshedEntry : entry
      ))
    };
  } catch (error) {
    console.warn("Hourly Open-Meteo refresh was unavailable; using the last saved solar curve.", error);
  }
  if (!shouldAutoSimulateMeters(todayEntry)) {
    meterSimulationLastAttemptedRunKey = runKey;
    return null;
  }
  const simulation = {
    ...buildMeterSimulation(today, state.entries, { minuteOfDay: dueRun.minuteOfDay }),
    runKey,
    runLabel: `${dueRun.label} ${dueRun.type === "checkpoint" ? "checkpoint" : "meter check"}`,
    runType: dueRun.type,
    scheduleKey: dueRun.checkpoint ? runKey : "",
    scheduleLabel: dueRun.checkpoint?.label || ""
  };
  simulation.modelSignature = [
    simulation.weatherBucket,
    simulation.basis,
    simulation.importDelta.toFixed(2),
    simulation.exportDelta.toFixed(2),
    simulation.overnightImport.toFixed(2),
    simulation.overnightBasis,
    simulation.solarCycle?.sunriseMinute ?? "",
    simulation.solarCycle?.sunsetMinute ?? "",
    simulation.solarCycle?.basis || "",
    simulation.currentIrradiance.toFixed(1),
    simulation.irradianceEnergyProgress.toFixed(4),
    simulation.solarProfileBasis,
    simulation.calibration?.basis || "",
    simulation.calibration?.importOffset?.toFixed(2) || "0.00",
    simulation.calibration?.exportOffset?.toFixed(2) || "0.00"
  ].join("|");
  if (
    todayEntry.meter_simulation_run_key === runKey &&
    todayEntry.meter_simulation_model_signature === simulation.modelSignature
  ) {
    meterSimulationLastAttemptedRunKey = runKey;
    return { entry: todayEntry, simulation, updated: false };
  }

  const entry = await persistMeterSimulation(db, today, simulation, state.entries, { force: true });
  meterSimulationLastAttemptedRunKey = runKey;
  return { entry, simulation, updated: true };
}

function publishMeterSimulationResult(result) {
  if (!result?.entry) return;
  updateMeterSimulationTimestamp(result.entry);
  window.dispatchEvent(new CustomEvent("solar-meter-simulation-saved", {
    detail: {
      entry: result.entry,
      simulation: result.simulation,
      updated: Boolean(result.updated)
    }
  }));
}

function startMeterSimulationScheduler(db) {
  if (meterSimulationSyncTimer) return;
  meterSimulationSyncTimer = window.setInterval(async () => {
    try {
      const result = await syncTodaySimulatedMeters(db);
      publishMeterSimulationResult(result);
    } catch (error) {
      console.warn("Automatic meter simulation sync failed.", error);
    }
  }, 60_000);
}

function getIntradayProgressShares(
  entryDate = getTodayIsoDate(),
  minuteOfDay = getClockMinutes(),
  weather = "Unknown"
) {
  if (String(entryDate) !== String(getTodayIsoDate())) {
    return { importShare: 1, exportShare: 1, productionShare: 1 };
  }

  const minutesNow = minuteOfDay;
  const firstPoint = meterSimulationSchedule[0];
  const firstMinutes = firstPoint.hour * 60 + firstPoint.minute;
  const firstImportWeight = getImportWeightForWeather(firstPoint, weather);

  if (minutesNow <= firstMinutes) {
    return {
      importShare: firstImportWeight,
      exportShare: firstPoint.exportWeight,
      productionShare: firstPoint.exportWeight
    };
  }

  for (let index = 1; index < meterSimulationSchedule.length; index += 1) {
    const previous = meterSimulationSchedule[index - 1];
    const next = meterSimulationSchedule[index];
    const previousMinutes = previous.hour * 60 + previous.minute;
    const nextMinutes = next.hour * 60 + next.minute;

    if (minutesNow <= nextMinutes) {
      const span = nextMinutes - previousMinutes || 1;
      const progress = Math.min(1, Math.max(0, (minutesNow - previousMinutes) / span));
      const previousImportWeight = getImportWeightForWeather(previous, weather);
      const nextImportWeight = getImportWeightForWeather(next, weather);
      const importShare = previousImportWeight + ((nextImportWeight - previousImportWeight) * progress);
      const exportShare = previous.exportWeight + ((next.exportWeight - previous.exportWeight) * progress);
      return {
        importShare,
        exportShare,
        productionShare: exportShare
      };
    }
  }

  return { importShare: 1, exportShare: 1, productionShare: 1 };
}

function buildIntradayEstimatedEntry(entryDate, entries, estimatedValues, sourceLabel = "Auto-created") {
  const previousEntry = getMostRecentEntryBefore(entries, entryDate);
  const projectedProduction = Number(estimatedValues.production_kwh || 0);
  const projectedIrradiance = Number(estimatedValues.irradiance_peak_wm2 || 0);
  const progress = getIntradayProgressShares(entryDate, getClockMinutes(), estimatedValues.weather);
  const importDelta = Math.max(6, Math.round(Math.max(0, 54 - projectedProduction * 0.35)));
  const exportDelta = Math.max(8, Math.round(projectedProduction * 0.72));
  const baseImport = previousEntry ? Number(previousEntry.meter_01_import_reading || 0) : 0;
  const baseExport = previousEntry ? Number(previousEntry.meter_02_export_reading || 0) : 0;
  const isToday = String(entryDate) === String(getTodayIsoDate());
  const progressMultiplier = isToday ? progress.productionShare : 1;

  return {
    entry_date: entryDate,
    // This field is a daily peak, so never scale it by time-of-day progress.
    irradiance_peak_wm2: Math.round(projectedIrradiance),
    irradiance_hourly_profile: estimatedValues.irradiance_hourly_profile || [],
    irradiance_method: estimatedValues.irradiance_hourly_profile?.length
      ? "open-meteo-hourly-instant-ghi-v3"
      : "",
    irradiance_verified_at: estimatedValues.irradiance_hourly_profile?.length
      ? new Date().toISOString()
      : "",
    production_kwh: Number((projectedProduction * progressMultiplier).toFixed(1)),
    meter_01_import_reading: Number((baseImport + (importDelta * (isToday ? progress.importShare : 1))).toFixed(1)),
    meter_02_export_reading: Number((baseExport + (exportDelta * (isToday ? progress.exportShare : 1))).toFixed(1)),
    weather: estimatedValues.weather || previousEntry?.weather || "Unknown",
    temperature_f: estimatedValues.temperature_f ?? null,
    temperature_high_f: estimatedValues.temperature_high_f ?? estimatedValues.temperature_f ?? null,
    temperature_low_f: estimatedValues.temperature_low_f ?? estimatedValues.temperature_f ?? null,
    humidity_pct: estimatedValues.humidity_pct ?? null,
    cloud_cover_pct: estimatedValues.cloud_cover_pct ?? null,
    wind_mph: estimatedValues.wind_mph ?? null,
    estimated: true,
    lookup_source: estimatedValues.lookup_source || "fallback",
    notes: estimatedValues.notes || `${sourceLabel} placeholder for ${entryDate}. Update with the actual production, meter, and weather values.`,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString()
  };
}

async function buildAutoEntry(entries, entryDate, sourceLabel = "Auto-created") {
  const estimatedValues = await buildEstimatedLookupValues(entryDate, entries);
  const sunrunRecord = getSunrunProductionRecord(entryDate);
  if (sunrunRecord?.available) {
    estimatedValues.production_kwh = Number(sunrunRecord.production_kwh || estimatedValues.production_kwh || 0);
  }
  return buildIntradayEstimatedEntry(entryDate, entries, estimatedValues, sourceLabel);
}

async function ensureDailyPlaceholderRecord(db, entries, options = {}) {
  const {
    forceCreate = false,
    entryDate = getTodayIsoDate(),
    sourceLabel = "Auto-created"
  } = options;
  const effectiveForceCreate = forceCreate || shouldRunOneTimeManualAutoCreate(entryDate);

  const existingEntry = entries.find((entry) => entry.entry_date === entryDate);
  if (existingEntry) {
    // A confirmed meter reading is the source of truth. Do not let the
    // intraday placeholder refresh replace its cumulative M01/M02 values.
    if (existingEntry.meter_values_confirmed) {
      return { entry: existingEntry, created: false, hydrated: false };
    }
    if (existingEntry.estimated && String(entryDate) === String(getTodayIsoDate())) {
      const refreshedEntry = await buildAutoEntry(entries, entryDate, sourceLabel);
      const mergedEntry = normalizeEntry({
        ...existingEntry,
        ...refreshedEntry,
        updated_at: new Date().toISOString()
      });
      await setDoc(doc(db, entryCollectionName, entryDate), mergedEntry, { merge: true });
      if (shouldRunOneTimeManualAutoCreate(entryDate)) {
        markOneTimeManualAutoCreateComplete();
      }
      return { entry: mergedEntry, created: false, hydrated: true };
    }
    if (isPlaceholderLikeEntry(existingEntry)) {
      const hydratedEntry = {
        ...existingEntry,
        ...(await buildAutoEntry(entries, entryDate, sourceLabel)),
        updated_at: new Date().toISOString()
      };
      await setDoc(doc(db, entryCollectionName, entryDate), hydratedEntry, { merge: true });
      if (shouldRunOneTimeManualAutoCreate(entryDate)) {
        markOneTimeManualAutoCreateComplete();
      }
      return { entry: normalizeEntry(hydratedEntry), created: false, hydrated: true };
    }
    if (shouldRunOneTimeManualAutoCreate(entryDate)) {
      markOneTimeManualAutoCreateComplete();
    }
    return { entry: existingEntry, created: false };
  }

  if (!effectiveForceCreate && !isAtOrAfterAutoCreateTime()) {
    return { entry: null, created: false };
  }

  const placeholderEntry = await buildAutoEntry(entries, entryDate, sourceLabel);
  await setDoc(doc(db, entryCollectionName, entryDate), placeholderEntry, { merge: true });
  if (shouldRunOneTimeManualAutoCreate(entryDate)) {
    markOneTimeManualAutoCreateComplete();
  }
  return { entry: placeholderEntry, created: true };
}

async function backfillRecentHistoricalEntriesIfMissing(db, entries) {
  const existingDates = new Set(entries.map((entry) => entry.entry_date));
  const missingEntries = recentHistoricalBackfillEntries
    .map((entry) => normalizeEntry(entry))
    .filter((entry) => !existingDates.has(entry.entry_date));

  if (!missingEntries.length) {
    return { entries, backfilled: false };
  }

  for (const entry of missingEntries) {
    await setDoc(doc(db, entryCollectionName, entry.entry_date), {
      ...entry,
      created_at: entry.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    }, { merge: true });
  }

  const refreshedState = await loadFirestoreState(db);
  return { entries: refreshedState.entries, backfilled: true };
}

function setEntryFormMode(modeText, saveLabel = "Save Entry") {
  const modeTarget = document.getElementById("entry-form-mode");
  const saveButton = document.getElementById("entry-save-button");
  if (modeTarget) modeTarget.textContent = modeText;
  if (saveButton) saveButton.textContent = saveLabel;
}

function setEstimatedBadgeVisible(isVisible) {
  const badge = document.getElementById("entry-estimated-badge");
  if (!badge) return;
  badge.classList.toggle("d-none", !isVisible);
}

function formatLookupSourceLabel(sourceValue, estimated = false) {
  const source = String(sourceValue || "").trim().toLowerCase();
  if (source === "open-meteo-historical") return "Source: Open-Meteo historical";
  if (source === "open-meteo-forecast") return "Source: Open-Meteo forecast";
  if (source === "override") return "Source: App override";
  if (source === "fallback-default") return "Source: Default fallback";
  if (source === "fallback-prior-entry") return "Source: Prior-entry fallback";
  if (source === "fallback") return "Source: Fallback estimate";
  if (estimated) return "Source: Estimated";
  return "Source: Manual";
}

function setEntrySourceBadge(entry = null) {
  const badge = document.getElementById("entry-source-badge");
  if (!badge) return;
  badge.textContent = formatLookupSourceLabel(entry?.lookup_source, Boolean(entry?.estimated));
  badge.dataset.sourceKind = String(entry?.lookup_source || (entry?.estimated ? "estimated" : "manual"));
  badge.classList.remove("d-none");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderNotesCell(noteText) {
  const safeNote = escapeHtml(noteText || "");
  if (!safeNote) {
    return '<span class="text-muted">No notes</span>';
  }
  return `<span class="entry-note-preview" title="${safeNote}">${safeNote}</span>`;
}

function formatTemperatureRange(entry) {
  const high = parseOptionalNumber(entry?.temperature_high_f);
  const low = parseOptionalNumber(entry?.temperature_low_f);
  const single = parseOptionalNumber(entry?.temperature_f);
  if (high !== null && low !== null) {
    return `${formatNumber(high, 0, 0)}° / ${formatNumber(low, 0, 0)}°F`;
  }
  if (single !== null) {
    return `${formatNumber(single, 0, 0)}°F`;
  }
  return "";
}

function formatTemperatureCellValue(value) {
  const parsed = parseOptionalNumber(value);
  return parsed === null ? '<span class="text-muted">-</span>' : `${formatNumber(parsed, 0, 0)}°F`;
}

function renderWeatherCell(entry) {
  return escapeHtml(entry?.weather || "Unknown");
}

function fillEntryForm(entry = null) {
  const form = document.getElementById("entry-form");
  if (!form) return;

  const payload = entry || {
    entry_date: getTodayIsoDate(),
    irradiance_peak_wm2: "",
    production_kwh: "",
    meter_01_import_reading: "",
    meter_02_export_reading: "",
    weather: "Unknown",
    temperature_f: "",
    temperature_high_f: "",
    temperature_low_f: "",
    humidity_pct: "",
    cloud_cover_pct: "",
    wind_mph: "",
    notes: "",
    lookup_source: "manual"
  };
  // Historical Entries is the source of truth for editing; load the selected row exactly as displayed.
  const hydratedPayload = payload;

  Object.entries(hydratedPayload).forEach(([key, value]) => {
    const field = form.elements.namedItem(key);
    if (field) {
      const isPendingMeter = (key === "meter_01_import_reading" || key === "meter_02_export_reading") &&
        !hasValidatedNysegMeters(hydratedPayload.entry_date);
      field.value = isPendingMeter ? "" : formatFormFieldValue(key, value);
    }
  });

  if (hydratedPayload?.entry_date) {
    entriesPageState.selectedDate = hydratedPayload.entry_date;
    setEntryFormMode(`Editing record for ${hydratedPayload.entry_date}.`, "Update Entry");
    setEstimatedBadgeVisible(Boolean(hydratedPayload.estimated));
    setEntrySourceBadge(hydratedPayload);
  } else {
    entriesPageState.selectedDate = "";
    setEntryFormMode("Create or update a daily solar record.", "Save Entry");
    setEstimatedBadgeVisible(false);
    setEntrySourceBadge({ lookup_source: "manual", estimated: false });
  }
}

function selectHistoricalEntry(entryDate, { scrollForm = true } = {}) {
  const entry = getEntryByDate(entryDate);
  if (!entry) return;
  fillEntryForm(entry);
  populateEntriesTable(entriesPageState.entries);
  if (scrollForm) {
    const historyCard = document.getElementById("entries-history-card");
    if (historyCard?.classList.contains("entries-history-popout")) {
      historyCard.classList.remove("entries-history-popout");
      document.body.classList.remove("entries-history-popout-open");
      const popoutButton = document.getElementById("entries-history-popout");
      if (popoutButton) popoutButton.textContent = "Pop Out";
    }
    document.getElementById("entry-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function entryMatchesHistoryFilters(entry) {
  const entryDate = String(entry.entry_date || "");
  const weather = String(entry.weather || "Unknown");
  return (
    (entriesPageState.monthFilter === "All" || entryDate.startsWith(`${entriesPageState.monthFilter}-`)) &&
    (entriesPageState.weatherFilter === "All" || weather === entriesPageState.weatherFilter)
  );
}

function moveHistoricalSelection(direction) {
  const entries = getDisplayEntries(entriesPageState.entries)
    .filter((entry) => entryMatchesHistoryFilters(entry))
    .slice()
    .sort((left, right) => String(right.entry_date).localeCompare(String(left.entry_date)));
  if (!entries.length) return;
  const currentIndex = entries.findIndex((entry) => entry.entry_date === entriesPageState.selectedDate);
  const nextIndex = currentIndex < 0
    ? 0
    : Math.min(entries.length - 1, Math.max(0, currentIndex + direction));
  selectHistoricalEntry(entries[nextIndex].entry_date, { scrollForm: false });
  document.querySelector(`[data-entry-date="${entries[nextIndex].entry_date}"]`)?.scrollIntoView({
    behavior: "smooth",
    block: "nearest"
  });
}

function setupHistoricalEntriesWindow() {
  const card = document.getElementById("entries-history-card");
  const popoutButton = document.getElementById("entries-history-popout");
  if (!card || !popoutButton || popoutButton.dataset.bound === "true") return;
  popoutButton.dataset.bound = "true";
  popoutButton.addEventListener("click", () => {
    const expanded = card.classList.toggle("entries-history-popout");
    document.body.classList.toggle("entries-history-popout-open", expanded);
    popoutButton.textContent = expanded ? "Close Pop Out" : "Pop Out";
    if (expanded) document.getElementById("entries-history-window")?.focus();
  });
  document.getElementById("entries-previous-record")?.addEventListener("click", () => moveHistoricalSelection(1));
  document.getElementById("entries-next-record")?.addEventListener("click", () => moveHistoricalSelection(-1));
  document.getElementById("entries-month-filter")?.addEventListener("change", (event) => {
    entriesPageState.monthFilter = String(event.target.value || "All");
    populateEntriesTable(entriesPageState.entries);
    document.getElementById("entries-history-window")?.scrollTo({ top: 0, behavior: "smooth" });
  });
  document.getElementById("entries-weather-filter")?.addEventListener("change", (event) => {
    entriesPageState.weatherFilter = String(event.target.value || "All");
    populateEntriesTable(entriesPageState.entries);
    document.getElementById("entries-history-window")?.scrollTo({ top: 0, behavior: "smooth" });
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && card.classList.contains("entries-history-popout")) {
      card.classList.remove("entries-history-popout");
      document.body.classList.remove("entries-history-popout-open");
      popoutButton.textContent = "Pop Out";
    }
  });
}

function populateEntriesTable(entries) {
  const body = document.getElementById("entries-table-body");
  if (!body) return;
  entriesPageState.entries = [...entries];
  const chronologicalEntries = getDisplayEntries(entries);
  updateEntriesNetMeterSummary(chronologicalEntries, entriesPageState.config);
  updateEntriesMonthlyCostSummary(chronologicalEntries, entriesPageState.config);
  const monthFilter = document.getElementById("entries-month-filter");
  if (monthFilter) {
    const monthOptions = [...new Set(
      chronologicalEntries
        .map((entry) => String(entry.entry_date || "").slice(0, 7))
        .filter((month) => /^\d{4}-\d{2}$/.test(month))
    )].sort((left, right) => right.localeCompare(left));
    if (
      entriesPageState.monthFilter !== "All" &&
      !monthOptions.includes(entriesPageState.monthFilter)
    ) {
      entriesPageState.monthFilter = "All";
    }
    monthFilter.replaceChildren(new Option("All months", "All"));
    monthOptions.forEach((month) => {
      const label = new Date(`${month}-01T00:00:00`).toLocaleDateString("en-US", {
        month: "long",
        year: "numeric"
      });
      monthFilter.add(new Option(label, month));
    });
    monthFilter.value = entriesPageState.monthFilter;
  }
  const weatherFilter = document.getElementById("entries-weather-filter");
  if (weatherFilter) {
    const weatherOptions = [...new Set(
      chronologicalEntries.map((entry) => String(entry.weather || "Unknown"))
    )].sort((left, right) => left.localeCompare(right));
    if (
      entriesPageState.weatherFilter !== "All" &&
      !weatherOptions.includes(entriesPageState.weatherFilter)
    ) {
      entriesPageState.weatherFilter = "All";
    }
    weatherFilter.replaceChildren(new Option("All weather", "All"));
    weatherOptions.forEach((weather) => weatherFilter.add(new Option(weather, weather)));
    weatherFilter.value = entriesPageState.weatherFilter;
  }
  const meterDifferences = new Map();
  chronologicalEntries.forEach((entry, index) => {
    const previousEntry = index > 0 ? chronologicalEntries[index - 1] : null;
    const previousCalculation = index > 0 ? meterDifferences.get(previousEntry.entry_date) : null;
    const metersAreValidated = hasValidatedNysegMeters(entry.entry_date) &&
      hasValidatedNysegMeters(previousEntry?.entry_date);
    const m01 = metersAreValidated && previousEntry
      ? Number(entry.meter_01_import_reading || 0) - Number(previousEntry.meter_01_import_reading || 0)
      : null;
    const m02 = metersAreValidated && previousEntry
      ? Number(entry.meter_02_export_reading || 0) - Number(previousEntry.meter_02_export_reading || 0)
      : null;
    const edc = Number.isFinite(m01) && Number.isFinite(m02)
      ? Number(entry.production_kwh || 0) + m01 - m02
      : null;
    meterDifferences.set(entry.entry_date, {
      m01,
      m02,
      edc,
      dayBalance: Number.isFinite(edc) ? Number(entry.production_kwh || 0) - edc : null,
      previousEdc: previousCalculation?.edc ?? null,
      previousDate: previousEntry?.entry_date ?? null,
      edcDiff: Number.isFinite(edc) && Number.isFinite(previousCalculation?.edc)
        ? edc - previousCalculation.edc
        : null
    });
  });
  const filteredEntries = chronologicalEntries.filter((entry) => entryMatchesHistoryFilters(entry));
  updateEntriesMeterDifferenceSummary(filteredEntries, meterDifferences, chronologicalEntries);
  const visibleEntries = filteredEntries.slice().reverse();
  const recordCount = document.getElementById("entries-record-count");
  if (recordCount) {
    recordCount.textContent = entriesPageState.weatherFilter === "All" && entriesPageState.monthFilter === "All"
      ? String(visibleEntries.length)
      : `${visibleEntries.length} of ${chronologicalEntries.length}`;
  }
  const formatDifference = (value) => Number.isFinite(value) ? value.toFixed(1) : '<span class="text-muted">-</span>';
  const calculationSignClass = (value) => {
    if (!Number.isFinite(value)) return "";
    if (value > 0.05) return "calculation-positive";
    if (value < -0.05) return "calculation-negative";
    return "calculation-neutral";
  };
  const populatedRows = visibleEntries.map((entry) => {
    const differences = meterDifferences.get(entry.entry_date) || {};
    const metersAreValidated = hasValidatedNysegMeters(entry.entry_date);
    const entryDateLabel = formatIsoDateForDisplay(entry.entry_date);
    const edcTooltip = Number.isFinite(differences.edc)
      ? `Estimated home energy used on ${entryDateLabel}.\n${Number(entry.production_kwh || 0).toFixed(1)} solar production + ${differences.m01.toFixed(1)} grid import - ${differences.m02.toFixed(1)} grid export = ${differences.edc.toFixed(1)} kWh EDC.\nImport is added because the home used it. Export is subtracted because it was sent to the grid.`
      : "EDC requires a previous meter reading so daily import and export can be calculated.";
    const previousEdc = differences.previousEdc;
    const previousDateLabel = differences.previousDate
      ? formatIsoDateForDisplay(differences.previousDate)
      : "the previous day";
    const consumptionDirection = Number.isFinite(differences.edcDiff)
      ? differences.edcDiff < 0
        ? `You consumed an estimated ${Math.abs(differences.edcDiff).toFixed(1)} kWh LESS than the previous day.`
        : differences.edcDiff > 0
          ? `You consumed an estimated ${differences.edcDiff.toFixed(1)} kWh MORE than the previous day.`
          : "Estimated consumption was unchanged from the previous day."
      : "";
    const edcDiffTooltip = Number.isFinite(differences.edcDiff)
      ? `EDC change compared with ${previousDateLabel}.\n${differences.edc.toFixed(1)} current EDC - ${previousEdc.toFixed(1)} previous EDC = ${differences.edcDiff.toFixed(1)} kWh.\n${consumptionDirection} Negative means less consumption; positive means more.`
      : "EDC Diff requires two calculated consumption days. Negative means less consumption; positive means more.";
    const balanceInterpretation = Number.isFinite(differences.dayBalance)
      ? differences.dayBalance > 0.05
        ? "Net surplus: solar produced more than the home consumed."
        : differences.dayBalance < -0.05
          ? "Net deficit: the home consumed more than solar produced and relied on net grid energy."
          : "Balanced day: production approximately matched consumption."
      : "Day Balance requires daily import and export differences.";
    const balanceTooltip = Number.isFinite(differences.dayBalance)
      ? `Daily Energy Balance for ${entryDateLabel}.\n${Number(entry.production_kwh || 0).toFixed(1)} production - ${differences.edc.toFixed(1)} EDC = ${differences.dayBalance >= 0 ? "+" : ""}${differences.dayBalance.toFixed(1)} kWh.\nCross-check: ${differences.m02.toFixed(1)} export - ${differences.m01.toFixed(1)} import = ${(differences.m02 - differences.m01) >= 0 ? "+" : ""}${(differences.m02 - differences.m01).toFixed(1)} kWh.\n${balanceInterpretation}\nThis is an analysis value only; the tracker does not add it to the official NYSEG credit-bank balance.`
      : balanceInterpretation;
    const importDiffExceedsExportDiff = Number.isFinite(differences.m01) &&
      Number.isFinite(differences.m02) && differences.m01 > differences.m02;
    return `
    <tr class="entry-history-row ${entry.entry_date === entriesPageState.selectedDate ? "entry-row-selected" : ""} ${importDiffExceedsExportDiff ? "entry-import-diff-exceeds-export-diff" : ""}"
        data-entry-date="${entry.entry_date}" tabindex="0" title="Select this record to edit${importDiffExceedsExportDiff ? ". Yellow indicates M01 Diff is greater than M02 Diff." : ""}">
      <td>${entry.entry_date}</td>
      <td>${formatIsoWeekday(entry.entry_date)}</td>
      <td>${Number(entry.production_kwh || 0).toFixed(1)}</td>
      <td>${Number(entry.irradiance_peak_wm2 || 0).toFixed(0)}</td>
      <td title="${metersAreValidated ? "Validated NYSEG meter reading" : "Awaiting the next validated NYSEG file"}">${metersAreValidated ? Number(entry.meter_01_import_reading || 0).toFixed(1) : '<span class="text-muted">—</span>'}</td>
      <td class="meter-diff-cell ${calculationSignClass(differences.m01)}" title="M01 change from the previous available date">${formatDifference(differences.m01)}</td>
      <td title="${metersAreValidated ? "Validated NYSEG meter reading" : "Awaiting the next validated NYSEG file"}">${metersAreValidated ? Number(entry.meter_02_export_reading || 0).toFixed(1) : '<span class="text-muted">—</span>'}</td>
      <td class="meter-diff-cell ${calculationSignClass(differences.m02)}" title="M02 change from the previous available date">${formatDifference(differences.m02)}</td>
      <td class="estimated-consumption-cell ${calculationSignClass(differences.edc)}" title="${escapeHtml(edcTooltip)}">${formatDifference(differences.edc)}</td>
      <td class="estimated-consumption-diff-cell ${calculationSignClass(differences.edcDiff)}" title="${escapeHtml(edcDiffTooltip)}">${formatDifference(differences.edcDiff)}</td>
      <td class="daily-energy-balance-cell ${calculationSignClass(differences.dayBalance)}" title="${escapeHtml(balanceTooltip)}">${Number.isFinite(differences.dayBalance) ? `${differences.dayBalance >= 0 ? "+" : ""}${differences.dayBalance.toFixed(1)}` : '<span class="text-muted">-</span>'}</td>
      <td>${renderWeatherCell(entry)}</td>
      <td>${formatTemperatureCellValue(entry.temperature_high_f)}</td>
      <td>${formatTemperatureCellValue(entry.temperature_low_f)}</td>
      <td>${renderNotesCell(entry.notes)}</td>
      <td>${metersAreValidated ? (entry.estimated ? '<span class="entry-estimated-pill">Pending data</span>' : '<span class="entry-confirmed-pill">Actual</span>') : '<span class="entry-estimated-pill">Awaiting NYSEG</span>'}</td>
      <td><button type="button" class="btn btn-contract btn-sm entry-edit-button" data-entry-date="${entry.entry_date}">Edit</button> <button type="button" class="btn btn-contract btn-sm entry-revisions-button" data-entry-date="${entry.entry_date}">History</button></td>
    </tr>
  `;
  }).join("");
  const blankRows = Array.from(
    { length: Math.max(0, 18 - visibleEntries.length) },
    () => `<tr class="entry-empty-row" aria-hidden="true">${"<td>&nbsp;</td>".repeat(17)}</tr>`
  ).join("");
  body.innerHTML = populatedRows + blankRows;

  body.querySelectorAll(".entry-history-row").forEach((row) => {
    const selectRow = () => selectHistoricalEntry(row.dataset.entryDate);
    row.addEventListener("click", (event) => {
      if (event.target.closest("button")) return;
      selectRow();
    });
    row.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        selectRow();
      }
    });
  });
  body.querySelectorAll(".entry-revisions-button").forEach((button) => {
    button.addEventListener("click", () => showEntryHistory(button.dataset.entryDate));
    button.addEventListener("keydown", (event) => event.stopPropagation());
  });
  body.querySelectorAll(".entry-edit-button").forEach((button) => {
    button.addEventListener("click", () => selectHistoricalEntry(button.dataset.entryDate));
  });
}

function initializeEntriesMonthComparisonToggle() {
  const toggle = document.querySelector("[data-entries-month-comparison-toggle]");
  const content = document.querySelector("[data-entries-month-comparison-content]");
  if (!toggle || !content || toggle.dataset.bound === "true") return;
  toggle.dataset.bound = "true";
  toggle.addEventListener("click", () => {
    const opening = content.hidden;
    content.hidden = !opening;
    toggle.setAttribute("aria-expanded", String(opening));
    const label = toggle.querySelector("[data-entries-month-comparison-label]");
    if (label) label.textContent = opening ? "Hide totals" : "Show totals";
  });
}

function updateEntriesMeterDifferenceSummary(entries, meterDifferences, allEntries = entries) {
  initializeEntriesMonthComparisonToggle();
  const m01Target = document.getElementById("entries-m01-diff-total");
  const m02Target = document.getElementById("entries-m02-diff-total");
  const m01AverageTarget = document.getElementById("entries-m01-diff-average");
  const m02AverageTarget = document.getElementById("entries-m02-diff-average");
  const consumptionAverageTarget = document.getElementById("entries-average-daily-consumption");
  const consumptionTotalTarget = document.getElementById("entries-total-consumption");
  const impliedProductionTarget = document.getElementById("entries-implied-production-total");
  const sunrunComparisonTarget = document.getElementById("entries-sunrun-production-comparison");
  const productionReconciliation = document.getElementById("entries-production-reconciliation");
  const validatedThroughTarget = document.getElementById("entries-nyseg-validated-through");
  const validatedDetailTarget = document.getElementById("entries-nyseg-validated-detail");

  if (validatedThroughTarget) validatedThroughTarget.textContent = validatedNysegThrough ? formatIsoDateForDisplay(validatedNysegThrough) : "Awaiting NYSEG";
  if (validatedDetailTarget) validatedDetailTarget.textContent = validatedNysegThrough
    ? "Only validated NYSEG dates are included"
    : "No verified interval endpoint available";

  const displayedDifferences = entries.map((entry) => meterDifferences.get(entry.entry_date) || {});
  const totals = displayedDifferences.reduce((result, differences) => {
    if (Number.isFinite(differences.m01)) {
      result.m01 += differences.m01;
      result.m01Count += 1;
    }
    if (Number.isFinite(differences.m02)) {
      result.m02 += differences.m02;
      result.m02Count += 1;
    }
    return result;
  }, { m01: 0, m02: 0, m01Count: 0, m02Count: 0 });
  if (m01Target) m01Target.textContent = `${totals.m01.toFixed(1)} kWh`;
  if (m02Target) m02Target.textContent = `${totals.m02.toFixed(1)} kWh`;
  if (m01AverageTarget) {
    m01AverageTarget.textContent = totals.m01Count
      ? `Average: ${(totals.m01 / totals.m01Count).toFixed(1)} kWh/day`
      : "Average: —";
  }
  if (m02AverageTarget) {
    m02AverageTarget.textContent = totals.m02Count
      ? `Average: ${(totals.m02 / totals.m02Count).toFixed(1)} kWh/day`
      : "Average: —";
  }
  const consumptionValues = displayedDifferences
    .map((differences) => differences.edc)
    .filter((value) => Number.isFinite(value));
  const totalConsumption = consumptionValues.reduce((sum, value) => sum + value, 0);
  const averageDailyConsumption = consumptionValues.length
    ? totalConsumption / consumptionValues.length
    : 0;
  if (consumptionAverageTarget) {
    consumptionAverageTarget.textContent = consumptionValues.length
      ? `Average: ${averageDailyConsumption.toFixed(1)} kWh/day · ${consumptionValues.length} day${consumptionValues.length === 1 ? "" : "s"}`
      : "Average: —";
  }
  if (consumptionTotalTarget) {
    consumptionTotalTarget.textContent = consumptionValues.length
      ? `${totalConsumption.toFixed(1)} kWh`
      : "—";
  }
  const impliedProduction = consumptionValues.length
    ? totalConsumption - totals.m01 + totals.m02
    : null;
  const comparableEntries = entries.filter((entry) => {
    const differences = meterDifferences.get(entry.entry_date) || {};
    return Number.isFinite(differences.edc) && getSunrunProductionRecord(entry.entry_date)?.available;
  });
  const sunrunProductionTotal = comparableEntries.reduce((sum, entry) => (
    sum + Number(getSunrunProductionRecord(entry.entry_date)?.production_kwh || 0)
  ), 0);
  const productionDifference = Number.isFinite(impliedProduction) && comparableEntries.length === consumptionValues.length
    ? impliedProduction - sunrunProductionTotal
    : null;
  if (impliedProductionTarget) {
    impliedProductionTarget.textContent = Number.isFinite(impliedProduction)
      ? `${formatNumber(impliedProduction, 1, 1)} kWh`
      : "—";
  }
  if (sunrunComparisonTarget) {
    const coverage = `${comparableEntries.length}/${consumptionValues.length} dates`;
    sunrunComparisonTarget.textContent = comparableEntries.length
      ? `Sunrun CSV: ${formatNumber(sunrunProductionTotal, 1, 1)} kWh · Diff: ${Number.isFinite(productionDifference) ? `${productionDifference >= 0 ? "+" : ""}${formatNumber(productionDifference, 1, 1)} kWh` : "incomplete"} · ${coverage}`
      : "No matching Sunrun CSV dates";
  }
  if (productionReconciliation) {
    productionReconciliation.title = Number.isFinite(impliedProduction)
      ? `Implied production = Consumption - Import + Export.\n${formatNumber(totalConsumption, 1, 1)} - ${formatNumber(totals.m01, 1, 1)} + ${formatNumber(totals.m02, 1, 1)} = ${formatNumber(impliedProduction, 1, 1)} kWh.\nSunrun CSV total for matching filtered dates: ${formatNumber(sunrunProductionTotal, 1, 1)} kWh.\nThis is a reconciliation, not an independent measurement, because EDC includes Sunrun production.`
      : "Production reconciliation requires calculated consumption and meter differences.";
  }

  const todayIsoDate = getTodayIsoDate();
  const completedEntries = allEntries.filter((entry) => String(entry.entry_date || "") < todayIsoDate);
  const monthKeys = [...new Set(allEntries
    .filter((entry) => String(entry.entry_date || "") <= todayIsoDate)
    .map((entry) => String(entry.entry_date || "").slice(0, 7)))]
    .filter(Boolean).sort().reverse();
  const monthLabels = monthKeys.map((monthKey) => new Date(`${monthKey}-01T12:00:00`).toLocaleDateString("en-US", { month: "short", year: "numeric" }));
  const monthlyTotals = monthKeys.reduce((result, monthKey) => {
    result[monthKey] = { power: 0, m01: 0, m02: 0, edc: 0, dayBalance: 0, powerCount: 0, m01Count: 0, m02Count: 0, edcCount: 0, dayBalanceCount: 0 };
    return result;
  }, {});
  completedEntries.forEach((entry) => {
    const summary = monthlyTotals[String(entry.entry_date || "").slice(0, 7)];
    if (!summary) return;
    const differences = meterDifferences.get(entry.entry_date) || {};
    const power = Number(entry.production_kwh);
    if (Number.isFinite(power)) { summary.power += power; summary.powerCount += 1; }
    if (Number.isFinite(differences.m01)) { summary.m01 += differences.m01; summary.m01Count += 1; }
    if (Number.isFinite(differences.m02)) { summary.m02 += differences.m02; summary.m02Count += 1; }
    if (Number.isFinite(differences.edc)) { summary.edc += differences.edc; summary.edcCount += 1; }
  });
  monthKeys.forEach((monthKey) => {
    const summary = monthlyTotals[monthKey];
    if (summary.powerCount && summary.edcCount) { summary.dayBalance = summary.power - summary.edc; summary.dayBalanceCount = Math.min(summary.powerCount, summary.edcCount); }
  });
  const monthlyMetrics = {
    power: { label: "Power", color: "#8a641c", description: "Solar energy produced during completed days. Total: sum of daily production readings in kWh." },
    m01: { label: "M01 import", color: "#c15a16", description: "Electricity imported from the grid during completed days. Total: sum of each daily increase in Meter 01." },
    m02: { label: "M02 export", color: "#176f51", description: "Surplus solar exported to the grid during completed days. Total: sum of each daily increase in Meter 02." },
    edc: { label: "EDC", color: "#2e6f9e", description: "Estimated daily consumption. Each day: Power + M01 import minus M02 export; total: sum of completed days." },
    dayBalance: { label: "Day balance", color: "#4c6170", description: "Net energy flow for completed days. Positive means more export than import; negative means more import than export." }
  };
  const tableHead = document.getElementById("entries-month-comparison-head");
  const tableBody = document.getElementById("entries-month-comparison-body");
  if (tableHead && tableBody) {
    tableHead.innerHTML = `<tr><th scope="col">Metric</th>${monthLabels.map((label) => `<th scope="col">${label}</th>`).join("")}</tr>`;
    tableBody.innerHTML = Object.entries(monthlyMetrics).map(([metric, details]) => `<tr><th scope="row"><span class="entries-month-metric-label" title="${details.description}">${details.label}</span></th>${monthKeys.map((monthKey) => { const summary = monthlyTotals[monthKey]; const count = summary?.[`${metric}Count`] || 0; return `<td>${count ? `${summary[metric].toFixed(1)} kWh` : "—"}</td>`; }).join("")}</tr>`).join("");
  }
  const electricRate = Number(entriesPageState.config?.current_electric_rate || defaultConfig.current_electric_rate || 0);
  const creditBankByMonth = new Map(); const monthlyCreditChangeByMonth = new Map(); let estimatedCreditBankKwh = 0;
  completedEntries.forEach((entry) => { const differences = meterDifferences.get(entry.entry_date) || {}; if (!Number.isFinite(differences.dayBalance)) return; const monthKey = String(entry.entry_date || "").slice(0, 7); monthlyCreditChangeByMonth.set(monthKey, (monthlyCreditChangeByMonth.get(monthKey) || 0) + differences.dayBalance); estimatedCreditBankKwh = Math.max(0, estimatedCreditBankKwh + differences.dayBalance); creditBankByMonth.set(monthKey, estimatedCreditBankKwh); });
  const creditGrid = document.getElementById("entries-credit-bank-grid");
  if (creditGrid) {
    const cards = monthKeys.map((monthKey, index) => { const net = monthlyCreditChangeByMonth.get(monthKey); const value = Number.isFinite(net) ? net * electricRate : null; return `<div class="entries-credit-bank-card"><span>${monthLabels[index]} net credit</span><strong>${Number.isFinite(net) ? `${net >= 0 ? "+" : ""}${net.toFixed(1)} kWh` : "—"}</strong><small>${Number.isFinite(value) ? `≈ ${formatCurrency(value)}` : "≈ —"}</small></div>`; });
    const latestBankMonth = Array.from(creditBankByMonth.keys()).sort().at(-1); const running = latestBankMonth ? creditBankByMonth.get(latestBankMonth) : null;
    cards.push(`<div class="entries-credit-bank-card entries-credit-bank-card-total"><span>Running balance</span><strong>${Number.isFinite(running) ? `${running.toFixed(1)} kWh` : "—"}</strong><small>${Number.isFinite(running) ? `≈ ${formatCurrency(running * electricRate)}` : "≈ —"}</small></div>`);
    creditGrid.innerHTML = cards.join("");
  }  const sparklineChart = document.getElementById("entries-month-sparkline-chart");
  if (sparklineChart) {
    sparklineChart.innerHTML = Object.entries(monthlyMetrics).map(([metric, details]) => {
      const values = monthKeys.slice().reverse().map((monthKey) => {
        const summary = monthlyTotals[monthKey];
        return summary?.[`${metric}Count`] ? summary[metric] : null;
      });
      const finiteValues = values.filter(Number.isFinite);
      if (!finiteValues.length) return `<div class="entries-month-sparkline"><span title="${details.description}">${details.label}</span><small>No data</small></div>`;
      const min = Math.min(...finiteValues);
      const max = Math.max(...finiteValues);
      const range = max - min || 1;
      const points = values.map((value, index) => {
        const x = 8 + index * ((Math.max(150, values.length * 48) - 16) / Math.max(1, values.length - 1));
        const y = Number.isFinite(value) ? 23 - ((value - min) / range) * 18 : 23;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      }).join(" ");
      return `<div class="entries-month-sparkline"><span title="${details.description}">${details.label}</span><svg viewBox="0 0 ${Math.max(150, values.length * 48)} 30" role="img" aria-label="${details.label} three-month progression"><path d="M8 23H142" class="entries-month-sparkline-baseline"></path><polyline points="${points}" fill="none" stroke="${details.color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline></svg></div>`;
    }).join("");
  }
  const trendChart = document.getElementById("entries-month-trend-chart");
  if (trendChart) {
    const chartMetrics = ["power", "m01", "m02", "edc"];
    const series = chartMetrics.map((metric) => ({
      metric,
      ...monthlyMetrics[metric],
      values: monthKeys.slice().reverse().map((monthKey) => {
        const summary = monthlyTotals[monthKey];
        return summary?.[`${metric}Count`] ? summary[metric] : null;
      })
    }));
    const finiteValues = series.flatMap((item) => item.values).filter(Number.isFinite);
    if (!finiteValues.length) {
      trendChart.innerHTML = '<small>No completed data is available for this comparison.</small>';
    } else {
      const max = Math.max(...finiteValues, 1);
      const labels = monthLabels.slice().reverse().map((label) => label.replace(/\s\d{4}$/, ""));
      const chartWidth = Math.max(344, labels.length * 88);
      const xCoordinates = labels.map((_, index) => 36 + index * ((chartWidth - 72) / Math.max(1, labels.length - 1)));
      const seriesMarkup = series.map((item) => {
        const points = item.values.map((value, index) => {
          const x = xCoordinates[index];
          const y = Number.isFinite(value) ? 112 - (value / max) * 88 : 112;
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        }).join(" ");
        return `<polyline points="${points}" fill="none" stroke="${item.color}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"></polyline>`;
      }).join("");
      const dotsMarkup = series.map((item) => item.values.map((value, index) => {
        if (!Number.isFinite(value)) return "";
        const y = 112 - (value / max) * 88;
        return `<circle cx="${xCoordinates[index]}" cy="${y.toFixed(1)}" r="3.5" fill="${item.color}"></circle>`;
      }).join("")).join("");
      const legendMarkup = series.map((item) => `<span><i style="background:${item.color}"></i>${item.label}</span>`).join("");
      trendChart.innerHTML = `<div class="entries-month-trend-legend">${legendMarkup}</div><svg class="entries-month-line-chart" viewBox="0 0 ${chartWidth} 140" role="img" aria-label="All-month comparison of Power, M01 import, M02 export, and EDC in kilowatt-hours"><path d="M36 24H${chartWidth - 36}M36 68H${chartWidth - 36}M36 112H${chartWidth - 36}" class="entries-month-line-grid"></path>${seriesMarkup}${dotsMarkup}${labels.map((label, index) => `<text x="${xCoordinates[index]}" y="134" text-anchor="middle">${label}</text>`).join("")}</svg>`;
    }
  }
}

function updateEntriesNetMeterSummary(entries, config = defaultConfig) {
  const valueTarget = document.getElementById("entries-net-meter-value");
  const descriptionTarget = document.getElementById("entries-net-meter-description");
  if (!valueTarget || !descriptionTarget) return;

  const latestEntry = entries.length ? entries[entries.length - 1] : null;
  const electricRate = Number(config?.current_electric_rate || defaultConfig.current_electric_rate || 0);
  if (!latestEntry) {
    valueTarget.textContent = "$0.00";
    descriptionTarget.textContent = "No meter readings available";
    return;
  }

  const netMeterKwh = (
    Number(latestEntry.meter_02_export_reading || 0) -
    Number(latestEntry.meter_01_import_reading || 0)
  );
  const estimatedValue = netMeterKwh * electricRate;
  valueTarget.textContent = formatCurrency(estimatedValue);
  descriptionTarget.textContent = `${netMeterKwh.toFixed(1)} kWh x $${electricRate.toFixed(2)}/kWh`;
}

function updateEntriesMonthlyCostSummary(entries, config = defaultConfig) {
  const summaryTarget = document.getElementById("entries-monthly-cost-summary");
  const valueTarget = document.getElementById("entries-monthly-cost-value");
  const descriptionTarget = document.getElementById("entries-monthly-cost-description");
  const detailTarget = document.getElementById("entries-monthly-cost-detail");
  if (!summaryTarget || !valueTarget || !descriptionTarget || !detailTarget) return;

  if (!entries.length) {
    valueTarget.textContent = "$0";
    descriptionTarget.textContent = "No meter readings available";
    detailTarget.textContent = "Import and export projection unavailable";
    return;
  }

  const latestEntry = entries[entries.length - 1];
  const latestDate = new Date(`${latestEntry.entry_date}T00:00:00`);
  const monthPrefix = String(latestEntry.entry_date).slice(0, 7);
  const monthEntries = entries.filter((entry) => String(entry.entry_date).startsWith(`${monthPrefix}-`));
  const priorEntries = entries.filter((entry) => String(entry.entry_date) < `${monthPrefix}-01`);
  const baselineEntry = priorEntries.length
    ? priorEntries[priorEntries.length - 1]
    : monthEntries[0];
  const baselineDate = new Date(`${baselineEntry.entry_date}T00:00:00`);
  const observedDays = Math.max(1, Math.round((latestDate - baselineDate) / 86400000));
  const daysInMonth = new Date(latestDate.getFullYear(), latestDate.getMonth() + 1, 0).getDate();
  const projectionFactor = daysInMonth / observedDays;
  const importSoFar = Math.max(
    0,
    Number(latestEntry.meter_01_import_reading || 0) - Number(baselineEntry.meter_01_import_reading || 0)
  );
  const exportSoFar = Math.max(
    0,
    Number(latestEntry.meter_02_export_reading || 0) - Number(baselineEntry.meter_02_export_reading || 0)
  );
  const projectedImport = importSoFar * projectionFactor;
  const projectedExport = exportSoFar * projectionFactor;
  const projectedNetImport = Math.max(0, projectedImport - projectedExport);
  const electricRate = Number(config?.current_electric_rate || defaultConfig.current_electric_rate || 0);
  const fixedCharge = Number(config?.monthly_fixed_charges || defaultConfig.monthly_fixed_charges || 0);
  const sunrunLease = Number(config?.monthly_lease_payment || defaultConfig.monthly_lease_payment || 0);
  const projectedNysegCost = fixedCharge + projectedNetImport * electricRate;
  const projectedTotalCost = projectedNysegCost + sunrunLease;
  const monthLabel = latestDate.toLocaleDateString("en-US", { month: "short", year: "numeric" });

  valueTarget.textContent = formatCurrency(projectedTotalCost);
  descriptionTarget.textContent = `${formatCurrency(projectedNysegCost)} NYSEG + ${formatCurrency(sunrunLease)} Sunrun`;
  detailTarget.textContent = `${projectedImport.toFixed(0)} import - ${projectedExport.toFixed(0)} export kWh projected`;
  summaryTarget.title = `${monthLabel} estimate from ${observedDays} observed day${observedDays === 1 ? "" : "s"}: ` +
    `${importSoFar.toFixed(1)} kWh imported and ${exportSoFar.toFixed(1)} kWh exported so far. ` +
    `NYSEG = projected net imported energy at $${electricRate.toFixed(2)}/kWh + $${fixedCharge.toFixed(2)} fixed charge. ` +
    `Sunrun lease = $${sunrunLease.toFixed(2)}. Export credits cannot reduce the NYSEG estimate below its fixed charge.`;
}

async function refreshEntryLookupFields(db, entryDate, { notesOverride = null } = {}) {
  const state = await loadFirestoreState(db);
  const existingEntry = state.entries.find((entry) => entry.entry_date === entryDate);
  const lookupValues = await buildEstimatedLookupValues(entryDate, state.entries);
  const sunrunRecord = getSunrunProductionRecord(entryDate);
  const existingNotes = String(existingEntry?.notes || "");
  const hasNotesOverride = notesOverride !== null;
  const preservedNotes = hasNotesOverride ? String(notesOverride) : existingNotes;
  const protectExistingNotes = Boolean(existingEntry?.notes_manual) ||
    String(existingEntry?.lookup_source || "").toLowerCase() === "manual";
  const mergedEntry = normalizeEntry({
    ...(existingEntry || {
      entry_date: entryDate,
      irradiance_peak_wm2: 0,
      production_kwh: 0,
      meter_01_import_reading: 0,
      meter_02_export_reading: 0,
      weather: "Unknown",
      notes: "",
      estimated: true,
      created_at: new Date().toISOString()
    }),
    irradiance_peak_wm2: lookupValues.irradiance_peak_wm2 ?? existingEntry?.irradiance_peak_wm2 ?? 0,
    irradiance_hourly_profile: lookupValues.irradiance_hourly_profile || existingEntry?.irradiance_hourly_profile || [],
    irradiance_method: lookupValues.irradiance_hourly_profile?.length
      ? "open-meteo-hourly-instant-ghi-v3"
      : existingEntry?.irradiance_method || "",
    irradiance_verified_at: lookupValues.irradiance_hourly_profile?.length
      ? new Date().toISOString()
      : existingEntry?.irradiance_verified_at || "",
    production_kwh: sunrunRecord?.available
      ? Number(sunrunRecord.production_kwh || 0)
      : existingEntry?.production_kwh ?? 0,
    weather: lookupValues.weather || existingEntry?.weather || "Unknown",
    temperature_f: lookupValues.temperature_f ?? existingEntry?.temperature_f ?? null,
    temperature_high_f: lookupValues.temperature_high_f ?? existingEntry?.temperature_high_f ?? null,
    temperature_low_f: lookupValues.temperature_low_f ?? existingEntry?.temperature_low_f ?? null,
    humidity_pct: lookupValues.humidity_pct ?? existingEntry?.humidity_pct ?? null,
    cloud_cover_pct: lookupValues.cloud_cover_pct ?? existingEntry?.cloud_cover_pct ?? null,
    wind_mph: lookupValues.wind_mph ?? existingEntry?.wind_mph ?? null,
    sunrise_time: lookupValues.sunrise_time || existingEntry?.sunrise_time || "",
    sunset_time: lookupValues.sunset_time || existingEntry?.sunset_time || "",
    lookup_source: lookupValues.lookup_source || existingEntry?.lookup_source || "manual",
    notes: hasNotesOverride || protectExistingNotes
      ? preservedNotes
      : preservedNotes || lookupValues.notes || "",
    notes_manual: hasNotesOverride || protectExistingNotes,
    estimated: existingEntry?.estimated ?? true,
    updated_at: new Date().toISOString()
  });

  await setDoc(doc(db, entryCollectionName, entryDate), mergedEntry, { merge: true });
  return mergedEntry;
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
  const clearButton = document.getElementById("entry-clear-button");
  const refreshButton = document.getElementById("entry-refresh");
  const autoCreateButton = document.getElementById("entry-auto-create");
  const meterSimulationButton = document.getElementById("entry-meter-sim-apply");
  const checkpointButton = document.getElementById("entry-meter-checkpoint-save");
  const checkpointTime = document.getElementById("entry-meter-checkpoint-time");
  const checkpointPredictedM01 = document.getElementById("entry-meter-checkpoint-predicted-m01");
  const checkpointPredictedM02 = document.getElementById("entry-meter-checkpoint-predicted-m02");
  const checkpointActualM01 = document.getElementById("entry-meter-checkpoint-actual-m01");
  const checkpointActualM02 = document.getElementById("entry-meter-checkpoint-actual-m02");
  const meterPhotoM01 = document.getElementById("entry-meter-photo-m01");
  const meterPhotoM02 = document.getElementById("entry-meter-photo-m02");
  const quickMeterPhotoM01 = document.getElementById("entry-meter-photo-quick-m01");
  const quickMeterPhotoM02 = document.getElementById("entry-meter-photo-quick-m02");
  const quickMeterPhotoSave = document.getElementById("entry-meter-photo-quick-save");
  const quickMeterPhotoStatus = document.getElementById("entry-meter-photo-quick-status");
  const meterPhotoSaveActions = document.getElementById("entry-meter-photo-save-actions");
  const meterPhotoReview = document.getElementById("entry-meter-photo-review");
  const meterPhotoReviewGrid = document.getElementById("entry-meter-photo-review-grid");
  const pendingMeterPhotos = { m01: null, m02: null };

  function meterPhotoCandidates(text) {
    return String(text || "").replace(/[Oo]/g, "0").replace(/,/g, ".")
      .match(/\d{3,5}(?:\.\d{1,2})?/g)?.map(Number).filter(Number.isFinite) || [];
  }

  function renderMeterPhotoReview() {
    if (!meterPhotoReview || !meterPhotoReviewGrid) return;
    const photos = Object.entries(pendingMeterPhotos).filter(([, file]) => file);
    meterPhotoReview.hidden = !photos.length;
    meterPhotoReviewGrid.innerHTML = photos.map(([meter, file]) => {
      const value = meter === "m01" ? checkpointActualM01?.value : checkpointActualM02?.value;
      const simulation = meter === "m01" ? checkpointPredictedM01?.value : checkpointPredictedM02?.value;
      const url = URL.createObjectURL(file);
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
      return `<article class="meter-photo-review-card"><img src="${url}" alt="${meter.toUpperCase()} meter photo to review"><div><strong>${meter.toUpperCase()} · ${Number(value).toFixed(1)}</strong><br>Sim before update: ${Number(simulation).toFixed(1)}</div></article>`;
    }).join("");
  }
  function renderMeterPhotoSaveActions() {
    if (!meterPhotoSaveActions) return;
    const controls = Object.entries(pendingMeterPhotos).filter(([, file]) => file).map(([meter, file]) =>
      `<button type="button" class="btn btn-outline-secondary btn-sm" data-save-meter-photo="${meter}">Save ${meter.toUpperCase()} photo to Pictures</button>`
    );
    meterPhotoSaveActions.innerHTML = controls.join("");
    meterPhotoSaveActions.querySelectorAll("[data-save-meter-photo]").forEach((button) => {
      button.addEventListener("click", async () => {
        const meter = button.dataset.saveMeterPhoto;
        const file = pendingMeterPhotos[meter];
        if (!file) return;
        try {
          const shareFile = new File([file], `${meter.toUpperCase()}-${getActiveEntryDate()}.${file.name.split(".").pop() || "jpg"}`, { type: file.type || "image/jpeg" });
          if (navigator.canShare?.({ files: [shareFile] })) {
            await navigator.share({ title: `${meter.toUpperCase()} meter photo`, files: [shareFile] });
            renderStatusAlert("entries-status", `Choose “Save Image” in the iPhone share sheet to keep the ${meter.toUpperCase()} photo in Pictures.`, "info");
          } else {
            const link = document.createElement("a");
            link.href = URL.createObjectURL(file);
            link.download = shareFile.name;
            link.click();
            URL.revokeObjectURL(link.href);
          }
        } catch (error) {
          if (error?.name !== "AbortError") renderStatusAlert("entries-status", `Could not open the save menu for ${meter.toUpperCase()}.`, "warning");
        }
      });
    });
  }

  function updateQuickMeterPhotoStatus() {
    if (!quickMeterPhotoStatus) return;
    const m01 = checkpointActualM01?.value ? `M01 ${Number(checkpointActualM01.value).toFixed(1)}` : "M01 needed";
    const m02 = checkpointActualM02?.value ? `M02 ${Number(checkpointActualM02.value).toFixed(1)}` : "M02 needed";
    quickMeterPhotoStatus.textContent = `${m01} · ${m02}. ${pendingMeterPhotos.m01 && pendingMeterPhotos.m02 ? "Ready to update." : "Capture both meter photos."}`;
    if (quickMeterPhotoSave) quickMeterPhotoSave.disabled = !(pendingMeterPhotos.m01 && pendingMeterPhotos.m02 && checkpointActualM01?.value && checkpointActualM02?.value);
  }
  async function readMeterPhoto(file, targetInput, simulatedInput, meterName) {
    if (!file || !targetInput) return;
    if (file.size > 12 * 1024 * 1024) {
      renderStatusAlert("entries-status", `${meterName} photo is too large. Use a photo smaller than 12 MB.`, "warning");
      return;
    }
    if (!window.Tesseract?.recognize) {
      renderStatusAlert("entries-status", "Meter-photo reading is still loading. Wait a moment and try the photo again.", "warning");
      return;
    }
    renderStatusAlert("entries-status", `Reading ${meterName} from the photo on this device…`, "info");
    try {
      const result = await window.Tesseract.recognize(file, "eng", { logger: (progress) => {
        if (progress.status === "recognizing text" && Number.isFinite(progress.progress)) {
          renderStatusAlert("entries-status", `Reading ${meterName} from the photo… ${Math.round(progress.progress * 100)}%`, "info");
        }
      }});
      const simulated = Number(simulatedInput?.value);
      const reading = meterPhotoCandidates(result?.data?.text)
        .sort((left, right) => Math.abs(left - simulated) - Math.abs(right - simulated))[0];
      if (!Number.isFinite(reading)) {
        renderStatusAlert("entries-status", `No ${meterName} reading was found. Retake the photo tightly around the meter display, then enter the value manually if needed.`, "warning");
        return;
      }
      targetInput.value = reading.toFixed(1);
      targetInput.dispatchEvent(new Event("input", { bubbles: true }));
      pendingMeterPhotos[meterName.toLowerCase()] = file;
      renderMeterPhotoSaveActions();
      renderMeterPhotoReview();
      updateQuickMeterPhotoStatus();
      renderStatusAlert("entries-status", `${meterName} photo read as ${reading.toFixed(1)}. Review the photo and reading below, capture the other meter, then update the Calibration Checkpoint.`, "success");
    } catch (error) {
      console.error("Meter photo reading failed", error);
      renderStatusAlert("entries-status", `Could not read the ${meterName} photo. Use a clear, close camera photo of the numeric display and try again.`, "warning");
    }
  }
  const viewDayEstimatesButton = document.getElementById("entry-meter-sim-view-day");
  const simulationDialog = document.getElementById("entry-meter-sim-dialog");
  const simulationDialogClose = document.getElementById("entry-meter-sim-dialog-close");
  const dateField = form.elements.namedItem("entry_date");

  setupHistoricalEntriesWindow();
  setupCalibrationHistoryPopout();

  if (viewDayEstimatesButton && simulationDialog) {
    viewDayEstimatesButton.addEventListener("click", () => {
      renderMeterSimulationDialog(getActiveEntryDate());
      simulationDialog.showModal();
    });
  }

  if (simulationDialogClose && simulationDialog) {
    simulationDialogClose.addEventListener("click", () => simulationDialog.close());
    simulationDialog.addEventListener("click", (event) => {
      if (event.target === simulationDialog) simulationDialog.close();
    });
  }

  function getActiveEntryDate() {
    const dateField = form.elements.namedItem("entry_date");
    return dateField?.value || getTodayIsoDate();
  }

  async function refreshEntries(options = {}) {
    const {
      showMessage = true,
      runAutoCreate = false,
      forceCreate = false,
      entryDate = getActiveEntryDate(),
      selectCurrentDay = false
    } = options;
    const state = await loadFirestoreState(db);
    entriesPageState.config = mergeConfig(state.config);
    const readOnlyConnection = state.connection === "rest";
    const sunrunSync = readOnlyConnection
      ? { entries: state.entries, updated: false, count: 0 }
      : await syncSunrunProductionIntoEntries(db, state.entries);
    let entries = sunrunSync.updated ? sunrunSync.entries : state.entries;
    let autoCreateMessage = "";

    if (runAutoCreate && !readOnlyConnection) {
      const result = await ensureDailyPlaceholderRecord(db, entries, {
        forceCreate,
        entryDate,
        sourceLabel: forceCreate ? "Add Daily Entry" : "7:30 AM auto-create"
      });
      if (result.created) {
        const refreshedState = await loadFirestoreState(db);
        entries = refreshedState.entries;
        autoCreateMessage = `Created placeholder record for ${result.entry.entry_date}.`;
        fillEntryForm(getEntryByDate(result.entry.entry_date) || result.entry);
      } else if (result.entry && forceCreate) {
        fillEntryForm(result.entry);
        autoCreateMessage = `Opened existing record for ${result.entry.entry_date}.`;
      }
    }

    populateEntriesTable(entries);
    saveEntriesSnapshot(entries, entriesPageState.config);
    setEntriesFirebaseStatus("connected", readOnlyConnection ? "Firebase: Connected · HTTPS live read" : "Firebase: Connected · Live Data");

    if (selectCurrentDay || !entriesPageState.selectedDate) {
      const todayEntry = entries.find((entry) => entry.entry_date === getTodayIsoDate());
      if (todayEntry) fillEntryForm(todayEntry);
    }

    if (showMessage) {
      const message = autoCreateMessage || "Entry data refreshed from Firebase Firestore.";
      renderStatusAlert("entries-status", message, "success");
    }
  }

  window.addEventListener("solar-entry-restored", () => {
    refreshEntries({ showMessage: false });
  });

  function startDailyEntryAutoCreateWatcher() {
    if (dailyEntryAutoCreateTimer) return;
    dailyEntryAutoCreateTimer = window.setInterval(async () => {
      const today = getTodayIsoDate();
      if (!isAtOrAfterAutoCreateTime() || entriesPageState.entries.some(
        (entry) => String(entry.entry_date) === String(today)
      )) {
        return;
      }
      try {
        await refreshEntries({
          showMessage: true,
          runAutoCreate: true,
          forceCreate: false,
          entryDate: today
        });
      } catch (error) {
        console.warn("Daily Historical Entry auto-create check failed.", error);
      }
    }, 60_000);
  }

  window.addEventListener("solar-meter-simulation-saved", (event) => {
    const savedEntry = normalizeEntry(event.detail?.entry || {});
    if (!savedEntry.entry_date) return;
    const existingIndex = entriesPageState.entries.findIndex(
      (entry) => String(entry.entry_date) === String(savedEntry.entry_date)
    );
    if (existingIndex >= 0) {
      entriesPageState.entries[existingIndex] = savedEntry;
    } else {
      entriesPageState.entries.push(savedEntry);
    }
    entriesPageState.entries = sortEntries(entriesPageState.entries);
    populateEntriesTable(entriesPageState.entries);
    if (String(getActiveEntryDate()) === String(savedEntry.entry_date)) {
      fillEntryForm(savedEntry);
    }
    if (event.detail?.updated) {
      renderStatusAlert(
        "entries-status",
        `Meter Simulation recorded the ${savedEntry.meter_simulation_run_label}: M01 ${savedEntry.meter_01_import_reading.toFixed(1)}, M02 ${savedEntry.meter_02_export_reading.toFixed(1)}.`,
        "success"
      );
    }
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const existingEntry = getEntryByDate(formData.get("entry_date"));
    const entry = {
      entry_date: formData.get("entry_date"),
      irradiance_peak_wm2: Number(formData.get("irradiance_peak_wm2") || 0),
      production_kwh: Number(formData.get("production_kwh") || 0),
      // Meter values are authored only by the reviewed NYSEG interval import.
      // Keep any validated readings intact when the rest of a daily record is saved.
      meter_01_import_reading: Number(existingEntry?.meter_01_import_reading || 0),
      meter_02_export_reading: Number(existingEntry?.meter_02_export_reading || 0),
      weather: formData.get("weather") || "Unknown",
      temperature_f: formData.get("temperature_f") ? Number(formData.get("temperature_f")) : null,
      temperature_high_f: formData.get("temperature_high_f") ? Number(formData.get("temperature_high_f")) : null,
      temperature_low_f: formData.get("temperature_low_f") ? Number(formData.get("temperature_low_f")) : null,
      humidity_pct: formData.get("humidity_pct") ? Number(formData.get("humidity_pct")) : null,
      cloud_cover_pct: formData.get("cloud_cover_pct") ? Number(formData.get("cloud_cover_pct")) : null,
      wind_mph: formData.get("wind_mph") ? Number(formData.get("wind_mph")) : null,
      sunrise_time: existingEntry?.sunrise_time || "",
      sunset_time: existingEntry?.sunset_time || "",
      notes: formData.get("notes") || "",
      notes_manual: true,
      estimated: false,
      lookup_source: "manual",
      irradiance_method: existingEntry?.irradiance_method || "",
      irradiance_verified_at: existingEntry?.irradiance_verified_at || "",
      irradiance_hourly_profile: existingEntry?.irradiance_hourly_profile || [],
      meter_values_estimated: false,
      meter_values_confirmed: Boolean(existingEntry?.meter_values_confirmed),
      meter_values_calibrated: false,
      created_at: existingEntry?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    const sunrunRecord = getSunrunProductionRecord(entry.entry_date);
    if (sunrunRecord?.available) {
      entry.production_kwh = Number(sunrunRecord.production_kwh || entry.production_kwh || 0);
    }
    await setDoc(doc(db, entryCollectionName, entry.entry_date), entry, { merge: true });
    entriesPageState.selectedDate = entry.entry_date;
    await refreshEntries({ showMessage: false });
    fillEntryForm(entry);
    renderStatusAlert(
      "entries-status",
      `${existingEntry ? "Updated" : "Saved"} ${entry.entry_date}. M01/M02 remain managed by the validated NYSEG file import.`,
      "success"
    );
  });

  if (clearButton) {
    clearButton.addEventListener("click", () => {
      form.reset();
      fillEntryForm();
    });
  }

  if (refreshButton) {
    refreshButton.addEventListener("click", async () => {
      const entryDate = getActiveEntryDate();
      const currentNotes = form.elements.namedItem("notes")?.value ?? null;
      await refreshEntries({
        showMessage: false,
        runAutoCreate: true,
        forceCreate: false,
        entryDate
      });
      const refreshedEntry = await refreshEntryLookupFields(db, entryDate, { notesOverride: currentNotes });
      await refreshEntries({ showMessage: false });
      fillEntryForm(refreshedEntry);
      renderStatusAlert("entries-status", `Refreshed Open-Meteo lookup values for ${entryDate}.`, "success");
    });
  }

  if (autoCreateButton) {
    autoCreateButton.addEventListener("click", async () => {
      await refreshEntries({
        showMessage: true,
        runAutoCreate: true,
        forceCreate: true,
        entryDate: getActiveEntryDate()
      });
    });
  }

  if (meterSimulationButton) {
    meterSimulationButton.addEventListener("click", async () => {
      const entryDate = getActiveEntryDate();
      const simulation = renderMeterSimulation(entryDate, { autoApply: true });
      if (!simulation) return;
      const savedEntry = await persistMeterSimulation(
        db,
        entryDate,
        simulation,
        entriesPageState.entries,
        { force: true }
      );
      if (savedEntry) {
        const existingIndex = entriesPageState.entries.findIndex(
          (entry) => String(entry.entry_date) === String(entryDate)
        );
        if (existingIndex >= 0) {
          entriesPageState.entries[existingIndex] = savedEntry;
        } else {
          entriesPageState.entries.push(savedEntry);
        }
        entriesPageState.entries = sortEntries(entriesPageState.entries);
        populateEntriesTable(entriesPageState.entries);
        fillEntryForm(savedEntry);
      }
      renderStatusAlert(
        "entries-status",
        `Applied and saved weather-adjusted simulated readings for ${entryDate}: M01 ${simulation.currentImport.toFixed(1)}, M02 ${simulation.currentExport.toFixed(1)}. Manual form submission will confirm and lock them.`,
        "success"
      );
    });
  }

  function refreshCheckpointPrediction() {
    if (!checkpointTime || !checkpointPredictedM01 || !checkpointPredictedM02) return;
    const minuteOfDay = parseCheckpointTime(checkpointTime.value);
    if (minuteOfDay === null) return;
    const simulation = buildMeterSimulation(
      getActiveEntryDate(),
      entriesPageState.entries,
      { minuteOfDay }
    );
    checkpointPredictedM01.value = simulation.currentImport.toFixed(1);
    checkpointPredictedM02.value = simulation.currentExport.toFixed(1);
  }

  if (checkpointTime) {
    checkpointTime.value = formatCheckpointTime(getClockMinutes());
    checkpointTime.addEventListener("change", refreshCheckpointPrediction);
  }
  if (meterPhotoM01) meterPhotoM01.addEventListener("change", () => readMeterPhoto(meterPhotoM01.files?.[0], checkpointActualM01, checkpointPredictedM01, "M01"));
  if (meterPhotoM02) meterPhotoM02.addEventListener("change", () => readMeterPhoto(meterPhotoM02.files?.[0], checkpointActualM02, checkpointPredictedM02, "M02"));
  if (quickMeterPhotoM01) quickMeterPhotoM01.addEventListener("change", () => readMeterPhoto(quickMeterPhotoM01.files?.[0], checkpointActualM01, checkpointPredictedM01, "M01"));
  if (quickMeterPhotoM02) quickMeterPhotoM02.addEventListener("change", () => readMeterPhoto(quickMeterPhotoM02.files?.[0], checkpointActualM02, checkpointPredictedM02, "M02"));
  if (quickMeterPhotoSave) quickMeterPhotoSave.addEventListener("click", () => checkpointButton?.click());
  updateQuickMeterPhotoStatus();

  if (checkpointButton) {
    checkpointButton.addEventListener("click", async () => {
      const entryDate = getActiveEntryDate();
      const minuteOfDay = parseCheckpointTime(checkpointTime?.value);
      const predictedM01 = Number(checkpointPredictedM01?.value);
      const predictedM02 = Number(checkpointPredictedM02?.value);
      const actualM01 = Number(checkpointActualM01?.value);
      const actualM02 = Number(checkpointActualM02?.value);
      if (
        minuteOfDay === null ||
        ![predictedM01, predictedM02, actualM01, actualM02].every(Number.isFinite)
      ) {
        renderStatusAlert(
          "entries-status",
          "Enter the checkpoint time, simulated M01/M02, and actual M01/M02 readings.",
          "warning"
        );
        return;
      }
      const priorEntry = getMostRecentEntryBefore(sortEntries(entriesPageState.entries), entryDate);
      if (
        priorEntry &&
        (actualM01 < Number(priorEntry.meter_01_import_reading || 0) ||
          actualM02 < Number(priorEntry.meter_02_export_reading || 0))
      ) {
        renderStatusAlert(
          "entries-status",
          "Checkpoint rejected because a cumulative meter reading cannot be lower than the prior confirmed reading. Recheck the photos and meter values.",
          "warning"
        );
        return;
      }
      const largeModelCorrection = Math.abs(actualM01 - predictedM01) > 75 || Math.abs(actualM02 - predictedM02) > 150;
      if (largeModelCorrection && !window.confirm(
        `These verified readings differ substantially from the simulation. Save M01 ${actualM01.toFixed(1)} and M02 ${actualM02.toFixed(1)} as the new calibration anchor?`
      )) return;

      const selectedEntry = getEntryByDate(entryDate);
      const checkpointSimulation = buildMeterSimulation(
        entryDate,
        entriesPageState.entries,
        { minuteOfDay }
      );
      const checkpointRecordedAt = new Date().toISOString();
      const checkpoint = {
        entry_date: entryDate,
        checkpoint_time: checkpointTime.value,
        minute_of_day: minuteOfDay,
        weather_bucket: normalizeWeatherBucket(selectedEntry?.weather),
        predicted_m01: predictedM01,
        predicted_m02: predictedM02,
        actual_m01: actualM01,
        actual_m02: actualM02,
        base_m01: checkpointSimulation.baseImport,
        base_m02: checkpointSimulation.baseExport,
        irradiance_peak_wm2: checkpointSimulation.currentIrradiance,
        cloud_cover_pct: parseOptionalNumber(selectedEntry?.cloud_cover_pct),
        humidity_pct: parseOptionalNumber(selectedEntry?.humidity_pct),
        import_error: Number((actualM01 - checkpointSimulation.rawCurrentImport).toFixed(1)),
        export_error: Number((actualM02 - checkpointSimulation.rawCurrentExport).toFixed(1)),
        recorded_at: checkpointRecordedAt
      };
      const retained = meterSimulationCheckpoints.filter((existing) => !(
        existing.entry_date === checkpoint.entry_date &&
        existing.checkpoint_time === checkpoint.checkpoint_time
      ));
      meterSimulationCheckpoints = normalizeMeterSimulationCheckpoints([...retained, checkpoint]);
      renderCalibrationHistory();
      await setDoc(
        doc(db, configCollectionName, configDocumentId),
        { meter_simulation_checkpoints: meterSimulationCheckpoints },
        { merge: true }
      );
      const latestDueRun = getLatestDueMeterSimulationRun();
      meterSimulationLastAttemptedRunKey = latestDueRun
        ? `${getTodayIsoDate()}T${String(Math.floor(latestDueRun.minuteOfDay / 60)).padStart(2, "0")}:${String(latestDueRun.minuteOfDay % 60).padStart(2, "0")}`
        : "";

      renderMeterSimulation(entryDate, { autoApply: true });

      // A calibration reading is an observed meter value, so it becomes the
      // latest source-of-truth reading for the selected Historical Entry.
      const isCurrentDayCheckpoint = String(entryDate) === String(getTodayIsoDate());
      const afterSunset = minuteOfDay >= getSolarWindow(selectedEntry || {}).sunsetMinute;
      const lockVerifiedReading = !isCurrentDayCheckpoint || afterSunset;
      const savedEntry = normalizeEntry({
        ...selectedEntry,
        entry_date: entryDate,
        meter_01_import_reading: actualM01,
        meter_02_export_reading: actualM02,
        meter_values_estimated: !lockVerifiedReading,
        meter_values_confirmed: lockVerifiedReading,
        meter_values_calibrated: true,
        meter_simulation_updated_at: checkpointRecordedAt,
        updated_at: checkpointRecordedAt
      });
      await setDoc(doc(db, entryCollectionName, entryDate), savedEntry, { merge: true });
      const savedIndex = entriesPageState.entries.findIndex(
        (entry) => String(entry.entry_date) === String(entryDate)
      );
      if (savedIndex >= 0) {
        entriesPageState.entries[savedIndex] = savedEntry;
      } else {
        entriesPageState.entries.push(savedEntry);
      }
      populateEntriesTable(entriesPageState.entries);
      if (savedEntry) {
        fillEntryForm(savedEntry);
      }
      renderStatusAlert(
        "entries-status",
        `Calibration checkpoint updated for ${entryDate} at ${checkpoint.checkpoint_time}: M01 is now ${actualM01.toFixed(1)} (Sim M01 before update: ${predictedM01.toFixed(1)}) and M02 is now ${actualM02.toFixed(1)} (Sim M02 before update: ${predictedM02.toFixed(1)}).${lockVerifiedReading ? " This verified reading is locked and will not be replaced by another simulation." : " Today remains simulation-managed and will update at the next hourly run."}`,
        "success"
      );
    });
  }

  if (dateField) {
    dateField.addEventListener("change", () => {
      const selectedEntry = getEntryByDate(dateField.value);
      if (selectedEntry) {
        selectHistoricalEntry(dateField.value, { scrollForm: false });
        window.setTimeout(refreshCheckpointPrediction, 0);
      } else {
        entriesPageState.selectedDate = dateField.value;
        setEntryFormMode(`Creating record for ${dateField.value}.`, "Save Entry");
        renderMeterSimulation(dateField.value, {
          autoApply: String(dateField.value) === String(getTodayIsoDate())
        });
        populateEntriesTable(entriesPageState.entries);
        window.setTimeout(refreshCheckpointPrediction, 0);
      }
    });
  }

  window.setTimeout(refreshCheckpointPrediction, 0);
  startDailyEntryAutoCreateWatcher();

  return { refreshEntries };
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
    const fileThroughDate = getDashboardFileThroughDate();
    await renderDashboardUnified(
      state.entries,
      state.config,
      buildStatus(
        fileThroughDate
          ? `Dashboard calculations use matching SunRun and NYSEG downloaded-file data through ${fileThroughDate}. The two most recent reporting days are excluded until both files publish final data.`
          : "Dashboard is waiting for matching SunRun and NYSEG downloaded-file data before calculating metrics.",
        fileThroughDate ? "success" : "warning",
        !fileThroughDate
      )
    );
  } catch (error) {
    await renderDashboardUnified(
      sampleEntries,
      mergeConfig(),
      buildStatus(
        "Live Firebase data could not load, so this dashboard is showing its bundled snapshot. Refresh to try again; this view will not include recent Data Entry updates.",
        "warning",
        true
      )
    );
  }
}

function buildNysegMeterImportPreview(entries, dailyIntervals) {
  const entryByDate = new Map((entries || []).map((entry) => [entry.entry_date, entry]));
  const updates = [];
  const hasConfirmedAnchor = (entries || []).some((entry) => entry.meter_values_confirmed === true);
  let anchor = null;
  for (const interval of dailyIntervals || []) {
    const entry = entryByDate.get(interval.date);
    // A browser occasionally receives an older payload without the confirmation
    // flag. In that case, use the existing cumulative rows as anchors rather
    // than presenting a misleading zero-row review.
    if (entry?.meter_values_confirmed === true || (!hasConfirmedAnchor && entry)) {
      anchor = { m01: Number(entry.meter_01_import_reading), m02: Number(entry.meter_02_export_reading), date: interval.date };
      continue;
    }
    if (!anchor) continue;
    anchor = { m01: anchor.m01 + Number(interval.import_kwh || 0), m02: anchor.m02 + Number(interval.export_kwh || 0), date: interval.date };
    // NYSEG may cover days that Data Entry has not created yet. Include those
    // days in the review so the utility file can fill the gap from the latest
    // confirmed cumulative reading.
    updates.push({
      entry: entry || null,
      isNew: !entry,
      date: interval.date,
      m01: Number(anchor.m01.toFixed(1)),
      m02: Number(anchor.m02.toFixed(1)),
      importKwh: Number(interval.import_kwh || 0),
      exportKwh: Number(interval.export_kwh || 0)
    });
  }
  return updates;
}

function openNysegMeterImportPreview(db, updates, sourceStart, sourceEnd, { beforeApply = null, onApplied = null } = {}) {
  document.querySelector(".nyseg-meter-import-popout")?.remove();
  const shell = document.createElement("div");
  shell.className = "calibration-v2-popout-shell nyseg-meter-import-popout";
  const createdCount = updates.filter((item) => item.isNew).length;
  const rows = updates.map((item) => `<tr><td>${item.date}</td><td>${item.productionKwh == null ? "—" : `${item.productionKwh.toFixed(1)} kWh`}</td><td>${item.isNew ? "New" : `${item.entry.meter_01_import_reading.toFixed(1)} →`} <strong>${item.m01.toFixed(1)}</strong></td><td>${item.isNew ? "New" : `${item.entry.meter_02_export_reading.toFixed(1)} →`} <strong>${item.m02.toFixed(1)}</strong></td><td>+${item.importKwh.toFixed(1)} / +${item.exportKwh.toFixed(1)} kWh</td></tr>`).join("");
  shell.innerHTML = `<div class="calibration-v2-popout-backdrop" data-nyseg-import-close></div><section class="calibration-v2-popout-dialog" role="dialog" aria-modal="true"><div class="calibration-v2-heading mb-3"><div><p class="eyebrow mb-1">Review utility meter import</p><h3>NYSEG-derived M01/M02 updates</h3><p>Utility intervals from ${escapeHtml(sourceStart)} through ${escapeHtml(sourceEnd)} are converted to cumulative meter readings from the verified Firebase anchor. Confirmed manual rows are not changed.</p></div><button type="button" class="btn btn-contract btn-sm" data-nyseg-import-close>Close</button></div><p class="calibration-v2-note mt-0"><strong>${updates.length} daily record${updates.length === 1 ? "" : "s"} will be applied${createdCount ? `; ${createdCount} missing row${createdCount === 1 ? "" : "s"} will be created` : ""}.</strong> SunRun Production is read from the daily SunRun file. M01 uses NYSEG Delivered energy; M02 uses NYSEG Received energy. Review these values before applying.</p><div class="table-responsive"><table class="table table-sm align-middle"><thead><tr><th>Date</th><th>SunRun production</th><th>M01 current → utility</th><th>M02 current → utility</th><th>Daily intervals</th></tr></thead><tbody>${rows || '<tr><td colspan="5" class="text-muted">No days can be derived because the file has no confirmed reading anchor.</td></tr>'}</tbody></table></div><div class="d-flex justify-content-end gap-2 mt-3"><button type="button" class="btn btn-contract" data-nyseg-import-close>Cancel</button><button type="button" class="btn btn-sun" data-nyseg-import-apply ${updates.length ? "" : "disabled"}>Apply utility readings</button></div></section>`;
  const close = () => shell.remove();
  shell.querySelectorAll("[data-nyseg-import-close]").forEach((button) => button.addEventListener("click", close));
  shell.querySelector("[data-nyseg-import-apply]")?.addEventListener("click", async () => {
    const applyButton = shell.querySelector("[data-nyseg-import-apply]");
    applyButton.disabled = true; applyButton.textContent = "Applying…";
    try {
      if (beforeApply) await beforeApply(updates);
      // The local server recomputes the reviewed preview and confirms the
      // write, so browser cache or an interrupted Firestore transaction
      // cannot leave the user unsure whether the import was applied.
      const response = await fetch("/api/nyseg-meter-intervals/apply", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The NYSEG utility readings could not be saved.");
      const savedCount = Number(result.saved || 0);
      const message = `NYSEG utility readings were saved for ${savedCount} day${savedCount === 1 ? "" : "s"}. The Daily Entry records now contain the reviewed M01/M02 values.`;
      if (onApplied) onApplied(message);
      else renderStatusAlert("entries-status", message, "success");
      shell.innerHTML = `<div class="calibration-v2-popout-backdrop"></div><section class="calibration-v2-popout-dialog" role="dialog" aria-modal="true"><div class="calibration-v2-heading"><div><p class="eyebrow mb-1">NYSEG import complete</p><h3>${savedCount} daily record${savedCount === 1 ? "" : "s"} saved</h3><p>${escapeHtml(message)}</p></div></div><div class="d-flex justify-content-end mt-3"><button type="button" class="btn btn-sun" data-nyseg-import-finish>View updated data</button></div></section>`;
      shell.querySelector("[data-nyseg-import-finish]")?.addEventListener("click", () => window.location.reload());
    } catch (error) { applyButton.disabled = false; applyButton.textContent = "Apply utility readings"; renderStatusAlert("entries-status", `Could not apply the utility readings: ${error.message || error}`, "danger"); }
  });
  document.body.appendChild(shell);
}

function nysegMeterBackup(entries, updates = null) {
  const dates = updates ? new Set(updates.map((item) => item.date)) : null;
  return (entries || []).filter((entry) => !dates || dates.has(entry.entry_date)).map((entry) => ({
    entry_date: entry.entry_date,
    meter_01_import_reading: Number(entry.meter_01_import_reading || 0),
    meter_02_export_reading: Number(entry.meter_02_export_reading || 0),
    meter_values_confirmed: Boolean(entry.meter_values_confirmed),
    meter_values_estimated: Boolean(entry.meter_values_estimated),
    meter_values_calibrated: Boolean(entry.meter_values_calibrated),
    estimated: Boolean(entry.estimated),
    lookup_source: entry.lookup_source || "",
    notes: entry.notes || "",
    notes_manual: Boolean(entry.notes_manual)
  }));
}

async function saveNysegMeterBackup(db, entries, updates = null) {
  const rows = nysegMeterBackup(entries, updates);
  if (!rows.length) throw new Error("There are no M01/M02 readings available to back up.");
  const recordedAt = new Date().toISOString();
  await setDoc(doc(db, configCollectionName, configDocumentId), {
    nyseg_meter_import_backup: { recorded_at: recordedAt, rows }
  }, { merge: true });
  return { recordedAt, count: rows.length };
}

async function setupNysegUsageFileActions(db) {
  const importButton = document.getElementById("nyseg-file-import");
  const useDownloadButton = document.getElementById("nyseg-file-use-download");
  const runSyncButton = document.getElementById("nyseg-file-run-sync");
  const processSavedButton = document.getElementById("nyseg-file-process-saved");
  const stopSyncButton = document.getElementById("nyseg-file-stop-sync");
  const backupButton = document.getElementById("nyseg-file-backup");
  const restoreButton = document.getElementById("nyseg-file-restore");
  const advancedControls = document.getElementById("nyseg-file-advanced-controls");
  const controlsToggle = document.getElementById("nyseg-file-toggle-controls");
  const status = document.getElementById("nyseg-file-action-status");
  if (!importButton && !useDownloadButton && !runSyncButton && !processSavedButton && !stopSyncButton && !backupButton && !restoreButton) return;
  const show = (message, kind = "info") => {
    if (!status) return;
    status.className = `small mt-2 mb-0 text-${kind === "danger" ? "danger" : kind === "success" ? "success" : "muted"}`;
    status.textContent = message;
  };
  const setAdvancedControls = (expanded) => {
    if (advancedControls) advancedControls.hidden = !expanded;
    if (controlsToggle) {
      controlsToggle.setAttribute("aria-expanded", String(expanded));
      controlsToggle.textContent = expanded ? "Hide tools" : "More tools";
    }
  };
  if (controlsToggle) controlsToggle.addEventListener("click", () => setAdvancedControls(advancedControls?.hidden));
  if (isStaticSite()) {
    [importButton, useDownloadButton, runSyncButton, processSavedButton, stopSyncButton, backupButton, restoreButton].filter(Boolean).forEach((button) => {
      button.disabled = true;
      button.title = "These actions require the private NYSEG CSV in the local tracker.";
    });
    show("M01/M02 import and restore are available in the local tracker, where the private NYSEG CSV is stored.");
    return;
  }
  let state;
  try {
    state = await loadFirestoreState(db);
  } catch (error) {
    show("Firebase could not load the current M01/M02 readings. Refresh and try again.", "danger");
    return;
  }
  const backup = state.config?.nyseg_meter_import_backup;
  if (backup?.recorded_at) show(`Latest backup: ${backup.rows?.length || 0} readings saved ${new Date(backup.recorded_at).toLocaleString()}.`);
  if (useDownloadButton) useDownloadButton.addEventListener("click", async () => {
    useDownloadButton.disabled = true;
    const original = useDownloadButton.textContent;
    useDownloadButton.textContent = "Processing download…";
    try {
      const response = await fetch("/api/nyseg-downloads/latest", { method: "POST" });
      const body = await response.text();
      let result;
      try { result = JSON.parse(body); }
      catch (_) { throw new Error(response.ok ? "The local tracker returned an invalid response. Refresh the page and try again." : `The local tracker returned an outdated response (${response.status}). Restart the local tracker, refresh this page, and try again.`); }
      if (!response.ok) throw new Error(result.error || "The NYSEG download could not be processed.");
      show(`${result.filename} was validated and added to the tracker (${Number(result.rows || 0).toLocaleString()} intervals). Review and apply the latest M01/M02 readings next.`, "success");
      window.setTimeout(() => window.location.reload(), 900);
    } catch (error) { show(`Could not process the latest NYSEG download: ${error.message || error}`, "danger"); }
    finally { useDownloadButton.disabled = false; useDownloadButton.textContent = original; }
  });
  if (runSyncButton) runSyncButton.addEventListener("click", async () => {
    runSyncButton.disabled = true;
    const original = runSyncButton.textContent;
    runSyncButton.textContent = "Starting…";
    try {
      setAdvancedControls(true);
      const activity = document.getElementById("nyseg-sync-log-lines");
      const syncStatus = document.getElementById("nyseg-sync-status");
      if (activity) activity.textContent = "Starting NYSEG_File_Download_Test.py…";
      if (syncStatus) { syncStatus.className = "small mb-0 text-primary"; syncStatus.textContent = "NYSEG_File_Download_Test.py is running. New activity is shown below."; }
      const response = await fetch("/api/nyseg-daily-sync/run", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The NYSEG sync could not start.");
      show("NYSEG_File_Download_Test.py started. This page will refresh automatically when it finishes.", "success");
    } catch (error) {
      show(`Could not start NYSEG Manual Run: ${error.message || error}`, "danger");
      runSyncButton.disabled = false;
      runSyncButton.textContent = original;
    }
  });
  if (processSavedButton) processSavedButton.addEventListener("click", async () => {
    processSavedButton.disabled = true;
    const original = processSavedButton.textContent;
    processSavedButton.textContent = "Processing…";
    try {
      setAdvancedControls(true);
      const activity = document.getElementById("nyseg-sync-log-lines");
      const syncStatus = document.getElementById("nyseg-sync-status");
      if (activity) activity.textContent = "Starting validation and Firebase update from the saved NYSEG CSV…";
      if (syncStatus) { syncStatus.className = "small mb-0 text-primary"; syncStatus.textContent = "Processing the saved NYSEG CSV: validating M01/M02 and updating Firebase, dashboards, history, email, and housekeeping."; }
      const response = await fetch("/api/nyseg-daily-sync/process-saved-file", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The saved NYSEG CSV could not be processed.");
      show("Saved NYSEG CSV processing started. This page will confirm the successful Firebase update when it finishes.", "success");
    } catch (error) {
      show(`Could not process the saved NYSEG CSV: ${error.message || error}`, "danger");
      processSavedButton.disabled = false;
      processSavedButton.textContent = original;
    }
  });
  if (stopSyncButton) stopSyncButton.addEventListener("click", async () => {
    stopSyncButton.disabled = true;
    try {
      const response = await fetch("/api/nyseg-daily-sync/stop", { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "The NYSEG sync could not be stopped.");
      const activity = document.getElementById("nyseg-sync-log-lines");
      const syncStatus = document.getElementById("nyseg-sync-status");
      if (activity) activity.textContent = "NYSEG daily sync stopped by user.";
      if (syncStatus) { syncStatus.className = "small mb-0 text-muted"; syncStatus.textContent = "NYSEG sync was stopped."; }
      if (runSyncButton) { runSyncButton.disabled = false; runSyncButton.textContent = "Manual Run"; }
      if (processSavedButton) { processSavedButton.disabled = false; processSavedButton.textContent = "Process Saved File"; }
      show("NYSEG sync stopped. You can start a new run when ready.", "success");
    } catch (error) {
      show(`Could not stop the NYSEG sync: ${error.message || error}`, "danger");
    } finally { stopSyncButton.disabled = false; }
  });
  if (backupButton) backupButton.addEventListener("click", async () => {
    backupButton.disabled = true;
    try {
      const saved = await saveNysegMeterBackup(db, state.entries);
      show(`Backup saved: ${saved.count} M01/M02 readings at ${new Date(saved.recordedAt).toLocaleString()}.`, "success");
    } catch (error) { show(`Could not save backup: ${error.message || error}`, "danger"); }
    finally { backupButton.disabled = false; }
  });
  if (restoreButton) restoreButton.addEventListener("click", async () => {
    const current = await loadFirestoreState(db);
    const savedBackup = current.config?.nyseg_meter_import_backup;
    const rows = savedBackup?.rows || [];
    if (!rows.length) { show("No M01/M02 backup has been saved yet.", "danger"); return; }
    if (!window.confirm(`Restore ${rows.length} backed-up M01/M02 readings saved ${new Date(savedBackup.recorded_at).toLocaleString()}?`)) return;
    restoreButton.disabled = true;
    try {
      for (const row of rows) await setDoc(doc(db, entryCollectionName, row.entry_date), { ...row, updated_at: new Date().toISOString() }, { merge: true });
      show(`Restored ${rows.length} M01/M02 readings from the saved backup.`, "success");
    } catch (error) { show(`Could not restore backup: ${error.message || error}`, "danger"); }
    finally { restoreButton.disabled = false; }
  });
  if (importButton) importButton.addEventListener("click", async () => {
    importButton.disabled = true;
    const original = importButton.textContent;
    importButton.textContent = "Preparing review…";
    try {
      const response = await fetch("/api/nyseg-meter-intervals");
      const payload = await response.json();
      if (!response.ok || !payload.available) throw new Error("The local NYSEG interval file is unavailable.");
      // The local server verifies the last cumulative meter row in Firebase.
      // Prefer that anchor when a browser payload is stale or incomplete.
      const previewEntries = payload.anchor
        ? [
          ...state.entries.filter((entry) => entry.entry_date !== payload.anchor.entry_date),
          payload.anchor
        ]
        : state.entries;
      const updates = Array.isArray(payload.preview) && payload.preview.length
        ? payload.preview.map((item) => ({
          entry: previewEntries.find((entry) => entry.entry_date === item.date) || null,
          isNew: Boolean(item.is_new) || !previewEntries.some((entry) => entry.entry_date === item.date),
          date: item.date,
          m01: Number(item.m01), m02: Number(item.m02),
          importKwh: Number(item.import_kwh || 0), exportKwh: Number(item.export_kwh || 0),
          productionKwh: item.production_kwh == null ? null : Number(item.production_kwh)
        }))
        : buildNysegMeterImportPreview(previewEntries, payload.daily);
      openNysegMeterImportPreview(db, updates, payload.source_start, payload.source_end, {
        beforeApply: async () => {
          const fresh = await loadFirestoreState(db);
          const saved = await saveNysegMeterBackup(db, fresh.entries);
          show(`Backup saved for ${saved.count} existing reading${saved.count === 1 ? "" : "s"}; applying reviewed utility values.`, "success");
        },
        onApplied: (message) => show(message, "success")
      });
    } catch (error) { show(`Could not prepare the NYSEG import: ${error.message || error}`, "danger"); }
    finally { importButton.disabled = false; importButton.textContent = original; }
  });
}

function setupNysegMeterImport(db) {
  const button = document.getElementById("entry-nyseg-meter-preview");
  if (!button || button.dataset.ready === "true") return;
  button.dataset.ready = "true";
  if (isStaticSite()) {
    button.textContent = "Use local NYSEG import";
    button.title = "Download and apply NYSEG interval readings from the private local tracker.";
    button.addEventListener("click", () => {
      renderStatusAlert(
        "entries-status",
        "The mobile site includes the NYSEG file review, but applying new utility readings requires the private downloaded CSV in the local tracker. Download the file and use Review NYSEG meter import at http://127.0.0.1:5000/entries; the resulting M01/M02 readings then sync to Firebase for every device.",
        "info"
      );
    });
    return;
  }
  button.addEventListener("click", async () => {
    button.disabled = true; const initial = button.textContent; button.textContent = "Preparing preview…";
    try {
      const response = await fetch("/api/nyseg-meter-intervals");
      const payload = await response.json();
      if (!response.ok || !payload.available) throw new Error("The local NYSEG interval file is unavailable.");
      const updates = buildNysegMeterImportPreview(entriesPageState.entries, payload.daily);
      openNysegMeterImportPreview(db, updates, payload.source_start, payload.source_end);
    } catch (error) { renderStatusAlert("entries-status", `Could not prepare the NYSEG meter import: ${error.message || error}`, "warning"); }
    finally { button.disabled = false; button.textContent = initial; }
  });
}
async function bootEntries(db) {
  const entryTools = await handleEntryForm(db);
  setupNysegMeterImport(db);
  let state;
  try {
    state = await loadFirestoreState(db);
  } catch (error) {
    const snapshot = loadEntriesSnapshot();
    if (snapshot) {
      const entries = snapshot.entries.map(normalizeEntry);
      entriesPageState.config = mergeConfig(snapshot.config);
      populateEntriesTable(entries);
      fillEntryForm(entries.find((entry) => entry.entry_date === getTodayIsoDate()) || entries[entries.length - 1]);
      setEntriesFirebaseStatus("snapshot", `Firebase: Unavailable · Saved snapshot from ${formatEntriesSnapshotDate(snapshot)}`);
      renderStatusAlert("entries-status", "Live Firebase data is unavailable. The most recent local Data Entry JSON snapshot is shown; refresh when the connection returns before editing.", "warning");
    } else {
      populateEntriesTable(sampleEntries);
      fillEntryForm();
      setEntriesFirebaseStatus("unavailable", "Firebase: Unavailable · No saved snapshot");
      renderStatusAlert("entries-status", "Live Firebase data could not load and no local snapshot exists yet, so demo entries are shown. Refresh when the connection returns before editing.", "warning");
    }
    return;
  }

  const readOnlyConnection = state.connection === "rest";
  const entries = state.entries;
  entriesPageState.config = mergeConfig(state.config);
  await loadValidatedNysegThrough();
  populateEntriesTable(entries);
  fillEntryForm(entries.find((entry) => entry.entry_date === getTodayIsoDate()) || entries[entries.length - 1]);
  saveEntriesSnapshot(entries, entriesPageState.config);
  setEntriesFirebaseStatus("connected", readOnlyConnection ? "Firebase: Connected · HTTPS live read" : "Firebase: Connected · Live Data");

  // Automatic SunRun, weather, and meter processing is useful, but it must not
  // replace a successful live read with a snapshot if an individual write fails.
  try {
    await entryTools.refreshEntries({
      showMessage: false,
      runAutoCreate: !readOnlyConnection,
      forceCreate: false,
      entryDate: getTodayIsoDate(),
      selectCurrentDay: true
    });
    const url = new URL(window.location.href);
    if (url.searchParams.get("autocreate") === "1") {
      await entryTools.refreshEntries({ showMessage: true, runAutoCreate: !readOnlyConnection, forceCreate: true });
      url.searchParams.delete("autocreate");
      window.history.replaceState({}, "", url);
    }
  } catch (error) {
    console.warn("Data Entry automatic processing did not finish:", error);
    renderStatusAlert(
      "entries-status",
      "Live Firebase data is connected. Automatic meter or weather processing will retry on the next refresh.",
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
  setupValidatedLocalDashboardLinks(document);
  setupChartPopouts(document);

  if (getPageName() === "dashboard" && isLocalSnapshotMode()) {
    setupDashboardViewToggle();
    setupAiAssistant();
    setupChartPopouts(document);
    return;
  }

  let context;
  try {
    context = getFirebaseAppContext();
  } catch (error) {
    if (getPageName() === "dashboard") {
      await renderDashboardUnified(
        sampleEntries,
        mergeConfig(),
        buildStatus(
          "Firebase browser setup is incomplete, so the dashboard is staying in demo mode.",
          "warning",
          true
        )
      );
    } else if (getPageName() === "entries") {
      const snapshot = loadEntriesSnapshot();
      if (snapshot) {
        entriesPageState.config = mergeConfig(snapshot.config);
        const entries = snapshot.entries.map(normalizeEntry);
        populateEntriesTable(entries);
        fillEntryForm(entries.find((entry) => entry.entry_date === getTodayIsoDate()) || entries[entries.length - 1]);
        setEntriesFirebaseStatus("snapshot", `Firebase: Setup unavailable · Saved snapshot from ${formatEntriesSnapshotDate(snapshot)}`);
        renderStatusAlert("entries-status", "Firebase setup is unavailable. The local Data Entry JSON snapshot is shown.", "warning");
      } else {
        populateEntriesTable(sampleEntries);
        setEntriesFirebaseStatus("unavailable", "Firebase: Setup unavailable · No saved snapshot");
        renderStatusAlert("entries-status", "Firebase browser setup is incomplete and no local snapshot exists yet. Demo entries are shown.", "warning");
      }
    } else if (getPageName() === "settings") {
      populateSettingsForm(defaultConfig);
      renderStatusAlert("settings-status", "Firebase browser setup is incomplete. Default settings are shown.", "warning");
    }
    return;
  }

  startLocalSnapshotScheduler(context.db);
  if (getPageName() === "dashboard") {
    await bootDashboard(context.db);
    return;
  }
  if (getPageName() === "entries") {
    await bootEntries(context.db);
    return;
  }
  if (getPageName() === "nyseg-usage-file") {
    await setupNysegUsageFileActions(context.db);
    return;
  }
  if (getPageName() === "settings") {
    await bootSettings(context.db);
  }
}

bootPage();
