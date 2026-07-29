from __future__ import annotations

import csv
from dataclasses import dataclass
from datetime import date
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
SUNRUN_CSV_PATH = PROJECT_ROOT / "SunRun Data" / "Sunrun_Daily_Production_Data.csv"


@dataclass
class SunrunProductionRow:
    entry_date: date
    production_kwh: float
    end_of_day_meter_kwh: float
    available: bool


def _parse_float(value: str | None) -> float:
    try:
        return float((value or "").strip() or 0.0)
    except ValueError:
        return 0.0


def load_sunrun_daily_production() -> dict:
    if not SUNRUN_CSV_PATH.exists():
        return {
            "available": False,
            "source_path": str(SUNRUN_CSV_PATH),
            "rows": [],
            "by_date": {},
            "latest_available_date": None,
        }

    rows: list[SunrunProductionRow] = []
    with SUNRUN_CSV_PATH.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for record in reader:
            entry_date_text = str(record.get("Date", "")).strip().strip('"')
            if not entry_date_text:
                continue

            entry_date = date.fromisoformat(entry_date_text)
            production_kwh = _parse_float(record.get("Solar Produced (kWh)"))
            end_meter_kwh = _parse_float(record.get("End-of-Day Meter Reading (kWh)"))

            # Treat rows where both values are zero as unavailable placeholder rows,
            # not real production history.
            available = not (production_kwh == 0.0 and end_meter_kwh == 0.0)
            rows.append(
                SunrunProductionRow(
                    entry_date=entry_date,
                    production_kwh=production_kwh,
                    end_of_day_meter_kwh=end_meter_kwh,
                    available=available,
                )
            )

    available_rows = [row for row in rows if row.available]
    by_date = {
        row.entry_date.isoformat(): {
            "entry_date": row.entry_date.isoformat(),
            "production_kwh": row.production_kwh,
            "end_of_day_meter_kwh": row.end_of_day_meter_kwh,
            "available": row.available,
        }
        for row in available_rows
    }

    return {
        "available": True,
        "source_path": str(SUNRUN_CSV_PATH),
        "rows": [
            {
                "entry_date": row.entry_date.isoformat(),
                "production_kwh": row.production_kwh,
                "end_of_day_meter_kwh": row.end_of_day_meter_kwh,
                "available": row.available,
            }
            for row in rows
        ],
        "by_date": by_date,
        "latest_available_date": available_rows[-1].entry_date.isoformat() if available_rows else None,
    }
