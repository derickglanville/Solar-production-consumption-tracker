"""Run the daily NYSEG download, then save new utility meter readings to Firebase.

The 7:30 AM workflow first runs the proven NYSEG_File_Download_Test.py
downloader. Only a successful CSV download proceeds to validated M01/M02
imports, history, and email housekeeping.
"""
from __future__ import annotations

import json
import argparse
import csv
import os
import shutil
import smtplib
import subprocess
import sys
import time
from datetime import date, datetime
from email.message import EmailMessage
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DOWNLOADER = Path(__file__).resolve().parent / "NYSEG_File_Download_Test.py"
CANONICAL_CSV = PROJECT_ROOT / "SunRun Data" / "NYSEG_Daily_Usage_Data.csv"
SAME_DAY_FALLBACK_CSV = PROJECT_ROOT / "SunRun Data" / "NYSEG_Daily_Usage_Data_D.csv"
STATUS_FILE = PROJECT_ROOT / "SunRun Data" / "nyseg-daily-sync-status.json"
HISTORY_FILE = PROJECT_ROOT / "JSON" / "Daily_NYSEG_Load_History.json"
EMAIL_SETTINGS_FILE = PROJECT_ROOT / "SunRun Data" / "Script" / "Email_Info.txt"
LOCK_FILE = STATUS_FILE.with_suffix(".lock")
PROCESS_FILE = STATUS_FILE.with_name("nyseg-daily-sync-process.json")
EMAIL_ENABLED_MARKER = STATUS_FILE.with_name("nyseg-daily-sync-email-enabled")
PROJECT_LOG_FILE = STATUS_FILE.with_name("nyseg-daily-sync.log")
LEGACY_PORTAL_HISTORY_FILE = PROJECT_ROOT / "JSON" / "Solar_Daily_History.json"
# The recorded on-site smart-meter snapshot is the fixed point that connects
# NYSEG's delayed interval history to the legacy portal's cumulative registers.
LEGACY_PORTAL_METER_SNAPSHOT = {
    "date": "2026-10-08",
    "m01": 1421.0,
    "m02": 3495.0,
}
LEGACY_PORTAL_METER_SOURCE_PREFIX = "NYSEG interval CSV backfill"


def sync_legacy_portal_meter_history(progress) -> dict:
    """Backfill the legacy portal's daily M01/M02 history from the NYSEG CSV.

    NYSEG supplies daily Delivered/Received *flow* values.  The legacy portal
    stores cumulative registers, so the known October 8 smart-meter reading is
    used to establish the pre-file baseline.  This preserves the exact NYSEG
    daily changes and lets later published interval days extend naturally.
    """
    project_root_text = str(PROJECT_ROOT)
    if project_root_text not in sys.path:
        sys.path.insert(0, project_root_text)
    script_directory = PROJECT_ROOT / "SunRun Data" / "Script"
    script_directory_text = str(script_directory)
    if script_directory_text not in sys.path:
        sys.path.insert(0, script_directory_text)

    from solar_tracker.nyseg_interval_usage import build_nyseg_interval_usage_report
    from sunrun_json import load_history, recalculate_all, save_history

    report = build_nyseg_interval_usage_report()
    daily_rows = list(reversed(report.get("daily", [])))
    if not report.get("available") or not daily_rows:
        raise RuntimeError("The NYSEG interval CSV is unavailable for the legacy portal update.")

    snapshot_date = LEGACY_PORTAL_METER_SNAPSHOT["date"]
    snapshot_index = next((index for index, row in enumerate(daily_rows) if row["date"] == snapshot_date), None)
    if snapshot_index is None:
        raise RuntimeError(
            f"The NYSEG interval CSV does not include the {snapshot_date} smart-meter anchor date."
        )

    cumulative_m01 = sum(float(row["import_kwh"]) for row in daily_rows[: snapshot_index + 1])
    cumulative_m02 = sum(float(row["export_kwh"]) for row in daily_rows[: snapshot_index + 1])
    baseline_m01 = LEGACY_PORTAL_METER_SNAPSHOT["m01"] - cumulative_m01
    baseline_m02 = LEGACY_PORTAL_METER_SNAPSHOT["m02"] - cumulative_m02

    data = load_history(LEGACY_PORTAL_HISTORY_FILE)
    by_date = {entry["date"]: entry for entry in data.get("entries", [])}
    first_date = date.fromisoformat(daily_rows[0]["date"])
    transition_date = (first_date.fromordinal(first_date.toordinal() - 1)).isoformat()
    transition = by_date.setdefault(transition_date, {"date": transition_date})
    transition.setdefault("source", {})
    if not transition.get("meter01_grid_import") and not transition.get("meter02_grid_export"):
        transition["meter01_grid_import"] = round(baseline_m01, 3)
        transition["meter02_grid_export"] = round(baseline_m02, 3)
        transition["source"]["meter"] = (
            f"{LEGACY_PORTAL_METER_SOURCE_PREFIX}: pre-file baseline calculated from "
            f"the {snapshot_date} smart-meter snapshot."
        )

    running_m01 = baseline_m01
    running_m02 = baseline_m02
    updated_dates: list[str] = []
    skipped_manual_dates: list[str] = []
    for row in daily_rows:
        running_m01 += float(row["import_kwh"])
        running_m02 += float(row["export_kwh"])
        entry = by_date.setdefault(row["date"], {"date": row["date"]})
        entry.setdefault("source", {})
        meter_source = str(entry["source"].get("meter", ""))
        has_values = entry.get("meter01_grid_import") is not None and entry.get("meter02_grid_export") is not None
        if has_values and not meter_source.startswith(LEGACY_PORTAL_METER_SOURCE_PREFIX):
            skipped_manual_dates.append(row["date"])
            continue
        entry["meter01_grid_import"] = round(running_m01, 3)
        entry["meter02_grid_export"] = round(running_m02, 3)
        entry["source"]["meter"] = (
            f"{LEGACY_PORTAL_METER_SOURCE_PREFIX}: NYSEG Delivered/Received daily totals; "
            f"cumulative registers anchored to the {snapshot_date} smart-meter snapshot."
        )
        updated_dates.append(row["date"])

    data["entries"] = list(by_date.values())
    recalculate_all(data)
    save_history(data, LEGACY_PORTAL_HISTORY_FILE)
    progress(
        f"Legacy portal history complete: {len(updated_dates)} daily M01/M02 records updated "
        f"from {daily_rows[0]['date']} through {daily_rows[-1]['date']}."
    )
    if skipped_manual_dates:
        progress(f"Legacy portal history kept {len(skipped_manual_dates)} manually entered M01/M02 records unchanged.")
    return {
        "updated_records": len(updated_dates),
        "source_start": daily_rows[0]["date"],
        "source_end": daily_rows[-1]["date"],
        "anchor_date": snapshot_date,
        "manual_records_preserved": len(skipped_manual_dates),
    }


def write_status(payload: dict) -> None:
    STATUS_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATUS_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def use_valid_same_day_fallback(progress) -> dict:
    """Validate and promote the manually saved D CSV after a download failure.

    The application always reads the canonical NYSEG_Daily_Usage_Data.csv path.
    The D file is accepted only when it was saved today and contains a complete
    latest interval day. NYSEG may publish interval data a few days behind the
    calendar, so the usage-date check must not reject a fresh download for that
    normal lag. The file is then copied atomically to the canonical path.
    """
    if not SAME_DAY_FALLBACK_CSV.is_file():
        raise RuntimeError(f"Fallback file was not found: {SAME_DAY_FALLBACK_CSV.name}")
    saved_on = datetime.fromtimestamp(SAME_DAY_FALLBACK_CSV.stat().st_mtime).date()
    if saved_on != date.today():
        raise RuntimeError(f"Fallback file was saved on {saved_on.isoformat()}, not today.")

    required_columns = {"Date", "Start Time", "End Time", "Delivered", "Received", "Units"}
    row_count = 0
    hourly_rows_by_date: dict[date, int] = {}
    most_recent_date: date | None = None
    with SAME_DAY_FALLBACK_CSV.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        columns = set(reader.fieldnames or [])
        missing = sorted(required_columns - columns)
        if missing:
            raise RuntimeError(f"Fallback CSV is missing required columns: {', '.join(missing)}")
        for row in reader:
            try:
                row_date = date.fromisoformat((row.get("Date") or "").strip())
                float(row.get("Delivered") or "0")
                float(row.get("Received") or "0")
            except (TypeError, ValueError):
                continue
            row_count += 1
            most_recent_date = max(most_recent_date, row_date) if most_recent_date else row_date
            hourly_rows_by_date[row_date] = hourly_rows_by_date.get(row_date, 0) + 1
    if row_count < 24:
        raise RuntimeError("Fallback CSV does not contain enough valid hourly interval rows.")
    latest_day_rows = hourly_rows_by_date.get(most_recent_date, 0) if most_recent_date else 0
    if most_recent_date is None or latest_day_rows < 24:
        actual = most_recent_date.isoformat() if most_recent_date else "none"
        raise RuntimeError(
            f"Fallback CSV does not contain a complete latest interval day. Latest row is {actual}; "
            f"it contains {latest_day_rows} of 24 hourly rows for that date."
        )

    if CANONICAL_CSV.is_file():
        canonical_latest: date | None = None
        with CANONICAL_CSV.open("r", encoding="utf-8-sig", newline="") as handle:
            for row in csv.DictReader(handle):
                try:
                    canonical_latest = max(canonical_latest, date.fromisoformat((row.get("Date") or "").strip())) if canonical_latest else date.fromisoformat((row.get("Date") or "").strip())
                except ValueError:
                    continue
        if canonical_latest and most_recent_date < canonical_latest:
            raise RuntimeError(
                f"Fallback CSV ends {most_recent_date.isoformat()}, older than the canonical CSV ending "
                f"{canonical_latest.isoformat()}; it was not used to avoid replacing newer readings."
            )

    temporary = CANONICAL_CSV.with_suffix(".csv.fallback.tmp")
    shutil.copy2(SAME_DAY_FALLBACK_CSV, temporary)
    temporary.replace(CANONICAL_CSV)
    progress(
        f"Step 1/2 fallback complete: validated {SAME_DAY_FALLBACK_CSV.name} "
        f"({row_count:,} intervals through {most_recent_date.isoformat()}) and promoted it for M01/M02 import."
    )
    return {"source": "same-day fallback", "rows": row_count, "through": most_recent_date.isoformat()}


def save_daily_load_history(status: dict) -> None:
    """Keep one concise NYSEG automation outcome per calendar day."""
    HISTORY_FILE.parent.mkdir(parents=True, exist_ok=True)
    try:
        payload = json.loads(HISTORY_FILE.read_text(encoding="utf-8"))
        records = payload.get("records", [])
    except (OSError, ValueError, AttributeError):
        records = []
    completed = status.get("completed_at") or datetime.now().astimezone().isoformat(timespec="seconds")
    record = {
        "date": completed[:10],
        "completed_at": completed,
        "status": "Success" if status.get("status") == "success" else "Failed",
        "saved_records": int(status.get("saved_records", 0)),
        "email_sent": bool(status.get("email_sent")),
        "message": status.get("error") or "NYSEG CSV download and Firebase import completed.",
    }
    records = [item for item in records if item.get("date") != record["date"]]
    records.append(record)
    HISTORY_FILE.write_text(json.dumps({"records": records}, indent=2), encoding="utf-8")


def progress_writer(log_path: Path | None):
    # Callers may pass the project log as a relative path. Normalize both
    # paths so each progress line is recorded once rather than duplicated.
    destinations = [PROJECT_LOG_FILE.resolve()]
    if log_path:
        requested_log = log_path.resolve()
        if requested_log not in destinations:
            destinations.append(requested_log)

    def write(message: str) -> None:
        text = message.rstrip()
        if not text:
            return
        print(text, flush=True)
        for destination in destinations:
            destination.parent.mkdir(parents=True, exist_ok=True)
            with destination.open("a", encoding="utf-8", newline="\n") as handle:
                handle.write(text + "\n")
    return write


def read_email_settings() -> dict[str, str]:
    if not EMAIL_SETTINGS_FILE.is_file():
        raise RuntimeError("The existing SunRun email configuration was not found.")
    settings: dict[str, str] = {}
    for raw_line in EMAIL_SETTINGS_FILE.read_text(encoding="utf-8-sig").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        settings[key.strip().upper()] = value.strip()
    required = ("SMTP_SERVER", "SMTP_PORT", "EMAIL_FROM", "EMAIL_TO", "USERNAME", "APP_PASSWORD")
    missing = [key for key in required if not settings.get(key)]
    if missing:
        raise RuntimeError("The existing SunRun email configuration is incomplete.")
    return settings


def send_status_email(status: dict, *, test: bool = False) -> None:
    settings = read_email_settings()
    succeeded = status.get("status") == "success"
    subject = "NYSEG daily sync " + ("completed" if succeeded else "failed")
    if test:
        subject = "NYSEG daily sync email test"
    body = [
        "NYSEG daily sync status",
        f"Status: {status.get('status', 'unknown')}",
        f"Completed: {status.get('completed_at', '')}",
    ]
    if succeeded:
        body.append(f"Firebase records saved: {status.get('saved_records', 0)}")
        if status.get("download_source"):
            body.append(f"CSV source: {status['download_source']}")
        saved_dates = status.get("saved_dates") or []
        if saved_dates:
            body.append(f"Dates saved: {saved_dates[0]} through {saved_dates[-1]}")
    elif status.get("error"):
        body.append(f"Reason: {status['error']}")
    if test:
        body.append("This is a test of the NYSEG daily-sync email notification.")
    message = EmailMessage()
    message["From"] = settings["EMAIL_FROM"]
    message["To"] = settings["EMAIL_TO"]
    message["Subject"] = subject
    message.set_content("\n".join(body))
    with smtplib.SMTP(settings["SMTP_SERVER"], int(settings["SMTP_PORT"]), timeout=30) as smtp:
        smtp.ehlo()
        smtp.starttls()
        smtp.ehlo()
        smtp.login(settings["USERNAME"], settings["APP_PASSWORD"])
        smtp.send_message(message)


def add_email_result(status: dict) -> dict:
    if not EMAIL_ENABLED_MARKER.is_file():
        status["email_sent"] = False
        status["email_error"] = "Email notification is awaiting confirmation."
        write_status(status)
        return status
    try:
        send_status_email(status)
        status["email_sent"] = True
    except Exception as error:
        status["email_sent"] = False
        status["email_error"] = str(error)
    write_status(status)
    return status


def main(
    test_email: bool = False,
    log_path: Path | None = None,
    download_script: Path | None = None,
    skip_download: bool = False,
    download_only: bool = False,
    download_no_arguments: bool = False,
) -> int:
    progress = progress_writer(log_path)
    if test_email:
        status = {"status": "success", "completed_at": datetime.now().astimezone().isoformat(timespec="seconds"), "saved_records": 0}
        send_status_email(status, test=True)
        progress("NYSEG daily-sync email test sent.")
        return 0

    try:
        lock_handle = os.open(LOCK_FILE, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError:
        progress("NYSEG daily sync is already running.")
        return 0
    started_at = datetime.now().astimezone().isoformat(timespec="seconds")
    PROCESS_FILE.write_text(json.dumps({"pid": os.getpid(), "started_at": started_at}), encoding="utf-8")
    write_status({
        "status": "running",
        "operation": "process" if skip_download else "sync",
        "stage": "validate" if skip_download else "download",
        "started_at": started_at,
    })
    try:
        download_source = "saved CSV" if skip_download else "automated download"
        if skip_download:
            progress("Step 1/2: Using the already downloaded NYSEG CSV…")
        else:
            downloader = (download_script or DOWNLOADER).resolve()
            if not downloader.is_file():
                raise RuntimeError(f"NYSEG downloader is unavailable: {downloader}")
            progress(f"Step 1/2: Downloading the NYSEG CSV with {downloader.name}…")
            command = [sys.executable, str(downloader)]
            if not download_no_arguments:
                command.append("--workflow-step" if downloader.name == "NYSEG_File_Download_Test.py" else "--headless")
            download = subprocess.Popen(
                command,
                cwd=PROJECT_ROOT,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                bufsize=1,
            )
            assert download.stdout is not None
            output_lines: list[str] = []
            for line in download.stdout:
                output = line.rstrip()
                if output:
                    output_lines.append(output)
                    # The proven test downloader writes its own activity lines.
                    if downloader.name != "NYSEG_File_Download_Test.py" and not (download_only and download_no_arguments):
                        progress(output)
            if download.wait() != 0:
                detail = output_lines[-1] if output_lines else "NYSEG downloader exited without diagnostic output."
                progress(f"Step 1/2 automated download failed: {detail}")
                progress("Step 1/2 fallback: checking NYSEG_Daily_Usage_Data_D.csv for today's intact hourly data…")
                try:
                    fallback = use_valid_same_day_fallback(progress)
                    download_source = fallback["source"]
                except Exception as fallback_error:
                    raise RuntimeError(f"{detail} Fallback file could not be used: {fallback_error}") from fallback_error
            else:
                progress("Step 1/2 complete: NYSEG CSV downloaded successfully.")
            write_status({"status": "running", "started_at": started_at, "stage": "validate"})
            PROCESS_FILE.write_text(json.dumps({"pid": os.getpid(), "started_at": started_at}), encoding="utf-8")

        if download_only:
            status = {
                "status": "success",
                "operation": "download",
                "started_at": started_at,
                "completed_at": datetime.now().astimezone().isoformat(timespec="seconds"),
                "saved_records": 0,
            }
            write_status(status)
            progress("NYSEG Manual Run download completed. M01/M02 import, email, and housekeeping were not run.")
            return 0

        # Run the same server-verified import used by the Review / Apply button.
        # Python starts with this script's folder on sys.path, even when the
        # working directory is the project root.  Add the project explicitly
        # so the background Task Scheduler process can import app.py.
        project_root_text = str(PROJECT_ROOT)
        if project_root_text not in sys.path:
            sys.path.insert(0, project_root_text)
        from app import create_app

        progress("Step 2/3: Validating and saving new NYSEG M01/M02 readings to Firebase…")
        response = create_app().test_client().post("/api/nyseg-meter-intervals/apply")
        result = response.get_json() or {}
        if response.status_code >= 400:
            raise RuntimeError(result.get("error", "NYSEG Firebase import failed."))

        status = {
            "status": "success",
            "operation": "process" if skip_download else "sync",
            "started_at": started_at,
            "completed_at": datetime.now().astimezone().isoformat(timespec="seconds"),
            "saved_records": int(result.get("saved", 0)),
            "saved_dates": result.get("dates", []),
            "download_source": download_source,
            "download_output": "Completed; see nyseg-daily-sync.log for step-by-step output.",
        }
        progress("Step 3/3: Updating the legacy Sunrun Energy Portal meter history…")
        legacy_portal_history = sync_legacy_portal_meter_history(progress)
        status["legacy_portal_history"] = legacy_portal_history
        add_email_result(status)
        save_daily_load_history(status)
        progress(
            f"Step 3/3 complete: {status['saved_records']} Firebase records saved; "
            f"{legacy_portal_history['updated_records']} legacy portal meter records refreshed; "
            "history and email housekeeping finished."
        )
        return 0
    except Exception as error:
        status = {
            "status": "failed",
            "operation": "download" if download_only else "sync",
            "started_at": started_at,
            "completed_at": datetime.now().astimezone().isoformat(timespec="seconds"),
            "error": str(error),
        }
        if not download_only:
            add_email_result(status)
            save_daily_load_history(status)
        else:
            write_status(status)
        progress(f"NYSEG {'Manual Run download' if download_only else 'daily sync'} failed: {error}")
        return 1
    finally:
        os.close(lock_handle)
        try:
            LOCK_FILE.unlink()
        except FileNotFoundError:
            pass
        try:
            PROCESS_FILE.unlink()
        except FileNotFoundError:
            pass


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Run NYSEG validated import and housekeeping.")
    parser.add_argument("--test-email", action="store_true")
    parser.add_argument("--log-path", type=Path)
    parser.add_argument("--skip-download", action="store_true", help="Import an already downloaded CSV without running step 1.")
    parser.add_argument("--download-only", action="store_true", help="Download the CSV only; do not import M01/M02, send email, or update history.")
    parser.add_argument("--download-script", type=Path, help="Downloader to run before import; defaults to NYSEG_File_Download_Test.py.")
    parser.add_argument("--download-no-arguments", action="store_true", help="Run the selected downloader exactly as python SCRIPT, with no extra options.")
    parser.add_argument("--sync-legacy-portal-history", action="store_true", help="Backfill only the legacy Sunrun Energy Portal M01/M02 history from the saved NYSEG CSV.")
    args = parser.parse_args()
    if args.sync_legacy_portal_history:
        result = sync_legacy_portal_meter_history(print)
        print(json.dumps(result, indent=2))
        raise SystemExit(0)
    raise SystemExit(main(
        test_email=args.test_email,
        log_path=args.log_path,
        download_script=args.download_script,
        skip_download=args.skip_download,
        download_only=args.download_only,
        download_no_arguments=args.download_no_arguments,
    ))
