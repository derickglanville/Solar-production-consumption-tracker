"""
nyseg_download.py - Download NYSEG usage CSV (07/01/2026 -> today) via Playwright.

Setup (Windows):
    pip install playwright
    playwright install chromium        # Chrome itself is used via channel="chrome"

Credentials: NYSEG_USER and NYSEG_PASS environment variables.

Run:
    python nyseg_download.py               # visible browser (recommended first)
    python nyseg_download.py --headless    # once it works reliably
    python nyseg_download.py --channel msedge   # if you don't have Chrome
"""

import argparse
import os
import re
import sys
import time
from datetime import date
from pathlib import Path

from playwright.sync_api import TimeoutError as PWTimeout
from playwright.sync_api import sync_playwright

START_URL = "https://energymanager.nyseg.com/insights"
START_DATE = "07/01/2026"
OUT_DIR = Path(r"C:\Software Developement\ChatGPT Codex\Solar Energy - SunRun\SunRun Data")
OUT_FILE = "NYSEG_Daily_Usage_Data.csv"
PROFILE_DIR = Path.home() / ".nyseg_profile_chrome"

LINK_RE = re.compile(r"download my energy use data", re.I)
USER_SEL = (
    'input[type="email"], input[autocomplete="username"], '
    'input[name*="user" i], input[id*="user" i], input[name*="email" i], '
    'input[type="text"]'
)
PASS_SEL = 'input[type="password"]'


def log(msg):
    print(f"[nyseg] {msg}", flush=True)


# ---------- helpers ----------------------------------------------------------
def dismiss_banners(page):
    for name in ("Accept All", "Accept", "Got it", "I agree", "Close"):
        btn = page.get_by_role("button", name=re.compile(rf"^{name}$", re.I))
        try:
            if btn.count() and btn.first.is_visible():
                btn.first.click(timeout=2000)
                log(f"Dismissed banner: {name}")
                return
        except Exception:
            pass


def find_download_link(page):
    """Search the main page and every iframe for the download link."""
    for frame in page.frames:
        try:
            loc = frame.get_by_text(LINK_RE).first
            if loc.count() and loc.is_visible():
                return loc
        except Exception:
            continue
    return None


def visible(page, selector):
    try:
        loc = page.locator(selector).first
        return loc.count() > 0 and loc.is_visible()
    except Exception:
        return False


def click_submit(page):
    for pattern in (r"sign in|log in|login", r"next|continue"):
        btn = page.get_by_role("button", name=re.compile(pattern, re.I))
        if btn.count() and btn.first.is_visible():
            btn.first.click()
            return
    page.keyboard.press("Enter")


# ---------- login ------------------------------------------------------------
def ensure_logged_in(page, user, pwd, timeout=60):
    """Wait until we can see either the download link (logged in) or a login form."""
    deadline = time.time() + timeout
    submitted_user = submitted_pass = False

    while time.time() < deadline:
        dismiss_banners(page)

        if find_download_link(page):
            log("Insights page is ready (logged in).")
            return

        if visible(page, PASS_SEL) and not submitted_pass:
            if not pwd:
                raise RuntimeError("NYSEG needs a password. Renew the saved NYSEG browser session or configure NYSEG_USER and NYSEG_PASS.")
            log("Entering password...")
            page.locator(PASS_SEL).first.fill(pwd)
            click_submit(page)
            submitted_pass = True
            page.wait_for_timeout(4000)
            continue

        if visible(page, USER_SEL) and not submitted_user and not visible(page, PASS_SEL):
            if not user:
                raise RuntimeError("NYSEG needs a username. Renew the saved NYSEG browser session or configure NYSEG_USER and NYSEG_PASS.")
            log("Entering username...")
            page.locator(USER_SEL).first.fill(user)
            # Some sites show both fields at once; if not, submit to get to step 2
            if not visible(page, PASS_SEL):
                click_submit(page)
                submitted_user = True
                page.wait_for_timeout(3000)
            continue

        page.wait_for_timeout(1500)

    log("Timed out waiting for a recognizable page. If a CAPTCHA/MFA is on screen, "
        "complete it in the browser and re-run.")
    raise RuntimeError("Could not reach the insights page after login attempt.")


# ---------- download flow ----------------------------------------------------
def set_date_field(page, label, value):
    field = page.get_by_label(label, exact=False).first
    field.click()
    field.press("Control+A")
    field.press("Backspace")
    field.type(value, delay=60)
    field.press("Tab")


def download_usage(page) -> Path:
    link = find_download_link(page)
    if not link:
        raise RuntimeError("Download link not found.")
    log("Opening download page...")
    link.scroll_into_view_if_needed()
    link.click()
    page.wait_for_load_state("domcontentloaded")
    page.get_by_text("Download Your Data").first.wait_for(timeout=30_000)

    page.get_by_label(re.compile(r"^Usage$", re.I)).check()
    page.get_by_label(re.compile(r"^Custom$", re.I)).check()

    end_date = date.today().strftime("%m/%d/%Y")
    log(f"Date range: {START_DATE} -> {end_date}")
    set_date_field(page, "Start date", START_DATE)
    set_date_field(page, "End date", end_date)

    page.get_by_label(re.compile(r"^CSV$", re.I)).check()

    btn = page.get_by_role("button", name=re.compile(r"download|export", re.I)).last
    btn.scroll_into_view_if_needed()
    log("Downloading...")
    with page.expect_download(timeout=90_000) as dl_info:
        btn.click()
    download = dl_info.value

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    dest = OUT_DIR / OUT_FILE
    tmp = OUT_DIR / (OUT_FILE + ".tmp")
    download.save_as(tmp)          # write to a temp file first...
    os.replace(tmp, dest)          # ...then swap it in, overwriting the old copy
    return dest


# ---------- main -------------------------------------------------------------
def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--headless", action="store_true", help="hide the browser window")
    ap.add_argument("--channel", default="chrome", help="chrome | msedge | chromium")
    args = ap.parse_args()

    user, pwd = os.getenv("NYSEG_USER"), os.getenv("NYSEG_PASS")
    if not user or not pwd:
        log("NYSEG credentials are not configured; using the saved Playwright browser session if it is still active.")

    launch_kwargs = dict(
        user_data_dir=str(PROFILE_DIR),
        headless=args.headless,
        accept_downloads=True,
        viewport={"width": 1280, "height": 1000},
        args=["--disable-blink-features=AutomationControlled"],
    )
    if args.channel != "chromium":
        launch_kwargs["channel"] = args.channel

    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(**launch_kwargs)
        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        page.set_default_timeout(30_000)
        try:
            page.goto(START_URL, wait_until="domcontentloaded")
            log(f"Landed on: {page.url}")
            ensure_logged_in(page, user, pwd)
            path = download_usage(page)
            log(f"Saved: {path.resolve()}")
        except Exception as e:
            log(f"FAILED: {e}")
            try:
                log(f"URL:   {page.url}")
                log(f"Title: {page.title()}")
                page.wait_for_timeout(3000)
                page.screenshot(path="nyseg_error.png")
                Path("nyseg_error.html").write_text(page.content(), encoding="utf-8")
                log("Saved nyseg_error.png and nyseg_error.html")
            except Exception as e2:
                log(f"Could not capture debug info: {e2}")
            sys.exit(1)
        finally:
            ctx.close()


if __name__ == "__main__":
    main()