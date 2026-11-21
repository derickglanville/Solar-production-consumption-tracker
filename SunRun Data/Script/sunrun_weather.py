from __future__ import annotations

import json
import urllib.parse
import urllib.request
from datetime import date, datetime, timedelta
from typing import Optional

from sunrun_config import (
    WEATHER_LATITUDE,
    WEATHER_LOCATION_NAME,
    WEATHER_LONGITUDE,
    WEATHER_TIMEOUT_SECONDS,
)
from sunrun_models import WeatherSummary


def _parse_float(value: object) -> Optional[float]:
    try:
        if value is None or str(value).strip() == "":
            return None
        return float(str(value).replace(",", ""))
    except (TypeError, ValueError):
        return None


def _weather_code_description(code: object) -> str:
    descriptions = {
        0: "Clear sky", 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast",
        45: "Fog", 48: "Rime fog", 51: "Light drizzle", 53: "Drizzle",
        55: "Heavy drizzle", 61: "Light rain", 63: "Rain", 65: "Heavy rain",
        71: "Light snow", 73: "Snow", 75: "Heavy snow", 80: "Rain showers",
        81: "Rain showers", 82: "Heavy rain showers", 95: "Thunderstorms",
        96: "Thunderstorms with hail", 99: "Severe thunderstorms with hail",
    }
    try:
        return descriptions.get(int(code), "Weather conditions available")
    except (TypeError, ValueError):
        return "Weather conditions available"


def _request_payload(url: str) -> dict:
    request = urllib.request.Request(
        url, headers={"User-Agent": "SunrunEnergyAnalytics/3.0"}
    )
    with urllib.request.urlopen(
        request, timeout=WEATHER_TIMEOUT_SECONDS
    ) as response:
        return json.loads(response.read().decode("utf-8"))


def _summary_from_payload(payload: dict, source_note: str) -> WeatherSummary:
    daily = payload.get("daily", {})
    hourly = payload.get("hourly", {})

    def first(name: str) -> Optional[float]:
        values = daily.get(name) or []
        return _parse_float(values[0]) if values else None

    humidity_values = [
        _parse_float(v) for v in hourly.get("relative_humidity_2m", [])
    ]
    humidity_values = [v for v in humidity_values if v is not None]

    radiation_values = [
        _parse_float(v) for v in hourly.get("shortwave_radiation", [])
    ]
    radiation_values = [v for v in radiation_values if v is not None]

    codes = daily.get("weather_code") or []
    return WeatherSummary(
        available=True,
        condition=_weather_code_description(codes[0] if codes else None),
        high_temperature_f=first("temperature_2m_max"),
        low_temperature_f=first("temperature_2m_min"),
        precipitation_probability_percent=first(
            "precipitation_probability_max"
        ),
        humidity_percent=(
            sum(humidity_values) / len(humidity_values)
            if humidity_values else None
        ),
        wind_mph=first("wind_speed_10m_max"),
        solar_radiation_w_m2=(
            max(radiation_values) if radiation_values else None
        ),
        source_note=source_note,
    )


def fetch_weather_summary(target_date: Optional[str]) -> WeatherSummary:
    """Fetch a daily weather summary.

    Current and recent dates use the forecast endpoint so the 8:30 PM job can
    populate the same day's completed/near-completed values. Older dates use
    the archive endpoint.
    """
    try:
        parsed_date = datetime.strptime(target_date or "", "%Y-%m-%d").date()
    except ValueError:
        parsed_date = date.today()

    common = {
        "latitude": WEATHER_LATITUDE,
        "longitude": WEATHER_LONGITUDE,
        "start_date": parsed_date.isoformat(),
        "end_date": parsed_date.isoformat(),
        "daily": (
            "weather_code,temperature_2m_max,temperature_2m_min,"
            "precipitation_probability_max,wind_speed_10m_max,"
            "shortwave_radiation_sum"
        ),
        "hourly": "relative_humidity_2m,shortwave_radiation",
        "temperature_unit": "fahrenheit",
        "wind_speed_unit": "mph",
        "timezone": "America/New_York",
    }

    # Forecast API supports the current day and recent past_days data.
    recent_cutoff = date.today() - timedelta(days=5)
    if parsed_date >= recent_cutoff:
        query = urllib.parse.urlencode(common)
        url = f"https://api.open-meteo.com/v1/forecast?{query}"
        source = (
            f"Open-Meteo forecast/current-day data for "
            f"{WEATHER_LOCATION_NAME}"
        )
    else:
        query = urllib.parse.urlencode(common)
        url = f"https://archive-api.open-meteo.com/v1/archive?{query}"
        source = f"Open-Meteo archive for {WEATHER_LOCATION_NAME}"

    try:
        return _summary_from_payload(_request_payload(url), source)
    except Exception as exc:
        return WeatherSummary(
            available=False,
            condition="Weather unavailable",
            high_temperature_f=None,
            low_temperature_f=None,
            precipitation_probability_percent=None,
            humidity_percent=None,
            wind_mph=None,
            solar_radiation_w_m2=None,
            source_note=f"Weather lookup skipped: {exc}",
        )
