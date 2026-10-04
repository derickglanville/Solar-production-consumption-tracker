"""NYSEG hourly import/export report built from the local utility interval CSV."""
from __future__ import annotations

import csv
from collections import defaultdict
from datetime import date, datetime
from pathlib import Path
from typing import Any

PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_INTERVAL_USAGE_PATH = PROJECT_ROOT / "SunRun Data" / "NYSEG_Daily_Usage_Data.csv"
FALLBACK_INTERVAL_USAGE_PATH = PROJECT_ROOT / "NYSEG Bill" / "Data" / "nyseg_electric_60_Minute_07-01-2026_10-03-2026.csv"


def _number(value: Any) -> float:
    try:
        return float(value or 0.0)
    except (TypeError, ValueError):
        return 0.0


def _empty_report() -> dict[str, Any]:
    return {"available": False, "source_name": DEFAULT_INTERVAL_USAGE_PATH.name, "monthly": [], "daily": [], "hourly": [], "summary": {}}



def load_nyseg_interval_file_rows(path: Path | None = None) -> dict[str, Any]:
    """Return the locally downloaded interval file for an on-screen review table."""
    source_path = path or DEFAULT_INTERVAL_USAGE_PATH
    if not source_path.is_file() and path is None:
        source_path = FALLBACK_INTERVAL_USAGE_PATH
    if not source_path.is_file():
        return {"available": False, "source_name": DEFAULT_INTERVAL_USAGE_PATH.name, "rows": []}
    fields = ["Date", "Start Time", "End Time", "Net", "Units", "Costs", "Weather", "Delivered", "Received"]
    with source_path.open("r", encoding="utf-8-sig", newline="") as handle:
        rows = []
        for row in csv.DictReader(handle):
            start_raw, end_raw = row.get("Start Time", ""), row.get("End Time", "")
            try:
                start_label = datetime.fromisoformat(start_raw).strftime("%b %#d, %Y · %#I:%M %p")
                end_label = datetime.fromisoformat(end_raw).strftime("%#I:%M %p")
            except ValueError:
                start_label, end_label = start_raw, end_raw
            values = {field: row.get(field, "") for field in fields}
            values["m02_m01_diff"] = _number(values["Received"]) - _number(values["Delivered"])
            rows.append({**values, "start_label": start_label, "end_label": end_label})
    daily: dict[str, dict[str, Any]] = {}
    for row in rows:
        summary = daily.setdefault(row["Date"], {"Date": row["Date"], "start_label": row["start_label"], "end_label": row["end_label"], "Net": 0.0, "Costs": 0.0, "Weather": [], "Delivered": 0.0, "Received": 0.0, "interval_count": 0, "Units": row["Units"] or "kWh"})
        summary["end_label"] = row["end_label"]
        for field in ("Net", "Costs", "Delivered", "Received"):
            summary[field] += _number(row[field])
        summary["Weather"].append(_number(row["Weather"]))
        summary["interval_count"] += 1
    daily_rows = []
    for summary in daily.values():
        summary["Weather"] = sum(summary["Weather"]) / len(summary["Weather"]) if summary["Weather"] else 0.0
        summary["m02_m01_diff"] = summary["Received"] - summary["Delivered"]
        daily_rows.append(summary)
    return {"available": True, "source_name": source_path.name, "fields": fields, "rows": rows, "daily_rows": daily_rows}

def build_nyseg_interval_usage_report(path: Path | None = None) -> dict[str, Any]:
    """Summarize Delivered (grid import) and Received (grid export) hourly readings."""
    source_path = path or DEFAULT_INTERVAL_USAGE_PATH
    if not source_path.is_file() and path is None:
        source_path = FALLBACK_INTERVAL_USAGE_PATH
    if not source_path.is_file():
        return _empty_report()

    daily: dict[str, dict[str, float]] = defaultdict(lambda: {"import_kwh": 0.0, "export_kwh": 0.0, "net_kwh": 0.0, "temperature_total": 0.0, "intervals": 0.0})
    hourly: dict[int, dict[str, float]] = defaultdict(lambda: {"import_kwh": 0.0, "export_kwh": 0.0, "net_kwh": 0.0, "intervals": 0.0})
    row_count = 0
    with source_path.open("r", encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            day_key = (row.get("Date") or "").strip()
            timestamp = (row.get("Start Time") or "").strip()
            if not day_key or not timestamp:
                continue
            try:
                hour = datetime.fromisoformat(timestamp).hour
            except ValueError:
                continue
            imported = _number(row.get("Delivered"))
            exported = _number(row.get("Received"))
            net = _number(row.get("Net"))
            temperature = _number(row.get("Weather"))
            bucket = daily[day_key]
            bucket["import_kwh"] += imported
            bucket["export_kwh"] += exported
            bucket["net_kwh"] += net
            bucket["temperature_total"] += temperature
            bucket["intervals"] += 1
            clock = hourly[hour]
            clock["import_kwh"] += imported
            clock["export_kwh"] += exported
            clock["net_kwh"] += net
            clock["intervals"] += 1
            row_count += 1

    if not daily:
        return _empty_report()

    daily_rows = []
    monthly: dict[str, dict[str, float]] = defaultdict(lambda: {"import_kwh": 0.0, "export_kwh": 0.0, "net_kwh": 0.0, "days": 0.0})
    for day_key, values in sorted(daily.items()):
        month_key = day_key[:7]
        net_export = values["export_kwh"] - values["import_kwh"]
        daily_rows.append({
            "date": day_key,
            "import_kwh": values["import_kwh"],
            "export_kwh": values["export_kwh"],
            "net_export_kwh": net_export,
            "average_temperature_f": values["temperature_total"] / values["intervals"] if values["intervals"] else 0.0,
        })
        month = monthly[month_key]
        month["import_kwh"] += values["import_kwh"]
        month["export_kwh"] += values["export_kwh"]
        month["net_kwh"] += values["net_kwh"]
        month["days"] += 1

    monthly_rows = []
    for month_key, values in sorted(monthly.items()):
        monthly_rows.append({
            "month": date.fromisoformat(f"{month_key}-01").strftime("%B %Y"),
            "month_key": month_key,
            "import_kwh": values["import_kwh"],
            "export_kwh": values["export_kwh"],
            "net_export_kwh": values["export_kwh"] - values["import_kwh"],
            "days": int(values["days"]),
        })

    hourly_rows = []
    for hour in range(24):
        values = hourly[hour]
        hourly_rows.append({
            "hour": hour,
            "label": f"{(hour % 12) or 12} {'AM' if hour < 12 else 'PM'}",
            "import_kwh": values["import_kwh"],
            "export_kwh": values["export_kwh"],
            "net_export_kwh": values["export_kwh"] - values["import_kwh"],
        })

    total_import = sum(row["import_kwh"] for row in daily_rows)
    total_export = sum(row["export_kwh"] for row in daily_rows)
    daytime_export = sum(row["export_kwh"] for row in hourly_rows if 9 <= row["hour"] <= 17)
    overnight_import = sum(row["import_kwh"] for row in hourly_rows if row["hour"] < 8 or row["hour"] >= 18)
    largest_export_hour = max(hourly_rows, key=lambda row: row["export_kwh"])
    largest_import_hour = max(hourly_rows, key=lambda row: row["import_kwh"])
    return {
        "available": True,
        "source_name": source_path.name,
        "source_start": min(daily),
        "source_end": max(daily),
        "row_count": row_count,
        "summary": {
            "import_kwh": total_import,
            "export_kwh": total_export,
            "net_export_kwh": total_export - total_import,
            "export_to_import_ratio": total_export / total_import if total_import else 0.0,
            "daytime_export_kwh": daytime_export,
            "overnight_import_kwh": overnight_import,
            "largest_export_hour": largest_export_hour,
            "largest_import_hour": largest_import_hour,
        },
        "monthly": monthly_rows,
        "daily": list(reversed(daily_rows)),
        "hourly": hourly_rows,
    }
