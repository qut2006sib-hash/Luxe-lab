[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$evidencePath = Join-Path $PSScriptRoot "..\REGION_MEASUREMENTS.csv"
$rows = @(Import-Csv -LiteralPath $evidencePath)

function Assert-Equal {
  param(
    $Actual,
    $Expected,
    [string]$Message
  )

  if ($Actual -ne $Expected) {
    throw "$Message Expected '$Expected', received '$Actual'."
  }
}

function Get-NearestRank {
  param(
    [double[]]$Values,
    [double]$Percentile
  )

  $sorted = @($Values | Sort-Object)
  return $sorted[[Math]::Ceiling($Percentile * $sorted.Count) - 1]
}

$expected = [ordered]@{
  "europe-west12" = @{ P50 = 157; P90 = 203; Iqr = 19; Mad = 5; Minimum = 151; Maximum = 213; Ip = "34.1.107.140" }
  "europe-west3"  = @{ P50 = 191; P90 = 241; Iqr = 30; Mad = 7; Minimum = 182; Maximum = 817; Ip = "34.1.66.222" }
  "me-central2"   = @{ P50 = 364; P90 = 410; Iqr = 18; Mad = 8; Minimum = 350; Maximum = 1276; Ip = "34.1.64.160" }
  "me-central1"   = @{ P50 = 391; P90 = 630; Iqr = 66; Mad = 18; Minimum = 366; Maximum = 1907; Ip = "34.1.99.162" }
}

$requiredColumns = @(
  "region",
  "round",
  "order",
  "created_at_utc",
  "updated_at_utc",
  "measurement_id",
  "total_ms",
  "dns_ms",
  "tcp_ms",
  "tls_ms",
  "ttfb_ms",
  "download_ms",
  "remote_ip",
  "http_status",
  "tls_version",
  "probe_city",
  "probe_country",
  "probe_asn",
  "probe_network",
  "probe_latitude",
  "probe_longitude",
  "probe_tags",
  "address_family",
  "measurement_status",
  "test_status"
)

$actualColumns = @($rows[0].PSObject.Properties.Name)
foreach ($column in $requiredColumns) {
  Assert-Equal @($actualColumns | Where-Object { $_ -eq $column }).Count 1 "The evidence must contain column '$column'."
}

Assert-Equal $rows.Count 80 "The assessment must retain all raw samples."
Assert-Equal @($rows.measurement_id | Sort-Object -Unique).Count 80 "Measurement IDs must be unique."
Assert-Equal @($rows | ForEach-Object { "$($_.region)|$($_.round)" } | Sort-Object -Unique).Count 80 "Every region/round pair must be unique."
Assert-Equal @($rows | Where-Object { $_.http_status -ne "400" }).Count 0 "Every request must have the expected HTTP status."
Assert-Equal @($rows | Where-Object { $_.tls_version -ne "TLSv1.3" }).Count 0 "Every request must complete with TLS 1.3."
Assert-Equal @($rows | Where-Object { $_.address_family -ne "IPv4" }).Count 0 "Every request must use IPv4."
Assert-Equal @($rows | Where-Object { $_.measurement_status -ne "finished" }).Count 0 "Every measurement must finish."
Assert-Equal @($rows | Where-Object { $_.test_status -ne "finished" }).Count 0 "Every probe test must finish."
Assert-Equal @($rows.probe_city | Sort-Object -Unique).Count 1 "The source probe city must be invariant."
Assert-Equal @($rows.probe_country | Sort-Object -Unique).Count 1 "The source probe country must be invariant."
Assert-Equal @($rows.probe_asn | Sort-Object -Unique).Count 1 "The source probe ASN must be invariant."
Assert-Equal @($rows.probe_network | Sort-Object -Unique).Count 1 "The source probe network must be invariant."
Assert-Equal @($rows.probe_latitude | Sort-Object -Unique).Count 1 "The source probe latitude must be invariant."
Assert-Equal @($rows.probe_longitude | Sort-Object -Unique).Count 1 "The source probe longitude must be invariant."
Assert-Equal @($rows.probe_tags | Sort-Object -Unique).Count 1 "The source probe tags must be invariant."
Assert-Equal $rows[0].probe_city "Sidon" "The source probe city changed."
Assert-Equal $rows[0].probe_country "LB" "The source probe country changed."
Assert-Equal $rows[0].probe_asn "39402" "The source probe ASN changed."
Assert-Equal $rows[0].probe_network "Ferrari-Networks" "The source probe network changed."
Assert-Equal $rows[0].probe_latitude "33.56" "The source probe latitude changed."
Assert-Equal $rows[0].probe_longitude "35.37" "The source probe longitude changed."
Assert-Equal $rows[0].probe_tags "eyeball-network" "The source probe tags changed."

foreach ($row in $rows) {
  $createdAt = [DateTimeOffset]::Parse($row.created_at_utc, [System.Globalization.CultureInfo]::InvariantCulture)
  $updatedAt = [DateTimeOffset]::Parse($row.updated_at_utc, [System.Globalization.CultureInfo]::InvariantCulture)
  if ($updatedAt -lt $createdAt) {
    throw "$($row.measurement_id) completed before it was created."
  }

  $phaseTotal = [double]$row.dns_ms + [double]$row.tcp_ms + [double]$row.tls_ms + [double]$row.ttfb_ms + [double]$row.download_ms
  Assert-Equal $phaseTotal ([double]$row.total_ms) "$($row.measurement_id) phase durations must reconcile to total_ms."
}

Assert-Equal ($rows.created_at_utc | Sort-Object | Select-Object -First 1) "2026-08-04T17:18:39.513Z" "The assessment start time changed."
Assert-Equal ($rows.updated_at_utc | Sort-Object | Select-Object -Last 1) "2026-08-04T17:21:48.683Z" "The assessment end time changed."

foreach ($round in 1..20) {
  $roundSamples = @($rows | Where-Object { [int]$_.round -eq $round })
  Assert-Equal $roundSamples.Count 4 "Round $round must contain all four regions."
  Assert-Equal @($roundSamples.region | Sort-Object -Unique).Count 4 "Round $round must contain each region once."
  Assert-Equal @($roundSamples.order | Sort-Object -Unique).Count 4 "Round $round must contain each order position once."

  $chronological = @($roundSamples | Sort-Object created_at_utc)
  foreach ($position in 1..4) {
    Assert-Equal ([int]$chronological[$position - 1].order) $position "Round $round order $position must match request chronology."
  }
}

foreach ($region in $expected.Keys) {
  $samples = @($rows | Where-Object region -eq $region)
  $totals = [double[]]@($samples | ForEach-Object { [double]$_.total_ms })
  $minimum = ($totals | Measure-Object -Minimum).Minimum
  $maximum = ($totals | Measure-Object -Maximum).Maximum

  Assert-Equal $samples.Count 20 "$region must contain 20 samples."
  Assert-Equal @($samples.order | Sort-Object -Unique).Count 4 "$region must appear in every rotating position."
  foreach ($order in 1..4) {
    Assert-Equal @($samples | Where-Object { [int]$_.order -eq $order }).Count 5 "$region must appear five times in position $order."
  }
  Assert-Equal (Get-NearestRank $totals 0.50) $expected[$region].P50 "$region p50 changed."
  Assert-Equal (Get-NearestRank $totals 0.90) $expected[$region].P90 "$region p90 changed."
  $p25 = Get-NearestRank $totals 0.25
  $p50 = Get-NearestRank $totals 0.50
  $p75 = Get-NearestRank $totals 0.75
  $absoluteDeviations = [double[]]@($totals | ForEach-Object { [Math]::Abs($_ - $p50) })
  Assert-Equal ($p75 - $p25) $expected[$region].Iqr "$region IQR changed."
  Assert-Equal (Get-NearestRank $absoluteDeviations 0.50) $expected[$region].Mad "$region MAD changed."
  Assert-Equal $minimum $expected[$region].Minimum "$region minimum changed."
  Assert-Equal $maximum $expected[$region].Maximum "$region maximum changed."
  Assert-Equal @($samples.remote_ip | Sort-Object -Unique).Count 1 "$region target IP changed during the run."
  Assert-Equal $samples[0].remote_ip $expected[$region].Ip "$region target IP does not match the audit."
}

function Assert-PairedResult {
  param(
    [string]$FasterRegion,
    [string]$SlowerRegion,
    [int]$ExpectedWins,
    [double]$ExpectedMedianAdvantage
  )

  $wins = 0
  $advantages = [System.Collections.Generic.List[double]]::new()
  foreach ($round in 1..20) {
    $faster = [double]($rows | Where-Object { $_.region -eq $FasterRegion -and [int]$_.round -eq $round }).total_ms
    $slower = [double]($rows | Where-Object { $_.region -eq $SlowerRegion -and [int]$_.round -eq $round }).total_ms
    if ($faster -lt $slower) {
      $wins++
    }
    $advantages.Add($slower - $faster)
  }

  Assert-Equal $wins $ExpectedWins "$FasterRegion paired wins over $SlowerRegion changed."
  Assert-Equal (Get-NearestRank ([double[]]$advantages) 0.50) $ExpectedMedianAdvantage "$FasterRegion median paired advantage over $SlowerRegion changed."
}

Assert-PairedResult -FasterRegion "europe-west12" -SlowerRegion "europe-west3" -ExpectedWins 18 -ExpectedMedianAdvantage 33
Assert-PairedResult -FasterRegion "me-central2" -SlowerRegion "me-central1" -ExpectedWins 17 -ExpectedMedianAdvantage 24

Write-Output "Region assessment evidence: 80 samples verified."
