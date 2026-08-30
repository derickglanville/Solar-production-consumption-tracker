"""Synchronize the GitHub Pages site with the current local application."""

from __future__ import annotations

import json
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from solar_tracker import create_app
from solar_tracker.routes import build_bootstrap_data


DOCS = ROOT / "docs"
ASSET_VERSION = "20260830-sync86"

ROUTE_REPLACEMENTS = {
    'href="/"': 'href="index.html"',
    'href="/entries"': 'href="entries.html"',
    'href="/sunrun-production"': 'href="sunrun-production.html"',
    'href="/appliances"': 'href="appliances.html"',
    'href="/contract-summary"': 'href="contract-summary.html"',
    'href="/settings"': 'href="settings.html"',
    'href="/dictionary"': 'href="dictionary.html"',
    'href="/export/csv"': 'href="solar_tracker_demo_export.csv"',
}


def render_static_page(path: str) -> str:
    app = create_app()
    app.testing = True
    with app.test_client() as client:
        response = client.get(path)
        if response.status_code >= 400:
            raise RuntimeError(f"Could not render {path}: HTTP {response.status_code}")
        html = response.get_data(as_text=True)

    html = re.sub(
        r'<script>\s*window\.SOLAR_BOOTSTRAP\s*=\s*.*?</script>',
        f'<script src="assets/js/site-bootstrap.js?v={ASSET_VERSION}"></script>',
        html,
        flags=re.DOTALL,
    )
    html = re.sub(
        r'href="/static/css/styles\.css\?v=[^"]+"',
        f'href="assets/css/styles.css?v={ASSET_VERSION}"',
        html,
    )
    html = html.replace(
        'src="/static/js/appliances.js"',
        f'src="assets/js/appliances.js?v={ASSET_VERSION}"',
    )
    html = re.sub(
        r'src="/static/js/sunrun-production\.js\?v=[^"]+"',
        f'src="assets/js/sunrun-production.js?v={ASSET_VERSION}"',
        html,
    )
    html = re.sub(
        r'src="/static/js/firebase-config\.js\?v=[^"]+"',
        f'src="assets/js/firebase-config.js?v={ASSET_VERSION}"',
        html,
    )
    html = re.sub(
        r'src="/static/js/app-bundle\.js\?v=[^"]+"',
        f'src="assets/js/app-bundle.js?v={ASSET_VERSION}"',
        html,
    )
    html = html.replace(
        'src="/vendor/plotly.min.js"',
        'src="https://cdn.plot.ly/plotly-3.4.0.min.js"',
    )
    for local_href, static_href in ROUTE_REPLACEMENTS.items():
        html = html.replace(local_href, static_href)
    return "\n".join(line.rstrip() for line in html.splitlines()) + "\n"


def sync_assets() -> None:
    copies = {
        ROOT / "static" / "css" / "styles.css": DOCS / "assets" / "css" / "styles.css",
        ROOT / "static" / "js" / "app-bundle.js": DOCS / "assets" / "js" / "app-bundle.js",
        ROOT / "static" / "js" / "appliances.js": DOCS / "assets" / "js" / "appliances.js",
        ROOT / "static" / "js" / "sunrun-production.js": DOCS / "assets" / "js" / "sunrun-production.js",
        ROOT / "static" / "images" / "solar-home-side.png": DOCS / "assets" / "images" / "solar-home-side.png",
        ROOT / "static" / "images" / "solar-farm-side.png": DOCS / "assets" / "images" / "solar-farm-side.png",
    }
    for source, destination in copies.items():
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)
    legacy_module = DOCS / "assets" / "js" / "app-client.js"
    if legacy_module.exists():
        legacy_module.unlink()


def write_static_bootstrap() -> None:
    bootstrap = build_bootstrap_data()
    # A deployed static file must calculate the Yorktown date in the browser,
    # rather than freezing the date at build time.
    bootstrap.pop("tracker_today", None)
    for section in ("historical_usage", "monthly_bill", "sunrun_production"):
        if isinstance(bootstrap.get(section), dict):
            bootstrap[section].pop("source_path", None)
    payload = json.dumps(bootstrap, indent=2, sort_keys=True)
    content = (
        "window.SOLAR_STATIC_SITE = true;\n"
        'window.SOLAR_ASSET_BASE = "assets";\n'
        f"window.SOLAR_BOOTSTRAP = {payload};\n"
    )
    (DOCS / "assets" / "js" / "site-bootstrap.js").write_text(
        content,
        encoding="utf-8",
    )


def update_static_shells() -> None:
    for html_path in DOCS.glob("*.html"):
        html = html_path.read_text(encoding="utf-8")
        html = re.sub(
            r'assets/css/styles\.css\?v=[^"]+',
            f"assets/css/styles.css?v={ASSET_VERSION}",
            html,
        )
        if html_path.name == "appliances.html":
            html_path.write_text(html, encoding="utf-8")
            continue
        html = re.sub(
            r'assets/js/site-bootstrap\.js\?v=[^"]+',
            f"assets/js/site-bootstrap.js?v={ASSET_VERSION}",
            html,
        )
        html = re.sub(
            r'assets/js/firebase-config\.js\?v=[^"]+',
            f"assets/js/firebase-config.js?v={ASSET_VERSION}",
            html,
        )
        html = re.sub(
            r'<script type="module" src="assets/js/app-client\.js\?v=[^"]+"></script>',
            f'<script defer src="assets/js/app-bundle.js?v={ASSET_VERSION}"></script>',
            html,
        )
        html = re.sub(
            r'assets/js/app-bundle\.js\?v=[^"]+',
            f"assets/js/app-bundle.js?v={ASSET_VERSION}",
            html,
        )
        html_path.write_text(html, encoding="utf-8")


def main() -> None:
    sync_assets()
    write_static_bootstrap()
    static_pages = {
        "index.html": "/",
        "entries.html": "/entries",
        "sunrun-production.html": "/sunrun-production",
        "appliances.html": "/appliances",
        "contract-summary.html": "/contract-summary",
        "dictionary.html": "/dictionary",
        "settings.html": "/settings",
    }
    for filename, route in static_pages.items():
        (DOCS / filename).write_text(render_static_page(route), encoding="utf-8")
    update_static_shells()
    print(f"GitHub Pages synchronized at {DOCS}")


if __name__ == "__main__":
    main()
