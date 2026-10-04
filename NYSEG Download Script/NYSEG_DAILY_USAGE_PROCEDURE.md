# NYSEG Playwright Download Process

The solar tracker reads NYSEG’s hourly `Delivered` and `Received` values from:

`C:\Software Developement\ChatGPT Codex\Solar Energy - SunRun\SunRun Data\NYSEG_Daily_Usage_Data.csv`

`Delivered` is the daily M01 increment and `Received` is the daily M02 increment. The application converts those daily increments to cumulative meter readings only after you review and apply the import.

## One-time setup

```powershell
python -m pip install playwright
python -m playwright install chromium
```

## First interactive download

Run this from the project folder. It opens a visible browser, signs in using credentials held only in the current PowerShell session, and gives you time to complete NYSEG MFA or CAPTCHA. The authenticated browser session is stored outside the repository under your local application data.

```powershell
$credential = Get-Credential
$env:NYSEG_USER = $credential.UserName
$env:NYSEG_PASS = [System.Net.NetworkCredential]::new('', $credential.Password).Password
python '.\NYSEG Download Script\nyseg_download.py' --headed --start 2026-07-01
Remove-Item Env:NYSEG_USER, Env:NYSEG_PASS
```

After sign-in, the script waits up to 60 seconds for NYSEG Insights to finish loading **Download My Energy Use Data** and then selects:

- Usage
- Custom date range: July 1, 2026 through today
- CSV
- Download file

It verifies that `Date`, `Delivered`, and `Received` are present, archives the previous CSV in `SunRun Data\archive`, and replaces the current source file only after validation succeeds.

## Daily download

After a successful interactive run, NYSEG’s saved browser session can normally download without credentials:

```powershell
powershell -ExecutionPolicy Bypass -File '.\NYSEG Download Script\run_nyseg_download.ps1'
```

If NYSEG expires the session or presents MFA, run the first interactive command again. The script saves a diagnostic screenshot in local application data on failure; it never saves a screenshot or credentials in the repository.

## Optional 7:30 AM scheduled task

The installer only creates the Windows task; it does not run it immediately:

```powershell
powershell -ExecutionPolicy Bypass -File '.\NYSEG Download Script\Install_NYSEG_Download_Task.ps1' -Force
```

The task runs at 7:30 AM and uses the saved NYSEG browser session. It requires that the first interactive download has completed successfully.

## Apply the values in the app

1. Open [Downloaded NYSEG usage file](http://127.0.0.1:5000/nyseg-usage-file/daily).
2. Choose **Import latest M01/M02**.
3. Review each proposed cumulative meter reading.
4. The app saves a Firebase backup of affected M01/M02 rows when you apply the review.
5. If the import is wrong, choose **Restore backup** on the same page.
