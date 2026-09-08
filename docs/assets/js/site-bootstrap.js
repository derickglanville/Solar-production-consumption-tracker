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
    "amount_due": 1054.04,
    "available": true,
    "average_daily_use_kwh": 17.862068965517242,
    "balance_forward": 921.82,
    "billing_end_date": "2026-09-03",
    "billing_records": [
      {
        "amount_due": 1054.04,
        "average_daily_use_kwh": 17.862068965517242,
        "balance_forward": 921.82,
        "billing_end_date": "2026-09-03",
        "billing_start_date": "2026-08-06",
        "budget_billing_amount": 0.0,
        "current_usage_kwh": 518.0,
        "days_in_period": 29,
        "delivery_charges": 77.47,
        "display_name": "08_06_26 - 09_03_26.pdf",
        "effective_energy_rate": 0.2341119691119691,
        "exported_kwh": 1260.0,
        "imported_kwh": 518.0,
        "meter_note": "Register 01 recorded 518 kWh imported; Register 02 recorded 1,260 kWh exported.",
        "miscellaneous_charges": 0.95,
        "net_direction": "Net export",
        "net_grid_kwh": -742.0,
        "payment_agreement_amount": 10.0,
        "smart_meter_import_kwh": 518.0,
        "statement_date": "2026-09-08",
        "supply_charges": 37.4,
        "supply_rate_per_kwh": 0.07220077,
        "taxes": 6.4,
        "total_adjustments": 0.0,
        "total_energy_charges": 121.27
      },
      {
        "amount_due": 921.82,
        "average_daily_use_kwh": 23.142857142857142,
        "balance_forward": 0.0,
        "billing_end_date": "2026-08-05",
        "billing_start_date": "2026-07-02",
        "budget_billing_amount": 0.0,
        "current_usage_kwh": 810.0,
        "days_in_period": 35,
        "delivery_charges": 112.94,
        "display_name": "07_02_26 - 08_05_26.pdf",
        "effective_energy_rate": 0.2723333333333333,
        "exported_kwh": 1025.0,
        "imported_kwh": 810.0,
        "meter_note": "Meter-transition month: 419 kWh old-meter use plus 391 kWh smart-meter import; Register 02 recorded 1,025 kWh exported.",
        "miscellaneous_charges": 0.95,
        "net_direction": "Net export",
        "net_grid_kwh": -215.0,
        "payment_agreement_amount": 10.0,
        "smart_meter_import_kwh": 391.0,
        "statement_date": "2026-09-03",
        "supply_charges": 96.56,
        "supply_rate_per_kwh": 0.11920988,
        "taxes": 11.09,
        "total_adjustments": 690.28,
        "total_energy_charges": 220.59
      },
      {
        "amount_due": 516.9,
        "average_daily_use_kwh": 4.37037037037037,
        "balance_forward": -1.05,
        "billing_end_date": "2026-07-01",
        "billing_start_date": "2026-06-05",
        "budget_billing_amount": 507.0,
        "current_usage_kwh": 118.0,
        "days_in_period": 27,
        "delivery_charges": 32.58,
        "display_name": "06_05_26 - 07_01_26.pdf",
        "effective_energy_rate": 0.3877966101694915,
        "exported_kwh": 0.0,
        "imported_kwh": 118.0,
        "meter_note": "Pre-smart-meter bill; no export register was available.",
        "miscellaneous_charges": 0.95,
        "net_direction": "Net import",
        "net_grid_kwh": 118.0,
        "payment_agreement_amount": 10.0,
        "smart_meter_import_kwh": 0.0,
        "statement_date": "2026-07-07",
        "supply_charges": 10.69,
        "supply_rate_per_kwh": 0.09059322,
        "taxes": 2.49,
        "total_adjustments": -1151.52,
        "total_energy_charges": 45.76
      }
    ],
    "billing_start_date": "2026-08-06",
    "billing_totals": {
      "amount_due": 2492.76,
      "delivery_charges": 222.99,
      "energy_charges": 387.62,
      "miscellaneous_charges": 2.8499999999999996,
      "record_count": 3,
      "supply_charges": 144.65,
      "taxes": 19.980000000000004
    },
    "budget_billing_amount": 0.0,
    "current_usage_kwh": 518.0,
    "days_in_period": 29,
    "display_name": "08_06_26 - 09_03_26.pdf",
    "miscellaneous_charges": 0.95,
    "net_metering": {
      "billing_period_direction": "Net export",
      "billing_period_import_kwh": 1446.0,
      "billing_period_net_kwh": -839.0,
      "export_kwh": 2285.0,
      "smart_meter_direction": "Net export",
      "smart_meter_import_kwh": 909.0,
      "smart_meter_net_kwh": -1376.0,
      "solar_bill_count": 2
    },
    "notes": [
      "Loaded 36 monthly usage/cost records and 3 detailed bill PDFs.",
      "Register 01 is electricity imported from NYSEG; Register 02 is solar electricity exported to NYSEG.",
      "The July 2-August 5 bill spans the old and smart meters, so total billed import and smart-meter-only import are shown separately."
    ],
    "payment_agreement_amount": 10.0,
    "prior_year_average_daily_use_kwh": 0.0,
    "statement_date": "2026-09-08",
    "total_adjustments": 0.0,
    "total_electricity_cost": 121.27,
    "total_energy_charges": 121.27,
    "usage_records": [
      {
        "average_temperature_f": 72.0,
        "billing_end_date": "2026-09-03",
        "billing_start_date": "2026-08-06",
        "cost": 114.87,
        "effective_rate_per_kwh": 0.22175675675675677,
        "month_label": "Sep 2026",
        "units": "kWh",
        "usage_kwh": 518.0
      },
      {
        "average_temperature_f": 73.0,
        "billing_end_date": "2026-08-05",
        "billing_start_date": "2026-07-02",
        "cost": 209.5,
        "effective_rate_per_kwh": 0.25864197530864197,
        "month_label": "Aug 2026",
        "units": "kWh",
        "usage_kwh": 810.0
      },
      {
        "average_temperature_f": 71.0,
        "billing_end_date": "2026-07-01",
        "billing_start_date": "2026-06-05",
        "cost": 43.27,
        "effective_rate_per_kwh": 0.3666949152542373,
        "month_label": "Jul 2026",
        "units": "kWh",
        "usage_kwh": 118.0
      },
      {
        "average_temperature_f": 61.0,
        "billing_end_date": "2026-06-04",
        "billing_start_date": "2026-05-06",
        "cost": 486.94,
        "effective_rate_per_kwh": 0.25454260324098277,
        "month_label": "Jun 2026",
        "units": "kWh",
        "usage_kwh": 1913.0
      },
      {
        "average_temperature_f": 52.0,
        "billing_end_date": "2026-05-05",
        "billing_start_date": "2026-04-07",
        "cost": 403.45,
        "effective_rate_per_kwh": 0.2738968092328581,
        "month_label": "May 2026",
        "units": "kWh",
        "usage_kwh": 1473.0
      },
      {
        "average_temperature_f": 45.0,
        "billing_end_date": "2026-04-06",
        "billing_start_date": "2026-03-04",
        "cost": 501.89,
        "effective_rate_per_kwh": 0.2678175026680896,
        "month_label": "Apr 2026",
        "units": "kWh",
        "usage_kwh": 1874.0
      },
      {
        "average_temperature_f": 28.0,
        "billing_end_date": "2026-03-03",
        "billing_start_date": "2026-02-05",
        "cost": 811.93,
        "effective_rate_per_kwh": 0.2569398734177215,
        "month_label": "Mar 2026",
        "units": "kWh",
        "usage_kwh": 3160.0
      },
      {
        "average_temperature_f": 25.0,
        "billing_end_date": "2026-02-04",
        "billing_start_date": "2026-01-07",
        "cost": 397.06,
        "effective_rate_per_kwh": 0.2798167723749119,
        "month_label": "Feb 2026",
        "units": "kWh",
        "usage_kwh": 1419.0
      },
      {
        "average_temperature_f": 29.0,
        "billing_end_date": "2026-01-06",
        "billing_start_date": "2025-12-06",
        "cost": 493.13,
        "effective_rate_per_kwh": 0.2522404092071611,
        "month_label": "Jan 2026",
        "units": "kWh",
        "usage_kwh": 1955.0
      },
      {
        "average_temperature_f": 40.0,
        "billing_end_date": "2025-12-05",
        "billing_start_date": "2025-11-05",
        "cost": 480.25,
        "effective_rate_per_kwh": 0.20916811846689895,
        "month_label": "Dec 2025",
        "units": "kWh",
        "usage_kwh": 2296.0
      },
      {
        "average_temperature_f": 52.0,
        "billing_end_date": "2025-11-04",
        "billing_start_date": "2025-10-07",
        "cost": 139.51,
        "effective_rate_per_kwh": 0.2667495219885277,
        "month_label": "Nov 2025",
        "units": "kWh",
        "usage_kwh": 523.0
      },
      {
        "average_temperature_f": 66.0,
        "billing_end_date": "2025-10-06",
        "billing_start_date": "2025-09-04",
        "cost": 235.4,
        "effective_rate_per_kwh": 0.2349301397205589,
        "month_label": "Oct 2025",
        "units": "kWh",
        "usage_kwh": 1002.0
      },
      {
        "average_temperature_f": 70.0,
        "billing_end_date": "2025-09-03",
        "billing_start_date": "2025-08-06",
        "cost": 277.3,
        "effective_rate_per_kwh": 0.22917355371900827,
        "month_label": "Sep 2025",
        "units": "kWh",
        "usage_kwh": 1210.0
      },
      {
        "average_temperature_f": 76.0,
        "billing_end_date": "2025-08-05",
        "billing_start_date": "2025-07-04",
        "cost": 257.28,
        "effective_rate_per_kwh": 0.236688132474701,
        "month_label": "Aug 2025",
        "units": "kWh",
        "usage_kwh": 1087.0
      },
      {
        "average_temperature_f": 72.0,
        "billing_end_date": "2025-07-03",
        "billing_start_date": "2025-06-05",
        "cost": 233.29,
        "effective_rate_per_kwh": 0.23212935323383083,
        "month_label": "Jul 2025",
        "units": "kWh",
        "usage_kwh": 1005.0
      },
      {
        "average_temperature_f": 59.0,
        "billing_end_date": "2025-06-04",
        "billing_start_date": "2025-05-06",
        "cost": 277.7,
        "effective_rate_per_kwh": 0.25784586815227484,
        "month_label": "Jun 2025",
        "units": "kWh",
        "usage_kwh": 1077.0
      },
      {
        "average_temperature_f": 54.0,
        "billing_end_date": "2025-05-05",
        "billing_start_date": "2025-04-04",
        "cost": 992.56,
        "effective_rate_per_kwh": 0.2568072445019405,
        "month_label": "May 2025",
        "units": "kWh",
        "usage_kwh": 3865.0
      },
      {
        "average_temperature_f": 44.0,
        "billing_end_date": "2025-04-03",
        "billing_start_date": "2025-03-04",
        "cost": 329.46,
        "effective_rate_per_kwh": 0.2387391304347826,
        "month_label": "Apr 2025",
        "units": "kWh",
        "usage_kwh": 1380.0
      },
      {
        "average_temperature_f": 31.0,
        "billing_end_date": "2025-03-03",
        "billing_start_date": "2025-02-06",
        "cost": 478.61,
        "effective_rate_per_kwh": 0.22682938388625593,
        "month_label": "Mar 2025",
        "units": "kWh",
        "usage_kwh": 2110.0
      },
      {
        "average_temperature_f": 26.0,
        "billing_end_date": "2025-02-05",
        "billing_start_date": "2025-01-07",
        "cost": 132.6,
        "effective_rate_per_kwh": 0.23636363636363636,
        "month_label": "Feb 2025",
        "units": "kWh",
        "usage_kwh": 561.0
      },
      {
        "average_temperature_f": 34.0,
        "billing_end_date": "2025-01-06",
        "billing_start_date": "2024-12-06",
        "cost": 549.15,
        "effective_rate_per_kwh": 0.1870401907356948,
        "month_label": "Jan 2025",
        "units": "kWh",
        "usage_kwh": 2936.0
      },
      {
        "average_temperature_f": 44.0,
        "billing_end_date": "2024-12-05",
        "billing_start_date": "2024-11-05",
        "cost": 320.44,
        "effective_rate_per_kwh": 0.1802249718785152,
        "month_label": "Dec 2024",
        "units": "kWh",
        "usage_kwh": 1778.0
      },
      {
        "average_temperature_f": 55.0,
        "billing_end_date": "2024-11-04",
        "billing_start_date": "2024-10-04",
        "cost": 22.87,
        "effective_rate_per_kwh": 0.9529166666666667,
        "month_label": "Nov 2024",
        "units": "kWh",
        "usage_kwh": 24.0
      },
      {
        "average_temperature_f": 64.0,
        "billing_end_date": "2024-10-03",
        "billing_start_date": "2024-09-04",
        "cost": 165.06,
        "effective_rate_per_kwh": 0.18864,
        "month_label": "Oct 2024",
        "units": "kWh",
        "usage_kwh": 875.0
      },
      {
        "average_temperature_f": 70.0,
        "billing_end_date": "2024-09-03",
        "billing_start_date": "2024-08-06",
        "cost": 297.46,
        "effective_rate_per_kwh": 0.1856803995006242,
        "month_label": "Sep 2024",
        "units": "kWh",
        "usage_kwh": 1602.0
      },
      {
        "average_temperature_f": 77.0,
        "billing_end_date": "2024-08-05",
        "billing_start_date": "2024-07-03",
        "cost": 184.59,
        "effective_rate_per_kwh": 0.1957476139978791,
        "month_label": "Aug 2024",
        "units": "kWh",
        "usage_kwh": 943.0
      },
      {
        "average_temperature_f": 72.0,
        "billing_end_date": "2024-07-02",
        "billing_start_date": "2024-06-06",
        "cost": 93.39,
        "effective_rate_per_kwh": 0.19828025477707006,
        "month_label": "Jul 2024",
        "units": "kWh",
        "usage_kwh": 471.0
      },
      {
        "average_temperature_f": 63.0,
        "billing_end_date": "2024-06-05",
        "billing_start_date": "2024-05-03",
        "cost": 215.26,
        "effective_rate_per_kwh": 0.1715219123505976,
        "month_label": "Jun 2024",
        "units": "kWh",
        "usage_kwh": 1255.0
      },
      {
        "average_temperature_f": 52.0,
        "billing_end_date": "2024-05-02",
        "billing_start_date": "2024-04-04",
        "cost": 157.1,
        "effective_rate_per_kwh": 0.16983783783783782,
        "month_label": "May 2024",
        "units": "kWh",
        "usage_kwh": 925.0
      },
      {
        "average_temperature_f": 44.0,
        "billing_end_date": "2024-04-03",
        "billing_start_date": "2024-03-02",
        "cost": 288.26,
        "effective_rate_per_kwh": 0.1673012188044109,
        "month_label": "Apr 2024",
        "units": "kWh",
        "usage_kwh": 1723.0
      },
      {
        "average_temperature_f": 35.0,
        "billing_end_date": "2024-03-01",
        "billing_start_date": "2024-02-06",
        "cost": 422.72,
        "effective_rate_per_kwh": 0.19949032562529495,
        "month_label": "Mar 2024",
        "units": "kWh",
        "usage_kwh": 2119.0
      },
      {
        "average_temperature_f": 33.0,
        "billing_end_date": "2024-02-05",
        "billing_start_date": "2024-01-03",
        "cost": 469.56,
        "effective_rate_per_kwh": 0.19080048760666396,
        "month_label": "Feb 2024",
        "units": "kWh",
        "usage_kwh": 2461.0
      },
      {
        "average_temperature_f": 39.0,
        "billing_end_date": "2024-01-02",
        "billing_start_date": "2023-12-06",
        "cost": 360.69,
        "effective_rate_per_kwh": 0.1889418543740178,
        "month_label": "Jan 2024",
        "units": "kWh",
        "usage_kwh": 1909.0
      },
      {
        "average_temperature_f": 42.0,
        "billing_end_date": "2023-12-05",
        "billing_start_date": "2023-11-01",
        "cost": 313.05,
        "effective_rate_per_kwh": 0.1780716723549488,
        "month_label": "Dec 2023",
        "units": "kWh",
        "usage_kwh": 1758.0
      },
      {
        "average_temperature_f": 56.0,
        "billing_end_date": "2023-10-31",
        "billing_start_date": "2023-10-05",
        "cost": 39.44,
        "effective_rate_per_kwh": 0.10270833333333333,
        "month_label": "Oct 2023",
        "units": "kWh",
        "usage_kwh": 384.0
      },
      {
        "average_temperature_f": 66.0,
        "billing_end_date": "2023-10-04",
        "billing_start_date": "2023-09-02",
        "cost": 81.46,
        "effective_rate_per_kwh": 0.07500920810313075,
        "month_label": "Oct 2023",
        "units": "kWh",
        "usage_kwh": 1086.0
      }
    ],
    "usage_totals": {
      "average_monthly_cost": 313.23611111111103,
      "average_monthly_kwh": 1433.4722222222222,
      "effective_rate_per_kwh": 0.2185156477085553,
      "end_date": "2026-09-03",
      "record_count": 36,
      "start_date": "2023-09-02",
      "total_cost": 11276.499999999996,
      "total_kwh": 51605.0
    }
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
      "notes_manual": false,
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
      "notes_manual": false,
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
      "notes_manual": false,
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
      "notes_manual": false,
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
      "notes_manual": false,
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
      "notes_manual": false,
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
      "notes_manual": false,
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
      "notes_manual": false,
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
      "notes_manual": false,
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
      "notes_manual": false,
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
        "end_of_day_meter_kwh": 1274.83,
        "entry_date": "2026-07-27",
        "production_kwh": 82.989
      },
      "2026-07-28": {
        "available": true,
        "end_of_day_meter_kwh": 1311.399,
        "entry_date": "2026-07-28",
        "production_kwh": 36.569
      },
      "2026-07-29": {
        "available": true,
        "end_of_day_meter_kwh": 1371.646,
        "entry_date": "2026-07-29",
        "production_kwh": 60.247
      },
      "2026-07-30": {
        "available": true,
        "end_of_day_meter_kwh": 1420.267,
        "entry_date": "2026-07-30",
        "production_kwh": 48.621
      },
      "2026-07-31": {
        "available": true,
        "end_of_day_meter_kwh": 1483.707,
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
        "end_of_day_meter_kwh": 3163.808,
        "entry_date": "2026-08-26",
        "production_kwh": 64.95
      },
      "2026-08-27": {
        "available": true,
        "end_of_day_meter_kwh": 3190.828,
        "entry_date": "2026-08-27",
        "production_kwh": 27.02
      },
      "2026-08-28": {
        "available": true,
        "end_of_day_meter_kwh": 3263.628,
        "entry_date": "2026-08-28",
        "production_kwh": 72.8
      },
      "2026-08-29": {
        "available": true,
        "end_of_day_meter_kwh": 3345.448,
        "entry_date": "2026-08-29",
        "production_kwh": 81.82
      },
      "2026-08-30": {
        "available": true,
        "end_of_day_meter_kwh": 3387.468,
        "entry_date": "2026-08-30",
        "production_kwh": 42.02
      },
      "2026-08-31": {
        "available": true,
        "end_of_day_meter_kwh": 3426.428,
        "entry_date": "2026-08-31",
        "production_kwh": 38.96
      },
      "2026-09-01": {
        "available": true,
        "end_of_day_meter_kwh": 3455.038,
        "entry_date": "2026-09-01",
        "production_kwh": 28.61
      },
      "2026-09-02": {
        "available": true,
        "end_of_day_meter_kwh": 3473.738,
        "entry_date": "2026-09-02",
        "production_kwh": 18.7
      },
      "2026-09-03": {
        "available": true,
        "end_of_day_meter_kwh": 3522.958,
        "entry_date": "2026-09-03",
        "production_kwh": 49.22
      },
      "2026-09-04": {
        "available": true,
        "end_of_day_meter_kwh": 3590.948,
        "entry_date": "2026-09-04",
        "production_kwh": 67.99
      },
      "2026-09-05": {
        "available": true,
        "end_of_day_meter_kwh": 3658.938,
        "entry_date": "2026-09-05",
        "production_kwh": 67.99
      },
      "2026-09-06": {
        "available": true,
        "end_of_day_meter_kwh": 3722.328,
        "entry_date": "2026-09-06",
        "production_kwh": 63.39
      },
      "2026-09-07": {
        "available": true,
        "end_of_day_meter_kwh": 3795.758,
        "entry_date": "2026-09-07",
        "production_kwh": 73.43
      },
      "2026-09-08": {
        "available": true,
        "end_of_day_meter_kwh": 3851.308,
        "entry_date": "2026-09-08",
        "production_kwh": 55.55
      }
    },
    "latest_available_date": "2026-09-08",
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
        "end_of_day_meter_kwh": 1274.83,
        "entry_date": "2026-07-27",
        "production_kwh": 82.989
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 1311.399,
        "entry_date": "2026-07-28",
        "production_kwh": 36.569
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 1371.646,
        "entry_date": "2026-07-29",
        "production_kwh": 60.247
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 1420.267,
        "entry_date": "2026-07-30",
        "production_kwh": 48.621
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 1483.707,
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
        "end_of_day_meter_kwh": 3163.808,
        "entry_date": "2026-08-26",
        "production_kwh": 64.95
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 3190.828,
        "entry_date": "2026-08-27",
        "production_kwh": 27.02
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 3263.628,
        "entry_date": "2026-08-28",
        "production_kwh": 72.8
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 3345.448,
        "entry_date": "2026-08-29",
        "production_kwh": 81.82
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 3387.468,
        "entry_date": "2026-08-30",
        "production_kwh": 42.02
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 3426.428,
        "entry_date": "2026-08-31",
        "production_kwh": 38.96
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 3455.038,
        "entry_date": "2026-09-01",
        "production_kwh": 28.61
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 3473.738,
        "entry_date": "2026-09-02",
        "production_kwh": 18.7
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 3522.958,
        "entry_date": "2026-09-03",
        "production_kwh": 49.22
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 3590.948,
        "entry_date": "2026-09-04",
        "production_kwh": 67.99
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 3658.938,
        "entry_date": "2026-09-05",
        "production_kwh": 67.99
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 3722.328,
        "entry_date": "2026-09-06",
        "production_kwh": 63.39
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 3795.758,
        "entry_date": "2026-09-07",
        "production_kwh": 73.43
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 3851.308,
        "entry_date": "2026-09-08",
        "production_kwh": 55.55
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
