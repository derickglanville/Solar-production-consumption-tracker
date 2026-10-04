"""Run the daily NYSEG download, then save new utility meter readings to Firebase.

This script is designed for Windows Task Scheduler. It uses the saved Playwright
NYSEG session created during the interactive ``nyseg_download.py --headed`` run;
no username or password is stored in this script or task.
"""
from __future__ import annotations

import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path


PROJECT_ROOT = Path(__file__).resolve().parent.parent
DOWNLOADER = Path(__file__).resolve().parent / "nyseg_download.py"
STATUS_FILE = PROJECT_ROOT / "SunRun Data" / "nyseg-daily-sync-status.json"


def write_status(payload: dict) -> None:
    STATUS_FILE.parent.mkdir(parents=True, exist_ok=True)
    STATUS_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def main() -> int:
    started_at = datetime.now().astimezone().isoformat(timespec="seconds")
    try:
        download = subprocess.run(
            [sys.executable, str(DOWNLOADER)],
            cwd=PROJECT_ROOT,
            check=False,
            capture_output=True,
            text=True,
        )
        if download.returncode:
            raise RuntimeError(download.stderr.strip() or download.stdout.strip() or "NYSEG download failed.")

        # Run the same server-verified import used by the Review / Apply button.
        from app import create_app

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
            "download_output": download.stdout.strip(),
        }
        write_status(status)
        print(f"NYSEG daily sync completed: {status['saved_records']} Firebase records saved.")
        return 0
    except Exception as error:
        status = {
            "status": "failed",
            "started_at": started_at,
            "completed_at": datetime.now().astimezone().isoformat(timespec="seconds"),
            "error": str(error),
        }
        write_status(status)
        print(f"NYSEG daily sync failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
