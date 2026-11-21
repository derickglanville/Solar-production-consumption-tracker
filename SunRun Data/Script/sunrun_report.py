from __future__ import annotations

import base64
import html
from datetime import datetime
from pathlib import Path
from typing import Optional

from sunrun_config import ANNUAL_PRODUCTION_GOAL_KWH, ENERGY_RATE_PER_KWH, REPORT_DIR


def _n(value: object, digits: int = 1, suffix: str = "") -> str:
    if value is None:
        return "Not available"
    return f"{float(value):,.{digits}f}{suffix}"


def _card(title: str, value: str, subtitle: str, background: str) -> str:
    return f"""
    <td width="25%" style="padding:7px;vertical-align:top;">
      <div style="background:{background};border-radius:14px;padding:18px;
                  min-height:112px;border:1px solid #dbeafe;">
        <div style="font-size:13px;font-weight:800;letter-spacing:.7px;
                    color:#475569;text-transform:uppercase;">{title}</div>
        <div style="font-size:28px;font-weight:900;color:#0f172a;
                    margin-top:8px;">{value}</div>
        <div style="font-size:13px;color:#64748b;margin-top:5px;">{subtitle}</div>
      </div>
    </td>"""



def _instrument_section(available: bool) -> str:
    if not available:
        return ""
    return """
    <tr><td style="padding:10px 27px 16px;">
      <div style="font-size:22px;font-weight:900;color:#073b78;margin:0 7px 10px;">
        Financial & Grid Cockpit
      </div>
      <div style="border:1px solid #b9d7f4;border-radius:18px;overflow:hidden;
                  background:#071a33;text-align:center;">
        <img src="cid:dashboard_instruments" alt="Financial and grid instruments"
             style="display:block;width:100%;max-width:1000px;height:auto;margin:auto;border:0;">
      </div>
      <div style="font-size:12px;color:#64748b;padding:8px 10px 0;">
        Values are estimated at $0.29/kWh. The annual projection is based on recorded production days.
      </div>
    </td></tr>"""


def _chart_section(title: str, cid: str, available: bool) -> str:
    if not available:
        return ""
    return f"""
    <tr><td style="padding:8px 28px 16px;">
      <div style="border:1px solid #bfdbfe;border-radius:16px;overflow:hidden;">
        <div style="padding:18px 22px 6px;font-size:21px;font-weight:900;
                    color:#073b78;">{title}</div>
        <div style="padding:6px 14px 18px;text-align:center;">
          <img src="cid:{cid}" alt="{title}"
               style="display:block;width:100%;max-width:980px;height:auto;
                      margin:auto;border:0;">
        </div>
      </div>
    </td></tr>"""


def build_html_report(
    data: dict,
    *,
    success: bool,
    workflow_started: datetime,
    workflow_finished: datetime,
    error_message: Optional[str],
    chart_keys: set[str],
) -> str:
    entries = sorted(data.get("entries", []), key=lambda e: e["date"])
    production_entries = [e for e in entries if e.get("production_kwh") is not None]
    meter_entries = [
        e for e in entries
        if e.get("derived", {}).get("daily_import_kwh") is not None
        and e.get("derived", {}).get("daily_export_kwh") is not None
    ]
    complete_entries = [
        e for e in entries
        if e.get("production_kwh") is not None
        and e.get("derived", {}).get("daily_import_kwh") is not None
        and e.get("derived", {}).get("daily_export_kwh") is not None
    ]
    latest_production = production_entries[-1] if production_entries else {}
    latest_meter = meter_entries[-1] if meter_entries else {}
    latest_complete = complete_entries[-1] if complete_entries else {}
    d = latest_complete.get("derived", {})
    meter_d = latest_meter.get("derived", {})
    lifetime = data.get("lifetime", {})
    financial = lifetime.get("financial", {})

    production = latest_production.get("production_kwh")
    imported = meter_d.get("daily_import_kwh")
    exported = meter_d.get("daily_export_kwh")
    self_used = d.get("self_consumed_kwh")
    home = d.get("home_consumption_kwh")
    solar_coverage = d.get("solar_coverage_percent")
    self_consumption = d.get("self_consumption_percent")
    net_grid = meter_d.get("net_grid_kwh")
    total_production = sum(float(e.get("production_kwh") or 0) for e in entries)
    annual_progress = total_production / ANNUAL_PRODUCTION_GOAL_KWH * 100

    status_text = "SUCCESS" if success else "FAILED"
    status_bg = "#dcfce7" if success else "#fee2e2"
    status_fg = "#166534" if success else "#991b1b"
    runtime = (workflow_finished - workflow_started).total_seconds()

    flow_note = "Meter readings require a previous day to calculate daily flow."
    if imported is not None and exported is not None:
        flow_note = (
            f"Net grid: {_n(abs(net_grid), 1, ' kWh')} "
            + ("imported" if net_grid and net_grid > 0 else "exported")
        )

    return f"""<!doctype html>
<html><head><meta charset="utf-8"><title>Sunrun Daily Energy Report</title></head>
<body style="margin:0;background:#eef4fa;font-family:Arial,Helvetica,sans-serif;
             color:#172033;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"
       style="background:#eef4fa;"><tr><td align="center" style="padding:24px;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"
       style="max-width:1050px;background:white;border-radius:20px;
              overflow:hidden;box-shadow:0 8px 30px rgba(15,23,42,.10);">
  <tr><td style="background:#073b78;padding:28px 34px;color:white;">
    <table width="100%"><tr>
      <td>
        <div style="font-size:31px;font-weight:900;">☀ Sunrun Energy Intelligence</div>
        <div style="font-size:16px;color:#dbeafe;margin-top:6px;">
          Production, home usage and NYSEG energy flow
        </div>
      </td>
      <td align="right">
        <span style="display:inline-block;padding:10px 18px;border-radius:999px;
                     background:{status_bg};color:{status_fg};font-weight:900;">
          {status_text}
        </span>
      </td>
    </tr></table>
  </td></tr>

  <tr><td style="padding:24px 27px 8px;">
    <div style="font-size:22px;font-weight:900;color:#073b78;margin:0 7px 10px;">
      Production & Grid Flight Deck
    </div>
    <div style="border:1px solid #b9d7f4;border-radius:18px;overflow:hidden;
                background:#071a33;text-align:center;">
      <img src="cid:dashboard_energy_instruments" alt="Production and grid instruments"
           style="display:block;width:100%;max-width:1000px;height:auto;margin:auto;border:0;">
    </div>
    <div style="font-size:12px;color:#64748b;padding:8px 10px 0;">
      Sunrun production, NYSEG meter flow and combined calculations may use different latest dates when the production file has not yet posted.
    </div>
  </td></tr>

  {_instrument_section("instruments" in chart_keys)}

  <tr><td style="padding:10px 34px 18px;">
    <div style="font-size:22px;font-weight:900;color:#073b78;">
      Solar effectiveness
    </div>
    <div style="margin-top:14px;background:#e2e8f0;border-radius:999px;
                height:22px;overflow:hidden;">
      <div style="height:22px;width:{min(float(solar_coverage or 0),100):.1f}%;
                  background:#16a34a;border-radius:999px;"></div>
    </div>
    <div style="font-size:14px;color:#64748b;margin-top:8px;">
      Solar coverage: {_n(solar_coverage,1,"%")} ·
      Self-consumption: {_n(self_consumption,1,"%")} ·
      Grid dependence: {_n(d.get("grid_dependence_percent"),1,"%")}
    </div>
  </td></tr>

  {_chart_section("Daily solar production", "chart_production", "production" in chart_keys)}
  {_chart_section("Daily energy flow", "chart_energy_flow", "energy_flow" in chart_keys)}
  {_chart_section("Cumulative energy since activation", "chart_cumulative", "cumulative" in chart_keys)}
  {_chart_section("Monthly energy summary", "chart_monthly", "monthly" in chart_keys)}

  <tr><td style="padding:8px 34px 24px;">
    <div style="font-size:21px;font-weight:900;color:#073b78;">Lifetime energy balance</div>
    <table width="100%" style="margin-top:12px;border-collapse:collapse;font-size:15px;">
      <tr><td style="padding:9px;border-bottom:1px solid #e2e8f0;">Complete meter days</td>
          <td align="right" style="padding:9px;border-bottom:1px solid #e2e8f0;font-weight:bold;">{lifetime.get("complete_days",0)}</td></tr>
      <tr><td style="padding:9px;border-bottom:1px solid #e2e8f0;">Imported from NYSEG</td>
          <td align="right" style="padding:9px;border-bottom:1px solid #e2e8f0;font-weight:bold;">{_n(lifetime.get("import_kwh"),1," kWh")}</td></tr>
      <tr><td style="padding:9px;border-bottom:1px solid #e2e8f0;">Exported to NYSEG</td>
          <td align="right" style="padding:9px;border-bottom:1px solid #e2e8f0;font-weight:bold;">{_n(lifetime.get("export_kwh"),1," kWh")}</td></tr>
      <tr><td style="padding:9px;border-bottom:1px solid #e2e8f0;">Solar used in home</td>
          <td align="right" style="padding:9px;border-bottom:1px solid #e2e8f0;font-weight:bold;">{_n(lifetime.get("self_consumed_kwh"),1," kWh")}</td></tr>
      <tr><td style="padding:9px;">Lifetime solar coverage</td>
          <td align="right" style="padding:9px;font-weight:bold;">{_n(lifetime.get("solar_coverage_percent"),1,"%")}</td></tr>
    </table>
  </td></tr>

  {f'<tr><td style="padding:0 34px 22px;"><div style="background:#fee2e2;color:#991b1b;padding:16px;border-radius:12px;"><b>Error:</b> {html.escape(error_message)}</div></td></tr>' if error_message else ''}

  <tr><td style="background:#f8fafc;padding:18px 34px;color:#64748b;font-size:13px;">
    Generated {workflow_finished:%B %d, %Y at %I:%M:%S %p} ·
    Runtime {runtime:.1f} seconds ·
    Cumulative JSON updated {html.escape(str(data.get("updated_at") or ""))}
  </td></tr>
</table></td></tr></table></body></html>"""


def save_report(
    html_text: str,
    run_time: datetime,
    charts: dict[str, Path],
) -> Path:
    """Save a self-contained HTML report with charts embedded as data URIs."""
    cid_names = {
        "production": "chart_production",
        "energy_flow": "chart_energy_flow",
        "cumulative": "chart_cumulative",
        "monthly": "chart_monthly",
        "instruments": "dashboard_instruments",
        "energy_instruments": "dashboard_energy_instruments",
    }
    local_html = html_text
    for key, chart_path in charts.items():
        if not chart_path.is_file() or key not in cid_names:
            continue
        encoded = base64.b64encode(chart_path.read_bytes()).decode("ascii")
        local_html = local_html.replace(
            f"cid:{cid_names[key]}",
            f"data:image/png;base64,{encoded}",
        )

    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    path = REPORT_DIR / f"Sunrun_Report_{run_time:%Y-%m-%d_%H%M%S}.html"
    path.write_text(local_html, encoding="utf-8")
    latest = REPORT_DIR / "Sunrun_Report_Latest.html"
    latest.write_text(local_html, encoding="utf-8")
    return path
