from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pandas as pd


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_HISTORY_PATH = PROJECT_ROOT / "NYSEG Bill" / "NYSEG Bill.xlsx"


@dataclass
class HistoricalUsageSummary:
    available: bool
    source_path: str
    meter_label: str
    record_count: int
    start_date: str | None
    end_date: str | None
    total_kwh: float
    average_monthly_kwh: float
    annualized_kwh: float
    actual_read_count: int
    calculated_read_count: int
    minimum_kwh: float
    maximum_kwh: float
    latest_kwh: float
    versus_expected_annual_kwh: float
    versus_expected_annual_pct: float
    notes: list[str]
    monthly_records: list[dict[str, Any]]


def _empty_summary(path: Path) -> HistoricalUsageSummary:
    return HistoricalUsageSummary(
        available=False,
        source_path=str(path),
        meter_label="",
        record_count=0,
        start_date=None,
        end_date=None,
        total_kwh=0.0,
        average_monthly_kwh=0.0,
        annualized_kwh=0.0,
        actual_read_count=0,
        calculated_read_count=0,
        minimum_kwh=0.0,
        maximum_kwh=0.0,
        latest_kwh=0.0,
        versus_expected_annual_kwh=0.0,
        versus_expected_annual_pct=0.0,
        notes=[],
        monthly_records=[],
    )


def load_historical_usage_summary(
    workbook_path: Path | None = None,
    expected_annual_home_usage_kwh: float = 17967.0,
) -> HistoricalUsageSummary:
    path = workbook_path or DEFAULT_HISTORY_PATH
    if not path.exists():
        return _empty_summary(path)

    df = pd.read_excel(path)
    meter_label = next(
        (
            str(column).replace("Electric Meter # ", "").strip()
            for column in df.columns
            if str(column).startswith("Electric Meter #")
        ),
        "",
    )

    required = ["Read Date", "Read Type", "KWH"]
    if not all(column in df.columns for column in required):
        return _empty_summary(path)

    cleaned = df[required].dropna(subset=["Read Date", "KWH"]).copy()
    if cleaned.empty:
        return _empty_summary(path)

    cleaned["Read Date"] = pd.to_datetime(cleaned["Read Date"])
    cleaned["Read Type"] = cleaned["Read Type"].astype(str).str.strip()
    cleaned["KWH"] = pd.to_numeric(cleaned["KWH"], errors="coerce")
    cleaned = cleaned.dropna(subset=["KWH"]).sort_values("Read Date").reset_index(drop=True)

    start_date = cleaned["Read Date"].min()
    end_date = cleaned["Read Date"].max()
    month_count = max(1, ((end_date.year - start_date.year) * 12) + (end_date.month - start_date.month) + 1)
    total_kwh = float(cleaned["KWH"].sum())
    average_monthly_kwh = float(cleaned["KWH"].mean())
    annualized_kwh = float((total_kwh / month_count) * 12)
    expected_diff = annualized_kwh - float(expected_annual_home_usage_kwh or 0.0)
    expected_pct = (expected_diff / expected_annual_home_usage_kwh * 100) if expected_annual_home_usage_kwh else 0.0

    notes = [
        f"Source includes {len(cleaned)} monthly-style NYSEG history rows from {start_date.date().isoformat()} through {end_date.date().isoformat()}.",
        f"{int((cleaned['Read Type'] == 'NYSEG').sum())} reads are marked NYSEG and {int((cleaned['Read Type'] == 'CALCULATED').sum())} are marked CALCULATED.",
        "This baseline can be used to compare historic utility consumption against the solar-era dashboard estimates and contract assumptions.",
    ]

    monthly_records = [
        {
            "read_date": row["Read Date"].date().isoformat(),
            "read_type": row["Read Type"],
            "kwh": float(row["KWH"]),
        }
        for _, row in cleaned.iterrows()
    ]

    return HistoricalUsageSummary(
        available=True,
        source_path=str(path),
        meter_label=meter_label,
        record_count=int(len(cleaned)),
        start_date=start_date.date().isoformat(),
        end_date=end_date.date().isoformat(),
        total_kwh=total_kwh,
        average_monthly_kwh=average_monthly_kwh,
        annualized_kwh=annualized_kwh,
        actual_read_count=int((cleaned["Read Type"] == "NYSEG").sum()),
        calculated_read_count=int((cleaned["Read Type"] == "CALCULATED").sum()),
        minimum_kwh=float(cleaned["KWH"].min()),
        maximum_kwh=float(cleaned["KWH"].max()),
        latest_kwh=float(cleaned.iloc[-1]["KWH"]),
        versus_expected_annual_kwh=expected_diff,
        versus_expected_annual_pct=expected_pct,
        notes=notes,
        monthly_records=monthly_records,
    )


def historical_usage_to_dict(summary: HistoricalUsageSummary) -> dict[str, Any]:
    return {
        "available": summary.available,
        "source_path": summary.source_path,
        "meter_label": summary.meter_label,
        "record_count": summary.record_count,
        "start_date": summary.start_date,
        "end_date": summary.end_date,
        "total_kwh": summary.total_kwh,
        "average_monthly_kwh": summary.average_monthly_kwh,
        "annualized_kwh": summary.annualized_kwh,
        "actual_read_count": summary.actual_read_count,
        "calculated_read_count": summary.calculated_read_count,
        "minimum_kwh": summary.minimum_kwh,
        "maximum_kwh": summary.maximum_kwh,
        "latest_kwh": summary.latest_kwh,
        "versus_expected_annual_kwh": summary.versus_expected_annual_kwh,
        "versus_expected_annual_pct": summary.versus_expected_annual_pct,
        "notes": summary.notes,
        "monthly_records": summary.monthly_records,
    }
