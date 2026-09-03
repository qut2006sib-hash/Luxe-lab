[CmdletBinding()]
param(
  [ValidateRange(5, 100)]
  [int]$Samples = 20,

  [ValidateSet("IPv4", "IPv6")]
  [string]$AddressFamily = "IPv4",

  [string]$OutputPath,

  [Parameter(Mandatory = $true)]
  [switch]$ConfirmHomsNetwork
)

$ErrorActionPreference = "Stop"
if (Test-Path variable:PSNativeCommandUseErrorActionPreference) {
  $PSNativeCommandUseErrorActionPreference = $false
}

if (-not $ConfirmHomsNetwork) {
  throw "Confirm that this is a representative Homs connection before measuring."
}

$proxyVariables = @(
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "http_proxy",
  "https_proxy",
  "all_proxy"
)
$configuredProxyVariables = @(
  $proxyVariables | Where-Object { -not [string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($_)) }
)
if ($configuredProxyVariables.Count -gt 0) {
  throw "Proxy environment variables are set ($($configuredProxyVariables -join ', ')). Clear them and disable any VPN before measuring."
}

$curl = Get-Command curl.exe -CommandType Application -ErrorAction SilentlyContinue
if (-not $curl) {
  $curl = Get-Command curl -CommandType Application -ErrorAction SilentlyContinue
}
if (-not $curl -or [string]::IsNullOrWhiteSpace($curl.Source)) {
  throw "curl is required."
}

$regions = @(
  "europe-west12",
  "europe-west3",
  "me-central2",
  "me-central1"
)

$nullDevice = if ($env:OS -eq "Windows_NT") { "NUL" } else { "/dev/null" }
$addressFamilyArgument = if ($AddressFamily -eq "IPv4") { "--ipv4" } else { "--ipv6" }
$curlVersion = (& $curl.Source --disable --version | Select-Object -First 1)
$startedAt = [DateTimeOffset]::UtcNow
$rows = [System.Collections.Generic.List[object]]::new()

function Get-Percentile {
  param(
    [double[]]$Values,
    [ValidateRange(0, 1)]
    [double]$Percentile
  )

  if ($Values.Count -eq 0) {
    return $null
  }

  $sorted = @($Values | Sort-Object)
  $index = [Math]::Max(0, [Math]::Ceiling($Percentile * $sorted.Count) - 1)
  return $sorted[$index]
}

function Convert-ToMilliseconds {
  param([string]$Seconds)

  return [double]::Parse(
    $Seconds,
    [System.Globalization.CultureInfo]::InvariantCulture
  ) * 1000
}

function Invoke-RegionalRequest {
  param(
    [string]$Region,
    [int]$Sample,
    [int]$Order
  )

  $format = "%{http_code}|%{remote_ip}|%{http_version}|%{ssl_verify_result}|%{time_namelookup}|%{time_connect}|%{time_appconnect}|%{time_starttransfer}|%{time_total}"
  $requestedAt = [DateTimeOffset]::UtcNow
  $raw = & $curl.Source --disable --silent --output $nullDevice `
    --noproxy "*" `
    $addressFamilyArgument `
    --tlsv1.3 `
    --connect-timeout 10 `
    --max-time 30 `
    --write-out $format `
    --request HEAD `
    "https://storage.$Region.rep.googleapis.com/storage/v1/b"
  $curlExitCode = $LASTEXITCODE
  $parts = @($raw -split "\|")

  if ($curlExitCode -ne 0 -or $parts.Count -ne 9 -or $parts[0] -eq "000") {
    return [pscustomobject]@{
      Region          = $Region
      Sample          = $Sample
      Order           = $Order
      RequestedAtUtc  = $requestedAt.ToString("o")
      Success         = $false
      ErrorKind       = "transport"
      CurlExitCode    = $curlExitCode
      StatusCode      = 0
      RemoteIp        = $null
      HttpVersion     = $null
      SslVerifyResult = $null
      DnsMs           = $null
      TcpMs           = $null
      TlsMs           = $null
      FirstByteMs     = $null
      TotalMs         = $null
    }
  }

  $dns = Convert-ToMilliseconds $parts[4]
  $connect = Convert-ToMilliseconds $parts[5]
  $tlsComplete = Convert-ToMilliseconds $parts[6]
  $firstByteComplete = Convert-ToMilliseconds $parts[7]
  $total = Convert-ToMilliseconds $parts[8]
  $statusCode = [int]$parts[0]
  $success = $statusCode -eq 400 -and [int]$parts[3] -eq 0

  return [pscustomobject]@{
    Region          = $Region
    Sample          = $Sample
    Order           = $Order
    RequestedAtUtc  = $requestedAt.ToString("o")
    Success         = $success
    ErrorKind       = if ($success) { $null } else { "unexpected_response" }
    CurlExitCode    = $curlExitCode
    StatusCode      = $statusCode
    RemoteIp        = $parts[1]
    HttpVersion     = $parts[2]
    SslVerifyResult = [int]$parts[3]
    DnsMs           = [Math]::Round($dns, 1)
    TcpMs           = [Math]::Round([Math]::Max(0, $connect - $dns), 1)
    TlsMs           = [Math]::Round([Math]::Max(0, $tlsComplete - $connect), 1)
    FirstByteMs     = [Math]::Round([Math]::Max(0, $firstByteComplete - $tlsComplete), 1)
    TotalMs         = [Math]::Round($total, 1)
  }
}

Write-Warning "Run without VPN/proxy and repeat at peak and off-peak times. The script does not query, store, or print the source public IP."

# Warm DNS and curl startup without including the results.
foreach ($region in $regions) {
  & $curl.Source --disable --silent --output $nullDevice `
    --noproxy "*" `
    $addressFamilyArgument `
    --tlsv1.3 `
    --connect-timeout 10 `
    --max-time 30 `
    --request HEAD `
    "https://storage.$region.rep.googleapis.com/storage/v1/b"
}

# Rotate the first region each round to avoid a fixed-order time bias.
for ($sample = 1; $sample -le $Samples; $sample++) {
  $offset = ($sample - 1) % $regions.Count
  for ($position = 0; $position -lt $regions.Count; $position++) {
    $region = $regions[($offset + $position) % $regions.Count]
    $rows.Add((Invoke-RegionalRequest -Region $region -Sample $sample -Order ($position + 1)))
  }
}

$summary = foreach ($region in $regions) {
  $measurements = @($rows | Where-Object Region -eq $region)
  $successful = @($measurements | Where-Object Success)
  $failed = $measurements.Count - $successful.Count
  $totals = [double[]]@($successful | ForEach-Object TotalMs)
  $p25 = Get-Percentile $totals 0.25
  $p50 = Get-Percentile $totals 0.50
  $p75 = Get-Percentile $totals 0.75
  $absoluteDeviations = if ($totals.Count -gt 0) {
    [double[]]@($totals | ForEach-Object { [Math]::Abs($_ - $p50) })
  } else {
    [double[]]@()
  }

  [pscustomobject]@{
    Region           = $region
    Attempted        = $measurements.Count
    Succeeded        = $successful.Count
    Failed           = $failed
    ErrorRatePercent = [Math]::Round(($failed / $measurements.Count) * 100, 2)
    TotalP50Ms       = $p50
    TotalP90Ms       = Get-Percentile $totals 0.90
    TotalIqrMs       = if ($totals.Count -gt 0) { $p75 - $p25 } else { $null }
    TotalMadMs       = Get-Percentile $absoluteDeviations 0.50
    TotalMinMs       = if ($totals.Count -gt 0) { ($totals | Measure-Object -Minimum).Minimum } else { $null }
    TotalMaxMs       = if ($totals.Count -gt 0) { ($totals | Measure-Object -Maximum).Maximum } else { $null }
  }
}

$summary = @($summary | Sort-Object Failed, TotalP50Ms, TotalP90Ms)
$completedAt = [DateTimeOffset]::UtcNow
$report = [ordered]@{
  Metadata = [ordered]@{
    StartedAtUtc       = $startedAt.ToString("o")
    CompletedAtUtc     = $completedAt.ToString("o")
    SamplesPerRegion   = $Samples
    AddressFamily      = $AddressFamily
    CurlVersion        = $curlVersion
    PercentileMethod   = "nearest-rank"
    ExpectedStatusCode = 400
    SourceIpHandling   = "not queried, stored, or printed by this script"
  }
  Summary  = $summary
  Samples  = $rows
}

$summary | Format-Table -AutoSize
$incompleteRegions = @($summary | Where-Object { $_.Succeeded -ne $_.Attempted })
if ($incompleteRegions.Count -eq 0) {
  Write-Output "Provisional latency winner: $($summary[0].Region)"
} else {
  Write-Warning "The comparison is inconclusive because one or more regions had failures; inspect the JSON report and rerun before selecting a region."
}

if (-not [string]::IsNullOrWhiteSpace($OutputPath)) {
  $fullOutputPath = [System.IO.Path]::GetFullPath($OutputPath)
  $report | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $fullOutputPath -Encoding utf8
  Write-Output "Raw report written to: $fullOutputPath"
}

Write-Output "This measures the public user path only; validate private Cloud Run-to-Cloud SQL latency during Staging."
