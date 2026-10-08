from __future__ import annotations

import argparse
import sys
from datetime import date, datetime
from pathlib import Path

from sunrun_charts import create_all_charts
from sunrun_config import CHART_DIR, JSON_FILE, REPORT_DIR
from sunrun_json import update_weather_for_date
from sunrun_report import build_html_report, save_report

PROJECT_ROOT = Path(__file__).resolve().parents[2]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from solar_tracker.firestore import FirestoreRepository

LOG_FILE = Path(__file__).resolve().parent / "automation_logs" / "evening_weather_sync.log"


def log(message: str) -> None:
    LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    line = f"[{datetime.now():%Y-%m-%d %H:%M:%S}] {message}"
    print(line, flush=True)
    with LOG_FILE.open("a", encoding="utf-8") as handle:
        handle.write(line + "\n")


def publish_weather_to_firebase(data: dict, date_text: str) -> None:
    entry = next((item for item in data.get("entries", []) if item.get("date") == date_text), None)
    if not entry:
        raise RuntimeError(f"Weather sync did not return an entry for {date_text}.")
    irradiance = entry.get("irradiance_w_m2")
    if irradiance is None:
        raise RuntimeError(f"Weather sync did not return irradiance for {date_text}.")
    source = (entry.get("source") or {}).get("weather") or "Open-Meteo evening weather sync"
    FirestoreRepository().save_weather_reading(
        date.fromisoformat(date_text),
        float(irradiance),
        str(entry.get("weather") or "Unknown"),
        entry.get("high_f"),
        entry.get("low_f"),
        source,
    )
    log(f"Weather and irradiance published to Firebase for {date_text}.")


def run(target_date: str | None = None) -> int:
    started = datetime.now()
    date_text = target_date or started.strftime("%Y-%m-%d")
    success = False
    error_message = None
    charts = {}
    data = {}

    try:
        log(f"Starting evening weather synchronization for {date_text}.")
        data, saved = update_weather_for_date(date_text, path=JSON_FILE)
        log(f"Weather and irradiance updated: {saved}")
        publish_weather_to_firebase(data, date_text)

        run_chart_dir = CHART_DIR / f"weather_{started:%Y-%m-%d_%H%M%S}"
        charts = create_all_charts(data, run_chart_dir)
        log(f"Created {len(charts)} chart(s).")

        success = True
    except Exception as exc:
        error_message = str(exc)
        log(f"Evening weather synchronization failed: {error_message}")

    finished = datetime.now()

    try:
        html = build_html_report(
            data,
            success=success,
            workflow_started=started,
            workflow_finished=finished,
            error_message=error_message,
            chart_keys=set(charts),
        )
        report = save_report(html, finished, charts)
        log(f"Dashboard report refreshed: {report}")
    except Exception as exc:
        log(f"Report refresh failed: {exc}")
        if success:
            return 2

    return 0 if success else 1


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--date", help="Date to update in YYYY-MM-DD format.")
    args = parser.parse_args()
    return run(args.date)


if __name__ == "__main__":
    raise SystemExit(main())
