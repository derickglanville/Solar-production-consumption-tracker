from __future__ import annotations

import argparse
import json
import subprocess
import sys
from datetime import datetime
from pathlib import Path
from typing import Any

from sunrun_config import JSON_FILE, SCRIPT_DIR
from sunrun_json import update_meter_reading

APPLICATION_DATA_FILE = Path(
    r"C:\Software Developement\ChatGPT Codex\Solar Energy - SunRun\JSON\application_data_current.json"
)
QUERY_SCRIPT = SCRIPT_DIR / "Get-LatestMeterReading.ps1"
SYNC_LOG_FILE = SCRIPT_DIR / "automation_logs" / "meter_sync.log"


class MeterSyncError(RuntimeError):
    pass


def _log(message: str) -> None:
    SYNC_LOG_FILE.parent.mkdir(parents=True, exist_ok=True)
    line = f"[{datetime.now():%Y-%m-%d %H:%M:%S}] {message}"
    print(line, flush=True)
    with SYNC_LOG_FILE.open("a", encoding="utf-8") as handle:
        handle.write(line + "\n")


def _normalize_date(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        raise MeterSyncError("The latest record does not contain entry_date.")

    # Accept ISO dates, ISO date-times, and common U.S. date formats.
    candidates = [text, text[:10]]
    formats = (
        "%Y-%m-%d",
        "%Y-%m-%dT%H:%M:%S",
        "%Y-%m-%dT%H:%M:%S.%f",
        "%m/%d/%Y",
        "%m/%d/%Y %H:%M:%S",
    )
    for candidate in candidates:
        for fmt in formats:
            try:
                return datetime.strptime(candidate, fmt).strftime("%Y-%m-%d")
            except ValueError:
                pass

    try:
        return datetime.fromisoformat(text.replace("Z", "+00:00")).strftime("%Y-%m-%d")
    except ValueError as exc:
        raise MeterSyncError(f"Unsupported entry_date value: {text}") from exc


def _number(value: Any, field_name: str) -> float:
    if value is None or str(value).strip() == "":
        raise MeterSyncError(f"The latest record does not contain {field_name}.")
    try:
        return float(str(value).replace(",", "").strip())
    except ValueError as exc:
        raise MeterSyncError(f"Invalid {field_name}: {value}") from exc


def query_latest_meter_reading(
    history_file: Path = APPLICATION_DATA_FILE,
) -> dict[str, Any]:
    if not history_file.is_file():
        raise MeterSyncError(f"History file not found: {history_file}")
    if not QUERY_SCRIPT.is_file():
        raise MeterSyncError(f"PowerShell query script not found: {QUERY_SCRIPT}")

    command = [
        "powershell.exe",
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", str(QUERY_SCRIPT),
        "-HistoryFile", str(history_file),
    ]
    result = subprocess.run(
        command,
        text=True,
        capture_output=True,
        check=False,
        timeout=60,
    )
    if result.returncode != 0:
        detail = (result.stderr or result.stdout or "Unknown PowerShell error").strip()
        raise MeterSyncError(detail)

    try:
        payload = json.loads(result.stdout.strip())
    except json.JSONDecodeError as exc:
        raise MeterSyncError(
            f"PowerShell returned invalid JSON: {result.stdout.strip()}"
        ) from exc

    return {
        "date": _normalize_date(payload.get("entry_date")),
        "meter01": _number(
            payload.get("meter_01_import_reading"),
            "meter_01_import_reading",
        ),
        "meter02": _number(
            payload.get("meter_02_export_reading"),
            "meter_02_export_reading",
        ),
    }


def sync_latest_meter_reading(
    history_file: Path = APPLICATION_DATA_FILE,
    target_file: Path = JSON_FILE,
) -> Path:
    latest = query_latest_meter_reading(history_file)
    saved = update_meter_reading(
        latest["date"],
        latest["meter01"],
        latest["meter02"],
        source_note="application_data_current.json hourly query",
        path=target_file,
    )
    _log(
        "Meter sync completed: "
        f"{latest['date']} M01={latest['meter01']:.3f}, "
        f"M02={latest['meter02']:.3f}; target={saved}"
    )
    return saved


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Copy the latest M01 and M02 readings into Solar_Daily_History.json."
    )
    parser.add_argument(
        "--history-file",
        type=Path,
        default=APPLICATION_DATA_FILE,
    )
    parser.add_argument(
        "--target-file",
        type=Path,
        default=JSON_FILE,
    )
    args = parser.parse_args()

    try:
        sync_latest_meter_reading(args.history_file, args.target_file)
        return 0
    except Exception as exc:
        _log(f"Meter sync failed: {exc}")
        print(f"Meter sync failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
