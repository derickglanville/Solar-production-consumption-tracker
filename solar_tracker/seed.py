from datetime import date

from .firestore import AppConfig, DailySolarEntry, FirestoreRepository


def build_sample_entries():
    return [
        DailySolarEntry(
            entry_date=date(2026, 7, 16),
            irradiance_peak_wm2=860,
            production_kwh=62.4,
            meter_01_import_reading=36,
            meter_02_export_reading=74,
            weather="Sunny",
            notes="Smart meter data starts.",
        ),
        DailySolarEntry(
            entry_date=date(2026, 7, 17),
            irradiance_peak_wm2=910,
            production_kwh=70.8,
            meter_01_import_reading=53,
            meter_02_export_reading=128,
            weather="Sunny",
            notes="Strong clear day.",
        ),
        DailySolarEntry(
            entry_date=date(2026, 7, 18),
            irradiance_peak_wm2=740,
            production_kwh=58.2,
            meter_01_import_reading=71,
            meter_02_export_reading=170,
            weather="Cloudy",
            notes="Afternoon cloud cover.",
        ),
        DailySolarEntry(
            entry_date=date(2026, 7, 19),
            irradiance_peak_wm2=802,
            production_kwh=63.1,
            meter_01_import_reading=79,
            meter_02_export_reading=207,
            weather="Sunny",
            notes="Recovered after clouds.",
        ),
        DailySolarEntry(
            entry_date=date(2026, 7, 20),
            irradiance_peak_wm2=950,
            production_kwh=75.0,
            meter_01_import_reading=82,
            meter_02_export_reading=229,
            weather="Sunny",
            notes="Excellent solar day.",
        ),
    ]


def seed_initial_data(repository: FirestoreRepository):
    if not repository.config_exists():
        repository.save_config(AppConfig())

    if repository.list_entries():
        return

    for entry in build_sample_entries():
        repository.save_entry(entry)
