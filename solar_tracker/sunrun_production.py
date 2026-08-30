from __future__ import annotations

import csv
from dataclasses import dataclass
from datetime import date
from pathlib import Path
from typing import Iterable


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

    parsed_rows: list[tuple[date, float, float]] = []
    with SUNRUN_CSV_PATH.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        for record in reader:
            entry_date_text = str(record.get("Date", "")).strip().strip('"')
            if not entry_date_text:
                continue

            entry_date = date.fromisoformat(entry_date_text)
            production_kwh = _parse_float(record.get("Solar Produced (kWh)"))
            end_meter_kwh = _parse_float(record.get("End-of-Day Meter Reading (kWh)"))

            parsed_rows.append((entry_date, production_kwh, end_meter_kwh))

    rows: list[SunrunProductionRow] = []
    previous_end_meter_kwh: float | None = None
    for entry_date, production_kwh, end_meter_kwh in sorted(parsed_rows):
        meter_increased = (
            previous_end_meter_kwh is not None
            and end_meter_kwh > previous_end_meter_kwh + 0.001
        )

        # Sunrun carries the cumulative meter forward into placeholder rows. A
        # non-zero cumulative value alone therefore does not mean that day's
        # production is available.
        available = production_kwh > 0.0 or meter_increased
        rows.append(
            SunrunProductionRow(
                entry_date=entry_date,
                production_kwh=production_kwh,
                end_of_day_meter_kwh=end_meter_kwh,
                available=available,
            )
        )
        previous_end_meter_kwh = end_meter_kwh

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


def save_sunrun_daily_production(records: Iterable[dict]) -> dict:
    normalized: list[tuple[date, float]] = []
    seen_dates: set[date] = set()

    for index, record in enumerate(records, start=1):
        entry_date_text = str(record.get("entry_date") or record.get("date") or "").strip()
        if not entry_date_text:
            raise ValueError(f"Row {index} is missing a date.")
        try:
            entry_date = date.fromisoformat(entry_date_text)
        except ValueError as error:
            raise ValueError(f"Row {index} has an invalid date: {entry_date_text}.") from error
        if entry_date in seen_dates:
            raise ValueError(f"Duplicate date detected: {entry_date.isoformat()}.")

        production_value = record.get("production_kwh", record.get("solar_produced_kwh", ""))
        try:
            production_kwh = float(str(production_value).strip())
        except (TypeError, ValueError) as error:
            raise ValueError(
                f"Production must be a number for {entry_date.isoformat()}."
            ) from error
        if production_kwh < 0:
            raise ValueError(f"Production cannot be negative for {entry_date.isoformat()}.")

        seen_dates.add(entry_date)
        normalized.append((entry_date, production_kwh))

    normalized.sort(key=lambda item: item[0])
    SUNRUN_CSV_PATH.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = SUNRUN_CSV_PATH.with_suffix(".csv.tmp")
    cumulative_kwh = 0.0

    with temporary_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle, lineterminator="\n")
        writer.writerow(["Date", "Solar Produced (kWh)", "End-of-Day Meter Reading (kWh)"])
        for entry_date, production_kwh in normalized:
            cumulative_kwh = round(cumulative_kwh + production_kwh, 3)
            writer.writerow(
                [
                    entry_date.isoformat(),
                    f"{production_kwh:.3f}".rstrip("0").rstrip("."),
                    f"{cumulative_kwh:.3f}".rstrip("0").rstrip("."),
                ]
            )

    temporary_path.replace(SUNRUN_CSV_PATH)
    return load_sunrun_daily_production()
