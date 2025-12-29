-- AutonomousVault v0.04 - User Plans
-- Migration: 20240101000001_user_plans.sql
--
-- Plan tier management and RLS enforcement functions

-- ============================================
-- USER PLANS
-- ============================================

CREATE TABLE IF NOT EXISTS user_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Plan tier: 'free', 'starter', 'pro', 'unlimited'
  tier TEXT NOT NULL DEFAULT 'free',
  
  -- Plan limits (denormalized for quick checks)
  max_cycles_per_month INTEGER DEFAULT 100,
  max_trades_per_month INTEGER DEFAULT 20,
  max_ai_tokens_per_month BIGINT DEFAULT 100000,
  max_strategies INTEGER DEFAULT 1,
  max_trading_pairs INTEGER DEFAULT 3,
  check_interval_min_seconds INTEGER DEFAULT 300, -- 5 min for free
  
  -- Subscription metadata
  stripe_subscription_id TEXT,
  stripe_customer_id TEXT,
  
  -- Period
  current_period_start TIMESTAMPTZ DEFAULT NOW(),
  current_period_end TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '1 month'),
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id)
);

-- RLS: Users can only access their own plan
ALTER TABLE user_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_plans_select ON user_plans FOR SELECT USING (auth.uid() = user_id);

-- Only allow update via service role (plan changes go through backend)
CREATE POLICY user_plans_update ON user_plans FOR UPDATE USING (false);

-- ============================================
-- DEFAULT PLAN INSERTION
-- ============================================
-- Auto-create free plan when user signs up

CREATE OR REPLACE FUNCTION create_default_plan()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.user_plans (user_id, tier)
    VALUES (NEW.id, 'free')
    ON CONFLICT (user_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger on auth.users creation
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW
    EXECUTE FUNCTION create_default_plan();

-- ============================================
-- PLAN LIMITS LOOKUP FUNCTION
-- ============================================
-- Used by Edge Functions to check limits

CREATE OR REPLACE FUNCTION get_user_plan_limits(p_user_id UUID)
RETURNS TABLE (
    tier TEXT,
    max_cycles INTEGER,
    max_trades INTEGER,
    max_tokens BIGINT,
    min_interval INTEGER,
    is_active BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        up.tier,
        up.max_cycles_per_month,
        up.max_trades_per_month,
        up.max_ai_tokens_per_month,
        up.check_interval_min_seconds,
        up.is_active
    FROM user_plans up
    WHERE up.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- USAGE CHECK FUNCTION
-- ============================================
-- Returns whether action is allowed under current plan

CREATE OR REPLACE FUNCTION check_usage_allowed(
    p_user_id UUID,
    p_action TEXT -- 'cycle', 'trade', 'tokens'
)
RETURNS TABLE (
    allowed BOOLEAN,
    remaining INTEGER,
    limit_value INTEGER,
    used INTEGER
) AS $$
DECLARE
    v_plan RECORD;
    v_usage RECORD;
    v_period_start DATE;
BEGIN
    -- Get current period start (first day of month)
    v_period_start := DATE_TRUNC('month', NOW())::DATE;
    
    -- Get plan limits
    SELECT * INTO v_plan FROM user_plans WHERE user_id = p_user_id;
    
    -- Get current usage
    SELECT * INTO v_usage 
    FROM usage_tracking 
    WHERE user_id = p_user_id AND period_start = v_period_start;
    
    -- Check based on action type
    IF p_action = 'cycle' THEN
        RETURN QUERY SELECT 
            COALESCE(v_usage.cycles_executed, 0) < v_plan.max_cycles_per_month,
            v_plan.max_cycles_per_month - COALESCE(v_usage.cycles_executed, 0),
            v_plan.max_cycles_per_month,
            COALESCE(v_usage.cycles_executed, 0);
    ELSIF p_action = 'trade' THEN
        RETURN QUERY SELECT 
            COALESCE(v_usage.trades_executed, 0) < v_plan.max_trades_per_month,
            v_plan.max_trades_per_month - COALESCE(v_usage.trades_executed, 0),
            v_plan.max_trades_per_month,
            COALESCE(v_usage.trades_executed, 0);
    ELSE
        -- tokens
        RETURN QUERY SELECT 
            COALESCE(v_usage.ai_tokens_used, 0) < v_plan.max_ai_tokens_per_month,
            (v_plan.max_ai_tokens_per_month - COALESCE(v_usage.ai_tokens_used, 0))::INTEGER,
            v_plan.max_ai_tokens_per_month::INTEGER,
            COALESCE(v_usage.ai_tokens_used, 0)::INTEGER;
    END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Apply updated_at trigger
CREATE TRIGGER update_user_plans_updated_at
    BEFORE UPDATE ON user_plans
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
