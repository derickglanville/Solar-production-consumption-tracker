(function () {
  "use strict";

  const LOCATIONS = {
    yorktown: { label: "Yorktown Heights, NY", latitude: 41.2706, longitude: -73.7774, timeZone: "America/New_York" },
    dallas: { label: "Dallas, TX", latitude: 32.7767, longitude: -96.7970, timeZone: "America/Chicago" },
    negril: { label: "Negril, Jamaica", latitude: 18.2686, longitude: -78.3471, timeZone: "America/Jamaica" }
  };
  const DEFAULT_LOCATION = LOCATIONS.yorktown;
  const TIME_ZONE = "America/New_York";
  const WEATHER_REFRESH_MS = 60 * 60 * 1000;
  const POSITION_REFRESH_MS = 60 * 1000;

  function degrees(value) { return value * 180 / Math.PI; }
  function radians(value) { return value * Math.PI / 180; }
  function normalize(value) { return ((value % 360) + 360) % 360; }
  function clamp(value, minimum, maximum) { return Math.min(maximum, Math.max(minimum, value)); }

  function yorktownParts(date) {
    return Object.fromEntries(new Intl.DateTimeFormat("en-US", {
      timeZone: TIME_ZONE,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23"
    }).formatToParts(date).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
  }

  function localMinute(date) {
    const parts = yorktownParts(date);
    return Number(parts.hour) * 60 + Number(parts.minute) + Number(parts.second) / 60;
  }

  function localIsoDate(date) {
    const parts = yorktownParts(date);
    return `${parts.year}-${parts.month}-${parts.day}`;
  }

  function solarPosition(date, location = DEFAULT_LOCATION) {
    const julianDate = date.getTime() / 86400000 + 2440587.5;
    const days = julianDate - 2451545.0;
    const meanLongitude = normalize(280.46 + 0.9856474 * days);
    const meanAnomaly = normalize(357.528 + 0.9856003 * days);
    const eclipticLongitude = normalize(meanLongitude + 1.915 * Math.sin(radians(meanAnomaly)) + 0.02 * Math.sin(radians(2 * meanAnomaly)));
    const obliquity = 23.439 - 0.0000004 * days;
    const rightAscension = normalize(degrees(Math.atan2(
      Math.cos(radians(obliquity)) * Math.sin(radians(eclipticLongitude)),
      Math.cos(radians(eclipticLongitude))
    )));
    const declination = degrees(Math.asin(Math.sin(radians(obliquity)) * Math.sin(radians(eclipticLongitude))));
    const sidereal = normalize(280.46061837 + 360.98564736629 * days + location.longitude);
    let hourAngle = normalize(sidereal - rightAscension);
    if (hourAngle > 180) hourAngle -= 360;
    const elevation = degrees(Math.asin(
      Math.sin(radians(location.latitude)) * Math.sin(radians(declination)) +
      Math.cos(radians(location.latitude)) * Math.cos(radians(declination)) * Math.cos(radians(hourAngle))
    ));
    const azimuth = normalize(degrees(Math.atan2(
      Math.sin(radians(hourAngle)),
      Math.cos(radians(hourAngle)) * Math.sin(radians(location.latitude)) - Math.tan(radians(declination)) * Math.cos(radians(location.latitude))
    )) + 180);
    return { azimuth, elevation };
  }

  function solarEvents(date, location = DEFAULT_LOCATION) {
    const parts = yorktownParts(date);
    const currentYear = Number(parts.year);
    const currentMonth = Number(parts.month);
    const currentDay = Number(parts.day);
    const dayStart = Date.UTC(currentYear, 0, 1);
    const dayNumber = Math.floor((Date.UTC(currentYear, currentMonth - 1, currentDay) - dayStart) / 86400000) + 1;
    const gamma = 2 * Math.PI / 365 * (dayNumber - 1);
    const equationTime = 229.18 * (0.000075 + 0.001868 * Math.cos(gamma) - 0.032077 * Math.sin(gamma) - 0.014615 * Math.cos(2 * gamma) - 0.040849 * Math.sin(2 * gamma));
    const declination = 0.006918 - 0.399912 * Math.cos(gamma) + 0.070257 * Math.sin(gamma) - 0.006758 * Math.cos(2 * gamma) + 0.000907 * Math.sin(2 * gamma) - 0.002697 * Math.cos(3 * gamma) + 0.00148 * Math.sin(3 * gamma);
    const hourAngle = degrees(Math.acos(clamp(
      Math.cos(radians(90.833)) / (Math.cos(radians(location.latitude)) * Math.cos(declination)) - Math.tan(radians(location.latitude)) * Math.tan(declination),
      -1, 1
    )));
    const timezoneEastMinutes = timeZoneOffsetMinutes(date, location.timeZone);
    const noon = 720 - 4 * location.longitude - equationTime + timezoneEastMinutes;
    return { sunrise: noon - 4 * hourAngle, noon, sunset: noon + 4 * hourAngle };
  }

  function dateAtLocalMinute(reference, minute) {
    const parts = yorktownParts(reference);
    return new Date(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Math.floor(minute / 60), Math.round(minute % 60), 0);
  }

  function timeZoneOffsetMinutes(date, timeZone) {
    const zone = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
      .formatToParts(date).find((part) => part.type === "timeZoneName")?.value || "GMT";
    const match = /^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/.exec(zone);
    if (!match) return 0;
    const minutes = Number(match[2]) * 60 + Number(match[3] || 0);
    return match[1] === "+" ? minutes : -minutes;
  }

  function dateAtLocationMinute(reference, minute, location) {
    const parts = yorktownParts(reference);
    const base = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Math.floor(minute / 60), Math.round(minute % 60));
    let result = new Date(base);
    result = new Date(base - timeZoneOffsetMinutes(result, location.timeZone) * 60000);
    return new Date(base - timeZoneOffsetMinutes(result, location.timeZone) * 60000);
  }

  function dateFromLocalSelection(isoDate, minute) {
    const [year, month, day] = String(isoDate).split("-").map(Number);
    return new Date(year, month - 1, day, Math.floor(minute / 60), Math.round(minute % 60), 0);
  }

  function shiftIsoDate(isoDate, days) {
    const reference = dateFromLocalSelection(isoDate, 12 * 60);
    reference.setDate(reference.getDate() + days);
    return localIsoDate(reference);
  }

  function parseApiTime(value) {
    const match = /T(\d{2}):(\d{2})/.exec(String(value || ""));
    return match ? Number(match[1]) * 60 + Number(match[2]) : null;
  }

  function formatMinute(value) {
    const minute = ((Math.round(value) % 1440) + 1440) % 1440;
    const hour24 = Math.floor(minute / 60);
    const suffix = hour24 >= 12 ? "PM" : "AM";
    const hour = hour24 % 12 || 12;
    return `${hour}:${String(minute % 60).padStart(2, "0")} ${suffix}`;
  }

  function directionLabel(azimuth) {
    const directions = ["N", "NNE", "NE", "ENE", "E", "ESE", "SE", "SSE", "S", "SSW", "SW", "WSW", "W", "WNW", "NW", "NNW"];
    return directions[Math.round(normalize(azimuth) / 22.5) % 16];
  }

  function weatherFromCode(code) {
    const value = Number(code);
    if ([0, 1].includes(value)) return "Sunny";
    if ([2, 3, 45, 48].includes(value)) return value === 3 ? "Overcast" : "Cloudy";
    if ([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99].includes(value)) return "Rain";
    if ([71, 73, 75, 77, 85, 86].includes(value)) return "Snow";
    return "Unknown";
  }

  function skyClass(weather, elevation) {
    if (elevation <= -4) return "night";
    const label = String(weather || "").toLowerCase();
    if (label.includes("rain") || label.includes("storm")) return "rain";
    if (label.includes("snow")) return "snow";
    if (label.includes("overcast")) return "overcast";
    if (label.includes("cloud")) return "cloudy";
    if (label.includes("smoke")) return "smoke";
    return "sunny";
  }

  function parseProfile(root) {
    try {
      const profile = JSON.parse(decodeURIComponent(root.dataset.hourlyProfile || "%5B%5D"));
      return Array.isArray(profile) ? profile.map((point) => ({
        minute: Number(point.minute_of_day),
        irradiance: Number(point.irradiance_wm2 || 0),
        cloud: point.cloud_cover_pct == null ? null : Number(point.cloud_cover_pct)
      })).filter((point) => Number.isFinite(point.minute)).sort((a, b) => a.minute - b.minute) : [];
    } catch (_error) { return []; }
  }

  function parseHistory(root) {
    try {
      const raw = root.dataset.entryHistory || "[]";
      let history;
      try { history = JSON.parse(decodeURIComponent(raw)); }
      catch (_decodeError) { history = JSON.parse(raw); }
      return Array.isArray(history) ? history : [];
    } catch (_error) { return []; }
  }

  function selectedEntry(root, isoDate) {
    return (root._solarEntryHistory || []).find((entry) => String(entry.entry_date || "") === isoDate) || null;
  }

  function entryProfile(entry) {
    const profile = Array.isArray(entry?.irradiance_hourly_profile) ? entry.irradiance_hourly_profile : [];
    return profile.map((point) => ({
      minute: Number(point.minute_of_day),
      irradiance: Number(point.irradiance_wm2 || 0),
      cloud: point.cloud_cover_pct == null ? null : Number(point.cloud_cover_pct)
    })).filter((point) => Number.isFinite(point.minute)).sort((a, b) => a.minute - b.minute);
  }

  function profileForDate(root, isoDate) {
    if (root._solarLiveProfileDate === isoDate && root._solarLiveProfile?.length) return root._solarLiveProfile;
    const entry = selectedEntry(root, isoDate);
    const saved = entryProfile(entry);
    if (saved.length) return saved;
    if (isoDate === String(root.dataset.entryDate || "")) return parseProfile(root);
    return [];
  }

  function interpolateProfile(profile, minute, field) {
    if (!profile.length) return null;
    if (minute <= profile[0].minute) return Number(profile[0][field] ?? 0);
    if (minute >= profile[profile.length - 1].minute) return Number(profile[profile.length - 1][field] ?? 0);
    for (let index = 1; index < profile.length; index += 1) {
      if (minute <= profile[index].minute) {
        const before = profile[index - 1];
        const after = profile[index];
        const beforeValue = before[field];
        const afterValue = after[field];
        if (beforeValue == null || afterValue == null) return beforeValue ?? afterValue ?? null;
        const progress = (minute - before.minute) / Math.max(1, after.minute - before.minute);
        return Number(beforeValue) + (Number(afterValue) - Number(beforeValue)) * progress;
      }
    }
    return null;
  }

  function estimatedIrradiance(root, profile, minute, elevation, peakElevation, peakOverride = null) {
    const profiled = interpolateProfile(profile, minute, "irradiance");
    if (profiled != null) return Math.max(0, profiled);
    const peak = Math.max(0, Number(peakOverride ?? root.dataset.irradiancePeak ?? 0));
    if (elevation <= 0 || peakElevation <= 0) return 0;
    return peak * clamp(Math.sin(radians(elevation)) / Math.sin(radians(peakElevation)), 0, 1);
  }

  function setText(root, selector, value) {
    const node = root.querySelector(selector);
    if (node) node.textContent = value;
  }

  function renderArc(root, now, events, location) {
    const points = [];
    let peakElevation = 0;
    for (let minute = events.sunrise; minute <= events.sunset; minute += 15) {
      const position = solarPosition(dateAtLocationMinute(now, minute, location), location);
      peakElevation = Math.max(peakElevation, position.elevation);
      points.push({ minute, elevation: Math.max(0, position.elevation) });
    }
    const xForMinute = (minute) => clamp((minute - events.sunrise) / Math.max(1, events.sunset - events.sunrise), 0, 1) * 1000;
    const yForElevation = (elevation) => 315 - clamp(elevation / Math.max(1, peakElevation), 0, 1) * 245;
    const path = points.map((point, index) => `${index ? "L" : "M"} ${xForMinute(point.minute).toFixed(1)} ${yForElevation(point.elevation).toFixed(1)}`).join(" ");
    root.querySelector("[data-solar-arc-path]")?.setAttribute("d", path);
    const currentPosition = solarPosition(now, location);
    const marker = root.querySelector("[data-solar-marker]");
    if (marker) {
      marker.style.left = `${clamp(4 + xForMinute(localMinute(now)) / 1000 * 92, 2, 98)}%`;
      marker.style.top = `${clamp(17 + yForElevation(Math.max(0, currentPosition.elevation)) / 360 * 67, 17, 79)}%`;
      marker.classList.toggle("below-horizon", currentPosition.elevation <= 0);
    }
    return { peakElevation, xForMinute, yForElevation };
  }

  function renderHourMarkers(root, now, events, geometry, location) {
    const container = root.querySelector("[data-solar-hour-markers]");
    if (!container) return;
    const firstHour = Math.ceil(events.sunrise / 60);
    const lastHour = Math.floor(events.sunset / 60);
    const markers = [];
    for (let hour = firstHour; hour <= lastHour; hour += 1) {
      const minute = hour * 60;
      const position = solarPosition(dateAtLocationMinute(now, minute, location), location);
      const x = 4 + geometry.xForMinute(minute) / 1000 * 92;
      const y = 17 + geometry.yForElevation(Math.max(0, position.elevation)) / 360 * 67;
      const nearEdge = hour === firstHour || hour === lastHour;
      markers.push(`<span class="solar-hour-marker${nearEdge ? " is-edge" : ""}" style="--marker-x:${x.toFixed(2)}%;--marker-y:${y.toFixed(2)}%"><i></i><b>${formatMinute(minute).replace(":00", "")}</b><small>${position.azimuth.toFixed(0)}° ${directionLabel(position.azimuth)} · ${Math.max(0, position.elevation).toFixed(0)}°</small></span>`);
    }
    container.innerHTML = markers.join("");
  }

  function renderHourlyRows(root, now, events, geometry, profile, entry, location) {
    const body = root.querySelector("[data-solar-hourly-rows]");
    if (!body) return;
    const systemSize = Number(root.dataset.systemSize || 18.45);
    const rows = [];
    const firstHour = Math.ceil(events.sunrise / 60);
    const lastHour = Math.floor(events.sunset / 60);
    for (let hour = firstHour; hour <= lastHour; hour += 1) {
      const minute = hour * 60;
      const position = solarPosition(dateAtLocationMinute(now, minute, location), location);
      const irradiance = estimatedIrradiance(root, profile, minute, position.elevation, geometry.peakElevation, entry?.irradiance_peak_wm2);
      const power = clamp(systemSize * irradiance / 1000 * 0.86, 0, systemSize * 0.96);
      rows.push(`<tr><td>${formatMinute(minute)}</td><td>${position.azimuth.toFixed(0)}° ${directionLabel(position.azimuth)}</td><td>${Math.max(0, position.elevation).toFixed(0)}°</td><td>${power.toFixed(1)} kW</td></tr>`);
    }
    body.innerHTML = rows.join("");
    renderHourMarkers(root, now, events, geometry, location);
  }

  function render(root) {
    if (!root.isConnected) return;
    const location = LOCATIONS[root._solarLocationKey] || DEFAULT_LOCATION;
    renderSeasons(root);
    const realNow = new Date();
    const realToday = localIsoDate(realNow);
    const selectedDate = root._solarReviewDate || realToday;
    const minute = root._solarReviewMinute == null ? localMinute(realNow) : root._solarReviewMinute;
    const isLive = root._solarReviewDate == null && root._solarReviewMinute == null;
    const reference = isLive ? realNow : dateFromLocalSelection(selectedDate, minute);
    const entry = selectedEntry(root, selectedDate);
    const position = solarPosition(reference, location);
    const liveEvents = root._solarLiveEventsDate === selectedDate ? root._solarLiveEvents : null;
    const events = location === DEFAULT_LOCATION ? { ...solarEvents(reference, location), ...(liveEvents || {}) } : solarEvents(reference, location);
    const geometry = renderArc(root, reference, events, location);
    const profile = profileForDate(root, selectedDate);
    const irradiance = estimatedIrradiance(root, profile, minute, position.elevation, geometry.peakElevation, entry?.irradiance_peak_wm2);
    const profiledCloud = interpolateProfile(profile, minute, "cloud");
    const cloud = profiledCloud ?? Number(entry?.cloud_cover_pct ?? root.dataset.cloudCover ?? 0);
    const weather = root._solarLiveWeatherDate === selectedDate
      ? root._solarLiveWeather
      : entry?.weather || (selectedDate === root.dataset.entryDate ? root.dataset.weather : "Unknown");
    const systemSize = Number(root.dataset.systemSize || 18.45);
    const power = clamp(systemSize * irradiance / 1000 * 0.86, 0, systemSize * 0.96);
    const localTime = new Intl.DateTimeFormat("en-US", { timeZone: location.timeZone, weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(reference);
    const positionText = position.elevation > 0 ? `${position.azimuth.toFixed(0)}° az · ${position.elevation.toFixed(0)}° high` : "Below horizon";
    const displayWeather = position.elevation <= -4 ? "Night" : weather;
    const sunrisePosition = solarPosition(dateAtLocationMinute(reference, events.sunrise, location), location);
    const sunsetPosition = solarPosition(dateAtLocationMinute(reference, events.sunset, location), location);
    const daylightHours = Math.max(0, events.sunset - events.sunrise) / 60;
    const dateLabel = new Intl.DateTimeFormat("en-US", { timeZone: location.timeZone, month: "long", day: "numeric", year: "numeric" }).format(reference);
    const skyNarrative = position.elevation > 0
      ? `The sun is ${directionLabel(position.azimuth)} at ${position.elevation.toFixed(0)}° elevation. ${Math.round(cloud)}% cloud cover ${isLive ? "is shaping" : "corresponds to"} an estimated ${power.toFixed(1)} kW of output.`
      : `The sun is below the horizon. Solar generation resumes near ${formatMinute(events.sunrise)}.`;
    const sky = root.querySelector("[data-solar-sky]");
    if (sky) {
      sky.dataset.condition = skyClass(weather, position.elevation);
      sky.dataset.solarLocation = root._solarLocationKey || "yorktown";
    }

    const dateInput = root.querySelector("[data-solar-review-date]");
    if (dateInput) {
      dateInput.value = selectedDate;
      dateInput.max = realToday;
    }
    const timeInput = root.querySelector("[data-solar-review-time]");
    if (timeInput) {
      timeInput.min = String(Math.floor(events.sunrise / 15) * 15);
      timeInput.max = String(Math.ceil(events.sunset / 15) * 15);
      timeInput.value = String(clamp(Math.round(minute / 15) * 15, Number(timeInput.min), Number(timeInput.max)));
    }

    setText(root, "[data-solar-summary-position]", positionText);
    setText(root, "[data-solar-summary-power]", `${power.toFixed(1)} kW`);
    setText(root, "[data-solar-summary-weather]", displayWeather);
    setText(root, "[data-solar-window-kicker]", isLive ? "Today's Solar Window" : "Historical Solar Review");
    setText(root, "[data-solar-interpretation-kicker]", isLive ? "Live interpretation" : "Review interpretation");
    setText(root, "[data-solar-review-time-label]", isLive ? `Live · ${formatMinute(minute)}` : formatMinute(minute));
    setText(root, "[data-solar-editorial-title]", `The Sun's Path · ${dateLabel}`);
    setText(root, "[data-solar-editorial-meta]", `${location.label} · ${Math.abs(location.latitude).toFixed(4)}° ${location.latitude >= 0 ? "N" : "S"}, ${Math.abs(location.longitude).toFixed(4)}° ${location.longitude >= 0 ? "E" : "W"} · ${location.timeZone.replace("America/", "")}`);
    setText(root, "[data-solar-path-disclaimer]", location === DEFAULT_LOCATION
      ? "Sun position is calculated for Yorktown Heights. Current power is an estimate based on Open-Meteo irradiance and an 86% system derate; Sunrun remains the source of final daily production."
      : `Sun position is calculated for ${location.label}. Weather, irradiance, and power estimates remain based on the Yorktown Heights solar system.`);
    setText(root, "[data-solar-insight-title]", position.elevation > 0 ? `${directionLabel(position.azimuth)} sky · ${power.toFixed(1)} kW estimated ${isLive ? "now" : "at " + formatMinute(minute)}` : `Nighttime · next light ${formatMinute(events.sunrise)}`);
    setText(root, "[data-solar-insight]", skyNarrative);
    setText(root, "[data-solar-local-time]", localTime);
    setText(root, "[data-solar-position]", positionText);
    setText(root, "[data-solar-direction]", position.elevation > 0 ? `${directionLabel(position.azimuth)} compass direction` : `Next sunrise ${formatMinute(events.sunrise)}`);
    setText(root, "[data-solar-window]", `${formatMinute(events.sunrise)} – ${formatMinute(events.sunset)}`);
    setText(root, "[data-solar-noon]", `Solar noon near ${formatMinute(events.noon)}`);
    setText(root, "[data-solar-irradiance]", `${Math.round(irradiance)} W/m²`);
    setText(root, "[data-solar-irradiance-source]", root._solarLiveProfileDate === selectedDate && root._solarLiveProfile?.length ? `Open-Meteo hourly profile for ${selectedDate}` : profile.length ? "Saved Open-Meteo hourly profile" : "Estimated from daily peak and sun elevation");
    setText(root, "[data-solar-power]", `${power.toFixed(1)} kW`);
    setText(root, "[data-solar-energy-pace]", `About ${power.toFixed(1)} kWh if sustained for one hour`);
    setText(root, "[data-solar-daily-production]", entry ? `${Number(entry.production_kwh || 0).toFixed(1)} kWh` : "No record");
    setText(root, "[data-solar-record-date]", entry ? `Sunrun record for ${selectedDate}` : `No Sunrun record for ${selectedDate}`);
    const daylightArc = normalize(sunsetPosition.azimuth - sunrisePosition.azimuth);
    setText(root, "[data-solar-sky-title]", "Selected daylight arc");
    setText(root, "[data-solar-sky-detail]", `The sun travels about ${daylightArc.toFixed(0)}° across the visible sky, rising near ${sunrisePosition.azimuth.toFixed(0)}° ${directionLabel(sunrisePosition.azimuth)} and setting near ${sunsetPosition.azimuth.toFixed(0)}° ${directionLabel(sunsetPosition.azimuth)}.`);
    const takeaways = root.querySelector("[data-solar-takeaways]");
    if (takeaways) takeaways.innerHTML = [
      `The selected solar window lasts <strong>${daylightHours.toFixed(1)} hours</strong>, from ${formatMinute(events.sunrise)} to ${formatMinute(events.sunset)}.`,
      `The sun rises near <strong>${sunrisePosition.azimuth.toFixed(0)}° ${directionLabel(sunrisePosition.azimuth)}</strong> and sets near <strong>${sunsetPosition.azimuth.toFixed(0)}° ${directionLabel(sunsetPosition.azimuth)}</strong>.`,
      `Solar noon is near <strong>${formatMinute(events.noon)}</strong>, with a peak elevation of about ${geometry.peakElevation.toFixed(0)}°.`,
      position.elevation > 0 ? `${displayWeather} conditions correspond to an estimated <strong>${power.toFixed(1)} kW</strong> at ${formatMinute(minute)}.` : `The modeled system is at <strong>0 kW overnight</strong>.`,
      entry ? `The Sunrun daily record is <strong>${Number(entry.production_kwh || 0).toFixed(1)} kWh</strong> for ${selectedDate}.` : `There is <strong>no stored Sunrun record</strong> for ${selectedDate}.`
    ].map((item) => `<li>${item}</li>`).join("");
    renderHourlyRows(root, reference, events, geometry, profile, entry, location);
  }

  async function refreshWeather(root, requestedDate = null) {
    try {
      const today = localIsoDate(new Date());
      const selectedDate = requestedDate || root._solarReviewDate || today;
      const isToday = selectedDate === today;
      const url = new URL(isToday ? "https://api.open-meteo.com/v1/forecast" : "https://archive-api.open-meteo.com/v1/archive");
      url.searchParams.set("latitude", String(LATITUDE));
      url.searchParams.set("longitude", String(LONGITUDE));
      url.searchParams.set("hourly", "shortwave_radiation_instant,cloud_cover,weather_code");
      url.searchParams.set("daily", "sunrise,sunset");
      url.searchParams.set("timezone", TIME_ZONE);
      if (isToday) url.searchParams.set("forecast_days", "1");
      else {
        url.searchParams.set("start_date", selectedDate);
        url.searchParams.set("end_date", selectedDate);
      }
      const response = await fetch(url.toString(), { cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const payload = await response.json();
      const indexes = (payload.hourly?.time || []).map((value, index) => String(value).startsWith(`${selectedDate}T`) ? index : -1).filter((index) => index >= 0);
      root._solarLiveProfile = indexes.map((index) => ({
        minute: parseApiTime(payload.hourly.time[index]),
        irradiance: Number(payload.hourly.shortwave_radiation_instant?.[index] || 0),
        cloud: Number(payload.hourly.cloud_cover?.[index] || 0)
      }));
      root._solarLiveProfileDate = selectedDate;
      const reviewMinute = root._solarReviewMinute ?? localMinute(new Date());
      const nearest = root._solarLiveProfile.reduce((best, point, index) => Math.abs(point.minute - reviewMinute) < Math.abs(root._solarLiveProfile[best]?.minute - reviewMinute) ? index : best, 0);
      const sourceIndex = indexes[nearest];
      root._solarLiveWeather = weatherFromCode(payload.hourly.weather_code?.[sourceIndex]);
      root._solarLiveWeatherDate = selectedDate;
      const sunrise = parseApiTime(payload.daily?.sunrise?.[0]);
      const sunset = parseApiTime(payload.daily?.sunset?.[0]);
      if (sunrise != null && sunset != null) {
        root._solarLiveEvents = { sunrise, sunset, noon: (sunrise + sunset) / 2 };
        root._solarLiveEventsDate = selectedDate;
      }
    } catch (_error) {
      root._solarLiveProfile = null;
      root._solarLiveProfileDate = null;
    }
    render(root);
  }

  // Use absolute UTC samples so seasonal paths do not depend on the browser's timezone.
  function seasonalPaths(year, location) {
    return [
      { name: "Summer", date: "06-21", label: "Jun 21", color: "#ffe078", dash: "" },
      { name: "Fall", date: "09-22", label: "Sep 22", color: "#ffad76", dash: "" },
      { name: "Winter", date: "12-21", label: "Dec 21", color: "#8bdcff", dash: "6 5" },
      { name: "Spring", date: "03-20", label: "Mar 20", color: "#97f3b5", dash: "12 9" }
    ].map((season) => {
      const start = Date.parse(`${year}-${season.date}T00:00:00Z`);
      const points = [];
      let previous = null;
      let peak = 0;
      for (let minute = 0; minute <= 1440; minute += 4) {
        const position = solarPosition(new Date(start + minute * 60000), location);
        peak = Math.max(peak, position.elevation);
        if (previous && (previous.elevation >= 0) !== (position.elevation >= 0)) {
          const fraction = -previous.elevation / (position.elevation - previous.elevation);
          points.push({ azimuth: previous.azimuth + fraction * (position.azimuth - previous.azimuth), elevation: 0 });
        }
        if (position.elevation >= 0) points.push(position);
        previous = position;
      }
      // Sorting also joins the evening samples that can fall after midnight UTC.
      points.sort((a, b) => a.azimuth - b.azimuth);
      const path = points.map((point, index) => `${index ? "L" : "M"}${(65 + (point.azimuth - 45) / 270 * 890).toFixed(2)},${(305 - point.elevation / 90 * 270).toFixed(2)}`).join(" ");
      return { ...season, peak, path };
    });
  }

  function renderSeasons(root) {
    const overlay = root.querySelector("[data-solar-seasons]");
    if (!overlay || overlay.hidden) return;
    const year = Number((root._solarReviewDate || localIsoDate(new Date())).slice(0, 4));
    const location = LOCATIONS[root._solarLocationKey] || DEFAULT_LOCATION;
    const renderKey = `${year}-${root._solarLocationKey || "yorktown"}`;
    if (overlay.dataset.renderKey === renderKey) return;
    overlay.dataset.renderKey = renderKey;
    const seasons = seasonalPaths(year, location);
    const horizontal = [0, 30, 60, 90].map((degree) => {
      const y = 305 - degree * 3;
      return `<line x1="65" y1="${y}" x2="955" y2="${y}" stroke="#ffffff" stroke-opacity="0.18"/><text x="52" y="${y + 5}" text-anchor="end">${degree}°</text>`;
    }).join("");
    const compass = [[45, "NE"], [90, "E"], [180, "S"], [270, "W"], [315, "NW"]].map(([degree, label]) => {
      const x = 65 + (degree - 45) / 270 * 890;
      return `<text x="${x}" y="332" text-anchor="middle">${label} ${degree}°</text>`;
    }).join("");
    overlay.querySelector("[data-season-chart]").innerHTML = `<svg viewBox="0 0 1000 355" role="img" aria-label="All four seasonal sun paths for ${location.label}, ${year}. Horizontal axis: compass azimuth. Vertical axis: elevation, 0 to 90 degrees.">${horizontal}${compass}${seasons.map((season) => `<path d="${season.path}" fill="none" stroke="${season.color}" stroke-width="${season.name === "Fall" ? 6 : 3.5}" stroke-dasharray="${season.dash}" vector-effect="non-scaling-stroke"><title>${season.name}: ${season.label}, peak ${season.peak.toFixed(0)}°</title></path>`).join("")}</svg>`;
    overlay.querySelector("[data-season-legend]").innerHTML = seasons.map((season) => `<span style="--season-color:${season.color}"><svg width="30" height="10" aria-hidden="true"><line x1="0" y1="5" x2="30" y2="5" stroke="${season.color}" stroke-width="3" stroke-dasharray="${season.dash}"/></svg><strong>${season.name}</strong> · ${season.label} · ${season.peak.toFixed(0)}° peak</span>`).join("");
    overlay.querySelector("[data-season-year]").textContent = year;
    overlay.querySelector("[data-season-location]").textContent = location.label;
  }

  function initializeSeasons(root) {
    const sky = root.querySelector("[data-solar-sky]");
    const controls = root.querySelector(".solar-review-button-row");
    if (!sky || !controls) return;
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = "Show Seasonal Arcs";
    button.setAttribute("aria-expanded", "false");
    button.dataset.solarSeasonsToggle = "";
    const overlay = document.createElement("section");
    overlay.className = "solar-season-overlay";
    overlay.dataset.solarSeasons = "";
    overlay.hidden = true;
    overlay.setAttribute("aria-label", "Seasonal sun path comparison");
    overlay.innerHTML = `<div class="solar-season-heading"><div><h3>Four Seasons · <span data-season-year></span></h3><p><span data-season-location>Yorktown Heights, NY</span> · Sun elevation by compass direction</p></div><button type="button" data-season-close aria-label="Close seasonal arcs">Close ×</button></div><div class="solar-season-chart" data-season-chart></div><div class="solar-season-legend" data-season-legend></div><p class="solar-season-note">Reference dates near the solstices and equinoxes. Spring and fall nearly overlap; spring uses green dashes over the orange fall arc.</p>`;
    const guideButton = document.createElement("button");
    guideButton.type = "button";
    guideButton.textContent = "Solar Elevation Guide";
    guideButton.setAttribute("aria-expanded", "false");
    overlay.querySelector(".solar-season-heading").insertBefore(guideButton, overlay.querySelector("[data-season-close]"));
    const guide = document.createElement("section");
    guide.className = "solar-elevation-guide";
    guide.hidden = true;
    guide.setAttribute("aria-label", "Solar elevation guide");
    guide.innerHTML = `<div class="solar-season-heading"><h3>Solar Elevation Guide</h3><button type="button" data-guide-back>Back to Arcs</button></div>
      <p><strong>Solar elevation angle</strong>, also called <strong>solar altitude</strong>, is the sun’s angular height above the horizon. <strong>0° = horizon</strong>, <strong>45° = halfway up</strong>, and <strong>90° = directly overhead</strong> (the zenith).</p>
      <h4>How high is the sun at solar noon?</h4>
      <p>Approximate seasonal angles for three locations. Solar noon is when the sun reaches its highest point that day; it is not necessarily 12:00 PM on the clock.</p>
      <div class="solar-elevation-table" tabindex="0" role="region" aria-label="Seasonal elevation comparison; scroll horizontally on small screens"><table><thead><tr><th scope="col">Location</th><th scope="col">Spring Equinox</th><th scope="col">Summer Solstice</th><th scope="col">Fall Equinox</th><th scope="col">Winter Solstice</th></tr></thead><tbody>
      <tr><th scope="row">Yorktown Heights, NY<br><small>~41.3° N</small></th><td>48.7°</td><td>72.1°</td><td>48.7°</td><td>25.3°</td></tr>
      <tr><th scope="row">Dallas, TX<br><small>~32.8° N</small></th><td>57.2°</td><td>80.7°</td><td>57.2°</td><td>33.8°</td></tr>
      <tr><th scope="row">Negril, Jamaica<br><small>~18.3° N</small></th><td>71.7°</td><td>84.8°*</td><td>71.7°</td><td>48.3°</td></tr>
      </tbody></table></div>
      <p class="solar-elevation-formula">Solar-noon elevation ≈ 90° − |latitude − solar declination|. Values are approximate; the dated arcs may differ slightly due to the selected date and rounding.</p>
      <h4>Why spring and fall share almost the same arc</h4><p>Near both equinoxes, the sun is near the celestial equator. Its daily paths therefore nearly overlap: the chart shows green spring dashes over the orange fall arc.</p>
      <h4>*Negril can reach 90° overhead</h4><p>Negril is inside the tropics, so the sun passes directly overhead twice a year, once before and once after the June solstice. At the solstice itself, the sun is north of Negril’s latitude, giving an elevation of about <strong>84.8°</strong>.</p>
      <p><strong>Highest annual sun elevation:</strong> Yorktown ≈ 72.1° → Dallas ≈ 80.7° → Negril = 90°.</p><p>Near an overhead sun, upright objects cast very short shadows at solar noon. Sunlight arrives more directly, although heat and UV exposure also depend on weather and atmospheric conditions.</p>`;
    overlay.appendChild(guide);
    const setGuideOpen = (open) => {
      guide.hidden = !open;
      guideButton.setAttribute("aria-expanded", String(open));
      if (open) { guide.scrollTop = 0; guide.querySelector("[data-guide-back]").focus(); }
      else guideButton.focus();
    };
    guideButton.addEventListener("click", () => setGuideOpen(true));
    guide.querySelector("[data-guide-back]").addEventListener("click", () => setGuideOpen(false));
    controls.appendChild(button);
    sky.appendChild(overlay);
    const setOpen = (open) => {
      overlay.hidden = !open;
      if (!open) { guide.hidden = true; guideButton.setAttribute("aria-expanded", "false"); }
      button.setAttribute("aria-expanded", String(open));
      button.textContent = open ? "Hide Seasonal Arcs" : "Show Seasonal Arcs";
      renderSeasons(root);
    };
    button.addEventListener("click", () => setOpen(overlay.hidden));
    overlay.querySelector("[data-season-close]").addEventListener("click", () => { setOpen(false); button.focus(); });
    root.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !overlay.hidden) { if (!guide.hidden) setGuideOpen(false); else { setOpen(false); button.focus(); } }
    });
  }

  function initialize(root) {
    if (root.dataset.solarTrackerBound === "true") return;
    root.dataset.solarTrackerBound = "true";
    initializeSeasons(root);
    root._solarEntryHistory = parseHistory(root);
    if (!root._solarEntryHistory.length && root.dataset.entryDate) {
      root._solarEntryHistory = [{
        entry_date: root.dataset.entryDate,
        weather: root.dataset.weather,
        cloud_cover_pct: root.dataset.cloudCover,
        irradiance_peak_wm2: root.dataset.irradiancePeak,
        production_kwh: root.dataset.dailyProduction,
        irradiance_hourly_profile: []
      }];
    }
    const toggle = root.querySelector("[data-solar-path-toggle]");
    const panel = root.querySelector("[data-solar-path-panel]");
    toggle?.addEventListener("click", () => {
      const willOpen = panel.hidden;
      panel.hidden = !willOpen;
      toggle.setAttribute("aria-expanded", String(willOpen));
      root.classList.toggle("is-expanded", willOpen);
      setText(root, "[data-solar-toggle-label]", willOpen ? "Collapse tracker" : "Expand tracker");
      if (willOpen) render(root);
    });

    const dateInput = root.querySelector("[data-solar-review-date]");
    const timeInput = root.querySelector("[data-solar-review-time]");
    const locationInput = root.querySelector("[data-solar-location]");
    const playButton = root.querySelector("[data-solar-play]");
    if (locationInput) {
      locationInput.value = root._solarLocationKey || "yorktown";
      locationInput.addEventListener("change", () => {
        root._solarLocationKey = LOCATIONS[locationInput.value] ? locationInput.value : "yorktown";
        root._solarLiveEventsDate = null;
        render(root);
      });
    }
    const stopPlayback = () => {
      if (root._solarPlaybackTimer) window.clearInterval(root._solarPlaybackTimer);
      root._solarPlaybackTimer = null;
      if (playButton) playButton.textContent = "Play Day";
    };
    const reviewDate = async (isoDate) => {
      stopPlayback();
      root._solarReviewDate = isoDate;
      if (root._solarReviewMinute == null) root._solarReviewMinute = localMinute(new Date());
      render(root);
      await refreshWeather(root, isoDate);
    };
    dateInput?.addEventListener("change", () => {
      if (dateInput.value) reviewDate(dateInput.value);
    });
    timeInput?.addEventListener("input", () => {
      stopPlayback();
      root._solarReviewDate = dateInput?.value || localIsoDate(new Date());
      root._solarReviewMinute = Number(timeInput.value);
      render(root);
    });
    root.querySelector("[data-solar-previous-hour]")?.addEventListener("click", () => {
      stopPlayback();
      root._solarReviewDate = dateInput?.value || localIsoDate(new Date());
      root._solarReviewMinute = clamp(Number(timeInput?.value || localMinute(new Date())) - 60, Number(timeInput?.min || 0), Number(timeInput?.max || 1440));
      render(root);
    });
    root.querySelector("[data-solar-next-hour]")?.addEventListener("click", () => {
      stopPlayback();
      root._solarReviewDate = dateInput?.value || localIsoDate(new Date());
      root._solarReviewMinute = clamp(Number(timeInput?.value || localMinute(new Date())) + 60, Number(timeInput?.min || 0), Number(timeInput?.max || 1440));
      render(root);
    });
    root.querySelector("[data-solar-previous-day]")?.addEventListener("click", () => reviewDate(shiftIsoDate(dateInput?.value || localIsoDate(new Date()), -1)));
    root.querySelector("[data-solar-next-day]")?.addEventListener("click", () => {
      const nextDate = shiftIsoDate(dateInput?.value || localIsoDate(new Date()), 1);
      if (nextDate <= localIsoDate(new Date())) reviewDate(nextDate);
    });
    root.querySelector("[data-solar-live]")?.addEventListener("click", () => {
      stopPlayback();
      root._solarReviewDate = null;
      root._solarReviewMinute = null;
      refreshWeather(root, localIsoDate(new Date()));
    });
    playButton?.addEventListener("click", () => {
      if (root._solarPlaybackTimer) {
        stopPlayback();
        return;
      }
      root._solarReviewDate = dateInput?.value || localIsoDate(new Date());
      const minimum = Number(timeInput?.min || 360);
      const maximum = Number(timeInput?.max || 1200);
      root._solarReviewMinute = minimum;
      playButton.textContent = "Pause";
      render(root);
      root._solarPlaybackTimer = window.setInterval(() => {
        if (!root.isConnected) {
          stopPlayback();
          return;
        }
        root._solarReviewMinute += 15;
        if (root._solarReviewMinute > maximum) root._solarReviewMinute = minimum;
        render(root);
      }, 700);
    });
    render(root);
    refreshWeather(root);
    const positionTimer = window.setInterval(() => root.isConnected ? render(root) : window.clearInterval(positionTimer), POSITION_REFRESH_MS);
    const weatherTimer = window.setInterval(() => root.isConnected ? refreshWeather(root) : window.clearInterval(weatherTimer), WEATHER_REFRESH_MS);
  }

  function initializeAll(scope = document) {
    scope.querySelectorAll?.("[data-solar-path-tracker]").forEach(initialize);
  }

  window.initializeSolarPathTrackers = initializeAll;
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => initializeAll());
  else initializeAll();
  new MutationObserver(() => initializeAll()).observe(document.documentElement, { childList: true, subtree: true });
})();
