# Solar Production & Consumption Tracker

A starter web application for tracking a residential Sunrun solar system using manual daily entries, Firebase Firestore storage, and a dashboard with production, consumption, contract, and financial analytics.

## Features in this MVP

- Manual daily solar and smart meter entry
- Firebase Firestore-backed storage
- Dashboard cards for production, import/export, offset, guarantee progress, and savings
- Annual production projection and contract tracking
- Virtual consumption monitor estimates for systems without CTs
- Plotly charts for daily production, meter flow, rolling averages, irradiance correlation, and monthly totals
- CSV export of historical daily data
- Configurable contract and financial assumptions
- AI Solar Analyst panel with grounded Q&A, forecast prompts, anomaly checks, and optional OpenAI-enhanced answers

## Tech Stack

- Python
- Flask
- Firestore REST via Firebase web config
- Firebase Firestore
- Bootstrap
- Plotly

## Quick Start

1. Create a virtual environment and activate it.
2. Install dependencies:

```bash
pip install -r requirements.txt
```

3. Confirm `firebase-config.js` contains your Firebase web app config.
4. Run the app:

```bash
python app.py
```

5. Open `http://127.0.0.1:5000`

## AI Features

- The dashboard includes an `AI Solar Analyst` panel with suggested prompts such as:
  - `Am I on track to hit my guarantee?`
  - `What caused today's low production?`
  - `Estimate next month's production.`
  - `Predict annual savings.`
- By default, the app answers using grounded dashboard rules from your current production, irradiance, meter, weather, and contract data.
- To enable OpenAI-enhanced answers, set an environment variable before launching the app:

```bash
set OPENAI_API_KEY=your_key_here
```

- Optional:

```bash
set OPENAI_MODEL=gpt-5
```

## Notes

- The app stores its data in Firestore collections `solar_tracker_config` and `solar_daily_entries`.
- The app seeds your system configuration and a few starter sample entries on first run if the Firestore collections are empty.
- The “Virtual Consumption Monitor” estimates daytime home usage and self-consumption until CT data exists.
- Automated NYSEG/SolarEdge ingestion, inverter-level diagnostics, PDF reporting, and full ML forecasting remain future-ready extension points beyond this phase.
