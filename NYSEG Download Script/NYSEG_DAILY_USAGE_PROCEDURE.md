# Daily NYSEG Usage Download and Data Entry Update

Use this process once a day after NYSEG has posted the latest hourly interval data. It keeps utility meter data separate from estimates until you review the proposed changes.

## What the file means

- `Delivered` is electricity NYSEG supplied to the house. It is the daily increase for **M01**.
- `Received` is electricity NYSEG accepted from the solar system. It is the daily increase for **M02**.
- The CSV reports hourly increments, not cumulative register readings. The app converts those increments into cumulative M01/M02 readings using the most recent confirmed reading as its anchor.

## Download the NYSEG file

1. Open `https://energymanager.nyseg.com/insights` and sign in.
2. Select **Download My Energy Use Data**.
3. In the download dialog, choose:
   - **Data Type:** Usage
   - **Date Range:** Custom
   - **Start:** July 1, 2026
   - **End:** today’s date
   - **File Format:** CSV
4. Select **Download file**.
5. Save the file as `NYSEG_Daily_Usage_Data.csv` in:

   `C:\Software Developement\ChatGPT Codex\Solar Energy - SunRun\SunRun Data`

6. Do not edit the `Date`, `Delivered`, or `Received` columns. They are needed to calculate the meter registers correctly.

## Review and populate Data Entry

1. Open the local tracker at `http://127.0.0.1:5000/entries`.
2. Select **Review NYSEG meter import** at the top of the page.
3. Review every proposed change. The preview shows the current reading, the utility-derived cumulative reading, and that day’s Delivered/Received increments.
4. Confirmed manual readings remain protected. The preview proposes updates only for estimated rows.
5. Select **Apply utility readings** only after the values look correct.
6. Refresh Data Entry. The updated rows will show `nyseg-hourly-intervals` as their source.

## Script status

`NYSEG Download Script\nyseg_download.py` now uses the correct Insights URL, July 1, 2026 default start date, requested output folder, and requested file name. It preserves a local browser profile for future runs.

The NYSEG download-dialog selectors still need one headed validation because the portal’s modal fields have not been inspected by the script. Until those selectors are verified, use the browser steps above. Do not save NYSEG credentials in the script or commit them to Git.

When the selectors are verified, run the script in a visible browser first so any NYSEG MFA or CAPTCHA can be completed:

```powershell
$credential = Get-Credential
$env:NYSEG_USER = $credential.UserName
$env:NYSEG_PASS = [System.Net.NetworkCredential]::new('', $credential.Password).Password
py '.\NYSEG Download Script\nyseg_download.py' --headed --start 2026-07-01
Remove-Item Env:NYSEG_USER, Env:NYSEG_PASS
```

The environment variables exist only in that PowerShell session. The script should remain headed until a successful download confirms the exact portal selectors.