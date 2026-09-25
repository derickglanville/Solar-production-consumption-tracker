const { onSchedule } = require("firebase-functions/v2/scheduler");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();
const db = admin.firestore();
const ENTRY_COLLECTION = "solar_daily_entries";
const CONFIG_COLLECTION = "solar_tracker_config";
const CONFIG_DOCUMENT = "primary";
const TIME_ZONE = "America/New_York";
const LOCATION = { latitude: 41.2706, longitude: -73.7774 };

function yorktownParts(date = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: TIME_ZONE,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23"
  }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  return parts;
}

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

async function getMorningWeather(date) {
  const url = new URL("https://api.open-meteo.com/v1/forecast");
  url.searchParams.set("latitude", String(LOCATION.latitude));
  url.searchParams.set("longitude", String(LOCATION.longitude));
  url.searchParams.set("hourly", "shortwave_radiation,cloud_cover,relative_humidity_2m,temperature_2m,wind_speed_10m");
  url.searchParams.set("timezone", TIME_ZONE);
  url.searchParams.set("forecast_days", "2");
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Open-Meteo responded ${response.status}`);
  const payload = await response.json();
  const hourly = payload.hourly || {};
  const indexes = (hourly.time || []).map((time, index) => time.startsWith(date) ? index : -1).filter((index) => index >= 0);
  if (!indexes.length) throw new Error("Open-Meteo returned no hourly values for today.");
  const radiation = indexes.map((index) => Number(hourly.shortwave_radiation?.[index] || 0));
  const cloud = indexes.map((index) => Number(hourly.cloud_cover?.[index] || 0));
  const temperature = indexes.map((index) => Number(hourly.temperature_2m?.[index] || 0));
  const humidity = indexes.map((index) => Number(hourly.relative_humidity_2m?.[index] || 0));
  const wind = indexes.map((index) => Number(hourly.wind_speed_10m?.[index] || 0));
  const peak = Math.max(...radiation, 0);
  const averageCloud = cloud.reduce((sum, value) => sum + value, 0) / cloud.length;
  return {
    irradiance_peak_wm2: Math.round(peak),
    cloud_cover_pct: Number(averageCloud.toFixed(1)),
    temperature_f: Number(((temperature.reduce((sum, value) => sum + value, 0) / temperature.length) * 9 / 5 + 32).toFixed(1)),
    humidity_pct: Number((humidity.reduce((sum, value) => sum + value, 0) / humidity.length).toFixed(1)),
    wind_mph: Number((wind.reduce((sum, value) => sum + value, 0) / wind.length * 0.621371).toFixed(1)),
    weather: averageCloud >= 80 ? "Overcast" : averageCloud >= 55 ? "Cloudy" : "Sunny"
  };
}

exports.createDailySolarEntry = onSchedule({
  schedule: "30 6 * * *",
  timeZone: TIME_ZONE,
  region: "us-east1"
}, async () => {
  const clock = yorktownParts();
  const entryDate = `${clock.year}-${clock.month}-${clock.day}`;
  const [entriesSnapshot, configSnapshot] = await Promise.all([
    db.collection(ENTRY_COLLECTION).orderBy("entry_date", "asc").get(),
    db.collection(CONFIG_COLLECTION).doc(CONFIG_DOCUMENT).get()
  ]);
  const entries = entriesSnapshot.docs.map((snapshot) => snapshot.data());
  const existing = entries.find((entry) => String(entry.entry_date) === entryDate);
  const prior = entries.filter((entry) => String(entry.entry_date) < entryDate).at(-1);
  if (!prior) throw new Error("Cannot create a daily entry without a prior meter reading.");

  const checkpoints = Array.isArray(configSnapshot.data()?.meter_simulation_checkpoints)
    ? configSnapshot.data().meter_simulation_checkpoints : [];
  const learnedOvernightImport = median(checkpoints
    .map((checkpoint) => Number(checkpoint.actual_m01) - Number(checkpoint.base_m01))
    .filter((value) => Number.isFinite(value) && value >= 0 && value <= 50));
  const weather = await getMorningWeather(entryDate).catch((error) => {
    logger.warn("Morning Open-Meteo lookup failed; retaining fallback weather.", error);
    return { weather: prior.weather || "Unknown", irradiance_peak_wm2: 0, cloud_cover_pct: 0, temperature_f: null, humidity_pct: null, wind_mph: null };
  });
  const now = admin.firestore.FieldValue.serverTimestamp();
  const entry = {
    entry_date: entryDate,
    production_kwh: existing?.production_kwh ?? 0,
    meter_01_import_reading: existing?.meter_values_confirmed ? existing.meter_01_import_reading : Number((Number(prior.meter_01_import_reading || 0) + learnedOvernightImport).toFixed(1)),
    meter_02_export_reading: existing?.meter_values_confirmed ? existing.meter_02_export_reading : Number(prior.meter_02_export_reading || 0),
    meter_values_estimated: !existing?.meter_values_confirmed,
    meter_values_confirmed: Boolean(existing?.meter_values_confirmed),
    meter_values_calibrated: Boolean(existing?.meter_values_calibrated),
    meter_simulation_basis: `Cloud Scheduler 6:30 AM seed; learned overnight import ${learnedOvernightImport.toFixed(1)} kWh`,
    meter_simulation_updated_at: new Date().toISOString(),
    irradiance_peak_wm2: weather.irradiance_peak_wm2,
    weather: weather.weather,
    temperature_f: weather.temperature_f,
    humidity_pct: weather.humidity_pct,
    cloud_cover_pct: weather.cloud_cover_pct,
    wind_mph: weather.wind_mph,
    estimated: true,
    lookup_source: "open-meteo-forecast",
    notes: "Created or refreshed by Firebase Cloud Scheduler at 6:30 AM Eastern.",
    updated_at: now
  };
  if (!existing) entry.created_at = now;
  await db.collection(ENTRY_COLLECTION).doc(entryDate).set(entry, { merge: true });
  logger.info("Daily solar entry refreshed.", { entryDate, learnedOvernightImport });
});
