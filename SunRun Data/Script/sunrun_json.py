from __future__ import annotations

import csv
import json
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

from sunrun_config import JSON_FILE, SYSTEM_ACTIVATION_DATE
from sunrun_metrics import aggregate_metrics, calculate_metrics, add_financial_fields
from sunrun_weather import fetch_weather_summary

SCHEMA_VERSION = 2


def _number(value: object) -> Optional[float]:
    if value is None or str(value).strip() == "":
        return None
    try:
        return float(str(value).replace(",", ""))
    except (TypeError, ValueError):
        return None


def load_history(path: Path = JSON_FILE) -> dict:
    if not path.is_file():
        return {
            "schema_version": SCHEMA_VERSION,
            "system_activation_date": SYSTEM_ACTIVATION_DATE.isoformat(),
            "updated_at": None,
            "entries": [],
            "lifetime": {},
        }
    with path.open("r", encoding="utf-8") as handle:
        data = json.load(handle)
    data.setdefault("schema_version", SCHEMA_VERSION)
    data.setdefault("system_activation_date", SYSTEM_ACTIVATION_DATE.isoformat())
    data.setdefault("entries", [])
    data.setdefault("lifetime", {})
    return data


def save_history(data: dict, path: Path = JSON_FILE) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    data["schema_version"] = SCHEMA_VERSION
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    data["entries"] = sorted(data.get("entries", []), key=lambda e: e["date"])
    data["lifetime"] = aggregate_metrics(data["entries"])
    temp = path.with_suffix(".tmp")
    with temp.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2, ensure_ascii=False)
        handle.write("\n")
    temp.replace(path)
    return path


def merge_production_csv(data: dict, csv_path: Path) -> None:
    by_date = {entry["date"]: entry for entry in data["entries"]}

    with csv_path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for row in reader:
            date_text = str(row.get("Date", "")).strip()
            production = _number(row.get("Solar Produced (kWh)"))
            sunrun_meter = _number(row.get("End-of-Day Meter Reading (kWh)"))

            if not date_text or production is None or sunrun_meter is None:
                continue
            if production == 0 and sunrun_meter == 0:
                continue

            entry = by_date.setdefault(date_text, {"date": date_text})
            entry["production_kwh"] = round(production, 3)
            entry["sunrun_end_of_day_meter_kwh"] = round(sunrun_meter, 3)
            entry.setdefault("meter01_grid_import", None)
            entry.setdefault("meter02_grid_export", None)
            entry.setdefault("irradiance_w_m2", None)
            entry.setdefault("weather", None)
            entry.setdefault("high_f", None)
            entry.setdefault("low_f", None)
            entry.setdefault("source", {})
            entry["source"]["production"] = csv_path.name

    data["entries"] = list(by_date.values())


def update_latest_weather(data: dict) -> None:
    if not data["entries"]:
        return
    latest = max(data["entries"], key=lambda e: e["date"])
    weather = fetch_weather_summary(latest["date"])
    latest["weather"] = weather.condition
    latest["high_f"] = weather.high_temperature_f
    latest["low_f"] = weather.low_temperature_f
    if latest.get("irradiance_w_m2") is None:
        latest["irradiance_w_m2"] = weather.solar_radiation_w_m2
    latest.setdefault("source", {})
    latest["source"]["weather"] = weather.source_note


def recalculate_all(data: dict) -> None:
    entries = sorted(data["entries"], key=lambda e: e["date"])
    previous = None

    for entry in entries:
        metrics = calculate_metrics(
            date=entry["date"],
            production_kwh=_number(entry.get("production_kwh")),
            meter01_import=_number(entry.get("meter01_grid_import")),
            previous_meter01_import=(
                _number(previous.get("meter01_grid_import"))
                if previous else None
            ),
            meter02_export=_number(entry.get("meter02_grid_export")),
            previous_meter02_export=(
                _number(previous.get("meter02_grid_export"))
                if previous else None
            ),
        )
        entry["derived"] = {
            "daily_import_kwh": _round(metrics.daily_import_kwh),
            "daily_export_kwh": _round(metrics.daily_export_kwh),
            "self_consumed_kwh": _round(metrics.self_consumed_kwh),
            "home_consumption_kwh": _round(metrics.home_consumption_kwh),
            "net_grid_kwh": _round(metrics.net_grid_kwh),
            "self_consumption_percent": _round(
                metrics.self_consumption_percent, 2
            ),
            "export_percent": _round(metrics.export_percent, 2),
            "solar_coverage_percent": _round(
                metrics.solar_coverage_percent, 2
            ),
            "grid_dependence_percent": _round(
                metrics.grid_dependence_percent, 2
            ),
        }
        previous = entry

    add_financial_fields(entries)
    data["entries"] = entries


def _round(value: Optional[float], digits: int = 3) -> Optional[float]:
    return round(value, digits) if value is not None else None


def update_meter_reading(
    date_text: str,
    meter01: float,
    meter02: float,
    *,
    irradiance: Optional[float] = None,
    weather: Optional[str] = None,
    high_f: Optional[float] = None,
    low_f: Optional[float] = None,
    source_note: str = "manual/dashboard entry",
    path: Path = JSON_FILE,
) -> Path:
    data = load_history(path)
    by_date = {entry["date"]: entry for entry in data["entries"]}
    entry = by_date.setdefault(date_text, {"date": date_text})
    entry["meter01_grid_import"] = float(meter01)
    entry["meter02_grid_export"] = float(meter02)
    if irradiance is not None:
        entry["irradiance_w_m2"] = float(irradiance)
    if weather is not None:
        entry["weather"] = weather
    if high_f is not None:
        entry["high_f"] = float(high_f)
    if low_f is not None:
        entry["low_f"] = float(low_f)
    entry.setdefault("source", {})
    entry["source"]["meter"] = source_note
    data["entries"] = list(by_date.values())
    recalculate_all(data)
    return save_history(data, path)



def update_weather_for_date(
    date_text: str,
    *,
    path: Path = JSON_FILE,
) -> tuple[dict, Path]:
    data = load_history(path)
    by_date = {entry["date"]: entry for entry in data["entries"]}
    entry = by_date.setdefault(date_text, {"date": date_text})

    summary = fetch_weather_summary(date_text)
    if not summary.available:
        raise RuntimeError(summary.source_note)

    entry["irradiance_w_m2"] = _round(summary.solar_radiation_w_m2, 1)
    entry["weather"] = summary.condition
    entry["high_f"] = _round(summary.high_temperature_f, 1)
    entry["low_f"] = _round(summary.low_temperature_f, 1)
    entry.setdefault("source", {})
    entry["source"]["weather"] = summary.source_note
    entry["source"]["irradiance"] = summary.source_note

    data["entries"] = list(by_date.values())
    recalculate_all(data)
    saved = save_history(data, path)
    return data, saved

def update_history_from_csv(
    csv_path: Path,
    *,
    path: Path = JSON_FILE,
    update_weather: bool = True,
) -> tuple[dict, Path]:
    data = load_history(path)
    merge_production_csv(data, csv_path)
    if update_weather:
        update_latest_weather(data)
    recalculate_all(data)
    saved = save_history(data, path)
    return data, saved
