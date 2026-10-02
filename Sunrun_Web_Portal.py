
from __future__ import annotations

import json
import os
import subprocess
import sys
import threading
import webbrowser
from datetime import datetime
from pathlib import Path
from typing import Any

from flask import Flask, Response, flash, redirect, render_template_string, request, send_file, url_for

ROOT_DIR = Path(
    r"C:\Software Developement\ChatGPT Codex\Solar Energy - SunRun"
)
SCRIPT_DIR = ROOT_DIR / "SunRun Data" / "Script"
CONTROLLER = SCRIPT_DIR / "run_sunrun_daily.py"
JSON_FILE = ROOT_DIR / "JSON" / "Solar_Daily_History.json"
REPORT_DIR = ROOT_DIR / "Report"
CHART_DIR = REPORT_DIR / "charts"
LOG_DIR = SCRIPT_DIR / "automation_logs"
BACKUP_DIR = ROOT_DIR / "JSON" / "backups"
LOAD_HISTORY_FILE = ROOT_DIR / "JSON" / "Daily_Load_History.json"
APPLICATION_DATA_FILE = ROOT_DIR / "JSON" / "application_data_current.json"
METER_SYNC_LOG_FILE = SCRIPT_DIR / "automation_logs" / "meter_sync.log"
WEATHER_SYNC_LOG_FILE = SCRIPT_DIR / "automation_logs" / "evening_weather_sync.log"

if str(SCRIPT_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPT_DIR))

from sunrun_json import recalculate_all, save_history
from solar_tracker.monthly_bill import build_net_metering_report

HOST = "127.0.0.1"
PORT = 8765
ENERGY_RATE_PER_KWH = 0.29

app = Flask(__name__)
app.secret_key = "sunrun-local-portal"

process_lock = threading.Lock()
process_state: dict[str, Any] = {
    "running": False,
    "started": None,
    "finished": None,
    "command": None,
    "returncode": None,
    "output": "No process has been run from the portal yet.",
}


BASE_HTML = r"""
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{{ title }} · Sunrun Energy Portal</title>
<style>
:root{
  --navy:#073b78;--blue:#1455c0;--sky:#eaf4ff;--green:#15803d;
  --orange:#c85a00;--red:#b42318;--ink:#172033;--muted:#64748b;
  --line:#dbe5f0;--panel:#ffffff;--bg:#eef4fa;
}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);font-family:Arial,Helvetica,sans-serif;color:var(--ink)}
header{background:linear-gradient(135deg,#062f62,#0b4d97);color:white;padding:24px 30px}
.header-wrap{max-width:1250px;margin:auto;display:flex;gap:20px;align-items:center;justify-content:space-between}
.brand{font-size:30px;font-weight:900}.subtitle{color:#dbeafe;margin-top:5px}
nav{background:white;border-bottom:1px solid var(--line);position:sticky;top:0;z-index:5}
nav .nav-wrap{max-width:1250px;margin:auto;display:flex;gap:8px;padding:10px 18px;flex-wrap:wrap}
nav a{text-decoration:none;color:var(--navy);padding:10px 14px;border-radius:10px;font-weight:700}
nav a:hover{background:var(--sky)}
main{max-width:1250px;margin:24px auto;padding:0 18px 40px}
.card{background:white;border:1px solid var(--line);border-radius:16px;padding:22px;box-shadow:0 5px 20px rgba(15,23,42,.05);margin-bottom:18px}
.grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
.grid-2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px}
.metric{padding:18px;border-radius:14px;background:#f8fbff;border:1px solid #dbeafe}
.metric .label{font-size:13px;font-weight:800;letter-spacing:.6px;text-transform:uppercase;color:var(--muted)}
.metric .value{font-size:27px;font-weight:900;margin-top:8px;color:var(--navy)}
.metric .note{font-size:13px;color:var(--muted);margin-top:5px}
h1,h2,h3{color:var(--navy)} h1{margin-top:0}
button,.button{display:inline-block;border:0;border-radius:10px;padding:11px 16px;font-weight:800;cursor:pointer;text-decoration:none}
.primary{background:var(--blue);color:white}.success{background:var(--green);color:white}
.warning{background:#f59e0b;color:#111827}.danger{background:var(--red);color:white}.secondary{background:#e2e8f0;color:#1e293b}
input,textarea,select{width:100%;padding:11px;border:1px solid #cbd5e1;border-radius:9px;font:inherit}
textarea.code{font-family:Consolas,Monaco,monospace;min-height:620px;white-space:pre}
label{display:block;font-weight:800;margin:12px 0 6px}
table{width:100%;border-collapse:collapse}
th,td{text-align:left;padding:11px;border-bottom:1px solid #e2e8f0}
th{color:#475569;font-size:13px;text-transform:uppercase;letter-spacing:.5px}
pre{white-space:pre-wrap;background:#0f172a;color:#e2e8f0;padding:18px;border-radius:12px;max-height:520px;overflow:auto}
.alert{padding:14px 16px;border-radius:10px;margin-bottom:16px;font-weight:700}
.alert-success{background:#dcfce7;color:#166534}.alert-error{background:#fee2e2;color:#991b1b}
.help{color:var(--muted);font-size:14px;line-height:1.55}
.badge{display:inline-block;border-radius:999px;padding:6px 10px;font-size:12px;font-weight:900}
.badge-green{background:#dcfce7;color:#166534}.badge-gray{background:#e2e8f0;color:#334155}


.energy-cockpit{background:linear-gradient(145deg,#071a33,#0b315a);border-radius:22px;padding:22px;border:1px solid #315578;box-shadow:inset 0 0 35px rgba(0,0,0,.25),0 12px 35px rgba(7,26,51,.18)}
.energy-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}
.energy-instrument{position:relative;min-height:225px;border-radius:20px;padding:18px;text-align:center;background:linear-gradient(180deg,#153654,#0d243d);border:1px solid #365b7d;box-shadow:inset 0 0 22px rgba(0,0,0,.22),0 7px 18px rgba(0,0,0,.16)}
.glow-green{box-shadow:0 0 18px rgba(72,213,151,.35),inset 0 0 22px rgba(0,0,0,.22)}
.glow-blue{box-shadow:0 0 18px rgba(84,168,255,.30),inset 0 0 22px rgba(0,0,0,.22)}



.cockpit,.energy-cockpit{
  background:linear-gradient(145deg,#071a33,#0b315a);
  border-radius:20px;
  padding:20px;
  border:1px solid #315578;
  box-shadow:inset 0 0 30px rgba(0,0,0,.22),0 12px 32px rgba(7,26,51,.18);
  color:#fff;
}
.cockpit-title{
  color:#eaf6ff;
  font-size:19px;
  font-weight:900;
  margin-bottom:4px;
}
.cockpit-subtitle{
  color:#a9c3da;
  font-size:13px;
  margin-bottom:14px;
}
.energy-grid,.instrument-grid{
  display:grid;
  grid-template-columns:repeat(4,minmax(0,1fr));
  gap:14px;
}
.energy-instrument,.instrument{
  position:relative;
  min-height:205px;
  border-radius:17px;
  padding:15px;
  text-align:center;
  color:#fff;
  background:linear-gradient(180deg,#153654,#0d243d);
  border:1px solid #365b7d;
  box-shadow:inset 0 0 20px rgba(0,0,0,.22),0 7px 17px rgba(0,0,0,.15);
  overflow:hidden;
}
.energy-instrument.glow-green,.glow-green{
  box-shadow:0 0 16px rgba(72,213,151,.30),inset 0 0 20px rgba(0,0,0,.22);
}
.energy-instrument.glow-blue,.glow-blue{
  box-shadow:0 0 16px rgba(84,168,255,.28),inset 0 0 20px rgba(0,0,0,.22);
}
.instrument-label{
  color:#b8cbdb;
  font-size:13px;
  font-weight:900;
  letter-spacing:.45px;
  text-transform:uppercase;
  min-height:31px;
}
.instrument-value{
  color:#f8fbff;
  font-size:25px;
  line-height:1.05;
  font-weight:900;
  margin-top:2px;
}
.instrument-note{
  color:#9fb5c9;
  font-size:12px;
  margin-top:8px;
  line-height:1.25;
}
.dial{
  --value:0;
  --accent:#54a8ff;
  width:118px;
  height:59px;
  margin:7px auto 2px;
  position:relative;
  overflow:hidden;
}
.dial::before{
  content:"";
  position:absolute;
  left:0;top:0;
  width:118px;height:118px;
  border-radius:50%;
  background:
    conic-gradient(from 270deg,
      var(--accent) calc(var(--value) * .5%),
      #294b66 0 50%,
      transparent 0);
  -webkit-mask:radial-gradient(circle at center,transparent 54%,#000 56%);
  mask:radial-gradient(circle at center,transparent 54%,#000 56%);
}
.dial::after{
  content:"";
  position:absolute;
  left:56px;bottom:0;
  width:6px;height:45px;
  border-radius:5px;
  background:#eef7ff;
  transform-origin:50% 100%;
  transform:rotate(calc(-90deg + (var(--value) * 1.8deg)));
  box-shadow:0 0 5px rgba(255,255,255,.65);
}
.needle{
  position:absolute;
  left:52px;bottom:-6px;
  width:14px;height:14px;
  border-radius:50%;
  background:var(--accent);
  z-index:2;
  box-shadow:0 0 7px var(--accent);
}
@media(max-width:1050px){
  .energy-grid,.instrument-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media(max-width:650px){
  .energy-grid,.instrument-grid{grid-template-columns:1fr}
}


.json-group-box{
  border:1px solid #cbd8e5;
  border-radius:12px;
  background:#fff;
  padding:13px;
  box-shadow:0 7px 20px rgba(15,23,42,.06);
}
.history-toolbar{
  display:flex;
  justify-content:space-between;
  align-items:flex-start;
  gap:14px;
  flex-wrap:wrap;
  margin-bottom:10px;
}
.json-group-title{
  margin:0;
  color:#15385f;
  font-weight:900;
  font-size:22px;
}
.json-group-subtitle{
  color:#5d7187;
  font-size:13px;
  margin-top:3px;
  font-weight:600;
}
.history-status{
  padding:6px 12px;
  border-radius:999px;
  background:#e4f3e8;
  color:#2f7048;
  font-size:12px;
  font-weight:900;
}
.history-actions{
  display:flex;
  align-items:center;
  gap:8px;
  flex-wrap:wrap;
}
.history-search{
  width:210px;
  height:34px;
  padding:6px 10px;
  border:1px solid #b9c9d8;
  border-radius:7px;
  font-size:13px;
  font-weight:600;
  background:#fff;
}
.history-search:focus{
  outline:none;
  border-color:#1455c0;
  box-shadow:0 0 0 3px rgba(20,85,192,.12);
}
.history-page-size{
  width:auto;
  min-width:68px;
  height:34px;
  padding:4px 7px;
  font-size:13px;
  font-weight:700;
}
.json-grid-viewport{
  width:100%;
  max-height:690px;
  overflow:auto;
  border:1px solid #b9c9d8;
  border-radius:7px;
  background:#fff;
}
.json-grid-viewport table{
  width:100%;
  min-width:1390px;
  border-collapse:collapse;
  table-layout:fixed;
}
.json-grid-viewport th,
.json-grid-viewport td{
  border-right:1px solid #cbd8e5;
  border-bottom:1px solid #cbd8e5;
}
.json-grid-viewport thead th{
  position:sticky;
  top:0;
  z-index:4;
  background:#0b3f78;
  color:#fff;
  font-size:12px;
  font-weight:900;
  line-height:1.15;
  padding:10px 7px;
  text-align:center;
  text-transform:uppercase;
  letter-spacing:.3px;
  white-space:normal;
  cursor:pointer;
  user-select:none;
}
.json-grid-viewport thead th:hover{
  background:#1455a0;
}
.json-grid-viewport thead th::after{
  content:" ⇅";
  color:#b9d6f5;
  font-size:10px;
}
.json-grid-viewport thead th:last-child::after{
  content:"";
}
.json-grid-viewport tbody td{
  height:37px;
  padding:0 7px;
  color:#182b42;
  font-size:13px;
  font-weight:700;
  text-align:right;
  white-space:nowrap;
  background:#fff;
}
.json-grid-viewport tbody tr:nth-child(even) td{
  background:#edf4fb;
}
.json-grid-viewport tbody tr:hover td{
  background:#dcecff;
}
.json-grid-viewport input{
  width:100%;
  height:35px;
  min-width:0;
  padding:5px 6px;
  border:1px solid transparent;
  border-radius:3px;
  background:transparent;
  color:#182b42;
  font-size:13px;
  font-weight:700;
  text-align:right;
}
.json-grid-viewport input:hover{
  border-color:#9fb8cf;
  background:#fff;
}
.json-grid-viewport input:focus{
  outline:none;
  border-color:#1455c0;
  background:#fff;
  box-shadow:inset 0 0 0 1px #1455c0;
}
.json-grid-viewport input[name="date"]{
  font-size:12px;
  font-weight:900;
  text-align:left;
}
.json-grid-viewport input[name="weather"]{
  text-align:left;
}
.json-grid-viewport td.metric-cell{
  color:#223a55;
  text-align:right;
}
.json-grid-viewport td.unavailable{
  color:#8094aa;
  font-style:italic;
  font-weight:700;
  text-align:center;
}
.json-grid-viewport .row-save{
  text-align:center;
}
.json-grid-viewport .row-save button{
  min-width:72px;
  padding:6px 9px;
  border-radius:6px;
  font-size:11px;
  font-weight:900;
}
.json-grid-viewport th:first-child,
.json-grid-viewport td:first-child{
  position:sticky;
  left:0;
  z-index:2;
}
.json-grid-viewport tbody tr:nth-child(odd) td:first-child{background:#fff}
.json-grid-viewport tbody tr:nth-child(even) td:first-child{background:#edf4fb}
.json-grid-viewport tbody tr:hover td:first-child{background:#dcecff}
.json-grid-viewport thead th:first-child{
  z-index:5;
  background:#062f62;
}
.json-grid-viewport th:nth-child(1),.json-grid-viewport td:nth-child(1){width:108px}
.json-grid-viewport th:nth-child(2),.json-grid-viewport td:nth-child(2){width:100px}
.json-grid-viewport th:nth-child(3),.json-grid-viewport td:nth-child(3){width:92px}
.json-grid-viewport th:nth-child(4),.json-grid-viewport td:nth-child(4){width:92px}
.json-grid-viewport th:nth-child(5),.json-grid-viewport td:nth-child(5){width:100px}
.json-grid-viewport th:nth-child(6),.json-grid-viewport td:nth-child(6){width:130px;text-align:left}
.json-grid-viewport th:nth-child(7),.json-grid-viewport td:nth-child(7){width:72px}
.json-grid-viewport th:nth-child(8),.json-grid-viewport td:nth-child(8){width:72px}
.json-grid-viewport th:nth-child(9),.json-grid-viewport td:nth-child(9){width:105px}
.json-grid-viewport th:nth-child(10),.json-grid-viewport td:nth-child(10){width:105px}
.json-grid-viewport th:nth-child(11),.json-grid-viewport td:nth-child(11){width:135px}
.json-grid-viewport th:nth-child(12),.json-grid-viewport td:nth-child(12){width:100px}
.json-grid-viewport th:nth-child(13),.json-grid-viewport td:nth-child(13){width:90px}
.history-footer{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  flex-wrap:wrap;
  margin-top:10px;
  color:#52677d;
  font-size:13px;
  font-weight:700;
}
.history-pagination{
  display:flex;
  gap:6px;
  align-items:center;
}
.history-pagination button{
  padding:7px 11px;
  border-radius:6px;
  background:#e3ebf4;
  color:#15385f;
  font-size:12px;
  font-weight:800;
}
.history-pagination button:disabled{
  opacity:.45;
  cursor:not-allowed;
}
.history-page-number{
  min-width:32px;
  padding:7px 10px;
  border-radius:6px;
  background:#1455c0;
  color:#fff;
  text-align:center;
  font-weight:900;
}

.energy-flow-shell{
  background:linear-gradient(145deg,#071a33,#0b315a);
  border-radius:20px;
  padding:20px;
  border:1px solid #315578;
  box-shadow:0 12px 35px rgba(7,26,51,.18);
  color:#fff;
}
.energy-flow-header{
  display:flex;align-items:flex-start;justify-content:space-between;
  gap:16px;flex-wrap:wrap;margin-bottom:18px
}
.energy-flow-header h1{color:#fff;margin:0 0 5px}
.energy-flow-select{
  width:auto;min-width:190px;background:#fff;color:#172033;
  font-weight:800
}
.energy-flow-diagram{
  background:#f8fbff;color:#172033;border-radius:18px;
  padding:24px;border:1px solid #dbeafe
}
.flow-top{
  display:flex;justify-content:center;margin-bottom:14px
}
.flow-node{
  border-radius:16px;padding:16px 18px;text-align:center;
  border:2px solid #b9d4ef;background:#fff;min-width:210px;
  box-shadow:0 6px 16px rgba(15,23,42,.08)
}
.flow-node .flow-label{
  color:#52677d;font-size:12px;font-weight:900;
  text-transform:uppercase;letter-spacing:.55px
}
.flow-node .flow-value{
  color:#073b78;font-size:28px;font-weight:900;margin-top:5px
}
.flow-node .flow-note{color:#64748b;font-size:12px;margin-top:4px}
.flow-solar{border-color:#4ea6e8}
.flow-home{border-color:#47b87a}
.flow-grid-export{border-color:#e78d48}
.flow-grid-import{border-color:#df6666}
.flow-arrow-down{
  text-align:center;color:#0b5ea8;font-size:34px;font-weight:900;
  height:38px;line-height:32px
}
.flow-split{
  display:grid;grid-template-columns:1fr 1fr;gap:42px;
  position:relative;margin:0 auto 18px;max-width:900px
}
.flow-split::before{
  content:"";position:absolute;top:-18px;left:25%;right:25%;
  height:2px;background:#5d87ad
}
.flow-split .flow-node{min-width:0}
.flow-home-row{
  display:grid;grid-template-columns:1fr auto 1fr;gap:18px;
  align-items:center;max-width:900px;margin:8px auto 0
}
.flow-plus{
  font-size:34px;font-weight:900;color:#64748b;text-align:center
}
.flow-equations{
  display:grid;grid-template-columns:repeat(2,minmax(0,1fr));
  gap:14px;margin-top:18px
}
.flow-equation{
  background:#fff;border:1px solid #dbe5ef;border-radius:13px;
  padding:15px;text-align:center
}
.flow-equation .formula{
  color:#073b78;font-size:16px;font-weight:900
}
.flow-equation .numbers{
  margin-top:8px;font-size:18px;font-weight:900;color:#166534
}
.flow-metrics{
  display:grid;grid-template-columns:repeat(4,minmax(0,1fr));
  gap:12px;margin-top:16px
}
.flow-metric{
  background:#102946;border:1px solid #365b7d;border-radius:13px;
  padding:14px;text-align:center
}
.flow-metric .label{
  color:#9eb5ca;font-size:11px;font-weight:900;text-transform:uppercase
}
.flow-metric .value{
  color:#fff;font-size:22px;font-weight:900;margin-top:5px
}
.flow-warning{
  margin-top:16px;padding:13px 15px;border-radius:11px;
  background:#fff3cd;color:#7a4b00;border:1px solid #f0cf73;
  font-weight:700;line-height:1.45
}
.flow-ok{
  margin-top:16px;padding:13px 15px;border-radius:11px;
  background:#dcfce7;color:#166534;border:1px solid #86efac;
  font-weight:700
}
@media(max-width:850px){
  .flow-split,.flow-equations,.flow-metrics{grid-template-columns:1fr}
  .flow-split::before{display:none}
  .flow-home-row{grid-template-columns:1fr}
  .flow-plus{transform:rotate(90deg)}
}

.report-viewer-card{
  padding:18px;
}
.report-viewer-toolbar{
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:12px;
  flex-wrap:wrap;
  margin-bottom:12px;
}
.report-viewer-toolbar h1{
  margin:0;
  font-size:24px;
  overflow-wrap:anywhere;
}
.report-viewer-actions{
  display:flex;
  gap:8px;
  flex-wrap:wrap;
}
.report-frame{
  display:block;
  width:100%;
  height:calc(100vh - 300px);
  min-height:720px;
  border:1px solid #cbd8e5;
  border-radius:10px;
  background:#fff;
}
@media(max-width:800px){
  .report-frame{
    min-height:600px;
    height:calc(100vh - 340px);
  }
}
.chart-gallery-shell{
  background:linear-gradient(145deg,#071a33,#0b315a);
  border-radius:20px;
  padding:20px;
  border:1px solid #315578;
  box-shadow:0 12px 35px rgba(7,26,51,.18);
}
.chart-gallery-header{
  display:flex;align-items:center;justify-content:space-between;
  gap:16px;flex-wrap:wrap;margin-bottom:16px;color:white
}
.chart-gallery-header h1{color:white;margin:0}
.chart-select{min-width:280px;max-width:520px;background:white}
.chart-stage{
  position:relative;background:white;border-radius:16px;
  min-height:570px;display:flex;align-items:center;justify-content:center;
  overflow:hidden;border:1px solid #dbeafe;padding:14px
}
.chart-stage img{
  display:block;max-width:100%;max-height:72vh;width:auto;height:auto;
  object-fit:contain
}
.chart-controls{
  display:flex;align-items:center;justify-content:center;
  gap:12px;flex-wrap:wrap;margin-top:16px
}
.chart-counter{color:#dbeafe;font-weight:900;min-width:90px;text-align:center}
.chart-meta{
  display:grid;grid-template-columns:repeat(4,minmax(0,1fr));
  gap:12px;margin-top:16px
}
.chart-meta .metric{background:#102946;border-color:#365b7d}
.chart-meta .label{color:#9eb5ca}
.chart-meta .value{color:white;font-size:22px}
.chart-help{color:#b9dcff;font-size:13px;margin-top:12px;text-align:center}
@media(max-width:850px){
  .chart-meta{grid-template-columns:repeat(2,minmax(0,1fr))}
  .chart-stage{min-height:400px}
}

</style>
</head>
<body>
<header><div class="header-wrap">
  <div><div class="brand">☀ Sunrun Energy Portal 2.0</div>
  <div class="subtitle">Local control center for production, NYSEG flow, reports and JSON data</div></div>
  <div class="badge badge-green">Runs locally on this computer</div>
</div></header>
<nav><div class="nav-wrap">
<a href="{{ url_for('home') }}">Dashboard</a>
<a href="{{ url_for('load_history') }}">Daily Load History</a>
<a href="{{ url_for('reports') }}">Reports</a>
<a href="{{ url_for('charts_gallery') }}">Charts</a>
<a href="{{ url_for('energy_flow_page') }}">Energy Flow</a>`n<a href="{{ url_for('nyseg_net_metering') }}">NYSEG Credits</a>
<a href="{{ url_for('json_viewer') }}">JSON Viewer</a>
<a href="{{ url_for('json_editor') }}">JSON Editor</a>
<a href="{{ url_for('process_page') }}">Run Process</a>
<a href="{{ url_for('meter_page') }}">Add Meter Reading</a>
<a href="{{ url_for('meter_sync_page') }}">Meter Sync</a>
<a href="{{ url_for('weather_sync_page') }}">Weather Sync</a>
<a href="{{ url_for('guide') }}">Solar Guide</a>
</div></nav>
<main>
{% with messages = get_flashed_messages(with_categories=true) %}
  {% for category,message in messages %}
    <div class="alert {{ 'alert-success' if category=='success' else 'alert-error' }}">{{ message }}</div>
  {% endfor %}
{% endwith %}
{{ content|safe }}
</main>
<footer>Sunrun Energy Analytics 2.0 · Consolidated local application portal</footer>
</body></html>
"""


def render_page(title: str, content: str, **context: Any) -> str:
    inner = render_template_string(content, **context)
    return render_template_string(BASE_HTML, title=title, content=inner)


def load_json() -> dict:
    if not JSON_FILE.is_file():
        return {"entries": [], "lifetime": {}, "updated_at": None}
    with JSON_FILE.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def n(value: Any, digits: int = 1, suffix: str = "") -> str:
    if value is None:
        return "Not available"
    try:
        return f"{float(value):,.{digits}f}{suffix}"
    except (TypeError, ValueError):
        return str(value)



def blank(value: Any) -> str:
    return "" if value is None else str(value)



def time_only(value: Any) -> str:
    if not value:
        return ""
    try:
        return datetime.fromisoformat(str(value)).strftime("%I:%M %p")
    except ValueError:
        return str(value)


def gauge(value: Any, maximum: float) -> float:
    try:
        return max(0.0, min(float(value) / float(maximum) * 100.0, 100.0))
    except (TypeError, ValueError, ZeroDivisionError):
        return 0.0


def absnum(value: Any) -> float:
    try:
        return abs(float(value))
    except (TypeError, ValueError):
        return 0.0


CHART_TITLES = {
    "production_history.png": "Daily Solar Production",
    "daily_energy_flow.png": "Daily Energy Flow",
    "cumulative_energy.png": "Cumulative Energy Since Activation",
    "monthly_energy.png": "Monthly Energy Totals",
    "monthly_energy_summary.png": "Monthly Energy Summary — Matched Meter Days",
    "monthly_energy_balance_explained.png": "Monthly Energy Balance Explained",
    "instrument_panel.png": "Financial & Grid Cockpit",
    "energy_instrument_panel.png": "Production & Grid Flight Deck",
}


def latest_chart_directory() -> Path | None:
    CHART_DIR.mkdir(parents=True, exist_ok=True)
    candidates = [path for path in CHART_DIR.iterdir() if path.is_dir()]
    candidates = [
        path for path in candidates
        if any(path.glob("*.png"))
    ]
    return max(candidates, key=lambda path: path.stat().st_mtime, default=None)


def chart_title(filename: str) -> str:
    if filename in CHART_TITLES:
        return CHART_TITLES[filename]
    return Path(filename).stem.replace("_", " ").title()


def chart_statistics(filename: str, data: dict) -> list[tuple[str, str]]:
    entries = sorted(data.get("entries", []), key=lambda e: e.get("date", ""))
    stats: list[tuple[str, str]] = []

    def values(field: str, derived: bool = False) -> list[float]:
        result = []
        for entry in entries:
            raw = (
                entry.get("derived", {}).get(field)
                if derived else entry.get(field)
            )
            try:
                if raw is not None:
                    result.append(float(raw))
            except (TypeError, ValueError):
                pass
        return result

    if filename == "production_history.png":
        rows = values("production_kwh")
        if rows:
            stats = [
                ("Average", f"{sum(rows)/len(rows):,.1f} kWh/day"),
                ("Highest", f"{max(rows):,.1f} kWh"),
                ("Lowest", f"{min(rows):,.1f} kWh"),
                ("Days", f"{len(rows):,}"),
            ]
    elif filename == "daily_energy_flow.png":
        imported = values("daily_import_kwh", True)
        exported = values("daily_export_kwh", True)
        self_used = values("self_consumed_kwh", True)
        stats = [
            ("Total import", f"{sum(imported):,.1f} kWh"),
            ("Total export", f"{sum(exported):,.1f} kWh"),
            ("Used in home", f"{sum(self_used):,.1f} kWh"),
            ("Days", f"{max(len(imported),len(exported),len(self_used)):,}"),
        ]
    elif filename == "cumulative_energy.png":
        lifetime = data.get("lifetime", {})
        stats = [
            ("Production", n(lifetime.get("production_kwh"), 1, " kWh")),
            ("Grid import", n(lifetime.get("grid_import_kwh"), 1, " kWh")),
            ("Grid export", n(lifetime.get("grid_export_kwh"), 1, " kWh")),
            ("Records", f"{len(entries):,}"),
        ]
    elif filename == "monthly_energy_balance_explained.png":
        matched = [
            entry for entry in entries
            if entry.get("production_kwh") is not None
            and entry.get("derived", {}).get("daily_import_kwh") is not None
            and entry.get("derived", {}).get("daily_export_kwh") is not None
        ]
        if matched:
            first_date = matched[0].get("date", "—")
            last_date = matched[-1].get("date", "—")
            stats = [
                ("Solar equation", "Self-used + export = production"),
                ("Home equation", "Self-used + import = home use"),
                ("Matched days", f"{len(matched):,}"),
                ("Coverage", f"{first_date} to {last_date}"),
            ]
    else:
        latest = entries[-1] if entries else {}
        stats = [
            ("Latest date", latest.get("date", "Not available")),
            ("Production", n(latest.get("production_kwh"), 1, " kWh")),
            ("Weather", latest.get("weather") or "Not available"),
            ("Charts", "Latest generated set"),
        ]
    return stats


@app.route("/")
def home() -> str:
    data = load_json()
    entries = sorted(data.get("entries", []), key=lambda e: e.get("date", ""))
    production_entries = [e for e in entries if e.get("production_kwh") is not None]
    meter_entries = [
        e for e in entries
        if e.get("derived", {}).get("daily_import_kwh") is not None
        and e.get("derived", {}).get("daily_export_kwh") is not None
    ]
    complete_entries = [
        e for e in entries
        if e.get("production_kwh") is not None
        and e.get("derived", {}).get("daily_import_kwh") is not None
        and e.get("derived", {}).get("daily_export_kwh") is not None
    ]
    latest_production = production_entries[-1] if production_entries else {}
    latest_meter = meter_entries[-1] if meter_entries else {}
    latest_complete = complete_entries[-1] if complete_entries else {}
    derived = latest_complete.get("derived", {})
    meter_derived = latest_meter.get("derived", {})
    lifetime = data.get("lifetime", {})
    financial = lifetime.get("financial", {})
    content = """
    <div class="card">
      <h1>Application dashboard</h1>
      <p class="help">Use this page to inspect current solar performance, open saved reports, edit the cumulative JSON, enter NYSEG meter readings, or manually run the complete daily process.</p>
    </div>
    <div class="energy-cockpit">
      <div class="cockpit-title">☀ Production & Grid Flight Deck</div>
      <div class="cockpit-subtitle">The newest Sunrun production, newest NYSEG meter flow, and newest date where both are available.</div>
      <div class="energy-grid">
        <div class="energy-instrument glow-blue">
          <div class="instrument-label">SOLAR PRODUCED</div>
          <div class="dial" style="--value:{{ gauge(latest_production.get('production_kwh'),100) }};--accent:#54a8ff"><div class="needle"></div></div>
          <div class="instrument-value">{{ n(latest_production.get('production_kwh'),1,' kWh') }}</div>
          <div class="instrument-note">{{ latest_production.get('date','No production date') }}</div>
        </div>
        <div class="energy-instrument glow-green">
          <div class="instrument-label">USED IN HOME</div>
          <div class="dial" style="--value:{{ gauge(derived.get('self_consumed_kwh'),80) }};--accent:#48d597"><div class="needle"></div></div>
          <div class="instrument-value">{{ n(derived.get('self_consumed_kwh'),1,' kWh') }}</div>
          <div class="instrument-note">Complete date: {{ latest_complete.get('date','N/A') }}</div>
        </div>
        <div class="energy-instrument">
          <div class="instrument-label">FROM NYSEG</div>
          <div class="dial" style="--value:{{ gauge(meter_derived.get('daily_import_kwh'),50) }};--accent:#ffb34d"><div class="needle"></div></div>
          <div class="instrument-value">{{ n(meter_derived.get('daily_import_kwh'),1,' kWh') }}</div>
          <div class="instrument-note">Meter date: {{ latest_meter.get('date','N/A') }}</div>
        </div>
        <div class="energy-instrument glow-green">
          <div class="instrument-label">TO NYSEG</div>
          <div class="dial" style="--value:{{ gauge(meter_derived.get('daily_export_kwh'),80) }};--accent:#42e58d"><div class="needle"></div></div>
          <div class="instrument-value">{{ n(meter_derived.get('daily_export_kwh'),1,' kWh') }}</div>
          <div class="instrument-note">Meter date: {{ latest_meter.get('date','N/A') }}</div>
        </div>
        <div class="energy-instrument">
          <div class="instrument-label">HOME CONSUMPTION</div>
          <div class="dial" style="--value:{{ gauge(derived.get('home_consumption_kwh'),100) }};--accent:#b98cff"><div class="needle"></div></div>
          <div class="instrument-value">{{ n(derived.get('home_consumption_kwh'),1,' kWh') }}</div>
          <div class="instrument-note">Solar used + grid import</div>
        </div>
        <div class="energy-instrument">
          <div class="instrument-label">SOLAR COVERAGE</div>
          <div class="dial" style="--value:{{ gauge(derived.get('solar_coverage_percent'),100) }};--accent:#ffd84d"><div class="needle"></div></div>
          <div class="instrument-value">{{ n(derived.get('solar_coverage_percent'),1,'%') }}</div>
          <div class="instrument-note">Complete date: {{ latest_complete.get('date','N/A') }}</div>
        </div>
        <div class="energy-instrument">
          <div class="instrument-label">LIFETIME PRODUCTION</div>
          <div class="dial" style="--value:{{ gauge(lifetime.get('production_kwh'),11141) }};--accent:#4de1c1"><div class="needle"></div></div>
          <div class="instrument-value">{{ n(lifetime.get('production_kwh'),1,' kWh') }}</div>
          <div class="instrument-note">{{ n(financial.get('annual_goal_percent'),1,'%') }} of 11,141 kWh</div>
        </div>
        <div class="energy-instrument">
          <div class="instrument-label">NET GRID</div>
          <div class="dial" style="--value:{{ gauge(absnum(meter_derived.get('net_grid_kwh')),50) }};--accent:{{ '#42e58d' if absnum(meter_derived.get('net_grid_kwh')) and (meter_derived.get('net_grid_kwh') or 0) < 0 else '#ff826f' }}"><div class="needle"></div></div>
          <div class="instrument-value">{{ n(meter_derived.get('net_grid_kwh'),1,' kWh') }}</div>
          <div class="instrument-note">{{ 'Exported' if (meter_derived.get('net_grid_kwh') or 0) < 0 else 'Imported' }} on {{ latest_meter.get('date','N/A') }}</div>
        </div>
      </div>
    </div>
    <div class="cockpit" style="margin-top:18px">
      <div class="cockpit-title">⚡ Financial & Grid Cockpit</div>
      <div class="cockpit-subtitle">One compact instrument panel for the most important solar results — estimated at ${{ "%.2f"|format(rate) }}/kWh.</div>
      <div class="instrument-grid">
        <div class="instrument">
          <div class="instrument-label">TODAY'S SAVINGS</div>
          <div class="dial" style="--value:{{ gauge(financial.get('today_savings_usd'),100) }};--accent:#48d597"><div class="needle"></div></div>
          <div class="instrument-value">${{ n(financial.get('today_savings_usd'),2) }}</div>
          <div class="instrument-note">Latest completed production day</div>
        </div>
        <div class="instrument">
          <div class="instrument-label">MONTH-TO-DATE</div>
          <div class="dial" style="--value:{{ gauge(financial.get('month_to_date_savings_usd'),1200) }};--accent:#54a8ff"><div class="needle"></div></div>
          <div class="instrument-value">${{ n(financial.get('month_to_date_savings_usd'),2) }}</div>
          <div class="instrument-note">Current month</div>
        </div>
        <div class="instrument">
          <div class="instrument-label">YEAR-TO-DATE</div>
          <div class="dial" style="--value:{{ gauge(financial.get('year_to_date_savings_usd'),5000) }};--accent:#b98cff"><div class="needle"></div></div>
          <div class="instrument-value">${{ n(financial.get('year_to_date_savings_usd'),2) }}</div>
          <div class="instrument-note">Current calendar year</div>
        </div>
        <div class="instrument">
          <div class="instrument-label">PROJECTED ANNUAL</div>
          <div class="dial" style="--value:{{ gauge(financial.get('projected_annual_savings_usd'),6000) }};--accent:#ffb34d"><div class="needle"></div></div>
          <div class="instrument-value">${{ n(financial.get('projected_annual_savings_usd'),2) }}</div>
          <div class="instrument-note">Annualized estimate</div>
        </div>
        <div class="instrument">
          <div class="instrument-label">LIFETIME SAVINGS</div>
          <div class="dial" style="--value:{{ gauge(financial.get('lifetime_savings_usd'),10000) }};--accent:#4de1c1"><div class="needle"></div></div>
          <div class="instrument-value">${{ n(financial.get('lifetime_savings_usd'),2) }}</div>
          <div class="instrument-note">Since activation</div>
        </div>
        <div class="instrument">
          <div class="instrument-label">ANNUAL GOAL</div>
          <div class="dial" style="--value:{{ gauge(financial.get('annual_goal_percent'),100) }};--accent:#ffd84d"><div class="needle"></div></div>
          <div class="instrument-value">{{ n(financial.get('annual_goal_percent'),1,'%') }}</div>
          <div class="instrument-note">{{ n(financial.get('annual_production_kwh'),1,' kWh') }} of 11,141 kWh</div>
        </div>
        <div class="instrument">
          <div class="instrument-label">GRID STATUS</div>
          <div class="dial" style="--value:{{ 100 if 'exporter' in financial.get('grid_status','').lower() else 40 }};--accent:{{ '#42e58d' if 'exporter' in financial.get('grid_status','').lower() else '#ff826f' }}"><div class="needle"></div></div>
          <div class="instrument-value" style="font-size:24px">{{ financial.get('grid_status','Unknown') }}</div>
          <div class="instrument-note">{{ n(absnum(derived.get('net_grid_kwh')),1,' kWh net') }}</div>
        </div>
        <div class="instrument">
          <div class="instrument-label">SOLAR INDEPENDENCE</div>
          <div class="dial" style="--value:{{ gauge(financial.get('solar_independence_percent'),100) }};--accent:#3ed6ff"><div class="needle"></div></div>
          <div class="instrument-value">{{ n(financial.get('solar_independence_percent'),1,'%') }}</div>
          <div class="instrument-note">Home demand served directly by solar</div>
        </div>
      </div>
    </div>
    <div class="grid-2" style="margin-top:18px">
      <div class="card">
        <h2>Quick actions</h2>
        <p><a class="button primary" href="{{ url_for('process_page') }}">Run daily workflow</a></p>
        <p><a class="button success" href="{{ url_for('meter_page') }}">Enter meter reading</a></p>
        <p><a class="button secondary" href="{{ url_for('reports') }}">Open saved reports</a></p>
      </div>
      <div class="card">
        <h2>Lifetime summary</h2>
        <table>
          <tr><td>Complete meter days</td><td><b>{{ lifetime.get('complete_days',0) }}</b></td></tr>
          <tr><td>Solar production</td><td><b>{{ n(lifetime.get('production_kwh'),1,' kWh') }}</b></td></tr>
          <tr><td>Imported from NYSEG</td><td><b>{{ n(lifetime.get('import_kwh'),1,' kWh') }}</b></td></tr>
          <tr><td>Exported to NYSEG</td><td><b>{{ n(lifetime.get('export_kwh'),1,' kWh') }}</b></td></tr>
          <tr><td>Solar used in home</td><td><b>{{ n(lifetime.get('self_consumed_kwh'),1,' kWh') }}</b></td></tr>
        </table>
      </div>
    </div>
    """
    return render_page("Dashboard", content, latest_production=latest_production, latest_meter=latest_meter, latest_complete=latest_complete, derived=derived, meter_derived=meter_derived, lifetime=lifetime, financial=financial, rate=ENERGY_RATE_PER_KWH, n=n, gauge=gauge, absnum=absnum)


def load_daily_history() -> list[dict]:
    if not LOAD_HISTORY_FILE.is_file():
        return []
    try:
        raw = json.loads(LOAD_HISTORY_FILE.read_text(encoding="utf-8"))
        records = raw.get("records", []) if isinstance(raw, dict) else raw
        if not isinstance(records, list):
            return []
        return sorted(
            [row for row in records if isinstance(row, dict)],
            key=lambda row: row.get("date", ""),
            reverse=True,
        )
    except (OSError, json.JSONDecodeError, TypeError):
        return []


@app.route("/load-history")
def load_history() -> str:
    records = load_daily_history()
    success_count = sum(1 for row in records if row.get("status") == "Success")
    latest = records[0] if records else {}

    content = """
    <div class="card">
      <h1>Daily Load History</h1>
      <p class="help">
        One concise record is retained for each day. The 8:30 AM workflow
        automatically inserts or replaces that day's record after the load finishes.
      </p>
      <div class="grid">
        <div class="metric"><div class="label">Recorded days</div><div class="value">{{ records|length }}</div><div class="note">One row per date</div></div>
        <div class="metric"><div class="label">Successful loads</div><div class="value">{{ success_count }}</div><div class="note">Completed workflow days</div></div>
        <div class="metric"><div class="label">Latest load</div><div class="value">{{ latest.get('date','—') }}</div><div class="note">{{ latest.get('status','No history') }}</div></div>
        <div class="metric"><div class="label">Latest production</div><div class="value">{{ n(latest.get('production_kwh'),1,' kWh') }}</div><div class="note">{{ latest.get('production_date') or 'Not available' }}</div></div>
      </div>
    </div>

    <div class="card">
      <h2>Historical daily loads</h2>
      <div class="load-history-box">
        <table>
          <thead>
            <tr>
              <th>Load date</th>
              <th>Status</th>
              <th>Production date</th>
              <th>Production</th>
              <th>Duration</th>
              <th>CSV</th>
              <th>JSON rows</th>
              <th>Charts</th>
              <th>Email</th>
              <th>Report</th>
              <th>Summary</th>
            </tr>
          </thead>
          <tbody>
          {% for row in records %}
            <tr>
              <td><b>{{ row.get('date','—') }}</b><br><span class="help">{{ time_only(row.get('finished_at')) }}</span></td>
              <td><span class="status-chip {{ 'status-success' if row.get('status')=='Success' else 'status-failed' }}">{{ row.get('status','Unknown') }}</span></td>
              <td>{{ row.get('production_date') or '—' }}</td>
              <td>{{ n(row.get('production_kwh'),1,' kWh') }}</td>
              <td>{{ n(row.get('duration_seconds'),1,' sec') }}</td>
              <td>{{ row.get('source_csv') or '—' }}{% if row.get('source_csv_kb') is not none %}<br><span class="help">{{ n(row.get('source_csv_kb'),1,' KB') }}</span>{% endif %}</td>
              <td>{{ row.get('json_entries',0) }}</td>
              <td>{{ row.get('charts_created',0) }}</td>
              <td>{{ 'Sent' if row.get('email_sent') else 'Not sent' }}</td>
              <td>{{ row.get('report_file') or '—' }}</td>
              <td class="load-note">{{ row.get('message') or '—' }}</td>
            </tr>
          {% else %}
            <tr><td colspan="11">No daily load history exists yet. The first record will be created after the next workflow run.</td></tr>
          {% endfor %}
          </tbody>
        </table>
      </div>
    </div>
    """
    return render_page(
        "Daily Load History",
        content,
        records=records,
        success_count=success_count,
        latest=latest,
        n=n,
        time_only=time_only,
    )


def build_monthly_energy_flow(data: dict) -> list[dict]:
    grouped: dict[str, dict] = {}

    for entry in sorted(data.get("entries", []), key=lambda row: row.get("date", "")):
        date_text = str(entry.get("date", ""))
        if len(date_text) < 7:
            continue
        month = date_text[:7]
        row = grouped.setdefault(month, {
            "month": month,
            "production_all_kwh": 0.0,
            "production_days": 0,
            "matched_days": 0,
            "production_kwh": 0.0,
            "self_consumed_kwh": 0.0,
            "imported_kwh": 0.0,
            "exported_kwh": 0.0,
            "home_consumption_kwh": 0.0,
            "first_production_date": None,
            "first_matched_date": None,
            "last_matched_date": None,
        })

        production = entry.get("production_kwh")
        if production is not None:
            row["production_all_kwh"] += float(production)
            row["production_days"] += 1
            row["first_production_date"] = (
                row["first_production_date"] or date_text
            )

        derived = entry.get("derived", {})
        required = (
            production,
            derived.get("daily_import_kwh"),
            derived.get("daily_export_kwh"),
            derived.get("self_consumed_kwh"),
            derived.get("home_consumption_kwh"),
        )
        if any(value is None for value in required):
            continue

        row["matched_days"] += 1
        row["production_kwh"] += float(production)
        row["self_consumed_kwh"] += float(derived["self_consumed_kwh"])
        row["imported_kwh"] += float(derived["daily_import_kwh"])
        row["exported_kwh"] += float(derived["daily_export_kwh"])
        row["home_consumption_kwh"] += float(
            derived["home_consumption_kwh"]
        )
        row["first_matched_date"] = row["first_matched_date"] or date_text
        row["last_matched_date"] = date_text

    result = []
    today = datetime.now().date()

    for month in sorted(grouped):
        row = grouped[month]
        if row["matched_days"] == 0:
            continue

        production = row["production_kwh"]
        self_used = row["self_consumed_kwh"]
        imported = row["imported_kwh"]
        exported = row["exported_kwh"]
        home = row["home_consumption_kwh"]

        row["solar_used_percent"] = (
            self_used / production * 100 if production else 0.0
        )
        row["solar_export_percent"] = (
            exported / production * 100 if production else 0.0
        )
        row["home_solar_percent"] = (
            self_used / home * 100 if home else 0.0
        )
        row["home_grid_percent"] = (
            imported / home * 100 if home else 0.0
        )
        row["solar_balance_difference_kwh"] = (
            production - self_used - exported
        )
        row["home_balance_difference_kwh"] = (
            home - self_used - imported
        )

        year, month_number = map(int, month.split("-"))
        row["month_label"] = datetime(year, month_number, 1).strftime(
            "%B %Y"
        )
        row["is_current_month"] = (
            today.year == year and today.month == month_number
        )
        row["partial_meter_coverage"] = (
            row["matched_days"] < row["production_days"]
            or row["first_matched_date"] != row["first_production_date"]
        )
        result.append(row)

    return result


@app.route("/energy-flow")
def energy_flow_page() -> str:
    data = load_json()
    months = build_monthly_energy_flow(data)
    selected_key = request.args.get("month", "").strip()

    selected = None
    if months:
        selected = next(
            (item for item in months if item["month"] == selected_key),
            months[-1],
        )

    content = r"""
    <div class="energy-flow-shell">
      <div class="energy-flow-header">
        <div>
          <h1>Monthly Energy Flow</h1>
          <div style="color:#b9dcff">
            See exactly where solar production went and how the home was supplied.
          </div>
        </div>
        {% if months %}
        <select id="energyFlowMonth" class="energy-flow-select"
                onchange="window.location='{{ url_for('energy_flow_page') }}?month='+encodeURIComponent(this.value)">
          {% for month in months %}
          <option value="{{ month.month }}"
                  {{ 'selected' if selected and month.month == selected.month else '' }}>
            {{ month.month_label }}
          </option>
          {% endfor %}
        </select>
        {% endif %}
      </div>

      {% if selected %}
      <div class="energy-flow-diagram">
        <div class="flow-top">
          <div class="flow-node flow-solar">
            <div class="flow-label">Solar production</div>
            <div class="flow-value">{{ n(selected.production_kwh,1,' kWh') }}</div>
            <div class="flow-note">Matched production and meter days</div>
          </div>
        </div>

        <div class="flow-arrow-down">↓</div>

        <div class="flow-split">
          <div class="flow-node flow-home">
            <div class="flow-label">Self-consumed solar</div>
            <div class="flow-value">{{ n(selected.self_consumed_kwh,1,' kWh') }}</div>
            <div class="flow-note">Solar used directly in the house</div>
          </div>
          <div class="flow-node flow-grid-export">
            <div class="flow-label">Exported to NYSEG</div>
            <div class="flow-value">{{ n(selected.exported_kwh,1,' kWh') }}</div>
            <div class="flow-note">Surplus solar sent to the grid</div>
          </div>
        </div>

        <div class="flow-home-row">
          <div class="flow-node flow-home">
            <div class="flow-label">Self-consumed solar</div>
            <div class="flow-value">{{ n(selected.self_consumed_kwh,1,' kWh') }}</div>
          </div>
          <div class="flow-plus">+</div>
          <div class="flow-node flow-grid-import">
            <div class="flow-label">Imported from NYSEG</div>
            <div class="flow-value">{{ n(selected.imported_kwh,1,' kWh') }}</div>
          </div>
        </div>

        <div class="flow-arrow-down">↓</div>

        <div class="flow-top">
          <div class="flow-node">
            <div class="flow-label">Total home consumption</div>
            <div class="flow-value">{{ n(selected.home_consumption_kwh,1,' kWh') }}</div>
            <div class="flow-note">Solar used in home plus grid imports</div>
          </div>
        </div>

        <div class="flow-equations">
          <div class="flow-equation">
            <div class="formula">
              Production = Self-consumed + Exported
            </div>
            <div class="numbers">
              {{ n(selected.production_kwh,1) }} =
              {{ n(selected.self_consumed_kwh,1) }} +
              {{ n(selected.exported_kwh,1) }} kWh
            </div>
          </div>
          <div class="flow-equation">
            <div class="formula">
              Home consumption = Self-consumed + Imported
            </div>
            <div class="numbers">
              {{ n(selected.home_consumption_kwh,1) }} =
              {{ n(selected.self_consumed_kwh,1) }} +
              {{ n(selected.imported_kwh,1) }} kWh
            </div>
          </div>
        </div>
      </div>

      <div class="flow-metrics">
        <div class="flow-metric">
          <div class="label">Solar used in home</div>
          <div class="value">{{ n(selected.solar_used_percent,1,'%') }}</div>
        </div>
        <div class="flow-metric">
          <div class="label">Solar exported</div>
          <div class="value">{{ n(selected.solar_export_percent,1,'%') }}</div>
        </div>
        <div class="flow-metric">
          <div class="label">Home supplied by solar</div>
          <div class="value">{{ n(selected.home_solar_percent,1,'%') }}</div>
        </div>
        <div class="flow-metric">
          <div class="label">Home supplied by NYSEG</div>
          <div class="value">{{ n(selected.home_grid_percent,1,'%') }}</div>
        </div>
      </div>

      {% if selected.partial_meter_coverage %}
      <div class="flow-warning">
        <b>Partial meter coverage:</b>
        Solar production exists for {{ selected.production_days }} day(s), but
        complete production/import/export calculations are available for only
        {{ selected.matched_days }} matched day(s),
        {{ selected.first_matched_date }} through {{ selected.last_matched_date }}.
        Earlier production is intentionally excluded so the equations remain valid.
      </div>
      {% elif selected.is_current_month %}
      <div class="flow-warning">
        <b>Month-to-date:</b> This month is still in progress. The diagram uses
        {{ selected.matched_days }} complete matched day(s) through
        {{ selected.last_matched_date }}.
      </div>
      {% else %}
      <div class="flow-ok">
        Complete matched coverage is available for all
        {{ selected.matched_days }} recorded production day(s) in this month.
      </div>
      {% endif %}
      {% else %}
      <div class="card" style="margin:0">
        <h2>No matched energy-flow data yet</h2>
        <p class="help">
          The diagram requires production, import and export readings for the
          same dates.
        </p>
      </div>
      {% endif %}
    </div>
    """

    return render_page(
        "Energy Flow",
        content,
        months=months,
        selected=selected,
        n=n,
    )


@app.route("/charts")
def charts_gallery() -> str:
    folder = latest_chart_directory()
    charts = []
    if folder is not None:
        for file in sorted(folder.glob("*.png")):
            charts.append({
                "filename": file.name,
                "title": chart_title(file.name),
                "modified": datetime.fromtimestamp(
                    file.stat().st_mtime
                ).strftime("%b %d, %Y %I:%M %p"),
                "size_kb": round(file.stat().st_size / 1024, 1),
                "stats": chart_statistics(file.name, load_json()),
            })

    content = r"""
    <div class="chart-gallery-shell">
      <div class="chart-gallery-header">
        <div>
          <h1>Chart Gallery</h1>
          <div style="color:#b9dcff;margin-top:6px">
            One chart at a time · use Previous, Next, the selector, or arrow keys
          </div>
        </div>
        {% if charts %}
        <select id="chartSelector" class="chart-select" aria-label="Select chart">
          {% for chart in charts %}
          <option value="{{ loop.index0 }}">{{ chart.title }}</option>
          {% endfor %}
        </select>
        {% endif %}
      </div>

      {% if charts %}
      <div class="chart-stage" id="chartStage">
        <img id="chartImage"
             src="{{ url_for('chart_image', folder=folder_name, filename=charts[0].filename) }}"
             alt="{{ charts[0].title }}">
      </div>

      <div class="chart-controls">
        <button class="secondary" id="previousChart" type="button">◀ Previous</button>
        <span class="chart-counter" id="chartCounter">1 of {{ charts|length }}</span>
        <button class="primary" id="nextChart" type="button">Next ▶</button>
        <button class="success" id="fullScreenChart" type="button">Full Screen</button>
        <a class="button warning" id="downloadChart"
           href="{{ url_for('download_chart', folder=folder_name, filename=charts[0].filename) }}">
           Download PNG
        </a>
      </div>

      <div class="chart-meta" id="chartStats"></div>
      <div class="chart-help">Keyboard shortcuts: ← previous · → next · Home first · End last</div>

      <script>
      const charts = {{ charts_json|safe }};
      let currentIndex = 0;

      const image = document.getElementById("chartImage");
      const selector = document.getElementById("chartSelector");
      const counter = document.getElementById("chartCounter");
      const stats = document.getElementById("chartStats");
      const download = document.getElementById("downloadChart");
      const stage = document.getElementById("chartStage");

      function escapeHtml(value) {
        return String(value).replace(/[&<>"']/g, character => ({
          "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"
        })[character]);
      }

      function showChart(index) {
        currentIndex = (index + charts.length) % charts.length;
        const chart = charts[currentIndex];
        image.src = chart.image_url;
        image.alt = chart.title;
        selector.value = currentIndex;
        counter.textContent = `${currentIndex + 1} of ${charts.length}`;
        download.href = chart.download_url;
        stats.innerHTML = chart.stats.map(item =>
          `<div class="metric"><div class="label">${escapeHtml(item[0])}</div>` +
          `<div class="value">${escapeHtml(item[1])}</div></div>`
        ).join("");
      }

      document.getElementById("previousChart").addEventListener(
        "click", () => showChart(currentIndex - 1)
      );
      document.getElementById("nextChart").addEventListener(
        "click", () => showChart(currentIndex + 1)
      );
      selector.addEventListener("change", event => showChart(Number(event.target.value)));

      document.getElementById("fullScreenChart").addEventListener("click", () => {
        if (stage.requestFullscreen) stage.requestFullscreen();
      });

      document.addEventListener("keydown", event => {
        if (event.key === "ArrowLeft") showChart(currentIndex - 1);
        if (event.key === "ArrowRight") showChart(currentIndex + 1);
        if (event.key === "Home") showChart(0);
        if (event.key === "End") showChart(charts.length - 1);
      });

      showChart(0);
      </script>
      {% else %}
      <div class="card" style="margin:0">
        <h2>No generated charts were found</h2>
        <p class="help">
          Run the daily process or the evening weather synchronization once.
          The newest generated chart set will then appear here automatically.
        </p>
      </div>
      {% endif %}
    </div>
    """

    chart_payload = []
    if folder is not None:
        for chart in charts:
            item = dict(chart)
            item["image_url"] = url_for(
                "chart_image", folder=folder.name, filename=chart["filename"]
            )
            item["download_url"] = url_for(
                "download_chart", folder=folder.name, filename=chart["filename"]
            )
            chart_payload.append(item)

    return render_page(
        "Charts",
        content,
        charts=charts,
        folder_name=folder.name if folder else "",
        charts_json=json.dumps(chart_payload),
    )


@app.route("/charts/image/<path:folder>/<path:filename>")
def chart_image(folder: str, filename: str):
    path = (CHART_DIR / folder / filename).resolve()
    chart_root = CHART_DIR.resolve()
    try:
        path.relative_to(chart_root)
    except ValueError:
        return "Chart not found", 404
    if not path.is_file() or path.suffix.lower() != ".png":
        return "Chart not found", 404
    return send_file(path, mimetype="image/png")


@app.route("/charts/download/<path:folder>/<path:filename>")
def download_chart(folder: str, filename: str):
    path = (CHART_DIR / folder / filename).resolve()
    chart_root = CHART_DIR.resolve()
    try:
        path.relative_to(chart_root)
    except ValueError:
        return "Chart not found", 404
    if not path.is_file() or path.suffix.lower() != ".png":
        return "Chart not found", 404
    return send_file(path, as_attachment=True, download_name=path.name)


@app.route("/nyseg-net-metering")
def nyseg_net_metering() -> str:
    report = build_net_metering_report()
    total_import = float(report["total_import_kwh"])
    total_export = float(report["total_export_kwh"])
    content = """
    <div class="card">
      <h1>NYSEG import, export and credit treatment</h1>
      <p class="help">Bill-based summary from July 16, 2026. Import and export are the smart-meter registers used by NYSEG. The credit column reflects the statement's actual treatment, not an estimated dollar value.</p>
      <div class="grid">
        <div class="metric"><div class="label">Smart-meter import</div><div class="value">{{ n(total_import, 1, ' kWh') }}</div><div class="note">Energy drawn from the grid</div></div>
        <div class="metric"><div class="label">Smart-meter export</div><div class="value">{{ n(total_export, 1, ' kWh') }}</div><div class="note">Solar energy sent to the grid</div></div>
        <div class="metric"><div class="label">Net meter export</div><div class="value">{{ n(total_export-total_import, 1, ' kWh') }}</div><div class="note">Export less smart-meter import</div></div>
        <div class="metric"><div class="label">Latest NYSEG energy charges</div><div class="value">{{ money(latest.get('total_energy_charges')) }}</div><div class="note">Corrected September 16 statement</div></div>
      </div>
    </div>
    <div class="card">
      <h2>Billing-period detail</h2>
      <table>
        <thead><tr><th>Statement</th><th>Billing period</th><th>Import</th><th>Export</th><th>Meter net export</th><th>NYSEG credit treatment</th><th>Remaining excess</th><th>Energy charges</th></tr></thead>
        <tbody>{% for row in rows %}
          <tr>
            <td><b>{{ row.statement_date }}</b></td>
            <td>{{ row.billing_start_date }} – {{ row.billing_end_date }}</td>
            <td>{{ n(row.smart_meter_import_kwh, 1, ' kWh') }}</td>
            <td>{{ n(row.exported_kwh, 1, ' kWh') }}</td>
            <td><b>{{ n(row.meter_net_export_kwh, 1, ' kWh') }}</b></td>
            <td>{{ row.official_credit_note }}</td>
            <td>{{ n(row.remaining_excess_generation_kwh, 1, ' kWh') if row.remaining_excess_generation_kwh is not none else 'Not itemized' }}</td>
            <td>{{ money(row.total_energy_charges) }}</td>
          </tr>
        {% endfor %}</tbody>
      </table>
    </div>
    <div class="card"><h2>How the latest credit worked</h2><p>The corrected September 16 statement applied NYSEG credit against 518.0 kWh of billed use. It reported 1,376.0 kWh of prior excess generation and 0.0 kWh remaining after correction. Fixed and non-energy charges still appeared on the bill.</p></div>
    """
    return render_page("NYSEG Credits", content, rows=report["rows"], total_import=total_import, total_export=total_export, latest=report["rows"][-1] if report["rows"] else {}, n=n, money=lambda value: f"${float(value or 0):,.2f}")

@app.route("/reports")
def reports() -> str:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    files = sorted(REPORT_DIR.glob("Sunrun_Report_*.html"), key=lambda p: p.stat().st_mtime, reverse=True)
    content = """
    <div class="card">
      <h1>Saved reports</h1>
      <p class="help">Each successful run saves a standalone HTML report. Open a report in the viewer or download it directly.</p>
      <table>
        <thead><tr><th>Report</th><th>Modified</th><th>Size</th><th>Actions</th></tr></thead>
        <tbody>
        {% for file in files %}
          <tr>
            <td><b>{{ file.name }}</b></td>
            <td>{{ modified(file) }}</td>
            <td>{{ size(file) }}</td>
            <td>
              <a class="button primary" href="{{ url_for('view_report', filename=file.name) }}">View</a>
              <a class="button secondary" href="{{ url_for('download_report', filename=file.name) }}">Download</a>
            </td>
          </tr>
        {% else %}
          <tr><td colspan="4">No saved reports have been created yet.</td></tr>
        {% endfor %}
        </tbody>
      </table>
    </div>
    """
    return render_page(
        "Reports", content, files=files,
        modified=lambda p: datetime.fromtimestamp(p.stat().st_mtime).strftime("%Y-%m-%d %I:%M:%S %p"),
        size=lambda p: f"{p.stat().st_size/1024:,.1f} KB",
    )


@app.route("/reports/view/<path:filename>")
def view_report(filename: str) -> str:
    path = (REPORT_DIR / filename).resolve()
    if path.parent != REPORT_DIR.resolve() or not path.is_file():
        return "Report not found", 404
    content = """
    <div class="card report-viewer-card">
      <div class="report-viewer-toolbar">
        <h1>{{ filename }}</h1>
        <div class="report-viewer-actions">
          <a class="button secondary" href="{{ url_for('reports') }}">Back to reports</a>
          <a class="button primary"
             href="{{ url_for('raw_report', filename=filename) }}"
             target="_blank" rel="noopener">Open full page</a>
          <a class="button success"
             href="{{ url_for('download_report', filename=filename) }}">Download</a>
        </div>
      </div>
      <iframe class="report-frame"
              src="{{ url_for('raw_report', filename=filename) }}"
              title="{{ filename }}"></iframe>
    </div>
    """
    return render_page("Report Viewer", content, filename=filename)


@app.route("/reports/raw/<path:filename>")
def raw_report(filename: str):
    path = (REPORT_DIR / filename).resolve()
    if path.parent != REPORT_DIR.resolve() or not path.is_file():
        return "Report not found", 404
    return send_file(path, mimetype="text/html")


@app.route("/reports/download/<path:filename>")
def download_report(filename: str):
    path = (REPORT_DIR / filename).resolve()
    if path.parent != REPORT_DIR.resolve() or not path.is_file():
        return "Report not found", 404
    return send_file(path, as_attachment=True)


@app.route("/json")
def json_viewer() -> str:
    data = load_json()
    entries = sorted(data.get("entries", []), key=lambda e: e.get("date", ""), reverse=True)
    content = """
    <div class="card">
      <h1>Cumulative JSON grid</h1>
      <p class="help"><b>File:</b> {{ json_file }}<br>
      Edit a row directly and select <b>Save row</b>. The portal creates a timestamped backup and recalculates all derived values.<br>All columns are compressed by roughly 60% to fit across the browser window. Use the vertical scrollbar inside the history box to move through dates.</p>
      <p><a class="button primary" href="{{ url_for('json_editor') }}">Edit raw JSON</a>
         <a class="button secondary" href="{{ url_for('download_json') }}">Download JSON</a>
         <a class="button success" href="{{ url_for('json_popout') }}" target="_blank" rel="noopener">Pop out grid</a></p>
      <div class="json-group-box">
        <div class="history-toolbar">
          <div>
            <div class="json-group-title">Cumulative Solar History</div>
            <div class="json-group-subtitle">{{ entries|length }} records · Select any field to edit it.</div>
          </div>
          <div class="history-actions">
            <input id="historySearch" class="history-search"
                   type="search" placeholder="Search date, weather or value"
                   aria-label="Search history">
            <span class="history-status">Actual history</span>
            <label for="historyPageSize" class="help" style="margin:0;font-weight:800">Show</label>
            <select id="historyPageSize" class="history-page-size">
              <option value="10">10</option>
              <option value="15" selected>15</option>
              <option value="20">20</option>
              <option value="50">50</option>
            </select>
          </div>
        </div>
        <div class="json-grid-viewport">
      <table class="grid-editor">
        <thead><tr>
          <th data-sort="0">Date</th>
          <th data-sort="1">Production</th>
          <th data-sort="2">Meter 01</th>
          <th data-sort="3">Meter 02</th>
          <th data-sort="4">Irradiance</th>
          <th data-sort="5">Weather</th>
          <th data-sort="6">High</th>
          <th data-sort="7">Low</th>
          <th data-sort="8">Import</th>
          <th data-sort="9">Export</th>
          <th data-sort="10">Self Consumption</th>
          <th data-sort="11">Coverage</th>
          <th>Action</th>
        </tr></thead>
        <tbody id="historyTableBody">
        {% for e in entries %}
        <tr class="history-data-row">
          <form method="post" action="{{ url_for('save_json_row') }}">
          <td><input name="date" value="{{ e.get('date','') }}" readonly></td>
          <td><input name="production_kwh" value="{{ blank(e.get('production_kwh')) }}"></td>
          <td><input name="meter01_grid_import" value="{{ blank(e.get('meter01_grid_import')) }}"></td>
          <td><input name="meter02_grid_export" value="{{ blank(e.get('meter02_grid_export')) }}"></td>
          <td><input name="irradiance_w_m2" value="{{ blank(e.get('irradiance_w_m2')) }}"></td>
          <td><input name="weather" value="{{ e.get('weather') or '' }}"></td>
          <td><input name="high_f" value="{{ blank(e.get('high_f')) }}"></td>
          <td><input name="low_f" value="{{ blank(e.get('low_f')) }}"></td>
          <td class="metric-cell {{ 'unavailable' if e.get('derived',{}).get('daily_import_kwh') is none else '' }}">{{ n(e.get('derived',{}).get('daily_import_kwh'),1,' kWh') }}</td>
          <td class="metric-cell {{ 'unavailable' if e.get('derived',{}).get('daily_export_kwh') is none else '' }}">{{ n(e.get('derived',{}).get('daily_export_kwh'),1,' kWh') }}</td>
          <td class="metric-cell {{ 'unavailable' if e.get('derived',{}).get('self_consumed_kwh') is none else '' }}">{{ n(e.get('derived',{}).get('self_consumed_kwh'),1,' kWh') }}</td>
          <td class="metric-cell {{ 'unavailable' if e.get('derived',{}).get('solar_coverage_percent') is none else '' }}">{{ n(e.get('derived',{}).get('solar_coverage_percent'),1,'%') }}</td>
          <td class="row-save"><button class="success" type="submit">Save row</button></td>
          </form>
        </tr>
        {% else %}<tr><td colspan="13">No JSON entries found.</td></tr>{% endfor %}
        </tbody>
      </table>
        </div>
        <div class="history-footer">
          <div id="historyRecordSummary">Showing records</div>
          <div class="history-pagination">
            <button type="button" id="historyPrevious">Previous</button>
            <span class="history-page-number" id="historyPageNumber">1</span>
            <button type="button" id="historyNext">Next</button>
          </div>
        </div>
      </div>
    </div>
    <script>
    (() => {
      const tbody = document.getElementById("historyTableBody");
      const sizeSelect = document.getElementById("historyPageSize");
      const search = document.getElementById("historySearch");
      const previous = document.getElementById("historyPrevious");
      const next = document.getElementById("historyNext");
      const pageNumber = document.getElementById("historyPageNumber");
      const summary = document.getElementById("historyRecordSummary");
      const headers = Array.from(
        document.querySelectorAll(".json-grid-viewport thead th[data-sort]")
      );
      let currentPage = 1;
      let sortIndex = null;
      let sortAscending = true;

      function allRows() {
        return Array.from(tbody.querySelectorAll(".history-data-row"));
      }

      function cellText(row, index) {
        const cell = row.children[index];
        const input = cell ? cell.querySelector("input") : null;
        return (input ? input.value : cell?.textContent || "").trim();
      }

      function filteredRows() {
        const query = search.value.trim().toLowerCase();
        return allRows().filter(row => {
          if (!query) return true;
          return Array.from(row.children).some(cell => {
            const input = cell.querySelector("input");
            const value = input ? input.value : cell.textContent;
            return String(value || "").toLowerCase().includes(query);
          });
        });
      }

      function compareValues(a, b) {
        const numberA = Number(String(a).replace(/[^0-9.-]/g, ""));
        const numberB = Number(String(b).replace(/[^0-9.-]/g, ""));
        const bothNumeric = Number.isFinite(numberA) && Number.isFinite(numberB)
          && String(a).trim() !== "" && String(b).trim() !== "";
        if (bothNumeric) return numberA - numberB;
        return String(a).localeCompare(String(b), undefined, {
          numeric: true, sensitivity: "base"
        });
      }

      function applySort(rows) {
        if (sortIndex === null) return rows;
        return [...rows].sort((rowA, rowB) => {
          const result = compareValues(
            cellText(rowA, sortIndex),
            cellText(rowB, sortIndex)
          );
          return sortAscending ? result : -result;
        });
      }

      function renderHistoryPage() {
        const pageSize = Number(sizeSelect.value);
        const matches = applySort(filteredRows());
        const totalPages = Math.max(1, Math.ceil(matches.length / pageSize));
        currentPage = Math.min(Math.max(currentPage, 1), totalPages);
        const start = (currentPage - 1) * pageSize;
        const end = Math.min(start + pageSize, matches.length);
        const visibleRows = new Set(matches.slice(start, end));

        allRows().forEach(row => {
          row.style.display = visibleRows.has(row) ? "" : "none";
        });
        matches.forEach(row => tbody.appendChild(row));

        pageNumber.textContent = currentPage;
        previous.disabled = currentPage === 1;
        next.disabled = currentPage === totalPages;
        summary.textContent = matches.length
          ? `Showing ${start + 1} to ${end} of ${matches.length} matching records`
          : "No matching records";
      }

      headers.forEach(header => {
        header.addEventListener("click", () => {
          const index = Number(header.dataset.sort);
          if (sortIndex === index) {
            sortAscending = !sortAscending;
          } else {
            sortIndex = index;
            sortAscending = true;
          }
          currentPage = 1;
          renderHistoryPage();
        });
      });

      search.addEventListener("input", () => {
        currentPage = 1;
        renderHistoryPage();
      });
      sizeSelect.addEventListener("change", () => {
        currentPage = 1;
        renderHistoryPage();
      });
      previous.addEventListener("click", () => {
        currentPage -= 1;
        renderHistoryPage();
      });
      next.addEventListener("click", () => {
        currentPage += 1;
        renderHistoryPage();
      });
      renderHistoryPage();
    })();
    </script>
    """
    return render_page("JSON Viewer", content, entries=entries, n=n, blank=blank, json_file=JSON_FILE)


@app.route("/json/save-row", methods=["POST"])
def save_json_row() -> str:
    date_value = request.form.get("date", "").strip()
    if not date_value:
        flash("A date is required.", "error")
        return redirect(url_for("json_viewer"))

    try:
        datetime.strptime(date_value, "%Y-%m-%d")
        data = load_json()
        entry = next((e for e in data.get("entries", []) if e.get("date") == date_value), None)
        if entry is None:
            raise ValueError(f"No JSON row exists for {date_value}.")

        numeric_fields = (
            "production_kwh", "meter01_grid_import", "meter02_grid_export",
            "irradiance_w_m2", "high_f", "low_f"
        )
        for field in numeric_fields:
            raw = request.form.get(field, "").strip()
            entry[field] = None if raw == "" else float(raw.replace(",", ""))

        entry["weather"] = request.form.get("weather", "").strip() or None

        BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        if JSON_FILE.is_file():
            backup = BACKUP_DIR / f"Solar_Daily_History_{datetime.now():%Y-%m-%d_%H%M%S}.json"
            backup.write_bytes(JSON_FILE.read_bytes())

        recalculate_all(data)
        save_history(data, JSON_FILE)
        flash(f"{date_value} was saved and all derived values were recalculated.", "success")
    except Exception as exc:
        flash(f"The row was not saved: {exc}", "error")

    return redirect(url_for("json_viewer"))


@app.route("/json/popout")
def json_popout() -> str:
    data = load_json()
    entries = sorted(data.get("entries", []), key=lambda e: e.get("date", ""), reverse=True)

    template = """
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Cumulative Solar History · Pop-out Grid</title>
<style>
:root{
  --navy:#073b78;--blue:#1455c0;--green:#15803d;--muted:#64748b;
  --line:#cbd5e1;--bg:#eef4fa;--panel:#ffffff;
}
*{box-sizing:border-box}
html,body{margin:0;width:100%;height:100%;font-family:Arial,Helvetica,sans-serif;color:#172033;background:var(--bg)}
.pop-header{
  display:flex;align-items:center;justify-content:space-between;gap:12px;
  padding:10px 14px;background:#073b78;color:white;position:sticky;top:0;z-index:20
}
.pop-title{font-size:20px;font-weight:900}
.pop-subtitle{font-size:12px;color:#dbeafe;margin-top:3px}
.toolbar{display:flex;gap:8px;flex-wrap:wrap}
.button,button{
  display:inline-block;border:0;border-radius:7px;padding:8px 12px;
  font-weight:800;cursor:pointer;text-decoration:none;font-size:12px
}
.primary{background:var(--blue);color:white}
.success{background:var(--green);color:white}
.secondary{background:#e2e8f0;color:#1e293b}
.pop-main{padding:8px;height:calc(100vh - 72px)}
.pop-box{
  height:100%;border:2px solid #8fb5dc;border-radius:12px;background:white;
  overflow:auto;box-shadow:0 8px 24px rgba(15,23,42,.10)
}
table{width:100%;min-width:1500px;border-collapse:collapse;table-layout:fixed}
th,td{border-bottom:1px solid #e2e8f0;text-align:center;padding:4px 3px;font-size:11px;white-space:nowrap}
thead th{
  position:sticky;top:0;z-index:8;background:#dceeff;color:#334155;
  text-transform:uppercase;letter-spacing:.35px;font-size:10px
}
tbody td:first-child,thead th:first-child{
  position:sticky;left:0;z-index:7;background:#f8fbff
}
thead th:first-child{z-index:9;background:#cfe5fb}
input{
  width:100%;min-width:0;height:27px;padding:3px 4px;border:1px solid #cbd5e1;
  border-radius:5px;font-size:11px;text-align:center;background:white
}
input[name="weather"]{text-align:left}
th:nth-child(1),td:nth-child(1){width:92px}
th:nth-child(2),td:nth-child(2){width:92px}
th:nth-child(3),td:nth-child(3){width:85px}
th:nth-child(4),td:nth-child(4){width:85px}
th:nth-child(5),td:nth-child(5){width:92px}
th:nth-child(6),td:nth-child(6){width:120px}
th:nth-child(7),td:nth-child(7){width:62px}
th:nth-child(8),td:nth-child(8){width:62px}
th:nth-child(9),td:nth-child(9){width:82px}
th:nth-child(10),td:nth-child(10){width:82px}
th:nth-child(11),td:nth-child(11){width:108px}
th:nth-child(12),td:nth-child(12){width:82px}
th:nth-child(13),td:nth-child(13){width:84px}
.row-save button{width:100%;padding:6px 3px;font-size:10px}
.status{
  padding:7px 10px;background:#ecfdf5;color:#166534;border-bottom:1px solid #bbf7d0;
  font-size:12px;font-weight:700
}
</style>
</head>
<body>
<header class="pop-header">
  <div>
    <div class="pop-title">Cumulative Solar History</div>
    <div class="pop-subtitle">Expanded editing workspace · {{ entries|length }} rows</div>
  </div>
  <div class="toolbar">
    <a class="button secondary" href="{{ url_for('json_viewer') }}">Open standard view</a>
    <a class="button secondary" href="{{ url_for('download_json') }}">Download JSON</a>
    <button class="primary" type="button" id="fitButton">Fit all columns</button>
    <button class="success" type="button" id="wideButton">Comfortable width</button>
    <button class="secondary" type="button" id="closeButton">Close window</button>
  </div>
</header>
<div class="status">Edit any row and select Save row. The Date column and column headings remain visible while you move through the data.</div>
<main class="pop-main">
  <div class="pop-box" id="gridBox">
    <table id="historyTable">
      <thead>
        <tr>
          <th>Date</th><th>Production</th><th>Meter 01</th><th>Meter 02</th>
          <th>Irradiance</th><th>Weather</th><th>High</th><th>Low</th>
          <th>Import</th><th>Export</th><th>Self Consumption</th>
          <th>Coverage</th><th>Action</th>
        </tr>
      </thead>
      <tbody>
      {% for e in entries %}
        <tr>
          <form method="post" action="{{ url_for('save_json_row') }}">
          <td><input name="date" value="{{ e.get('date','') }}" readonly></td>
          <td><input name="production_kwh" value="{{ blank(e.get('production_kwh')) }}"></td>
          <td><input name="meter01_grid_import" value="{{ blank(e.get('meter01_grid_import')) }}"></td>
          <td><input name="meter02_grid_export" value="{{ blank(e.get('meter02_grid_export')) }}"></td>
          <td><input name="irradiance_w_m2" value="{{ blank(e.get('irradiance_w_m2')) }}"></td>
          <td><input name="weather" value="{{ e.get('weather') or '' }}"></td>
          <td><input name="high_f" value="{{ blank(e.get('high_f')) }}"></td>
          <td><input name="low_f" value="{{ blank(e.get('low_f')) }}"></td>
          <td>{{ n(e.get('derived',{}).get('daily_import_kwh'),1,' kWh') }}</td>
          <td>{{ n(e.get('derived',{}).get('daily_export_kwh'),1,' kWh') }}</td>
          <td>{{ n(e.get('derived',{}).get('self_consumed_kwh'),1,' kWh') }}</td>
          <td>{{ n(e.get('derived',{}).get('solar_coverage_percent'),1,'%') }}</td>
          <td class="row-save"><button class="success" type="submit">Save row</button></td>
          </form>
        </tr>
      {% else %}
        <tr><td colspan="13">No JSON entries found.</td></tr>
      {% endfor %}
      </tbody>
    </table>
  </div>
</main>
<script>
const table = document.getElementById('historyTable');
const fitButton = document.getElementById('fitButton');
const wideButton = document.getElementById('wideButton');
const closeButton = document.getElementById('closeButton');

fitButton.addEventListener('click', () => {
  table.style.minWidth = '0';
  table.style.width = '100%';
  table.style.tableLayout = 'fixed';
});

wideButton.addEventListener('click', () => {
  table.style.minWidth = '1500px';
  table.style.width = '100%';
  table.style.tableLayout = 'fixed';
});

closeButton.addEventListener('click', () => window.close());
</script>
</body>
</html>
"""
    return render_template_string(
        template,
        entries=entries,
        n=n,
        blank=blank,
    )


@app.route("/json/download")
def download_json():
    if not JSON_FILE.is_file():
        return "JSON file not found", 404
    return send_file(JSON_FILE, as_attachment=True)


@app.route("/json/edit", methods=["GET", "POST"])
def json_editor() -> str:
    if request.method == "POST":
        raw = request.form.get("json_text", "")
        try:
            parsed = json.loads(raw)
            if not isinstance(parsed, dict) or not isinstance(parsed.get("entries", []), list):
                raise ValueError("The root must be an object and entries must be a list.")
            BACKUP_DIR.mkdir(parents=True, exist_ok=True)
            if JSON_FILE.is_file():
                backup = BACKUP_DIR / f"Solar_Daily_History_{datetime.now():%Y-%m-%d_%H%M%S}.json"
                backup.write_bytes(JSON_FILE.read_bytes())
            JSON_FILE.parent.mkdir(parents=True, exist_ok=True)
            temp = JSON_FILE.with_suffix(".tmp")
            temp.write_text(json.dumps(parsed, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
            temp.replace(JSON_FILE)
            flash("JSON validated, backed up and saved successfully.", "success")
            return redirect(url_for("json_editor"))
        except Exception as exc:
            flash(f"JSON was not saved: {exc}", "error")

    text = JSON_FILE.read_text(encoding="utf-8") if JSON_FILE.is_file() else '{\n  "entries": []\n}\n'
    content = """
    <div class="card">
      <h1>JSON editor</h1>
      <p class="help">The portal validates the JSON before saving and creates a timestamped backup. Derived calculations are normally maintained by the daily controller, so manual editing should be used carefully.</p>
      <form method="post">
        <textarea class="code" name="json_text" spellcheck="false">{{ text }}</textarea>
        <p><button class="success" type="submit">Validate and save JSON</button>
           <a class="button secondary" href="{{ url_for('json_viewer') }}">Cancel</a></p>
      </form>
    </div>
    """
    return render_page("JSON Editor", content, text=text)


def _run_process(command: list[str]) -> None:
    with process_lock:
        process_state.update(
            running=True, started=datetime.now(), finished=None,
            command=" ".join(command), returncode=None,
            output="Process started...\n",
        )
    try:
        result = subprocess.run(
            command, cwd=str(SCRIPT_DIR), text=True,
            capture_output=True, check=False
        )
        output = (result.stdout or "") + ("\n" + result.stderr if result.stderr else "")
        with process_lock:
            process_state.update(
                running=False, finished=datetime.now(),
                returncode=result.returncode, output=output.strip() or "No output."
            )
    except Exception as exc:
        with process_lock:
            process_state.update(
                running=False, finished=datetime.now(),
                returncode=-1, output=f"Process failed: {exc}"
            )


@app.route("/process", methods=["GET", "POST"])
def process_page() -> str:
    if request.method == "POST":
        if process_state["running"]:
            flash("A process is already running.", "error")
        elif not CONTROLLER.is_file():
            flash(f"Controller was not found: {CONTROLLER}", "error")
        else:
            command = [sys.executable, str(CONTROLLER), "--run"]
            threading.Thread(target=_run_process, args=(command,), daemon=True).start()
            flash("Daily Sunrun workflow started. Refresh this page to see its progress.", "success")
            return redirect(url_for("process_page"))

    content = """
    <div class="grid-2">
      <div class="card">
        <h1>Run the daily process</h1>
        <p class="help">This performs the same operation as the scheduled task: downloads Sunrun production, updates the cumulative JSON, calculates energy metrics, creates charts, saves an HTML report and sends the email.</p>
        <form method="post">
          <button class="primary" type="submit" {% if state.running %}disabled{% endif %}>
            {{ "Process running…" if state.running else "Run full workflow now" }}
          </button>
        </form>
        <p><b>Controller:</b><br>{{ controller }}</p>
        <p><b>Status:</b>
          <span class="badge {{ 'badge-green' if state.returncode==0 else 'badge-gray' }}">
          {{ "Running" if state.running else ("Completed" if state.finished else "Idle") }}
          </span>
        </p>
      </div>
      <div class="card">
        <h2>Process information</h2>
        <table>
          <tr><td>Started</td><td>{{ state.started or "—" }}</td></tr>
          <tr><td>Finished</td><td>{{ state.finished or "—" }}</td></tr>
          <tr><td>Return code</td><td>{{ state.returncode if state.returncode is not none else "—" }}</td></tr>
          <tr><td>Command</td><td>{{ state.command or "—" }}</td></tr>
        </table>
      </div>
    </div>
    <div class="card">
      <h2>Latest process output</h2>
      <pre>{{ state.output }}</pre>
      <a class="button secondary" href="{{ url_for('process_page') }}">Refresh output</a>
    </div>
    """
    return render_page("Run Process", content, state=process_state.copy(), controller=CONTROLLER)


@app.route("/weather-sync", methods=["GET", "POST"])
def weather_sync_page() -> str:
    output = None

    if request.method == "POST":
        action = request.form.get("action", "")
        commands = {
            "sync": [sys.executable, str(CONTROLLER), "--sync-weather"],
            "install": [sys.executable, str(CONTROLLER), "--install-weather-sync"],
            "uninstall": [sys.executable, str(CONTROLLER), "--uninstall-weather-sync"],
        }
        command = commands.get(action)
        if command is None:
            flash("Unknown weather-sync action.", "error")
        else:
            result = subprocess.run(
                command,
                cwd=str(SCRIPT_DIR),
                text=True,
                capture_output=True,
                check=False,
            )
            output = (result.stdout or "") + (
                "\n" + result.stderr if result.stderr else ""
            )
            if result.returncode == 0:
                flash("Weather-sync action completed successfully.", "success")
            else:
                flash("Weather-sync action failed. Review the output below.", "error")

    history = load_json()
    entries = sorted(
        history.get("entries", []),
        key=lambda row: row.get("date", ""),
    )
    latest = entries[-1] if entries else {}

    log_tail = ""
    if WEATHER_SYNC_LOG_FILE.is_file():
        try:
            lines = WEATHER_SYNC_LOG_FILE.read_text(
                encoding="utf-8",
                errors="replace",
            ).splitlines()
            log_tail = "\n".join(lines[-20:])
        except OSError:
            log_tail = ""

    content = """
    <div class="card">
      <h1>Evening Weather & Irradiance Sync</h1>
      <p class="help">
        Runs once daily at <b>8:30 PM</b>. It retrieves the day's weather
        summary for Yorktown Heights and updates Irradiance, Weather, High and Low.
        The cumulative JSON is recalculated and the latest HTML report is refreshed.
      </p>
      <div class="grid">
        <div class="metric"><div class="label">Latest date</div><div class="value">{{ latest.get('date','—') }}</div><div class="note">Newest solar-history row</div></div>
        <div class="metric"><div class="label">Irradiance</div><div class="value">{{ n(latest.get('irradiance_w_m2'),1,' W/m²') }}</div><div class="note">Daily peak shortwave radiation</div></div>
        <div class="metric"><div class="label">Weather</div><div class="value" style="font-size:22px">{{ latest.get('weather') or '—' }}</div><div class="note">Daily condition</div></div>
        <div class="metric"><div class="label">High / Low</div><div class="value">{{ n(latest.get('high_f'),1,'°F') }} / {{ n(latest.get('low_f'),1,'°F') }}</div><div class="note">Daily temperatures</div></div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <h2>Controls</h2>
        <form method="post" style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="primary" type="submit" name="action" value="sync">Sync now</button>
          <button class="success" type="submit" name="action" value="install">Install 8:30 PM task</button>
          <button class="danger" type="submit" name="action" value="uninstall">Remove weather task</button>
        </form>
        {% if output %}
          <h3>Command output</h3>
          <pre>{{ output }}</pre>
        {% endif %}
      </div>
      <div class="card">
        <h2>Data source</h2>
        <table>
          <tr><td>Provider</td><td><b>Open-Meteo</b></td></tr>
          <tr><td>Location</td><td>Yorktown Heights, NY</td></tr>
          <tr><td>Schedule</td><td>Daily at 8:30 PM</td></tr>
          <tr><td>Weather source note</td><td>{{ latest.get('source',{}).get('weather','—') }}</td></tr>
        </table>
      </div>
    </div>

    <div class="card">
      <h2>Latest weather-sync log</h2>
      <pre>{{ log_tail or "No evening weather synchronization has run yet." }}</pre>
    </div>
    """

    return render_page(
        "Weather Sync",
        content,
        latest=latest,
        output=output,
        log_tail=log_tail,
        n=n,
    )


@app.route("/meter-sync", methods=["GET", "POST"])
def meter_sync_page() -> str:
    output = None

    if request.method == "POST":
        action = request.form.get("action", "")
        commands = {
            "sync": [sys.executable, str(CONTROLLER), "--sync-meters"],
            "install": [sys.executable, str(CONTROLLER), "--install-meter-sync"],
            "uninstall": [sys.executable, str(CONTROLLER), "--uninstall-meter-sync"],
        }
        command = commands.get(action)
        if command is None:
            flash("Unknown meter-sync action.", "error")
        else:
            result = subprocess.run(
                command,
                cwd=str(SCRIPT_DIR),
                text=True,
                capture_output=True,
                check=False,
            )
            output = (result.stdout or "") + (
                "\n" + result.stderr if result.stderr else ""
            )
            if result.returncode == 0:
                flash("Meter-sync action completed successfully.", "success")
            else:
                flash("Meter-sync action failed. Review the output below.", "error")

    latest_source = {}
    if APPLICATION_DATA_FILE.is_file():
        try:
            raw = json.loads(APPLICATION_DATA_FILE.read_text(encoding="utf-8"))
            rows = raw.get("daily_entries", []) if isinstance(raw, dict) else []
            valid = [row for row in rows if isinstance(row, dict)]
            if valid:
                latest_source = max(
                    valid,
                    key=lambda row: str(row.get("entry_date", "")),
                )
        except (OSError, json.JSONDecodeError, TypeError):
            latest_source = {}

    history = load_json()
    entries = sorted(
        history.get("entries", []),
        key=lambda row: row.get("date", ""),
    )
    latest_target = entries[-1] if entries else {}

    log_tail = ""
    if METER_SYNC_LOG_FILE.is_file():
        try:
            lines = METER_SYNC_LOG_FILE.read_text(
                encoding="utf-8",
                errors="replace",
            ).splitlines()
            log_tail = "\n".join(lines[-20:])
        except OSError:
            log_tail = ""

    content = """
    <div class="card">
      <h1>Day/Night M01/M02 Meter Sync</h1>
      <p class="help">
        Reads the latest daily entry from <b>{{ source_file }}</b> and copies
        meter_01_import_reading to M01 and meter_02_export_reading to M02.
        The Windows task runs every 15 minutes, 24 hours per day. M01 is updated from sunset through sunrise, while M02 is updated from sunrise through sunset.
      </p>
      <div class="grid">
        <div class="metric"><div class="label">Source date</div><div class="value">{{ latest_source.get('entry_date','—') }}</div><div class="note">Latest application_data_current entry</div></div>
        <div class="metric"><div class="label">Source M01</div><div class="value">{{ n(latest_source.get('meter_01_import_reading'),1) }}</div><div class="note">Cumulative import reading</div></div>
        <div class="metric"><div class="label">Source M02</div><div class="value">{{ n(latest_source.get('meter_02_export_reading'),1) }}</div><div class="note">Cumulative export reading</div></div>
        <div class="metric"><div class="label">Portal history date</div><div class="value">{{ latest_target.get('date','—') }}</div><div class="note">Latest Solar_Daily_History row</div></div>
      </div>
    </div>

    <div class="grid-2">
      <div class="card">
        <h2>Controls</h2>
        <form method="post" style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="primary" type="submit" name="action" value="sync">Sync now</button>
          <button class="success" type="submit" name="action" value="install">Install day/night task</button>
          <button class="danger" type="submit" name="action" value="uninstall">Remove day/night task</button>
        </form>
        {% if output %}
          <h3>Command output</h3>
          <pre>{{ output }}</pre>
        {% endif %}
      </div>
      <div class="card">
        <h2>Current target readings</h2>
        <table>
          <tr><td>Date</td><td><b>{{ latest_target.get('date','—') }}</b></td></tr>
          <tr><td>M01</td><td><b>{{ n(latest_target.get('meter01_grid_import'),1) }}</b></td></tr>
          <tr><td>M02</td><td><b>{{ n(latest_target.get('meter02_grid_export'),1) }}</b></td></tr>
          <tr><td>Source</td><td>{{ latest_target.get('source',{}).get('meter','—') }}</td></tr>
        </table>
      </div>
    </div>

    <div class="card">
      <h2>Latest meter-sync log</h2>
      <pre>{{ log_tail or "No meter synchronization has run yet." }}</pre>
    </div>
    """

    return render_page(
        "Meter Sync",
        content,
        source_file=APPLICATION_DATA_FILE,
        latest_source=latest_source,
        latest_target=latest_target,
        output=output,
        log_tail=log_tail,
        n=n,
    )


@app.route("/meter", methods=["GET", "POST"])
def meter_page() -> str:
    output = None
    if request.method == "POST":
        try:
            date_text = request.form["date"]
            meter01 = float(request.form["meter01"])
            meter02 = float(request.form["meter02"])
            command = [
                sys.executable, str(CONTROLLER), "--update-meter",
                date_text, str(meter01), str(meter02),
            ]
            optional = [
                ("irradiance", "--irradiance"),
                ("weather", "--weather"),
                ("high", "--high"),
                ("low", "--low"),
            ]
            for field, switch in optional:
                value = request.form.get(field, "").strip()
                if value:
                    command.extend([switch, value])
            result = subprocess.run(command, cwd=str(SCRIPT_DIR), text=True, capture_output=True, check=False)
            output = (result.stdout or "") + ("\n" + result.stderr if result.stderr else "")
            if result.returncode == 0:
                flash("Meter reading added to the cumulative JSON.", "success")
            else:
                flash("Meter update failed. Review the output below.", "error")
        except Exception as exc:
            flash(f"Meter reading was not saved: {exc}", "error")

    content = """
    <div class="grid-2">
      <div class="card">
        <h1>Add NYSEG meter reading</h1>
        <p class="help">Enter the cumulative readings shown by the smart meter. Meter 01 is energy imported from NYSEG. Meter 02 is solar energy exported to NYSEG.</p>
        <form method="post">
          <label>Date</label><input type="date" name="date" required value="{{ today }}">
          <label>Meter 01 — cumulative grid import</label><input type="number" step="0.001" name="meter01" required>
          <label>Meter 02 — cumulative grid export</label><input type="number" step="0.001" name="meter02" required>
          <label>Irradiance W/m² (optional)</label><input type="number" step="0.1" name="irradiance">
          <label>Weather (optional)</label><input type="text" name="weather" placeholder="Sunny">
          <div class="grid-2">
            <div><label>High °F (optional)</label><input type="number" step="0.1" name="high"></div>
            <div><label>Low °F (optional)</label><input type="number" step="0.1" name="low"></div>
          </div>
          <p><button class="success" type="submit">Save meter reading</button></p>
        </form>
      </div>
      <div class="card">
        <h2>How daily energy is calculated</h2>
        <p><b>Daily grid import</b> = today's Meter 01 − yesterday's Meter 01</p>
        <p><b>Daily grid export</b> = today's Meter 02 − yesterday's Meter 02</p>
        <p><b>Solar used in home</b> = solar production − daily export</p>
        <p><b>Estimated home consumption</b> = solar used in home + daily import</p>
        <p><b>Solar coverage</b> = solar used in home ÷ estimated home consumption</p>
        <p class="help">A previous day's reading is required before the application can calculate daily import and export.</p>
      </div>
    </div>
    {% if output %}<div class="card"><h2>Update output</h2><pre>{{ output }}</pre></div>{% endif %}
    """
    return render_page("Meter Reading", content, today=datetime.now().strftime("%Y-%m-%d"), output=output)


@app.route("/guide")
def guide() -> str:
    content = """
    <div class="card">
      <h1>Application and solar process guide</h1>
      <p class="help">This application combines Sunrun production, NYSEG cumulative smart-meter readings and weather information into one cumulative history.</p>
    </div>
    <div class="grid-2">
      <div class="card">
        <h2>Data flow</h2>
        <ol>
          <li>Sunrun production is downloaded as a CSV.</li>
          <li>Production is merged into <b>Solar_Daily_History.json</b>.</li>
          <li>Meter 01 and Meter 02 readings are entered manually.</li>
          <li>Daily import/export are calculated from meter differences.</li>
          <li>Charts and an HTML report are created.</li>
          <li>The report is emailed and archived locally.</li>
        </ol>
      </div>
      <div class="card">
        <h2>Important folders</h2>
        <p><b>JSON:</b><br>{{ json_file }}</p>
        <p><b>Reports:</b><br>{{ report_dir }}</p>
        <p><b>Scripts:</b><br>{{ script_dir }}</p>
        <p><b>Logs:</b><br>{{ log_dir }}</p>
      </div>
      <div class="card">
        <h2>Understanding the metrics</h2>
        <p><b>Production:</b> all solar energy produced by the panels.</p>
        <p><b>Self-consumption:</b> production used immediately inside the home.</p>
        <p><b>Export:</b> excess solar sent to NYSEG through Meter 02.</p>
        <p><b>Import:</b> energy purchased from NYSEG through Meter 01.</p>
        <p><b>Solar coverage:</b> estimated percentage of home demand served directly by solar.</p>
      </div>
      <div class="card">
        <h2>Operational guidance</h2>
        <p>Use <b>Run Process</b> to start the complete workflow manually.</p>
        <p>Use <b>Add Meter Reading</b> each day after recording both meter values.</p>
        <p>Use the JSON editor only for corrections. A backup is created automatically before every save.</p>
        <p>Saved reports are standalone files and remain available even if an email is deleted.</p>
      </div>
    </div>
    """
    return render_page("Solar Guide", content, json_file=JSON_FILE, report_dir=REPORT_DIR, script_dir=SCRIPT_DIR, log_dir=LOG_DIR)


def open_browser() -> None:
    webbrowser.open(f"http://{HOST}:{PORT}")


if __name__ == "__main__":
    print(f"Sunrun Energy Portal starting at http://{HOST}:{PORT}")
    print("Press Ctrl+C to stop the portal.")
    threading.Timer(1.2, open_browser).start()
    app.run(host=HOST, port=PORT, debug=False)
