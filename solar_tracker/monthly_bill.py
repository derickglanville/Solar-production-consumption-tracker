from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Any


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DEFAULT_MONTHLY_BILL_PATH = PROJECT_ROOT / "NYSEG Bill" / "July 2027.pdf"


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


def load_monthly_bill_summary(pdf_path: Path | None = None) -> MonthlyBillSummary:
    path = pdf_path or DEFAULT_MONTHLY_BILL_PATH
    if not path.exists():
        return _empty_summary(path)

    notes = [
        "The PDF filename says July 2027, but the bill content shows a statement date of July 07, 2026.",
        "This bill is being used as a monthly bill reference source for dashboard context.",
        "The bill shows only 118 kWh over a 27-day period, which is much lower than the same period one year earlier and should be interpreted carefully alongside solar production and export data.",
    ]

    return MonthlyBillSummary(
        available=True,
        source_path=str(path),
        display_name=path.name,
        statement_date="2026-07-07",
        billing_start_date="2026-06-05",
        billing_end_date="2026-07-01",
        days_in_period=27,
        amount_due=516.90,
        total_energy_charges=45.76,
        total_electricity_cost=45.76,
        current_usage_kwh=118.0,
        average_daily_use_kwh=4.0,
        prior_year_average_daily_use_kwh=35.0,
        budget_billing_amount=507.00,
        payment_agreement_amount=10.00,
        balance_forward=-1.05,
        total_adjustments=-1151.52,
        miscellaneous_charges=0.95,
        notes=notes,
    )


def monthly_bill_to_dict(summary: MonthlyBillSummary) -> dict[str, Any]:
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
    }
