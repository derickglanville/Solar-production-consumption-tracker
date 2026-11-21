from __future__ import annotations

from datetime import date
from pathlib import Path

ROOT_DIR = Path(
    r"C:\Software Developement\ChatGPT Codex\Solar Energy - SunRun"
)
SCRIPT_DIR = ROOT_DIR / "SunRun Data" / "Script"

DOWNLOAD_SCRIPT = SCRIPT_DIR / "sunrun_download_v7.py"
COPY_SCRIPT = SCRIPT_DIR / "Copy Daily File From Sunrun.py"
EMAIL_INFO_FILE = SCRIPT_DIR / "Email_Info.txt"

SOURCE_DIR = SCRIPT_DIR / "downloads"
DESTINATION_DIR = SCRIPT_DIR.parent
DESTINATION_FILE = DESTINATION_DIR / "Sunrun_Daily_Production_Data.csv"

JSON_DIR = ROOT_DIR / "JSON"
JSON_FILE = JSON_DIR / "Solar_Daily_History.json"

REPORT_DIR = ROOT_DIR / "Report"
LOG_DIR = SCRIPT_DIR / "automation_logs"
CHART_DIR = REPORT_DIR / "charts"

TASK_NAME = "Sunrun Daily Download and Copy"
START_TIME = "08:30"
DELAY_BEFORE_COPY_SECONDS = 10
SMTP_TIMEOUT_SECONDS = 30

ANNUAL_PRODUCTION_GOAL_KWH = 11_141.0
SYSTEM_ACTIVATION_DATE = date(2026, 7, 10)

WEATHER_LOCATION_NAME = "Yorktown Heights, NY"
WEATHER_LATITUDE = 41.2709
WEATHER_LONGITUDE = -73.7776
WEATHER_TIMEOUT_SECONDS = 15

# Retail value used for avoided grid purchases and net-metering credits.
ENERGY_RATE_PER_KWH = 0.29
