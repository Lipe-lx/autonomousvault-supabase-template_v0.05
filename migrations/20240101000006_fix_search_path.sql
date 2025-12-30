-- AutonomousVault v0.05 - Fix Search Path Security
-- Migration: 20240101000006_fix_search_path.sql
--
-- Fixes "Function Search Path Mutable" security warnings
-- Sets explicit search_path for all functions to prevent SQL injection via schema poisoning

-- ============================================
-- FIX: update_updated_at_column
-- ============================================
ALTER FUNCTION update_updated_at_column() SET search_path = public;

-- ============================================
-- FIX: create_default_plan
-- ============================================
ALTER FUNCTION create_default_plan() SET search_path = public;

-- ============================================
-- FIX: get_user_plan_limits
-- ============================================
ALTER FUNCTION get_user_plan_limits(UUID) SET search_path = public;

-- ============================================
-- FIX: check_usage_allowed
-- ============================================
ALTER FUNCTION check_usage_allowed(UUID, TEXT) SET search_path = public;

-- ============================================
-- FIX: get_due_schedules
-- ============================================
ALTER FUNCTION get_due_schedules() SET search_path = public;

-- ============================================
-- FIX: record_schedule_success
-- ============================================
ALTER FUNCTION record_schedule_success(UUID) SET search_path = public;

-- ============================================
-- FIX: record_schedule_error
-- ============================================
ALTER FUNCTION record_schedule_error(UUID, TEXT) SET search_path = public;

-- ============================================
-- FIX: get_portfolio_performance
-- ============================================
ALTER FUNCTION get_portfolio_performance(UUID, TEXT, INTEGER) SET search_path = public;

-- ============================================
-- FIX: get_latest_snapshots
-- ============================================
ALTER FUNCTION get_latest_snapshots(UUID) SET search_path = public;

-- ============================================
-- FIX: cleanup_old_snapshots
-- ============================================
ALTER FUNCTION cleanup_old_snapshots() SET search_path = public;

-- ============================================
-- FIX: get_active_session
-- ============================================
ALTER FUNCTION get_active_session(UUID) SET search_path = public;

-- ============================================
-- FIX: record_session_usage
-- ============================================
ALTER FUNCTION record_session_usage(UUID) SET search_path = public;

-- ============================================
-- FIX: cleanup_expired_sessions
-- ============================================
ALTER FUNCTION cleanup_expired_sessions() SET search_path = public;

-- ============================================
-- FIX: delete_user
-- ============================================
ALTER FUNCTION delete_user() SET search_path = public;
