from __future__ import annotations

from datetime import datetime, date


def tracker_now() -> datetime:
    return datetime.now().astimezone()


def tracker_today() -> date:
    return tracker_now().date()
