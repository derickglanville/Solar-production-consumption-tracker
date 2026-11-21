from __future__ import annotations

from collections import defaultdict
from datetime import datetime
from pathlib import Path
from typing import Optional


def _plt():
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.dates as mdates
    import matplotlib.pyplot as plt
    return plt, mdates


def _valid(entries: list[dict], field: str) -> list[tuple[datetime, float]]:
    rows = []
    for entry in entries:
        value = entry.get(field)
        if field.startswith("derived."):
            value = entry.get("derived", {}).get(field.split(".", 1)[1])
        if value is None:
            continue
        try:
            rows.append((
                datetime.strptime(entry["date"], "%Y-%m-%d"),
                float(value),
            ))
        except (KeyError, TypeError, ValueError):
            continue
    return rows


def _finish(fig, ax, path: Path) -> Path:
    for spine in ("top", "right", "left"):
        ax.spines[spine].set_visible(False)
    ax.spines["bottom"].set_color("#cbd5e1")
    ax.grid(axis="y", linewidth=0.8, alpha=0.35)
    ax.tick_params(axis="both", labelsize=9)
    fig.tight_layout(pad=1.4)
    path.parent.mkdir(parents=True, exist_ok=True)
    fig.savefig(path, dpi=150, bbox_inches="tight", facecolor="white")
    fig.clf()
    return path



def _fmt_money(value) -> str:
    if value is None:
        return "N/A"
    return f"${float(value):,.0f}" if abs(float(value)) >= 1000 else f"${float(value):,.2f}"


def _fmt_number(value, suffix: str = "", digits: int = 1) -> str:
    if value is None:
        return "N/A"
    return f"{float(value):,.{digits}f}{suffix}"



def create_energy_instrument_panel(data: dict, output_dir: Path) -> Optional[Path]:
    """Create the primary production and grid-flow cockpit for email reports."""
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        return None

    entries = sorted(data.get("entries", []), key=lambda e: e.get("date", ""))
    production_entries = [e for e in entries if e.get("production_kwh") is not None]
    complete_entries = [
        e for e in entries
        if e.get("production_kwh") is not None
        and e.get("derived", {}).get("daily_import_kwh") is not None
        and e.get("derived", {}).get("daily_export_kwh") is not None
    ]
    meter_entries = [
        e for e in entries
        if e.get("derived", {}).get("daily_import_kwh") is not None
        and e.get("derived", {}).get("daily_export_kwh") is not None
    ]

    prod_entry = production_entries[-1] if production_entries else {}
    complete = complete_entries[-1] if complete_entries else {}
    meter = meter_entries[-1] if meter_entries else {}
    cd = complete.get("derived", {})
    md = meter.get("derived", {})
    lifetime = data.get("lifetime", {})

    width, height = 1500, 720
    image = Image.new("RGB", (width, height), "#071a33")
    draw = ImageDraw.Draw(image)

    def font(size: int, bold: bool = False):
        candidates = [
            "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold
            else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        ]
        for candidate in candidates:
            try:
                return ImageFont.truetype(candidate, size)
            except OSError:
                pass
        return ImageFont.load_default()

    title_font = font(38, True)
    label_font = font(18, True)
    value_font = font(33, True)
    tiny_font = font(14)
    small_font = font(16)

    draw.rounded_rectangle((25, 20, width - 25, 102), radius=24, fill="#0d3e76")
    draw.text((58, 39), "SUNRUN ENERGY FLIGHT DECK", font=title_font, fill="white")
    draw.text((width - 420, 48), "Production & NYSEG Flow", font=label_font, fill="#b9dcff")

    metrics = [
        ("SOLAR PRODUCED", prod_entry.get("production_kwh"), " kWh", 100,
         "#54a8ff", prod_entry.get("date", "No production date")),
        ("USED IN HOME", cd.get("self_consumed_kwh"), " kWh", 80,
         "#48d597", complete.get("date", "No complete date")),
        ("FROM NYSEG", md.get("daily_import_kwh"), " kWh", 50,
         "#ffb34d", meter.get("date", "No meter date")),
        ("TO NYSEG", md.get("daily_export_kwh"), " kWh", 80,
         "#42e58d", meter.get("date", "No meter date")),
        ("HOME CONSUMPTION", cd.get("home_consumption_kwh"), " kWh", 100,
         "#b98cff", complete.get("date", "No complete date")),
        ("SOLAR COVERAGE", cd.get("solar_coverage_percent"), "%", 100,
         "#ffd84d", complete.get("date", "No complete date")),
        ("LIFETIME PRODUCTION", lifetime.get("production_kwh"), " kWh", 11141,
         "#4de1c1", "Annual target 11,141 kWh"),
        ("NET GRID", md.get("net_grid_kwh"), " kWh", 50,
         "#42e58d" if float(md.get("net_grid_kwh") or 0) <= 0 else "#ff826f",
         "Export" if float(md.get("net_grid_kwh") or 0) < 0 else "Import"),
    ]

    import math
    panel_w, panel_h = 340, 265
    start_x, start_y = 52, 130
    gap_x, gap_y = 24, 25

    for index, (label, raw, suffix, maximum, accent, note) in enumerate(metrics):
        col, row = index % 4, index // 4
        x0 = start_x + col * (panel_w + gap_x)
        y0 = start_y + row * (panel_h + gap_y)
        x1, y1 = x0 + panel_w, y0 + panel_h
        draw.rounded_rectangle((x0, y0, x1, y1), radius=25, fill="#102946",
                               outline="#315578", width=2)
        draw.text((x0 + 22, y0 + 18), label, font=label_font, fill="#a9bed3")

        cx, cy, radius = x0 + panel_w // 2, y0 + 142, 92
        bbox = (cx-radius, cy-radius, cx+radius, cy+radius)
        draw.arc(bbox, 180, 360, fill="#284965", width=18)
        value = float(raw) if raw is not None else 0.0
        gauge_value = abs(value) if label == "NET GRID" else value
        fraction = max(0.0, min(gauge_value / maximum if maximum else 0, 1.0))
        draw.arc(bbox, 180, 180 + int(180*fraction), fill=accent, width=18)

        for tick in range(11):
            angle = math.radians(180 + tick*18)
            xa = cx + (radius-2)*math.cos(angle)
            ya = cy + (radius-2)*math.sin(angle)
            xb = cx + (radius-14)*math.cos(angle)
            yb = cy + (radius-14)*math.sin(angle)
            draw.line((xa,ya,xb,yb), fill="#6f8ca7", width=2)

        angle = math.radians(180 + 180*fraction)
        nx = cx + (radius-26)*math.cos(angle)
        ny = cy + (radius-26)*math.sin(angle)
        draw.line((cx,cy,nx,ny), fill="white", width=5)
        draw.ellipse((cx-8,cy-8,cx+8,cy+8), fill=accent)

        display = "N/A" if raw is None else f"{value:,.1f}{suffix}"
        box = draw.textbbox((0,0), display, font=value_font)
        draw.text((cx-(box[2]-box[0])/2, y0+168), display, font=value_font, fill="white")
        note_text = str(note)
        box = draw.textbbox((0,0), note_text, font=tiny_font)
        draw.text((cx-(box[2]-box[0])/2, y0+224), note_text, font=tiny_font, fill="#9eb5ca")

    draw.text((55, height-34),
              "Production values use the newest Sunrun day; meter values use the newest NYSEG day; combined values use the newest complete day.",
              font=small_font, fill="#91aac1")

    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / "energy_instrument_panel.png"
    image.save(path, "PNG", optimize=True)
    return path

def create_instrument_panel(data: dict, output_dir: Path) -> Optional[Path]:
    """Create a polished eight-instrument dashboard as a PNG for email/report use."""
    try:
        from PIL import Image, ImageDraw, ImageFont
    except ImportError:
        return None

    entries = sorted(data.get("entries", []), key=lambda e: e.get("date", ""))
    latest = entries[-1] if entries else {}
    derived = latest.get("derived", {})
    financial = data.get("lifetime", {}).get("financial", {})

    width, height = 1500, 720
    image = Image.new("RGB", (width, height), "#071a33")
    draw = ImageDraw.Draw(image)

    def font(size: int, bold: bool = False):
        candidates = [
            "C:/Windows/Fonts/arialbd.ttf" if bold else "C:/Windows/Fonts/arial.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf" if bold
            else "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        ]
        for candidate in candidates:
            try:
                return ImageFont.truetype(candidate, size)
            except OSError:
                pass
        return ImageFont.load_default()

    title_font = font(38, True)
    section_font = font(18, True)
    value_font = font(34, True)
    small_font = font(16)
    tiny_font = font(14)
    status_font = font(25, True)

    # Header
    draw.rounded_rectangle((25, 20, width - 25, 102), radius=24, fill="#0d3e76")
    draw.text((58, 39), "SUNRUN ENERGY COCKPIT", font=title_font, fill="white")
    draw.text((width - 440, 48), "Financial & Grid Instruments", font=section_font, fill="#b9dcff")

    metrics = [
        ("TODAY", _fmt_money(financial.get("today_savings_usd")), 100.0,
         float(financial.get("today_savings_usd") or 0), "#48d597", "Latest solar value"),
        ("MONTH", _fmt_money(financial.get("month_to_date_savings_usd")), 1200.0,
         float(financial.get("month_to_date_savings_usd") or 0), "#54a8ff", "Month-to-date"),
        ("YEAR", _fmt_money(financial.get("year_to_date_savings_usd")), 5000.0,
         float(financial.get("year_to_date_savings_usd") or 0), "#b98cff", "Year-to-date"),
        ("PROJECTED", _fmt_money(financial.get("projected_annual_savings_usd")), 6000.0,
         float(financial.get("projected_annual_savings_usd") or 0), "#ffb34d", "Annual estimate"),
        ("LIFETIME", _fmt_money(financial.get("lifetime_savings_usd")), 10000.0,
         float(financial.get("lifetime_savings_usd") or 0), "#4de1c1", "Since activation"),
        ("GOAL", _fmt_number(financial.get("annual_goal_percent"), "%"), 100.0,
         float(financial.get("annual_goal_percent") or 0), "#ffd84d", "11,141 kWh target"),
        ("GRID", str(financial.get("grid_status") or "Unknown"), 100.0,
         100.0 if str(financial.get("grid_status", "")).lower().endswith("exporter") else 40.0,
         "#42e58d" if str(financial.get("grid_status", "")).lower().endswith("exporter") else "#ff826f",
         _fmt_number(abs(float(derived.get("net_grid_kwh") or 0)), " kWh net")),
        ("INDEPENDENCE", _fmt_number(financial.get("solar_independence_percent"), "%"), 100.0,
         float(financial.get("solar_independence_percent") or 0), "#3ed6ff", "Home supplied by solar"),
    ]

    cols, rows = 4, 2
    panel_w, panel_h = 340, 265
    start_x, start_y = 52, 130
    gap_x, gap_y = 24, 25

    import math

    for index, (label, value, maximum, current, accent, note) in enumerate(metrics):
        col = index % cols
        row = index // cols
        x0 = start_x + col * (panel_w + gap_x)
        y0 = start_y + row * (panel_h + gap_y)
        x1, y1 = x0 + panel_w, y0 + panel_h

        draw.rounded_rectangle((x0, y0, x1, y1), radius=25, fill="#102946", outline="#315578", width=2)
        draw.text((x0 + 22, y0 + 18), label, font=section_font, fill="#a9bed3")

        # Semicircle gauge
        cx, cy, radius = x0 + panel_w // 2, y0 + 142, 92
        bbox = (cx - radius, cy - radius, cx + radius, cy + radius)
        draw.arc(bbox, start=180, end=360, fill="#284965", width=18)
        fraction = max(0.0, min(current / maximum if maximum else 0.0, 1.0))
        draw.arc(bbox, start=180, end=180 + int(180 * fraction), fill=accent, width=18)

        # Tick marks
        for tick in range(0, 11):
            angle = math.radians(180 + tick * 18)
            r1, r2 = radius - 2, radius - 14
            xa = cx + r1 * math.cos(angle)
            ya = cy + r1 * math.sin(angle)
            xb = cx + r2 * math.cos(angle)
            yb = cy + r2 * math.sin(angle)
            draw.line((xa, ya, xb, yb), fill="#6f8ca7", width=2)

        # Needle
        needle_angle = math.radians(180 + 180 * fraction)
        nx = cx + (radius - 26) * math.cos(needle_angle)
        ny = cy + (radius - 26) * math.sin(needle_angle)
        draw.line((cx, cy, nx, ny), fill="white", width=5)
        draw.ellipse((cx - 8, cy - 8, cx + 8, cy + 8), fill=accent)

        # Value and note
        value_font_here = status_font if label == "GRID" else value_font
        value_box = draw.textbbox((0, 0), value, font=value_font_here)
        value_w = value_box[2] - value_box[0]
        draw.text((cx - value_w / 2, y0 + 168), value, font=value_font_here, fill="white")

        note_box = draw.textbbox((0, 0), note, font=tiny_font)
        note_w = note_box[2] - note_box[0]
        draw.text((cx - note_w / 2, y0 + 224), note, font=tiny_font, fill="#9eb5ca")

    draw.text((55, height - 34),
              "Values estimated at $0.29/kWh • Green grid status means daily exports exceeded imports",
              font=small_font, fill="#91aac1")

    output_dir.mkdir(parents=True, exist_ok=True)
    path = output_dir / "financial_instrument_panel.png"
    image.save(path, "PNG", optimize=True)
    return path


def create_all_charts(data: dict, output_dir: Path) -> dict[str, Path]:
    try:
        plt, mdates = _plt()
    except ImportError:
        return {}

    entries = sorted(data.get("entries", []), key=lambda e: e["date"])
    charts: dict[str, Path] = {}

    # 1. Daily production.
    production = _valid(entries, "production_kwh")
    if production:
        dates, values = zip(*production)
        avg = sum(values) / len(values)
        fig, ax = plt.subplots(figsize=(12, 5.3))
        ax.set_facecolor("#f8fbff")
        ax.fill_between(dates, values, 0, alpha=0.15)
        ax.plot(dates, values, linewidth=2.8, marker="o", markersize=4.8)
        ax.axhline(avg, linestyle="--", linewidth=1.6,
                   label=f"Average {avg:,.1f} kWh/day")
        ax.set_title("Daily Solar Production", loc="left",
                     fontsize=17, fontweight="bold", pad=16)
        ax.set_ylabel("kWh")
        locator = mdates.AutoDateLocator(minticks=5, maxticks=10)
        ax.xaxis.set_major_locator(locator)
        ax.xaxis.set_major_formatter(mdates.ConciseDateFormatter(locator))
        ax.legend(frameon=False)
        charts["production"] = _finish(
            fig, ax, output_dir / "production_history.png"
        )

    # 2. Daily energy flow.
    flow_rows = []
    for entry in entries:
        d = entry.get("derived", {})
        if all(d.get(k) is not None for k in (
            "self_consumed_kwh", "daily_import_kwh", "daily_export_kwh"
        )):
            flow_rows.append((
                datetime.strptime(entry["date"], "%Y-%m-%d"),
                float(d["self_consumed_kwh"]),
                float(d["daily_import_kwh"]),
                float(d["daily_export_kwh"]),
            ))
    if flow_rows:
        dates = [r[0] for r in flow_rows]
        self_use = [r[1] for r in flow_rows]
        imported = [r[2] for r in flow_rows]
        exported = [r[3] for r in flow_rows]
        fig, ax = plt.subplots(figsize=(12, 5.3))
        ax.plot(dates, self_use, linewidth=2.5, marker="o",
                label="Solar used in home")
        ax.plot(dates, imported, linewidth=2.5, marker="o",
                label="Imported from NYSEG")
        ax.plot(dates, exported, linewidth=2.5, marker="o",
                label="Exported to NYSEG")
        ax.set_title("Daily Energy Flow", loc="left",
                     fontsize=17, fontweight="bold", pad=16)
        ax.set_ylabel("kWh")
        locator = mdates.AutoDateLocator(minticks=5, maxticks=10)
        ax.xaxis.set_major_locator(locator)
        ax.xaxis.set_major_formatter(mdates.ConciseDateFormatter(locator))
        ax.legend(frameon=False, ncol=3)
        charts["energy_flow"] = _finish(
            fig, ax, output_dir / "daily_energy_flow.png"
        )

    # 3. Cumulative production/import/export.
    cumulative_rows = []
    cp = ci = ce = 0.0
    for entry in entries:
        prod = entry.get("production_kwh")
        d = entry.get("derived", {})
        if prod is None:
            continue
        cp += float(prod)
        if d.get("daily_import_kwh") is not None:
            ci += float(d["daily_import_kwh"])
        if d.get("daily_export_kwh") is not None:
            ce += float(d["daily_export_kwh"])
        cumulative_rows.append((
            datetime.strptime(entry["date"], "%Y-%m-%d"), cp, ci, ce
        ))
    if cumulative_rows:
        dates = [r[0] for r in cumulative_rows]
        fig, ax = plt.subplots(figsize=(12, 5.3))
        ax.plot(dates, [r[1] for r in cumulative_rows],
                linewidth=2.8, label="Solar production")
        ax.plot(dates, [r[2] for r in cumulative_rows],
                linewidth=2.3, label="NYSEG import")
        ax.plot(dates, [r[3] for r in cumulative_rows],
                linewidth=2.3, label="NYSEG export")
        ax.set_title("Cumulative Energy Since Activation", loc="left",
                     fontsize=17, fontweight="bold", pad=16)
        ax.set_ylabel("Cumulative kWh")
        locator = mdates.AutoDateLocator(minticks=5, maxticks=10)
        ax.xaxis.set_major_locator(locator)
        ax.xaxis.set_major_formatter(mdates.ConciseDateFormatter(locator))
        ax.legend(frameon=False, ncol=3)
        charts["cumulative"] = _finish(
            fig, ax, output_dir / "cumulative_energy.png"
        )

    # 4. Monthly totals using only matched days where production and
    # meter-derived import/export are all available. This keeps the energy
    # relationships mathematically valid:
    #   production = self-consumed solar + exported solar
    #   home consumption = self-consumed solar + imported grid energy
    monthly = defaultdict(lambda: {
        "production": 0.0, "import": 0.0, "export": 0.0,
        "self": 0.0, "home": 0.0, "complete_days": 0,
        "first_date": None, "last_date": None, "all_production": 0.0,
    })

    for entry in entries:
        month = entry["date"][:7]
        if entry.get("production_kwh") is not None:
            monthly[month]["all_production"] += float(entry["production_kwh"])

        d = entry.get("derived", {})
        required = (
            entry.get("production_kwh"),
            d.get("daily_import_kwh"),
            d.get("daily_export_kwh"),
            d.get("self_consumed_kwh"),
            d.get("home_consumption_kwh"),
        )
        if any(value is None for value in required):
            continue

        monthly[month]["production"] += float(entry["production_kwh"])
        monthly[month]["import"] += float(d["daily_import_kwh"])
        monthly[month]["export"] += float(d["daily_export_kwh"])
        monthly[month]["self"] += float(d["self_consumed_kwh"])
        monthly[month]["home"] += float(d["home_consumption_kwh"])
        monthly[month]["complete_days"] += 1
        monthly[month]["first_date"] = (
            monthly[month]["first_date"] or entry["date"]
        )
        monthly[month]["last_date"] = entry["date"]

    complete_months = {
        month: values
        for month, values in monthly.items()
        if values["complete_days"] > 0
    }

    if complete_months:
        labels = sorted(complete_months)
        x = list(range(len(labels)))
        width = 0.2
        fig, ax = plt.subplots(figsize=(12, 5.3))
        ax.bar([v - 1.5 * width for v in x],
               [complete_months[m]["production"] for m in labels],
               width, label="Production (matched days)")
        ax.bar([v - 0.5 * width for v in x],
               [complete_months[m]["self"] for m in labels],
               width, label="Self-consumed")
        ax.bar([v + 0.5 * width for v in x],
               [complete_months[m]["import"] for m in labels],
               width, label="Imported")
        ax.bar([v + 1.5 * width for v in x],
               [complete_months[m]["export"] for m in labels],
               width, label="Exported")
        ax.set_xticks(x, labels)
        ax.set_title("Monthly Energy Summary — Matched Meter Days", loc="left",
                     fontsize=17, fontweight="bold", pad=16)
        ax.set_ylabel("kWh")
        ax.legend(frameon=False, ncol=4)
        note = "Only days with production, import and export readings are included."
        ax.text(0.0, -0.18, note, transform=ax.transAxes, fontsize=10,
                color="#475569")
        charts["monthly"] = _finish(
            fig, ax, output_dir / "monthly_energy_summary.png"
        )

        # 5. Detailed monthly energy-balance explanation.
        # Each month has two stacked columns:
        # Solar allocation: self-consumed + exported = matched production.
        # Home supply: self-consumed + imported = home consumption.
        fig, ax = plt.subplots(figsize=(13, 6.6))
        ax.set_facecolor("#f8fbff")

        group_width = 0.34
        solar_x = [v - 0.2 for v in x]
        home_x = [v + 0.2 for v in x]

        self_values = [complete_months[m]["self"] for m in labels]
        export_values = [complete_months[m]["export"] for m in labels]
        import_values = [complete_months[m]["import"] for m in labels]
        production_values = [complete_months[m]["production"] for m in labels]
        home_values = [complete_months[m]["home"] for m in labels]

        ax.bar(solar_x, self_values, group_width,
               label="Self-consumed solar")
        ax.bar(solar_x, export_values, group_width,
               bottom=self_values, label="Exported solar")
        ax.bar(home_x, self_values, group_width,
               label="Self-consumed solar (home)")
        ax.bar(home_x, import_values, group_width,
               bottom=self_values, label="Imported from NYSEG")

        for index, month in enumerate(labels):
            values = complete_months[month]
            solar_total = self_values[index] + export_values[index]
            home_total = self_values[index] + import_values[index]

            ax.text(
                solar_x[index], solar_total + max(production_values) * 0.025,
                f"Production\n{solar_total:,.1f} kWh",
                ha="center", va="bottom", fontsize=9, fontweight="bold"
            )
            ax.text(
                home_x[index], home_total + max(production_values) * 0.025,
                f"Home use\n{home_total:,.1f} kWh",
                ha="center", va="bottom", fontsize=9, fontweight="bold"
            )

            coverage = (
                f"{values['first_date'][5:]} to {values['last_date'][5:]}"
                if values["first_date"] and values["last_date"]
                else "No matched dates"
            )
            ax.text(
                index, -max(production_values) * 0.12,
                f"{values['complete_days']} matched days\n{coverage}",
                ha="center", va="top", fontsize=9, color="#475569"
            )

        ax.set_xticks(x, labels)
        ax.set_ylabel("kWh")
        ax.set_title(
            "Monthly Energy Balance Explained",
            loc="left", fontsize=18, fontweight="bold", pad=18
        )
        ax.text(
            0.0, 1.01,
            "Solar allocation: self-consumed + exported = production.  "
            "Home supply: self-consumed + imported = home consumption.",
            transform=ax.transAxes, fontsize=10.5, color="#334155"
        )
        ax.legend(frameon=False, ncol=2, loc="upper right")
        ax.margins(y=0.18)
        charts["energy_balance_explained"] = _finish(
            fig, ax, output_dir / "monthly_energy_balance_explained.png"
        )

    energy_instrument = create_energy_instrument_panel(data, output_dir)
    if energy_instrument is not None:
        charts["energy_instruments"] = energy_instrument

    instrument = create_instrument_panel(data, output_dir)
    if instrument is not None:
        charts["instruments"] = instrument

    return charts
