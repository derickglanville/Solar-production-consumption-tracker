r"""Download NYSEG interval usage data through the Energy Manager web portal.

First interactive run (handles MFA/CAPTCHA and saves the authenticated browser profile):
    $credential = Get-Credential
    $env:NYSEG_USER = $credential.UserName
    $env:NYSEG_PASS = [System.Net.NetworkCredential]::new('', $credential.Password).Password
    py '.\NYSEG Download Script\nyseg_download.py' --headed
    Remove-Item Env:NYSEG_USER, Env:NYSEG_PASS

Later unattended run, after the saved NYSEG session is valid:
    py '.\NYSEG Download Script\nyseg_download.py'
"""
from __future__ import annotations

import argparse
import csv
import os
import re
import shutil
import sys
import time
from datetime import date, datetime
from pathlib import Path
from typing import Iterable

from playwright.sync_api import Locator, Page, TimeoutError as PlaywrightTimeoutError, sync_playwright

INSIGHTS_URL = "https://energymanager.nyseg.com/insights"
PROJECT_ROOT = Path(__file__).resolve().parent.parent
OUTPUT_DIRECTORY = PROJECT_ROOT / "SunRun Data"
OUTPUT_FILE = OUTPUT_DIRECTORY / "NYSEG_Daily_Usage_Data.csv"
ARCHIVE_DIRECTORY = OUTPUT_DIRECTORY / "archive"
LOCAL_APP_DATA = Path(os.environ.get("LOCALAPPDATA", Path.home() / "AppData" / "Local"))
PROFILE_ROOT = LOCAL_APP_DATA / "SolarEnergyTracker"


def profile_directory_for(browser: str) -> Path:
    """Keep Edge and Chrome authenticated profiles separate."""
    return PROFILE_ROOT / f"nyseg-playwright-profile-{browser}"


DIAGNOSTIC_DIRECTORY = LOCAL_APP_DATA / "SolarEnergyTracker" / "nyseg-download-diagnostics"
REQUIRED_COLUMNS = {"Date", "Delivered", "Received"}
HTTP2_ERROR_TEXT = "ERR_HTTP2_PROTOCOL_ERROR"


def first_visible(locators: Iterable[Locator]) -> Locator | None:
    for locator in locators:
        try:
            if locator.count() and locator.first.is_visible():
                return locator.first
        except PlaywrightTimeoutError:
            continue
    return None


def page_has_http2_error(page: Page) -> bool:
    """Detect Edge's SSO error page before waiting for a control that cannot render."""
    try:
        return HTTP2_ERROR_TEXT in page.locator("body").inner_text(timeout=2_000)
    except PlaywrightTimeoutError:
        return False


def go_to_insights(page: Page) -> None:
    """Open NYSEG Insights with short retries for transient SSO HTTP/2 failures."""
    last_error = None
    for attempt in range(1, 4):
        try:
            page.goto(INSIGHTS_URL, wait_until="domcontentloaded", timeout=45_000)
            page.wait_for_timeout(1_500)
            if not page_has_http2_error(page):
                return
            last_error = RuntimeError("NYSEG SSO returned an HTTP/2 protocol error.")
        except PlaywrightTimeoutError as error:
            last_error = error
        if attempt < 3:
            print(f"NYSEG SSO did not load (attempt {attempt}/3); retrying…", flush=True)
            page.goto("about:blank")
            page.wait_for_timeout(3_000)
    raise RuntimeError(
        "NYSEG's sign-in service could not be reached after three attempts "
        f"({HTTP2_ERROR_TEXT}). Try Run NYSEG sync now again later, or renew the session with --headed."
    ) from last_error


def click_choice(dialog: Locator, label: str) -> None:
    """Choose a radio option using accessible labels first, visible text second."""
    pattern = re.compile(rf"^{re.escape(label)}$", re.I)
    try:
        radio = dialog.get_by_role("radio", name=pattern)
        if radio.count():
            radio.first.check()
            return
    except PlaywrightTimeoutError:
        pass
    choice = first_visible((dialog.get_by_label(pattern), dialog.get_by_text(pattern, exact=True)))
    if not choice:
        raise RuntimeError(f"NYSEG download dialog did not show the {label!r} option.")
    choice.click()


def fill_date(dialog: Locator, kind: str, value: date) -> None:
    """Fill a NYSEG date field despite minor portal label/id changes."""
    label = re.compile(rf"{kind}\s*date", re.I)
    selector = kind.lower()
    candidates = (
        dialog.get_by_label(label),
        dialog.locator(f'input[name*="{selector}" i]'),
        dialog.locator(f'input[id*="{selector}" i]'),
        dialog.locator(f'input[aria-label*="{selector}" i]'),
    )
    field = first_visible(candidates)
    if not field:
        # The NYSEG modal has exactly two date inputs in its Custom range form.
        inputs = dialog.locator('input[type="date"], input[placeholder*="MM" i]')
        position = 0 if kind.lower() == "start" else 1
        if inputs.count() > position:
            field = inputs.nth(position)
    if not field:
        raise RuntimeError(f"Could not find the NYSEG {kind.lower()} date field.")
    field.fill(value.strftime("%m/%d/%Y"))
    field.press("Tab")


def ensure_signed_in(page: Page, username: str | None, password: str | None, headed: bool) -> None:
    go_to_insights(page)
    password_field = first_visible((
        page.locator('input[type="password"]'),
        page.get_by_label(re.compile("password", re.I)),
    ))
    if not password_field:
        return
    if not username or not password:
        if headed:
            print("NYSEG sign-in is required. Complete sign-in, MFA, or CAPTCHA in the browser window.")
            page.wait_for_timeout(90_000)
            go_to_insights(page)
            return
        raise RuntimeError("NYSEG login expired. Run once with --headed and NYSEG_USER/NYSEG_PASS to renew the saved browser session.")
    username_field = first_visible((
        page.get_by_label(re.compile("user(name)?|email", re.I)),
        page.locator('input[type="email"]'),
        page.locator('input[name*="user" i], input[name*="email" i]'),
    ))
    if not username_field:
        raise RuntimeError("NYSEG login form was found but the username field was not recognized.")
    username_field.fill(username)
    password_field.fill(password)
    submit = first_visible((
        page.get_by_role("button", name=re.compile("sign in|log in|continue", re.I)),
        page.locator('button[type="submit"], input[type="submit"]'),
    ))
    if not submit:
        raise RuntimeError("NYSEG login form was found but the submit button was not recognized.")
    submit.click()
    page.wait_for_timeout(2_000)
    if first_visible((page.locator('input[type="password"]'),)):
        if not headed:
            raise RuntimeError("NYSEG requires additional sign-in verification. Run with --headed to complete it.")
        print("Complete NYSEG MFA or CAPTCHA in the browser window, then wait for Insights to load.")
        page.wait_for_timeout(90_000)
    go_to_insights(page)


def open_download_dialog(page: Page) -> Locator:
    go_to_insights(page)
    # Insights is a single-page app. DOMContentLoaded only means its empty
    # shell is visible; NYSEG's cards and download control can take time to
    # render after sign-in.
    print("Waiting for NYSEG Insights to finish loading the download control…", flush=True)
    deadline = time.monotonic() + 60
    trigger = None
    while time.monotonic() < deadline:
        trigger = first_visible((
            page.get_by_role("button", name=re.compile(r"download.*(my|your).*energy.*use.*data", re.I)),
            page.get_by_role("link", name=re.compile(r"download.*(my|your).*energy.*use.*data", re.I)),
            page.get_by_role("button", name=re.compile(r"download.*energy", re.I)),
            page.get_by_role("link", name=re.compile(r"download.*energy", re.I)),
            page.get_by_text(re.compile(r"download.*(my|your).*energy.*use.*data", re.I)),
        ))
        if trigger:
            break
        page.wait_for_timeout(1_000)
    if not trigger:
        raise RuntimeError("NYSEG Insights did not finish rendering a Download My/your Energy Use Data control within 60 seconds.")
    # NYSEG currently exposes this as a link beneath the usage chart.  Its
    # implementation has alternated between an ARIA dialog, an unlabelled
    # in-page panel, and a separate browser tab, so do not assume one markup.
    known_pages = set(page.context.pages)
    trigger.click()
    page.wait_for_timeout(1_000)
    popup_pages = [candidate for candidate in page.context.pages if candidate not in known_pages]
    if popup_pages:
        page = popup_pages[-1]
        page.set_default_timeout(20_000)

    dialog = page.get_by_role("dialog")
    try:
        dialog.last.wait_for(state="visible", timeout=15_000)
        return dialog.last
    except PlaywrightTimeoutError:
        fallback = page.locator('[role="dialog"], .modal:visible').last
        if fallback.count() and fallback.is_visible():
            return fallback
        # The portal's newer download panel has no dialog role.  Once its
        # form labels are visible, the page body is a safe search scope for
        # the radio buttons, dates, and final Download file button below.
        data_type = page.get_by_text(re.compile(r"select\s+data\s+type", re.I))
        try:
            data_type.last.wait_for(state="visible", timeout=5_000)
            return page.locator("body")
        except PlaywrightTimeoutError:
            pass
        raise RuntimeError("NYSEG did not open the energy-use download dialog.")


def validate_csv(path: Path) -> int:
    with path.open("r", encoding="utf-8-sig", newline="") as handle:
        reader = csv.DictReader(handle)
        columns = set(reader.fieldnames or [])
        missing = REQUIRED_COLUMNS - columns
        if missing:
            raise RuntimeError(f"Downloaded file is not an NYSEG interval CSV; missing columns: {', '.join(sorted(missing))}.")
        rows = sum(1 for _ in reader)
    if not rows:
        raise RuntimeError("NYSEG downloaded a CSV with no interval rows.")
    return rows


def save_download(download, output: Path) -> tuple[Path, int]:
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix(".partial.csv")
    download.save_as(temporary)
    rows = validate_csv(temporary)
    if output.exists():
        ARCHIVE_DIRECTORY.mkdir(parents=True, exist_ok=True)
        stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
        shutil.copy2(output, ARCHIVE_DIRECTORY / f"NYSEG_Daily_Usage_Data_{stamp}.csv")
    temporary.replace(output)
    return output, rows


def download_usage(page: Page, start: date, end: date) -> tuple[Path, int]:
    dialog = open_download_dialog(page)
    click_choice(dialog, "Usage")
    click_choice(dialog, "Custom")
    fill_date(dialog, "Start", start)
    fill_date(dialog, "End", end)
    click_choice(dialog, "CSV")
    download_button = first_visible((
        dialog.get_by_role("button", name=re.compile(r"^download file$", re.I)),
        dialog.get_by_text(re.compile(r"^download file$", re.I)),
    ))
    if not download_button:
        raise RuntimeError("Could not find NYSEG's final 'Download file' button.")
    with page.expect_download(timeout=90_000) as download_info:
        download_button.click()
    return save_download(download_info.value, OUTPUT_FILE)


def main() -> int:
    parser = argparse.ArgumentParser(description="Download NYSEG Usage CSV for the solar tracker.")
    parser.add_argument("--headed", action="store_true", help="show the browser for first login, MFA, or selector troubleshooting")
    parser.add_argument("--browser", choices=("chrome", "edge", "chromium"), default="chrome", help="browser to automate; Chrome is the NYSEG default")
    parser.add_argument("--start", type=date.fromisoformat, default=date(2026, 7, 1), help="first requested date, YYYY-MM-DD")
    parser.add_argument("--end", type=date.fromisoformat, default=date.today(), help="last requested date, YYYY-MM-DD")
    args = parser.parse_args()
    if args.end < args.start:
        parser.error("--end must be on or after --start")
    profile_directory = profile_directory_for(args.browser)
    profile_directory.mkdir(parents=True, exist_ok=True)
    DIAGNOSTIC_DIRECTORY.mkdir(parents=True, exist_ok=True)
    print(f"Launching {'visible ' if args.headed else ''}{args.browser.title()} browser…", flush=True)
    with sync_playwright() as playwright:
        context = None
        page = None
        download_completed = False
        try:
            context = playwright.chromium.launch_persistent_context(
                str(profile_directory), headless=not args.headed, accept_downloads=True,
                channel={"edge": "msedge", "chrome": "chrome"}.get(args.browser),
                # Chrome is NYSEG's supported browser and needs its normal
                # networking stack. Keep the old HTTP/2 workaround for Edge only.
                args=["--disable-http2"] if args.browser == "edge" else [],
            )
            page = context.pages[0] if context.pages else context.new_page()
            page.set_default_timeout(20_000)
            ensure_signed_in(page, os.getenv("NYSEG_USER"), os.getenv("NYSEG_PASS"), args.headed)
            destination, rows = download_usage(page, args.start, args.end)
            download_completed = True
            print(f"Downloaded {rows:,} NYSEG intervals to: {destination}")
            return 0
        except Exception as error:
            stamp = datetime.now().strftime("%Y%m%d-%H%M%S")
            screenshot = DIAGNOSTIC_DIRECTORY / f"nyseg-download-{stamp}.png"
            if page is not None:
                try:
                    page.screenshot(path=str(screenshot), full_page=True)
                except Exception:
                    screenshot = None
            else:
                screenshot = None
            print(f"NYSEG download failed: {error}", file=sys.stderr)
            if screenshot:
                print(f"Diagnostic screenshot: {screenshot}", file=sys.stderr)
            return 1
        finally:
            # Edge can close its target immediately after handing Playwright a
            # completed download. The CSV has already been saved and validated
            # at that point, so a second close request must not turn success
            # into a Python traceback.
            if context is not None:
                try:
                    context.close()
                except Exception as close_error:
                    if download_completed:
                        print(f"Download completed; Edge had already closed during cleanup ({close_error}).")
                    else:
                        print(f"Browser cleanup warning: {close_error}", file=sys.stderr)


if __name__ == "__main__":
    raise SystemExit(main())
