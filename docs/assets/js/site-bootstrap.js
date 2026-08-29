window.SOLAR_STATIC_SITE = true;
window.SOLAR_ASSET_BASE = "assets";
window.SOLAR_BOOTSTRAP = {
  "ai_status": {
    "model": "gpt-5",
    "openai_configured": true,
    "suggested_prompts": [
      "Am I on track to hit my guarantee?",
      "What caused today's low production?",
      "Compare this month to last month.",
      "Estimate next month's production.",
      "Predict annual savings.",
      "Predict tomorrow's production.",
      "Show anomalies in my recent data.",
      "How effective is the solar usage versus the historic NYSEG baseline?",
      "Why is the bill still high if usage is low?",
      "Is one inverter underperforming?"
    ]
  },
  "default_config": {
    "activation_date": "2026-07-10",
    "annual_home_usage_kwh": 17967.0,
    "current_electric_rate": 0.24,
    "expected_grid_usage_kwh": 6826.0,
    "expected_offset_pct": 62.0,
    "inverter_count": 2,
    "lease_term_years": 25,
    "monthly_fixed_charges": 19.5,
    "monthly_lease_payment": 155.0,
    "panel_count": 41,
    "production_guarantee_kwh": 11141.0,
    "smart_meter_install_date": "2026-07-16",
    "sunrun_escalator_pct": 2.99,
    "system_size_kw_dc": 18.45,
    "tree_removal_cost": 3090.0,
    "utility_name": "NYSEG"
  },
  "historical_usage": {
    "actual_read_count": 12,
    "annualized_kwh": 18387.652173913044,
    "available": true,
    "average_monthly_kwh": 1532.304347826087,
    "calculated_read_count": 11,
    "end_date": "2026-07-01",
    "latest_kwh": 118.0,
    "maximum_kwh": 3865.0,
    "meter_label": "00265645",
    "minimum_kwh": 24.0,
    "monthly_records": [
      {
        "kwh": 1602.0,
        "read_date": "2024-09-03",
        "read_type": "NYSEG"
      },
      {
        "kwh": 875.0,
        "read_date": "2024-10-03",
        "read_type": "CALCULATED"
      },
      {
        "kwh": 24.0,
        "read_date": "2024-11-04",
        "read_type": "NYSEG"
      },
      {
        "kwh": 1778.0,
        "read_date": "2024-12-05",
        "read_type": "CALCULATED"
      },
      {
        "kwh": 2936.0,
        "read_date": "2025-01-06",
        "read_type": "NYSEG"
      },
      {
        "kwh": 561.0,
        "read_date": "2025-02-05",
        "read_type": "CALCULATED"
      },
      {
        "kwh": 2110.0,
        "read_date": "2025-03-03",
        "read_type": "NYSEG"
      },
      {
        "kwh": 1380.0,
        "read_date": "2025-04-03",
        "read_type": "CALCULATED"
      },
      {
        "kwh": 3865.0,
        "read_date": "2025-05-05",
        "read_type": "NYSEG"
      },
      {
        "kwh": 1077.0,
        "read_date": "2025-06-04",
        "read_type": "CALCULATED"
      },
      {
        "kwh": 1005.0,
        "read_date": "2025-07-03",
        "read_type": "NYSEG"
      },
      {
        "kwh": 1087.0,
        "read_date": "2025-08-05",
        "read_type": "CALCULATED"
      },
      {
        "kwh": 1210.0,
        "read_date": "2025-09-03",
        "read_type": "NYSEG"
      },
      {
        "kwh": 1002.0,
        "read_date": "2025-10-06",
        "read_type": "CALCULATED"
      },
      {
        "kwh": 523.0,
        "read_date": "2025-11-04",
        "read_type": "NYSEG"
      },
      {
        "kwh": 2296.0,
        "read_date": "2025-12-05",
        "read_type": "CALCULATED"
      },
      {
        "kwh": 1955.0,
        "read_date": "2026-01-06",
        "read_type": "NYSEG"
      },
      {
        "kwh": 1419.0,
        "read_date": "2026-02-04",
        "read_type": "CALCULATED"
      },
      {
        "kwh": 3160.0,
        "read_date": "2026-03-03",
        "read_type": "NYSEG"
      },
      {
        "kwh": 1874.0,
        "read_date": "2026-04-06",
        "read_type": "CALCULATED"
      },
      {
        "kwh": 1473.0,
        "read_date": "2026-05-05",
        "read_type": "NYSEG"
      },
      {
        "kwh": 1913.0,
        "read_date": "2026-06-04",
        "read_type": "CALCULATED"
      },
      {
        "kwh": 118.0,
        "read_date": "2026-07-01",
        "read_type": "NYSEG"
      }
    ],
    "notes": [
      "Source includes 23 monthly-style NYSEG history rows from 2024-09-03 through 2026-07-01.",
      "12 reads are marked NYSEG and 11 are marked CALCULATED.",
      "This baseline can be used to compare historic utility consumption against the solar-era dashboard estimates and contract assumptions."
    ],
    "record_count": 23,
    "start_date": "2024-09-03",
    "total_kwh": 35243.0,
    "versus_expected_annual_kwh": 420.65217391304395,
    "versus_expected_annual_pct": 2.3412488112263814
  },
  "monthly_bill": {
    "amount_due": 516.9,
    "available": true,
    "average_daily_use_kwh": 4.0,
    "balance_forward": -1.05,
    "billing_end_date": "2026-07-01",
    "billing_start_date": "2026-06-05",
    "budget_billing_amount": 507.0,
    "current_usage_kwh": 118.0,
    "days_in_period": 27,
    "display_name": "July 2027.pdf",
    "miscellaneous_charges": 0.95,
    "notes": [
      "The PDF filename says July 2027, but the bill content shows a statement date of July 07, 2026.",
      "This bill is being used as a monthly bill reference source for dashboard context.",
      "The bill shows only 118 kWh over a 27-day period, which is much lower than the same period one year earlier and should be interpreted carefully alongside solar production and export data."
    ],
    "payment_agreement_amount": 10.0,
    "prior_year_average_daily_use_kwh": 35.0,
    "statement_date": "2026-07-07",
    "total_adjustments": -1151.52,
    "total_electricity_cost": 45.76,
    "total_energy_charges": 45.76
  },
  "sample_entries": [
    {
      "cloud_cover_pct": null,
      "created_at": null,
      "entry_date": "2026-07-16",
      "estimated": false,
      "humidity_pct": null,
      "irradiance_peak_wm2": 860,
      "lookup_source": "",
      "meter_01_import_reading": 36,
      "meter_02_export_reading": 74,
      "notes": "Smart meter data starts.",
      "production_kwh": 44.416,
      "temperature_f": null,
      "temperature_high_f": null,
      "temperature_low_f": null,
      "updated_at": null,
      "weather": "Sunny",
      "wind_mph": null
    },
    {
      "cloud_cover_pct": null,
      "created_at": null,
      "entry_date": "2026-07-17",
      "estimated": false,
      "humidity_pct": null,
      "irradiance_peak_wm2": 910,
      "lookup_source": "",
      "meter_01_import_reading": 53,
      "meter_02_export_reading": 128,
      "notes": "Strong clear day.",
      "production_kwh": 90.788,
      "temperature_f": null,
      "temperature_high_f": null,
      "temperature_low_f": null,
      "updated_at": null,
      "weather": "Sunny",
      "wind_mph": null
    },
    {
      "cloud_cover_pct": null,
      "created_at": null,
      "entry_date": "2026-07-18",
      "estimated": false,
      "humidity_pct": null,
      "irradiance_peak_wm2": 740,
      "lookup_source": "",
      "meter_01_import_reading": 71,
      "meter_02_export_reading": 170,
      "notes": "Afternoon cloud cover.",
      "production_kwh": 25.498,
      "temperature_f": null,
      "temperature_high_f": null,
      "temperature_low_f": null,
      "updated_at": null,
      "weather": "Cloudy",
      "wind_mph": null
    },
    {
      "cloud_cover_pct": null,
      "created_at": null,
      "entry_date": "2026-07-19",
      "estimated": false,
      "humidity_pct": null,
      "irradiance_peak_wm2": 802,
      "lookup_source": "",
      "meter_01_import_reading": 79,
      "meter_02_export_reading": 207,
      "notes": "Recovered after clouds.",
      "production_kwh": 92.862,
      "temperature_f": null,
      "temperature_high_f": null,
      "temperature_low_f": null,
      "updated_at": null,
      "weather": "Sunny",
      "wind_mph": null
    },
    {
      "cloud_cover_pct": null,
      "created_at": null,
      "entry_date": "2026-07-20",
      "estimated": false,
      "humidity_pct": null,
      "irradiance_peak_wm2": 950,
      "lookup_source": "",
      "meter_01_import_reading": 82,
      "meter_02_export_reading": 229,
      "notes": "Excellent solar day.",
      "production_kwh": 94.041,
      "temperature_f": null,
      "temperature_high_f": null,
      "temperature_low_f": null,
      "updated_at": null,
      "weather": "Sunny",
      "wind_mph": null
    },
    {
      "cloud_cover_pct": null,
      "created_at": null,
      "entry_date": "2026-07-21",
      "estimated": false,
      "humidity_pct": null,
      "irradiance_peak_wm2": 460,
      "lookup_source": "sunrun-csv",
      "meter_01_import_reading": 107,
      "meter_02_export_reading": 250,
      "notes": "Production synced from SunRun CSV. Smart meter readings remain based on recorded NYSEG history.",
      "production_kwh": 22.614,
      "temperature_f": null,
      "temperature_high_f": 76,
      "temperature_low_f": 65,
      "updated_at": null,
      "weather": "Overcast",
      "wind_mph": null
    },
    {
      "cloud_cover_pct": null,
      "created_at": null,
      "entry_date": "2026-07-22",
      "estimated": false,
      "humidity_pct": null,
      "irradiance_peak_wm2": 922,
      "lookup_source": "sunrun-csv",
      "meter_01_import_reading": 126,
      "meter_02_export_reading": 305,
      "notes": "Production synced from SunRun CSV. Smart meter readings remain based on recorded NYSEG history.",
      "production_kwh": 78.042,
      "temperature_f": null,
      "temperature_high_f": 79,
      "temperature_low_f": 66,
      "updated_at": null,
      "weather": "Sunny",
      "wind_mph": null
    },
    {
      "cloud_cover_pct": null,
      "created_at": null,
      "entry_date": "2026-07-23",
      "estimated": false,
      "humidity_pct": null,
      "irradiance_peak_wm2": 367,
      "lookup_source": "sunrun-csv",
      "meter_01_import_reading": 137.3,
      "meter_02_export_reading": 343.4,
      "notes": "Production synced from SunRun CSV. Smart meter readings remain based on recorded NYSEG history.",
      "production_kwh": 93.15,
      "temperature_f": null,
      "temperature_high_f": 83,
      "temperature_low_f": 68,
      "updated_at": null,
      "weather": "Sunny",
      "wind_mph": null
    },
    {
      "cloud_cover_pct": null,
      "created_at": null,
      "entry_date": "2026-07-24",
      "estimated": true,
      "humidity_pct": null,
      "irradiance_peak_wm2": 460,
      "lookup_source": "pending-sunrun-analog",
      "meter_01_import_reading": 162.3,
      "meter_02_export_reading": 364.4,
      "notes": "Pending data from SunRun. Temporary placeholder aligned to the July 21 pattern until the SunRun CSV includes July 24.",
      "production_kwh": 22.614,
      "temperature_f": null,
      "temperature_high_f": 76,
      "temperature_low_f": 65,
      "updated_at": null,
      "weather": "Overcast",
      "wind_mph": null
    },
    {
      "cloud_cover_pct": null,
      "created_at": null,
      "entry_date": "2026-07-25",
      "estimated": true,
      "humidity_pct": null,
      "irradiance_peak_wm2": 922,
      "lookup_source": "pending-sunrun-analog",
      "meter_01_import_reading": 181.3,
      "meter_02_export_reading": 419.4,
      "notes": "Pending data from SunRun. Temporary placeholder aligned to the July 22 pattern until the SunRun CSV includes July 25.",
      "production_kwh": 78.042,
      "temperature_f": null,
      "temperature_high_f": 79,
      "temperature_low_f": 66,
      "updated_at": null,
      "weather": "Sunny",
      "wind_mph": null
    }
  ],
  "sunrun_production": {
    "available": true,
    "by_date": {
      "2026-07-10": {
        "available": true,
        "end_of_day_meter_kwh": 59.369,
        "entry_date": "2026-07-10",
        "production_kwh": 59.369
      },
      "2026-07-11": {
        "available": true,
        "end_of_day_meter_kwh": 133.199,
        "entry_date": "2026-07-11",
        "production_kwh": 73.83
      },
      "2026-07-12": {
        "available": true,
        "end_of_day_meter_kwh": 214.085,
        "entry_date": "2026-07-12",
        "production_kwh": 80.886
      },
      "2026-07-13": {
        "available": true,
        "end_of_day_meter_kwh": 285.192,
        "entry_date": "2026-07-13",
        "production_kwh": 71.107
      },
      "2026-07-14": {
        "available": true,
        "end_of_day_meter_kwh": 362.815,
        "entry_date": "2026-07-14",
        "production_kwh": 77.623
      },
      "2026-07-15": {
        "available": true,
        "end_of_day_meter_kwh": 412.074,
        "entry_date": "2026-07-15",
        "production_kwh": 49.259
      },
      "2026-07-16": {
        "available": true,
        "end_of_day_meter_kwh": 456.49,
        "entry_date": "2026-07-16",
        "production_kwh": 44.416
      },
      "2026-07-17": {
        "available": true,
        "end_of_day_meter_kwh": 547.278,
        "entry_date": "2026-07-17",
        "production_kwh": 90.788
      },
      "2026-07-18": {
        "available": true,
        "end_of_day_meter_kwh": 572.776,
        "entry_date": "2026-07-18",
        "production_kwh": 25.498
      },
      "2026-07-19": {
        "available": true,
        "end_of_day_meter_kwh": 665.638,
        "entry_date": "2026-07-19",
        "production_kwh": 92.862
      },
      "2026-07-20": {
        "available": true,
        "end_of_day_meter_kwh": 759.679,
        "entry_date": "2026-07-20",
        "production_kwh": 94.041
      },
      "2026-07-21": {
        "available": true,
        "end_of_day_meter_kwh": 782.293,
        "entry_date": "2026-07-21",
        "production_kwh": 22.614
      },
      "2026-07-22": {
        "available": true,
        "end_of_day_meter_kwh": 860.335,
        "entry_date": "2026-07-22",
        "production_kwh": 78.042
      },
      "2026-07-23": {
        "available": true,
        "end_of_day_meter_kwh": 953.485,
        "entry_date": "2026-07-23",
        "production_kwh": 93.15
      },
      "2026-07-24": {
        "available": true,
        "end_of_day_meter_kwh": 1026.875,
        "entry_date": "2026-07-24",
        "production_kwh": 73.39
      },
      "2026-07-25": {
        "available": true,
        "end_of_day_meter_kwh": 1117.304,
        "entry_date": "2026-07-25",
        "production_kwh": 90.429
      },
      "2026-07-26": {
        "available": true,
        "end_of_day_meter_kwh": 1191.841,
        "entry_date": "2026-07-26",
        "production_kwh": 74.537
      },
      "2026-07-27": {
        "available": true,
        "end_of_day_meter_kwh": 1274.831,
        "entry_date": "2026-07-27",
        "production_kwh": 82.989
      },
      "2026-07-28": {
        "available": true,
        "end_of_day_meter_kwh": 1311.4,
        "entry_date": "2026-07-28",
        "production_kwh": 36.569
      },
      "2026-07-29": {
        "available": true,
        "end_of_day_meter_kwh": 1371.647,
        "entry_date": "2026-07-29",
        "production_kwh": 60.247
      },
      "2026-07-30": {
        "available": true,
        "end_of_day_meter_kwh": 1420.268,
        "entry_date": "2026-07-30",
        "production_kwh": 48.621
      },
      "2026-07-31": {
        "available": true,
        "end_of_day_meter_kwh": 1483.708,
        "entry_date": "2026-07-31",
        "production_kwh": 63.44
      },
      "2026-08-01": {
        "available": true,
        "end_of_day_meter_kwh": 1557.098,
        "entry_date": "2026-08-01",
        "production_kwh": 73.391
      },
      "2026-08-02": {
        "available": true,
        "end_of_day_meter_kwh": 1609.548,
        "entry_date": "2026-08-02",
        "production_kwh": 52.45
      },
      "2026-08-03": {
        "available": true,
        "end_of_day_meter_kwh": 1649.593,
        "entry_date": "2026-08-03",
        "production_kwh": 40.045
      },
      "2026-08-04": {
        "available": true,
        "end_of_day_meter_kwh": 1737.392,
        "entry_date": "2026-08-04",
        "production_kwh": 87.799
      },
      "2026-08-05": {
        "available": true,
        "end_of_day_meter_kwh": 1804.879,
        "entry_date": "2026-08-05",
        "production_kwh": 67.487
      },
      "2026-08-06": {
        "available": true,
        "end_of_day_meter_kwh": 1879.702,
        "entry_date": "2026-08-06",
        "production_kwh": 74.823
      },
      "2026-08-07": {
        "available": true,
        "end_of_day_meter_kwh": 1943.198,
        "entry_date": "2026-08-07",
        "production_kwh": 63.496
      },
      "2026-08-08": {
        "available": true,
        "end_of_day_meter_kwh": 2014.698,
        "entry_date": "2026-08-08",
        "production_kwh": 71.5
      },
      "2026-08-09": {
        "available": true,
        "end_of_day_meter_kwh": 2095.598,
        "entry_date": "2026-08-09",
        "production_kwh": 80.9
      },
      "2026-08-10": {
        "available": true,
        "end_of_day_meter_kwh": 2155.598,
        "entry_date": "2026-08-10",
        "production_kwh": 60.0
      },
      "2026-08-11": {
        "available": true,
        "end_of_day_meter_kwh": 2213.298,
        "entry_date": "2026-08-11",
        "production_kwh": 57.7
      },
      "2026-08-12": {
        "available": true,
        "end_of_day_meter_kwh": 2291.498,
        "entry_date": "2026-08-12",
        "production_kwh": 78.2
      },
      "2026-08-13": {
        "available": true,
        "end_of_day_meter_kwh": 2356.398,
        "entry_date": "2026-08-13",
        "production_kwh": 64.9
      },
      "2026-08-14": {
        "available": true,
        "end_of_day_meter_kwh": 2428.098,
        "entry_date": "2026-08-14",
        "production_kwh": 71.7
      },
      "2026-08-15": {
        "available": true,
        "end_of_day_meter_kwh": 2506.998,
        "entry_date": "2026-08-15",
        "production_kwh": 78.9
      },
      "2026-08-16": {
        "available": true,
        "end_of_day_meter_kwh": 2547.078,
        "entry_date": "2026-08-16",
        "production_kwh": 40.08
      },
      "2026-08-17": {
        "available": true,
        "end_of_day_meter_kwh": 2584.778,
        "entry_date": "2026-08-17",
        "production_kwh": 37.7
      },
      "2026-08-18": {
        "available": true,
        "end_of_day_meter_kwh": 2654.338,
        "entry_date": "2026-08-18",
        "production_kwh": 69.56
      },
      "2026-08-19": {
        "available": true,
        "end_of_day_meter_kwh": 2733.788,
        "entry_date": "2026-08-19",
        "production_kwh": 79.45
      },
      "2026-08-20": {
        "available": true,
        "end_of_day_meter_kwh": 2764.868,
        "entry_date": "2026-08-20",
        "production_kwh": 31.08
      },
      "2026-08-21": {
        "available": true,
        "end_of_day_meter_kwh": 2832.278,
        "entry_date": "2026-08-21",
        "production_kwh": 67.41
      },
      "2026-08-22": {
        "available": true,
        "end_of_day_meter_kwh": 2889.648,
        "entry_date": "2026-08-22",
        "production_kwh": 57.37
      },
      "2026-08-23": {
        "available": true,
        "end_of_day_meter_kwh": 2955.568,
        "entry_date": "2026-08-23",
        "production_kwh": 65.92
      },
      "2026-08-24": {
        "available": true,
        "end_of_day_meter_kwh": 3026.228,
        "entry_date": "2026-08-24",
        "production_kwh": 70.66
      },
      "2026-08-25": {
        "available": true,
        "end_of_day_meter_kwh": 3098.858,
        "entry_date": "2026-08-25",
        "production_kwh": 72.63
      },
      "2026-08-26": {
        "available": true,
        "end_of_day_meter_kwh": 3163.803,
        "entry_date": "2026-08-26",
        "production_kwh": 64.95
      },
      "2026-08-27": {
        "available": true,
        "end_of_day_meter_kwh": 3189.833,
        "entry_date": "2026-08-27",
        "production_kwh": 26.03
      },
      "2026-08-28": {
        "available": true,
        "end_of_day_meter_kwh": 3261.433,
        "entry_date": "2026-08-28",
        "production_kwh": 71.6
      },
      "2026-08-29": {
        "available": true,
        "end_of_day_meter_kwh": 3291.433,
        "entry_date": "2026-08-29",
        "production_kwh": 27.02
      }
    },
    "latest_available_date": "2026-08-29",
    "rows": [
      {
        "available": false,
        "end_of_day_meter_kwh": 0.0,
        "entry_date": "2026-07-09",
        "production_kwh": 0.0
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 59.369,
        "entry_date": "2026-07-10",
        "production_kwh": 59.369
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 133.199,
        "entry_date": "2026-07-11",
        "production_kwh": 73.83
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 214.085,
        "entry_date": "2026-07-12",
        "production_kwh": 80.886
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 285.192,
        "entry_date": "2026-07-13",
        "production_kwh": 71.107
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 362.815,
        "entry_date": "2026-07-14",
        "production_kwh": 77.623
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 412.074,
        "entry_date": "2026-07-15",
        "production_kwh": 49.259
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 456.49,
        "entry_date": "2026-07-16",
        "production_kwh": 44.416
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 547.278,
        "entry_date": "2026-07-17",
        "production_kwh": 90.788
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 572.776,
        "entry_date": "2026-07-18",
        "production_kwh": 25.498
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 665.638,
        "entry_date": "2026-07-19",
        "production_kwh": 92.862
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 759.679,
        "entry_date": "2026-07-20",
        "production_kwh": 94.041
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 782.293,
        "entry_date": "2026-07-21",
        "production_kwh": 22.614
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 860.335,
        "entry_date": "2026-07-22",
        "production_kwh": 78.042
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 953.485,
        "entry_date": "2026-07-23",
        "production_kwh": 93.15
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 1026.875,
        "entry_date": "2026-07-24",
        "production_kwh": 73.39
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 1117.304,
        "entry_date": "2026-07-25",
        "production_kwh": 90.429
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 1191.841,
        "entry_date": "2026-07-26",
        "production_kwh": 74.537
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 1274.831,
        "entry_date": "2026-07-27",
        "production_kwh": 82.989
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 1311.4,
        "entry_date": "2026-07-28",
        "production_kwh": 36.569
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 1371.647,
        "entry_date": "2026-07-29",
        "production_kwh": 60.247
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 1420.268,
        "entry_date": "2026-07-30",
        "production_kwh": 48.621
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 1483.708,
        "entry_date": "2026-07-31",
        "production_kwh": 63.44
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 1557.098,
        "entry_date": "2026-08-01",
        "production_kwh": 73.391
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 1609.548,
        "entry_date": "2026-08-02",
        "production_kwh": 52.45
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 1649.593,
        "entry_date": "2026-08-03",
        "production_kwh": 40.045
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 1737.392,
        "entry_date": "2026-08-04",
        "production_kwh": 87.799
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 1804.879,
        "entry_date": "2026-08-05",
        "production_kwh": 67.487
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 1879.702,
        "entry_date": "2026-08-06",
        "production_kwh": 74.823
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 1943.198,
        "entry_date": "2026-08-07",
        "production_kwh": 63.496
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 2014.698,
        "entry_date": "2026-08-08",
        "production_kwh": 71.5
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 2095.598,
        "entry_date": "2026-08-09",
        "production_kwh": 80.9
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 2155.598,
        "entry_date": "2026-08-10",
        "production_kwh": 60.0
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 2213.298,
        "entry_date": "2026-08-11",
        "production_kwh": 57.7
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 2291.498,
        "entry_date": "2026-08-12",
        "production_kwh": 78.2
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 2356.398,
        "entry_date": "2026-08-13",
        "production_kwh": 64.9
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 2428.098,
        "entry_date": "2026-08-14",
        "production_kwh": 71.7
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 2506.998,
        "entry_date": "2026-08-15",
        "production_kwh": 78.9
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 2547.078,
        "entry_date": "2026-08-16",
        "production_kwh": 40.08
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 2584.778,
        "entry_date": "2026-08-17",
        "production_kwh": 37.7
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 2654.338,
        "entry_date": "2026-08-18",
        "production_kwh": 69.56
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 2733.788,
        "entry_date": "2026-08-19",
        "production_kwh": 79.45
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 2764.868,
        "entry_date": "2026-08-20",
        "production_kwh": 31.08
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 2832.278,
        "entry_date": "2026-08-21",
        "production_kwh": 67.41
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 2889.648,
        "entry_date": "2026-08-22",
        "production_kwh": 57.37
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 2955.568,
        "entry_date": "2026-08-23",
        "production_kwh": 65.92
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 3026.228,
        "entry_date": "2026-08-24",
        "production_kwh": 70.66
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 3098.858,
        "entry_date": "2026-08-25",
        "production_kwh": 72.63
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 3163.803,
        "entry_date": "2026-08-26",
        "production_kwh": 64.95
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 3189.833,
        "entry_date": "2026-08-27",
        "production_kwh": 26.03
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 3261.433,
        "entry_date": "2026-08-28",
        "production_kwh": 71.6
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 3291.433,
        "entry_date": "2026-08-29",
        "production_kwh": 0.0
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 3291.433,
        "entry_date": "2026-08-29",
        "production_kwh": 27.02
      }
    ]
  },
  "weather_options": [
    "Sunny",
    "Cloudy",
    "Smoke",
    "Rain",
    "Snow",
    "Overcast",
    "Extreme Heat",
    "Wind",
    "Unknown"
  ]
};
