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

## Notes

- The app stores its data in Firestore collections `solar_tracker_config` and `solar_daily_entries`.
- The app seeds your system configuration and a few starter sample entries on first run if the Firestore collections are empty.
- The “Virtual Consumption Monitor” estimates daytime home usage and self-consumption until CT data exists.
- Automated NYSEG/SolarEdge ingestion, AI Q&A, PDF reporting, and ML predictions are intentionally left as future-ready extension points in this first version.
