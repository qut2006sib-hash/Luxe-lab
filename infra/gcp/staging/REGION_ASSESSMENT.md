# Homs-focused Google Cloud region assessment

Assessment date: 2026-08-04.

## Measurement boundary

No unauthenticated Globalping probe was available in Homs or anywhere in
Syria. The current desktop egress was also outside Syria, so its direct results
were discarded. The nearest publicly usable probe was an eyeball-network probe
in Sidon, Lebanon (AS39402), approximately 180 km in a straight line from Homs.

This is a routing proxy, not a claim that traffic originated in Homs. RIPE Atlas
listed three connected Syrian probes, including one near Tartous, but creating
a new target-specific measurement requires authenticated RIPE Atlas access and
credits. Before this assessment, no pre-existing public measurement targeted
the reviewed regional IPs.

## Method

The Sidon probe sent 20 rotating rounds of HTTPS measurements to Google Cloud
Storage regional endpoints. All four requests were created before polling each
round, and every candidate appeared exactly five times in each order position.
The comparison window ran from `2026-08-04T17:18:39.513Z` through
`2026-08-04T17:21:48.683Z`.

Google documents that these HTTPS endpoints route directly to the named region
and terminate Internet TLS in that region, unlike a global endpoint that may
terminate near the client. ICMP observations from an exploratory run were
corroborating network-path evidence only and are not used in the ranking.

Each request used IPv4, TLS 1.3, and `HEAD /storage/v1/b`. HTTP 400 was expected
because no authenticated storage operation was requested; DNS, TCP, TLS, and
regional response timing still completed. The source probe, ASN, and statuses
were invariant across all 80 successful samples, and each region retained one
target IP. No Google Cloud resource, bucket, account, credential, or production
data was used.

The shortlist contains the closest reviewed locations that support both the
Cloud Run Worker Pool topology and Cloud SQL MySQL:

| Candidate                | HTTPS p50 | HTTPS p90 |   IQR |   MAD |        Range | Result                      |
| ------------------------ | --------: | --------: | ----: | ----: | -----------: | --------------------------- |
| Turin `europe-west12`    |    157 ms |    203 ms | 19 ms |  5 ms |   151-213 ms | Fastest overall             |
| Frankfurt `europe-west3` |    191 ms |    241 ms | 30 ms |  7 ms |   182-817 ms | Second                      |
| Dammam `me-central2`     |    364 ms |    410 ms | 18 ms |  8 ms | 350-1,276 ms | Fastest Middle East         |
| Doha `me-central1`       |    391 ms |    630 ms | 66 ms | 18 ms | 366-1,907 ms | Slowest shortlist candidate |

Percentiles use nearest rank (`ceil(p * n) - 1`) with no removed or winsorized
samples. IQR and median absolute deviation (MAD) are reported to make burst
dispersion visible. Turin beat Frankfurt in 18 of 20 paired rounds, while
Dammam beat Doha in 17 of 20. The nearest-rank median paired advantages were 33
ms for Turin over Frankfurt and 24 ms for Dammam over Doha.

## Recommendation

Use Turin (`europe-west12`) as the provisional Terraform default because it had
the lowest p50 and lowest observed MAD in this Sidon test window. Use Dammam
(`me-central2`) as the Middle East fallback when a residency requirement
applies only after a separate legal, commercial-access, and residency
eligibility review confirms that the region satisfies the project's
requirements, or when a real Homs measurement reverses the ordering. Do not
select Doha by geography alone.

Before provisioning, rerun the repository measurement script from at least one
representative fixed connection and one representative mobile connection in
Homs, at peak and off-peak times, without a VPN. Require at least 20 interleaved
samples per region and compare p50, p90, error rate, dispersion, target IP, and
paired-round consistency. The actual Homs result supersedes this proxy result.

Public endpoint latency is only a user-path proxy. The private Cloud Run to
Cloud SQL path, Auth Proxy overhead, connection reuse, and query latency must be
measured during the synthetic Staging rehearsal.

## Audit references

- Globalping seed/source measurement: `26F9n5t765xq9FHTc00020t4L`.
- The request payload used `type=http`, the seed measurement as the location
  magic value, HTTPS, IPv4, and `HEAD /storage/v1/b`.
- The 80 measurement IDs, timestamps, rotating positions, probe metadata,
  address family, statuses, endpoint IPs, and raw phase durations are committed
  in
  [`REGION_MEASUREMENTS.csv`](./REGION_MEASUREMENTS.csv). Each ID can be
  inspected at `https://api.globalping.io/v1/measurements/MEASUREMENT_ID`.

Sources:

- [Google Cloud regional endpoints](https://docs.cloud.google.com/storage/docs/regional-endpoints)
- [Cloud Run Worker Pool locations](https://docs.cloud.google.com/run/docs/deploy-worker-pools)
- [Cloud SQL region availability](https://docs.cloud.google.com/sql/docs/mysql/region-availability-overview)
- [Globalping API](https://globalping.io/docs/api.globalping.io#post-/v1/measurements)
- [Connected RIPE Atlas Syrian probes](https://atlas.ripe.net/api/v2/probes/?country_code=SY&status=1&page_size=100)
