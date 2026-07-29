from __future__ import annotations

from dataclasses import dataclass
from datetime import timedelta
from statistics import mean

import pandas as pd
import plotly.graph_objects as go
from plotly.subplots import make_subplots

from .time_utils import tracker_today


WEATHER_FACTORS = {
    "Sunny": 1.05,
    "Cloudy": 0.82,
    "Smoke": 0.72,
    "Rain": 0.58,
    "Snow": 0.45,
    "Overcast": 0.64,
    "Extreme Heat": 0.92,
    "Wind": 0.95,
    "Unknown": 0.8,
}


def _classify_irradiance_points(df: pd.DataFrame) -> pd.DataFrame:
    if df.empty:
        result = df.copy()
        result["anomaly_label"] = []
        result["anomaly_reason"] = []
        result["anomaly_text"] = []
        return result

    result = df.copy()
    irradiance_median = float(result["irradiance_peak_wm2"].median()) if not result["irradiance_peak_wm2"].empty else 0.0
    production_median = float(result["production_kwh"].median()) if not result["production_kwh"].empty else 0.0
    rolling_baseline = result["rolling_7_day_prod"].fillna(result["production_kwh"])
    labels = []
    reasons = []
    texts = []

    for _, row in result.iterrows():
        label = "Observed"
        reason = "Production and irradiance look consistent with the recent trend."
        text = ""

        if bool(row.get("estimated", False)):
            label = "Estimated"
            reason = "This point uses placeholder production logic and should be replaced with actual Sunrun production."
            text = "Estimated"
        else:
            irradiance = float(row.get("irradiance_peak_wm2", 0.0) or 0.0)
            production = float(row.get("production_kwh", 0.0) or 0.0)
            baseline = float(row.get("rolling_7_day_prod", production) or production or 0.0)

            if irradiance >= max(irradiance_median, 700.0) and baseline > 0 and production <= baseline * 0.55:
                label = "Likely Underperformance"
                reason = "Irradiance was strong, but production was much lower than the recent baseline."
                text = "Likely Underperformance"
            elif (
                irradiance >= max(irradiance_median, 650.0)
                and production_median > 0
                and production <= production_median * 0.7
            ):
                label = "Needs Review"
                reason = "Irradiance was decent, but production landed well below the typical range."
                text = "Needs Review"

        labels.append(label)
        reasons.append(reason)
        texts.append(text)

    result["anomaly_label"] = labels
    result["anomaly_reason"] = reasons
    result["anomaly_text"] = texts
    return result


@dataclass
class DashboardMetrics:
    today_production: float
    yesterday_production: float
    today_import: float
    today_export: float
    today_irradiance: float
    weekly_average: float
    monthly_average: float
    ytd_production: float
    average_daily_production: float
    annual_projection: float
    guarantee_progress_pct: float
    projection_vs_guarantee_kwh: float
    projection_vs_guarantee_pct: float
    highest_production_day: float
    lowest_production_day: float
    consecutive_poor_days: int
    estimated_self_consumption: float
    total_home_consumption: float
    solar_offset_pct: float
    electricity_value_produced: float
    grid_cost: float
    lease_cost: float
    observed_months: int
    monthly_savings: float
    annual_savings: float
    lifetime_savings: float
    tree_payback_months: float | None
    confirmed_entry_count: int
    estimated_entry_count: int
    projection_uses_estimated: bool
    latest_production_estimated: bool
    latest_confirmed_production_date_label: str
    confirmed_production_total: float
    confirmed_average_daily_production: float
    confirmed_best_day_production: float
    cumulative_guarantee_progress_pct: float
    meter_export_since_install: float
    meter_import_since_install: float
    net_export_since_install: float
    smart_meter_start_label: str
    today_pending_sunrun: bool
    yesterday_pending_sunrun: bool


def build_dataframe(entries, config=None):
    if not entries:
        return pd.DataFrame(
            columns=[
                "entry_date",
                "irradiance_peak_wm2",
                "production_kwh",
                "meter_01_import_reading",
                "meter_02_export_reading",
                "weather",
                "estimated",
            ]
        )

    rows = []
    for entry in entries:
        rows.append(
            {
                "entry_date": pd.Timestamp(entry.entry_date),
                "irradiance_peak_wm2": entry.irradiance_peak_wm2,
                "production_kwh": entry.production_kwh,
                "meter_01_import_reading": entry.meter_01_import_reading,
                "meter_02_export_reading": entry.meter_02_export_reading,
                "weather": entry.weather,
                "estimated": bool(getattr(entry, "estimated", False)),
            }
        )

    df = pd.DataFrame(rows).sort_values("entry_date").reset_index(drop=True)
    today_value = pd.Timestamp(tracker_today())
    analog_pairs = {
        today_value: today_value - pd.Timedelta(days=3),
        today_value - pd.Timedelta(days=1): today_value - pd.Timedelta(days=4),
    }
    entry_index_by_date = {row["entry_date"]: index for index, row in df.iterrows()}
    for target_date, analog_date in analog_pairs.items():
        target_index = entry_index_by_date.get(target_date)
        analog_index = entry_index_by_date.get(analog_date)
        if target_index is None or analog_index is None:
            continue
        if bool(df.at[target_index, "estimated"]):
            df.at[target_index, "production_kwh"] = float(df.at[analog_index, "production_kwh"])

    df["daily_import_kwh"] = (
        df["meter_01_import_reading"].diff().clip(lower=0).fillna(0.0)
    )
    df["daily_export_kwh"] = (
        df["meter_02_export_reading"].diff().clip(lower=0).fillna(0.0)
    )

    annual_home_usage_kwh = (
        float(config.annual_home_usage_kwh)
        if config and config.annual_home_usage_kwh
        else 17967.0
    )
    baseline_home_use = annual_home_usage_kwh / 365.0
    seasonal_factor = 1 + (df["entry_date"].dt.month.isin([12, 1, 2, 6, 7, 8]) * 0.08)
    weather_factor = df["weather"].map(WEATHER_FACTORS).fillna(0.8)
    daytime_usage_estimate = baseline_home_use * seasonal_factor * weather_factor
    df["estimated_daytime_house_usage_kwh"] = daytime_usage_estimate.round(2)
    df["estimated_self_consumption_kwh"] = df[
        ["production_kwh", "estimated_daytime_house_usage_kwh"]
    ].min(axis=1)
    df["estimated_total_home_consumption_kwh"] = (
        df["estimated_self_consumption_kwh"] + df["daily_import_kwh"]
    )
    df["solar_offset_pct"] = (
        df["estimated_self_consumption_kwh"]
        / df["estimated_total_home_consumption_kwh"].replace(0, pd.NA)
        * 100
    ).fillna(0.0)
    df["rolling_7_day_prod"] = df["production_kwh"].rolling(7, min_periods=1).mean()
    return df


def calculate_metrics(df, config):
    if df.empty:
        return DashboardMetrics(
            today_production=0.0,
            yesterday_production=0.0,
            today_import=0.0,
            today_export=0.0,
            today_irradiance=0.0,
            weekly_average=0.0,
            monthly_average=0.0,
            ytd_production=0.0,
            average_daily_production=0.0,
            annual_projection=0.0,
            guarantee_progress_pct=0.0,
            projection_vs_guarantee_kwh=0.0,
            projection_vs_guarantee_pct=0.0,
            highest_production_day=0.0,
            lowest_production_day=0.0,
            consecutive_poor_days=0,
            estimated_self_consumption=0.0,
            total_home_consumption=0.0,
            solar_offset_pct=0.0,
            electricity_value_produced=0.0,
            grid_cost=0.0,
            lease_cost=0.0,
            observed_months=0,
            monthly_savings=0.0,
            annual_savings=0.0,
            lifetime_savings=0.0,
            tree_payback_months=None,
            confirmed_entry_count=0,
            estimated_entry_count=0,
            projection_uses_estimated=False,
            latest_production_estimated=False,
            latest_confirmed_production_date_label="N/A",
            confirmed_production_total=0.0,
            confirmed_average_daily_production=0.0,
            confirmed_best_day_production=0.0,
            cumulative_guarantee_progress_pct=0.0,
            meter_export_since_install=0.0,
            meter_import_since_install=0.0,
            net_export_since_install=0.0,
            smart_meter_start_label=config.smart_meter_install_date.isoformat(),
            today_pending_sunrun=False,
            yesterday_pending_sunrun=False,
        )

    today = df.iloc[-1]
    yesterday = df.iloc[-2] if len(df) > 1 else today
    trailing_week = df.tail(7)
    current_month = today["entry_date"].month
    monthly_df = df[df["entry_date"].dt.month == current_month]

    confirmed_df = df[~df["estimated"].fillna(False)]
    projection_df = confirmed_df if not confirmed_df.empty else df
    latest_confirmed_row = confirmed_df.iloc[-1] if not confirmed_df.empty else df.iloc[-1]
    avg_daily = float(projection_df["production_kwh"].mean())
    annual_projection = avg_daily * 365.0
    guarantee_progress_pct = (
        (annual_projection / config.production_guarantee_kwh) * 100
        if config.production_guarantee_kwh
        else 0.0
    )
    diff_kwh = annual_projection - config.production_guarantee_kwh
    diff_pct = (
        (diff_kwh / config.production_guarantee_kwh) * 100
        if config.production_guarantee_kwh
        else 0.0
    )

    guaranteed_daily = config.production_guarantee_kwh / 365.0
    consecutive_poor_days = 0
    for value in reversed(df["production_kwh"].tolist()):
        if value < guaranteed_daily:
            consecutive_poor_days += 1
        else:
            break

    observed_months = max(
        1,
        df["entry_date"].dt.to_period("M").nunique(),
    )
    electricity_value = df["production_kwh"].sum() * config.current_electric_rate
    grid_cost = (
        df["daily_import_kwh"].sum() * config.current_electric_rate
        + (config.monthly_fixed_charges * observed_months)
    )
    lease_cost = config.monthly_lease_payment * observed_months
    monthly_savings = (electricity_value - grid_cost - lease_cost) / observed_months
    annual_savings = monthly_savings * 12
    lifetime_savings = annual_savings * config.lease_term_years
    tree_payback_months = (
        config.tree_removal_cost / monthly_savings if monthly_savings > 0 else None
    )
    confirmed_production_total = float(confirmed_df["production_kwh"].sum()) if not confirmed_df.empty else float(df["production_kwh"].sum())
    confirmed_average_daily = float(confirmed_df["production_kwh"].mean()) if not confirmed_df.empty else float(df["production_kwh"].mean())
    confirmed_best_day = float(confirmed_df["production_kwh"].max()) if not confirmed_df.empty else float(df["production_kwh"].max())
    cumulative_guarantee_progress_pct = (
        (confirmed_production_total / config.production_guarantee_kwh) * 100
        if config.production_guarantee_kwh
        else 0.0
    )
    meter_window_df = df[df["entry_date"] >= pd.Timestamp(config.smart_meter_install_date)]
    meter_export_since_install = float(meter_window_df["daily_export_kwh"].sum()) if not meter_window_df.empty else 0.0
    meter_import_since_install = float(meter_window_df["daily_import_kwh"].sum()) if not meter_window_df.empty else 0.0
    net_export_since_install = meter_export_since_install - meter_import_since_install
    today_value = tracker_today()
    today_pending_sunrun = bool(today["estimated"] and today["entry_date"].date() == today_value)
    yesterday_pending_sunrun = bool(
        yesterday["estimated"]
        and yesterday["entry_date"].date() == (today_value - timedelta(days=1))
    )

    return DashboardMetrics(
        today_production=float(today["production_kwh"]),
        yesterday_production=float(yesterday["production_kwh"]),
        today_import=float(today["daily_import_kwh"]),
        today_export=float(today["daily_export_kwh"]),
        today_irradiance=float(today["irradiance_peak_wm2"]),
        weekly_average=float(trailing_week["production_kwh"].mean()),
        monthly_average=float(monthly_df["production_kwh"].mean()),
        ytd_production=float(df["production_kwh"].sum()),
        average_daily_production=avg_daily,
        annual_projection=annual_projection,
        guarantee_progress_pct=guarantee_progress_pct,
        projection_vs_guarantee_kwh=diff_kwh,
        projection_vs_guarantee_pct=diff_pct,
        highest_production_day=float(df["production_kwh"].max()),
        lowest_production_day=float(df["production_kwh"].min()),
        consecutive_poor_days=consecutive_poor_days,
        estimated_self_consumption=float(df["estimated_self_consumption_kwh"].sum()),
        total_home_consumption=float(df["estimated_total_home_consumption_kwh"].sum()),
        solar_offset_pct=float(df["solar_offset_pct"].mean()),
        electricity_value_produced=float(electricity_value),
        grid_cost=float(grid_cost),
        lease_cost=float(lease_cost),
        observed_months=int(observed_months),
        monthly_savings=float(monthly_savings),
        annual_savings=float(annual_savings),
        lifetime_savings=float(lifetime_savings),
        tree_payback_months=float(tree_payback_months) if tree_payback_months else None,
        confirmed_entry_count=int((~df["estimated"].fillna(False)).sum()),
        estimated_entry_count=int(df["estimated"].fillna(False).sum()),
        projection_uses_estimated=confirmed_df.empty,
        latest_production_estimated=bool(today["estimated"]),
        latest_confirmed_production_date_label=latest_confirmed_row["entry_date"].strftime("%Y-%m-%d"),
        confirmed_production_total=confirmed_production_total,
        confirmed_average_daily_production=confirmed_average_daily,
        confirmed_best_day_production=confirmed_best_day,
        cumulative_guarantee_progress_pct=cumulative_guarantee_progress_pct,
        meter_export_since_install=meter_export_since_install,
        meter_import_since_install=meter_import_since_install,
        net_export_since_install=net_export_since_install,
        smart_meter_start_label=config.smart_meter_install_date.strftime("%Y-%m-%d"),
        today_pending_sunrun=today_pending_sunrun,
        yesterday_pending_sunrun=yesterday_pending_sunrun,
    )


def build_alerts(df, config):
    if df.empty:
        return []

    alerts = []
    latest = df.iloc[-1]
    guaranteed_daily = config.production_guarantee_kwh / 365.0

    if latest["production_kwh"] < guaranteed_daily:
        alerts.append("Production below expected daily guarantee.")
    if bool(latest["estimated"]):
        alerts.append("Latest production row is estimated. Replace it with actual Sunrun production before drawing conclusions.")
    if latest["daily_import_kwh"] > mean(df["daily_import_kwh"].tail(7).tolist()) * 1.5:
        alerts.append("Large import increase detected versus recent average.")
    if latest["weather"] == "Sunny" and latest["daily_export_kwh"] <= 0:
        alerts.append("No exports recorded on a sunny day.")

    poor_days = 0
    for value in reversed(df["production_kwh"].tolist()):
        if value < guaranteed_daily:
            poor_days += 1
        else:
            break
    if poor_days >= 5:
        alerts.append("Five consecutive low-production days.")

    projection_df = df[~df["estimated"].fillna(False)]
    if projection_df.empty:
        projection_df = df
    projection = projection_df["production_kwh"].mean() * 365.0
    if projection < config.production_guarantee_kwh:
        alerts.append("Annual projection is below contract guarantee.")

    return alerts


def build_chart_bundle(df, config=None):
    if df.empty:
        return {}

    df = _classify_irradiance_points(df)

    electric_rate = (
        float(config.current_electric_rate)
        if config and getattr(config, "current_electric_rate", None) is not None
        else 0.24
    )
    monthly_fixed_charges = (
        float(config.monthly_fixed_charges)
        if config and getattr(config, "monthly_fixed_charges", None) is not None
        else 19.50
    )
    monthly_lease_payment = (
        float(config.monthly_lease_payment)
        if config and getattr(config, "monthly_lease_payment", None) is not None
        else 155.0
    )
    observed_months = max(1, df["entry_date"].dt.to_period("M").nunique())
    daily_fixed_charge = (monthly_fixed_charges * observed_months) / max(len(df), 1)
    daily_lease_charge = (monthly_lease_payment * observed_months) / max(len(df), 1)
    cumulative_net_savings = (
        (df["production_kwh"] * electric_rate)
        - (df["daily_import_kwh"] * electric_rate)
        - daily_fixed_charge
        - daily_lease_charge
    ).cumsum()

    running_totals_chart = go.Figure()
    running_totals_chart.add_trace(
        go.Scatter(
            x=df["entry_date"],
            y=df["production_kwh"].cumsum(),
            name="Cumulative Production",
            line={"color": "#e3a008", "width": 3},
        )
    )
    running_totals_chart.add_trace(
        go.Scatter(
            x=df["entry_date"],
            y=df["daily_import_kwh"].cumsum(),
            name="Cumulative Import",
            line={"color": "#b42318", "width": 3},
        )
    )
    running_totals_chart.add_trace(
        go.Scatter(
            x=df["entry_date"],
            y=df["daily_export_kwh"].cumsum(),
            name="Cumulative Export",
            line={"color": "#157f3b", "width": 3},
        )
    )
    running_totals_chart.add_trace(
        go.Scatter(
            x=df["entry_date"],
            y=df["estimated_self_consumption_kwh"].cumsum(),
            name="Cumulative Self Consumption",
            line={"color": "#0f4c81", "width": 3, "dash": "dot"},
        )
    )
    running_totals_chart.add_trace(
        go.Scatter(
            x=df["entry_date"],
            y=cumulative_net_savings,
            name="Cumulative Net Savings",
            line={"color": "#7c3aed", "width": 3, "dash": "dash"},
            yaxis="y2",
        )
    )
    running_totals_chart.update_layout(
        title="Running Totals",
        margin={"l": 20, "r": 20, "t": 110, "b": 20},
        template="plotly_white",
        yaxis={"title": "Energy (kWh)"},
        yaxis2={
            "title": "Dollars ($)",
            "overlaying": "y",
            "side": "right",
            "showgrid": False,
        },
        legend={
            "orientation": "h",
            "yanchor": "bottom",
            "y": 1.18,
            "x": 0,
            "font": {"size": 11},
        },
    )

    daily_chart = go.Figure()
    daily_chart.add_trace(
        go.Bar(
            x=df["entry_date"],
            y=df["production_kwh"].where(~df["estimated"].fillna(False), None),
            name="Confirmed Production (kWh)",
            marker_color="#e3a008",
        )
    )
    daily_chart.add_trace(
        go.Bar(
            x=df["entry_date"],
            y=df["production_kwh"].where(df["estimated"].fillna(False), None),
            name="Estimated Production (kWh)",
            marker_color="#f6c86a",
            marker_pattern_shape="/",
        )
    )
    daily_chart.add_trace(
        go.Scatter(
            x=df["entry_date"],
            y=df["rolling_7_day_prod"],
            name="7-Day Average",
            line={"color": "#0f4c81", "width": 3},
        )
    )
    daily_chart.update_layout(
        title="Daily Production",
        margin={"l": 20, "r": 20, "t": 50, "b": 20},
        template="plotly_white",
        bargap=0.12,
        barmode="overlay",
    )

    flow_chart = make_subplots(specs=[[{"secondary_y": True}]])
    flow_chart.add_trace(
        go.Scatter(
            x=df["entry_date"],
            y=df["daily_import_kwh"],
            name="Import",
            line={"color": "#b42318"},
        ),
        secondary_y=False,
    )
    flow_chart.add_trace(
        go.Scatter(
            x=df["entry_date"],
            y=df["daily_export_kwh"],
            name="Export",
            line={"color": "#157f3b"},
        ),
        secondary_y=False,
    )
    flow_chart.add_trace(
        go.Scatter(
            x=df["entry_date"],
            y=df["estimated_self_consumption_kwh"],
            name="Estimated Self Consumption",
            line={"color": "#0f4c81", "dash": "dot"},
        ),
        secondary_y=True,
    )
    flow_chart.update_layout(
        title="Grid Flow and Estimated Self Consumption",
        margin={"l": 20, "r": 20, "t": 50, "b": 20},
        template="plotly_white",
    )

    operational_production_chart = go.Figure()
    operational_production_chart.add_trace(
        go.Scatter(
            x=df["entry_date"],
            y=df["production_kwh"],
            mode="lines+markers",
            name="SunRun Production",
            line={"color": "#2f6f3e", "width": 3},
            marker={
                "size": 10,
                "color": df["production_kwh"],
                "colorscale": [
                    [0.0, "#0f4c81"],
                    [0.4, "#2a8ac7"],
                    [0.7, "#f2b94b"],
                    [1.0, "#e26a2c"],
                ],
                "line": {"width": 1, "color": "#ffffff"},
            },
        )
    )
    operational_production_chart.update_layout(
        title="Daily SunRun Production",
        margin={"l": 20, "r": 20, "t": 56, "b": 30},
        template="plotly_white",
        xaxis={"tickangle": -45},
        yaxis={"title": "kWh"},
    )

    operational_balance_chart = go.Figure()
    operational_balance_chart.add_trace(
        go.Bar(
            x=df["entry_date"],
            y=df["production_kwh"],
            name="SunRun Production",
            marker_color="#e26a2c",
        )
    )
    operational_balance_chart.add_trace(
        go.Bar(
            x=df["entry_date"],
            y=df["daily_import_kwh"],
            name="Grid Import",
            marker_color="#157f3b",
        )
    )
    operational_balance_chart.add_trace(
        go.Bar(
            x=df["entry_date"],
            y=df["daily_export_kwh"],
            name="Grid Export",
            marker_color="#2a8ac7",
        )
    )
    operational_balance_chart.add_trace(
        go.Bar(
            x=df["entry_date"],
            y=df["estimated_total_home_consumption_kwh"],
            name="Estimated Home Usage",
            marker_color="#8c3fa8",
        )
    )
    operational_balance_chart.update_layout(
        title="Production, Grid Import/Export and Estimated Usage",
        margin={"l": 20, "r": 20, "t": 68, "b": 40},
        template="plotly_white",
        barmode="group",
        xaxis={"tickangle": -45},
        yaxis={"title": "kWh"},
        legend={
            "orientation": "h",
            "yanchor": "bottom",
            "y": -0.34,
            "xanchor": "left",
            "x": 0,
            "font": {"size": 11},
        },
    )

    irradiance_chart = make_subplots(specs=[[{"secondary_y": True}]])
    irradiance_chart.add_trace(
        go.Bar(
            x=df["entry_date"],
            y=df["production_kwh"],
            name="Production",
            marker_color="#e3a008",
            customdata=df["weather"],
            hovertemplate=(
                "Date: %{x|%Y-%m-%d}<br>"
                "Production: %{y:.1f} kWh<br>"
                "Weather: %{customdata}<extra></extra>"
            ),
        ),
        secondary_y=False,
    )
    irradiance_chart.add_trace(
        go.Scatter(
            x=df["entry_date"],
            y=df["irradiance_peak_wm2"],
            name="Irradiance",
            mode="lines+markers",
            line={"color": "#0f4c81", "width": 3},
            marker={"size": 8},
            hovertemplate=(
                "Date: %{x|%Y-%m-%d}<br>"
                "Irradiance: %{y:.0f} W/m²<extra></extra>"
            ),
        ),
        secondary_y=True,
    )
    irradiance_chart.update_layout(
        title="Production and Irradiance Trend",
        margin={"l": 20, "r": 20, "t": 56, "b": 28},
        template="plotly_white",
        legend={
            "orientation": "h",
            "yanchor": "bottom",
            "y": 1.02,
            "xanchor": "left",
            "x": 0,
            "font": {"size": 11},
        },
    )
    irradiance_chart.update_yaxes(title_text="Production (kWh)", secondary_y=False)
    irradiance_chart.update_yaxes(title_text="Irradiance (W/m²)", secondary_y=True)

    guaranteed_daily = (
        float(config.production_guarantee_kwh) / 365.0
        if config and getattr(config, "production_guarantee_kwh", None)
        else 0.0
    )
    weather_colors = {
        "Sunny": "#f2b94b",
        "Cloudy": "#7c96ad",
        "Overcast": "#58728d",
        "Rain": "#3b82f6",
        "Snow": "#94a3b8",
        "Smoke": "#a16207",
        "Extreme Heat": "#ef4444",
        "Wind": "#14b8a6",
        "Unknown": "#94a3b8",
    }
    weather_chart = go.Figure()
    weather_chart.add_trace(
        go.Bar(
            x=df["entry_date"],
            y=df["production_kwh"],
            name="Daily Production",
            marker_color=[weather_colors.get(str(value), "#94a3b8") for value in df["weather"]],
            customdata=df["weather"],
            hovertemplate=(
                "Date: %{x|%Y-%m-%d}<br>"
                "Production: %{y:.1f} kWh<br>"
                "Weather: %{customdata}<extra></extra>"
            ),
        )
    )
    weather_chart.add_trace(
        go.Scatter(
            x=df["entry_date"],
            y=[float(df["production_kwh"].mean())] * len(df),
            name="Overall Average",
            mode="lines",
            line={"color": "#0f4c81", "width": 3, "dash": "dot"},
        )
    )
    if guaranteed_daily > 0:
        weather_chart.add_trace(
            go.Scatter(
                x=df["entry_date"],
                y=[guaranteed_daily] * len(df),
                name="Guarantee Daily Target",
                mode="lines",
                line={"color": "#b42318", "width": 2, "dash": "dash"},
            )
        )
    weather_chart.update_layout(
        title="Daily Production by Weather",
        margin={"l": 20, "r": 20, "t": 56, "b": 28},
        template="plotly_white",
        legend={
            "orientation": "h",
            "yanchor": "bottom",
            "y": 1.02,
            "xanchor": "left",
            "x": 0,
            "font": {"size": 11},
        },
    )

    month_frame = df.assign(
        month=df["entry_date"].dt.strftime("%Y-%m"),
        month_period=df["entry_date"].dt.to_period("M"),
    )
    monthly_summary = (
        month_frame.groupby(["month", "month_period"], as_index=False)
        .agg(
            production_kwh=("production_kwh", "sum"),
            observed_days=("entry_date", "nunique"),
        )
    )
    monthly_summary["days_in_month"] = monthly_summary["month_period"].apply(lambda value: value.days_in_month)
    monthly_summary["projected_month_end_kwh"] = (
        monthly_summary["production_kwh"] / monthly_summary["observed_days"].clip(lower=1)
        * monthly_summary["days_in_month"]
    )
    monthly_summary["guarantee_month_target_kwh"] = monthly_summary["days_in_month"] * guaranteed_daily

    monthly_chart = go.Figure()
    monthly_chart.add_trace(
        go.Bar(
            x=monthly_summary["month"],
            y=monthly_summary["production_kwh"],
            marker_color="#157f3b",
            name="Actual To Date",
        )
    )
    monthly_chart.add_trace(
        go.Bar(
            x=monthly_summary["month"],
            y=monthly_summary["projected_month_end_kwh"],
            marker_color="#e3a008",
            name="Projected Month End",
        )
    )
    monthly_chart.add_trace(
        go.Bar(
            x=monthly_summary["month"],
            y=monthly_summary["guarantee_month_target_kwh"],
            marker_color="#7c96ad",
            name="Guarantee Pace",
        )
    )
    monthly_chart.update_layout(
        title="Monthly Progress vs Guarantee",
        margin={"l": 20, "r": 20, "t": 56, "b": 28},
        template="plotly_white",
        barmode="group",
        legend={
            "orientation": "h",
            "yanchor": "bottom",
            "y": 1.02,
            "xanchor": "left",
            "x": 0,
            "font": {"size": 11},
        },
    )

    chart_config = {"displayModeBar": False, "responsive": True}

    return {
        "running_totals_chart": running_totals_chart.to_html(
            full_html=False, include_plotlyjs=False, config=chart_config
        ),
        "daily_chart": daily_chart.to_html(full_html=False, include_plotlyjs=False, config=chart_config),
        "flow_chart": flow_chart.to_html(full_html=False, include_plotlyjs=False, config=chart_config),
        "operational_production_chart": operational_production_chart.to_html(
            full_html=False, include_plotlyjs=False, config=chart_config
        ),
        "operational_balance_chart": operational_balance_chart.to_html(
            full_html=False, include_plotlyjs=False, config=chart_config
        ),
        "irradiance_chart": irradiance_chart.to_html(
            full_html=False, include_plotlyjs=False, config=chart_config
        ),
        "weather_chart": weather_chart.to_html(full_html=False, include_plotlyjs=False, config=chart_config),
        "monthly_chart": monthly_chart.to_html(full_html=False, include_plotlyjs=False, config=chart_config),
    }
