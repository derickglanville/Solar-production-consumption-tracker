from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import date, datetime
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen


PROJECT_ROOT = Path(__file__).resolve().parent.parent
FIREBASE_CONFIG_PATH = PROJECT_ROOT / "firebase-config.js"

ENTRY_COLLECTION = "solar_daily_entries"
CONFIG_COLLECTION = "solar_tracker_config"
CONFIG_DOCUMENT_ID = "primary"


@dataclass
class DailySolarEntry:
    entry_date: date
    irradiance_peak_wm2: float = 0.0
    production_kwh: float = 0.0
    meter_01_import_reading: float = 0.0
    meter_02_export_reading: float = 0.0
    weather: str = "Unknown"
    temperature_f: Optional[float] = None
    temperature_high_f: Optional[float] = None
    temperature_low_f: Optional[float] = None
    humidity_pct: Optional[float] = None
    cloud_cover_pct: Optional[float] = None
    wind_mph: Optional[float] = None
    notes: str = ""
    estimated: bool = False
    lookup_source: str = ""
    created_at: Optional[str] = None
    updated_at: Optional[str] = None


@dataclass
class AppConfig:
    system_size_kw_dc: float = 18.45
    panel_count: int = 41
    inverter_count: int = 2
    activation_date: date = date(2026, 7, 10)
    smart_meter_install_date: date = date(2026, 7, 16)
    utility_name: str = "NYSEG"
    production_guarantee_kwh: float = 11141.0
    annual_home_usage_kwh: float = 17967.0
    expected_offset_pct: float = 62.0
    expected_grid_usage_kwh: float = 6826.0
    lease_term_years: int = 25
    sunrun_escalator_pct: float = 2.99
    current_electric_rate: float = 0.24
    monthly_fixed_charges: float = 19.50
    monthly_lease_payment: float = 155.00
    tree_removal_cost: float = 3090.0


def load_firebase_config(config_path: Optional[Path] = None) -> Dict[str, str]:
    target = config_path or FIREBASE_CONFIG_PATH
    text = target.read_text(encoding="utf-8")

    keys = [
        "apiKey",
        "authDomain",
        "projectId",
        "storageBucket",
        "messagingSenderId",
        "appId",
    ]

    config: Dict[str, str] = {}
    for key in keys:
        match = re.search(rf"{key}\s*:\s*\"([^\"]+)\"", text)
        if match:
            config[key] = match.group(1)

    missing = [key for key in ("apiKey", "projectId") if not config.get(key)]
    if missing:
        raise RuntimeError(f"firebase-config.js is missing required keys: {', '.join(missing)}")
    return config


def _encode_firestore_value(value: Any) -> Dict[str, Any]:
    if value is None:
        return {"nullValue": None}
    if isinstance(value, bool):
        return {"booleanValue": value}
    if isinstance(value, int) and not isinstance(value, bool):
        return {"integerValue": str(value)}
    if isinstance(value, float):
        return {"doubleValue": value}
    if isinstance(value, datetime):
        return {"timestampValue": value.isoformat() + "Z"}
    if isinstance(value, date):
        return {"stringValue": value.isoformat()}
    if isinstance(value, dict):
        return {
            "mapValue": {
                "fields": {key: _encode_firestore_value(item) for key, item in value.items()}
            }
        }
    if isinstance(value, list):
        return {"arrayValue": {"values": [_encode_firestore_value(item) for item in value]}}
    return {"stringValue": str(value)}


def _decode_firestore_value(value: Dict[str, Any]) -> Any:
    if "nullValue" in value:
        return None
    if "stringValue" in value:
        return value["stringValue"]
    if "booleanValue" in value:
        return bool(value["booleanValue"])
    if "integerValue" in value:
        return int(value["integerValue"])
    if "doubleValue" in value:
        return float(value["doubleValue"])
    if "timestampValue" in value:
        return value["timestampValue"]
    if "arrayValue" in value:
        return [_decode_firestore_value(item) for item in value.get("arrayValue", {}).get("values", [])]
    if "mapValue" in value:
        fields = value.get("mapValue", {}).get("fields", {})
        return {key: _decode_firestore_value(item) for key, item in fields.items()}
    return value


def _decode_document(document: Dict[str, Any]) -> Dict[str, Any]:
    fields = document.get("fields", {})
    return {key: _decode_firestore_value(value) for key, value in fields.items()}


class FirestoreRepository:
    def __init__(self, config: Optional[Dict[str, str]] = None):
        self.settings = config or load_firebase_config()
        self.project_id = self.settings["projectId"]
        self.api_key = self.settings["apiKey"]

    def _build_url(self, path: str, params: Optional[Dict[str, str]] = None) -> str:
        base = (
            f"https://firestore.googleapis.com/v1/projects/{self.project_id}"
            f"/databases/(default)/documents/{path}"
        )
        query = {"key": self.api_key}
        if params:
            query.update(params)
        return f"{base}?{urlencode(query, doseq=True)}"

    def _request(
        self,
        method: str,
        path: str,
        params: Optional[Dict[str, str]] = None,
        payload: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        body = None
        headers = {"Accept": "application/json"}
        if payload is not None:
            body = json.dumps(payload).encode("utf-8")
            headers["Content-Type"] = "application/json"

        request = Request(
            self._build_url(path, params),
            data=body,
            headers=headers,
            method=method,
        )

        try:
            with urlopen(request, timeout=30) as response:
                raw = response.read().decode("utf-8")
        except HTTPError as error:
            details = error.read().decode("utf-8", errors="replace")
            raise RuntimeError(
                f"Firestore {method} request failed with HTTP {error.code}: {details}"
            ) from error
        except URLError as error:
            raise RuntimeError(f"Firestore {method} request failed: {error}") from error

        return json.loads(raw) if raw else {}

    def _document_to_entry(self, document: Dict[str, Any]) -> DailySolarEntry:
        payload = _decode_document(document)
        return DailySolarEntry(
            entry_date=date.fromisoformat(payload["entry_date"]),
            irradiance_peak_wm2=float(payload.get("irradiance_peak_wm2", 0.0)),
            production_kwh=float(payload.get("production_kwh", 0.0)),
            meter_01_import_reading=float(payload.get("meter_01_import_reading", 0.0)),
            meter_02_export_reading=float(payload.get("meter_02_export_reading", 0.0)),
            weather=payload.get("weather", "Unknown"),
            temperature_f=float(payload["temperature_f"]) if payload.get("temperature_f") is not None else None,
            temperature_high_f=float(payload["temperature_high_f"]) if payload.get("temperature_high_f") is not None else None,
            temperature_low_f=float(payload["temperature_low_f"]) if payload.get("temperature_low_f") is not None else None,
            humidity_pct=float(payload["humidity_pct"]) if payload.get("humidity_pct") is not None else None,
            cloud_cover_pct=float(payload["cloud_cover_pct"]) if payload.get("cloud_cover_pct") is not None else None,
            wind_mph=float(payload["wind_mph"]) if payload.get("wind_mph") is not None else None,
            notes=payload.get("notes", ""),
            estimated=bool(payload.get("estimated", False)),
            lookup_source=payload.get("lookup_source", ""),
            created_at=payload.get("created_at"),
            updated_at=payload.get("updated_at"),
        )

    def _entry_to_fields(self, entry: DailySolarEntry) -> Dict[str, Any]:
        now = datetime.utcnow().replace(microsecond=0).isoformat() + "Z"
        created_at = entry.created_at or now
        fields = {
            "entry_date": entry.entry_date.isoformat(),
            "irradiance_peak_wm2": float(entry.irradiance_peak_wm2),
            "production_kwh": float(entry.production_kwh),
            "meter_01_import_reading": float(entry.meter_01_import_reading),
            "meter_02_export_reading": float(entry.meter_02_export_reading),
            "weather": entry.weather,
            "temperature_f": entry.temperature_f,
            "temperature_high_f": entry.temperature_high_f,
            "temperature_low_f": entry.temperature_low_f,
            "humidity_pct": entry.humidity_pct,
            "cloud_cover_pct": entry.cloud_cover_pct,
            "wind_mph": entry.wind_mph,
            "notes": entry.notes,
            "estimated": bool(entry.estimated),
            "lookup_source": entry.lookup_source,
            "created_at": created_at,
            "updated_at": now,
        }
        return {key: _encode_firestore_value(value) for key, value in fields.items()}

    def _config_to_fields(self, config: AppConfig) -> Dict[str, Any]:
        payload = {
            "system_size_kw_dc": config.system_size_kw_dc,
            "panel_count": config.panel_count,
            "inverter_count": config.inverter_count,
            "activation_date": config.activation_date.isoformat(),
            "smart_meter_install_date": config.smart_meter_install_date.isoformat(),
            "utility_name": config.utility_name,
            "production_guarantee_kwh": config.production_guarantee_kwh,
            "annual_home_usage_kwh": config.annual_home_usage_kwh,
            "expected_offset_pct": config.expected_offset_pct,
            "expected_grid_usage_kwh": config.expected_grid_usage_kwh,
            "lease_term_years": config.lease_term_years,
            "sunrun_escalator_pct": config.sunrun_escalator_pct,
            "current_electric_rate": config.current_electric_rate,
            "monthly_fixed_charges": config.monthly_fixed_charges,
            "monthly_lease_payment": config.monthly_lease_payment,
            "tree_removal_cost": config.tree_removal_cost,
        }
        return {key: _encode_firestore_value(value) for key, value in payload.items()}

    def _document_to_config(self, document: Dict[str, Any]) -> AppConfig:
        payload = _decode_document(document)
        return AppConfig(
            system_size_kw_dc=float(payload.get("system_size_kw_dc", 18.45)),
            panel_count=int(payload.get("panel_count", 41)),
            inverter_count=int(payload.get("inverter_count", 2)),
            activation_date=date.fromisoformat(payload.get("activation_date", "2026-07-10")),
            smart_meter_install_date=date.fromisoformat(
                payload.get("smart_meter_install_date", "2026-07-16")
            ),
            utility_name=payload.get("utility_name", "NYSEG"),
            production_guarantee_kwh=float(payload.get("production_guarantee_kwh", 11141.0)),
            annual_home_usage_kwh=float(payload.get("annual_home_usage_kwh", 17967.0)),
            expected_offset_pct=float(payload.get("expected_offset_pct", 62.0)),
            expected_grid_usage_kwh=float(payload.get("expected_grid_usage_kwh", 6826.0)),
            lease_term_years=int(payload.get("lease_term_years", 25)),
            sunrun_escalator_pct=float(payload.get("sunrun_escalator_pct", 2.99)),
            current_electric_rate=float(payload.get("current_electric_rate", 0.24)),
            monthly_fixed_charges=float(payload.get("monthly_fixed_charges", 19.50)),
            monthly_lease_payment=float(payload.get("monthly_lease_payment", 155.00)),
            tree_removal_cost=float(payload.get("tree_removal_cost", 3090.0)),
        )

    def list_entries(self) -> List[DailySolarEntry]:
        response = self._request("GET", ENTRY_COLLECTION)
        documents = response.get("documents", [])
        entries = [self._document_to_entry(document) for document in documents]
        entries.sort(key=lambda item: item.entry_date)
        return entries

    def get_entry(self, entry_date: date) -> Optional[DailySolarEntry]:
        try:
            document = self._request("GET", f"{ENTRY_COLLECTION}/{entry_date.isoformat()}")
        except RuntimeError as error:
            if "HTTP 404" in str(error):
                return None
            raise
        return self._document_to_entry(document)

    def save_entry(self, entry: DailySolarEntry) -> None:
        payload = {"fields": self._entry_to_fields(entry)}
        self._request(
            "PATCH",
            f"{ENTRY_COLLECTION}/{entry.entry_date.isoformat()}",
            payload=payload,
        )

    def get_config(self) -> AppConfig:
        try:
            document = self._request("GET", f"{CONFIG_COLLECTION}/{CONFIG_DOCUMENT_ID}")
        except RuntimeError as error:
            if "HTTP 404" in str(error):
                return AppConfig()
            raise
        return self._document_to_config(document)

    def config_exists(self) -> bool:
        try:
            self._request("GET", f"{CONFIG_COLLECTION}/{CONFIG_DOCUMENT_ID}")
            return True
        except RuntimeError as error:
            if "HTTP 404" in str(error):
                return False
            raise

    def save_config(self, config: AppConfig) -> None:
        payload = {"fields": self._config_to_fields(config)}
        self._request(
            "PATCH",
            f"{CONFIG_COLLECTION}/{CONFIG_DOCUMENT_ID}",
            payload=payload,
        )
