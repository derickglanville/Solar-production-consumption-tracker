from dataclasses import asdict
from datetime import date
from io import StringIO

import pandas as pd
from flask import Blueprint, Response, jsonify, render_template, request, send_from_directory

from .ai import answer_question, get_ai_status
from .analytics import build_alerts, build_chart_bundle, build_dataframe, calculate_metrics
from .firestore import AppConfig, DailySolarEntry
from .historical_usage import historical_usage_to_dict, load_historical_usage_summary
from .monthly_bill import load_monthly_bill_summary, monthly_bill_to_dict
from .seed import build_sample_entries


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


def entry_to_dict(entry):
    payload = asdict(entry)
    payload["entry_date"] = entry.entry_date.isoformat()
    return payload


def config_to_dict(config):
    payload = asdict(config)
    payload["activation_date"] = config.activation_date.isoformat()
    payload["smart_meter_install_date"] = config.smart_meter_install_date.isoformat()
    return payload


def build_bootstrap_data():
    sample_entries = build_sample_entries()
    config = AppConfig()
    historical_usage = load_historical_usage_summary(
        expected_annual_home_usage_kwh=config.annual_home_usage_kwh
    )
    monthly_bill = load_monthly_bill_summary()
    return {
        "sample_entries": [entry_to_dict(entry) for entry in sample_entries],
        "default_config": config_to_dict(config),
        "weather_options": WEATHER_OPTIONS,
        "ai_status": get_ai_status(),
        "historical_usage": historical_usage_to_dict(historical_usage),
        "monthly_bill": monthly_bill_to_dict(monthly_bill),
    }


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
    years_since_activation = max(0, date.today().year - config.activation_date.year)
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
    df = build_dataframe(entries, config)
    metrics = calculate_metrics(df, config)
    alerts = build_alerts(df, config)
    charts = build_chart_bundle(df, config)
    recent_entries = list(reversed(entries[-10:]))
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
    historical_usage = load_historical_usage_summary(
        expected_annual_home_usage_kwh=config.annual_home_usage_kwh
    )
    monthly_bill = load_monthly_bill_summary()
    metrics = calculate_metrics(build_dataframe(entries, config), config)
    billing_outlook = build_billing_outlook(config, metrics, monthly_bill)
    energy_impact = build_energy_impact_summary(config, metrics)
    firebase_status = {
        "message": "Loading live Firebase data in the browser. Demo data is shown until the connection completes.",
        "kind": "warning",
        "using_demo_data": True,
    }
    return render_template(
        "dashboard.html",
        page_name="dashboard",
        bootstrap_data=build_bootstrap_data(),
        metrics=metrics,
        alerts=build_alerts(build_dataframe(entries, config), config),
        charts=build_chart_bundle(build_dataframe(entries, config), config),
        recent_entries=list(reversed(entries[-10:])),
        config=config,
        firebase_status=firebase_status,
        historical_usage=historical_usage_to_dict(historical_usage),
        monthly_bill=monthly_bill_to_dict(monthly_bill),
        billing_outlook=billing_outlook,
        energy_impact=energy_impact,
    )


@main_blueprint.route("/entries")
def entries():
    return render_template(
        "entries.html",
        page_name="entries",
        bootstrap_data=build_bootstrap_data(),
        entries=list(reversed(build_sample_entries())),
        weather_options=WEATHER_OPTIONS,
    )


@main_blueprint.route("/settings")
def settings():
    return render_template(
        "settings.html",
        page_name="settings",
        bootstrap_data=build_bootstrap_data(),
        config=AppConfig(),
    )


@main_blueprint.route("/contract-summary")
def contract_summary():
    return render_template(
        "contract_summary.html",
        page_name="contract-summary",
        bootstrap_data=build_bootstrap_data(),
        contract_summary=build_contract_summary(),
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
    return send_from_directory(
        "C:\\Software Developement\\ChatGPT Codex\\Solar Energy - SunRun\\NYSEG Bill",
        "July 2027.pdf",
        as_attachment=False,
    )


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
