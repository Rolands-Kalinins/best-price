# Парсер e-LaTS с ПК владельца (FR-31): e-latts.lv отвечает GitHub Actions кодом 403, с домашнего адреса 200.
# Пишет в боевую БД. Ключи берёт из .env.prod (в git его нет) и кладёт только в окружение этого процесса.
# Ночной запуск: задача «BestPrice e-latts» в Планировщике Windows (см. docs/PLAN.md, «Запуск e-LaTS с ПК»).
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
Get-Content .env.prod | ForEach-Object {
  if ($_ -match '^\s*([A-Z_]+)=(.*)$') { Set-Item -Path "Env:$($Matches[1])" -Value $Matches[2].Trim().Trim('"') }
}
$log = Join-Path $root 'packages\scrapers\e-latts\debug\pc-run.log'
New-Item -ItemType Directory -Force (Split-Path $log) | Out-Null
"=== $(Get-Date -Format s)" | Add-Content $log
# cmd /c: stderr pnpm не превращается в исключение PowerShell 5.1 (при Stop это роняло скрипт до запуска парсера).
cmd /c "pnpm --filter @bestprice/scraper-e-latts scrape >> `"$log`" 2>&1"
$code = $LASTEXITCODE
"exit $code" | Add-Content $log
exit $code
