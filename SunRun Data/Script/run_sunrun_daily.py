"""
Sunrun daily workflow controller and energy analytics report.

Commands:
    python run_sunrun_daily.py --run
    python run_sunrun_daily.py --test-email
    python run_sunrun_daily.py --update-meter 2026-07-28 205 645
    python run_sunrun_daily.py --install
    python run_sunrun_daily.py --uninstall
    python run_sunrun_daily.py --sync-meters
    python run_sunrun_daily.py --install-meter-sync
    python run_sunrun_daily.py --uninstall-meter-sync
    python run_sunrun_daily.py --sync-weather
    python run_sunrun_daily.py --install-weather-sync
    python run_sunrun_daily.py --uninstall-weather-sync
"""
from __future__ import annotations

import argparse
import csv
import json
import py_compile
import shutil
import smtplib
import subprocess
import sys
import time
from datetime import datetime, timedelta
from email.message import EmailMessage
from pathlib import Path
from typing import Optional

from sunrun_charts import create_all_charts
from sunrun_config import (
    CHART_DIR, COPY_SCRIPT, DELAY_BEFORE_COPY_SECONDS, DESTINATION_FILE,
    DOWNLOAD_SCRIPT, EMAIL_INFO_FILE, JSON_FILE, LOG_DIR, REPORT_DIR,
    SCRIPT_DIR, SMTP_TIMEOUT_SECONDS, SOURCE_DIR, START_TIME, TASK_NAME,
)
from sunrun_json import (
    load_history, update_history_from_csv, update_meter_reading
)
from sunrun_models import ScriptResult
from sunrun_report import build_html_report, save_report
from sync_application_meter_readings import sync_latest_meter_reading


class WorkflowError(RuntimeError):
    pass


LOAD_HISTORY_FILE = JSON_FILE.parent / "Daily_Load_History.json"
METER_SYNC_TASK_NAME = "Sunrun Hourly Meter Sync"
METER_SYNC_START_TIME = "09:00"
METER_SYNC_END_TIME = "20:00"
WEATHER_SYNC_TASK_NAME = "Sunrun Evening Weather Sync"
WEATHER_SYNC_TIME = "20:30"
MANUAL_DOWNLOADS_DIR = Path.home() / "Downloads"
MANUAL_RECOVERY_TASK_NAME = "Sunrun Manual CSV Recovery"


def latest_complete_production_date(path: Path) -> Optional[str]:
    """Validate a Sunrun export and ignore unfinished zero/zero rows."""
    if not path.is_file() or path.stat().st_size == 0:
        raise WorkflowError(f"Sunrun CSV is missing or empty: {path}")
    latest = None
    count = 0
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        required = {"Date", "Solar Produced (kWh)", "End-of-Day Meter Reading (kWh)"}
        if not required.issubset(reader.fieldnames or []):
            raise WorkflowError(f"File is not a Sunrun production export: {path.name}")
        for row in reader:
            count += 1
            try:
                day = datetime.strptime(row["Date"], "%Y-%m-%d").date()
                produced = float(row["Solar Produced (kWh)"])
                meter = float(row["End-of-Day Meter Reading (kWh)"])
            except (ValueError, TypeError, KeyError) as exc:
                raise WorkflowError(f"Invalid Sunrun row in {path.name}: {exc}") from exc
            if day > datetime.now().date():
                raise WorkflowError(f"Sunrun CSV contains a future date: {day}")
            if meter > 0 and produced >= 0:
                latest = max(latest or day.isoformat(), day.isoformat())
    if count < 10 or latest is None:
        raise WorkflowError(f"Sunrun CSV has too little completed history: {path.name}")
    return latest


def newest_manual_download() -> Optional[Path]:
    candidates = sorted(MANUAL_DOWNLOADS_DIR.glob("Daily Solar Production*.csv"), key=lambda path: path.stat().st_mtime, reverse=True)
    for path in candidates:
        try:
            latest_complete_production_date(path)
            return path
        except (WorkflowError, OSError):
            continue
    return None


def scan_manual_downloads() -> int:
    path = newest_manual_download()
    if path is None:
        print("No valid manual Sunrun CSV found in Downloads.")
        return 0
    csv_date = latest_complete_production_date(path)
    saved_date, _ = _latest_production_record(load_history())
    if saved_date and csv_date <= saved_date:
        print(f"Sunrun history is current through {saved_date}; no manual recovery needed.")
        return 0
    print(f"Recovering Sunrun production through {csv_date} from {path.name}.")
    return run_workflow(manual_file=path)


def install_manual_recovery_task() -> int:
    if sys.platform != "win32":
        print("Manual recovery scheduling is supported only on Windows.", file=sys.stderr)
        return 1
    command = f'"{sys.executable}" "{Path(__file__).resolve()}" --scan-manual'
    result = subprocess.run([
        "schtasks", "/Create", "/TN", MANUAL_RECOVERY_TASK_NAME,
        "/TR", command, "/SC", "HOURLY", "/MO", "1",
        "/ST", "09:00", "/ET", "20:00", "/F",
    ], text=True, capture_output=True, check=False)
    if result.stdout.strip():
        print(result.stdout.strip())
    if result.stderr.strip():
        print(result.stderr.strip(), file=sys.stderr)
    return result.returncode


def _latest_production_record(data: dict) -> tuple[Optional[str], Optional[float]]:
    rows = [
        entry for entry in data.get("entries", [])
        if entry.get("production_kwh") is not None
    ]
    if not rows:
        return None, None
    latest = max(rows, key=lambda entry: entry.get("date", ""))
    return latest.get("date"), float(latest["production_kwh"])


def save_daily_load_history(record: dict, path: Path = LOAD_HISTORY_FILE) -> Path:
    """Upsert one concise workflow record per calendar day."""
    path.parent.mkdir(parents=True, exist_ok=True)
    records: list[dict] = []

    if path.is_file():
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            if isinstance(raw, dict):
                records = list(raw.get("records", []))
            elif isinstance(raw, list):
                records = list(raw)
        except (OSError, json.JSONDecodeError, TypeError):
            records = []

    by_date = {
        str(item.get("date")): item
        for item in records
        if isinstance(item, dict) and item.get("date")
    }
    by_date[str(record["date"])] = record
    ordered = [by_date[key] for key in sorted(by_date)]

    payload = {
        "updated_at": datetime.now().isoformat(timespec="seconds"),
        "records": ordered,
    }
    temp = path.with_suffix(".tmp")
    temp.write_text(
        json.dumps(payload, indent=2, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    temp.replace(path)
    return path



def log(message: str, log_file: Optional[Path] = None) -> None:
    line = f"[{datetime.now():%Y-%m-%d %H:%M:%S}] {message}"
    print(line, flush=True)
    if log_file is not None:
        with log_file.open("a", encoding="utf-8") as handle:
            handle.write(line + "\n")


def newest_csv(folder: Path) -> Optional[Path]:
    files = [p for p in folder.glob("sunrun_production_*.csv") if p.is_file()]
    return max(files, key=lambda p: p.stat().st_mtime, default=None)


def read_email_settings() -> dict[str, str | int]:
    if not EMAIL_INFO_FILE.is_file():
        raise WorkflowError(f"Email configuration not found: {EMAIL_INFO_FILE}")

    raw: dict[str, str] = {}
    with EMAIL_INFO_FILE.open("r", encoding="utf-8-sig") as handle:
        for number, line in enumerate(handle, 1):
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" not in line:
                raise WorkflowError(
                    f"Invalid Email_Info.txt line {number}; expected KEY=VALUE."
                )
            key, value = line.split("=", 1)
            raw[key.strip().upper()] = value.strip()

    required = [
        "SMTP_SERVER", "SMTP_PORT", "EMAIL_FROM",
        "EMAIL_TO", "USERNAME", "APP_PASSWORD",
    ]
    missing = [key for key in required if not raw.get(key)]
    if missing:
        raise WorkflowError("Missing email setting(s): " + ", ".join(missing))

    return {
        "smtp_server": raw["SMTP_SERVER"],
        "smtp_port": int(raw["SMTP_PORT"]),
        "email_from": raw["EMAIL_FROM"],
        "email_to": raw["EMAIL_TO"],
        "username": raw["USERNAME"],
        "app_password": raw["APP_PASSWORD"],
    }


def validate_environment(log_file: Path) -> None:
    log("Validating folders, scripts and analytics modules.", log_file)
    for folder in (SOURCE_DIR, LOG_DIR, REPORT_DIR, CHART_DIR, JSON_FILE.parent):
        folder.mkdir(parents=True, exist_ok=True)
    for script in (DOWNLOAD_SCRIPT, COPY_SCRIPT):
        if not script.is_file():
            raise WorkflowError(f"Required script not found: {script}")
        py_compile.compile(str(script), doraise=True)
        log(f"Syntax verified: {script.name}", log_file)
    settings = read_email_settings()
    log(f"Email settings verified for recipient: {settings['email_to']}", log_file)


def run_script(path: Path, log_file: Path, *arguments: str) -> ScriptResult:
    started = datetime.now()
    log(f"Starting: {path.name}", log_file)
    result = subprocess.run(
        [sys.executable, str(path), *arguments],
        cwd=str(SCRIPT_DIR),
        text=True,
        capture_output=True,
        check=False,
    )
    finished = datetime.now()
    for line in result.stdout.rstrip().splitlines():
        log(f"{path.name}: {line}", log_file)
    for line in result.stderr.rstrip().splitlines():
        log(f"{path.name} ERROR: {line}", log_file)
    wrapped = ScriptResult(
        path.name, started, finished, result.returncode,
        result.stdout, result.stderr
    )
    if result.returncode:
        raise WorkflowError(f"{path.name} failed with exit code {result.returncode}.")
    log(
        f"Completed successfully: {path.name} "
        f"({wrapped.elapsed_seconds:.1f} seconds)",
        log_file,
    )
    return wrapped


def verify_new_download(
    previous: Optional[Path],
    previous_mtime: Optional[float],
    started: datetime,
    log_file: Path,
) -> Path:
    downloaded = newest_csv(SOURCE_DIR)
    if downloaded is None:
        raise WorkflowError("No downloaded Sunrun CSV was found.")
    recent = datetime.fromtimestamp(downloaded.stat().st_mtime)
    changed = (
        previous is None
        or downloaded.resolve() != previous.resolve()
        or previous_mtime is None
        or downloaded.stat().st_mtime > previous_mtime
        or recent >= started - timedelta(seconds=5)
    )
    if not changed or downloaded.stat().st_size == 0:
        raise WorkflowError("A new non-empty CSV could not be confirmed.")
    log(
        f"Verified downloaded CSV: {downloaded} "
        f"({downloaded.stat().st_size:,} bytes)",
        log_file,
    )
    return downloaded


def attach_file(message: EmailMessage, path: Optional[Path]) -> None:
    if path is None or not path.is_file():
        return
    suffix = path.suffix.lower()
    if suffix == ".csv":
        maintype, subtype = "text", "csv"
    elif suffix in {".log", ".txt", ".json", ".html"}:
        maintype, subtype = "text", "plain"
    else:
        maintype, subtype = "application", "octet-stream"
    message.add_attachment(
        path.read_bytes(), maintype=maintype, subtype=subtype, filename=path.name
    )


def send_email_report(
    *,
    success: bool,
    workflow_started: datetime,
    workflow_finished: datetime,
    log_file: Path,
    data: dict,
    charts: dict[str, Path],
    report_path: Path,
    error_message: Optional[str],
) -> None:
    settings = read_email_settings()
    latest = data.get("entries", [])[-1] if data.get("entries") else {}
    production = latest.get("production_kwh")
    status = "SUCCESS" if success else "FAILED"
    subject = (
        f"Sunrun Energy - {float(production):.1f} kWh - {status} - "
        f"{latest.get('date', workflow_finished.strftime('%Y-%m-%d'))}"
        if production is not None else
        f"Sunrun Energy Automation - {status} - {workflow_finished:%b %d, %Y}"
    )

    html_text = build_html_report(
        data,
        success=success,
        workflow_started=workflow_started,
        workflow_finished=workflow_finished,
        error_message=error_message,
        chart_keys=set(charts),
    )

    message = EmailMessage()
    message["From"] = str(settings["email_from"])
    message["To"] = str(settings["email_to"])
    message["Subject"] = subject
    message.set_content(
        f"Sunrun energy automation: {status}\n"
        f"Report: {report_path}\n"
        f"JSON: {JSON_FILE}\n"
    )
    message.add_alternative(html_text, subtype="html")
    html_part = message.get_payload()[-1]

    cid_names = {
        "production": "chart_production",
        "energy_flow": "chart_energy_flow",
        "cumulative": "chart_cumulative",
        "monthly": "chart_monthly",
        "energy_balance_explained": "chart_energy_balance_explained",
        "instruments": "dashboard_instruments",
        "energy_instruments": "dashboard_energy_instruments",
    }
    for key, path in charts.items():
        html_part.add_related(
            path.read_bytes(),
            maintype="image",
            subtype="png",
            cid=f"<{cid_names.get(key, f'chart_{key}')}>" ,
            filename=path.name,
            disposition="inline",
        )

    attach_file(message, DESTINATION_FILE)
    attach_file(message, JSON_FILE)
    attach_file(message, log_file)

    with smtplib.SMTP(
        str(settings["smtp_server"]),
        int(settings["smtp_port"]),
        timeout=SMTP_TIMEOUT_SECONDS,
    ) as smtp:
        smtp.ehlo()
        smtp.starttls()
        smtp.ehlo()
        smtp.login(str(settings["username"]), str(settings["app_password"]))
        smtp.send_message(message)


def run_workflow(manual_file: Optional[Path] = None) -> int:
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    started = datetime.now()
    log_file = LOG_DIR / f"sunrun_workflow_{started:%Y-%m-%d}.log"
    success = False
    email_sent = False
    error_message = None
    email_error = None
    data = load_history()
    charts: dict[str, Path] = {}
    report_path = REPORT_DIR / "Sunrun_Report_Not_Created.html"
    downloaded: Optional[Path] = None
    json_path: Optional[Path] = None

    try:
        validate_environment(log_file)
        if manual_file is not None:
            manual_file = manual_file.expanduser().resolve()
            latest_date = latest_complete_production_date(manual_file)
            SOURCE_DIR.mkdir(parents=True, exist_ok=True)
            downloaded = SOURCE_DIR / f"sunrun_production_manual_{started:%Y-%m-%d_%H%M%S}.csv"
            shutil.copyfile(manual_file, downloaded)
            log(f"Using validated manual CSV through {latest_date}: {manual_file}", log_file)
        else:
            previous = newest_csv(SOURCE_DIR)
            previous_mtime = previous.stat().st_mtime if previous else None
            run_script(DOWNLOAD_SCRIPT, log_file, "--headed")
            downloaded = verify_new_download(previous, previous_mtime, started, log_file)

        log("Updating cumulative solar JSON.", log_file)
        data, json_path = update_history_from_csv(downloaded)
        log(f"Cumulative JSON updated: {json_path}", log_file)

        log(
            f"Waiting {DELAY_BEFORE_COPY_SECONDS} seconds before copy script.",
            log_file,
        )
        time.sleep(DELAY_BEFORE_COPY_SECONDS)
        run_script(COPY_SCRIPT, log_file)

        if not DESTINATION_FILE.is_file():
            raise WorkflowError(f"Destination file not found: {DESTINATION_FILE}")
        if DESTINATION_FILE.stat().st_size != downloaded.stat().st_size:
            raise WorkflowError("Destination and downloaded CSV sizes differ.")

        run_chart_dir = CHART_DIR / f"{started:%Y-%m-%d_%H%M%S}"
        charts = create_all_charts(data, run_chart_dir)
        if charts:
            log(f"Created {len(charts)} professional chart(s).", log_file)
        else:
            log(
                "Charts skipped. Install Matplotlib with: "
                "python -m pip install matplotlib",
                log_file,
            )

        success = True
        log("Daily workflow completed successfully.", log_file)

    except Exception as exc:
        error_message = str(exc)
        log(f"WORKFLOW FAILED: {error_message}", log_file)

    finished = datetime.now()

    try:
        html_text = build_html_report(
            data,
            success=success,
            workflow_started=started,
            workflow_finished=finished,
            error_message=error_message,
            chart_keys=set(charts),
        )
        report_path = save_report(html_text, finished, charts)
        log(f"HTML report saved: {report_path}", log_file)

        if manual_file is None:
            send_email_report(
                success=success,
                workflow_started=started,
                workflow_finished=finished,
                log_file=log_file,
                data=data,
                charts=charts,
                report_path=report_path,
                error_message=error_message,
            )
            email_sent = True
            log("Email report sent successfully.", log_file)
        else:
            log("Manual recovery updated the local report without sending email.", log_file)
    except Exception as exc:
        email_error = str(exc)
        log(f"EMAIL/REPORT FAILED: {email_error}", log_file)

    production_date, production_kwh = _latest_production_record(data)
    record = {
        "date": started.strftime("%Y-%m-%d"),
        "started_at": started.isoformat(timespec="seconds"),
        "finished_at": finished.isoformat(timespec="seconds"),
        "duration_seconds": round((finished - started).total_seconds(), 1),
        "status": "Success" if success else "Failed",
        "production_date": production_date,
        "production_kwh": production_kwh,
        "source_csv": downloaded.name if downloaded else None,
        "source_csv_kb": (
            round(downloaded.stat().st_size / 1024, 1)
            if downloaded and downloaded.is_file() else None
        ),
        "json_entries": len(data.get("entries", [])),
        "charts_created": len(charts),
        "report_file": (
            report_path.name if report_path and report_path.is_file() else None
        ),
        "email_sent": email_sent,
        "message": error_message or email_error or "Daily load completed normally.",
    }
    try:
        history_path = save_daily_load_history(record)
        log(f"Daily load history updated: {history_path}", log_file)
    except Exception as exc:
        log(f"LOAD HISTORY UPDATE FAILED: {exc}", log_file)

    if email_error:
        return 2 if success else 1
    return 0 if success else 1


def send_test_email() -> int:
    try:
        settings = read_email_settings()
        message = EmailMessage()
        message["From"] = str(settings["email_from"])
        message["To"] = str(settings["email_to"])
        message["Subject"] = f"Sunrun Email Test - {datetime.now():%b %d, %Y %I:%M %p}"
        message.set_content("Sunrun email settings are working.")
        with smtplib.SMTP(
            str(settings["smtp_server"]),
            int(settings["smtp_port"]),
            timeout=SMTP_TIMEOUT_SECONDS,
        ) as smtp:
            smtp.starttls()
            smtp.login(str(settings["username"]), str(settings["app_password"]))
            smtp.send_message(message)
        print(f"Test email sent successfully to {settings['email_to']}.")
        return 0
    except Exception as exc:
        print(f"Test email failed: {exc}", file=sys.stderr)
        return 1


def scheduled_task_command() -> str:
    return f'"{sys.executable}" "{Path(__file__).resolve()}" --run'


def install_task() -> int:
    if sys.platform != "win32":
        print("Task installation is supported only on Windows.")
        return 1
    result = subprocess.run([
        "schtasks", "/Create", "/TN", TASK_NAME, "/TR",
        scheduled_task_command(), "/SC", "DAILY", "/ST", START_TIME, "/F",
    ], text=True, capture_output=True, check=False)
    print(result.stdout.strip())
    if result.stderr.strip():
        print(result.stderr.strip(), file=sys.stderr)
    return result.returncode


def uninstall_task() -> int:
    result = subprocess.run(
        ["schtasks", "/Delete", "/TN", TASK_NAME, "/F"],
        text=True, capture_output=True, check=False,
    )
    print(result.stdout.strip())
    return result.returncode


def meter_sync_command() -> str:
    script = SCRIPT_DIR / "sync_application_meter_readings.py"
    return f'"{sys.executable}" "{script}"'


def install_meter_sync_task() -> int:
    if sys.platform != "win32":
        print("Meter-sync task installation is supported only on Windows.")
        return 1

    result = subprocess.run(
        [
            "schtasks", "/Create",
            "/TN", METER_SYNC_TASK_NAME,
            "/TR", meter_sync_command(),
            "/SC", "HOURLY",
            "/MO", "1",
            "/ST", METER_SYNC_START_TIME,
            "/ET", METER_SYNC_END_TIME,
            "/F",
        ],
        text=True,
        capture_output=True,
        check=False,
    )
    if result.stdout.strip():
        print(result.stdout.strip())
    if result.stderr.strip():
        print(result.stderr.strip(), file=sys.stderr)
    return result.returncode


def uninstall_meter_sync_task() -> int:
    result = subprocess.run(
        ["schtasks", "/Delete", "/TN", METER_SYNC_TASK_NAME, "/F"],
        text=True,
        capture_output=True,
        check=False,
    )
    if result.stdout.strip():
        print(result.stdout.strip())
    if result.stderr.strip():
        print(result.stderr.strip(), file=sys.stderr)
    return result.returncode


def weather_sync_command() -> str:
    script = SCRIPT_DIR / "sync_evening_weather.py"
    return f'"{sys.executable}" "{script}"'


def install_weather_sync_task() -> int:
    if sys.platform != "win32":
        print("Weather-sync task installation is supported only on Windows.")
        return 1
    result = subprocess.run(
        [
            "schtasks", "/Create",
            "/TN", WEATHER_SYNC_TASK_NAME,
            "/TR", weather_sync_command(),
            "/SC", "DAILY",
            "/ST", WEATHER_SYNC_TIME,
            "/F",
        ],
        text=True,
        capture_output=True,
        check=False,
    )
    if result.stdout.strip():
        print(result.stdout.strip())
    if result.stderr.strip():
        print(result.stderr.strip(), file=sys.stderr)
    return result.returncode


def uninstall_weather_sync_task() -> int:
    result = subprocess.run(
        ["schtasks", "/Delete", "/TN", WEATHER_SYNC_TASK_NAME, "/F"],
        text=True,
        capture_output=True,
        check=False,
    )
    if result.stdout.strip():
        print(result.stdout.strip())
    if result.stderr.strip():
        print(result.stderr.strip(), file=sys.stderr)
    return result.returncode


def main() -> int:
    parser = argparse.ArgumentParser()
    action = parser.add_mutually_exclusive_group(required=True)
    action.add_argument("--run", action="store_true")
    action.add_argument("--manual-file", type=Path, metavar="CSV")
    action.add_argument("--scan-manual", action="store_true")
    action.add_argument("--install-manual-recovery", action="store_true")
    action.add_argument("--test-email", action="store_true")
    action.add_argument("--install", action="store_true")
    action.add_argument("--uninstall", action="store_true")
    action.add_argument("--sync-meters", action="store_true")
    action.add_argument("--install-meter-sync", action="store_true")
    action.add_argument("--uninstall-meter-sync", action="store_true")
    action.add_argument("--sync-weather", action="store_true")
    action.add_argument("--install-weather-sync", action="store_true")
    action.add_argument("--uninstall-weather-sync", action="store_true")
    action.add_argument(
        "--update-meter", nargs=3,
        metavar=("DATE", "METER01_IMPORT", "METER02_EXPORT"),
        help="Add/update one cumulative NYSEG meter reading.",
    )
    parser.add_argument("--irradiance", type=float)
    parser.add_argument("--weather")
    parser.add_argument("--high", type=float)
    parser.add_argument("--low", type=float)
    args = parser.parse_args()

    if args.manual_file:
        return run_workflow(manual_file=args.manual_file)
    if args.scan_manual:
        return scan_manual_downloads()
    if args.install_manual_recovery:
        return install_manual_recovery_task()

    if args.update_meter:
        date_text, meter01, meter02 = args.update_meter
        path = update_meter_reading(
            date_text, float(meter01), float(meter02),
            irradiance=args.irradiance,
            weather=args.weather,
            high_f=args.high,
            low_f=args.low,
        )
        print(f"Cumulative JSON updated: {path}")
        return 0
    if args.sync_meters:
        try:
            path = sync_latest_meter_reading()
            print(f"Latest M01/M02 readings synchronized: {path}")
            return 0
        except Exception as exc:
            print(f"Meter synchronization failed: {exc}", file=sys.stderr)
            return 1
    if args.sync_weather:
        result = subprocess.run(
            [sys.executable, str(SCRIPT_DIR / "sync_evening_weather.py")],
            cwd=str(SCRIPT_DIR),
            text=True,
            check=False,
        )
        return result.returncode
    if args.install_weather_sync:
        return install_weather_sync_task()
    if args.uninstall_weather_sync:
        return uninstall_weather_sync_task()
    if args.install_meter_sync:
        return install_meter_sync_task()
    if args.uninstall_meter_sync:
        return uninstall_meter_sync_task()
    if args.install:
        return install_task()
    if args.uninstall:
        return uninstall_task()
    if args.test_email:
        return send_test_email()
    return run_workflow()


if __name__ == "__main__":
    raise SystemExit(main())
