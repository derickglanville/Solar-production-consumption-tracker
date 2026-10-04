"""
nyseg_download.py - Download usage data from your NYSEG account via Playwright.

Setup (Windows):
    pip install playwright pandas
    playwright install chromium

Credentials (PowerShell):
    $env:NYSEG_USER = "your_username"
    $env:NYSEG_PASS = "your_password"

First run: use --headed so you can handle any MFA/CAPTCHA by hand.
The browser profile is saved, so later runs usually stay logged in.
"""

import argparse
import os
import sys
from datetime import date
from pathlib import Path

import pandas as pd
from playwright.sync_api import TimeoutError as PWTimeout
from playwright.sync_api import sync_playwright

# ---- CONFIGURE THESE after inspecting the site ------------------------------
LOGIN_URL = "https://energymanager.nyseg.com/insights"
USAGE_URL = "https://energymanager.nyseg.com/insights"

SEL_USERNAME = 'input[type="email"], input[name*="user" i]'
SEL_PASSWORD = 'input[type="password"]'
SEL_SUBMIT   = 'button[type="submit"]'
SEL_DOWNLOAD = 'text=/download my energy use data/i'  # Opens NYSEG's download dialog; dialog field selectors still require verification.
# -----------------------------------------------------------------------------

PROFILE_DIR = Path.home() / ".nyseg_profile"
PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = PROJECT_ROOT / "SunRun Data"
OUTPUT_NAME = "NYSEG_Daily_Usage_Data.csv"


def login(page, user, pwd):
    page.goto(LOGIN_URL)
    if page.locator(SEL_PASSWORD).count() == 0:
        print("No login form found - probably already signed in.")
        return
    page.fill(SEL_USERNAME, user)
    page.fill(SEL_PASSWORD, pwd)
    page.click(SEL_SUBMIT)
    page.wait_for_load_state("networkidle")


def download_usage(page, start: date, end: date) -> Path:
    page.goto(USAGE_URL)
    page.wait_for_load_state("networkidle")

    # NYSEG's Usage dialog requires Usage, Custom range, CSV, then Download file.
    # Verify the dialog selectors in a headed session before enabling unattended use.
    # TODO: if the page has date-range inputs, fill them here, e.g.:
    # page.fill('input[name="startDate"]', start.strftime("%m/%d/%Y"))
    # page.fill('input[name="endDate"]', end.strftime("%m/%d/%Y"))

    with page.expect_download(timeout=60_000) as dl_info:
        page.click(SEL_DOWNLOAD)
    download = dl_info.value

    OUT_DIR.mkdir(exist_ok=True)
    dest = OUT_DIR / OUTPUT_NAME
    download.save_as(dest)
    return dest


def preview(path: Path):
    if path.suffix.lower() == ".csv":
        df = pd.read_csv(path, skiprows=lambda i: False, on_bad_lines="skip")
        print(df.head(10).to_string())
        print(f"\n{len(df)} rows")
    else:
        print(f"Saved {path} (not CSV - open or parse as Green Button XML)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--headed", action="store_true", help="show the browser (needed for MFA)")
    ap.add_argument("--start", type=date.fromisoformat, default=date(2026, 7, 1), help="first requested date, YYYY-MM-DD")
    ap.add_argument("--end", type=date.fromisoformat, default=date.today(), help="last requested date, YYYY-MM-DD")
    args = ap.parse_args()

    user, pwd = os.getenv("NYSEG_USER"), os.getenv("NYSEG_PASS")
    if not user or not pwd:
        sys.exit("Set NYSEG_USER and NYSEG_PASS environment variables.")

    start, end = args.start, args.end
    if end < start:
        sys.exit("--end must be on or after --start.")

    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(
            str(PROFILE_DIR), headless=not args.headed, accept_downloads=True
        )
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        try:
            login(page, user, pwd)
            path = download_usage(page, start, end)
            print(f"Downloaded: {path}")
            preview(path)
        except PWTimeout:
            page.screenshot(path="nyseg_error.png")
            sys.exit("Timed out - see nyseg_error.png and fix the selectors/URLs.")
        finally:
            ctx.close()


if __name__ == "__main__":
    main()