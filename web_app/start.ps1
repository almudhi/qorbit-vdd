# Drone VDD — Web App Launcher (PowerShell)
# ─────────────────────────────────────────
# Run this from the web_app/ folder:
#   cd web_app
#   .\start.ps1
#
# Or pass your Python path if it's not in PATH:
#   & "C:\path\to\python.exe" -m uvicorn main:app --reload

$env:MODEL_PATH        = "C:\Users\ABADY\Downloads\best.pt"
$env:ANTHROPIC_API_KEY = ""   # paste your sk-ant-... key here, OR enter it in the browser UI
$env:CONF_THRESHOLD    = "0.40"

Write-Host ""
Write-Host "  Drone Visual Distortion Detection" -ForegroundColor Cyan
Write-Host "  http://localhost:8000" -ForegroundColor Green
Write-Host ""

# Try 'uvicorn' on PATH first, then fall back to 'python -m uvicorn'
if (Get-Command uvicorn -ErrorAction SilentlyContinue) {
    uvicorn main:app --reload --host 0.0.0.0 --port 8000
} else {
    python -m uvicorn main:app --reload --host 0.0.0.0 --port 8000
}
