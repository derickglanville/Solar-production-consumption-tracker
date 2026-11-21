"""
Copy Daily File From Sunrun.py

Copies the newest Sunrun production CSV created by sunrun_download_v7.py
from the Script\downloads folder to the SunRun Data folder.

Source folder:
    C:\Software Developement\ChatGPT Codex\Solar Energy - SunRun
    \SunRun Data\Script\downloads

Destination folder:
    C:\Software Developement\ChatGPT Codex\Solar Energy - SunRun
    \SunRun Data

Destination filename:
    Sunrun_Daily_Production_Data.csv
"""

from __future__ import annotations

import shutil
import sys
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
SOURCE_DIR = SCRIPT_DIR / "downloads"
DESTINATION_DIR = SCRIPT_DIR.parent
DESTINATION_FILE = DESTINATION_DIR / "Sunrun_Daily_Production_Data.csv"

SOURCE_PATTERN = "sunrun_production_*.csv"


class CopyError(RuntimeError):
    """Raised when the expected Sunrun CSV cannot be copied safely."""


def newest_source_file() -> Path:
    if not SOURCE_DIR.is_dir():
        raise CopyError(f"Source folder does not exist: {SOURCE_DIR}")

    candidates = [
        path
        for path in SOURCE_DIR.glob(SOURCE_PATTERN)
        if path.is_file() and path.stat().st_size > 0
    ]

    if not candidates:
        raise CopyError(
            f"No nonempty files matching '{SOURCE_PATTERN}' were found in: "
            f"{SOURCE_DIR}"
        )

    return max(candidates, key=lambda path: path.stat().st_mtime)


def copy_latest_file() -> Path:
    source_file = newest_source_file()
    DESTINATION_DIR.mkdir(parents=True, exist_ok=True)

    temporary_file = DESTINATION_FILE.with_suffix(".csv.tmp")

    try:
        shutil.copy2(source_file, temporary_file)

        if not temporary_file.exists():
            raise CopyError(
                f"The temporary copy was not created: {temporary_file}"
            )

        if temporary_file.stat().st_size != source_file.stat().st_size:
            raise CopyError(
                "The copied file size does not match the source file size."
            )

        temporary_file.replace(DESTINATION_FILE)

    finally:
        if temporary_file.exists():
            temporary_file.unlink()

    if not DESTINATION_FILE.exists():
        raise CopyError(
            f"The destination file was not created: {DESTINATION_FILE}"
        )

    if DESTINATION_FILE.stat().st_size == 0:
        raise CopyError(
            f"The destination file is empty: {DESTINATION_FILE}"
        )

    print(
        f"Copied '{source_file}' -> '{DESTINATION_FILE}' "
        f"({DESTINATION_FILE.stat().st_size:,} bytes)"
    )
    return DESTINATION_FILE


def main() -> int:
    try:
        copy_latest_file()
        return 0
    except Exception as exc:
        print(f"Copy failed: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
