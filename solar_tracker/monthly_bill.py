from __future__ import annotations

import csv
import re
from dataclasses import dataclass, field
from datetime import date, datetime
from pathlib import Path
from typing import Any

try:
    from pypdf import PdfReader
except ImportError:  # The bill report remains usable when the optional parser is absent.
    PdfReader = None


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
    "09_16_26 - 09_03_26.pdf": {
        "statement_date": "2026-09-16", "billing_start_date": "2026-08-06", "billing_end_date": "2026-09-03", "days_in_period": 29,
        "imported_kwh": 518.0, "smart_meter_import_kwh": 518.0, "exported_kwh": 1260.0,
        "delivery_charges": 40.99, "supply_charges": 0.0, "taxes": 2.58, "miscellaneous_charges": 0.95,
        "total_energy_charges": 43.57, "amount_due": 913.73, "budget_billing_amount": 0.0,
        "payment_agreement_amount": 10.00, "balance_forward": 859.21, "total_adjustments": 0.0, "supply_rate_per_kwh": 0.0,
        "prior_excess_generation_kwh": 1376.0, "remaining_excess_generation_kwh": 0.0, "credited_usage_kwh": 518.0,
        "meter_note": "NYSEG offset the 518 kWh of billed use. Its excess-generation table shows 1,376 kWh prior excess and 0 kWh remaining after a corrected prior bill.",
    },}


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


def _money(text: str, label: str) -> float:
    """Read a dollar amount following a NYSEG statement label."""
    match = re.search(rf"{re.escape(label)}\s*\$?\s*(-?[\d,]+\.\d{{2}})", text, re.IGNORECASE)
    return _number(match.group(1).replace(",", "")) if match else 0.0


def _date_from_bill(value: str) -> str:
    return datetime.strptime(value.strip(), "%B %d, %Y").date().isoformat()


def _parse_nyseg_bill_pdf(path: Path) -> dict[str, Any] | None:
    """Extract the recurring NYSEG electric-bill fields from a newly saved PDF.

    The parser intentionally returns no record if the bill's core identifiers
    are missing. That keeps an unfamiliar or image-only PDF out of financial
    totals until it can be reviewed.
    """
    if PdfReader is None:
        return None
    try:
        text = "\n".join(page.extract_text() or "" for page in PdfReader(str(path)).pages)
    except Exception:
        return None
    statement_match = re.search(r"Statement Date:\s*([A-Z][a-z]+ \d{1,2}, \d{4})", text)
    period_match = re.search(
        r"Service from:.*?(\d{2}/\d{2}/\d{2})\s*-\s*(\d{2}/\d{2}/\d{2})",
        text,
        re.DOTALL,
    )
    if not statement_match or not period_match:
        return None
    try:
        statement_date = _date_from_bill(statement_match.group(1))
        billing_start_date = datetime.strptime(period_match.group(1), "%m/%d/%y").date().isoformat()
        billing_end_date = datetime.strptime(period_match.group(2), "%m/%d/%y").date().isoformat()
    except ValueError:
        return None

    meter_section_match = re.search(r"Number Difference Usage Period(.*?)Type of read", text, re.DOTALL | re.IGNORECASE)
    meter_section = meter_section_match.group(1) if meter_section_match else ""
    meter_rows = [float(value.replace(",", "")) for value in re.findall(r"\d+\s*days\s*(\d[\d,]*)\s*kwh", meter_section, re.IGNORECASE)]
    periods = [int(value) for value in re.findall(r"(\d+)\s*days\s*\d[\d,]*\s*kwh", meter_section, re.IGNORECASE)]
    if not meter_rows:
        return None
    if len(meter_rows) == 1:
        imported_kwh, smart_import_kwh, exported_kwh = meter_rows[0], 0.0, 0.0
    elif len(meter_rows) == 2:
        imported_kwh, smart_import_kwh, exported_kwh = meter_rows[0], meter_rows[0], meter_rows[1]
    else:
        # A meter-exchange bill has old-meter import, smart-meter import,
        # then smart-meter export.
        imported_kwh = meter_rows[0] + meter_rows[1]
        smart_import_kwh, exported_kwh = meter_rows[1], meter_rows[2]

    credit_match = re.search(
        r"Prior Excess\s+Generation.*?Meter\s+Number\s*(\d[\d,]*)\s*kwh\s*(\d[\d,]*)\s*kwh\s*(\d[\d,]*)\s*kwh\s*(\d[\d,]*)\s*kwh\s*(\d[\d,]*)\s*kwh",
        text,
        re.DOTALL | re.IGNORECASE,
    )
    credit_values = [float(value.replace(",", "")) for value in credit_match.groups()] if credit_match else []
    days_in_period = (date.fromisoformat(billing_end_date) - date.fromisoformat(billing_start_date)).days + 1
    total_energy_charges = _money(text, "Total Energy Charges")
    record = {
        "statement_date": statement_date,
        "billing_start_date": billing_start_date,
        "billing_end_date": billing_end_date,
        "days_in_period": days_in_period,
        "imported_kwh": imported_kwh,
        "smart_meter_import_kwh": smart_import_kwh,
        "exported_kwh": exported_kwh,
        "delivery_charges": _money(text, "Subtotal Electricity Delivery"),
        "supply_charges": _money(text, "Subtotal Electricity Supply"),
        "taxes": _money(text, "Subtotal Electricity Taxes and Surcharges"),
        "miscellaneous_charges": _money(text, "Total Miscellaneous Charges"),
        "total_energy_charges": total_energy_charges,
        "amount_due": _money(text, "Amount Due:"),
        "budget_billing_amount": 0.0,
        "payment_agreement_amount": 0.0,
        "balance_forward": _money(text, "Balance forward"),
        "total_adjustments": _money(text, "Total Adjustments"),
        "supply_rate_per_kwh": _number((re.search(r"price for providing electricity supply.*?\$([\d.]+)/kwh", text, re.IGNORECASE | re.DOTALL) or [None, 0])[1]),
        "meter_note": "Automatically extracted from the saved NYSEG PDF. Review the source bill if a corrected statement changes the period.",
        "ingestion_source": "PDF extraction",
    }
    if len(credit_values) == 5:
        record.update({
            "prior_excess_generation_kwh": credit_values[0],
            "credited_usage_kwh": credit_values[3],
            "remaining_excess_generation_kwh": credit_values[4],
        })
    return record


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
    for path in sorted(bills_dir.glob("*.pdf")):
        source = BILL_REFERENCE_DATA.get(path.name)
        # Existing transcribed records retain their reviewed values. Any new
        # PDF is ingested automatically, with no filename registration step.
        record = dict(source) if source else _parse_nyseg_bill_pdf(path)
        if not record:
            continue
        record.update({"display_name": path.name, "source_path": str(path)})
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


def build_bill_summary_report() -> dict[str, Any]:
    """Build a presentation-safe analysis from every recognized PDF in Bills.

    NYSEG occasionally issues a corrected statement for the same billing period.
    The complete file list remains available for navigation, while the newest
    statement is the authoritative value used in the history totals.
    """
    all_records = sorted(load_monthly_bill_summary().billing_records, key=lambda row: row["statement_date"])
    authoritative_by_period: dict[tuple[str, str], dict[str, Any]] = {}
    for record in all_records:
        key = (record["billing_start_date"], record["billing_end_date"])
        if key not in authoritative_by_period or record["statement_date"] > authoritative_by_period[key]["statement_date"]:
            authoritative_by_period[key] = record
    records = sorted(authoritative_by_period.values(), key=lambda row: (row["billing_end_date"], row["statement_date"]))

    revisions: list[dict[str, Any]] = []
    for record in records:
        matching = [item for item in all_records if item["billing_start_date"] == record["billing_start_date"] and item["billing_end_date"] == record["billing_end_date"]]
        if len(matching) > 1:
            original = min(matching, key=lambda item: item["statement_date"])
            if record["statement_date"] != original["statement_date"]:
                revisions.append({
                    "period": f"{record['billing_start_date']} to {record['billing_end_date']}",
                    "original_energy_charges": original["total_energy_charges"],
                    "corrected_energy_charges": record["total_energy_charges"],
                    "savings": original["total_energy_charges"] - record["total_energy_charges"],
                })

    latest = records[-1] if records else {}
    credit_events = [record for record in records if record.get("credited_usage_kwh") or record.get("prior_excess_generation_kwh") is not None]
    latest_credit = credit_events[-1] if credit_events else {}
    latest_revision = revisions[-1] if revisions else {}
    savings = float(latest_revision.get("savings", 0.0))
    original_charge = float(latest_revision.get("original_energy_charges", 0.0))
    prior_excess = float(latest_credit.get("prior_excess_generation_kwh", 0.0))
    credited_usage = float(latest_credit.get("credited_usage_kwh", 0.0))
    reported_remaining = float(latest_credit.get("remaining_excess_generation_kwh", 0.0))
    expected_remaining = max(0.0, prior_excess - credited_usage)
    unitemized_adjustment = max(0.0, expected_remaining - reported_remaining)
    latest_period_net_export = float(latest_credit.get("exported_kwh", 0.0)) - float(latest_credit.get("imported_kwh", 0.0))
    exports_without_itemized_bank = sum(
        float(record.get("exported_kwh", 0.0))
        for record in records
        if float(record.get("exported_kwh", 0.0)) > 0
        and record.get("prior_excess_generation_kwh") is None
    )
    for record in records:
        imported = _number(record.get("imported_kwh"))
        smart_import = _number(record.get("smart_meter_import_kwh"))
        exported = _number(record.get("exported_kwh"))
        old_meter_import = max(0.0, imported - smart_import)
        if old_meter_import and smart_import:
            record["grid_import_tooltip"] = (
                f"NYSEG billed {imported:,.0f} kWh of grid import: "
                f"{old_meter_import:,.0f} kWh on the old meter + {smart_import:,.0f} kWh on smart-meter M01."
            )
        elif smart_import:
            record["grid_import_tooltip"] = f"NYSEG billed {smart_import:,.0f} kWh from smart-meter Register 01 (M01) for this period."
        else:
            record["grid_import_tooltip"] = f"NYSEG billed {imported:,.0f} kWh of grid import for this pre-smart-meter period."
        record["solar_export_tooltip"] = (
            f"NYSEG recorded {exported:,.0f} kWh sent to the grid on smart-meter Register 02 (M02) for this billing period."
            if exported else "No solar export register was available on this pre-solar statement."
        )
        delivery = _number(record.get("delivery_charges"))
        supply = _number(record.get("supply_charges"))
        taxes = _number(record.get("taxes"))
        miscellaneous = _number(record.get("miscellaneous_charges"))
        record["energy_charges_tooltip"] = (
            "NYSEG energy-charge breakdown:\n"
            f"Delivery charges: ${delivery:,.2f}\n"
            f"Supply charges: ${supply:,.2f}\n"
            f"Taxes and surcharges: ${taxes:,.2f}\n"
            "---\n"
            f"Energy charges total: ${_number(record.get('total_energy_charges')):,.2f}\n"
            f"Not included - miscellaneous charges: ${miscellaneous:,.2f}\n"
            "Not included - budget billing and payment-plan amounts."
        )
        if record.get("credited_usage_kwh"):
            prior = _number(record.get("prior_excess_generation_kwh"))
            credited = _number(record.get("credited_usage_kwh"))
            remaining = _number(record.get("remaining_excess_generation_kwh"))
            record["credit_treatment_tooltip"] = (
                f"NYSEG applied {credited:,.0f} kWh against billed use. The bill shows {prior:,.0f} kWh prior excess, "
                f"then {prior - credited:,.0f} kWh before other adjustments, and {remaining:,.0f} kWh shown remaining."
            )
        elif exported:
            record["credit_treatment_tooltip"] = (
                f"NYSEG recorded {exported:,.0f} kWh of export, but this statement does not itemize a billed-use offset or remaining credit-bank balance."
            )
        else:
            record["credit_treatment_tooltip"] = "Pre-solar bill: no Register 02 export or solar-credit treatment applies."
    return {
        "available": bool(records),
        "file_count": len(all_records),
        "period_count": len(records),
        "records": all_records,
        "authoritative_records": records,
        "latest": latest,
        "credit_bank": {
            "prior_kwh": prior_excess,
            "remaining_kwh": reported_remaining,
            "billed_use_offset_kwh": credited_usage,
            "expected_remaining_without_adjustments_kwh": expected_remaining,
            "unitemized_adjustment_kwh": unitemized_adjustment,
            "latest_period_net_export_kwh": latest_period_net_export,
            "exports_without_itemized_bank_kwh": exports_without_itemized_bank,
            "statement_date": latest_credit.get("statement_date"),
            "note": latest_credit.get("meter_note", "NYSEG did not itemize a credit-bank balance on the available statements."),
        },
        "cost_change": {
            **latest_revision,
            "savings_percent": (savings / original_charge * 100) if original_charge else 0.0,
        },
        "totals": {
            "energy_charges": sum(float(record["total_energy_charges"]) for record in records),
            "imported_kwh": sum(float(record["imported_kwh"]) for record in records),
            "exported_kwh": sum(float(record["exported_kwh"]) for record in records),
        },
    }


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

def build_net_metering_report(start_date: date = date(2026, 7, 16)) -> dict[str, Any]:
    candidates = [item for item in _load_billing_records(DEFAULT_BILLS_DIR) if date.fromisoformat(item["billing_end_date"]) >= start_date]
    latest_by_period: dict[tuple[str, str], dict[str, Any]] = {}
    for record in candidates:
        key = (record["billing_start_date"], record["billing_end_date"])
        if key not in latest_by_period or record["statement_date"] > latest_by_period[key]["statement_date"]:
            latest_by_period[key] = record
    records = list(latest_by_period.values())
    rows = []
    for record in sorted(records, key=lambda item: (item["statement_date"], item["display_name"])):
        credited = _number(record.get("credited_usage_kwh"))
        rows.append({**record, "meter_net_export_kwh": _number(record["exported_kwh"]) - _number(record["smart_meter_import_kwh"]), "remaining_excess_generation_kwh": record.get("remaining_excess_generation_kwh"), "official_credit_note": f"NYSEG offset {credited:,.0f} kWh of billed use; only fixed and non-bypassable charges remained." if credited else "Export is measured on the bill; no official credit balance is itemized."})
    return {"start_date": start_date.isoformat(), "rows": rows, "total_import_kwh": sum(_number(row["smart_meter_import_kwh"]) for row in rows), "total_export_kwh": sum(_number(row["exported_kwh"]) for row in rows), "notes": ["Meter net export is export minus smart-meter import. It measures energy flow, not a dollar credit.", "The September 16 bill confirms NYSEG offset 518 kWh of billed use and charged only fixed and non-bypassable items."]}

def build_net_metering_reconciliation(entries) -> dict[str, Any]:
    """Compare the tracker M02 cumulative register with the matching NYSEG billing periods."""
    report = build_net_metering_report()
    ordered = sorted(entries or [], key=lambda item: item.entry_date)
    rows = []
    total_tracked_export = 0.0
    total_billed_export = 0.0
    total_credited_use = 0.0

    for bill in report["rows"]:
        period_start = date.fromisoformat(bill["billing_start_date"])
        period_end = date.fromisoformat(bill["billing_end_date"])
        baseline = [item for item in ordered if item.entry_date <= period_start]
        ending = [item for item in ordered if item.entry_date <= period_end]
        tracker_export = None
        variance = None
        baseline_date = None
        end_date = None
        if baseline and ending:
            start_reading = baseline[-1]
            end_reading = ending[-1]
            if end_reading.entry_date > start_reading.entry_date:
                tracker_export = max(0.0, float(end_reading.meter_02_export_reading) - float(start_reading.meter_02_export_reading))
                variance = float(bill["exported_kwh"]) - tracker_export
                baseline_date = start_reading.entry_date.isoformat()
                end_date = end_reading.entry_date.isoformat()
                total_tracked_export += tracker_export
        credited_use = _number(bill.get("credited_usage_kwh"))
        total_credited_use += credited_use
        total_billed_export += _number(bill["exported_kwh"])
        rows.append({
            **bill,
            "tracker_export_kwh": tracker_export,
            "export_variance_kwh": variance,
            "baseline_reading_date": baseline_date,
            "ending_reading_date": end_date,
            "credited_usage_kwh": credited_use or None,
        })

    return {
        "rows": rows,
        "total_billed_export_kwh": total_billed_export,
        "total_tracked_export_kwh": total_tracked_export,
        "total_credited_usage_kwh": total_credited_use,
        "unreconciled_difference_kwh": total_billed_export - total_tracked_export,
        "notes": [
            "Tracker export is calculated from the change in the cumulative M02 export register during each bill period.",
            "NYSEG's net-metering treatment is taken only from the bill. A bill may offset billed use without showing a dollar-per-kWh credit or a remaining bank balance.",
            "A period is unavailable until the tracker has a reading on or before both the period start and end dates.",
        ],
    }
