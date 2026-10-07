"""
Run_NYSEG_File_Download.py - Download NYSEG usage CSV (07/01/2026 -> today) via Playwright.

Credentials: read from Login Info\\Login.txt (lines: username=... and password=...)

Run:
    python Run_NYSEG_File_Download.py                    # visible, installed Chrome
    python Run_NYSEG_File_Download.py --channel chromium # Playwright's bundled Chromium
    python Run_NYSEG_File_Download.py --channel msedge   # Microsoft Edge
    add --headless to hide the window (for Task Scheduler)
"""

import argparse
import json
import os
import re
import sys
import time
from datetime import date, datetime
from pathlib import Path

from playwright.sync_api import sync_playwright

START_URL = "https://energymanager.nyseg.com/insights"
START_DATE = "07/01/2026"
OUT_DIR = Path(r"C:\Software Developement\ChatGPT Codex\Solar Energy - SunRun\SunRun Data")
OUT_FILE = "NYSEG_Daily_Usage_Data.csv"
TMP_FILE = OUT_FILE + ".tmp"
ACTIVITY_LOG = OUT_DIR / "nyseg-daily-sync.log"
STATUS_FILE = OUT_DIR / "nyseg-daily-sync-status.json"
PROCESS_FILE = OUT_DIR / "nyseg-daily-sync-process.json"

LINK_RE = re.compile(r"download my energy use data", re.I)
USER_SEL = (
    'input[type="email"], input[autocomplete="username"], '
    'input[name*="user" i], input[id*="user" i], input[name*="email" i], '
    'input[type="text"]'
)
PASS_SEL = 'input[type="password"]'
CRED_FILE = Path(r"C:\Software Developement\ChatGPT Codex\Solar Energy - SunRun\NYSEG Download Script\Login Info\Login.txt")

# Shared state filled in by the download event handler
STATE = {"saved": False, "error": None}


def log(msg):
    line = f"[nyseg] {msg}"
    print(line, flush=True)
    # Make direct PowerShell runs visible in the tracker activity panel too.
    try:
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        with ACTIVITY_LOG.open("a", encoding="utf-8", newline="\n") as handle:
            handle.write(line + "\n")
    except OSError:
        pass

def write_activity_status(status: str, started_at: str, *, error: str = "") -> None:
    payload = {
        "status": status,
        "operation": "download",
        "started_at": started_at,
        "completed_at": datetime.now().astimezone().isoformat(timespec="seconds"),
        "saved_records": 0,
    }
    if error:
        payload["error"] = error
    try:
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        STATUS_FILE.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    except OSError:
        pass


def clear_process_marker() -> None:
    try:
        PROCESS_FILE.unlink()
    except FileNotFoundError:
        pass


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


# ---------- credentials ------------------------------------------------------
def load_credentials():
    """Read username/password from Login.txt (lines of the form key=value)."""
    if not CRED_FILE.exists():
        sys.exit(f"Login file not found: {CRED_FILE}")
    creds = {}
    for line in CRED_FILE.read_text(encoding="utf-8-sig").splitlines():
        if "=" not in line:
            continue
        key, value = line.split("=", 1)          # split on the FIRST '=' only
        value = value.strip()
        # Accept both  username=abc  and  username="abc"  (strip one pair of wrapping quotes)
        if len(value) >= 2 and value[0] == value[-1] and value[0] in ("\"", "'"):
            value = value[1:-1]
        creds[key.strip().lower()] = value
    user, pwd = creds.get("username"), creds.get("password")
    if not user or not pwd:
        sys.exit(f"Login.txt must contain username=... and password=... lines: {CRED_FILE}")
    return user, pwd


# ---------- download event handling -----------------------------------------
def on_download(download):
    """Runs the moment a download starts, on ANY tab. Saves it immediately."""
    try:
        OUT_DIR.mkdir(parents=True, exist_ok=True)
        tmp = OUT_DIR / TMP_FILE
        log(f"Step 5/6: Download started: {download.suggested_filename}")
        download.save_as(str(tmp))
        STATE["saved"] = True
        log("Step 6/6: Download CSV saved to the temporary file.")
    except Exception as e:
        STATE["error"] = str(e)
        log(f"Download save error: {e}")


def hook_page(page):
    page.on("download", on_download)


# ---------- login ------------------------------------------------------------
ERR_RE = re.compile(r"does not match our records|account.{0,40}locked|too many (failed )?attempts", re.I)


def first_visible(page, selector):
    """Return the first VISIBLE element matching selector, or None."""
    try:
        loc = page.locator(selector)
        for i in range(loc.count()):
            item = loc.nth(i)
            if item.is_visible():
                return item
    except Exception:
        pass
    return None


def login_error_visible(page):
    try:
        loc = page.get_by_text(ERR_RE).first
        return loc.count() > 0 and loc.is_visible()
    except Exception:
        return False


def ensure_logged_in(page, user, pwd, timeout=150):
    """Handles both a one-screen login (UserID + Password together) and a two-step login.
    Submits credentials at most once per step and STOPS if NYSEG rejects them,
    so repeated runs can't trigger an account lockout."""
    deadline = time.time() + timeout
    user_done = pass_done = False

    while time.time() < deadline:
        dismiss_banners(page)

        if find_download_link(page):
            log("Step 2/6: NYSEG Insights is ready and signed in.")
            return

        if login_error_visible(page):
            raise RuntimeError(
                "NYSEG rejected the login (UserID/password not accepted). Not retrying, "
                "to avoid locking the account. Check Login.txt and run once visibly."
            )

        pass_box = first_visible(page, PASS_SEL)
        user_box = first_visible(page, USER_SEL)

        if pass_box is not None and not pass_done:
            log(f"Login form: UserID field {'present' if user_box else 'absent'}, password field present.")
            if user_box is not None:
                log("Entering username...")
                user_box.fill(user)
            log("Entering password...")
            pass_box.fill(pwd)
            click_submit(page)
            pass_done = True
            page.wait_for_timeout(5000)
            continue

        if user_box is not None and pass_box is None and not user_done:
            log("Entering username (two-step login)...")
            user_box.fill(user)
            click_submit(page)
            user_done = True
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


def download_usage(page, keepalive) -> Path:
    link = find_download_link(page)
    if not link:
        raise RuntimeError("Download link not found.")
    log("Step 3/6: Opening the NYSEG download page...")
    link.scroll_into_view_if_needed()
    link.click()
    page.wait_for_load_state("domcontentloaded")
    page.get_by_text("Download Your Data").first.wait_for(timeout=30_000)

    page.get_by_label(re.compile(r"^Usage$", re.I)).check()
    page.get_by_label(re.compile(r"^Custom$", re.I)).check()

    end_date = date.today().strftime("%m/%d/%Y")
    log(f"Step 4/6: Setting the CSV date range: {START_DATE} -> {end_date}")
    set_date_field(page, "Start date", START_DATE)
    set_date_field(page, "End date", end_date)

    page.get_by_label(re.compile(r"^CSV$", re.I)).check()

    btn = page.get_by_role("button", name=re.compile(r"download|export", re.I)).last
    btn.scroll_into_view_if_needed()
    log("Step 5/6: Requesting the NYSEG CSV download...")
    btn.click()

    # Poll using the spare tab, so events still process even if the main page closes
    deadline = time.time() + 90
    while time.time() < deadline:
        if STATE["saved"]:
            break
        if STATE["error"]:
            raise RuntimeError(f"Download failed: {STATE['error']}")
        keepalive.wait_for_timeout(500)
    else:
        raise RuntimeError("No download received within 90 seconds.")

    tmp = OUT_DIR / TMP_FILE
    dest = OUT_DIR / OUT_FILE
    if not tmp.exists() or tmp.stat().st_size == 0:
        raise RuntimeError("Downloaded file is missing or empty.")
    os.replace(tmp, dest)
    return dest


# ---------- main -------------------------------------------------------------
def build_launch_kwargs(args):
    # Separate profile per browser so sessions don't clash
    profile = Path.home() / f".nyseg_profile_{args.channel}"

    chrome_args = ["--disable-blink-features=AutomationControlled"]
    if args.headless:
        chrome_args += [
            "--headless=new",        # modern headless
            "--disable-http2",       # sidesteps the HTTP/2 reset error
        ]
    elif args.offscreen:
        # Normal (headed) window parked far off-screen: not visible, but downloads
        # behave exactly like a regular visible run.
        chrome_args += [
            "--window-position=-32000,-32000",
            "--window-size=1280,1000",
            "--disable-backgrounding-occluded-windows",
            "--disable-renderer-backgrounding",
            "--disable-background-timer-throttling",
        ]

    launch_kwargs = dict(
        user_data_dir=str(profile),
        headless=False,              # headless is handled by the Chrome flag above
        accept_downloads=True,
        viewport={"width": 1280, "height": 1000},
        args=chrome_args,
    )
    if args.channel != "chromium":
        launch_kwargs["channel"] = args.channel
    return launch_kwargs


def run_once(args, user, pwd):
    """One full attempt with a fresh browser. Returns True on success."""
    STATE["saved"] = False
    STATE["error"] = None
    stale = OUT_DIR / TMP_FILE
    try:
        if stale.exists():
            stale.unlink()
    except Exception:
        pass

    ok = False
    with sync_playwright() as p:
        ctx = p.chromium.launch_persistent_context(**build_launch_kwargs(args))

        # Catch downloads on every tab, including popups
        ctx.on("page", hook_page)
        for pg in ctx.pages:
            hook_page(pg)

        page = ctx.pages[0] if ctx.pages else ctx.new_page()
        keepalive = ctx.new_page()          # spare blank tab that stays open
        keepalive.goto("about:blank")
        page.bring_to_front()
        page.set_default_timeout(30_000)

        try:
            try:
                page.goto(START_URL, wait_until="commit", timeout=60_000)
            except Exception as nav_err:
                log(f"Initial navigation slow ({type(nav_err).__name__}); continuing anyway...")
            log(f"Step 1/6: Opened NYSEG Insights: {page.url[:90]}")
            ensure_logged_in(page, user, pwd)
            path = download_usage(page, keepalive)
            log(f"Step 6/6: NYSEG CSV saved: {path.resolve()}")
            ok = True
        except Exception as e:
            log(f"FAILED: {e}")
            try:
                shot_page = next((pg for pg in ctx.pages if pg != keepalive and not pg.is_closed()), None)
                if shot_page:
                    log(f"URL:   {shot_page.url[:90]}")
                    try:
                        shot_page.screenshot(path="nyseg_error.png", timeout=10_000)
                        log("Saved nyseg_error.png")
                    except Exception as se:
                        log(f"Screenshot failed (page not rendering): {type(se).__name__}")
                    try:
                        Path("nyseg_error.html").write_text(shot_page.content(), encoding="utf-8")
                        log("Saved nyseg_error.html")
                    except Exception as he:
                        log(f"HTML capture failed: {type(he).__name__}")
                else:
                    log("No open page left to capture - the browser closed unexpectedly.")
            except Exception as e2:
                log(f"Could not capture debug info: {e2}")
        finally:
            try:
                ctx.close()
            except Exception:
                pass                         # already closed - nothing to clean up
    return ok


def main():
    ap = argparse.ArgumentParser()
    mode = ap.add_mutually_exclusive_group()
    mode.add_argument("--headless", action="store_true", help="Chrome's hidden (headless) mode")
    mode.add_argument("--offscreen", action="store_true",
                      help="normal window parked off-screen (most reliable way to run unseen)")
    ap.add_argument("--channel", default="chrome", help="chrome | msedge | chromium")
    ap.add_argument("--retries", type=int, default=3, help="attempts before giving up (default 3)")
    ap.add_argument("--workflow-step", action="store_true", help="Let the parent daily workflow manage the final status.")
    args = ap.parse_args()

    started_at = datetime.now().astimezone().isoformat(timespec="seconds")
    user, pwd = load_credentials()

    for attempt in range(1, args.retries + 1):
        log(f"Attempt {attempt} of {args.retries}")
        if run_once(args, user, pwd):
            if args.workflow_step:
                return 0
            write_activity_status("success", started_at)
            clear_process_marker()
            return 0
        if attempt < args.retries:
            log("Retrying with a fresh browser in 10 seconds...")
            time.sleep(10)

    error = "NYSEG_File_Download_Test.py could not download the CSV."
    log("All attempts failed.")
    if args.workflow_step:
        return 1
    write_activity_status("failed", started_at, error=error)
    clear_process_marker()
    return 1


if __name__ == "__main__":
    raise SystemExit(main())
