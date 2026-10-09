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
    "amount_due": 468.25,
    "available": true,
    "average_daily_use_kwh": 15.0,
    "balance_forward": 413.73,
    "billing_end_date": "2026-10-06",
    "billing_records": [
      {
        "amount_due": 468.25,
        "average_daily_use_kwh": 15.0,
        "balance_forward": 413.73,
        "billing_end_date": "2026-10-06",
        "billing_start_date": "2026-09-04",
        "budget_billing_amount": 0.0,
        "credited_usage_kwh": 495.0,
        "current_usage_kwh": 495.0,
        "days_in_period": 33,
        "delivery_charges": 40.99,
        "display_name": "09_04_26 - 10_06_26.pdf",
        "effective_energy_rate": 0.08802020202020203,
        "exported_kwh": 1175.0,
        "imported_kwh": 495.0,
        "ingestion_source": "PDF extraction",
        "meter_note": "Automatically extracted from the saved NYSEG PDF. Review the source bill if a corrected statement changes the period.",
        "miscellaneous_charges": 0.95,
        "net_direction": "Net export",
        "net_grid_kwh": -680.0,
        "payment_agreement_amount": 10.0,
        "prior_excess_generation_kwh": 1376.0,
        "remaining_excess_generation_kwh": 2056.0,
        "smart_meter_import_kwh": 495.0,
        "statement_date": "2026-10-08",
        "supply_charges": 0.0,
        "supply_rate_per_kwh": 0.0,
        "taxes": 2.58,
        "total_adjustments": 0.0,
        "total_energy_charges": 43.57
      },
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
        "amount_due": 913.73,
        "average_daily_use_kwh": 17.862068965517242,
        "balance_forward": 859.21,
        "billing_end_date": "2026-09-03",
        "billing_start_date": "2026-08-06",
        "budget_billing_amount": 0.0,
        "credited_usage_kwh": 518.0,
        "current_usage_kwh": 518.0,
        "days_in_period": 29,
        "delivery_charges": 40.99,
        "display_name": "09_16_26 - 09_03_26.pdf",
        "effective_energy_rate": 0.08411196911196911,
        "exported_kwh": 1260.0,
        "imported_kwh": 518.0,
        "meter_note": "NYSEG applied solar generation against the 518 kWh of use. Its excess-generation table shows 634 kWh prior excess, 1,260 kWh generated, and 1,376 kWh remaining.",
        "miscellaneous_charges": 0.95,
        "net_direction": "Net export",
        "net_grid_kwh": -742.0,
        "payment_agreement_amount": 10.0,
        "prior_excess_generation_kwh": 634.0,
        "remaining_excess_generation_kwh": 1376.0,
        "smart_meter_import_kwh": 518.0,
        "statement_date": "2026-09-16",
        "supply_charges": 0.0,
        "supply_rate_per_kwh": 0.0,
        "taxes": 2.58,
        "total_adjustments": 0.0,
        "total_energy_charges": 43.57
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
    "billing_start_date": "2026-09-04",
    "billing_totals": {
      "amount_due": 3874.7400000000002,
      "delivery_charges": 304.96999999999997,
      "energy_charges": 474.76,
      "miscellaneous_charges": 4.75,
      "record_count": 5,
      "supply_charges": 144.65,
      "taxes": 25.14
    },
    "budget_billing_amount": 0.0,
    "current_usage_kwh": 495.0,
    "days_in_period": 33,
    "display_name": "09_04_26 - 10_06_26.pdf",
    "miscellaneous_charges": 0.95,
    "net_metering": {
      "billing_period_direction": "Net export",
      "billing_period_import_kwh": 2459.0,
      "billing_period_net_kwh": -2261.0,
      "export_kwh": 4720.0,
      "smart_meter_direction": "Net export",
      "smart_meter_import_kwh": 1922.0,
      "smart_meter_net_kwh": -2798.0,
      "solar_bill_count": 4
    },
    "notes": [
      "Loaded 36 monthly usage/cost records and 5 detailed bill PDFs.",
      "Register 01 is electricity imported from NYSEG; Register 02 is solar electricity exported to NYSEG.",
      "The July 2-August 5 bill spans the old and smart meters, so total billed import and smart-meter-only import are shown separately."
    ],
    "payment_agreement_amount": 10.0,
    "prior_year_average_daily_use_kwh": 0.0,
    "statement_date": "2026-10-08",
    "total_adjustments": 0.0,
    "total_electricity_cost": 43.57,
    "total_energy_charges": 43.57,
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
  "nyseg_interval": {
    "available": true,
    "daily": [
      {
        "average_temperature_f": 50.166666666666664,
        "date": "2026-10-06",
        "export_kwh": 33.961000000000006,
        "import_kwh": 15.431000000000003,
        "net_export_kwh": 18.53,
        "running_m01_kwh": 1155.1764999999998,
        "running_m02_kwh": 2697.2439999999997
      },
      {
        "average_temperature_f": 57.166666666666664,
        "date": "2026-10-05",
        "export_kwh": 33.022000000000006,
        "import_kwh": 14.261000000000001,
        "net_export_kwh": 18.761000000000003,
        "running_m01_kwh": 1139.7454999999998,
        "running_m02_kwh": 2663.283
      },
      {
        "average_temperature_f": 54.625,
        "date": "2026-10-04",
        "export_kwh": 15.104000000000003,
        "import_kwh": 13.361999999999998,
        "net_export_kwh": 1.7420000000000044,
        "running_m01_kwh": 1125.4844999999998,
        "running_m02_kwh": 2630.261
      },
      {
        "average_temperature_f": 61.291666666666664,
        "date": "2026-10-03",
        "export_kwh": 34.931000000000004,
        "import_kwh": 13.745000000000001,
        "net_export_kwh": 21.186000000000003,
        "running_m01_kwh": 1112.1224999999997,
        "running_m02_kwh": 2615.157
      },
      {
        "average_temperature_f": 70.58333333333333,
        "date": "2026-10-02",
        "export_kwh": 27.297000000000004,
        "import_kwh": 17.713000000000005,
        "net_export_kwh": 9.584,
        "running_m01_kwh": 1098.3774999999998,
        "running_m02_kwh": 2580.226
      },
      {
        "average_temperature_f": 65.41666666666667,
        "date": "2026-10-01",
        "export_kwh": 19.761000000000006,
        "import_kwh": 12.204000000000002,
        "net_export_kwh": 7.557000000000004,
        "running_m01_kwh": 1080.6644999999999,
        "running_m02_kwh": 2552.929
      },
      {
        "average_temperature_f": 62.791666666666664,
        "date": "2026-09-30",
        "export_kwh": 35.751000000000005,
        "import_kwh": 9.8,
        "net_export_kwh": 25.951000000000004,
        "running_m01_kwh": 1068.4605,
        "running_m02_kwh": 2533.168
      },
      {
        "average_temperature_f": 61.125,
        "date": "2026-09-29",
        "export_kwh": 22.529000000000003,
        "import_kwh": 13.369,
        "net_export_kwh": 9.160000000000004,
        "running_m01_kwh": 1058.6605,
        "running_m02_kwh": 2497.417
      },
      {
        "average_temperature_f": 57.75,
        "date": "2026-09-28",
        "export_kwh": 13.363000000000001,
        "import_kwh": 15.979,
        "net_export_kwh": -2.615999999999998,
        "running_m01_kwh": 1045.2915,
        "running_m02_kwh": 2474.888
      },
      {
        "average_temperature_f": 59.166666666666664,
        "date": "2026-09-27",
        "export_kwh": 9.113000000000001,
        "import_kwh": 14.208000000000002,
        "net_export_kwh": -5.095000000000001,
        "running_m01_kwh": 1029.3125,
        "running_m02_kwh": 2461.525
      },
      {
        "average_temperature_f": 57.375,
        "date": "2026-09-26",
        "export_kwh": 3.663,
        "import_kwh": 17.435000000000002,
        "net_export_kwh": -13.772000000000002,
        "running_m01_kwh": 1015.1044999999999,
        "running_m02_kwh": 2452.4120000000003
      },
      {
        "average_temperature_f": 59.708333333333336,
        "date": "2026-09-25",
        "export_kwh": 28.85,
        "import_kwh": 10.213000000000001,
        "net_export_kwh": 18.637,
        "running_m01_kwh": 997.6694999999999,
        "running_m02_kwh": 2448.7490000000003
      },
      {
        "average_temperature_f": 55.083333333333336,
        "date": "2026-09-24",
        "export_kwh": 42.323,
        "import_kwh": 24.248499999999996,
        "net_export_kwh": 18.074500000000004,
        "running_m01_kwh": 987.4564999999999,
        "running_m02_kwh": 2419.8990000000003
      },
      {
        "average_temperature_f": 56.25,
        "date": "2026-09-23",
        "export_kwh": 46.727999999999994,
        "import_kwh": 12.553999999999998,
        "net_export_kwh": 34.17399999999999,
        "running_m01_kwh": 963.2079999999999,
        "running_m02_kwh": 2377.5760000000005
      },
      {
        "average_temperature_f": 58.333333333333336,
        "date": "2026-09-22",
        "export_kwh": 38.453,
        "import_kwh": 11.266000000000002,
        "net_export_kwh": 27.187,
        "running_m01_kwh": 950.6539999999999,
        "running_m02_kwh": 2330.8480000000004
      },
      {
        "average_temperature_f": 62.375,
        "date": "2026-09-21",
        "export_kwh": 48.714999999999996,
        "import_kwh": 13.101,
        "net_export_kwh": 35.614,
        "running_m01_kwh": 939.3879999999999,
        "running_m02_kwh": 2292.3950000000004
      },
      {
        "average_temperature_f": 62.083333333333336,
        "date": "2026-09-20",
        "export_kwh": 0.258,
        "import_kwh": 24.02,
        "net_export_kwh": -23.762,
        "running_m01_kwh": 926.2869999999999,
        "running_m02_kwh": 2243.6800000000003
      },
      {
        "average_temperature_f": 62.375,
        "date": "2026-09-19",
        "export_kwh": 49.601000000000006,
        "import_kwh": 12.957999999999998,
        "net_export_kwh": 36.64300000000001,
        "running_m01_kwh": 902.2669999999999,
        "running_m02_kwh": 2243.4220000000005
      },
      {
        "average_temperature_f": 71.45833333333333,
        "date": "2026-09-18",
        "export_kwh": 50.473,
        "import_kwh": 12.137,
        "net_export_kwh": 38.336,
        "running_m01_kwh": 889.309,
        "running_m02_kwh": 2193.8210000000004
      },
      {
        "average_temperature_f": 71.16666666666667,
        "date": "2026-09-17",
        "export_kwh": 16.822000000000003,
        "import_kwh": 13.528,
        "net_export_kwh": 3.2940000000000023,
        "running_m01_kwh": 877.1719999999999,
        "running_m02_kwh": 2143.3480000000004
      },
      {
        "average_temperature_f": 64.79166666666667,
        "date": "2026-09-16",
        "export_kwh": 41.06099999999999,
        "import_kwh": 12.502000000000002,
        "net_export_kwh": 28.55899999999999,
        "running_m01_kwh": 863.6439999999999,
        "running_m02_kwh": 2126.5260000000003
      },
      {
        "average_temperature_f": 59.208333333333336,
        "date": "2026-09-15",
        "export_kwh": 54.308,
        "import_kwh": 10.843,
        "net_export_kwh": 43.465,
        "running_m01_kwh": 851.1419999999999,
        "running_m02_kwh": 2085.465
      },
      {
        "average_temperature_f": 66.08333333333333,
        "date": "2026-09-14",
        "export_kwh": 58.55,
        "import_kwh": 12.922,
        "net_export_kwh": 45.628,
        "running_m01_kwh": 840.299,
        "running_m02_kwh": 2031.157
      },
      {
        "average_temperature_f": 67.875,
        "date": "2026-09-13",
        "export_kwh": 12.104999999999999,
        "import_kwh": 20.345,
        "net_export_kwh": -8.24,
        "running_m01_kwh": 827.377,
        "running_m02_kwh": 1972.607
      },
      {
        "average_temperature_f": 65.08333333333333,
        "date": "2026-09-12",
        "export_kwh": 42.747,
        "import_kwh": 12.502,
        "net_export_kwh": 30.244999999999997,
        "running_m01_kwh": 807.0319999999999,
        "running_m02_kwh": 1960.502
      },
      {
        "average_temperature_f": 68.125,
        "date": "2026-09-11",
        "export_kwh": 56.575,
        "import_kwh": 13.495000000000001,
        "net_export_kwh": 43.08,
        "running_m01_kwh": 794.53,
        "running_m02_kwh": 1917.7549999999999
      },
      {
        "average_temperature_f": 74.25,
        "date": "2026-09-10",
        "export_kwh": 41.741,
        "import_kwh": 15.444999999999999,
        "net_export_kwh": 26.296,
        "running_m01_kwh": 781.035,
        "running_m02_kwh": 1861.1799999999998
      },
      {
        "average_temperature_f": 69.25,
        "date": "2026-09-09",
        "export_kwh": 24.362,
        "import_kwh": 18.986,
        "net_export_kwh": 5.375999999999998,
        "running_m01_kwh": 765.5899999999999,
        "running_m02_kwh": 1819.4389999999999
      },
      {
        "average_temperature_f": 66.375,
        "date": "2026-09-08",
        "export_kwh": 57.392,
        "import_kwh": 14.15,
        "net_export_kwh": 43.242000000000004,
        "running_m01_kwh": 746.6039999999999,
        "running_m02_kwh": 1795.0769999999998
      },
      {
        "average_temperature_f": 64.54166666666667,
        "date": "2026-09-07",
        "export_kwh": 60.62,
        "import_kwh": 18.864,
        "net_export_kwh": 41.756,
        "running_m01_kwh": 732.454,
        "running_m02_kwh": 1737.6849999999997
      },
      {
        "average_temperature_f": 65.83333333333333,
        "date": "2026-09-06",
        "export_kwh": 50.772000000000006,
        "import_kwh": 14.487999999999998,
        "net_export_kwh": 36.284000000000006,
        "running_m01_kwh": 713.5899999999999,
        "running_m02_kwh": 1677.0649999999998
      },
      {
        "average_temperature_f": 69.0,
        "date": "2026-09-05",
        "export_kwh": 54.193000000000005,
        "import_kwh": 17.495,
        "net_export_kwh": 36.69800000000001,
        "running_m01_kwh": 699.102,
        "running_m02_kwh": 1626.293
      },
      {
        "average_temperature_f": 73.625,
        "date": "2026-09-04",
        "export_kwh": 48.01500000000001,
        "import_kwh": 21.779999999999998,
        "net_export_kwh": 26.23500000000001,
        "running_m01_kwh": 681.607,
        "running_m02_kwh": 1572.1
      },
      {
        "average_temperature_f": 72.66666666666667,
        "date": "2026-09-03",
        "export_kwh": 30.091000000000005,
        "import_kwh": 20.557,
        "net_export_kwh": 9.534000000000006,
        "running_m01_kwh": 659.827,
        "running_m02_kwh": 1524.0849999999998
      },
      {
        "average_temperature_f": 64.25,
        "date": "2026-09-02",
        "export_kwh": 6.6610000000000005,
        "import_kwh": 18.196,
        "net_export_kwh": -11.535,
        "running_m01_kwh": 639.27,
        "running_m02_kwh": 1493.994
      },
      {
        "average_temperature_f": 70.0,
        "date": "2026-09-01",
        "export_kwh": 13.552999999999999,
        "import_kwh": 31.992,
        "net_export_kwh": -18.439,
        "running_m01_kwh": 621.074,
        "running_m02_kwh": 1487.3329999999999
      },
      {
        "average_temperature_f": 69.70833333333333,
        "date": "2026-08-31",
        "export_kwh": 23.846,
        "import_kwh": 17.423000000000002,
        "net_export_kwh": 6.422999999999998,
        "running_m01_kwh": 589.082,
        "running_m02_kwh": 1473.7799999999997
      },
      {
        "average_temperature_f": 68.04166666666667,
        "date": "2026-08-30",
        "export_kwh": 29.434999999999995,
        "import_kwh": 23.648,
        "net_export_kwh": 5.7869999999999955,
        "running_m01_kwh": 571.659,
        "running_m02_kwh": 1449.9339999999997
      },
      {
        "average_temperature_f": 66.16666666666667,
        "date": "2026-08-29",
        "export_kwh": 62.72,
        "import_kwh": 18.425,
        "net_export_kwh": 44.295,
        "running_m01_kwh": 548.011,
        "running_m02_kwh": 1420.4989999999998
      },
      {
        "average_temperature_f": 72.75,
        "date": "2026-08-28",
        "export_kwh": 51.945,
        "import_kwh": 19.648999999999997,
        "net_export_kwh": 32.29600000000001,
        "running_m01_kwh": 529.586,
        "running_m02_kwh": 1357.7789999999998
      },
      {
        "average_temperature_f": 68.95833333333333,
        "date": "2026-08-27",
        "export_kwh": 13.26,
        "import_kwh": 22.099000000000007,
        "net_export_kwh": -8.839000000000008,
        "running_m01_kwh": 509.937,
        "running_m02_kwh": 1305.8339999999998
      },
      {
        "average_temperature_f": 67.95833333333333,
        "date": "2026-08-26",
        "export_kwh": 50.18000000000001,
        "import_kwh": 16.916999999999998,
        "net_export_kwh": 33.263000000000005,
        "running_m01_kwh": 487.838,
        "running_m02_kwh": 1292.5739999999998
      },
      {
        "average_temperature_f": 66.70833333333333,
        "date": "2026-08-25",
        "export_kwh": 58.351,
        "import_kwh": 14.598,
        "net_export_kwh": 43.753,
        "running_m01_kwh": 470.92100000000005,
        "running_m02_kwh": 1242.3939999999998
      },
      {
        "average_temperature_f": 67.33333333333333,
        "date": "2026-08-24",
        "export_kwh": 53.647,
        "import_kwh": 11.064,
        "net_export_kwh": 42.583,
        "running_m01_kwh": 456.32300000000004,
        "running_m02_kwh": 1184.043
      },
      {
        "average_temperature_f": 71.125,
        "date": "2026-08-23",
        "export_kwh": 54.527,
        "import_kwh": 15.83,
        "net_export_kwh": 38.697,
        "running_m01_kwh": 445.259,
        "running_m02_kwh": 1130.396
      },
      {
        "average_temperature_f": 67.83333333333333,
        "date": "2026-08-22",
        "export_kwh": 43.131,
        "import_kwh": 14.395999999999999,
        "net_export_kwh": 28.735,
        "running_m01_kwh": 429.42900000000003,
        "running_m02_kwh": 1075.869
      },
      {
        "average_temperature_f": 68.125,
        "date": "2026-08-21",
        "export_kwh": 50.805,
        "import_kwh": 15.841000000000001,
        "net_export_kwh": 34.964,
        "running_m01_kwh": 415.033,
        "running_m02_kwh": 1032.7379999999998
      },
      {
        "average_temperature_f": 69.0,
        "date": "2026-08-20",
        "export_kwh": 20.433999999999997,
        "import_kwh": 18.233999999999998,
        "net_export_kwh": 2.1999999999999993,
        "running_m01_kwh": 399.192,
        "running_m02_kwh": 981.9329999999999
      },
      {
        "average_temperature_f": 72.58333333333333,
        "date": "2026-08-19",
        "export_kwh": 58.817,
        "import_kwh": 17.951999999999998,
        "net_export_kwh": 40.865,
        "running_m01_kwh": 380.958,
        "running_m02_kwh": 961.4989999999999
      },
      {
        "average_temperature_f": 74.79166666666667,
        "date": "2026-08-18",
        "export_kwh": 51.056999999999995,
        "import_kwh": 18.815999999999995,
        "net_export_kwh": 32.241,
        "running_m01_kwh": 363.00600000000003,
        "running_m02_kwh": 902.6819999999999
      },
      {
        "average_temperature_f": 71.0,
        "date": "2026-08-17",
        "export_kwh": 23.127,
        "import_kwh": 17.965999999999998,
        "net_export_kwh": 5.161000000000001,
        "running_m01_kwh": 344.19000000000005,
        "running_m02_kwh": 851.6249999999999
      },
      {
        "average_temperature_f": 68.45833333333333,
        "date": "2026-08-16",
        "export_kwh": 27.362000000000002,
        "import_kwh": 14.489,
        "net_export_kwh": 12.873000000000001,
        "running_m01_kwh": 326.22400000000005,
        "running_m02_kwh": 828.4979999999999
      },
      {
        "average_temperature_f": 70.29166666666667,
        "date": "2026-08-15",
        "export_kwh": 67.686,
        "import_kwh": 14.296999999999999,
        "net_export_kwh": 53.38900000000001,
        "running_m01_kwh": 311.73500000000007,
        "running_m02_kwh": 801.136
      },
      {
        "average_temperature_f": 72.91666666666667,
        "date": "2026-08-14",
        "export_kwh": 55.583,
        "import_kwh": 16.689,
        "net_export_kwh": 38.894,
        "running_m01_kwh": 297.43800000000005,
        "running_m02_kwh": 733.4499999999999
      },
      {
        "average_temperature_f": 73.375,
        "date": "2026-08-13",
        "export_kwh": 49.40200000000001,
        "import_kwh": 16.741,
        "net_export_kwh": 32.66100000000001,
        "running_m01_kwh": 280.749,
        "running_m02_kwh": 677.867
      },
      {
        "average_temperature_f": 73.625,
        "date": "2026-08-12",
        "export_kwh": 59.69800000000001,
        "import_kwh": 15.764999999999999,
        "net_export_kwh": 43.93300000000001,
        "running_m01_kwh": 264.00800000000004,
        "running_m02_kwh": 628.4649999999999
      },
      {
        "average_temperature_f": 74.29166666666667,
        "date": "2026-08-11",
        "export_kwh": 41.707,
        "import_kwh": 14.802999999999999,
        "net_export_kwh": 26.904000000000003,
        "running_m01_kwh": 248.24300000000002,
        "running_m02_kwh": 568.7669999999999
      },
      {
        "average_temperature_f": 73.0,
        "date": "2026-08-10",
        "export_kwh": 45.759,
        "import_kwh": 11.718,
        "net_export_kwh": 34.041,
        "running_m01_kwh": 233.44000000000003,
        "running_m02_kwh": 527.06
      },
      {
        "average_temperature_f": 77.375,
        "date": "2026-08-09",
        "export_kwh": 62.330000000000005,
        "import_kwh": 16.497,
        "net_export_kwh": 45.833000000000006,
        "running_m01_kwh": 221.72200000000004,
        "running_m02_kwh": 481.301
      },
      {
        "average_temperature_f": 76.20833333333333,
        "date": "2026-08-08",
        "export_kwh": 47.903999999999996,
        "import_kwh": 20.614,
        "net_export_kwh": 27.289999999999996,
        "running_m01_kwh": 205.22500000000002,
        "running_m02_kwh": 418.971
      },
      {
        "average_temperature_f": 78.04166666666667,
        "date": "2026-08-07",
        "export_kwh": 46.775,
        "import_kwh": 26.055,
        "net_export_kwh": 20.72,
        "running_m01_kwh": 184.61100000000002,
        "running_m02_kwh": 371.067
      },
      {
        "average_temperature_f": 79.625,
        "date": "2026-08-06",
        "export_kwh": 60.50899999999999,
        "import_kwh": 16.281,
        "net_export_kwh": 44.227999999999994,
        "running_m01_kwh": 158.556,
        "running_m02_kwh": 324.29200000000003
      },
      {
        "average_temperature_f": 72.41666666666667,
        "date": "2026-08-05",
        "export_kwh": 52.985,
        "import_kwh": 11.693999999999999,
        "net_export_kwh": 41.291,
        "running_m01_kwh": 142.275,
        "running_m02_kwh": 263.783
      },
      {
        "average_temperature_f": 72.04166666666667,
        "date": "2026-08-04",
        "export_kwh": 75.92099999999999,
        "import_kwh": 19.073,
        "net_export_kwh": 56.84799999999999,
        "running_m01_kwh": 130.58100000000002,
        "running_m02_kwh": 210.798
      },
      {
        "average_temperature_f": 73.95833333333333,
        "date": "2026-08-03",
        "export_kwh": 25.385999999999996,
        "import_kwh": 32.733000000000004,
        "net_export_kwh": -7.347000000000008,
        "running_m01_kwh": 111.50800000000001,
        "running_m02_kwh": 134.877
      },
      {
        "average_temperature_f": 75.66666666666667,
        "date": "2026-08-02",
        "export_kwh": 32.042,
        "import_kwh": 25.201999999999998,
        "net_export_kwh": 6.840000000000003,
        "running_m01_kwh": 78.775,
        "running_m02_kwh": 109.491
      },
      {
        "average_temperature_f": 74.75,
        "date": "2026-08-01",
        "export_kwh": 28.766000000000002,
        "import_kwh": 35.985,
        "net_export_kwh": -7.218999999999998,
        "running_m01_kwh": 53.573,
        "running_m02_kwh": 77.449
      },
      {
        "average_temperature_f": 72.33333333333333,
        "date": "2026-07-31",
        "export_kwh": 48.683,
        "import_kwh": 17.588,
        "net_export_kwh": 31.095,
        "running_m01_kwh": 17.588,
        "running_m02_kwh": 48.683
      }
    ],
    "hourly": [
      {
        "export_kwh": 0.0,
        "hour": 0,
        "import_kwh": 72.28999999999998,
        "label": "12 AM",
        "net_export_kwh": -72.28999999999998
      },
      {
        "export_kwh": 0.0,
        "hour": 1,
        "import_kwh": 59.037,
        "label": "1 AM",
        "net_export_kwh": -59.037
      },
      {
        "export_kwh": 0.0,
        "hour": 2,
        "import_kwh": 45.107999999999976,
        "label": "2 AM",
        "net_export_kwh": -45.107999999999976
      },
      {
        "export_kwh": 0.0,
        "hour": 3,
        "import_kwh": 42.17600000000001,
        "label": "3 AM",
        "net_export_kwh": -42.17600000000001
      },
      {
        "export_kwh": 0.0,
        "hour": 4,
        "import_kwh": 39.246,
        "label": "4 AM",
        "net_export_kwh": -39.246
      },
      {
        "export_kwh": 0.0,
        "hour": 5,
        "import_kwh": 36.02900000000001,
        "label": "5 AM",
        "net_export_kwh": -36.02900000000001
      },
      {
        "export_kwh": 0.094,
        "hour": 6,
        "import_kwh": 33.86399999999999,
        "label": "6 AM",
        "net_export_kwh": -33.76999999999999
      },
      {
        "export_kwh": 3.434999999999999,
        "hour": 7,
        "import_kwh": 32.602000000000004,
        "label": "7 AM",
        "net_export_kwh": -29.167000000000005
      },
      {
        "export_kwh": 19.579999999999995,
        "hour": 8,
        "import_kwh": 25.370000000000005,
        "label": "8 AM",
        "net_export_kwh": -5.79000000000001
      },
      {
        "export_kwh": 74.61100000000005,
        "hour": 9,
        "import_kwh": 19.206500000000002,
        "label": "9 AM",
        "net_export_kwh": 55.40450000000004
      },
      {
        "export_kwh": 339.9790000000001,
        "hour": 10,
        "import_kwh": 9.078000000000001,
        "label": "10 AM",
        "net_export_kwh": 330.9010000000001
      },
      {
        "export_kwh": 406.752,
        "hour": 11,
        "import_kwh": 8.615999999999998,
        "label": "11 AM",
        "net_export_kwh": 398.136
      },
      {
        "export_kwh": 457.55499999999995,
        "hour": 12,
        "import_kwh": 4.929999999999999,
        "label": "12 PM",
        "net_export_kwh": 452.62499999999994
      },
      {
        "export_kwh": 449.565,
        "hour": 13,
        "import_kwh": 4.021,
        "label": "1 PM",
        "net_export_kwh": 445.544
      },
      {
        "export_kwh": 383.9960000000001,
        "hour": 14,
        "import_kwh": 6.2029999999999985,
        "label": "2 PM",
        "net_export_kwh": 377.7930000000001
      },
      {
        "export_kwh": 285.235,
        "hour": 15,
        "import_kwh": 11.261999999999999,
        "label": "3 PM",
        "net_export_kwh": 273.973
      },
      {
        "export_kwh": 188.253,
        "hour": 16,
        "import_kwh": 20.171,
        "label": "4 PM",
        "net_export_kwh": 168.082
      },
      {
        "export_kwh": 77.50199999999997,
        "hour": 17,
        "import_kwh": 42.315,
        "label": "5 PM",
        "net_export_kwh": 35.18699999999997
      },
      {
        "export_kwh": 10.593000000000002,
        "hour": 18,
        "import_kwh": 89.58600000000001,
        "label": "6 PM",
        "net_export_kwh": -78.99300000000001
      },
      {
        "export_kwh": 0.09400000000000001,
        "hour": 19,
        "import_kwh": 122.528,
        "label": "7 PM",
        "net_export_kwh": -122.43400000000001
      },
      {
        "export_kwh": 0.0,
        "hour": 20,
        "import_kwh": 120.72599999999997,
        "label": "8 PM",
        "net_export_kwh": -120.72599999999997
      },
      {
        "export_kwh": 0.0,
        "hour": 21,
        "import_kwh": 113.42600000000003,
        "label": "9 PM",
        "net_export_kwh": -113.42600000000003
      },
      {
        "export_kwh": 0.0,
        "hour": 22,
        "import_kwh": 103.70499999999998,
        "label": "10 PM",
        "net_export_kwh": -103.70499999999998
      },
      {
        "export_kwh": 0.0,
        "hour": 23,
        "import_kwh": 93.68100000000001,
        "label": "11 PM",
        "net_export_kwh": -93.68100000000001
      }
    ],
    "monthly": [
      {
        "days": 1,
        "export_kwh": 48.683,
        "import_kwh": 17.588,
        "month": "July 2026",
        "month_key": "2026-07",
        "net_export_kwh": 31.095
      },
      {
        "days": 31,
        "export_kwh": 1425.0969999999998,
        "import_kwh": 571.494,
        "month": "August 2026",
        "month_key": "2026-08",
        "net_export_kwh": 853.6029999999997
      },
      {
        "days": 30,
        "export_kwh": 1059.3880000000001,
        "import_kwh": 479.3785000000001,
        "month": "September 2026",
        "month_key": "2026-09",
        "net_export_kwh": 580.0095000000001
      },
      {
        "days": 6,
        "export_kwh": 164.07600000000002,
        "import_kwh": 86.716,
        "month": "October 2026",
        "month_key": "2026-10",
        "net_export_kwh": 77.36000000000003
      }
    ],
    "row_count": 1632,
    "source_end": "2026-10-06",
    "source_name": "NYSEG_Daily_Usage_Data.csv",
    "source_start": "2026-07-31",
    "summary": {
      "daytime_export_kwh": 2663.4480000000003,
      "export_kwh": 2697.2439999999997,
      "export_to_import_ratio": 2.334919382449349,
      "import_kwh": 1155.1764999999998,
      "largest_export_hour": {
        "export_kwh": 457.55499999999995,
        "hour": 12,
        "import_kwh": 4.929999999999999,
        "label": "12 PM",
        "net_export_kwh": 452.62499999999994
      },
      "largest_import_hour": {
        "export_kwh": 0.09400000000000001,
        "hour": 19,
        "import_kwh": 122.528,
        "label": "7 PM",
        "net_export_kwh": -122.43400000000001
      },
      "net_export_kwh": 1542.0674999999999,
      "overnight_import_kwh": 1004.0040000000001
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
        "end_of_day_meter_kwh": 2014.737,
        "entry_date": "2026-08-08",
        "production_kwh": 71.539
      },
      "2026-08-09": {
        "available": true,
        "end_of_day_meter_kwh": 2095.7,
        "entry_date": "2026-08-09",
        "production_kwh": 80.964
      },
      "2026-08-10": {
        "available": true,
        "end_of_day_meter_kwh": 2155.756,
        "entry_date": "2026-08-10",
        "production_kwh": 60.055
      },
      "2026-08-11": {
        "available": true,
        "end_of_day_meter_kwh": 2213.553,
        "entry_date": "2026-08-11",
        "production_kwh": 57.798
      },
      "2026-08-12": {
        "available": true,
        "end_of_day_meter_kwh": 2291.767,
        "entry_date": "2026-08-12",
        "production_kwh": 78.213
      },
      "2026-08-13": {
        "available": true,
        "end_of_day_meter_kwh": 2356.684,
        "entry_date": "2026-08-13",
        "production_kwh": 64.917
      },
      "2026-08-14": {
        "available": true,
        "end_of_day_meter_kwh": 2428.421,
        "entry_date": "2026-08-14",
        "production_kwh": 71.737
      },
      "2026-08-15": {
        "available": true,
        "end_of_day_meter_kwh": 2507.325,
        "entry_date": "2026-08-15",
        "production_kwh": 78.904
      },
      "2026-08-16": {
        "available": true,
        "end_of_day_meter_kwh": 2546.399,
        "entry_date": "2026-08-16",
        "production_kwh": 39.074
      },
      "2026-08-17": {
        "available": true,
        "end_of_day_meter_kwh": 2584.131,
        "entry_date": "2026-08-17",
        "production_kwh": 37.732
      },
      "2026-08-18": {
        "available": true,
        "end_of_day_meter_kwh": 2651.952,
        "entry_date": "2026-08-18",
        "production_kwh": 67.821
      },
      "2026-08-19": {
        "available": true,
        "end_of_day_meter_kwh": 2729.42,
        "entry_date": "2026-08-19",
        "production_kwh": 77.469
      },
      "2026-08-20": {
        "available": true,
        "end_of_day_meter_kwh": 2759.722,
        "entry_date": "2026-08-20",
        "production_kwh": 30.302
      },
      "2026-08-21": {
        "available": true,
        "end_of_day_meter_kwh": 2825.448,
        "entry_date": "2026-08-21",
        "production_kwh": 65.726
      },
      "2026-08-22": {
        "available": true,
        "end_of_day_meter_kwh": 2881.379,
        "entry_date": "2026-08-22",
        "production_kwh": 55.931
      },
      "2026-08-23": {
        "available": true,
        "end_of_day_meter_kwh": 2945.648,
        "entry_date": "2026-08-23",
        "production_kwh": 64.268
      },
      "2026-08-24": {
        "available": true,
        "end_of_day_meter_kwh": 3014.539,
        "entry_date": "2026-08-24",
        "production_kwh": 68.892
      },
      "2026-08-25": {
        "available": true,
        "end_of_day_meter_kwh": 3085.353,
        "entry_date": "2026-08-25",
        "production_kwh": 70.813
      },
      "2026-08-26": {
        "available": true,
        "end_of_day_meter_kwh": 3148.676,
        "entry_date": "2026-08-26",
        "production_kwh": 63.323
      },
      "2026-08-27": {
        "available": true,
        "end_of_day_meter_kwh": 3175.018,
        "entry_date": "2026-08-27",
        "production_kwh": 26.342
      },
      "2026-08-28": {
        "available": true,
        "end_of_day_meter_kwh": 3246.001,
        "entry_date": "2026-08-28",
        "production_kwh": 70.984
      },
      "2026-08-29": {
        "available": true,
        "end_of_day_meter_kwh": 3325.772,
        "entry_date": "2026-08-29",
        "production_kwh": 79.771
      },
      "2026-08-30": {
        "available": true,
        "end_of_day_meter_kwh": 3366.74,
        "entry_date": "2026-08-30",
        "production_kwh": 40.967
      },
      "2026-08-31": {
        "available": true,
        "end_of_day_meter_kwh": 3404.728,
        "entry_date": "2026-08-31",
        "production_kwh": 37.988
      },
      "2026-09-01": {
        "available": true,
        "end_of_day_meter_kwh": 3432.622,
        "entry_date": "2026-09-01",
        "production_kwh": 27.894
      },
      "2026-09-02": {
        "available": true,
        "end_of_day_meter_kwh": 3450.853,
        "entry_date": "2026-09-02",
        "production_kwh": 18.231
      },
      "2026-09-03": {
        "available": true,
        "end_of_day_meter_kwh": 3498.839,
        "entry_date": "2026-09-03",
        "production_kwh": 47.986
      },
      "2026-09-04": {
        "available": true,
        "end_of_day_meter_kwh": 3565.13,
        "entry_date": "2026-09-04",
        "production_kwh": 66.291
      },
      "2026-09-05": {
        "available": true,
        "end_of_day_meter_kwh": 3632.427,
        "entry_date": "2026-09-05",
        "production_kwh": 67.298
      },
      "2026-09-06": {
        "available": true,
        "end_of_day_meter_kwh": 3694.236,
        "entry_date": "2026-09-06",
        "production_kwh": 61.809
      },
      "2026-09-07": {
        "available": true,
        "end_of_day_meter_kwh": 3765.83,
        "entry_date": "2026-09-07",
        "production_kwh": 71.594
      },
      "2026-09-08": {
        "available": true,
        "end_of_day_meter_kwh": 3833.505,
        "entry_date": "2026-09-08",
        "production_kwh": 67.675
      },
      "2026-09-09": {
        "available": true,
        "end_of_day_meter_kwh": 3870.529,
        "entry_date": "2026-09-09",
        "production_kwh": 37.023
      },
      "2026-09-10": {
        "available": true,
        "end_of_day_meter_kwh": 3926.292,
        "entry_date": "2026-09-10",
        "production_kwh": 55.764
      },
      "2026-09-11": {
        "available": true,
        "end_of_day_meter_kwh": 3998.09,
        "entry_date": "2026-09-11",
        "production_kwh": 71.798
      },
      "2026-09-12": {
        "available": true,
        "end_of_day_meter_kwh": 4055.079,
        "entry_date": "2026-09-12",
        "production_kwh": 56.989
      },
      "2026-09-13": {
        "available": true,
        "end_of_day_meter_kwh": 4078.251,
        "entry_date": "2026-09-13",
        "production_kwh": 23.172
      },
      "2026-09-14": {
        "available": true,
        "end_of_day_meter_kwh": 4145.622,
        "entry_date": "2026-09-14",
        "production_kwh": 67.371
      },
      "2026-09-15": {
        "available": true,
        "end_of_day_meter_kwh": 4211.415,
        "entry_date": "2026-09-15",
        "production_kwh": 65.793
      },
      "2026-09-16": {
        "available": true,
        "end_of_day_meter_kwh": 4260.702,
        "entry_date": "2026-09-16",
        "production_kwh": 49.287
      },
      "2026-09-17": {
        "available": true,
        "end_of_day_meter_kwh": 4286.211,
        "entry_date": "2026-09-17",
        "production_kwh": 25.51
      },
      "2026-09-18": {
        "available": true,
        "end_of_day_meter_kwh": 4345.86,
        "entry_date": "2026-09-18",
        "production_kwh": 59.648
      },
      "2026-09-19": {
        "available": true,
        "end_of_day_meter_kwh": 4403.97,
        "entry_date": "2026-09-19",
        "production_kwh": 58.111
      },
      "2026-09-20": {
        "available": true,
        "end_of_day_meter_kwh": 4409.109,
        "entry_date": "2026-09-20",
        "production_kwh": 5.138
      },
      "2026-09-21": {
        "available": true,
        "end_of_day_meter_kwh": 4467.049,
        "entry_date": "2026-09-21",
        "production_kwh": 57.94
      },
      "2026-09-22": {
        "available": true,
        "end_of_day_meter_kwh": 4518.053,
        "entry_date": "2026-09-22",
        "production_kwh": 51.004
      },
      "2026-09-23": {
        "available": true,
        "end_of_day_meter_kwh": 4573.525,
        "entry_date": "2026-09-23",
        "production_kwh": 55.471
      },
      "2026-09-24": {
        "available": true,
        "end_of_day_meter_kwh": 4626.281,
        "entry_date": "2026-09-24",
        "production_kwh": 52.757
      },
      "2026-09-25": {
        "available": true,
        "end_of_day_meter_kwh": 4663.32,
        "entry_date": "2026-09-25",
        "production_kwh": 37.038
      },
      "2026-09-26": {
        "available": true,
        "end_of_day_meter_kwh": 4674.925,
        "entry_date": "2026-09-26",
        "production_kwh": 11.605
      },
      "2026-09-27": {
        "available": true,
        "end_of_day_meter_kwh": 4694.577,
        "entry_date": "2026-09-27",
        "production_kwh": 19.652
      },
      "2026-09-28": {
        "available": true,
        "end_of_day_meter_kwh": 4718.174,
        "entry_date": "2026-09-28",
        "production_kwh": 23.597
      },
      "2026-09-29": {
        "available": true,
        "end_of_day_meter_kwh": 4749.468,
        "entry_date": "2026-09-29",
        "production_kwh": 31.294
      },
      "2026-09-30": {
        "available": true,
        "end_of_day_meter_kwh": 4793.326,
        "entry_date": "2026-09-30",
        "production_kwh": 43.858
      },
      "2026-10-01": {
        "available": true,
        "end_of_day_meter_kwh": 4822.57,
        "entry_date": "2026-10-01",
        "production_kwh": 29.245
      },
      "2026-10-02": {
        "available": true,
        "end_of_day_meter_kwh": 4862.559,
        "entry_date": "2026-10-02",
        "production_kwh": 39.988
      },
      "2026-10-03": {
        "available": true,
        "end_of_day_meter_kwh": 4907.283,
        "entry_date": "2026-10-03",
        "production_kwh": 44.724
      },
      "2026-10-04": {
        "available": true,
        "end_of_day_meter_kwh": 4932.475,
        "entry_date": "2026-10-04",
        "production_kwh": 25.192
      },
      "2026-10-05": {
        "available": true,
        "end_of_day_meter_kwh": 4979.235,
        "entry_date": "2026-10-05",
        "production_kwh": 46.76
      },
      "2026-10-06": {
        "available": true,
        "end_of_day_meter_kwh": 5026.317,
        "entry_date": "2026-10-06",
        "production_kwh": 47.082
      },
      "2026-10-07": {
        "available": true,
        "end_of_day_meter_kwh": 5070.746,
        "entry_date": "2026-10-07",
        "production_kwh": 44.43
      }
    },
    "latest_available_date": "2026-10-07",
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
        "end_of_day_meter_kwh": 2014.737,
        "entry_date": "2026-08-08",
        "production_kwh": 71.539
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 2095.7,
        "entry_date": "2026-08-09",
        "production_kwh": 80.964
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 2155.756,
        "entry_date": "2026-08-10",
        "production_kwh": 60.055
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 2213.553,
        "entry_date": "2026-08-11",
        "production_kwh": 57.798
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 2291.767,
        "entry_date": "2026-08-12",
        "production_kwh": 78.213
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 2356.684,
        "entry_date": "2026-08-13",
        "production_kwh": 64.917
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 2428.421,
        "entry_date": "2026-08-14",
        "production_kwh": 71.737
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 2507.325,
        "entry_date": "2026-08-15",
        "production_kwh": 78.904
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 2546.399,
        "entry_date": "2026-08-16",
        "production_kwh": 39.074
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 2584.131,
        "entry_date": "2026-08-17",
        "production_kwh": 37.732
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 2651.952,
        "entry_date": "2026-08-18",
        "production_kwh": 67.821
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 2729.42,
        "entry_date": "2026-08-19",
        "production_kwh": 77.469
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 2759.722,
        "entry_date": "2026-08-20",
        "production_kwh": 30.302
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 2825.448,
        "entry_date": "2026-08-21",
        "production_kwh": 65.726
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 2881.379,
        "entry_date": "2026-08-22",
        "production_kwh": 55.931
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 2945.648,
        "entry_date": "2026-08-23",
        "production_kwh": 64.268
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 3014.539,
        "entry_date": "2026-08-24",
        "production_kwh": 68.892
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 3085.353,
        "entry_date": "2026-08-25",
        "production_kwh": 70.813
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 3148.676,
        "entry_date": "2026-08-26",
        "production_kwh": 63.323
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 3175.018,
        "entry_date": "2026-08-27",
        "production_kwh": 26.342
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 3246.001,
        "entry_date": "2026-08-28",
        "production_kwh": 70.984
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 3325.772,
        "entry_date": "2026-08-29",
        "production_kwh": 79.771
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 3366.74,
        "entry_date": "2026-08-30",
        "production_kwh": 40.967
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 3404.728,
        "entry_date": "2026-08-31",
        "production_kwh": 37.988
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 3432.622,
        "entry_date": "2026-09-01",
        "production_kwh": 27.894
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 3450.853,
        "entry_date": "2026-09-02",
        "production_kwh": 18.231
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 3498.839,
        "entry_date": "2026-09-03",
        "production_kwh": 47.986
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 3565.13,
        "entry_date": "2026-09-04",
        "production_kwh": 66.291
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 3632.427,
        "entry_date": "2026-09-05",
        "production_kwh": 67.298
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 3694.236,
        "entry_date": "2026-09-06",
        "production_kwh": 61.809
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 3765.83,
        "entry_date": "2026-09-07",
        "production_kwh": 71.594
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 3833.505,
        "entry_date": "2026-09-08",
        "production_kwh": 67.675
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 3870.529,
        "entry_date": "2026-09-09",
        "production_kwh": 37.023
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 3926.292,
        "entry_date": "2026-09-10",
        "production_kwh": 55.764
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 3998.09,
        "entry_date": "2026-09-11",
        "production_kwh": 71.798
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 4055.079,
        "entry_date": "2026-09-12",
        "production_kwh": 56.989
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 4078.251,
        "entry_date": "2026-09-13",
        "production_kwh": 23.172
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 4145.622,
        "entry_date": "2026-09-14",
        "production_kwh": 67.371
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 4211.415,
        "entry_date": "2026-09-15",
        "production_kwh": 65.793
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 4260.702,
        "entry_date": "2026-09-16",
        "production_kwh": 49.287
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 4286.211,
        "entry_date": "2026-09-17",
        "production_kwh": 25.51
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 4345.86,
        "entry_date": "2026-09-18",
        "production_kwh": 59.648
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 4403.97,
        "entry_date": "2026-09-19",
        "production_kwh": 58.111
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 4409.109,
        "entry_date": "2026-09-20",
        "production_kwh": 5.138
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 4467.049,
        "entry_date": "2026-09-21",
        "production_kwh": 57.94
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 4518.053,
        "entry_date": "2026-09-22",
        "production_kwh": 51.004
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 4573.525,
        "entry_date": "2026-09-23",
        "production_kwh": 55.471
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 4626.281,
        "entry_date": "2026-09-24",
        "production_kwh": 52.757
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 4663.32,
        "entry_date": "2026-09-25",
        "production_kwh": 37.038
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 4674.925,
        "entry_date": "2026-09-26",
        "production_kwh": 11.605
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 4694.577,
        "entry_date": "2026-09-27",
        "production_kwh": 19.652
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 4718.174,
        "entry_date": "2026-09-28",
        "production_kwh": 23.597
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 4749.468,
        "entry_date": "2026-09-29",
        "production_kwh": 31.294
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 4793.326,
        "entry_date": "2026-09-30",
        "production_kwh": 43.858
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 4822.57,
        "entry_date": "2026-10-01",
        "production_kwh": 29.245
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 4862.559,
        "entry_date": "2026-10-02",
        "production_kwh": 39.988
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 4907.283,
        "entry_date": "2026-10-03",
        "production_kwh": 44.724
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 4932.475,
        "entry_date": "2026-10-04",
        "production_kwh": 25.192
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 4979.235,
        "entry_date": "2026-10-05",
        "production_kwh": 46.76
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 5026.317,
        "entry_date": "2026-10-06",
        "production_kwh": 47.082
      },
      {
        "available": true,
        "end_of_day_meter_kwh": 5070.746,
        "entry_date": "2026-10-07",
        "production_kwh": 44.43
      },
      {
        "available": false,
        "end_of_day_meter_kwh": 0.0,
        "entry_date": "2026-10-08",
        "production_kwh": 0.0
      },
      {
        "available": false,
        "end_of_day_meter_kwh": 0.0,
        "entry_date": "2026-10-09",
        "production_kwh": 0.0
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
