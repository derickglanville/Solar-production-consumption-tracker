from __future__ import annotations

import json
from copy import deepcopy
from pathlib import Path
from typing import Any, Dict, List


ROOT = Path(__file__).resolve().parent.parent
REFERENCE_DATA_DIRECTORY = ROOT / "Reference Data"
LIGHT_BULBS_PATH = REFERENCE_DATA_DIRECTORY / "light_bulbs.json"
ELECTRICITY_USAGE_PATH = REFERENCE_DATA_DIRECTORY / "electricity_usage.json"
CIRCUIT_BREAKERS_PATH = REFERENCE_DATA_DIRECTORY / "circuit_breakers.json"


LIGHT_BULBS_DEFAULT: Dict[str, Any] = {
    "title": "Household Light Bulb Inventory",
    "source_file": "Light bulbs.numbers",
    "records": [
        {"room": "Office", "count": 4, "led": "Yes", "comment": ""},
        {"room": "MBR", "count": 8, "led": "Yes", "comment": ""},
        {"room": "MBR Bathroom", "count": 3, "led": "Yes", "comment": ""},
        {"room": "Upstairs Hallway Bathroom", "count": 4, "led": "Yes", "comment": ""},
        {"room": "Upstairs Hallway Lamps", "count": 4, "led": "No", "comment": "Replace with energy efficient lamp"},
        {"room": "Bottom of", "count": 0, "led": "Unknown", "comment": "Incomplete location in source file"},
        {"room": "Theo's room", "count": 1, "led": "Yes", "comment": ""},
        {"room": "Shanelle's room", "count": 3, "led": "Yes", "comment": ""},
        {"room": "Living room", "count": 2, "led": "Yes", "comment": ""},
        {"room": "Dining room", "count": 4, "led": "No", "comment": "Replace with energy efficient lamp"},
        {"room": "House entrance", "count": 2, "led": "Yes", "comment": ""},
        {"room": "Main floor bathroom", "count": 3, "led": "Yes", "comment": ""},
        {"room": "Kitchen", "count": 5, "led": "Yes", "comment": ""},
        {"room": "Family room", "count": 3, "led": "Yes", "comment": ""},
        {"room": "Stairs to basement", "count": 2, "led": "No", "comment": "Replace with energy efficient lamp"},
        {"room": "Basement", "count": 12, "led": "Yes", "comment": ""},
        {"room": "Bottom of basement stairs", "count": 1, "led": "Yes", "comment": ""},
        {"room": "Laundry room", "count": 2, "led": "Yes", "comment": ""},
        {"room": "Wine cellar", "count": 1, "led": "Yes", "comment": ""},
        {"room": "Garage", "count": 6, "led": "Yes", "comment": ""},
        {"room": "Driveway Flood light", "count": 2, "led": "Yes", "comment": ""},
        {"room": "Patio flood light", "count": 2, "led": "Unknown", "comment": "Maybe LED"},
        {"room": "Outside family room", "count": 1, "led": "Unknown", "comment": "Maybe LED"},
        {"room": "Entryway", "count": 2, "led": "Yes", "comment": ""},
    ],
}


ELECTRICITY_USAGE_DEFAULT: Dict[str, Any] = {
    "title": "Household Electricity Usage Guide",
    "source_file": "Electricity Usage.docx",
    "intro": (
        "This is a realistic 24-hour household electricity budget for the current setup. "
        "Treat it as a working model rather than a measurement, but it should help identify the largest loads."
    ),
    "typical_daily_range": "26-55 kWh/day",
    "center_estimate": "35-40 kWh/day with moderate air-conditioning use",
    "loads": [
        {"load": "Central/portable AC", "assumed_daily_use": "Several hours cycling", "estimated_kwh_day": "8-18"},
        {"load": "Refrigerator + freezer(s)", "assumed_daily_use": "24 hr cycling", "estimated_kwh_day": "2-4"},
        {"load": "Dehumidifier", "assumed_daily_use": "8-12 hr cycling", "estimated_kwh_day": "3-6"},
        {"load": "Electric dryer", "assumed_daily_use": "About 1 load", "estimated_kwh_day": "3-5"},
        {"load": "Electric stove/oven", "assumed_daily_use": "Normal cooking", "estimated_kwh_day": "2-4"},
        {"load": "Dishwasher", "assumed_daily_use": "About 1 cycle", "estimated_kwh_day": "1-2"},
        {"load": "Washing machine", "assumed_daily_use": "About 1 load", "estimated_kwh_day": "0.3-0.7"},
        {"load": "Pumps", "assumed_daily_use": "Varies greatly", "estimated_kwh_day": "1-4"},
        {"load": "TVs + computers", "assumed_daily_use": "Several hours", "estimated_kwh_day": "1.5-4"},
        {"load": "Microwave", "assumed_daily_use": "15-30 min total", "estimated_kwh_day": "0.3-0.7"},
        {"load": "Oil boiler controls/circulators", "assumed_daily_use": "Mostly hot-water duty", "estimated_kwh_day": "0.5-1.5"},
        {"load": "70 LED/CFL bulbs", "assumed_daily_use": "Normal evening use", "estimated_kwh_day": "1-2"},
        {"load": "Router + modem", "assumed_daily_use": "24 hr", "estimated_kwh_day": "0.4-0.7"},
        {"load": "Chromecast/streaming devices", "assumed_daily_use": "24 hr standby + use", "estimated_kwh_day": "0.1-0.3"},
        {"load": "Phones/iPads/Watches/chargers", "assumed_daily_use": "Normal charging", "estimated_kwh_day": "0.1-0.4"},
        {"load": "Misc. standby loads", "assumed_daily_use": "Clocks, appliances, electronics", "estimated_kwh_day": "1-3"},
    ],
    "sections": [
        {
            "title": "Example 38 kWh day",
            "body": "AC 12; refrigerators/freezers 3; dehumidifier 4; dryer 4; cooking 3; dishwasher/washer 2; pumps 2; TVs/computers 3; boiler 1; lighting 1.5; networking, chargers, standby, and everything else 2.5 kWh. Roughly half can go to AC, dehumidification, and drying clothes.",
        },
        {
            "title": "Winter changes everything",
            "body": "A 1,500 W heater uses about 6 kWh in 4 hours, 12 kWh in 8 hours, 18 kWh in 12 hours, or 36 kWh in 24 hours. One electrically heated room could move the home from a 30-40 kWh/day baseline to 45-60+ kWh/day. Built-in electric baseboard heat could be larger.",
        },
        {
            "title": "Loads to investigate first",
            "body": "Focus on air conditioning, the electric-heated room, dehumidifier, dryer, refrigerators/freezers, and pumps. These six categories can plausibly explain most electricity use.",
        },
        {
            "title": "Lighting context",
            "body": "Seventy efficient bulbs are unlikely to be the main issue. At about 10 W each, all 70 on together draw about 700 W. Normal use may consume only 1-2 kWh per day, while one 1,500 W heater can consume that much in about an hour.",
        },
        {
            "title": "Solar context",
            "body": "The Sunrun annual production guarantee is 11,141 kWh, or about 30.5 kWh/day over a year. If the home averages 40-45 kWh/day, solar supplying roughly two-thirds of annual electricity is consistent with the original expectation.",
        },
        {
            "title": "Recommended next measurement",
            "body": "Use actual NYSEG M01 readings to calculate overnight base load while solar production is zero. This isolates continuous household demand before air conditioning, cooking, and dryer use are considered.",
        },
    ],
}


CIRCUIT_BREAKERS_DEFAULT: Dict[str, Any] = {
    "title": "Home Electrical Panel - Circuit Breaker Directory",
    "updated": "",
    "subtitle": "Working residential circuit map",
    "records": [],
    "key_note": "",
    "safety_note": (
        "Circuit identifications should be verified at the panel before electrical work. "
        "For 240 V equipment, both poles of the paired breaker must be treated as the same branch circuit."
    ),
}


def _load_json(path: Path, default: Dict[str, Any]) -> Dict[str, Any]:
    if not path.exists():
        return deepcopy(default)
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return deepcopy(default)
    return payload if isinstance(payload, dict) else deepcopy(default)


def _write_json(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary_path = path.with_suffix(f"{path.suffix}.tmp")
    temporary_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    temporary_path.replace(path)


def load_light_bulbs() -> Dict[str, Any]:
    return _load_json(LIGHT_BULBS_PATH, LIGHT_BULBS_DEFAULT)


def save_light_bulbs(records: List[Dict[str, Any]]) -> Dict[str, Any]:
    normalized_records = []
    for record in records:
        if not isinstance(record, dict):
            continue
        room = str(record.get("room") or "").strip()
        if not room:
            continue
        try:
            count = max(0, int(float(record.get("count") or 0)))
        except (TypeError, ValueError):
            count = 0
        led = str(record.get("led") or "Unknown").strip().title()
        if led not in {"Yes", "No", "Unknown"}:
            led = "Unknown"
        normalized_records.append(
            {
                "room": room,
                "count": count,
                "led": led,
                "comment": str(record.get("comment") or "").strip(),
            }
        )
    payload = deepcopy(LIGHT_BULBS_DEFAULT)
    payload["records"] = normalized_records
    _write_json(LIGHT_BULBS_PATH, payload)
    return payload


def load_electricity_usage() -> Dict[str, Any]:
    return _load_json(ELECTRICITY_USAGE_PATH, ELECTRICITY_USAGE_DEFAULT)


def save_electricity_usage(payload: Dict[str, Any]) -> Dict[str, Any]:
    loads = []
    for row in payload.get("loads") or []:
        if not isinstance(row, dict):
            continue
        load = str(row.get("load") or "").strip()
        if not load:
            continue
        loads.append(
            {
                "load": load,
                "assumed_daily_use": str(row.get("assumed_daily_use") or "").strip(),
                "estimated_kwh_day": str(row.get("estimated_kwh_day") or "").strip(),
            }
        )
    sections = []
    for section in payload.get("sections") or []:
        if not isinstance(section, dict):
            continue
        title = str(section.get("title") or "").strip()
        body = str(section.get("body") or "").strip()
        if title or body:
            sections.append({"title": title, "body": body})
    saved = {
        "title": str(payload.get("title") or ELECTRICITY_USAGE_DEFAULT["title"]).strip(),
        "source_file": ELECTRICITY_USAGE_DEFAULT["source_file"],
        "intro": str(payload.get("intro") or "").strip(),
        "typical_daily_range": str(payload.get("typical_daily_range") or "").strip(),
        "center_estimate": str(payload.get("center_estimate") or "").strip(),
        "loads": loads,
        "sections": sections,
    }
    _write_json(ELECTRICITY_USAGE_PATH, saved)
    return saved


def load_circuit_breakers() -> Dict[str, Any]:
    return _load_json(CIRCUIT_BREAKERS_PATH, CIRCUIT_BREAKERS_DEFAULT)


def save_circuit_breakers(payload: Dict[str, Any]) -> Dict[str, Any]:
    records = []
    for row in payload.get("records") or []:
        if not isinstance(row, dict):
            continue
        circuit = str(row.get("circuit") or "").strip()
        identification = str(row.get("identification") or "").strip()
        notes = str(row.get("notes") or "").strip()
        if circuit or identification or notes:
            records.append(
                {
                    "circuit": circuit,
                    "identification": identification,
                    "notes": notes,
                }
            )
    saved = {
        "title": str(payload.get("title") or CIRCUIT_BREAKERS_DEFAULT["title"]).strip(),
        "updated": str(payload.get("updated") or "").strip(),
        "subtitle": str(payload.get("subtitle") or "").strip(),
        "records": records,
        "key_note": str(payload.get("key_note") or "").strip(),
        "safety_note": str(payload.get("safety_note") or "").strip(),
    }
    _write_json(CIRCUIT_BREAKERS_PATH, saved)
    return saved
