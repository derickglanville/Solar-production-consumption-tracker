from __future__ import annotations

import csv
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_BILLS_DIR = PROJECT_ROOT / "NYSEG Bill" / "Bills"
DEFAULT_USAGE_DATA_PATH = PROJECT_ROOT / "NYSEG Bill" / "Data" / "NYSEG_Meter_Reading_09-06-2023_09-06-2026.csv"

# Audited charge and register values transcribed from the matching NYSEG PDFs.
BILL_REFERENCE_DATA: dict[str, dict[str, Any]] = {
    "06_05_26 - 07_01_26.pdf": {
        "statement_date": "2026-07-07", "billing_start_date": "2026-06-05", "billing_end_date": "2026-07-01", "days_in_period": 27,
        "imported_kwh": 118.0, "smart_meter_import_kwh": 0.0, "exported_kwh": 0.0,
        "delivery_charges": 32.58, "supply_charges": 10.69, "taxes": 2.49, "miscellaneous_charges": 0.95,
        "total_energy_charges": 45.76, "amount_due": 516.90, "budget_billing_amount": 507.00,
        "payment_agreement_amount": 10.00, "balance_forward": -1.05, "total_adjustments": -1151.52,
        "supply_rate_per_kwh": 0.09059322,
        "meter_note": "Pre-smart-meter bill; no export register was available.",
    },
    "07_02_26 - 08_05_26.pdf": {
        "statement_date": "2026-09-03", "billing_start_date": "2026-07-02", "billing_end_date": "2026-08-05", "days_in_period": 35,
        "imported_kwh": 810.0, "smart_meter_import_kwh": 391.0, "exported_kwh": 1025.0,
        "delivery_charges": 112.94, "supply_charges": 96.56, "taxes": 11.09, "miscellaneous_charges": 0.95,
        "total_energy_charges": 220.59, "amount_due": 921.82, "budget_billing_amount": 0.0,
        "payment_agreement_amount": 10.00, "balance_forward": 0.0, "total_adjustments": 690.28,
        "supply_rate_per_kwh": 0.11920988,
        "meter_note": "Meter-transition month: 419 kWh old-meter use plus 391 kWh smart-meter import; Register 02 recorded 1,025 kWh exported.",
    },
    "08_06_26 - 09_03_26.pdf": {
        "statement_date": "2026-09-08", "billing_start_date": "2026-08-06", "billing_end_date": "2026-09-03", "days_in_period": 29,
        "imported_kwh": 518.0, "smart_meter_import_kwh": 518.0, "exported_kwh": 1260.0,
        "delivery_charges": 77.47, "supply_charges": 37.40, "taxes": 6.40, "miscellaneous_charges": 0.95,
        "total_energy_charges": 121.27, "amount_due": 1054.04, "budget_billing_amount": 0.0,
        "payment_agreement_amount": 10.00, "balance_forward": 921.82, "total_adjustments": 0.0,
        "supply_rate_per_kwh": 0.07220077,
        "meter_note": "Register 01 recorded 518 kWh imported; Register 02 recorded 1,260 kWh exported.",
    },
}


@dataclass
class MonthlyBillSummary:
    available: bool
    source_path: str
    display_name: str
    statement_date: str | None
    billing_start_date: str | None
    billing_end_date: str | None
    days_in_period: int
    amount_due: float
    total_energy_charges: float
    total_electricity_cost: float
    current_usage_kwh: float
    average_daily_use_kwh: float
    prior_year_average_daily_use_kwh: float
    budget_billing_amount: float
    payment_agreement_amount: float
    balance_forward: float
    total_adjustments: float
    miscellaneous_charges: float
    notes: list[str]
    billing_records: list[dict[str, Any]] = field(default_factory=list)
    usage_records: list[dict[str, Any]] = field(default_factory=list)
    billing_totals: dict[str, Any] = field(default_factory=dict)
    usage_totals: dict[str, Any] = field(default_factory=dict)
    net_metering: dict[str, Any] = field(default_factory=dict)


def _empty_summary(path: Path) -> MonthlyBillSummary:
    return MonthlyBillSummary(
        available=False,
        source_path=str(path),
        display_name=path.name,
        statement_date=None,
        billing_start_date=None,
        billing_end_date=None,
        days_in_period=0,
        amount_due=0.0,
        total_energy_charges=0.0,
        total_electricity_cost=0.0,
        current_usage_kwh=0.0,
        average_daily_use_kwh=0.0,
        prior_year_average_daily_use_kwh=0.0,
        budget_billing_amount=0.0,
        payment_agreement_amount=0.0,
        balance_forward=0.0,
        total_adjustments=0.0,
        miscellaneous_charges=0.0,
        notes=[],
    )


def _number(value: Any) -> float:
    try:
        return float(value or 0.0)
    except (TypeError, ValueError):
        return 0.0


def _iso_date(value: str) -> str:
    return datetime.fromisoformat(value.strip()).date().isoformat()


def _load_usage_records(path: Path) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    records: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        for row in csv.DictReader(handle):
            start_date = _iso_date(row.get("Start Time") or row.get("Date") or "")
            end_date = _iso_date(row.get("End Time") or row.get("Date") or "")
            kwh = _number(row.get("Net"))
            cost = _number(row.get("Costs"))
            records.append({
                "billing_start_date": start_date,
                "billing_end_date": end_date,
                "month_label": date.fromisoformat(end_date).strftime("%b %Y"),
                "usage_kwh": kwh,
                "cost": cost,
                "effective_rate_per_kwh": cost / kwh if kwh else 0.0,
                "average_temperature_f": _number(row.get("Weather")),
                "units": row.get("Units") or "kWh",
            })
    return sorted(records, key=lambda item: item["billing_end_date"], reverse=True)


def _load_billing_records(bills_dir: Path) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for filename, source in BILL_REFERENCE_DATA.items():
        path = bills_dir / filename
        if not path.exists():
            continue
        record = dict(source)
        record.update({"display_name": filename, "source_path": str(path)})
        record["current_usage_kwh"] = record["imported_kwh"]
        record["average_daily_use_kwh"] = record["imported_kwh"] / record["days_in_period"]
        record["effective_energy_rate"] = record["total_energy_charges"] / record["imported_kwh"]
        record["net_grid_kwh"] = record["imported_kwh"] - record["exported_kwh"]
        record["net_direction"] = "Net import" if record["net_grid_kwh"] > 0 else "Net export"
        records.append(record)
    return sorted(records, key=lambda item: item["billing_end_date"], reverse=True)


def load_monthly_bill_summary(
    pdf_path: Path | None = None,
    usage_data_path: Path | None = None,
) -> MonthlyBillSummary:
    bills_dir = pdf_path.parent if pdf_path else DEFAULT_BILLS_DIR
    billing_records = _load_billing_records(bills_dir)
    if pdf_path:
        billing_records = [item for item in billing_records if item["display_name"] == pdf_path.name]
    usage_records = _load_usage_records(usage_data_path or DEFAULT_USAGE_DATA_PATH)
    if not billing_records and not usage_records:
        return _empty_summary(pdf_path or DEFAULT_BILLS_DIR)

    latest = billing_records[0] if billing_records else {}
    usage_kwh = sum(item["usage_kwh"] for item in usage_records)
    usage_cost = sum(item["cost"] for item in usage_records)
    bill_import = sum(item["imported_kwh"] for item in billing_records)
    smart_import = sum(item["smart_meter_import_kwh"] for item in billing_records)
    exported = sum(item["exported_kwh"] for item in billing_records)
    bill_net = bill_import - exported
    smart_net = smart_import - exported
    billing_totals = {
        "record_count": len(billing_records),
        "delivery_charges": sum(item["delivery_charges"] for item in billing_records),
        "supply_charges": sum(item["supply_charges"] for item in billing_records),
        "taxes": sum(item["taxes"] for item in billing_records),
        "miscellaneous_charges": sum(item["miscellaneous_charges"] for item in billing_records),
        "energy_charges": sum(item["total_energy_charges"] for item in billing_records),
        "amount_due": sum(item["amount_due"] for item in billing_records),
    }
    usage_totals = {
        "record_count": len(usage_records),
        "start_date": usage_records[-1]["billing_start_date"] if usage_records else None,
        "end_date": usage_records[0]["billing_end_date"] if usage_records else None,
        "total_kwh": usage_kwh,
        "total_cost": usage_cost,
        "average_monthly_kwh": usage_kwh / len(usage_records) if usage_records else 0.0,
        "average_monthly_cost": usage_cost / len(usage_records) if usage_records else 0.0,
        "effective_rate_per_kwh": usage_cost / usage_kwh if usage_kwh else 0.0,
    }
    net_metering = {
        "billing_period_import_kwh": bill_import,
        "smart_meter_import_kwh": smart_import,
        "export_kwh": exported,
        "billing_period_net_kwh": bill_net,
        "smart_meter_net_kwh": smart_net,
        "billing_period_direction": "Net import" if bill_net > 0 else "Net export",
        "smart_meter_direction": "Net import" if smart_net > 0 else "Net export",
        "solar_bill_count": sum(1 for item in billing_records if item["exported_kwh"] > 0),
    }
    notes = [
        f"Loaded {len(usage_records)} monthly usage/cost records and {len(billing_records)} detailed bill PDFs.",
        "Register 01 is electricity imported from NYSEG; Register 02 is solar electricity exported to NYSEG.",
        "The July 2-August 5 bill spans the old and smart meters, so total billed import and smart-meter-only import are shown separately.",
    ]
    return MonthlyBillSummary(
        available=True,
        source_path=latest.get("source_path", str(DEFAULT_USAGE_DATA_PATH)),
        display_name=latest.get("display_name", DEFAULT_USAGE_DATA_PATH.name),
        statement_date=latest.get("statement_date"),
        billing_start_date=latest.get("billing_start_date"),
        billing_end_date=latest.get("billing_end_date"),
        days_in_period=int(latest.get("days_in_period", 0)),
        amount_due=_number(latest.get("amount_due")),
        total_energy_charges=_number(latest.get("total_energy_charges")),
        total_electricity_cost=_number(latest.get("total_energy_charges")),
        current_usage_kwh=_number(latest.get("current_usage_kwh")),
        average_daily_use_kwh=_number(latest.get("average_daily_use_kwh")),
        prior_year_average_daily_use_kwh=0.0,
        budget_billing_amount=_number(latest.get("budget_billing_amount")),
        payment_agreement_amount=_number(latest.get("payment_agreement_amount")),
        balance_forward=_number(latest.get("balance_forward")),
        total_adjustments=_number(latest.get("total_adjustments")),
        miscellaneous_charges=_number(latest.get("miscellaneous_charges")),
        notes=notes,
        billing_records=billing_records,
        usage_records=usage_records,
        billing_totals=billing_totals,
        usage_totals=usage_totals,
        net_metering=net_metering,
    )


def monthly_bill_to_dict(summary: MonthlyBillSummary) -> dict[str, Any]:
    public_billing_records = [
        {key: value for key, value in record.items() if key != "source_path"}
        for record in summary.billing_records
    ]
    return {
        "available": summary.available,
        "source_path": summary.source_path,
        "display_name": summary.display_name,
        "statement_date": summary.statement_date,
        "billing_start_date": summary.billing_start_date,
        "billing_end_date": summary.billing_end_date,
        "days_in_period": summary.days_in_period,
        "amount_due": summary.amount_due,
        "total_energy_charges": summary.total_energy_charges,
        "total_electricity_cost": summary.total_electricity_cost,
        "current_usage_kwh": summary.current_usage_kwh,
        "average_daily_use_kwh": summary.average_daily_use_kwh,
        "prior_year_average_daily_use_kwh": summary.prior_year_average_daily_use_kwh,
        "budget_billing_amount": summary.budget_billing_amount,
        "payment_agreement_amount": summary.payment_agreement_amount,
        "balance_forward": summary.balance_forward,
        "total_adjustments": summary.total_adjustments,
        "miscellaneous_charges": summary.miscellaneous_charges,
        "notes": summary.notes,
        "billing_records": public_billing_records,
        "usage_records": summary.usage_records,
        "billing_totals": summary.billing_totals,
        "usage_totals": summary.usage_totals,
        "net_metering": summary.net_metering,
    }
