-- AutonomousVault v0.05 - User Self-Deletion
-- Migration: 20240101000005_user_deletion.sql
--
-- Allows users to delete their own accounts
-- GDPR compliant: All user data is CASCADE deleted

-- ============================================
-- DELETE USER RPC FUNCTION
-- ============================================
-- This function allows authenticated users to delete their own account
-- All related data is automatically deleted via CASCADE

CREATE OR REPLACE FUNCTION delete_user()
RETURNS VOID AS $$
DECLARE
    v_user_id UUID;
BEGIN
    -- Get the current authenticated user's ID
    v_user_id := auth.uid();
    
    IF v_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;
    
    -- Log the deletion request (optional, for audit)
    RAISE NOTICE 'User deletion requested for: %', v_user_id;
    
    -- Delete from auth.users
    -- This will CASCADE delete all user data from:
    -- - user_settings
    -- - encrypted_keys
    -- - trade_history
    -- - usage_tracking
    -- - user_plans
    -- - cron_schedules
    -- - portfolio_snapshots
    -- - execution_sessions
    DELETE FROM auth.users WHERE id = v_user_id;
    
    RAISE NOTICE 'User deleted successfully: %', v_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION delete_user() TO authenticated;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON FUNCTION delete_user() IS 
'Allows authenticated users to permanently delete their own account. All user data is CASCADE deleted. GDPR compliant.';
