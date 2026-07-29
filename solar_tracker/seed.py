from datetime import date

from .firestore import AppConfig, DailySolarEntry, FirestoreRepository


def build_sample_entries():
    return [
        DailySolarEntry(
            entry_date=date(2026, 7, 16),
            irradiance_peak_wm2=860,
            production_kwh=44.416,
            meter_01_import_reading=36,
            meter_02_export_reading=74,
            weather="Sunny",
            notes="Smart meter data starts.",
        ),
        DailySolarEntry(
            entry_date=date(2026, 7, 17),
            irradiance_peak_wm2=910,
            production_kwh=90.788,
            meter_01_import_reading=53,
            meter_02_export_reading=128,
            weather="Sunny",
            notes="Strong clear day.",
        ),
        DailySolarEntry(
            entry_date=date(2026, 7, 18),
            irradiance_peak_wm2=740,
            production_kwh=25.498,
            meter_01_import_reading=71,
            meter_02_export_reading=170,
            weather="Cloudy",
            notes="Afternoon cloud cover.",
        ),
        DailySolarEntry(
            entry_date=date(2026, 7, 19),
            irradiance_peak_wm2=802,
            production_kwh=92.862,
            meter_01_import_reading=79,
            meter_02_export_reading=207,
            weather="Sunny",
            notes="Recovered after clouds.",
        ),
        DailySolarEntry(
            entry_date=date(2026, 7, 20),
            irradiance_peak_wm2=950,
            production_kwh=94.041,
            meter_01_import_reading=82,
            meter_02_export_reading=229,
            weather="Sunny",
            notes="Excellent solar day.",
        ),
        DailySolarEntry(
            entry_date=date(2026, 7, 21),
            irradiance_peak_wm2=460,
            production_kwh=22.614,
            meter_01_import_reading=107,
            meter_02_export_reading=250,
            weather="Overcast",
            temperature_high_f=76,
            temperature_low_f=65,
            estimated=False,
            lookup_source="sunrun-csv",
            notes="Production synced from SunRun CSV. Smart meter readings remain based on recorded NYSEG history.",
        ),
        DailySolarEntry(
            entry_date=date(2026, 7, 22),
            irradiance_peak_wm2=922,
            production_kwh=78.042,
            meter_01_import_reading=126,
            meter_02_export_reading=305,
            weather="Sunny",
            temperature_high_f=79,
            temperature_low_f=66,
            estimated=False,
            lookup_source="sunrun-csv",
            notes="Production synced from SunRun CSV. Smart meter readings remain based on recorded NYSEG history.",
        ),
        DailySolarEntry(
            entry_date=date(2026, 7, 23),
            irradiance_peak_wm2=367,
            production_kwh=93.15,
            meter_01_import_reading=137.3,
            meter_02_export_reading=343.4,
            weather="Sunny",
            temperature_high_f=83,
            temperature_low_f=68,
            estimated=False,
            lookup_source="sunrun-csv",
            notes="Production synced from SunRun CSV. Smart meter readings remain based on recorded NYSEG history.",
        ),
        DailySolarEntry(
            entry_date=date(2026, 7, 24),
            irradiance_peak_wm2=460,
            production_kwh=22.614,
            meter_01_import_reading=162.3,
            meter_02_export_reading=364.4,
            weather="Overcast",
            temperature_high_f=76,
            temperature_low_f=65,
            estimated=True,
            lookup_source="pending-sunrun-analog",
            notes="Pending data from SunRun. Temporary placeholder aligned to the July 21 pattern until the SunRun CSV includes July 24.",
        ),
        DailySolarEntry(
            entry_date=date(2026, 7, 25),
            irradiance_peak_wm2=922,
            production_kwh=78.042,
            meter_01_import_reading=181.3,
            meter_02_export_reading=419.4,
            weather="Sunny",
            temperature_high_f=79,
            temperature_low_f=66,
            estimated=True,
            lookup_source="pending-sunrun-analog",
            notes="Pending data from SunRun. Temporary placeholder aligned to the July 22 pattern until the SunRun CSV includes July 25.",
        ),
    ]


def seed_initial_data(repository: FirestoreRepository):
    if not repository.config_exists():
        repository.save_config(AppConfig())

    if repository.list_entries():
        return

    for entry in build_sample_entries():
        repository.save_entry(entry)
