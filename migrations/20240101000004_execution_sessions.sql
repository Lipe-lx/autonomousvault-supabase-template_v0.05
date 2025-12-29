-- AutonomousVault v0.05 - Execution Sessions
-- Migration: 20240101000004_execution_sessions.sql
--
-- Execution sessions for Tier B (Session Keys)
-- Allows 24/7 execution for a limited duration

-- ============================================
-- EXECUTION SESSIONS (Tier B)
-- ============================================

CREATE TABLE IF NOT EXISTS execution_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Encrypted session token containing password
  -- Decrypted only in-memory during Edge Function execution
  encrypted_session_token TEXT NOT NULL,
  
  -- Session validity
  created_at TIMESTAMPTZ DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL,
  revoked BOOLEAN DEFAULT false,
  
  -- Tracking
  last_used_at TIMESTAMPTZ,
  use_count INTEGER DEFAULT 0
);

-- RLS: Users can only access their own sessions
ALTER TABLE execution_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY execution_sessions_select ON execution_sessions 
  FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY execution_sessions_insert ON execution_sessions 
  FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY execution_sessions_update ON execution_sessions 
  FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY execution_sessions_delete ON execution_sessions 
  FOR DELETE USING (auth.uid() = user_id);

-- Index for finding active sessions
CREATE INDEX execution_sessions_user_active_idx 
  ON execution_sessions(user_id, expires_at) 
  WHERE revoked = false;

-- ============================================
-- ADD ENCRYPTED PASSWORD TO ENCRYPTED_KEYS (Tier C)
-- ============================================

ALTER TABLE encrypted_keys 
  ADD COLUMN IF NOT EXISTS encrypted_password TEXT;

COMMENT ON COLUMN encrypted_keys.encrypted_password IS 
'Tier C only: Password encrypted with server-managed key. NULL for Tier A/B.';

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Get active session for user
CREATE OR REPLACE FUNCTION get_active_session(p_user_id UUID)
RETURNS TABLE (
    session_id UUID,
    encrypted_session_token TEXT,
    expires_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        es.id,
        es.encrypted_session_token,
        es.expires_at
    FROM execution_sessions es
    WHERE es.user_id = p_user_id
      AND es.revoked = false
      AND es.expires_at > NOW()
    ORDER BY es.expires_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Record session usage
CREATE OR REPLACE FUNCTION record_session_usage(p_session_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE execution_sessions
    SET 
        last_used_at = NOW(),
        use_count = use_count + 1
    WHERE id = p_session_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Cleanup expired sessions (run periodically)
CREATE OR REPLACE FUNCTION cleanup_expired_sessions()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM execution_sessions
    WHERE expires_at < NOW() - INTERVAL '7 days'
       OR revoked = true;
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE execution_sessions IS 
'Tier B: Time-limited execution sessions. Password encrypted in session token, decrypted only during execution.';

COMMENT ON COLUMN execution_sessions.encrypted_session_token IS 
'Contains encrypted password + expiration. Only valid for session duration.';
