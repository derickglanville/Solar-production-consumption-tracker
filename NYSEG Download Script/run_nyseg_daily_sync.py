"""Run the daily NYSEG download, then save new utility meter readings to Firebase.

This script is designed for Windows Task Scheduler. It uses the saved Playwright
NYSEG session created during the interactive ``nyseg_download.py --headed`` run;
no username or password is stored in this script or task.
"""
from __future__ import annotations

import json
import os
import smtplib
import subprocess
import sys
from datetime import datetime
from email.message import EmailMessage
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DOWNLOADER = Path(__file__).resolve().parent / "nyseg_download.py"
STATUS_FILE = PROJECT_ROOT / "SunRun Data" / "nyseg-daily-sync-status.json"
EMAIL_SETTINGS_FILE = PROJECT_ROOT / "SunRun Data" / "Script" / "Email_Info.txt"
LOCK_FILE = STATUS_FILE.with_suffix(".lock")
EMAIL_ENABLED_MARKER = STATUS_FILE.with_name("nyseg-daily-sync-email-enabled")


def write_status(payload: dict) -> None:
    STATUS_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATUS_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")


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


def main(test_email: bool = False) -> int:
    if test_email:
        status = {"status": "success", "completed_at": datetime.now().astimezone().isoformat(timespec="seconds"), "saved_records": 0}
        send_status_email(status, test=True)
        print("NYSEG daily-sync email test sent.")
        return 0

    try:
        lock_handle = os.open(LOCK_FILE, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
    except FileExistsError:
        print("NYSEG daily sync is already running.")
        return 0
    started_at = datetime.now().astimezone().isoformat(timespec="seconds")
    try:
        print("Starting NYSEG browser download…", flush=True)
        # Let the downloader write directly to Task Scheduler's log stream so
        # a person can follow sign-in, portal loading, download, and import
        # progress while the run is still active.
        download = subprocess.run([sys.executable, str(DOWNLOADER)], cwd=PROJECT_ROOT, check=False)
        if download.returncode:
            raise RuntimeError(f"NYSEG download failed with exit code {download.returncode}.")

        # Run the same server-verified import used by the Review / Apply button.
        from app import create_app

        print("Saving new NYSEG M01/M02 readings to Firebase…", flush=True)
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
        print(f"NYSEG daily sync completed: {status['saved_records']} Firebase records saved.")
        return 0
    except Exception as error:
        status = {
            "status": "failed",
            "started_at": started_at,
            "completed_at": datetime.now().astimezone().isoformat(timespec="seconds"),
            "error": str(error),
        }
        add_email_result(status)
        print(f"NYSEG daily sync failed: {error}", file=sys.stderr)
        return 1
    finally:
        os.close(lock_handle)
        try:
            LOCK_FILE.unlink()
        except FileNotFoundError:
            pass


if __name__ == "__main__":
    raise SystemExit(main("--test-email" in sys.argv))
