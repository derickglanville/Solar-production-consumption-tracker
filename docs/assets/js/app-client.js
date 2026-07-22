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
const dailyAutoCreateHour = 9;
const dailyAutoCreateMinute = 30;
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
    humidity_pct: 72,
    cloud_cover_pct: 85,
    wind_mph: 12,
    notes: "Estimated from Yorktown Heights forecast: overcast conditions with late thunderstorms expected. Update with actual production and meter readings when available."
  }
};

const bootstrap = window.SOLAR_BOOTSTRAP || {};
const sampleEntries = Array.isArray(bootstrap.sample_entries) ? bootstrap.sample_entries : [];
const defaultConfig = bootstrap.default_config || {};
const aiBootstrapStatus = bootstrap.ai_status || {};
const historicalUsageBootstrap = bootstrap.historical_usage || {};
const monthlyBillBootstrap = bootstrap.monthly_bill || {};
const dashboardCompactModeStorageKey = "solar-dashboard-compact-mode";
let entriesPageState = {
  entries: [],
  selectedDate: ""
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
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isAtOrAfterAutoCreateTime(now = new Date()) {
  const hours = now.getHours();
  const minutes = now.getMinutes();
  return hours > dailyAutoCreateHour || (hours === dailyAutoCreateHour && minutes >= dailyAutoCreateMinute);
}

function isPastIsoDate(entryDate) {
  return String(entryDate) < String(getTodayIsoDate());
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
    "temperature_2m",
    "relative_humidity_2m",
    "cloud_cover",
    "wind_speed_10m",
    "weather_code"
  ];
  const baseUrl = isPastIsoDate(entryDate)
    ? "https://archive-api.open-meteo.com/v1/archive"
    : "https://api.open-meteo.com/v1/forecast";

  const url = new URL(baseUrl);
  url.searchParams.set("latitude", String(yorktownHeightsLocation.latitude));
  url.searchParams.set("longitude", String(yorktownHeightsLocation.longitude));
  url.searchParams.set("hourly", hourlyFields.join(","));
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

  const shortwaveValues = matchingIndexes.map((index) => Number(hourly.shortwave_radiation?.[index] ?? 0));
  const temperatureValues = matchingIndexes.map((index) => Number(hourly.temperature_2m?.[index]));
  const humidityValues = matchingIndexes.map((index) => Number(hourly.relative_humidity_2m?.[index]));
  const cloudValues = matchingIndexes.map((index) => Number(hourly.cloud_cover?.[index]));
  const windValues = matchingIndexes.map((index) => Number(hourly.wind_speed_10m?.[index]));
  const daylightIndexes = matchingIndexes.filter((index) => Number(hourly.shortwave_radiation?.[index] ?? 0) > 0);
  const weatherIndexes = daylightIndexes.length ? daylightIndexes : matchingIndexes;
  const weatherLabels = weatherIndexes.map((index) => mapWeatherCodeToLabel(hourly.weather_code?.[index]));
  const peakIrradiance = Math.round(maxNumericValue(shortwaveValues) || 0);
  const sourceKind = isPastIsoDate(entryDate) ? "historical archive" : "forecast";

  return {
    irradiance_peak_wm2: peakIrradiance,
    weather: pickDominantWeatherLabel(weatherLabels),
    temperature_f: maxNumericValue(temperatureValues),
    humidity_pct: averageNumericValues(humidityValues),
    cloud_cover_pct: averageNumericValues(cloudValues),
    wind_mph: maxNumericValue(windValues),
    lookup_source: `open-meteo-${isPastIsoDate(entryDate) ? "historical" : "forecast"}`,
    notes: `Auto-filled from Open-Meteo ${sourceKind} data for ${yorktownHeightsLocation.label}. Irradiance is the day's peak hourly shortwave radiation.`
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

function normalizeEntry(entry) {
  return {
    entry_date: entry.entry_date,
    irradiance_peak_wm2: Number(entry.irradiance_peak_wm2 || 0),
    production_kwh: Number(entry.production_kwh || 0),
    meter_01_import_reading: Number(entry.meter_01_import_reading || 0),
    meter_02_export_reading: Number(entry.meter_02_export_reading || 0),
    weather: entry.weather || "Unknown",
    temperature_f: entry.temperature_f ?? null,
    humidity_pct: entry.humidity_pct ?? null,
    cloud_cover_pct: entry.cloud_cover_pct ?? null,
    wind_mph: entry.wind_mph ?? null,
    notes: entry.notes || "",
    estimated: Boolean(entry.estimated),
    lookup_source: entry.lookup_source || "",
    created_at: entry.created_at || "",
    updated_at: entry.updated_at || ""
  };
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
  const previousEntry = getMostRecentEntryBefore(entries, entryDate);
  if (!previousEntry) {
    return {
      irradiance_peak_wm2: 600,
      production_kwh: 42,
      weather: "Unknown",
      temperature_f: null,
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
  const app = initializeApp(config);
  const db = getFirestore(app);
  return { app, db };
}

async function loadFirestoreState(db) {
  const configSnapshot = await getDoc(doc(db, configCollectionName, configDocumentId));
  const config = configSnapshot.exists() ? mergeConfig(configSnapshot.data()) : mergeConfig();

  const entryQuery = query(collection(db, entryCollectionName), orderBy("entry_date"));
  const entrySnapshot = await getDocs(entryQuery);
  const entries = entrySnapshot.docs.map((docSnapshot) => normalizeEntry({
    entry_date: docSnapshot.data().entry_date || docSnapshot.id,
    ...docSnapshot.data()
  }));

  return {
    config,
    entries: sortEntries(entries)
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
  if (!sampleEntries.length || !looksLikeOnlyPlaceholderData(entries)) {
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
  const annualHomeUsage = Number(config.annual_home_usage_kwh || 17967);
  const baselineHomeUse = annualHomeUsage / 365;

  return sortEntries(entries).map((entry, index, list) => {
    const previous = index > 0 ? list[index - 1] : null;
    const currentDate = new Date(`${entry.entry_date}T00:00:00`);
    const month = currentDate.getMonth();
    const seasonalFactor = [11, 0, 1, 5, 6, 7].includes(month) ? 1.08 : 1;
    const weatherFactor = WEATHER_FACTORS[entry.weather] ?? 0.8;
    const estimatedDaytimeHouseUsage = Number((baselineHomeUse * seasonalFactor * weatherFactor).toFixed(2));
    const dailyImport = previous
      ? Math.max(0, Number(entry.meter_01_import_reading || 0) - Number(previous.meter_01_import_reading || 0))
      : 0;
    const dailyExport = previous
      ? Math.max(0, Number(entry.meter_02_export_reading || 0) - Number(previous.meter_02_export_reading || 0))
      : 0;
    const estimatedSelfConsumption = Math.min(Number(entry.production_kwh || 0), estimatedDaytimeHouseUsage);
    const totalHomeConsumption = estimatedSelfConsumption + dailyImport;
    const rollingWindow = list.slice(Math.max(0, index - 6), index + 1);

    return {
      ...entry,
      currentDate,
      daily_import_kwh: dailyImport,
      daily_export_kwh: dailyExport,
      estimated_daytime_house_usage_kwh: estimatedDaytimeHouseUsage,
      estimated_self_consumption_kwh: estimatedSelfConsumption,
      estimated_total_home_consumption_kwh: totalHomeConsumption,
      solar_offset_pct: totalHomeConsumption > 0 ? (estimatedSelfConsumption / totalHomeConsumption) * 100 : 0,
      rolling_7_day_prod: mean(rollingWindow.map((item) => Number(item.production_kwh || 0)))
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
      tree_payback_months: null
    };
  }

  const today = entries[entries.length - 1];
  const yesterday = entries.length > 1 ? entries[entries.length - 2] : today;
  const currentMonth = today.currentDate.getMonth();
  const trailingWeek = entries.slice(-7);
  const monthlyEntries = entries.filter((entry) => entry.currentDate.getMonth() === currentMonth);
  const avgDaily = mean(entries.map((entry) => Number(entry.production_kwh || 0)));
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
    tree_payback_months: treePaybackMonths
  };
}

function buildAlertsClient(entries, config) {
  if (!entries.length) return [];
  const latest = entries[entries.length - 1];
  const guarantee = Number(config.production_guarantee_kwh || 0);
  const guaranteedDaily = guarantee ? guarantee / 365 : 0;
  const alerts = [];

  if (latest.production_kwh < guaranteedDaily) alerts.push("Production below expected daily guarantee.");
  const recentImportMean = mean(entries.slice(-7).map((entry) => entry.daily_import_kwh));
  if (recentImportMean > 0 && latest.daily_import_kwh > recentImportMean * 1.5) {
    alerts.push("Large import increase detected versus recent average.");
  }
  if (latest.weather === "Sunny" && latest.daily_export_kwh <= 0) alerts.push("No exports recorded on a sunny day.");
  if (mean(entries.map((entry) => entry.production_kwh)) * 365 < guarantee) {
    alerts.push("Annual projection is below contract guarantee.");
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
  const billHref = isStaticSite() ? "NYSEG%20Bill/July%202027.pdf" : "/documents/nyseg-monthly-bill/view";
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
                <a class="btn btn-contract btn-sm" href="${billHref}">View Bill</a>
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

function renderDashboardHtmlClient(entries, metrics, config, firebaseStatus, alerts) {
  const recentEntries = [...entries].slice(-10).reverse();
  const summaryHref = isStaticSite() ? "contract-summary.html" : "/contract-summary";
  const contractHref = isStaticSite() ? "Documents/SunRun Solar Contract.pdf" : "/documents/sunrun-contract";
  const entriesHref = isStaticSite() ? "entries.html?autocreate=1" : "/entries?autocreate=1";
  const leftImageUrl = getAssetUrl("images/solar-home-side.png");
  const rightImageUrl = getAssetUrl("images/solar-farm-side.png");
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
          <div class="d-flex flex-wrap justify-content-between align-items-center gap-3">
            <div>
              <p class="eyebrow mb-2">Sunrun + NYSEG + Irradiance + Weather</p>
              <div class="d-flex flex-wrap align-items-center gap-2">
                <h1 class="hero-title mb-0">Solar performance and guarantee tracking</h1>
                <button type="button" class="btn btn-contract btn-sm" data-dashboard-view-toggle aria-pressed="false">Field Mode</button>
                <button type="button" class="btn btn-contract btn-sm" data-bs-toggle="modal" data-bs-target="#dashboardIntroModal">About</button>
              </div>
            </div>
            <div class="stat-callout">
              <span class="small-label">Annual Projection</span>
              <div class="callout-value">${formatNumber(metrics.annual_projection, 0, 0)} kWh</div>
              <div class="${metrics.projection_vs_guarantee_kwh >= 0 ? "text-success" : "text-danger"}">
                ${metrics.projection_vs_guarantee_kwh >= 0 ? "Ahead" : "Behind"} ${formatNumber(Math.abs(metrics.projection_vs_guarantee_kwh), 0, 0)} kWh (${formatNumber(Math.abs(metrics.projection_vs_guarantee_pct), 1, 1)}%)
              </div>
            </div>
          </div>
        </section>
        ${firebaseStatus?.message ? `<section class="mb-4"><div class="status-banner ${firebaseStatus.kind === "success" ? "status-banner-success" : ""}"><div><p class="status-title mb-1">${firebaseStatus.kind === "success" ? "Firebase connected" : "Firestore connection issue"}</p><p class="mb-0">${firebaseStatus.message}</p></div>${firebaseStatus.using_demo_data ? '<span class="status-pill">Showing demo data</span>' : ""}</div></section>` : ""}
        ${alerts.length ? `<section class="mb-4"><div class="card tracker-card"><div class="card-body"><h2 class="h5 mb-3">Alerts</h2><div class="d-flex flex-wrap gap-2">${alerts.map((alert) => `<span class="badge text-bg-warning p-2">${alert}</span>`).join("")}</div></div></div></section>` : ""}
        ${buildAiPanelHtml(dashboardAiState.openaiConfigured)}
        <section class="row g-3 mb-4">
          <div class="col-md-6 col-xl-3"><div class="metric-card sun"><span>Today's Production</span><strong>${formatNumber(metrics.today_production, 1, 1)} kWh</strong><small>Yesterday: ${formatNumber(metrics.yesterday_production, 1, 1)} kWh</small></div></div>
          <div class="col-md-6 col-xl-3"><div class="metric-card export"><span>Today's Export</span><strong>${formatNumber(metrics.today_export, 1, 1)} kWh</strong><small>Import: ${formatNumber(metrics.today_import, 1, 1)} kWh</small></div></div>
          <div class="col-md-6 col-xl-3"><div class="metric-card sky"><span>Today's Irradiance</span><strong>${formatNumber(metrics.today_irradiance, 0, 0)} W/m²</strong><small>Weekly Avg: ${formatNumber(metrics.weekly_average, 1, 1)} kWh</small></div></div>
          <div class="col-md-6 col-xl-3"><div class="metric-card money"><div class="d-flex justify-content-between align-items-start gap-2"><span>Monthly Savings</span><button type="button" class="metric-info-button" data-bs-toggle="modal" data-bs-target="#monthlySavingsModal">?</button></div><strong>${formatCurrency(metrics.monthly_savings)}</strong><small>Annual: ${formatCurrency(metrics.annual_savings)}</small></div></div>
        </section>
        <section class="row g-3 mb-4">
          <div class="col-lg-8"><div class="card tracker-card h-100"><div class="card-body"><h2 class="h5 mb-3">Production Overview</h2><div id="daily-chart" class="dashboard-chart"></div></div></div></div>
          <div class="col-lg-4"><div class="card tracker-card h-100"><div class="card-body"><div class="d-flex justify-content-between align-items-start gap-3 mb-3"><h2 class="h5 mb-0">Contract Progress</h2><div class="d-flex flex-wrap gap-2 justify-content-end"><a class="btn btn-contract btn-sm" href="${summaryHref}">Summary</a><a class="btn btn-contract btn-sm" href="${contractHref}" target="_blank" rel="noopener noreferrer">PDF</a></div></div><div class="progress tracker-progress mb-3"><div class="progress-bar" role="progressbar" style="width: ${Math.min(metrics.guarantee_progress_pct, 100)}%"></div></div><div class="info-grid"><div><span>Guarantee</span><strong>${formatNumber(config.production_guarantee_kwh, 0, 0)} kWh</strong></div><div><span>Progress</span><strong>${formatNumber(metrics.guarantee_progress_pct, 1, 1)}%</strong></div><div><span>YTD Production</span><strong>${formatNumber(metrics.ytd_production, 1, 1)} kWh</strong></div><div><span>Avg Daily</span><strong>${formatNumber(metrics.average_daily_production, 1, 1)} kWh</strong></div><div><span>Best Day</span><strong>${formatNumber(metrics.highest_production_day, 1, 1)} kWh</strong></div><div><span>Lowest Day</span><strong>${formatNumber(metrics.lowest_production_day, 1, 1)} kWh</strong></div><div><span>Consecutive Poor Days</span><strong>${metrics.consecutive_poor_days}</strong></div><div><span>Monthly Avg</span><strong>${formatNumber(metrics.monthly_average, 1, 1)} kWh</strong></div></div></div></div></div>
        </section>
        <section class="row g-3 mb-4">
          <div class="col-lg-6"><div class="card tracker-card h-100"><div class="card-body"><h2 class="h5 mb-3">Grid Flow and Virtual Consumption Monitor</h2><div id="flow-chart" class="dashboard-chart"></div></div></div></div>
          <div class="col-lg-6"><div class="card tracker-card h-100"><div class="card-body"><h2 class="h5 mb-3">Solar Offset Snapshot</h2><div class="info-grid"><div><span>Estimated Self Consumption</span><strong>${formatNumber(metrics.estimated_self_consumption, 1, 1)} kWh</strong></div><div><span>Total Home Consumption</span><strong>${formatNumber(metrics.total_home_consumption, 1, 1)} kWh</strong></div><div><span>Solar Offset</span><strong>${formatNumber(metrics.solar_offset_pct, 1, 1)}%</strong></div><div><span>Expected Offset</span><strong>${formatNumber(config.expected_offset_pct, 1, 1)}%</strong></div><div><span>Electricity Value Produced</span><strong>${formatCurrency(metrics.electricity_value_produced)}</strong></div><div><span>Grid Cost</span><strong>${formatCurrency(metrics.grid_cost)}</strong></div><div><span>Lease Cost</span><strong>${formatCurrency(metrics.lease_cost)}</strong></div><div><span>Lifetime Savings</span><strong>${formatCurrency(metrics.lifetime_savings)}</strong></div><div><span>Tree Removal Payback</span><strong>${metrics.tree_payback_months ? `${formatNumber(metrics.tree_payback_months, 1, 1)} months` : "N/A"}</strong></div></div></div></div></div>
        </section>
        ${buildHistoricalUsagePanelHtml(dashboardAiState.historicalUsage, config)}
        ${buildMonthlyBillPanelHtml(dashboardAiState.monthlyBill)}
        <section class="row g-3 mb-4">
          <div class="col-lg-4"><div class="card tracker-card h-100"><div class="card-body"><div id="irradiance-chart" class="dashboard-chart"></div></div></div></div>
          <div class="col-lg-4"><div class="card tracker-card h-100"><div class="card-body"><div id="weather-chart" class="dashboard-chart"></div></div></div></div>
          <div class="col-lg-4"><div class="card tracker-card h-100"><div class="card-body"><div id="monthly-chart" class="dashboard-chart"></div></div></div></div>
        </section>
        <section class="card tracker-card"><div class="card-body"><div class="d-flex justify-content-between align-items-center mb-3"><h2 class="h5 mb-0">Recent Entries</h2><a href="${entriesHref}" class="btn btn-sun btn-sm">Add Daily Entry</a></div><div class="table-responsive"><table class="table align-middle"><thead><tr><th>Date</th><th>Production</th><th>Irradiance</th><th>Meter 01</th><th>Meter 02</th><th>Weather</th></tr></thead><tbody>${recentEntries.map((entry) => `<tr><td>${entry.entry_date}</td><td>${formatNumber(entry.production_kwh, 1, 1)} kWh</td><td>${formatNumber(entry.irradiance_peak_wm2, 0, 0)}</td><td>${formatNumber(entry.meter_01_import_reading, 1, 1)}</td><td>${formatNumber(entry.meter_02_export_reading, 1, 1)}</td><td>${entry.weather}</td></tr>`).join("")}</tbody></table></div></div></section>
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
    <div class="modal fade" id="dashboardIntroModal" tabindex="-1" aria-hidden="true"><div class="modal-dialog modal-lg modal-dialog-centered"><div class="modal-content tracker-modal"><div class="modal-header border-0 pb-0"><div><p class="eyebrow mb-2">Dashboard Overview</p><h2 class="modal-title h4 mb-0">What this dashboard is tracking</h2></div><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body pt-3"><div class="tracker-modal-math"><div class="tracker-modal-step"><strong>Production and Grid Flow</strong><p>Tracks daily production, import, export, and rolling averages so you can see how the system is behaving day to day.</p></div><div class="tracker-modal-step"><strong>Virtual Consumption Estimate</strong><p>Because there are no consumption CTs installed, the app estimates self-consumption and home usage from production, grid readings, seasonality, and weather.</p></div><div class="tracker-modal-step"><strong>Contract Tracking</strong><p>Compares observed average production against the Sunrun production guarantee and shows whether your current pace is ahead or behind.</p></div><div class="tracker-modal-step"><strong>Financial View</strong><p>Estimates electricity value, grid cost, lease cost, and monthly or annual savings using the current settings saved in the app.</p></div></div></div></div></div></div>
    <div class="modal fade" id="monthlySavingsModal" tabindex="-1" aria-hidden="true"><div class="modal-dialog modal-lg modal-dialog-centered"><div class="modal-content tracker-modal"><div class="modal-header border-0 pb-0"><div><p class="eyebrow mb-2">Financial Breakdown</p><h2 class="modal-title h4 mb-0">How Monthly Savings Is Calculated</h2></div><button type="button" class="btn-close" data-bs-dismiss="modal"></button></div><div class="modal-body pt-3"><div class="info-grid mb-4"><div><span>Observed Months</span><strong>${metrics.observed_months}</strong></div><div><span>Electric Rate</span><strong>$${formatNumber(config.current_electric_rate,2,2)}/kWh</strong></div><div><span>Monthly Fixed Charges</span><strong>$${formatNumber(config.monthly_fixed_charges,2,2)}</strong></div><div><span>Monthly Lease Payment</span><strong>$${formatNumber(config.monthly_lease_payment,2,2)}</strong></div></div><div class="tracker-modal-math"><div class="tracker-modal-step"><strong>1. Electricity Value Produced</strong><p>Total solar production × electric rate</p><code>${formatCurrency(metrics.electricity_value_produced)}</code></div><div class="tracker-modal-step"><strong>2. Grid Cost</strong><p>(Total imported kWh × electric rate) + (monthly fixed charges × observed months)</p><code>${formatCurrency(metrics.grid_cost)}</code></div><div class="tracker-modal-step"><strong>3. Lease Cost</strong><p>Monthly lease payment × observed months</p><code>${formatCurrency(metrics.lease_cost)}</code></div><div class="tracker-modal-step"><strong>4. Monthly Savings</strong><p>(Electricity value produced - grid cost - lease cost) ÷ observed months</p><code>${formatCurrency(metrics.monthly_savings)}</code></div><div class="tracker-modal-step"><strong>5. Annual Savings</strong><p>Monthly savings × 12</p><code>${formatCurrency(metrics.annual_savings)}</code></div></div></div></div></div></div>
  `;
}

function renderDashboardChartsClient(entries) {
  if (typeof Plotly === "undefined" || !entries.length) return;
  const dates = entries.map((entry) => entry.entry_date);
  const compactMode = document.body.classList.contains("dashboard-compact-mode");
  const chartHeight = compactMode ? 210 : 320;
  const baseLayout = { margin: { l: 20, r: 20, t: 48, b: 32 }, template: "plotly_white", height: chartHeight };

  Plotly.newPlot("daily-chart", [
    { type: "bar", x: dates, y: entries.map((entry) => entry.production_kwh), name: "Production (kWh)", marker: { color: "#e3a008" } },
    { type: "scatter", x: dates, y: entries.map((entry) => entry.rolling_7_day_prod), name: "7-Day Average", line: { color: "#0f4c81", width: 3 } }
  ], { ...baseLayout, title: { text: "Daily Production" } }, { responsive: true });

  Plotly.newPlot("flow-chart", [
    { type: "scatter", x: dates, y: entries.map((entry) => entry.daily_import_kwh), name: "Import", line: { color: "#b42318" } },
    { type: "scatter", x: dates, y: entries.map((entry) => entry.daily_export_kwh), name: "Export", line: { color: "#157f3b" } },
    { type: "scatter", x: dates, y: entries.map((entry) => entry.estimated_self_consumption_kwh), name: "Estimated Self Consumption", line: { color: "#0f4c81", dash: "dot" } }
  ], { ...baseLayout, title: { text: "Grid Flow and Estimated Self Consumption" } }, { responsive: true });

  Plotly.newPlot("irradiance-chart", [{
    type: "scatter",
    mode: "markers",
    x: entries.map((entry) => entry.irradiance_peak_wm2),
    y: entries.map((entry) => entry.production_kwh),
    marker: { size: 10, color: "#0f4c81" }
  }], { ...baseLayout, title: { text: "Production vs Irradiance" }, xaxis: { title: "Peak Irradiance (W/m²)" }, yaxis: { title: "Production (kWh)" } }, { responsive: true });

  const weatherGroups = Object.entries(entries.reduce((accumulator, entry) => {
    const key = entry.weather || "Unknown";
    accumulator[key] = accumulator[key] || [];
    accumulator[key].push(Number(entry.production_kwh || 0));
    return accumulator;
  }, {}));
  Plotly.newPlot("weather-chart", [{
    type: "bar",
    x: weatherGroups.map(([weather]) => weather),
    y: weatherGroups.map(([, values]) => mean(values)),
    marker: { color: "#3b82f6" }
  }], { ...baseLayout, title: { text: "Average Production by Weather" } }, { responsive: true });

  const monthTotals = Object.entries(entries.reduce((accumulator, entry) => {
    const monthKey = entry.entry_date.slice(0, 7);
    accumulator[monthKey] = (accumulator[monthKey] || 0) + Number(entry.production_kwh || 0);
    return accumulator;
  }, {}));
  Plotly.newPlot("monthly-chart", [{
    type: "bar",
    x: monthTotals.map(([month]) => month),
    y: monthTotals.map(([, total]) => total),
    marker: { color: "#157f3b" }
  }], { ...baseLayout, title: { text: "Monthly Production" } }, { responsive: true });
}

async function renderDashboard(entries, config, firebaseStatus) {
  const aiEntries = buildComputedEntries(entries, config);
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
      renderDashboardChartsClient(computedEntries);
    }
    return;
  }
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
    setupDashboardViewToggle();
    dashboardAiState.openaiConfigured = Boolean(payload.ai_status?.openai_configured ?? dashboardAiState.openaiConfigured);
    dashboardAiState.historicalUsage = payload.historical_usage || dashboardAiState.historicalUsage;
    dashboardAiState.monthlyBill = payload.monthly_bill || dashboardAiState.monthlyBill;
    setupAiAssistant();
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

function getEntryByDate(entryDate) {
  return entriesPageState.entries.find((entry) => entry.entry_date === entryDate) || null;
}

function getMostRecentEntryBefore(entries, entryDate) {
  const priorEntries = entries.filter((entry) => String(entry.entry_date) < String(entryDate));
  return priorEntries.length ? priorEntries[priorEntries.length - 1] : null;
}

async function buildAutoEntry(entries, entryDate, sourceLabel = "Auto-created") {
  const previousEntry = getMostRecentEntryBefore(entries, entryDate);
  const estimatedValues = await buildEstimatedLookupValues(entryDate, entries);
  return {
    entry_date: entryDate,
    irradiance_peak_wm2: Number(estimatedValues.irradiance_peak_wm2 || 0),
    production_kwh: Number(estimatedValues.production_kwh || 0),
    meter_01_import_reading: previousEntry ? Number(previousEntry.meter_01_import_reading || 0) : 0,
    meter_02_export_reading: previousEntry ? Number(previousEntry.meter_02_export_reading || 0) : 0,
    weather: estimatedValues.weather || previousEntry?.weather || "Unknown",
    temperature_f: estimatedValues.temperature_f ?? null,
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

async function ensureDailyPlaceholderRecord(db, entries, options = {}) {
  const {
    forceCreate = false,
    entryDate = getTodayIsoDate(),
    sourceLabel = "Auto-created"
  } = options;

  const existingEntry = entries.find((entry) => entry.entry_date === entryDate);
  if (existingEntry) {
    if (isPlaceholderLikeEntry(existingEntry)) {
      const hydratedEntry = {
        ...existingEntry,
        ...(await buildEstimatedLookupValues(entryDate, entries)),
        estimated: true,
        updated_at: new Date().toISOString()
      };
      await setDoc(doc(db, entryCollectionName, entryDate), hydratedEntry, { merge: true });
      return { entry: normalizeEntry(hydratedEntry), created: false, hydrated: true };
    }
    return { entry: existingEntry, created: false };
  }

  if (!forceCreate && !isAtOrAfterAutoCreateTime()) {
    return { entry: null, created: false };
  }

  const placeholderEntry = await buildAutoEntry(entries, entryDate, sourceLabel);
  await setDoc(doc(db, entryCollectionName, entryDate), placeholderEntry, { merge: true });
  return { entry: placeholderEntry, created: true };
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
    humidity_pct: "",
    cloud_cover_pct: "",
    wind_mph: "",
    notes: "",
    lookup_source: "manual"
  };

  Object.entries(payload).forEach(([key, value]) => {
    const field = form.elements.namedItem(key);
    if (field) {
      field.value = value ?? "";
    }
  });

  if (entry?.entry_date) {
    entriesPageState.selectedDate = entry.entry_date;
    setEntryFormMode(`Editing record for ${entry.entry_date}.`, "Update Entry");
    setEstimatedBadgeVisible(Boolean(entry.estimated));
    setEntrySourceBadge(entry);
  } else {
    entriesPageState.selectedDate = "";
    setEntryFormMode("Create or update a daily solar record.", "Save Entry");
    setEstimatedBadgeVisible(false);
    setEntrySourceBadge({ lookup_source: "manual", estimated: false });
  }
}

function populateEntriesTable(entries) {
  const body = document.getElementById("entries-table-body");
  if (!body) return;
  entriesPageState.entries = [...entries];
  body.innerHTML = entries.map((entry) => `
    <tr class="${entry.entry_date === entriesPageState.selectedDate ? "entry-row-selected" : ""}">
      <td>${entry.entry_date}</td>
      <td>${Number(entry.production_kwh || 0).toFixed(1)}</td>
      <td>${Number(entry.irradiance_peak_wm2 || 0).toFixed(0)}</td>
      <td>${Number(entry.meter_01_import_reading || 0).toFixed(1)}</td>
      <td>${Number(entry.meter_02_export_reading || 0).toFixed(1)}</td>
      <td>${entry.weather || "Unknown"}</td>
      <td>${renderNotesCell(entry.notes)}</td>
      <td>${entry.estimated ? '<span class="entry-estimated-pill">Estimated</span>' : '<span class="entry-confirmed-pill">Confirmed</span>'}</td>
      <td><button type="button" class="btn btn-contract btn-sm entry-edit-button" data-entry-date="${entry.entry_date}">Edit</button></td>
    </tr>
  `).join("");

  body.querySelectorAll(".entry-edit-button").forEach((button) => {
    button.addEventListener("click", () => {
      const entry = getEntryByDate(button.dataset.entryDate);
      if (!entry) return;
      fillEntryForm(entry);
      window.scrollTo({ top: 0, behavior: "smooth" });
      populateEntriesTable(entriesPageState.entries.slice().reverse());
    });
  });
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

  function getActiveEntryDate() {
    const dateField = form.elements.namedItem("entry_date");
    return dateField?.value || getTodayIsoDate();
  }

  async function refreshEntries(options = {}) {
    const {
      showMessage = true,
      runAutoCreate = false,
      forceCreate = false,
      entryDate = getActiveEntryDate()
    } = options;
    const state = await loadFirestoreState(db);
    let entries = state.entries;
    let autoCreateMessage = "";

    if (runAutoCreate) {
      const result = await ensureDailyPlaceholderRecord(db, entries, {
        forceCreate,
        entryDate,
        sourceLabel: forceCreate ? "Add Daily Entry" : "9:30 AM auto-create"
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

    populateEntriesTable(entries.slice().reverse());

    if (!entriesPageState.selectedDate) {
      const todayEntry = entries.find((entry) => entry.entry_date === getTodayIsoDate());
      if (todayEntry) {
        fillEntryForm(todayEntry);
      }
    }

    if (showMessage) {
      const message = autoCreateMessage || "Entry data refreshed from Firebase Firestore.";
      renderStatusAlert("entries-status", message, "success");
    }
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(form);
    const existingEntry = getEntryByDate(formData.get("entry_date"));
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
      estimated: false,
      lookup_source: "manual",
      created_at: existingEntry?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    await setDoc(doc(db, entryCollectionName, entry.entry_date), entry, { merge: true });
    entriesPageState.selectedDate = entry.entry_date;
    await refreshEntries({ showMessage: false });
    fillEntryForm(entry);
    renderStatusAlert(
      "entries-status",
      existingEntry ? `Updated record for ${entry.entry_date}.` : `Saved new record for ${entry.entry_date}.`,
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
      await refreshEntries({
        showMessage: true,
        runAutoCreate: true,
        forceCreate: false,
        entryDate: getActiveEntryDate()
      });
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
    let state = await loadFirestoreState(db);
    const backfillResult = await backfillStarterEntriesIfNeeded(db, state.entries);
    if (backfillResult.backfilled) {
      state = { ...state, entries: backfillResult.entries };
    }
    const autoCreateResult = await ensureDailyPlaceholderRecord(db, state.entries, {
      forceCreate: false,
      sourceLabel: "9:30 AM auto-create"
    });
    if (autoCreateResult.created) {
      state = await loadFirestoreState(db);
    }
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
  const entryTools = await handleEntryForm(db);
  try {
    const state = await loadFirestoreState(db);
    const backfillResult = await backfillStarterEntriesIfNeeded(db, state.entries);
    if (backfillResult.backfilled) {
      renderStatusAlert("entries-status", "Starter history was restored into Firebase, and live entries were refreshed.", "success");
    }
    await entryTools.refreshEntries({ showMessage: false, runAutoCreate: true, forceCreate: false });
    const url = new URL(window.location.href);
    if (url.searchParams.get("autocreate") === "1") {
      await entryTools.refreshEntries({ showMessage: true, runAutoCreate: true, forceCreate: true });
      url.searchParams.delete("autocreate");
      window.history.replaceState({}, "", url);
    } else if (!backfillResult.backfilled) {
      renderStatusAlert("entries-status", "Live Firebase data is connected in the browser.", "success");
    } else {
      fillEntryForm();
    }
  } catch (error) {
    populateEntriesTable(sampleEntries.slice().reverse());
    fillEntryForm();
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
