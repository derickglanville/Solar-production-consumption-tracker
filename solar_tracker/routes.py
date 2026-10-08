from dataclasses import asdict
from datetime import date, datetime
import csv
from http.client import HTTPConnection
from io import StringIO
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
from typing import Optional, Tuple

import pandas as pd
from flask import Blueprint, Response, jsonify, redirect, render_template, request, send_file, send_from_directory, url_for
from plotly.offline.offline import get_plotlyjs

from .ai import answer_question, get_ai_status
from .analytics import build_alerts, build_chart_bundle, build_dataframe, calculate_metrics
from .appliances import APPLIANCE_WORKBOOK_PATH, load_appliance_summary, save_appliance_records
from .energy_references import (
    load_circuit_breakers,
    load_electricity_usage,
    load_light_bulbs,
    save_circuit_breakers,
    save_electricity_usage,
    save_light_bulbs,
)
from .firestore import AppConfig, DailySolarEntry, FirestoreRepository
from .historical_usage import historical_usage_to_dict, load_historical_usage_summary
from .monthly_bill import build_bill_summary_report, build_net_metering_reconciliation, build_net_metering_report, load_monthly_bill_summary, monthly_bill_to_dict
from .nyseg_interval_usage import (
    DEFAULT_INTERVAL_USAGE_PATH,
    build_nyseg_interval_usage_report,
    load_nyseg_interval_file_rows,
)
from .seed import build_sample_entries
from .sunrun_production import (
    SUNRUN_CSV_PATH,
    load_sunrun_daily_production,
    save_sunrun_daily_production,
)
from .time_utils import tracker_today


main_blueprint = Blueprint("main", __name__)


WEATHER_OPTIONS = [
    "Sunny",
    "Cloudy",
    "Smoke",
    "Rain",
    "Snow",
    "Overcast",
    "Extreme Heat",
    "Wind",
    "Unknown",
]

LOCAL_DASHBOARD_URL = "http://127.0.0.1:8765/"
LOCAL_JSON_DIRECTORY = Path(__file__).resolve().parent.parent / "JSON"
LOCAL_APPLICATION_SNAPSHOT_PATH = LOCAL_JSON_DIRECTORY / "application_data_current.json"
NYSEG_DAILY_SYNC_STATUS_PATH = Path(__file__).resolve().parent.parent / "SunRun Data" / "nyseg-daily-sync-status.json"
NYSEG_DAILY_SYNC_LOG_PATH = Path(__file__).resolve().parent.parent / "SunRun Data" / "nyseg-daily-sync.log"
NYSEG_DAILY_SYNC_LOCK_PATH = NYSEG_DAILY_SYNC_STATUS_PATH.with_suffix(".lock")
NYSEG_DAILY_SYNC_PROCESS_PATH = NYSEG_DAILY_SYNC_STATUS_PATH.with_name("nyseg-daily-sync-process.json")
NYSEG_DAILY_SYNC_SCRIPT_PATH = Path(__file__).resolve().parent.parent / "NYSEG Download Script" / "run_nyseg_daily_sync.ps1"
NYSEG_DAILY_SYNC_WORKFLOW_PATH = Path(__file__).resolve().parent.parent / "NYSEG Download Script" / "run_nyseg_daily_sync.py"
NYSEG_MANUAL_RUN_SCRIPT_PATH = Path(__file__).resolve().parent.parent / "NYSEG Download Script" / "NYSEG_File_Download_Test.py"
SUNRUN_LOAD_HISTORY_PATH = Path(__file__).resolve().parent.parent / "JSON" / "Daily_Load_History.json"
NYSEG_LOAD_HISTORY_PATH = Path(__file__).resolve().parent.parent / "JSON" / "Daily_NYSEG_Load_History.json"
NYSEG_MANUAL_DOWNLOAD_DIRECTORY = Path.home() / "Downloads"
CIRCUIT_BREAKER_DIRECTORY_PATH = (
    Path(__file__).resolve().parent.parent
    / "Documents"
    / "Circuit_Breaker_Directory_Professional.pdf"
)


def entry_to_dict(entry):
    payload = asdict(entry)
    payload["entry_date"] = entry.entry_date.isoformat()
    return payload


def config_to_dict(config):
    payload = asdict(config)
    payload["activation_date"] = config.activation_date.isoformat()
    payload["smart_meter_install_date"] = config.smart_meter_install_date.isoformat()
    return payload


def load_nyseg_daily_sync_status() -> dict:
    try:
        return json.loads(NYSEG_DAILY_SYNC_STATUS_PATH.read_text(encoding="utf-8"))
    except (OSError, ValueError, TypeError):
        return {}


def load_sunrun_recent_runs() -> dict:
    """Read concise status rows written by the local 8:30 AM SunRun workflow."""
    try:
        rows = json.loads(SUNRUN_LOAD_HISTORY_PATH.read_text(encoding="utf-8")).get("records", [])
    except (OSError, ValueError, AttributeError):
        rows = []
    recent = sorted(rows, key=lambda row: row.get("started_at", ""), reverse=True)[:5]
    recent = [
        {**row, "run_time": format_run_time(row.get("finished_at") or row.get("started_at"))}
        for row in recent
    ]
    return {
        "recent": recent,
        "successful": sum(1 for row in recent if row.get("status") == "Success"),
        "emailed": sum(1 for row in recent if row.get("email_sent")),
    }


def load_nyseg_recent_runs() -> dict:
    try:
        rows = json.loads(NYSEG_LOAD_HISTORY_PATH.read_text(encoding="utf-8")).get("records", [])
    except (OSError, ValueError, AttributeError):
        status = load_nyseg_daily_sync_status()
        rows = ([{
            "date": (status.get("completed_at") or status.get("started_at") or "")[:10],
            "status": "Success" if status.get("status") == "success" else "Failed",
            "saved_records": int(status.get("saved_records", 0)),
            "email_sent": bool(status.get("email_sent")),
            "message": status.get("error") or "",
        }] if status else [])
    recent = sorted(rows, key=lambda row: row.get("completed_at", row.get("date", "")), reverse=True)[:5]
    recent = [
        {**row, "run_time": format_run_time(row.get("completed_at") or row.get("started_at"))}
        for row in recent
    ]
    return {"recent": recent, "successful": sum(1 for row in recent if row.get("status") == "Success"), "emailed": sum(1 for row in recent if row.get("email_sent"))}


def latest_manual_nyseg_download() -> Tuple[Path, int]:
    """Find the newest valid NYSEG interval CSV in the user's Downloads folder."""
    candidates = sorted(
        (
            path for path in NYSEG_MANUAL_DOWNLOAD_DIRECTORY.glob("*.csv")
            if "nyseg" in path.name.lower() or "avangrid-em" in path.name.lower()
        ),
        key=lambda path: path.stat().st_mtime,
        reverse=True,
    )
    for candidate in candidates:
        try:
            with candidate.open("r", encoding="utf-8-sig", newline="") as handle:
                reader = csv.DictReader(handle)
                required = {"Date", "Delivered", "Received"}
                if not required.issubset(set(reader.fieldnames or [])):
                    continue
                rows = sum(1 for _ in reader)
            if rows:
                return candidate, rows
        except OSError:
            continue
    raise FileNotFoundError("No valid NYSEG interval CSV was found in Downloads.")


def format_run_time(value: object) -> str:
    """Render a stored local ISO timestamp compactly for the history cards."""
    if not isinstance(value, str) or not value:
        return "Time unavailable"
    try:
        parsed = datetime.fromisoformat(value)
        return f"{parsed.strftime('%I').lstrip('0') or '0'}:{parsed.strftime('%M %p')}"
    except ValueError:
        return "Time unavailable"


def nyseg_sync_process_pid() -> Optional[int]:
    try:
        return int(json.loads(NYSEG_DAILY_SYNC_PROCESS_PATH.read_text(encoding="utf-8")).get("pid"))
    except (OSError, ValueError, TypeError, AttributeError):
        return None


def nyseg_sync_process_is_active(pid: Optional[int]) -> bool:
    if not pid:
        return False
    try:
        os.kill(pid, 0)
    except OSError:
        return False
    return True


def clear_stale_nyseg_sync_state() -> None:
    """Recover after an interrupted runner leaves its lock or running status behind."""
    pid = nyseg_sync_process_pid()
    if pid and not nyseg_sync_process_is_active(pid):
        try:
            NYSEG_DAILY_SYNC_PROCESS_PATH.unlink()
        except FileNotFoundError:
            pass
    if NYSEG_DAILY_SYNC_LOCK_PATH.is_file() and not NYSEG_DAILY_SYNC_PROCESS_PATH.is_file():
        try:
            NYSEG_DAILY_SYNC_LOCK_PATH.unlink()
        except FileNotFoundError:
            pass
    if not NYSEG_DAILY_SYNC_LOCK_PATH.is_file() and not NYSEG_DAILY_SYNC_PROCESS_PATH.is_file():
        status = load_nyseg_daily_sync_status()
        if status.get("status") == "running":
            NYSEG_DAILY_SYNC_STATUS_PATH.write_text(json.dumps({"status": "idle"}), encoding="utf-8")


def build_bootstrap_data():
    sample_entries = build_sample_entries()
    config = AppConfig()
    historical_usage = load_historical_usage_summary(
        expected_annual_home_usage_kwh=config.annual_home_usage_kwh
    )
    monthly_bill = load_monthly_bill_summary()
    sunrun_production = load_sunrun_daily_production()
    nyseg_interval = build_nyseg_interval_usage_report()
    return {
        "tracker_today": tracker_today().isoformat(),
        "sample_entries": [entry_to_dict(entry) for entry in sample_entries],
        "default_config": config_to_dict(config),
        "weather_options": WEATHER_OPTIONS,
        "ai_status": get_ai_status(),
        "historical_usage": historical_usage_to_dict(historical_usage),
        "monthly_bill": monthly_bill_to_dict(monthly_bill),
        "sunrun_production": sunrun_production,
        "nyseg_interval": nyseg_interval,
    }


def build_local_application_snapshot(firebase_payload):
    config = firebase_payload.get("config") or {}
    entries = firebase_payload.get("entries") or []
    expected_usage = float(config.get("annual_home_usage_kwh") or AppConfig().annual_home_usage_kwh)
    historical_usage = load_historical_usage_summary(
        expected_annual_home_usage_kwh=expected_usage
    )

    return {
        "schema_version": 1,
        "generated_at": datetime.now().astimezone().isoformat(),
        "timezone": "America/New_York",
        "firebase": {
            "project_id": "glanville-issue-tracker",
            "entry_collection": "solar_daily_entries",
            "configuration_collection": "solar_tracker_config",
            "configuration_document": "primary",
            "synced_by": "Firebase Web SDK through the local Flask application",
        },
        "schedule": {
            "hourly_start": "09:00",
            "hourly_end": "20:00",
            "frequency": "hourly",
            "requires_local_app_open": True,
        },
        "daily_entries": entries,
        "configuration": config,
        "sunrun_production": load_sunrun_daily_production(),
        "historical_usage": historical_usage_to_dict(historical_usage),
        "monthly_bill": monthly_bill_to_dict(load_monthly_bill_summary()),
        "appliances": load_appliance_summary(),
        "source_notes": {
            "production": "SunRun production CSV/history",
            "meter_01": "NYSEG smart meter cumulative import register",
            "meter_02": "NYSEG smart meter cumulative export register",
            "weather_and_irradiance": "Open-Meteo values stored with each daily entry",
        },
    }


def _should_hide_entry_from_display(entry, sunrun_production=None):
    today_value = tracker_today()
    return entry.entry_date > today_value


def filter_entries_for_display(entries, sunrun_production=None):
    ordered_entries = sorted(entries, key=lambda entry: entry.entry_date)
    return [
        entry
        for entry in ordered_entries
        if not _should_hide_entry_from_display(entry, sunrun_production)
    ]


def build_contract_summary():
    return {
        "document_name": "SunRun Solar Contract.pdf",
        "proposal_date": "March 19, 2026",
        "proposal_id": "a08UJ0000106gqTYAQ",
        "headline_terms": [
            {"label": "Contract type", "value": "25-year Sunrun lease"},
            {"label": "Estimated production", "value": "11,141 kWh in year 1"},
            {"label": "Performance guarantee", "value": "90% of estimated production"},
            {"label": "Year 1 monthly payment", "value": "$153.19 with ACH discount"},
            {"label": "Annual escalator", "value": "2.99%"},
            {"label": "Deposit", "value": "$0.00"},
        ],
        "sections": [
            {
                "title": "What you are signing",
                "items": [
                    "Sunrun owns the solar system and leases it to you rather than selling it up front.",
                    "The agreement term is 25 years starting on the system Activation Date, not the signature date.",
                    "The contract says production may vary slightly based on final equipment selection, but the guarantee is tied to the originally quoted estimate.",
                ],
            },
            {
                "title": "Payments and billing",
                "items": [
                    "Your year 1 lease payment is $153.19 per month with the 5% ACH discount applied, before applicable taxes.",
                    "The monthly payment increases by 2.99% each year.",
                    "Sunrun bills monthly for the prior billing period, with the first bill expected about 30 to 40 days after activation.",
                    "You can prepay remaining monthly payments later, using Sunrun's discounted prepayment formula.",
                ],
            },
            {
                "title": "Production guarantee",
                "items": [
                    "Sunrun guarantees at least 90% of the system's estimated total production over time.",
                    "For your quoted system, the estimated first-year production is 11,141 kWh.",
                    "Sunrun says it audits production every two years and automatically issues an underproduction refund if the cumulative output falls below the guarantee threshold.",
                    "The guarantee can be weakened or voided by shading, dirt, blocked panels, monitor connectivity issues, tampering, or requested shutdown/removal.",
                ],
            },
            {
                "title": "Your responsibilities",
                "items": [
                    "Keep the system unobstructed by trimming trees and avoiding new roof obstructions that reduce output.",
                    "Maintain internet or acceptable cellular connectivity so Sunrun can monitor performance data.",
                    "Do not tamper with, move, or repair the system yourself.",
                    "Carry homeowner's insurance and coordinate any needed temporary system removal through Sunrun or a Sunrun-approved contractor.",
                ],
            },
            {
                "title": "Installation and roof items",
                "items": [
                    "Sunrun expects work to begin roughly 60 to 90 days after the agreement effective date, though utility and permit timing can change that.",
                    "Home upgrades such as panel work, trenching, meter work, or roof work may be required after inspection, and you are responsible for those added costs if needed.",
                    "Roof fastener penetrations are warranted watertight for 10 years, but the contract says the installation may void an existing roof warranty.",
                    "If the system must be removed later for roof repairs or similar work, Sunrun may charge for removal and reinstallation.",
                ],
            },
            {
                "title": "Buying, selling, and end-of-term options",
                "items": [
                    "You may purchase the system at fair market value during year 6, when you move, during year 20, or during year 25.",
                    "If you sell the home, the buyer can assume the agreement if they meet Sunrun's transfer requirements, or else you may have to buy the system.",
                    "At the end of the initial term, options include renewing, purchasing the system, or asking Sunrun to remove it at no additional charge.",
                    "If you do nothing by the deadline at end of term, the agreement auto-renews for five years under the renewal pricing terms described in the contract.",
                ],
            },
            {
                "title": "Disputes and cancellation",
                "items": [
                    "You can cancel before construction begins by contacting Sunrun using the cancellation details in the contract.",
                    "After construction starts, cancellation becomes much more limited and may require paying for home upgrades or default-related amounts.",
                    "The agreement routes most legal disputes into mediation and then binding arbitration rather than ordinary court litigation.",
                    "The contract includes liability limits and default-payment language that can become important if the agreement is terminated outside the normal contract terms.",
                ],
            },
        ],
        "callouts": [
            "This is a practical summary for quick reference, not legal advice.",
            "The full PDF remains the source of truth for exact pricing, transfer rights, cancellation language, arbitration terms, and any exhibits.",
        ],
    }


def build_billing_outlook(config, metrics, monthly_bill):
    contract_year_one_payment = 153.19
    annual_escalator_rate = (config.sunrun_escalator_pct or 0.0) / 100.0
    years_since_activation = max(0, tracker_today().year - config.activation_date.year)
    sunrun_current_monthly = contract_year_one_payment * ((1 + annual_escalator_rate) ** years_since_activation)
    sunrun_next_year_monthly = sunrun_current_monthly * (1 + annual_escalator_rate)

    contract_expected_grid_monthly_kwh = (
        (config.expected_grid_usage_kwh or 0.0) / 12.0
    )
    contract_expected_nyseg_monthly = (
        contract_expected_grid_monthly_kwh * config.current_electric_rate
    ) + config.monthly_fixed_charges

    july_true_up_nyseg_monthly = (
        monthly_bill.total_energy_charges + config.monthly_fixed_charges
        if monthly_bill.available
        else contract_expected_nyseg_monthly
    )
    july_total_usage_based_combined = july_true_up_nyseg_monthly + sunrun_current_monthly
    contract_expected_combined = contract_expected_nyseg_monthly + sunrun_current_monthly
    budget_billing_total = (
        monthly_bill.budget_billing_amount
        + monthly_bill.payment_agreement_amount
        + sunrun_current_monthly
        if monthly_bill.available
        else None
    )

    return {
        "sunrun_current_monthly": sunrun_current_monthly,
        "sunrun_next_year_monthly": sunrun_next_year_monthly,
        "sunrun_escalator_pct": config.sunrun_escalator_pct,
        "nyseg_contract_expected_monthly_kwh": contract_expected_grid_monthly_kwh,
        "nyseg_contract_expected_monthly_charge": contract_expected_nyseg_monthly,
        "nyseg_july_usage_based_monthly_charge": july_true_up_nyseg_monthly,
        "combined_usage_based_monthly_charge": july_total_usage_based_combined,
        "combined_contract_expected_monthly_charge": contract_expected_combined,
        "budget_billing_total_with_sunrun": budget_billing_total,
        "budget_billing_still_active": bool(monthly_bill.available and monthly_bill.budget_billing_amount > 0),
        "guarantee_daily_kwh": (config.production_guarantee_kwh or 0.0) / 365.0,
        "projected_daily_kwh": metrics.average_daily_production,
        "production_ahead_of_guarantee": metrics.annual_projection >= config.production_guarantee_kwh,
    }


def build_historical_spreadsheet_pricing(spreadsheet_summary, monthly_bill_summary):
    spreadsheet = historical_usage_to_dict(spreadsheet_summary)
    monthly_bill = monthly_bill_to_dict(monthly_bill_summary)
    effective_rate_per_kwh = 0.0
    if monthly_bill_summary.available and monthly_bill_summary.current_usage_kwh > 0:
        effective_rate_per_kwh = (
            monthly_bill_summary.total_energy_charges / monthly_bill_summary.current_usage_kwh
        )

    enriched_rows = []
    estimated_total = 0.0
    for row in spreadsheet.get("monthly_records", []):
        estimated_charge = float(row.get("kwh", 0.0)) * effective_rate_per_kwh
        estimated_total += estimated_charge
        enriched_row = dict(row)
        enriched_row["effective_rate_per_kwh"] = effective_rate_per_kwh
        enriched_row["estimated_charge"] = estimated_charge
        enriched_rows.append(enriched_row)

    spreadsheet["monthly_records"] = enriched_rows
    spreadsheet["effective_rate_per_kwh"] = effective_rate_per_kwh
    spreadsheet["estimated_total_energy_charges"] = estimated_total
    spreadsheet["rate_source_statement_date"] = monthly_bill.get("statement_date")
    spreadsheet["rate_source_energy_charges"] = monthly_bill.get("total_energy_charges", 0.0)
    spreadsheet["rate_source_usage_kwh"] = monthly_bill.get("current_usage_kwh", 0.0)
    return spreadsheet


def build_energy_impact_summary(config, metrics):
    average_home_day_kwh = (config.annual_home_usage_kwh or 0.0) / 365.0
    today_house_days = (
        metrics.today_production / average_home_day_kwh if average_home_day_kwh else 0.0
    )
    ytd_house_days = (
        metrics.ytd_production / average_home_day_kwh if average_home_day_kwh else 0.0
    )
    ev_kwh_per_mile = 0.30
    today_ev_miles = metrics.today_production / ev_kwh_per_mile if ev_kwh_per_mile else 0.0
    ytd_ev_miles = metrics.ytd_production / ev_kwh_per_mile if ev_kwh_per_mile else 0.0
    average_home_hours_supported = today_house_days * 24.0

    return {
        "average_home_day_kwh": average_home_day_kwh,
        "today_house_days": today_house_days,
        "ytd_house_days": ytd_house_days,
        "today_ev_miles": today_ev_miles,
        "ytd_ev_miles": ytd_ev_miles,
        "average_home_hours_supported": average_home_hours_supported,
        "ev_kwh_per_mile": ev_kwh_per_mile,
    }


def hydrate_entries(items):
    hydrated = []
    for item in items or []:
        hydrated.append(
            DailySolarEntry(
                entry_date=date.fromisoformat(item["entry_date"]),
                irradiance_peak_wm2=float(item.get("irradiance_peak_wm2", 0.0)),
                production_kwh=float(item.get("production_kwh", 0.0)),
                meter_01_import_reading=float(item.get("meter_01_import_reading", 0.0)),
                meter_02_export_reading=float(item.get("meter_02_export_reading", 0.0)),
                weather=item.get("weather", "Unknown"),
                temperature_f=float(item["temperature_f"]) if item.get("temperature_f") is not None else None,
                temperature_high_f=float(item["temperature_high_f"]) if item.get("temperature_high_f") is not None else None,
                temperature_low_f=float(item["temperature_low_f"]) if item.get("temperature_low_f") is not None else None,
                humidity_pct=float(item["humidity_pct"]) if item.get("humidity_pct") is not None else None,
                cloud_cover_pct=float(item["cloud_cover_pct"]) if item.get("cloud_cover_pct") is not None else None,
                wind_mph=float(item["wind_mph"]) if item.get("wind_mph") is not None else None,
                notes=item.get("notes", ""),
                estimated=bool(item.get("estimated", False)),
                lookup_source=item.get("lookup_source", ""),
                created_at=item.get("created_at"),
                updated_at=item.get("updated_at"),
            )
        )
    hydrated.sort(key=lambda entry: entry.entry_date)
    return hydrated


def hydrate_config(item):
    item = item or {}
    return AppConfig(
        system_size_kw_dc=float(item.get("system_size_kw_dc", 18.45)),
        panel_count=int(item.get("panel_count", 41)),
        inverter_count=int(item.get("inverter_count", 2)),
        activation_date=date.fromisoformat(item.get("activation_date", "2026-07-10")),
        smart_meter_install_date=date.fromisoformat(item.get("smart_meter_install_date", "2026-07-16")),
        utility_name=item.get("utility_name", "NYSEG"),
        production_guarantee_kwh=float(item.get("production_guarantee_kwh", 11141.0)),
        annual_home_usage_kwh=float(item.get("annual_home_usage_kwh", 17967.0)),
        expected_offset_pct=float(item.get("expected_offset_pct", 62.0)),
        expected_grid_usage_kwh=float(item.get("expected_grid_usage_kwh", 6826.0)),
        lease_term_years=int(item.get("lease_term_years", 25)),
        sunrun_escalator_pct=float(item.get("sunrun_escalator_pct", 2.99)),
        current_electric_rate=float(item.get("current_electric_rate", 0.24)),
        monthly_fixed_charges=float(item.get("monthly_fixed_charges", 19.50)),
        monthly_lease_payment=float(item.get("monthly_lease_payment", 155.0)),
        tree_removal_cost=float(item.get("tree_removal_cost", 3090.0)),
    )


def render_dashboard(entries, config, firebase_status):
    sunrun_production = load_sunrun_daily_production()
    visible_entries = filter_entries_for_display(entries, sunrun_production)
    df = build_dataframe(visible_entries, config)
    metrics = calculate_metrics(df, config)
    alerts = build_alerts(df, config)
    charts = build_chart_bundle(df, config)
    recent_entries = list(reversed(visible_entries[-10:]))
    historical_usage = load_historical_usage_summary(
        expected_annual_home_usage_kwh=config.annual_home_usage_kwh
    )
    monthly_bill = load_monthly_bill_summary()
    billing_outlook = build_billing_outlook(config, metrics, monthly_bill)
    energy_impact = build_energy_impact_summary(config, metrics)
    return render_template(
        "dashboard_content.html",
        metrics=metrics,
        alerts=alerts,
        charts=charts,
        recent_entries=recent_entries,
        tracker_entries=[entry_to_dict(entry) for entry in visible_entries],
        config=config,
        firebase_status=firebase_status,
        bootstrap_data=build_bootstrap_data(),
        historical_usage=historical_usage_to_dict(historical_usage),
        monthly_bill=monthly_bill_to_dict(monthly_bill),
        billing_outlook=billing_outlook,
        energy_impact=energy_impact,
    )


@main_blueprint.route("/")
def dashboard():
    entries = build_sample_entries()
    config = AppConfig()
    sunrun_production = load_sunrun_daily_production()
    visible_entries = filter_entries_for_display(entries, sunrun_production)
    historical_usage = load_historical_usage_summary(
        expected_annual_home_usage_kwh=config.annual_home_usage_kwh
    )
    monthly_bill = load_monthly_bill_summary()
    metrics = calculate_metrics(build_dataframe(visible_entries, config), config)
    billing_outlook = build_billing_outlook(config, metrics, monthly_bill)
    energy_impact = build_energy_impact_summary(config, metrics)
    firebase_status = {
        "message": "Loading live Firebase data in the browser. Startup data is shown until the connection completes.",
        "kind": "loading",
        "using_demo_data": True,
    }
    return render_template(
        "dashboard.html",
        page_name="dashboard",
        local_snapshot_mode=False,
        bootstrap_data=build_bootstrap_data(),
        metrics=metrics,
        alerts=build_alerts(build_dataframe(visible_entries, config), config),
        charts=build_chart_bundle(build_dataframe(visible_entries, config), config),
        recent_entries=list(reversed(visible_entries[-10:])),
        tracker_entries=[entry_to_dict(entry) for entry in visible_entries],
        config=config,
        firebase_status=firebase_status,
        historical_usage=historical_usage_to_dict(historical_usage),
        monthly_bill=monthly_bill_to_dict(monthly_bill),
        billing_outlook=billing_outlook,
        energy_impact=energy_impact,
    )


def load_reconciliation_entries():
    """Use the newest local Firebase snapshot for a stable bill-to-meter comparison."""
    if LOCAL_APPLICATION_SNAPSHOT_PATH.is_file():
        try:
            payload = json.loads(LOCAL_APPLICATION_SNAPSHOT_PATH.read_text(encoding="utf-8"))
            entries = hydrate_entries(payload.get("daily_entries", []))
            if entries:
                return entries, payload.get("generated_at", "local snapshot")
        except (OSError, ValueError, KeyError):
            pass
    return build_sample_entries(), "starter records"

@main_blueprint.route("/nyseg-net-metering")
def nyseg_net_metering():
    entries, data_as_of = load_reconciliation_entries()
    return render_template(
        "nyseg_net_metering.html",
        page_name="nyseg-net-metering",
        local_snapshot_mode=False,
        bootstrap_data=build_bootstrap_data(),
        report=build_net_metering_report(),
        reconciliation=build_net_metering_reconciliation(entries),
        data_as_of=data_as_of,
        usage_report=build_nyseg_interval_usage_report(),
    )


@main_blueprint.route("/nyseg-usage")
def nyseg_usage():
    return redirect(url_for("main.nyseg_net_metering"))

def build_meter_file_reconciliation(interval_file: dict) -> dict:
    """Explain the difference between a cumulative smart meter and delayed NYSEG CSV data."""
    # This is the on-site meter snapshot supplied on October 8.  It is kept
    # separate from the NYSEG file because NYSEG publishes delayed intervals,
    # while the meter is a cumulative, near-real-time register.
    snapshot = {
        "reading_date": "2026-10-08",
        "activation_date": "2026-07-09",
        "solar_produced_kwh": 5079.0,
        "m01_kwh": 1421.0,
        "m02_kwh": 3495.0,
    }
    daily_rows = interval_file.get("daily_rows", [])
    file_m01 = sum(float(row.get("Delivered") or 0.0) for row in daily_rows)
    file_m02 = sum(float(row.get("Received") or 0.0) for row in daily_rows)
    dates = sorted(str(row.get("Date")) for row in daily_rows if row.get("Date"))
    self_consumed = max(0.0, snapshot["solar_produced_kwh"] - snapshot["m02_kwh"])
    return {
        **snapshot,
        "file_start": dates[0] if dates else None,
        "file_end": dates[-1] if dates else None,
        "file_m01_kwh": file_m01,
        "file_m02_kwh": file_m02,
        "m01_not_in_file_kwh": max(0.0, snapshot["m01_kwh"] - file_m01),
        "m02_not_in_file_kwh": max(0.0, snapshot["m02_kwh"] - file_m02),
        "smart_net_export_kwh": snapshot["m02_kwh"] - snapshot["m01_kwh"],
        "file_net_export_kwh": file_m02 - file_m01,
        "self_consumed_kwh": self_consumed,
        "self_consumption_percent": (self_consumed / snapshot["solar_produced_kwh"] * 100)
        if snapshot["solar_produced_kwh"] else 0.0,
    }


@main_blueprint.route("/nyseg-usage-file")
@main_blueprint.route("/nyseg-usage-file/daily")
def nyseg_usage_file():
    interval_file = load_nyseg_interval_file_rows()
    grouped = request.path.endswith("/daily")
    sunrun_by_date = load_sunrun_daily_production().get("by_date", {})
    for row in [*interval_file.get("daily_rows", []), *interval_file.get("rows", [])]:
        row["sunrun_power_kwh"] = sunrun_by_date.get(row["Date"], {}).get("production_kwh")
    electric_rate = AppConfig().current_electric_rate
    chart_rows = [
        {
            "date": row["Date"],
            "production_kwh": sunrun_by_date.get(row["Date"], {}).get("production_kwh"),
            "delivered_kwh": row["Delivered"],
            "received_kwh": row["Received"],
            "edc_kwh": (
                sunrun_by_date.get(row["Date"], {}).get("production_kwh", 0.0)
                + float(row["Delivered"])
                - float(row["Received"])
                if row["Date"] in sunrun_by_date
                else None
            ),
            "import_cost": float(row["Delivered"]) * electric_rate,
            "export_credit": float(row["Received"]) * electric_rate,
            "net_cost": (float(row["Delivered"]) - float(row["Received"])) * electric_rate,
        }
        for row in sorted(interval_file.get("daily_rows", []), key=lambda row: row["Date"], reverse=True)
    ]
    hourly_chart_rows = []
    for row in interval_file.get("rows", []):
        try:
            hour = datetime.fromisoformat(str(row["Start Time"])).hour
        except (KeyError, TypeError, ValueError):
            continue
        hourly_chart_rows.append({
            "date": row["Date"],
            "hour": hour,
            "import_kwh": float(row["Delivered"]),
            "export_kwh": float(row["Received"]),
        })
    monthly_costs: dict[str, dict] = {}
    for row in chart_rows:
        month_key = row["date"][:7]
        summary = monthly_costs.setdefault(month_key, {
            "m01_kwh": 0.0,
            "m02_kwh": 0.0,
            "production_kwh": 0.0,
            "edc_kwh": 0.0,
        })
        summary["m01_kwh"] += row["delivered_kwh"]
        summary["m02_kwh"] += row["received_kwh"]
        summary["production_kwh"] += float(row["production_kwh"] or 0.0)
        summary["edc_kwh"] += float(row["edc_kwh"] or 0.0)
    monthly_net_charges = [
        {
            "month": date.fromisoformat(f"{month_key}-01").strftime("%B %Y"),
            "m01_kwh": values["m01_kwh"],
            "m02_kwh": values["m02_kwh"],
            "production_kwh": values["production_kwh"],
            "edc_kwh": values["edc_kwh"],
            "import_cost": values["m01_kwh"] * electric_rate,
            "export_value": values["m02_kwh"] * electric_rate,
            "net_cost": (values["m01_kwh"] - values["m02_kwh"]) * electric_rate,
        }
        for month_key, values in sorted(monthly_costs.items(), reverse=True)
    ]
    monthly_meter_totals = [
        {
            **month,
            "combined_kwh": month["m01_kwh"] + month["m02_kwh"],
        }
        for month in monthly_net_charges
    ]
    meter_totals = {
        "m01_kwh": sum(month["m01_kwh"] for month in monthly_meter_totals),
        "m02_kwh": sum(month["m02_kwh"] for month in monthly_meter_totals),
        "production_kwh": sum(month["production_kwh"] for month in monthly_meter_totals),
        "edc_kwh": sum(month["edc_kwh"] for month in monthly_meter_totals),
    }
    meter_totals["combined_kwh"] = meter_totals["m01_kwh"] + meter_totals["m02_kwh"]
    daily_dates = sorted(row["Date"] for row in interval_file.get("daily_rows", []))
    net_charge_summary = {
        "import_kwh": meter_totals["m01_kwh"],
        "export_kwh": meter_totals["m02_kwh"],
        "net_cost": (meter_totals["m01_kwh"] - meter_totals["m02_kwh"]) * electric_rate,
        "first_date": daily_dates[0] if daily_dates else None,
        "last_date": daily_dates[-1] if daily_dates else None,
        "day_count": len(daily_dates),
        "interval_count": len(interval_file.get("rows", [])),
    }
    return render_template(
        "nyseg_usage_file.html",
        page_name="nyseg-usage-file",
        local_snapshot_mode=False,
        bootstrap_data=build_bootstrap_data(),
        interval_file=interval_file,
        grouped=grouped,
        chart_rows=chart_rows,
        hourly_chart_rows=hourly_chart_rows,
        electric_rate=electric_rate,
        monthly_net_charges=monthly_net_charges,
        net_charge_summary=net_charge_summary,
        monthly_meter_totals=monthly_meter_totals,
        meter_totals=meter_totals,
        nyseg_sync_status=load_nyseg_daily_sync_status(),
        bill_summary=build_bill_summary_report(),
        meter_reconciliation=build_meter_file_reconciliation(interval_file),
        sunrun_runs=load_sunrun_recent_runs(),
        nyseg_runs=load_nyseg_recent_runs(),
    )


@main_blueprint.route("/api/nyseg-downloads/latest", methods=["POST"])
def process_latest_nyseg_download_api():
    """Promote a manually downloaded NYSEG CSV to the tracker source file."""
    try:
        source, rows = latest_manual_nyseg_download()
    except FileNotFoundError as error:
        return jsonify({"error": str(error)}), 404

    destination = DEFAULT_INTERVAL_USAGE_PATH
    destination.parent.mkdir(parents=True, exist_ok=True)
    if source.resolve() != destination.resolve() and destination.is_file():
        archive = destination.parent / "archive"
        archive.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        shutil.copy2(destination, archive / f"NYSEG_Daily_Usage_Data_{stamp}.csv")
    temporary = destination.with_suffix(".manual.partial.csv")
    shutil.copy2(source, temporary)
    temporary.replace(destination)
    return jsonify({
        "filename": source.name,
        "rows": rows,
        "source_modified_at": datetime.fromtimestamp(source.stat().st_mtime).astimezone().isoformat(timespec="seconds"),
        "destination": str(destination),
    })


@main_blueprint.route("/nyseg-bill-summary")
def nyseg_bill_summary():
    interval_file = build_nyseg_interval_usage_report()
    return render_template(
        "nyseg_bill_summary.html",
        page_name="nyseg-usage-file",
        local_snapshot_mode=False,
        bootstrap_data=build_bootstrap_data(),
        bill_summary=build_bill_summary_report(),
        meter_reconciliation=build_meter_file_reconciliation(interval_file),
    )


@main_blueprint.route("/api/nyseg-daily-sync-status")
def nyseg_daily_sync_status_api():
    clear_stale_nyseg_sync_state()
    response = jsonify(load_nyseg_daily_sync_status() or {"status": "idle"})
    response.headers["Cache-Control"] = "no-store"
    return response


@main_blueprint.route("/api/nyseg-daily-sync-log")
def nyseg_daily_sync_log_api():
    try:
        raw = NYSEG_DAILY_SYNC_LOG_PATH.read_bytes()
        encoding = "utf-16" if raw.startswith((b"\xff\xfe", b"\xfe\xff")) else "utf-8-sig"
        lines = raw.decode(encoding, errors="replace").splitlines()[-80:]
    except OSError:
        lines = ["No NYSEG sync activity has been recorded yet."]
    response = jsonify({"lines": lines})
    response.headers["Cache-Control"] = "no-store"
    return response


@main_blueprint.route("/nyseg-daily-sync-log")
def nyseg_daily_sync_log_view():
    try:
        raw = NYSEG_DAILY_SYNC_LOG_PATH.read_bytes()
        encoding = "utf-16" if raw.startswith((b"\xff\xfe", b"\xfe\xff")) else "utf-8-sig"
        log_text = raw.decode(encoding, errors="replace")
    except OSError:
        log_text = "No NYSEG sync activity has been recorded yet."
    return render_template(
        "nyseg_daily_sync_log.html",
        log_text=log_text,
        page_name="nyseg-usage-file",
        bootstrap_data=build_bootstrap_data(),
    )


@main_blueprint.route("/api/nyseg-daily-sync/clear", methods=["POST"])
def nyseg_daily_sync_clear_api():
    """Clear the visible sync outcome and diagnostics without touching usage data."""
    clear_stale_nyseg_sync_state()
    if NYSEG_DAILY_SYNC_LOCK_PATH.is_file() or NYSEG_DAILY_SYNC_PROCESS_PATH.is_file():
        return jsonify({"error": "A NYSEG sync is running and its activity cannot be cleared yet."}), 409
    NYSEG_DAILY_SYNC_STATUS_PATH.parent.mkdir(parents=True, exist_ok=True)
    NYSEG_DAILY_SYNC_STATUS_PATH.write_text(json.dumps({"status": "idle"}), encoding="utf-8")
    NYSEG_DAILY_SYNC_LOG_PATH.write_text("", encoding="utf-8")
    return jsonify({"cleared": True})


@main_blueprint.route("/api/nyseg-daily-sync/run", methods=["POST"])
def nyseg_daily_sync_run_api():
    if not NYSEG_MANUAL_RUN_SCRIPT_PATH.is_file():
        return jsonify({"error": "The NYSEG Manual Run script is unavailable."}), 404
    clear_stale_nyseg_sync_state()
    if NYSEG_DAILY_SYNC_LOCK_PATH.is_file() or NYSEG_DAILY_SYNC_PROCESS_PATH.is_file():
        return jsonify({"error": "NYSEG sync is already running. Review the live activity log below."}), 409
    started_at = datetime.now().astimezone().isoformat(timespec="seconds")
    NYSEG_DAILY_SYNC_STATUS_PATH.parent.mkdir(parents=True, exist_ok=True)
    NYSEG_DAILY_SYNC_STATUS_PATH.write_text(
        json.dumps({"status": "running", "started_at": started_at}, indent=2), encoding="utf-8"
    )
    NYSEG_DAILY_SYNC_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    NYSEG_DAILY_SYNC_LOG_PATH.write_text(
        f"[{started_at}] Starting NYSEG Manual Run\n"
        "Step 0/6: Preparing NYSEG_File_Download_Test.py. No M01/M02 import, email, history, or housekeeping will run.\n",
        encoding="utf-8",
    )
    process = subprocess.Popen(
        [sys.executable, str(NYSEG_MANUAL_RUN_SCRIPT_PATH)],
        cwd=NYSEG_MANUAL_RUN_SCRIPT_PATH.parent,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    NYSEG_DAILY_SYNC_PROCESS_PATH.write_text(
        json.dumps({"pid": process.pid, "started_at": started_at}), encoding="utf-8"
    )
    return jsonify({"started": True})


@main_blueprint.route("/api/nyseg-daily-sync/process-saved-file", methods=["POST"])
def nyseg_daily_sync_process_saved_file_api():
    """Run the second NYSEG workflow step against the CSV from Manual Run."""
    if not NYSEG_DAILY_SYNC_WORKFLOW_PATH.is_file():
        return jsonify({"error": "The NYSEG post-download workflow is unavailable."}), 404
    clear_stale_nyseg_sync_state()
    if NYSEG_DAILY_SYNC_LOCK_PATH.is_file() or NYSEG_DAILY_SYNC_PROCESS_PATH.is_file():
        return jsonify({"error": "NYSEG sync is already running. Review the live activity log below."}), 409
    started_at = datetime.now().astimezone().isoformat(timespec="seconds")
    NYSEG_DAILY_SYNC_STATUS_PATH.parent.mkdir(parents=True, exist_ok=True)
    NYSEG_DAILY_SYNC_STATUS_PATH.write_text(
        json.dumps({"status": "running", "operation": "process", "stage": "validate", "started_at": started_at}, indent=2),
        encoding="utf-8",
    )
    NYSEG_DAILY_SYNC_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    NYSEG_DAILY_SYNC_LOG_PATH.write_text(
        f"[{started_at}] Processing the CSV from the last successful NYSEG Manual Run\n"
        "Step 2/2: Validating M01/M02, updating Firebase and dashboards, recording history, sending email, and completing housekeeping.\n",
        encoding="utf-8",
    )
    process = subprocess.Popen(
        [sys.executable, str(NYSEG_DAILY_SYNC_WORKFLOW_PATH), "--skip-download", "--log-path", str(NYSEG_DAILY_SYNC_LOG_PATH)],
        cwd=NYSEG_DAILY_SYNC_WORKFLOW_PATH.parent,
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    NYSEG_DAILY_SYNC_PROCESS_PATH.write_text(
        json.dumps({"pid": process.pid, "started_at": started_at}), encoding="utf-8"
    )
    return jsonify({"started": True, "message": "Processing the saved NYSEG CSV."})


@main_blueprint.route("/api/nyseg-daily-sync/stop", methods=["POST"])
def nyseg_daily_sync_stop_api():
    pid = nyseg_sync_process_pid()
    if pid:
        subprocess.run(["taskkill", "/PID", str(pid), "/T", "/F"], capture_output=True, text=True, check=False)
    for path in (NYSEG_DAILY_SYNC_LOCK_PATH, NYSEG_DAILY_SYNC_PROCESS_PATH):
        try:
            path.unlink()
        except FileNotFoundError:
            pass
    NYSEG_DAILY_SYNC_STATUS_PATH.parent.mkdir(parents=True, exist_ok=True)
    stopped_at = datetime.now().astimezone().isoformat(timespec="seconds")
    NYSEG_DAILY_SYNC_STATUS_PATH.write_text(json.dumps({"status": "stopped", "completed_at": stopped_at}), encoding="utf-8")
    with NYSEG_DAILY_SYNC_LOG_PATH.open("a", encoding="utf-8", newline="\n") as handle:
        handle.write(f"[{stopped_at}] NYSEG daily sync stopped by user.\n")
    return jsonify({"stopped": bool(pid)})

@main_blueprint.route("/nyseg-reconciliation")
def nyseg_reconciliation():
    return redirect(url_for("main.nyseg_net_metering"))

@main_blueprint.route("/entries")
def entries():
    return render_template(
        "entries.html",
        page_name="entries",
        local_snapshot_mode=False,
        bootstrap_data=build_bootstrap_data(),
        entries=list(reversed(build_sample_entries())),
        weather_options=WEATHER_OPTIONS,
    )


@main_blueprint.route("/settings")
def settings():
    return render_template(
        "settings.html",
        page_name="settings",
        local_snapshot_mode=False,
        bootstrap_data=build_bootstrap_data(),
        config=AppConfig(),
    )


@main_blueprint.route("/contract-summary")
def contract_summary():
    return render_template(
        "contract_summary.html",
        page_name="contract-summary",
        local_snapshot_mode=False,
        bootstrap_data=build_bootstrap_data(),
        contract_summary=build_contract_summary(),
    )


@main_blueprint.route("/dictionary")
def dictionary():
    return render_template(
        "dictionary.html",
        page_name="dictionary",
        local_snapshot_mode=False,
        bootstrap_data=build_bootstrap_data(),
    )


@main_blueprint.route("/light-bulbs")
def light_bulbs():
    return render_template(
        "light_bulbs.html",
        page_name="light-bulbs",
        local_snapshot_mode=False,
        bootstrap_data=build_bootstrap_data(),
        reference_data=load_light_bulbs(),
    )


@main_blueprint.route("/electricity-usage")
def electricity_usage():
    return render_template(
        "electricity_usage.html",
        page_name="electricity-usage",
        local_snapshot_mode=False,
        bootstrap_data=build_bootstrap_data(),
        reference_data=load_electricity_usage(),
    )


@main_blueprint.route("/circuit-breakers")
def circuit_breakers():
    return render_template(
        "circuit_breakers.html",
        page_name="circuit-breakers",
        local_snapshot_mode=False,
        bootstrap_data=build_bootstrap_data(),
        reference_data=load_circuit_breakers(),
    )


@main_blueprint.route("/documents/circuit-breakers/file")
def circuit_breakers_file():
    if not CIRCUIT_BREAKER_DIRECTORY_PATH.exists():
        return Response("Circuit breaker directory PDF is not available.", status=404)
    return send_file(
        CIRCUIT_BREAKER_DIRECTORY_PATH,
        as_attachment=False,
        mimetype="application/pdf",
    )


@main_blueprint.route("/appliances")
def appliances():
    return render_template(
        "appliances.html",
        page_name="appliances",
        local_snapshot_mode=False,
        bootstrap_data=build_bootstrap_data(),
        appliances=load_appliance_summary(),
    )


@main_blueprint.route("/sunrun-production")
def sunrun_production():
    production_data = load_sunrun_daily_production()
    production_data.pop("source_path", None)
    return render_template(
        "sunrun_production.html",
        page_name="sunrun-production",
        local_snapshot_mode=False,
        bootstrap_data=build_bootstrap_data(),
        sunrun_production=production_data,
    )


@main_blueprint.route("/api/render/dashboard", methods=["POST"])
def render_dashboard_api():
    payload = request.get_json(force=True)
    entries = hydrate_entries(payload.get("entries", []))
    config = hydrate_config(payload.get("config", {}))
    firebase_status = payload.get("firebase_status", {})
    historical_usage = load_historical_usage_summary(
        expected_annual_home_usage_kwh=config.annual_home_usage_kwh
    )
    monthly_bill = load_monthly_bill_summary()
    html = render_dashboard(entries, config, firebase_status)
    return jsonify(
        {
            "html": html,
            "ai_status": get_ai_status(),
            "historical_usage": historical_usage_to_dict(historical_usage),
            "monthly_bill": monthly_bill_to_dict(monthly_bill),
        }
    )


@main_blueprint.route("/api/ai/ask", methods=["POST"])
def ai_ask():
    payload = request.get_json(force=True)
    question = str(payload.get("question", "")).strip()
    entries = hydrate_entries(payload.get("entries", []))
    config = hydrate_config(payload.get("config", {}))

    if not question:
        return jsonify(
            {
                "title": "AI Solar Analyst",
                "answer": "Ask a question about production, guarantee tracking, savings, anomalies, or forecasts.",
                "bullets": get_ai_status()["suggested_prompts"],
                "provider": "rules",
                "openai_configured": get_ai_status()["openai_configured"],
            }
        )

    return jsonify(answer_question(question, entries, config))


@main_blueprint.route("/api/appliances")
def appliances_api():
    return jsonify(load_appliance_summary())


@main_blueprint.route("/api/appliances/save", methods=["POST"])
def appliances_save_api():
    payload = request.get_json(force=True)
    records = payload.get("records", [])
    return jsonify(save_appliance_records(records))


@main_blueprint.route("/api/reference/light-bulbs")
def light_bulbs_api():
    return jsonify(load_light_bulbs())


@main_blueprint.route("/api/reference/light-bulbs/save", methods=["POST"])
def light_bulbs_save_api():
    payload = request.get_json(force=True)
    return jsonify(save_light_bulbs(payload.get("records") or []))


@main_blueprint.route("/api/reference/electricity-usage")
def electricity_usage_api():
    return jsonify(load_electricity_usage())


@main_blueprint.route("/api/reference/electricity-usage/save", methods=["POST"])
def electricity_usage_save_api():
    payload = request.get_json(force=True)
    return jsonify(save_electricity_usage(payload))


@main_blueprint.route("/api/reference/circuit-breakers")
def circuit_breakers_api():
    return jsonify(load_circuit_breakers())


@main_blueprint.route("/api/reference/circuit-breakers/save", methods=["POST"])
def circuit_breakers_save_api():
    payload = request.get_json(force=True)
    return jsonify(save_circuit_breakers(payload))


@main_blueprint.route("/api/nyseg-meter-intervals")
def nyseg_meter_intervals_api():
    report = build_nyseg_interval_usage_report()
    anchor = None
    preview = []
    sunrun_by_date = load_sunrun_daily_production().get("by_date", {})
    if report["available"]:
        try:
            source_start = date.fromisoformat(report["source_start"])
            source_end = date.fromisoformat(report["source_end"])
            candidates = [
                entry for entry in FirestoreRepository().list_entries()
                if source_start <= entry.entry_date <= source_end
                and entry.meter_01_import_reading >= 0
                and entry.meter_02_export_reading >= 0
            ]
            if candidates:
                entry = max(candidates, key=lambda item: item.entry_date)
                anchor = {
                    "entry_date": entry.entry_date.isoformat(),
                    "meter_01_import_reading": entry.meter_01_import_reading,
                    "meter_02_export_reading": entry.meter_02_export_reading,
                    "meter_values_confirmed": True,
                }
                running_m01 = entry.meter_01_import_reading
                running_m02 = entry.meter_02_export_reading
                existing_dates = {item.entry_date for item in candidates}
                for row in reversed(report.get("daily", [])):
                    row_date = date.fromisoformat(row["date"])
                    if row_date <= entry.entry_date:
                        continue
                    running_m01 += row["import_kwh"]
                    running_m02 += row["export_kwh"]
                    preview.append({
                        "date": row["date"],
                        "m01": round(running_m01, 1),
                        "m02": round(running_m02, 1),
                        "import_kwh": row["import_kwh"],
                        "export_kwh": row["export_kwh"],
                        "production_kwh": sunrun_by_date.get(row["date"], {}).get("production_kwh"),
                        "is_new": row_date not in existing_dates,
                    })
        except Exception:
            # The browser can still use its live Firebase data when a local
            # server-side read is unavailable.
            anchor = None
    return jsonify({
        "available": report["available"],
        "source_start": report.get("source_start"),
        "source_end": report.get("source_end"),
        "daily": [
            {"date": row["date"], "import_kwh": row["import_kwh"], "export_kwh": row["export_kwh"]}
            for row in reversed(report.get("daily", []))
        ],
        "anchor": anchor,
        "preview": preview,
    })


@main_blueprint.route("/api/nyseg-meter-intervals/apply", methods=["POST"])
def nyseg_meter_intervals_apply_api():
    """Persist the server-verified NYSEG preview after the user approves it."""
    report = build_nyseg_interval_usage_report()
    if not report["available"]:
        return jsonify({"error": "The local NYSEG interval file is unavailable."}), 404

    source_start = date.fromisoformat(report["source_start"])
    source_end = date.fromisoformat(report["source_end"])
    repository = FirestoreRepository()
    entries = repository.list_entries()
    candidates = [
        entry for entry in entries
        if source_start <= entry.entry_date <= source_end
        and entry.meter_01_import_reading >= 0
        and entry.meter_02_export_reading >= 0
    ]
    if not candidates:
        return jsonify({"error": "No cumulative M01/M02 anchor is available."}), 409

    anchor = max(candidates, key=lambda item: item.entry_date)
    existing_dates = {entry.entry_date for entry in candidates}
    running_m01 = anchor.meter_01_import_reading
    running_m02 = anchor.meter_02_export_reading
    saved_dates = []
    for row in reversed(report.get("daily", [])):
        row_date = date.fromisoformat(row["date"])
        if row_date <= anchor.entry_date:
            continue
        running_m01 += row["import_kwh"]
        running_m02 += row["export_kwh"]
        if row_date in existing_dates:
            continue
        repository.save_utility_meter_reading(
            row_date,
            round(running_m01, 1),
            round(running_m02, 1),
            "M01/M02 created from reviewed NYSEG hourly Delivered/Received intervals.",
        )
        saved_dates.append(row["date"])
    return jsonify({"saved": len(saved_dates), "dates": saved_dates})

@main_blueprint.route("/api/sunrun-production")
def sunrun_production_api():
    return jsonify(load_sunrun_daily_production())


@main_blueprint.route("/api/sunrun-production/save", methods=["POST"])
def sunrun_production_save_api():
    payload = request.get_json(force=True)
    try:
        result = save_sunrun_daily_production(payload.get("records", []))
    except ValueError as error:
        return jsonify({"error": str(error)}), 400
    return jsonify(result)


@main_blueprint.route("/api/validate-local-dashboard")
def validate_local_dashboard():
    connection = HTTPConnection("127.0.0.1", 8765, timeout=3)
    try:
        connection.request("GET", "/")
        response = connection.getresponse()
        return jsonify(
            {
                "available": 200 <= response.status < 500,
                "status": response.status,
                "url": LOCAL_DASHBOARD_URL,
            }
        )
    except OSError as error:
        return jsonify(
            {
                "available": False,
                "status": None,
                "url": LOCAL_DASHBOARD_URL,
                "message": str(error),
            }
        )
    finally:
        connection.close()


@main_blueprint.route("/api/local-data-snapshot", methods=["GET", "POST"])
def local_data_snapshot_api():
    if request.method == "GET":
        if not LOCAL_APPLICATION_SNAPSHOT_PATH.exists():
            return jsonify(
                {
                    "available": False,
                    "path": str(LOCAL_APPLICATION_SNAPSHOT_PATH),
                    "message": "The local application snapshot has not been created yet.",
                }
            ), 404
        return send_file(
            LOCAL_APPLICATION_SNAPSHOT_PATH,
            mimetype="application/json",
            as_attachment=False,
            download_name=LOCAL_APPLICATION_SNAPSHOT_PATH.name,
            max_age=0,
        )

    if request.remote_addr not in {"127.0.0.1", "::1"}:
        return jsonify({"saved": False, "message": "Snapshot writes are localhost-only."}), 403

    payload = request.get_json(silent=True) or {}
    if not isinstance(payload.get("entries"), list) or not isinstance(payload.get("config"), dict):
        return jsonify(
            {
                "saved": False,
                "message": "Snapshot payload must contain Firebase entries and configuration.",
            }
        ), 400

    snapshot = build_local_application_snapshot(payload)
    LOCAL_JSON_DIRECTORY.mkdir(parents=True, exist_ok=True)
    temporary_path = LOCAL_APPLICATION_SNAPSHOT_PATH.with_suffix(".json.tmp")
    temporary_path.write_text(
        json.dumps(snapshot, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )
    temporary_path.replace(LOCAL_APPLICATION_SNAPSHOT_PATH)

    return jsonify(
        {
            "saved": True,
            "path": str(LOCAL_APPLICATION_SNAPSHOT_PATH),
            "generated_at": snapshot["generated_at"],
            "entry_count": len(snapshot["daily_entries"]),
        }
    )


@main_blueprint.route("/export/csv")
def export_csv():
    entries = build_sample_entries()
    config = AppConfig()
    df = build_dataframe(entries, config)
    stream = StringIO()
    df.to_csv(stream, index=False)
    return Response(
        stream.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=solar_tracker_demo_export.csv"},
    )


@main_blueprint.route("/vendor/plotly.min.js")
def plotly_javascript():
    return Response(
        get_plotlyjs(),
        mimetype="application/javascript",
        headers={"Cache-Control": "public, max-age=86400"},
    )


@main_blueprint.route("/documents/sunrun-contract")
def contract_document():
    return send_from_directory(
        "C:\\Software Developement\\ChatGPT Codex\\Solar Energy - SunRun\\Documents",
        "SunRun Solar Contract.pdf",
        as_attachment=False,
    )


@main_blueprint.route("/documents/nyseg-bill")
def nyseg_bill_document():
    return send_from_directory(
        "C:\\Software Developement\\ChatGPT Codex\\Solar Energy - SunRun\\NYSEG Bill",
        "NYSEG Bill.xlsx",
        as_attachment=True,
    )


@main_blueprint.route("/documents/appliances")
def appliances_document():
    return send_from_directory(
        str(APPLIANCE_WORKBOOK_PATH.parent),
        APPLIANCE_WORKBOOK_PATH.name,
        as_attachment=True,
    )


@main_blueprint.route("/documents/sunrun-production")
def sunrun_production_document():
    return send_file(
        SUNRUN_CSV_PATH,
        as_attachment=True,
        download_name=SUNRUN_CSV_PATH.name,
        mimetype="text/csv",
    )


@main_blueprint.route("/documents/nyseg-bill/view")
def nyseg_bill_viewer():
    historical_usage = load_historical_usage_summary(
        expected_annual_home_usage_kwh=AppConfig().annual_home_usage_kwh
    )
    monthly_bill = load_monthly_bill_summary()
    return render_template(
        "document_viewer_spreadsheet.html",
        page_name="document-viewer",
        bootstrap_data=build_bootstrap_data(),
        title="NYSEG Historic Spreadsheet",
        subtitle="Historic monthly NYSEG usage workbook integrated into the solar tracker baseline analysis.",
        spreadsheet=build_historical_spreadsheet_pricing(historical_usage, monthly_bill),
    )


@main_blueprint.route("/documents/nyseg-monthly-bill/file")
def nyseg_monthly_bill_document():
    bill = load_monthly_bill_summary()
    if not bill.available or not Path(bill.source_path).exists():
        return Response("No NYSEG bill PDF is available.", status=404)
    return send_file(bill.source_path, as_attachment=False, mimetype="application/pdf")


@main_blueprint.route("/documents/nyseg-monthly-bill/view")
def nyseg_monthly_bill_viewer():
    return render_template(
        "document_viewer_pdf.html",
        page_name="document-viewer",
        bootstrap_data=build_bootstrap_data(),
        title="NYSEG Monthly Bill Reference",
        subtitle="Monthly bill reference integrated for billing context alongside solar production and usage analysis.",
        pdf_url="/documents/nyseg-monthly-bill/file",
        bill=monthly_bill_to_dict(load_monthly_bill_summary()),
    )
