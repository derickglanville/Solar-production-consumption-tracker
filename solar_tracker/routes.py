from dataclasses import asdict
from datetime import date
from io import StringIO

import pandas as pd
from flask import Blueprint, Response, jsonify, render_template, request, send_from_directory

from .analytics import build_alerts, build_chart_bundle, build_dataframe, calculate_metrics
from .firestore import AppConfig, DailySolarEntry
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
    return {
        "sample_entries": [entry_to_dict(entry) for entry in sample_entries],
        "default_config": config_to_dict(config),
        "weather_options": WEATHER_OPTIONS,
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
    charts = build_chart_bundle(df)
    recent_entries = list(reversed(entries[-10:]))
    return render_template(
        "dashboard_content.html",
        metrics=metrics,
        alerts=alerts,
        charts=charts,
        recent_entries=recent_entries,
        config=config,
        firebase_status=firebase_status,
    )


@main_blueprint.route("/")
def dashboard():
    entries = build_sample_entries()
    config = AppConfig()
    firebase_status = {
        "message": "Loading live Firebase data in the browser. Demo data is shown until the connection completes.",
        "kind": "warning",
        "using_demo_data": True,
    }
    return render_template(
        "dashboard.html",
        page_name="dashboard",
        bootstrap_data=build_bootstrap_data(),
        metrics=calculate_metrics(build_dataframe(entries, config), config),
        alerts=build_alerts(build_dataframe(entries, config), config),
        charts=build_chart_bundle(build_dataframe(entries, config)),
        recent_entries=list(reversed(entries[-10:])),
        config=config,
        firebase_status=firebase_status,
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
    html = render_dashboard(entries, config, firebase_status)
    return jsonify({"html": html})


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
