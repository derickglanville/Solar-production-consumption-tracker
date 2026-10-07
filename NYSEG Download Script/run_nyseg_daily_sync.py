"""Run the daily NYSEG download, then save new utility meter readings to Firebase.

Run validated NYSEG M01/M02 imports, status history, and email housekeeping.

The 7:20 AM task downloads the CSV. The 7:30 AM task calls this script with
``--skip-download`` to validate and import that file. The dashboard Manual Run
uses the same script with the manual downloader before the import.
"""
from __future__ import annotations

import json
import argparse
import os
import smtplib
import subprocess
import sys
import time
from datetime import datetime
from email.message import EmailMessage
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DOWNLOADER = Path(__file__).resolve().parent / "Run_NYSEG_File_Download.py"
STATUS_FILE = PROJECT_ROOT / "SunRun Data" / "nyseg-daily-sync-status.json"
HISTORY_FILE = PROJECT_ROOT / "JSON" / "Daily_NYSEG_Load_History.json"
EMAIL_SETTINGS_FILE = PROJECT_ROOT / "SunRun Data" / "Script" / "Email_Info.txt"
LOCK_FILE = STATUS_FILE.with_suffix(".lock")
PROCESS_FILE = STATUS_FILE.with_name("nyseg-daily-sync-process.json")
EMAIL_ENABLED_MARKER = STATUS_FILE.with_name("nyseg-daily-sync-email-enabled")
PROJECT_LOG_FILE = STATUS_FILE.with_name("nyseg-daily-sync.log")


def write_status(payload: dict) -> None:
    STATUS_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATUS_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")


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
    write_status({"status": "running", "started_at": started_at})
    try:
        if skip_download:
            progress("Using the 7:20 AM NYSEG download for validated M01/M02 import…")
        else:
            downloader = (download_script or DOWNLOADER).resolve()
            if not downloader.is_file():
                raise RuntimeError(f"NYSEG downloader is unavailable: {downloader}")
            progress(f"Starting NYSEG manual download with {downloader.name}…")
            download = subprocess.Popen(
                [sys.executable, str(downloader), "--headless"],
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
                    progress(output)
            if download.wait() != 0:
                detail = output_lines[-1] if output_lines else "NYSEG downloader exited without diagnostic output."
                raise RuntimeError(detail)

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

        progress("Saving new NYSEG M01/M02 readings to Firebase…")
        response = create_app().test_client().post("/api/nyseg-meter-intervals/apply")
        result = response.get_json() or {}
        if response.status_code >= 400:
            raise RuntimeError(result.get("error", "NYSEG Firebase import failed."))

        status = {
            "status": "success",
            "started_at": started_at,
            "completed_at": datetime.now().astimezone().isoformat(timespec="seconds"),
            "saved_records": int(result.get("saved", 0)),
            "saved_dates": result.get("dates", []),
            "download_output": "Completed; see nyseg-daily-sync.log for step-by-step output.",
        }
        add_email_result(status)
        save_daily_load_history(status)
        progress(f"NYSEG daily sync completed: {status['saved_records']} Firebase records saved.")
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
    parser.add_argument("--skip-download", action="store_true", help="Import the CSV already downloaded by the 7:20 AM task.")
    parser.add_argument("--download-only", action="store_true", help="Download the CSV only; do not import M01/M02, send email, or update history.")
    parser.add_argument("--download-script", type=Path, help="Downloader to run before import; defaults to Run_NYSEG_File_Download.py.")
    args = parser.parse_args()
    raise SystemExit(main(args.test_email, args.log_path, args.download_script, args.skip_download, args.download_only))
