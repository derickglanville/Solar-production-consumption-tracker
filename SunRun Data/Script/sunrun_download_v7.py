"""
sunrun_download_v7.py

Logs into my.sunrun.com with Playwright, navigates to the History page,
and downloads the "All Time" production CSV export.

Improvements in this version
----------------------------
- Resolves Authentication.txt relative to the script instead of using a hard-coded path.
- Uses role-based and fallback selectors for the mobile-number login button.
- Waits explicitly for each login step.
- Detects stale saved sessions and refreshes them with --show.
- Saves step-by-step screenshots and HTML diagnostics when something fails.
- Prints progress messages so it is clear where the script is working.
- Uses multiple fallback selectors for phone, verification-code, History, and Export controls.
- Reliably changes Sunrun's custom export dropdown from Last 30 Days to All Time.
- Restricts dropdown and Export clicks to the React modal so the overlay cannot intercept them.
- Verifies that the downloaded CSV exists and is not empty.
- Adds --debug pauses after each major browser step.
- Locates the export modal from multiple visible markers instead of depending on ReactModal class names.
- Anchors the download icon to the 'Energy Produced for ...' section so mobile-app links cannot be mistaken for the CSV control.
- Produces a timestamped CSV filename.
- Uses a dedicated diagnostics folder.

Expected project layout
-----------------------
SunRun Data/
├── Login_Download/
│   └── Authentication.txt
└── Script/
    └── sunrun_download_v7.py

Setup
-----
    python -m pip install playwright
    python -m playwright install chromium

First run or session refresh
----------------------------
    python sunrun_download_v7.py --show

Normal scheduled run
--------------------
    python sunrun_download_v7.py
"""

from __future__ import annotations

import argparse
import os
import re
import sys
from datetime import datetime
from pathlib import Path
from typing import Iterable

from playwright.sync_api import (
    BrowserContext,
    Locator,
    Page,
    TimeoutError as PlaywrightTimeoutError,
    sync_playwright,
)

LOGIN_URL = "https://my.sunrun.com/login"
PORTAL_URL = "https://my.sunrun.com/"
HISTORY_URL = "https://my.sunrun.com/history"
EXPORT_RANGE = "All Time"

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
CREDENTIALS_FILE = PROJECT_DIR / "Login_Download" / "Authentication.txt"
DOWNLOAD_DIR = SCRIPT_DIR / "downloads"
STATE_FILE = SCRIPT_DIR / "sunrun_session.json"
DIAGNOSTICS_DIR = SCRIPT_DIR / "diagnostics"

DEFAULT_TIMEOUT_MS = 30_000
SHORT_TIMEOUT_MS = 5_000


def log(message: str) -> None:
    print(f"[{datetime.now():%H:%M:%S}] {message}", flush=True)


def get_phone_number() -> str:
    """Read the Sunrun phone number from SUNRUN_PHONE or Authentication.txt."""
    phone = os.environ.get("SUNRUN_PHONE", "").strip()
    if phone:
        return phone

    if not CREDENTIALS_FILE.exists():
        sys.exit(
            "Authentication file not found.\n"
            f"Expected location:\n{CREDENTIALS_FILE}\n\n"
            "Create the file and put the phone number on the first non-empty line, "
            "or set the SUNRUN_PHONE environment variable."
        )

    try:
        lines = CREDENTIALS_FILE.read_text(encoding="utf-8-sig").splitlines()
    except OSError as exc:
        sys.exit(f"Unable to read:\n{CREDENTIALS_FILE}\n\n{exc}")

    for line in lines:
        value = line.strip()
        if value and not value.startswith("#"):
            return value

    sys.exit(
        "No phone number was found in the authentication file.\n"
        f"Put the number on the first non-empty line of:\n{CREDENTIALS_FILE}"
    )


def save_diagnostics(page: Page, label: str) -> tuple[Path, Path]:
    """Save a screenshot and HTML snapshot for debugging."""
    DIAGNOSTICS_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    safe_label = re.sub(r"[^A-Za-z0-9_-]+", "_", label).strip("_") or "error"
    screenshot_path = DIAGNOSTICS_DIR / f"{stamp}_{safe_label}.png"
    html_path = DIAGNOSTICS_DIR / f"{stamp}_{safe_label}.html"

    try:
        page.screenshot(path=str(screenshot_path), full_page=True)
    except Exception:
        pass

    try:
        html_path.write_text(page.content(), encoding="utf-8")
    except Exception:
        pass

    return screenshot_path, html_path


def wait_for_loader_gone(page: Page, timeout: int = DEFAULT_TIMEOUT_MS) -> None:
    """Wait for Sunrun's full-screen loading overlay to disappear."""
    full_screen = page.locator('[data-testid="full-screen-loader"]').first
    try:
        # The loader can appear a moment after DOMContentLoaded. Waiting only
        # for "hidden" returns too early when it has not mounted yet.
        full_screen.wait_for(state="visible", timeout=3_000)
        full_screen.wait_for(state="hidden", timeout=timeout)
    except PlaywrightTimeoutError:
        pass
    selectors = [
        '[data-testid*="loader"]',
        '[aria-busy="true"]',
    ]
    for selector in selectors:
        try:
            page.locator(selector).first.wait_for(state="hidden", timeout=timeout)
        except PlaywrightTimeoutError:
            # A selector may not exist on the page, which is harmless.
            pass


def first_visible(locators: Iterable[Locator], timeout: int = SHORT_TIMEOUT_MS) -> Locator | None:
    """Return the first locator that becomes visible."""
    for locator in locators:
        try:
            locator.first.wait_for(state="visible", timeout=timeout)
            return locator.first
        except PlaywrightTimeoutError:
            continue
    return None


def click_mobile_login(page: Page) -> None:
    """Click the 'Sign In with Mobile Number' control using robust fallbacks."""
    log("Waiting for the mobile-number sign-in button.")

    candidates = [
        page.get_by_role("button", name=re.compile(r"sign in with mobile number", re.I)),
        page.get_by_text(re.compile(r"sign in with mobile number", re.I), exact=True),
        page.locator("button").filter(has_text=re.compile(r"mobile number", re.I)),
        page.locator("a").filter(has_text=re.compile(r"mobile number", re.I)),
    ]

    button = first_visible(candidates, timeout=10_000)
    if button is None:
        raise RuntimeError("Could not find the 'Sign In with Mobile Number' button.")

    button.scroll_into_view_if_needed()
    button.click(timeout=15_000)
    log("Clicked 'Sign In with Mobile Number'.")


def locate_phone_input(page: Page) -> Locator:
    """Find the phone-number input using several likely selectors."""
    candidates = [
        page.get_by_role("textbox", name=re.compile(r"phone|mobile", re.I)),
        page.locator('input[type="tel"]'),
        page.locator('input[autocomplete="tel"]'),
        page.locator('input[name*="phone" i]'),
        page.locator('input[id*="phone" i]'),
        page.locator("input").first,
    ]

    phone_input = first_visible(candidates, timeout=10_000)
    if phone_input is None:
        raise RuntimeError("Could not find the phone-number input field.")
    return phone_input


def click_continue(page: Page) -> None:
    candidates = [
        page.get_by_role("button", name=re.compile(r"continue|send code|next", re.I)),
        page.locator("button").filter(has_text=re.compile(r"continue|send code|next", re.I)),
    ]
    button = first_visible(candidates, timeout=10_000)
    if button is None:
        raise RuntimeError("Could not find the Continue/Send Code button.")
    button.click(timeout=15_000)


def locate_code_inputs(page: Page) -> list[Locator]:
    """Return visible verification-code input boxes."""
    candidate_groups = [
        page.locator('input[inputmode="numeric"]'),
        page.locator('input[autocomplete="one-time-code"]'),
        page.locator('input[type="text"]'),
        page.locator("input"),
    ]

    for group in candidate_groups:
        try:
            count = group.count()
        except Exception:
            continue

        visible: list[Locator] = []
        for index in range(count):
            item = group.nth(index)
            try:
                if item.is_visible():
                    visible.append(item)
            except Exception:
                continue

        if visible:
            return visible

    return []


def fill_verification_code(page: Page, code: str) -> None:
    inputs = locate_code_inputs(page)
    if not inputs:
        raise RuntimeError("Could not find the verification-code input field(s).")

    if len(inputs) == 1:
        inputs[0].fill(code)
        return

    # Six separate single-character boxes are common.
    if len(inputs) >= len(code):
        for index, digit in enumerate(code):
            inputs[index].fill(digit)
        return

    # Fallback: click the first box and type the complete code.
    inputs[0].click()
    page.keyboard.type(code)


def click_sign_in(page: Page) -> None:
    candidates = [
        page.get_by_role("button", name=re.compile(r"^sign in$", re.I)),
        page.locator("button").filter(has_text=re.compile(r"^sign in$", re.I)),
        page.get_by_role("button", name=re.compile(r"verify|submit", re.I)),
    ]
    button = first_visible(candidates, timeout=10_000)
    if button is None:
        raise RuntimeError("Could not find the final Sign In/Verify button.")
    button.click(timeout=15_000)


def is_logged_in(page: Page) -> bool:
    """Determine whether the user appears to have an authenticated Sunrun session."""
    if "login" in page.url.lower():
        return False

    # Navigation can be mounted while a full-screen loader obscures it.
    if page.get_by_text(re.compile(r"log out", re.I)).count() or page.get_by_text(re.compile(r"hello,", re.I)).count():
        return True

    authenticated_markers = [
        page.get_by_text(re.compile(r"hello,", re.I)),
        page.get_by_text(re.compile(r"log out", re.I)),
        page.get_by_text(re.compile(r"energy produced", re.I)),
        page.get_by_text(re.compile(r"history", re.I)),
        page.locator('a[href*="/history"]'),
    ]

    for marker in authenticated_markers:
        try:
            if marker.first.is_visible(timeout=1_500):
                return True
        except Exception:
            continue

    return False


def login(page: Page, phone: str, interactive: bool) -> None:
    if not interactive:
        raise RuntimeError(
            "The saved Sunrun session expired. Sunrun requires an SMS code, so "
            "automatic sign-in cannot continue. Refresh the session with --show "
            "or place a manual production CSV in Downloads for recovery."
        )
    log("Opening the Sunrun login page.")
    page.goto(LOGIN_URL, wait_until="domcontentloaded", timeout=DEFAULT_TIMEOUT_MS)
    wait_for_loader_gone(page)

    click_mobile_login(page)

    log("Waiting for the phone-number field.")
    phone_input = locate_phone_input(page)
    phone_input.fill(phone)
    log("Entered the phone number.")

    click_continue(page)
    log("Requested the verification code.")

    log("Waiting for the verification-code screen.")
    page.wait_for_timeout(1_000)

    print("\nCheck your phone for the Sunrun verification code.")
    code = input("Enter the code Sunrun texted you: ").strip()
    if not code:
        raise RuntimeError("No verification code was entered.")

    fill_verification_code(page, code)
    click_sign_in(page)
    log("Submitted the verification code.")

    try:
        page.wait_for_url(re.compile(r"my\.sunrun\.com/(?!login).*"), timeout=DEFAULT_TIMEOUT_MS)
    except PlaywrightTimeoutError:
        pass

    wait_for_loader_gone(page)

    if not is_logged_in(page):
        raise RuntimeError("Sunrun did not confirm a successful login.")

    log("Login succeeded.")


def open_history(page: Page) -> None:
    log("Opening the Sunrun home page.")
    page.goto(PORTAL_URL, wait_until="domcontentloaded", timeout=DEFAULT_TIMEOUT_MS)
    wait_for_loader_gone(page)

    if "login" in page.url.lower():
        raise RuntimeError("Sunrun redirected back to login; the saved session is no longer valid.")

    # Opening Home first lets the portal initialize its authenticated app
    # shell before History loads.  Retry History once if its graph controls
    # are still loading rather than treating a transient portal render as a
    # download failure.
    markers = [
        page.get_by_text(re.compile(r"energy produced for", re.I)),
        page.get_by_text(re.compile(r"history", re.I)),
        page.locator('button[aria-label*="download" i]'),
        page.locator('button[title*="download" i]'),
    ]
    for visit in range(1, 3):
        log(f"Opening the History page (visit {visit}/2).")
        page.goto(HISTORY_URL, wait_until="domcontentloaded", timeout=DEFAULT_TIMEOUT_MS)
        wait_for_loader_gone(page)
        if "login" in page.url.lower():
            raise RuntimeError("Sunrun redirected back to login; the saved session is no longer valid.")
        if first_visible(markers, timeout=25_000) is not None:
            log("History page loaded.")
            return
        if visit == 1:
            log("History controls have not rendered yet; reloading the History page once.")

    raise RuntimeError("The History page opened, but its production controls were not found after a reload.")


def click_export_icon(page: Page) -> None:
    """Open the production CSV export dialog from the History-page control.

    In the current portal the ``Energy Produced for ...`` control is itself
    clickable.  Try that exact, user-visible control first.  The nearby icon
    remains as a fallback for older portal markup.
    """
    log("Looking for the production export control.")

    energy_label = page.get_by_text(
        re.compile(r"energy produced for", re.I)
    ).first

    try:
        energy_label.wait_for(state="visible", timeout=15_000)
    except PlaywrightTimeoutError:
        raise RuntimeError(
            "Could not find the 'Energy Produced for ...' label on the History page."
        )

    dialog_markers = [
        page.get_by_text(re.compile(r"confirm data selection", re.I)),
        page.get_by_text(re.compile(r"export range of solar production history", re.I)),
        page.get_by_role("button", name=re.compile(r"^export$", re.I)),
    ]

    # This is the same control a person clicks in the portal.  It avoids
    # guessing which SVG in the containing section is the export icon.
    energy_label.scroll_into_view_if_needed()
    try:
        energy_label.click(timeout=8_000)
        if first_visible(dialog_markers, timeout=5_000) is not None:
            log("Opened the export dialog from the Energy Produced control.")
            return
    except Exception:
        # Some portal versions put the click handler only on a parent element.
        pass

    # Older portal markup: search progressively larger ancestors for a nearby
    # clickable download icon.
    containers = [
        energy_label.locator("xpath=.."),
        energy_label.locator("xpath=../.."),
        energy_label.locator(
            "xpath=ancestor::*[self::div or self::section][1]"
        ),
        energy_label.locator(
            "xpath=ancestor::*[self::div or self::section][2]"
        ),
    ]

    button = None
    for container in containers:
        candidates = [
            container.get_by_role("button", name=re.compile(r"download|export", re.I)),
            container.locator('button[aria-label*="download" i]'),
            container.locator('button[title*="download" i]'),
            container.locator('[role="button"][aria-label*="download" i]'),
            container.locator("button").filter(has=container.locator("svg")),
            container.locator("a").filter(has=container.locator("svg")),
            container.locator("svg").last,
        ]

        for candidate in candidates:
            try:
                if candidate.count() and candidate.first.is_visible(timeout=750):
                    button = candidate.first
                    break
            except Exception:
                continue

        if button is not None:
            break

    if button is None:
        raise RuntimeError(
            "Found the production label, but could not find its nearby download icon."
        )

    button.scroll_into_view_if_needed()

    try:
        button.click(timeout=8_000)
    except Exception:
        # If the SVG itself is not the click target, click its nearest clickable ancestor.
        clickable_parent = button.locator(
            "xpath=ancestor-or-self::*[self::button or self::a or @role='button'][1]"
        )
        if clickable_parent.count():
            clickable_parent.first.click(timeout=5_000, force=True)
        else:
            button.click(timeout=5_000, force=True)

    marker = first_visible(dialog_markers, timeout=10_000)
    if marker is None:
        raise RuntimeError(
            "The production download control was clicked, but the export dialog did not open."
        )

    log("Opened the export dialog.")

def select_export_range(page: Page, export_range: str, debug: bool = False) -> Locator:
    """Locate Sunrun's export modal and select the requested range.

    Sunrun's modal markup varies. Instead of relying only on ReactModal class
    names, anchor on the visible "Confirm data selection" heading and walk up
    to the nearest visible container that also contains the Export button.
    """
    log("Waiting for the export modal.")

    heading_candidates = [
        page.get_by_text(re.compile(r"confirm data selection", re.I)),
        page.get_by_text(re.compile(r"export range of solar production history", re.I)),
        page.get_by_role("button", name=re.compile(r"^export$", re.I)),
    ]
    heading = first_visible(heading_candidates, timeout=12_000)

    if heading is None:
        raise RuntimeError(
            "The export dialog was opened, but none of its visible markers were found."
        )

    modal_candidates = [
        heading.locator(
            "xpath=ancestor-or-self::*[contains(@class,'ReactModal__Content')][1]"
        ),
        heading.locator("xpath=ancestor-or-self::*[@role='dialog'][1]"),
        heading.locator(
            "xpath=ancestor-or-self::div[.//button[normalize-space()='Export']][1]"
        ),
        heading.locator(
            "xpath=ancestor-or-self::*[.//*[normalize-space()='Export']][1]"
        ),
    ]

    modal = None
    for candidate in modal_candidates:
        try:
            if candidate.count() and candidate.first.is_visible(timeout=2_000):
                modal = candidate.first
                break
        except Exception:
            continue

    if modal is None:
        raise RuntimeError(
            "The export heading is visible, but its modal container could not be identified."
        )

    log("Export modal located.")

    if debug:
        input("Debug pause: export modal is open. Press Enter to continue...")

    option_pattern = re.compile(fr"^{re.escape(export_range)}$", re.I)

    try:
        selected = modal.get_by_text(option_pattern, exact=True)
        if selected.count() == 1 and selected.first.is_visible(timeout=1_000):
            log(f"Export range is already set to '{export_range}'.")
            return modal
    except Exception:
        pass

    current_range_pattern = re.compile(
        r"^(last 7 days|last 30 days|last 3 months|last 6 months|"
        r"last year|all time)$",
        re.I,
    )

    controls = [
        modal.get_by_role("combobox"),
        modal.locator('[aria-haspopup="listbox"]'),
        modal.locator('[role="button"]').filter(has_text=current_range_pattern),
        modal.locator("button").filter(has_text=current_range_pattern),
        modal.get_by_text(current_range_pattern, exact=True),
    ]

    control = first_visible(controls, timeout=8_000)
    if control is None:
        raise RuntimeError("Could not find the export-range dropdown inside the modal.")

    try:
        control.click(timeout=10_000)
    except Exception:
        try:
            control.locator("xpath=..").click(timeout=5_000, force=True)
        except Exception as exc:
            raise RuntimeError(f"Could not open the export-range dropdown: {exc}")

    options = [
        page.get_by_role("option", name=option_pattern),
        page.locator('[role="menuitem"]').filter(has_text=option_pattern),
        page.locator('[role="listbox"]').get_by_text(option_pattern, exact=True),
        page.get_by_text(option_pattern, exact=True),
    ]
    option = first_visible(options, timeout=8_000)
    if option is None:
        raise RuntimeError(f"Could not find the '{export_range}' option.")

    try:
        option.click(timeout=10_000)
    except Exception:
        option.click(timeout=5_000, force=True)

    try:
        modal.get_by_text(option_pattern, exact=True).first.wait_for(
            state="visible", timeout=5_000
        )
    except PlaywrightTimeoutError:
        raise RuntimeError(
            f"The dropdown was changed, but '{export_range}' was not confirmed."
        )

    log(f"Selected export range '{export_range}'.")

    if debug:
        input(f"Debug pause: '{export_range}' is selected. Press Enter to continue...")

    return modal

def download_daily_csv(
    page: Page,
    save_dir: Path,
    debug: bool = False,
) -> Path:
    open_history(page)

    if debug:
        input("Debug pause: History page loaded. Press Enter to open export...")

    click_export_icon(page)
    modal = select_export_range(page, EXPORT_RANGE, debug=debug)
    wait_for_loader_gone(page)

    export_button_candidates = [
        modal.get_by_role("button", name=re.compile(r"^export$", re.I)),
        modal.locator("button").filter(has_text=re.compile(r"^export$", re.I)),
        modal.locator("input[type='button'][value='Export']"),
        modal.locator("input[type='submit'][value='Export']"),
        modal.get_by_text(re.compile(r"^export$", re.I), exact=True),
    ]
    export_button = first_visible(export_button_candidates, timeout=10_000)
    if export_button is None:
        raise RuntimeError("Could not find the Export button inside the open modal.")

    if debug:
        input("Debug pause: ready to click Export. Press Enter to continue...")

    log("Clicking Export and waiting for the CSV download.")
    try:
        with page.expect_download(timeout=DEFAULT_TIMEOUT_MS) as download_info:
            try:
                export_button.click(timeout=10_000)
            except Exception:
                # The button is visibly inside the modal; force avoids React overlay hit-test issues.
                export_button.click(timeout=5_000, force=True)
    except PlaywrightTimeoutError:
        raise RuntimeError(
            "The Export button was clicked, but no browser download event was detected."
        )

    download = download_info.value
    save_dir.mkdir(parents=True, exist_ok=True)

    suggested = download.suggested_filename or "sunrun_production.csv"
    suffix = Path(suggested).suffix or ".csv"
    destination = save_dir / (
        f"sunrun_production_{datetime.now():%Y-%m-%d_%H%M%S}{suffix}"
    )

    download.save_as(destination)

    if not destination.exists():
        raise RuntimeError("The browser reported a download, but the file was not saved.")

    if destination.stat().st_size == 0:
        raise RuntimeError(f"The downloaded file is empty: {destination}")

    log(
        f"CSV saved successfully: {destination} "
        f"({destination.stat().st_size:,} bytes)"
    )

    if debug:
        input("Debug pause: download completed. Press Enter to close the browser...")

    return destination

def create_context(browser, use_saved_state: bool) -> BrowserContext:
    kwargs = {
        "accept_downloads": True,
        "viewport": {"width": 1440, "height": 1000},
    }

    if use_saved_state and STATE_FILE.exists():
        kwargs["storage_state"] = str(STATE_FILE)

    try:
        return browser.new_context(**kwargs)
    except PlaywrightTimeoutError:
        if not use_saved_state:
            raise
        log("Saved browser state timed out while opening; retrying with a clean context.")
        kwargs.pop("storage_state", None)
        return browser.new_context(**kwargs)


def main() -> None:
    parser = argparse.ArgumentParser(description="Download Sunrun production CSV")
    parser.add_argument(
        "--show",
        action="store_true",
        help="Run with a visible browser and allow SMS verification.",
    )
    parser.add_argument(
        "--headed",
        action="store_true",
        help="Run with a visible browser using the saved session, without interactive SMS input.",
    )
    parser.add_argument(
        "--out",
        default=str(DOWNLOAD_DIR),
        help="Folder in which to save downloaded CSV files.",
    )
    parser.add_argument(
        "--fresh-login",
        action="store_true",
        help="Ignore and replace the saved Sunrun session.",
    )
    parser.add_argument(
        "--debug",
        action="store_true",
        help="Pause after each major browser step for troubleshooting.",
    )
    args = parser.parse_args()

    phone = get_phone_number()
    save_dir = Path(args.out).expanduser().resolve()

    DIAGNOSTICS_DIR.mkdir(parents=True, exist_ok=True)

    with sync_playwright() as playwright:
        log("Launching Chromium.")
        browser = playwright.chromium.launch(
            headless=not (args.show or args.headed),
            slow_mo=150 if (args.show or args.headed) else 0,
        )

        use_saved_state = STATE_FILE.exists() and not args.fresh_login
        context = create_context(browser, use_saved_state=use_saved_state)
        page = context.new_page()
        page.set_default_timeout(DEFAULT_TIMEOUT_MS)

        current_step = "startup"

        try:
            current_step = "checking_saved_session"

            if use_saved_state:
                log("Checking the saved Sunrun session.")
                page.goto(HISTORY_URL, wait_until="domcontentloaded", timeout=DEFAULT_TIMEOUT_MS)
                wait_for_loader_gone(page)

            if not use_saved_state or not is_logged_in(page):
                if use_saved_state:
                    log("Saved session is no longer valid.")
                current_step = "login"
                login(page, phone, interactive=args.show)
                context.storage_state(path=str(STATE_FILE))
                log(f"Saved refreshed session to: {STATE_FILE}")
            else:
                log("Saved session is valid.")

            current_step = "download"
            csv_path = download_daily_csv(page, save_dir, debug=args.debug)
            # Sunrun can rotate authentication cookies during normal use. Keep
            # the successful session for the next unattended scheduled run.
            context.storage_state(path=str(STATE_FILE))
            log(f"Saved current session to: {STATE_FILE}")
            print(f"\nSaved: {csv_path}")

        except (PlaywrightTimeoutError, RuntimeError) as exc:
            screenshot_path, html_path = save_diagnostics(page, current_step)
            sys.exit(
                f"\nSunrun download failed during: {current_step}\n"
                f"Reason: {exc}\n\n"
                f"Screenshot: {screenshot_path}\n"
                f"HTML snapshot: {html_path}\n"
                f"Current page: {page.url}"
            )
        except Exception as exc:
            screenshot_path, html_path = save_diagnostics(page, "unexpected_error")
            sys.exit(
                f"\nUnexpected error: {type(exc).__name__}: {exc}\n\n"
                f"Screenshot: {screenshot_path}\n"
                f"HTML snapshot: {html_path}\n"
                f"Current page: {page.url}"
            )
        finally:
            context.close()
            browser.close()
            log("Browser closed.")


if __name__ == "__main__":
    main()
