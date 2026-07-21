from __future__ import annotations

import json
import os
from calendar import monthrange
from dataclasses import asdict
from datetime import timedelta
from typing import Any

import requests

from .analytics import build_alerts, build_dataframe, calculate_metrics
from .historical_usage import historical_usage_to_dict, load_historical_usage_summary
from .monthly_bill import load_monthly_bill_summary, monthly_bill_to_dict


DEFAULT_AI_MODEL = os.getenv("OPENAI_MODEL", "gpt-5")

SUGGESTED_PROMPTS = [
    "Am I on track to hit my guarantee?",
    "What caused today's low production?",
    "Compare this month to last month.",
    "Estimate next month's production.",
    "Predict annual savings.",
    "Predict tomorrow's production.",
    "Show anomalies in my recent data.",
    "How effective is the solar usage versus the historic NYSEG baseline?",
    "Why is the bill still high if usage is low?",
    "Is one inverter underperforming?",
]


def get_ai_status() -> dict[str, Any]:
    return {
        "openai_configured": bool(os.getenv("OPENAI_API_KEY")),
        "model": DEFAULT_AI_MODEL,
        "suggested_prompts": SUGGESTED_PROMPTS,
    }


def _month_total(df, year: int, month: int) -> float:
    monthly = df[(df["entry_date"].dt.year == year) & (df["entry_date"].dt.month == month)]
    return float(monthly["production_kwh"].sum()) if not monthly.empty else 0.0


def _recent_average(df, column: str, days: int = 7) -> float:
    if df.empty:
        return 0.0
    return float(df.tail(days)[column].mean())


def _build_context(entries, config) -> dict[str, Any]:
    df = build_dataframe(entries, config)
    metrics = calculate_metrics(df, config)
    alerts = build_alerts(df, config)
    historical_usage = load_historical_usage_summary(
        expected_annual_home_usage_kwh=config.annual_home_usage_kwh
    )
    monthly_bill = load_monthly_bill_summary()

    latest = None
    previous = None
    if not df.empty:
        latest = df.iloc[-1]
        previous = df.iloc[-2] if len(df) > 1 else latest

    latest_date = latest["entry_date"].date() if latest is not None else None
    current_month_total = (
        _month_total(df, latest_date.year, latest_date.month) if latest_date else 0.0
    )
    if latest_date:
        previous_month_date = (latest_date.replace(day=1) - timedelta(days=1))
        previous_month_total = _month_total(df, previous_month_date.year, previous_month_date.month)
    else:
        previous_month_total = 0.0

    weather_summary = {}
    if not df.empty:
        grouped = df.groupby("weather", dropna=False)["production_kwh"].mean().sort_values(ascending=False)
        weather_summary = {str(key): round(float(value), 1) for key, value in grouped.items()}

    snapshot = {
        "entry_count": int(len(df)),
        "latest_date": latest_date.isoformat() if latest_date else None,
        "latest_weather": str(latest["weather"]) if latest is not None else "Unknown",
        "today_production": round(metrics.today_production, 1),
        "yesterday_production": round(metrics.yesterday_production, 1),
        "today_irradiance": round(metrics.today_irradiance, 0),
        "today_export": round(metrics.today_export, 1),
        "today_import": round(metrics.today_import, 1),
        "rolling_7_day_average": round(_recent_average(df, "production_kwh", 7), 1),
        "rolling_7_day_irradiance": round(_recent_average(df, "irradiance_peak_wm2", 7), 0),
        "annual_projection": round(metrics.annual_projection, 0),
        "guarantee_kwh": round(config.production_guarantee_kwh, 0),
        "projection_vs_guarantee_kwh": round(metrics.projection_vs_guarantee_kwh, 0),
        "projection_vs_guarantee_pct": round(metrics.projection_vs_guarantee_pct, 1),
        "consecutive_poor_days": int(metrics.consecutive_poor_days),
        "ytd_production": round(metrics.ytd_production, 1),
        "monthly_savings": round(metrics.monthly_savings, 0),
        "annual_savings": round(metrics.annual_savings, 0),
        "solar_offset_pct": round(metrics.solar_offset_pct, 1),
        "current_month_total": round(current_month_total, 1),
        "previous_month_total": round(previous_month_total, 1),
        "best_day": round(metrics.highest_production_day, 1),
        "lowest_day": round(metrics.lowest_production_day, 1),
        "recent_alerts": alerts,
        "weather_summary": weather_summary,
    }

    if latest is not None and previous is not None:
        snapshot["day_over_day_change_kwh"] = round(
            float(latest["production_kwh"]) - float(previous["production_kwh"]), 1
        )
    else:
        snapshot["day_over_day_change_kwh"] = 0.0

    return {
        "df": df,
        "metrics": metrics,
        "alerts": alerts,
        "snapshot": snapshot,
        "historical_usage": historical_usage_to_dict(historical_usage),
        "monthly_bill": monthly_bill_to_dict(monthly_bill),
    }


def _estimate_tomorrow(snapshot: dict[str, Any]) -> tuple[str, list[str]]:
    rolling_avg = snapshot["rolling_7_day_average"]
    today_production = snapshot["today_production"]
    today_irradiance = snapshot["today_irradiance"]
    rolling_irradiance = max(snapshot["rolling_7_day_irradiance"], 1.0)
    irradiance_factor = min(1.15, max(0.7, today_irradiance / rolling_irradiance))
    forecast = round(((rolling_avg * 0.65) + (today_production * 0.35)) * irradiance_factor, 1)
    answer = (
        f"My best short-term estimate for tomorrow is about {forecast:.1f} kWh."
    )
    bullets = [
        f"This is based on the recent 7-day average of {rolling_avg:.1f} kWh.",
        f"Today's irradiance was {today_irradiance:.0f} W/m² versus a recent average of {rolling_irradiance:.0f} W/m².",
        "This is a trend-based estimate, not a true weather-forecast model yet.",
    ]
    return answer, bullets


def _estimate_next_month(snapshot: dict[str, Any]) -> tuple[str, list[str]]:
    latest_date = snapshot["latest_date"]
    if not latest_date:
        return "I need more data before I can estimate next month.", []

    from datetime import date

    current = date.fromisoformat(latest_date)
    next_year = current.year + 1 if current.month == 12 else current.year
    next_month = 1 if current.month == 12 else current.month + 1
    next_days = monthrange(next_year, next_month)[1]
    recent_daily = snapshot["rolling_7_day_average"]
    seasonal_adjustment = 0.96 if current.month in (7, 8) else 1.02
    estimate = round(recent_daily * next_days * seasonal_adjustment, 0)
    answer = f"My current estimate for next month is about {estimate:,.0f} kWh."
    bullets = [
        f"That uses a recent daily production rate of {recent_daily:.1f} kWh.",
        f"I applied a light seasonal adjustment for the move from month {current.month} to month {next_month}.",
        "This estimate should improve once you have more than a few weeks of real production history.",
    ]
    return answer, bullets


def _compare_months(snapshot: dict[str, Any]) -> tuple[str, list[str]]:
    current_total = snapshot["current_month_total"]
    previous_total = snapshot["previous_month_total"]
    if previous_total <= 0:
        return (
            f"This month has produced {current_total:,.1f} kWh so far.",
            ["There is not enough prior monthly history yet for a true month-over-month comparison."],
        )

    diff = current_total - previous_total
    pct = (diff / previous_total) * 100 if previous_total else 0.0
    direction = "ahead of" if diff >= 0 else "behind"
    answer = (
        f"This month is {abs(diff):,.1f} kWh {direction} last month so far ({abs(pct):.1f}%)."
    )
    bullets = [
        f"Current month total: {current_total:,.1f} kWh.",
        f"Previous month total: {previous_total:,.1f} kWh.",
    ]
    return answer, bullets


def _anomaly_answer(snapshot: dict[str, Any], alerts: list[str]) -> tuple[str, list[str]]:
    if not alerts:
        return (
            "I do not see a major anomaly in the current sample window.",
            [
                f"Today's production is {snapshot['today_production']:.1f} kWh.",
                f"The recent 7-day average is {snapshot['rolling_7_day_average']:.1f} kWh.",
            ],
        )
    return (
        "I found a few conditions worth watching in the recent data.",
        alerts,
    )


def _low_production_answer(snapshot: dict[str, Any], alerts: list[str]) -> tuple[str, list[str]]:
    today = snapshot["today_production"]
    rolling = snapshot["rolling_7_day_average"]
    irr = snapshot["today_irradiance"]
    rolling_irr = snapshot["rolling_7_day_irradiance"]
    reasons = []
    if today < rolling:
        reasons.append(
            f"Today's production of {today:.1f} kWh is below the recent 7-day average of {rolling:.1f} kWh."
        )
    if irr < rolling_irr:
        reasons.append(
            f"Irradiance was {irr:.0f} W/m² versus a recent average of {rolling_irr:.0f} W/m², which points to weaker solar conditions."
        )
    if snapshot["latest_weather"] in {"Cloudy", "Overcast", "Rain", "Smoke", "Snow"}:
        reasons.append(f"The recorded weather was {snapshot['latest_weather']}, which usually suppresses output.")
    if not reasons:
        reasons.append("I do not see a single obvious cause from the current fields, so this may need more days of data.")
    if alerts:
        reasons.extend(alerts[:2])
    return "Here is my best explanation for the lower production day.", reasons


def _guarantee_answer(snapshot: dict[str, Any]) -> tuple[str, list[str]]:
    diff = snapshot["projection_vs_guarantee_kwh"]
    pct = snapshot["projection_vs_guarantee_pct"]
    if diff >= 0:
        answer = f"Yes, you are currently on track and projecting about {diff:,.0f} kWh ahead of the guarantee."
    else:
        answer = f"Not yet. Right now the run rate is about {abs(diff):,.0f} kWh behind the guarantee."
    bullets = [
        f"Current annual projection: {snapshot['annual_projection']:,.0f} kWh.",
        f"Contract guarantee: {snapshot['guarantee_kwh']:,.0f} kWh.",
        f"Variance: {abs(pct):.1f}% {'ahead' if diff >= 0 else 'behind'}.",
    ]
    return answer, bullets


def _savings_answer(snapshot: dict[str, Any]) -> tuple[str, list[str]]:
    monthly = snapshot["monthly_savings"]
    annual = snapshot["annual_savings"]
    answer = f"My current estimated annual savings are ${annual:,.0f}."
    bullets = [
        f"Estimated monthly savings: ${monthly:,.0f}.",
        f"Current solar offset estimate: {snapshot['solar_offset_pct']:.1f}%.",
        "This is based on the current electric rate, fixed charges, lease payment, and estimated self-consumption logic in the app.",
    ]
    return answer, bullets


def _effectiveness_answer(snapshot: dict[str, Any], historical_usage: dict[str, Any]) -> tuple[str, list[str]]:
    if not historical_usage.get("available"):
        return (
            "I do not have a historical NYSEG workbook loaded yet for a pre-solar baseline comparison.",
            ["Add the workbook source so I can compare solar-era behavior against historical usage."],
        )

    baseline_annual = float(historical_usage.get("annualized_kwh", 0.0))
    estimated_current = float(snapshot.get("solar_offset_pct", 0.0))
    expected_offset = 62.0
    answer = (
        f"The historical NYSEG workbook suggests a pre-solar annualized usage baseline of about {baseline_annual:,.0f} kWh, which is close to the contract-era expectation."
    )
    bullets = [
        f"Historical average monthly usage: {float(historical_usage.get('average_monthly_kwh', 0.0)):,.0f} kWh.",
        f"Historical annualized usage: {baseline_annual:,.0f} kWh.",
        f"Current estimated solar offset in the dashboard: {estimated_current:.1f}% versus an expected offset of about {expected_offset:.1f}%.",
    ]
    return answer, bullets


def _bill_answer(monthly_bill: dict[str, Any]) -> tuple[str, list[str]]:
    if not monthly_bill.get("available"):
        return (
            "I do not have a monthly bill reference loaded yet.",
            ["Add a monthly bill PDF to compare billed behavior against solar production and grid imports."],
        )

    answer = (
        f"The bill amount due is ${float(monthly_bill.get('amount_due', 0.0)):,.2f}, but the actual energy-charge subtotal is only ${float(monthly_bill.get('total_energy_charges', 0.0)):,.2f}."
    )
    bullets = [
        f"Budget billing amount: ${float(monthly_bill.get('budget_billing_amount', 0.0)):,.2f}.",
        f"Payment agreement amount: ${float(monthly_bill.get('payment_agreement_amount', 0.0)):,.2f}.",
        f"Current billed usage: {float(monthly_bill.get('current_usage_kwh', 0.0)):,.0f} kWh over {int(monthly_bill.get('days_in_period', 0))} days.",
    ]
    return answer, bullets


def _inverter_answer() -> tuple[str, list[str]]:
    return (
        "I cannot reliably determine inverter underperformance yet.",
        [
            "The app does not currently have inverter-level production or alert data.",
            "You have two SolarEdge inverters, but the current dataset is system-level only.",
            "If you later connect SolarEdge inverter data, I can compare the two directly.",
        ],
    )


def _generic_answer(snapshot: dict[str, Any], alerts: list[str]) -> tuple[str, list[str]]:
    stance = "ahead of" if snapshot["projection_vs_guarantee_kwh"] >= 0 else "behind"
    answer = (
        f"Your system is currently projecting {snapshot['annual_projection']:,.0f} kWh for the year, which is {stance} the {snapshot['guarantee_kwh']:,.0f} kWh guarantee."
    )
    bullets = [
        f"Today's production: {snapshot['today_production']:.1f} kWh.",
        f"Recent 7-day average: {snapshot['rolling_7_day_average']:.1f} kWh.",
        f"Estimated annual savings: ${snapshot['annual_savings']:,.0f}.",
    ]
    if alerts:
        bullets.append(f"Current alert summary: {alerts[0]}")
    return answer, bullets


def _rule_based_answer(question: str, context: dict[str, Any]) -> dict[str, Any]:
    normalized = question.strip().lower()
    snapshot = context["snapshot"]
    alerts = context["alerts"]
    historical_usage = context["historical_usage"]
    monthly_bill = context["monthly_bill"]

    if any(phrase in normalized for phrase in ["on track", "guarantee", "contract"]):
        answer, bullets = _guarantee_answer(snapshot)
        title = "Guarantee Check"
    elif any(phrase in normalized for phrase in ["effective", "effectiveness", "baseline", "historical", "pre-solar"]):
        answer, bullets = _effectiveness_answer(snapshot, historical_usage)
        title = "Historic Baseline Analysis"
    elif "tomorrow" in normalized:
        answer, bullets = _estimate_tomorrow(snapshot)
        title = "Tomorrow Forecast"
    elif "next month" in normalized:
        answer, bullets = _estimate_next_month(snapshot)
        title = "Next Month Estimate"
    elif "compare" in normalized and "month" in normalized:
        answer, bullets = _compare_months(snapshot)
        title = "Month Comparison"
    elif "saving" in normalized:
        answer, bullets = _savings_answer(snapshot)
        title = "Savings Outlook"
    elif "bill" in normalized or "amount due" in normalized or "budget billing" in normalized or "payment agreement" in normalized:
        answer, bullets = _bill_answer(monthly_bill)
        title = "Bill Reference"
    elif "inverter" in normalized:
        answer, bullets = _inverter_answer()
        title = "Inverter Check"
    elif "anomal" in normalized or "issue" in normalized or "alert" in normalized:
        answer, bullets = _anomaly_answer(snapshot, alerts)
        title = "Anomaly Scan"
    elif "low production" in normalized or "caused" in normalized or "why" in normalized:
        answer, bullets = _low_production_answer(snapshot, alerts)
        title = "Low Production Analysis"
    else:
        answer, bullets = _generic_answer(snapshot, alerts)
        title = "Solar Analyst Summary"

    return {
        "title": title,
        "answer": answer,
        "bullets": bullets,
        "provider": "rules",
        "disclaimer": "This answer is grounded in the app's current solar, meter, weather, and financial data.",
    }


def _extract_response_text(payload: dict[str, Any]) -> str:
    parts = []
    for item in payload.get("output", []):
        for content in item.get("content", []):
            if content.get("type") == "output_text":
                parts.append(content.get("text", ""))
    return "\n".join(part.strip() for part in parts if part.strip())


def _openai_answer(question: str, rule_answer: dict[str, Any], context: dict[str, Any]) -> dict[str, Any] | None:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        return None

    prompt = {
        "question": question,
        "rule_answer": rule_answer,
        "data_snapshot": context["snapshot"],
    }
    try:
        response = requests.post(
            "https://api.openai.com/v1/responses",
            headers={
                "Authorization": f"Bearer {api_key}",
                "Content-Type": "application/json",
            },
            json={
                "model": DEFAULT_AI_MODEL,
                "input": [
                    {
                        "role": "system",
                        "content": [
                            {
                                "type": "input_text",
                                "text": (
                                    "You are a careful solar performance analyst for a homeowner dashboard. "
                                    "Use only the supplied data snapshot. If data is missing, say so plainly. "
                                    "Keep answers concise, practical, and numeric when possible."
                                ),
                            }
                        ],
                    },
                    {
                        "role": "user",
                        "content": [
                            {
                                "type": "input_text",
                                "text": json.dumps(prompt),
                            }
                        ],
                    },
                ],
            },
            timeout=30,
        )
        response.raise_for_status()
        payload = response.json()
        text = _extract_response_text(payload).strip()
        if not text:
            return None
        return {
            "title": rule_answer["title"],
            "answer": text,
            "bullets": rule_answer["bullets"],
            "provider": "openai",
            "disclaimer": f"OpenAI-enhanced answer using {DEFAULT_AI_MODEL}, grounded in the app data snapshot.",
        }
    except requests.RequestException:
        return None


def answer_question(question: str, entries, config) -> dict[str, Any]:
    context = _build_context(entries, config)
    rule_answer = _rule_based_answer(question, context)
    openai_answer = _openai_answer(question, rule_answer, context)
    answer = openai_answer or rule_answer
    answer["suggested_prompts"] = SUGGESTED_PROMPTS
    answer["openai_configured"] = bool(os.getenv("OPENAI_API_KEY"))
    answer["snapshot"] = context["snapshot"]
    answer["historical_usage"] = context["historical_usage"]
    answer["monthly_bill"] = context["monthly_bill"]
    answer["metrics"] = asdict(context["metrics"])
    return answer
