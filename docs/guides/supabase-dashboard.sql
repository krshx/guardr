-- ═══════════════════════════════════════════════════════════════════════════
-- Guardr v3.0 - Supabase Analytics Dashboard
-- ═══════════════════════════════════════════════════════════════════════════
-- 
-- Run this ONCE in Supabase SQL Editor to create all dashboard views.
-- Views auto-refresh on each query - just navigate to them in Table Editor.
--
-- After running, your views will appear under:
--   Database → Views (in Supabase dashboard)
--
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop existing views if they exist (for clean re-run)
DROP VIEW IF EXISTS guardr_overview CASCADE;
DROP VIEW IF EXISTS guardr_cmp_stats CASCADE;
DROP VIEW IF EXISTS guardr_domain_stats CASCADE;
DROP VIEW IF EXISTS guardr_daily_stats CASCADE;
DROP VIEW IF EXISTS guardr_hourly_stats CASCADE;
DROP VIEW IF EXISTS guardr_consent_or_pay CASCADE;
DROP VIEW IF EXISTS guardr_success_rates CASCADE;
DROP VIEW IF EXISTS guardr_version_stats CASCADE;
DROP VIEW IF EXISTS guardr_recent_activity CASCADE;

-- ═══════════════════════════════════════════════════════════════════════════
-- VIEW: guardr_overview
-- High-level summary stats - your main dashboard KPIs
-- ═══════════════════════════════════════════════════════════════════════════
CREATE VIEW guardr_overview AS
SELECT
  -- Total counts
  COUNT(*) AS total_scans,
  COUNT(*) FILTER (WHERE banner_closed = true) AS successful_closures,
  ROUND(100.0 * COUNT(*) FILTER (WHERE banner_closed = true) / NULLIF(COUNT(*), 0), 1) AS success_rate_pct,
  
  -- Denial totals
  COALESCE(SUM(denied_count), 0) AS total_cookies_denied,
  COALESCE(SUM(consent_denials), 0) AS total_consent_denied,
  COALESCE(SUM(legitimate_interest_denials), 0) AS total_li_denied,
  COALESCE(SUM(vendor_denials), 0) AS total_vendor_denied,
  COALESCE(SUM(other_denials), 0) AS total_other_denied,
  COALESCE(SUM(kept_count), 0) AS total_kept,
  
  -- Averages
  ROUND(AVG(denied_count), 1) AS avg_denied_per_scan,
  ROUND(AVG(kept_count), 1) AS avg_kept_per_scan,
  
  -- Unique counts
  COUNT(DISTINCT domain) AS unique_domains,
  COUNT(DISTINCT session_token) AS unique_sessions,
  COUNT(DISTINCT cmp_type) AS unique_cmps,
  
  -- Consent-or-pay
  COUNT(*) FILTER (WHERE consent_or_pay_detected = true) AS paywall_detections,
  
  -- Time range
  MIN(created_at) AS first_scan,
  MAX(created_at) AS latest_scan,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') AS scans_last_24h,
  COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') AS scans_last_7d
FROM cookie_telemetry;

-- ═══════════════════════════════════════════════════════════════════════════
-- VIEW: guardr_cmp_stats
-- Performance breakdown by CMP type
-- ═══════════════════════════════════════════════════════════════════════════
CREATE VIEW guardr_cmp_stats AS
SELECT
  cmp_type,
  COUNT(*) AS total_scans,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER (), 1) AS market_share_pct,
  COUNT(*) FILTER (WHERE banner_closed = true) AS successful,
  ROUND(100.0 * COUNT(*) FILTER (WHERE banner_closed = true) / NULLIF(COUNT(*), 0), 1) AS success_rate_pct,
  ROUND(AVG(denied_count), 1) AS avg_denied,
  ROUND(AVG(consent_denials), 1) AS avg_consent,
  ROUND(AVG(legitimate_interest_denials), 1) AS avg_li,
  ROUND(AVG(vendor_denials), 1) AS avg_vendors,
  ROUND(AVG(kept_count), 1) AS avg_kept,
  MAX(denied_count) AS max_denied,
  COUNT(*) FILTER (WHERE consent_or_pay_detected = true) AS paywall_count
FROM cookie_telemetry
GROUP BY cmp_type
ORDER BY total_scans DESC;

-- ═══════════════════════════════════════════════════════════════════════════
-- VIEW: guardr_domain_stats
-- Top domains by activity and denial counts
-- ═══════════════════════════════════════════════════════════════════════════
CREATE VIEW guardr_domain_stats AS
SELECT
  domain,
  cmp_type,
  COUNT(*) AS total_scans,
  COUNT(*) FILTER (WHERE banner_closed = true) AS successful,
  ROUND(100.0 * COUNT(*) FILTER (WHERE banner_closed = true) / NULLIF(COUNT(*), 0), 1) AS success_rate_pct,
  SUM(denied_count) AS total_denied,
  ROUND(AVG(denied_count), 1) AS avg_denied,
  MAX(denied_count) AS max_denied,
  SUM(kept_count) AS total_kept,
  COUNT(*) FILTER (WHERE consent_or_pay_detected = true) AS paywall_detections,
  MAX(created_at) AS last_seen,
  MIN(created_at) AS first_seen
FROM cookie_telemetry
WHERE domain IS NOT NULL AND domain != 'unknown'
GROUP BY domain, cmp_type
ORDER BY total_scans DESC
LIMIT 100;

-- ═══════════════════════════════════════════════════════════════════════════
-- VIEW: guardr_daily_stats
-- Daily trends for charting
-- ═══════════════════════════════════════════════════════════════════════════
CREATE VIEW guardr_daily_stats AS
SELECT
  DATE(created_at) AS day,
  COUNT(*) AS scans,
  COUNT(*) FILTER (WHERE banner_closed = true) AS successful,
  ROUND(100.0 * COUNT(*) FILTER (WHERE banner_closed = true) / NULLIF(COUNT(*), 0), 1) AS success_rate_pct,
  SUM(denied_count) AS denied,
  SUM(consent_denials) AS consent_denied,
  SUM(legitimate_interest_denials) AS li_denied,
  SUM(vendor_denials) AS vendor_denied,
  SUM(kept_count) AS kept,
  COUNT(DISTINCT domain) AS unique_domains,
  COUNT(DISTINCT session_token) AS unique_sessions,
  COUNT(*) FILTER (WHERE consent_or_pay_detected = true) AS paywalls
FROM cookie_telemetry
WHERE created_at > NOW() - INTERVAL '90 days'
GROUP BY DATE(created_at)
ORDER BY day DESC;

-- ═══════════════════════════════════════════════════════════════════════════
-- VIEW: guardr_hourly_stats
-- Hourly trends (last 7 days)
-- ═══════════════════════════════════════════════════════════════════════════
CREATE VIEW guardr_hourly_stats AS
SELECT
  DATE_TRUNC('hour', created_at) AS hour,
  COUNT(*) AS scans,
  COUNT(*) FILTER (WHERE banner_closed = true) AS successful,
  SUM(denied_count) AS denied,
  COUNT(DISTINCT domain) AS unique_domains
FROM cookie_telemetry
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY DATE_TRUNC('hour', created_at)
ORDER BY hour DESC;

-- ═══════════════════════════════════════════════════════════════════════════
-- VIEW: guardr_consent_or_pay
-- Sites with consent-or-pay (paywall) detected
-- ═══════════════════════════════════════════════════════════════════════════
CREATE VIEW guardr_consent_or_pay AS
SELECT
  domain,
  cmp_type,
  COUNT(*) AS times_detected,
  MAX(created_at) AS last_seen,
  MIN(created_at) AS first_seen,
  COUNT(DISTINCT session_token) AS unique_users
FROM cookie_telemetry
WHERE consent_or_pay_detected = true
GROUP BY domain, cmp_type
ORDER BY times_detected DESC;

-- ═══════════════════════════════════════════════════════════════════════════
-- VIEW: guardr_success_rates
-- Success rates by various dimensions
-- ═══════════════════════════════════════════════════════════════════════════
CREATE VIEW guardr_success_rates AS
SELECT
  'By CMP Type' AS dimension,
  cmp_type AS value,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE banner_closed = true) AS successful,
  ROUND(100.0 * COUNT(*) FILTER (WHERE banner_closed = true) / NULLIF(COUNT(*), 0), 1) AS rate_pct
FROM cookie_telemetry
GROUP BY cmp_type

UNION ALL

SELECT
  'By Version' AS dimension,
  version AS value,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE banner_closed = true) AS successful,
  ROUND(100.0 * COUNT(*) FILTER (WHERE banner_closed = true) / NULLIF(COUNT(*), 0), 1) AS rate_pct
FROM cookie_telemetry
GROUP BY version

UNION ALL

SELECT
  'Overall' AS dimension,
  'All' AS value,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE banner_closed = true) AS successful,
  ROUND(100.0 * COUNT(*) FILTER (WHERE banner_closed = true) / NULLIF(COUNT(*), 0), 1) AS rate_pct
FROM cookie_telemetry

ORDER BY dimension, rate_pct DESC;

-- ═══════════════════════════════════════════════════════════════════════════
-- VIEW: guardr_version_stats
-- Breakdown by extension version
-- ═══════════════════════════════════════════════════════════════════════════
CREATE VIEW guardr_version_stats AS
SELECT
  version,
  COUNT(*) AS total_scans,
  COUNT(*) FILTER (WHERE banner_closed = true) AS successful,
  ROUND(100.0 * COUNT(*) FILTER (WHERE banner_closed = true) / NULLIF(COUNT(*), 0), 1) AS success_rate_pct,
  ROUND(AVG(denied_count), 1) AS avg_denied,
  COUNT(DISTINCT domain) AS unique_domains,
  COUNT(DISTINCT session_token) AS unique_sessions,
  MIN(created_at) AS first_seen,
  MAX(created_at) AS last_seen
FROM cookie_telemetry
GROUP BY version
ORDER BY version DESC;

-- ═══════════════════════════════════════════════════════════════════════════
-- VIEW: guardr_recent_activity
-- Last 100 scans for real-time monitoring
-- ═══════════════════════════════════════════════════════════════════════════
CREATE VIEW guardr_recent_activity AS
SELECT
  created_at,
  domain,
  cmp_type,
  banner_closed,
  denied_count,
  consent_denials,
  legitimate_interest_denials,
  vendor_denials,
  kept_count,
  consent_or_pay_detected,
  version,
  session_token
FROM cookie_telemetry
ORDER BY created_at DESC
LIMIT 100;

-- ═══════════════════════════════════════════════════════════════════════════
-- GRANT ACCESS (if using RLS, make views accessible)
-- ═══════════════════════════════════════════════════════════════════════════
-- Uncomment if needed:
-- GRANT SELECT ON guardr_overview TO anon, authenticated;
-- GRANT SELECT ON guardr_cmp_stats TO anon, authenticated;
-- GRANT SELECT ON guardr_domain_stats TO anon, authenticated;
-- GRANT SELECT ON guardr_daily_stats TO anon, authenticated;
-- GRANT SELECT ON guardr_hourly_stats TO anon, authenticated;
-- GRANT SELECT ON guardr_consent_or_pay TO anon, authenticated;
-- GRANT SELECT ON guardr_success_rates TO anon, authenticated;
-- GRANT SELECT ON guardr_version_stats TO anon, authenticated;
-- GRANT SELECT ON guardr_recent_activity TO anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════
-- SUCCESS MESSAGE
-- ═══════════════════════════════════════════════════════════════════════════
SELECT '✓ Guardr Dashboard Views Created Successfully!' AS status,
       'Navigate to Database → Views in Supabase to see your dashboard' AS next_step;
