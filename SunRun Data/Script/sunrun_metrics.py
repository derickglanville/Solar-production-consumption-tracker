from __future__ import annotations

from datetime import date, datetime
from typing import Optional

from sunrun_config import ENERGY_RATE_PER_KWH, SYSTEM_ACTIVATION_DATE
from sunrun_models import EnergyMetrics


def _pct(numerator: Optional[float], denominator: Optional[float]) -> Optional[float]:
    if numerator is None or denominator is None or denominator <= 0:
        return None
    return numerator / denominator * 100.0


def _round(value: Optional[float], digits: int = 3) -> Optional[float]:
    return round(value, digits) if value is not None else None


def calculate_metrics(
    *,
    date: str,
    production_kwh: Optional[float],
    meter01_import: Optional[float],
    previous_meter01_import: Optional[float],
    meter02_export: Optional[float],
    previous_meter02_export: Optional[float],
) -> EnergyMetrics:
    daily_import = None
    daily_export = None

    if meter01_import is not None and previous_meter01_import is not None:
        value = meter01_import - previous_meter01_import
        daily_import = value if value >= 0 else None

    if meter02_export is not None and previous_meter02_export is not None:
        value = meter02_export - previous_meter02_export
        daily_export = value if value >= 0 else None

    self_consumed = None
    home_consumption = None
    net_grid = None

    if production_kwh is not None and daily_export is not None:
        self_consumed = max(0.0, production_kwh - daily_export)

    if self_consumed is not None and daily_import is not None:
        home_consumption = self_consumed + daily_import

    if daily_import is not None and daily_export is not None:
        net_grid = daily_import - daily_export

    return EnergyMetrics(
        date=date,
        production_kwh=production_kwh,
        daily_import_kwh=daily_import,
        daily_export_kwh=daily_export,
        self_consumed_kwh=self_consumed,
        home_consumption_kwh=home_consumption,
        net_grid_kwh=net_grid,
        self_consumption_percent=_pct(self_consumed, production_kwh),
        export_percent=_pct(daily_export, production_kwh),
        solar_coverage_percent=_pct(self_consumed, home_consumption),
        grid_dependence_percent=_pct(daily_import, home_consumption),
    )


def add_financial_fields(entries: list[dict]) -> None:
    """Add daily savings and energy-status fields to each cumulative entry.

    Savings assume every solar kWh has the same $0.29 value, whether it is
    consumed in the home or exported under retail-value net metering.
    """
    for entry in entries:
        production = entry.get("production_kwh")
        derived = entry.setdefault("derived", {})

        if production is not None:
            derived["estimated_savings_usd"] = round(
                float(production) * ENERGY_RATE_PER_KWH, 2
            )
        else:
            derived["estimated_savings_usd"] = None

        net_grid = derived.get("net_grid_kwh")
        if net_grid is None:
            derived["grid_status"] = "Meter data incomplete"
        elif float(net_grid) < 0:
            derived["grid_status"] = "Net exporter"
        elif float(net_grid) > 0:
            derived["grid_status"] = "Net importer"
        else:
            derived["grid_status"] = "Grid neutral"

        # Solar independence is the share of estimated home use supplied
        # directly by solar. It is equivalent to solar coverage.
        derived["solar_independence_percent"] = derived.get(
            "solar_coverage_percent"
        )


def _date_of(entry: dict) -> Optional[date]:
    try:
        return datetime.strptime(entry["date"], "%Y-%m-%d").date()
    except (KeyError, TypeError, ValueError):
        return None


def financial_summary(entries: list[dict]) -> dict:
    dated = [(entry, _date_of(entry)) for entry in entries]
    dated = [(entry, day) for entry, day in dated if day is not None]
    if not dated:
        return {
            "rate_per_kwh": ENERGY_RATE_PER_KWH,
            "today_savings_usd": None,
            "today_savings_date": None,
            "month_to_date_savings_usd": 0.0,
            "year_to_date_savings_usd": 0.0,
            "lifetime_savings_usd": 0.0,
            "projected_annual_savings_usd": None,
            "annual_production_kwh": 0.0,
            "annual_goal_kwh": 11141.0,
            "annual_goal_percent": 0.0,
            "annual_goal_difference_kwh": -11141.0,
            "grid_status": "Meter data incomplete",
            "grid_status_date": None,
            "solar_independence_percent": None,
            "solar_independence_date": None,
        }

    latest_calendar_day = max(day for _, day in dated)
    latest_year = latest_calendar_day.year
    latest_month = latest_calendar_day.month

    production_rows = [
        (entry, day) for entry, day in dated
        if entry.get("production_kwh") is not None
    ]
    complete_rows = [
        (entry, day) for entry, day in dated
        if entry.get("production_kwh") is not None
        and entry.get("derived", {}).get("daily_import_kwh") is not None
        and entry.get("derived", {}).get("daily_export_kwh") is not None
    ]
    meter_rows = [
        (entry, day) for entry, day in dated
        if entry.get("derived", {}).get("daily_import_kwh") is not None
        and entry.get("derived", {}).get("daily_export_kwh") is not None
    ]

    latest_production_entry, latest_production_day = (
        max(production_rows, key=lambda item: item[1])
        if production_rows else ({}, None)
    )
    latest_complete_entry, latest_complete_day = (
        max(complete_rows, key=lambda item: item[1])
        if complete_rows else ({}, None)
    )
    latest_meter_entry, latest_meter_day = (
        max(meter_rows, key=lambda item: item[1])
        if meter_rows else ({}, None)
    )

    def savings(entry: dict) -> float:
        value = entry.get("derived", {}).get("estimated_savings_usd")
        return float(value or 0.0)

    month_entries = [
        entry for entry, day in dated
        if day.year == latest_year and day.month == latest_month
    ]
    year_entries = [
        entry for entry, day in dated if day.year == latest_year
    ]

    lifetime_savings = sum(savings(entry) for entry, _ in dated)
    month_savings = sum(savings(entry) for entry in month_entries)
    year_savings = sum(savings(entry) for entry in year_entries)
    annual_production = sum(
        float(entry.get("production_kwh") or 0.0) for entry in year_entries
    )

    current_year_production_rows = [
        (entry, day) for entry, day in production_rows if day.year == latest_year
    ]
    projected = None
    if current_year_production_rows:
        projected = (
            sum(savings(entry) for entry, _ in current_year_production_rows)
            / len(current_year_production_rows)
            * 365.0
        )

    annual_goal = 11141.0
    latest_prod_derived = latest_production_entry.get("derived", {})
    latest_complete_derived = latest_complete_entry.get("derived", {})
    latest_meter_derived = latest_meter_entry.get("derived", {})

    return {
        "rate_per_kwh": ENERGY_RATE_PER_KWH,
        "today_savings_usd": latest_prod_derived.get("estimated_savings_usd"),
        "today_savings_date": (
            latest_production_day.isoformat() if latest_production_day else None
        ),
        "month_to_date_savings_usd": round(month_savings, 2),
        "year_to_date_savings_usd": round(year_savings, 2),
        "lifetime_savings_usd": round(lifetime_savings, 2),
        "projected_annual_savings_usd": (
            round(projected, 2) if projected is not None else None
        ),
        "annual_production_kwh": round(annual_production, 3),
        "annual_goal_kwh": annual_goal,
        "annual_goal_percent": round(
            annual_production / annual_goal * 100.0, 2
        ),
        "annual_goal_difference_kwh": round(
            annual_production - annual_goal, 3
        ),
        "grid_status": latest_meter_derived.get(
            "grid_status", "Meter data incomplete"
        ),
        "grid_status_date": (
            latest_meter_day.isoformat() if latest_meter_day else None
        ),
        "solar_independence_percent": latest_complete_derived.get(
            "solar_independence_percent"
        ),
        "solar_independence_date": (
            latest_complete_day.isoformat() if latest_complete_day else None
        ),
        "assumption": (
            "Savings value solar production at $0.29/kWh for both "
            "self-consumed electricity and exported net-metering credits."
        ),
    }


def aggregate_metrics(entries: list[dict]) -> dict:
    add_financial_fields(entries)

    def total(field: str) -> float:
        return sum(
            float(e["derived"][field])
            for e in entries
            if e.get("derived", {}).get(field) is not None
        )

    complete = [
        e for e in entries
        if e.get("derived", {}).get("daily_import_kwh") is not None
        and e.get("derived", {}).get("daily_export_kwh") is not None
        and e.get("production_kwh") is not None
    ]

    production = sum(float(e.get("production_kwh") or 0) for e in complete)
    imported = total("daily_import_kwh")
    exported = total("daily_export_kwh")
    self_consumed = total("self_consumed_kwh")
    home_consumption = total("home_consumption_kwh")

    result = {
        "complete_days": len(complete),
        "production_kwh": round(production, 3),
        "import_kwh": round(imported, 3),
        "export_kwh": round(exported, 3),
        "self_consumed_kwh": round(self_consumed, 3),
        "home_consumption_kwh": round(home_consumption, 3),
        "net_grid_kwh": round(imported - exported, 3),
        "self_consumption_percent": (
            round(self_consumed / production * 100, 2)
            if production > 0 else None
        ),
        "solar_coverage_percent": (
            round(self_consumed / home_consumption * 100, 2)
            if home_consumption > 0 else None
        ),
        "grid_dependence_percent": (
            round(imported / home_consumption * 100, 2)
            if home_consumption > 0 else None
        ),
    }
    result["financial"] = financial_summary(entries)
    return result
