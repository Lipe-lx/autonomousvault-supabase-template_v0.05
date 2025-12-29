-- AutonomousVault v0.04 - Cron Schedules
-- Migration: 20240101000002_cron_schedules.sql
--
-- User-configurable scheduling for dealer cycles
-- CRITICAL: Cron NEVER executes trades unless explicitly enabled by the user

-- ============================================
-- CRON SCHEDULES
-- ============================================

CREATE TABLE IF NOT EXISTS cron_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Schedule configuration
  schedule_name TEXT NOT NULL DEFAULT 'default',
  
  -- CRITICAL: Cron NEVER executes unless enabled is TRUE
  enabled BOOLEAN NOT NULL DEFAULT false,
  
  -- Interval in seconds (minimum enforced by plan)
  interval_seconds INTEGER NOT NULL DEFAULT 300,
  
  -- Trading pairs for this schedule
  coins TEXT[] DEFAULT '{}',
  
  -- Execution tracking
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  run_count INTEGER DEFAULT 0,
  
  -- Error tracking
  last_error TEXT,
  consecutive_errors INTEGER DEFAULT 0,
  
  -- Auto-disable after too many errors
  max_consecutive_errors INTEGER DEFAULT 5,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, schedule_name)
);

-- RLS: Users can only access their own schedules
ALTER TABLE cron_schedules ENABLE ROW LEVEL SECURITY;

CREATE POLICY cron_schedules_select ON cron_schedules FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY cron_schedules_insert ON cron_schedules FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY cron_schedules_update ON cron_schedules FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY cron_schedules_delete ON cron_schedules FOR DELETE USING (auth.uid() = user_id);

-- Index for finding schedules due for execution
CREATE INDEX cron_schedules_next_run_idx 
  ON cron_schedules(next_run_at) 
  WHERE enabled = true;

-- ============================================
-- SCHEDULE HELPER FUNCTIONS
-- ============================================

-- Get schedules ready for execution
CREATE OR REPLACE FUNCTION get_due_schedules()
RETURNS TABLE (
    schedule_id UUID,
    user_id UUID,
    coins TEXT[],
    interval_seconds INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        cs.id,
        cs.user_id,
        cs.coins,
        cs.interval_seconds
    FROM cron_schedules cs
    WHERE cs.enabled = true
      AND cs.consecutive_errors < cs.max_consecutive_errors
      AND (cs.next_run_at IS NULL OR cs.next_run_at <= NOW());
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Record successful execution
CREATE OR REPLACE FUNCTION record_schedule_success(p_schedule_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE cron_schedules
    SET 
        last_run_at = NOW(),
        next_run_at = NOW() + (interval_seconds * INTERVAL '1 second'),
        run_count = run_count + 1,
        consecutive_errors = 0,
        last_error = NULL,
        updated_at = NOW()
    WHERE id = p_schedule_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Record execution error
CREATE OR REPLACE FUNCTION record_schedule_error(p_schedule_id UUID, p_error TEXT)
RETURNS VOID AS $$
DECLARE
    v_schedule RECORD;
BEGIN
    -- Get current schedule
    SELECT * INTO v_schedule FROM cron_schedules WHERE id = p_schedule_id;
    
    -- Update with error
    UPDATE cron_schedules
    SET 
        last_error = p_error,
        consecutive_errors = consecutive_errors + 1,
        -- Auto-disable if too many errors
        enabled = CASE 
            WHEN consecutive_errors + 1 >= max_consecutive_errors THEN false 
            ELSE enabled 
        END,
        next_run_at = NOW() + (interval_seconds * INTERVAL '1 second'),
        updated_at = NOW()
    WHERE id = p_schedule_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply updated_at trigger
CREATE TRIGGER update_cron_schedules_updated_at
    BEFORE UPDATE ON cron_schedules
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- COMMENTS
-- ============================================

COMMENT ON TABLE cron_schedules IS 
'User-controlled scheduling for dealer cycles. Cron NEVER executes trades unless explicitly enabled by the user.';

COMMENT ON COLUMN cron_schedules.enabled IS 
'CRITICAL: Execution only happens when this is TRUE. User must explicitly enable.';
