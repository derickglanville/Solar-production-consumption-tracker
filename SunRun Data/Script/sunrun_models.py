from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import Optional


@dataclass
class ScriptResult:
    name: str
    started: datetime
    finished: datetime
    returncode: int
    stdout: str
    stderr: str

    @property
    def elapsed_seconds(self) -> float:
        return (self.finished - self.started).total_seconds()


@dataclass
class ProductionRow:
    date: str
    produced: float
    meter: float


@dataclass
class WeatherSummary:
    available: bool
    condition: str
    high_temperature_f: Optional[float]
    low_temperature_f: Optional[float]
    precipitation_probability_percent: Optional[float]
    humidity_percent: Optional[float]
    wind_mph: Optional[float]
    solar_radiation_w_m2: Optional[float]
    source_note: str


@dataclass
class EnergyMetrics:
    date: str
    production_kwh: Optional[float]
    daily_import_kwh: Optional[float]
    daily_export_kwh: Optional[float]
    self_consumed_kwh: Optional[float]
    home_consumption_kwh: Optional[float]
    net_grid_kwh: Optional[float]
    self_consumption_percent: Optional[float]
    export_percent: Optional[float]
    solar_coverage_percent: Optional[float]
    grid_dependence_percent: Optional[float]
