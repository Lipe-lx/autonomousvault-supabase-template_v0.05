-- AutonomousVault v0.04 - Initial Schema
-- Migration: 20240101000000_initial_schema.sql
-- 
-- Core tables for user settings, encrypted keys, trade history, and usage tracking
-- All tables use RLS for user isolation
--
-- SECURITY: Keys are encrypted client-side, stored encrypted, decrypted only in-memory

-- ============================================
-- USER SETTINGS
-- ============================================

CREATE TABLE IF NOT EXISTS user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Dealer Settings (JSON for flexibility)
  dealer_settings JSONB DEFAULT '{}',
  
  -- Trading Pairs
  trading_pairs TEXT[] DEFAULT '{}',
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id)
);

-- RLS: Users can only access their own settings
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_settings_select ON user_settings FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY user_settings_insert ON user_settings FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY user_settings_update ON user_settings FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY user_settings_delete ON user_settings FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- ENCRYPTED KEYS (OPTIONAL - USER CHOICE)
-- ============================================
-- Keys are encrypted client-side, stored encrypted
-- Decrypted only in-memory during execution
-- Server NEVER has access to decryption password

CREATE TABLE IF NOT EXISTS encrypted_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Key identifier (e.g., 'hyperliquid', 'polymarket')
  key_name TEXT NOT NULL,
  
  -- AES-GCM encrypted private key (encrypted client-side)
  encrypted_blob TEXT NOT NULL,
  
  -- Encryption metadata
  encryption_salt TEXT NOT NULL,
  encryption_version INTEGER DEFAULT 1,
  last_rotated_at TIMESTAMPTZ,
  
  -- Wallet address (public, for reference)
  public_address TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, key_name)
);

-- RLS: Users can only access their own keys
ALTER TABLE encrypted_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY encrypted_keys_select ON encrypted_keys FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY encrypted_keys_insert ON encrypted_keys FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY encrypted_keys_update ON encrypted_keys FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY encrypted_keys_delete ON encrypted_keys FOR DELETE USING (auth.uid() = user_id);

-- ============================================
-- TRADE HISTORY (AUDIT LOG)
-- ============================================

CREATE TABLE IF NOT EXISTS trade_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Trade details
  exchange TEXT NOT NULL, -- 'hyperliquid', 'polymarket'
  coin TEXT NOT NULL,
  action TEXT NOT NULL, -- 'BUY', 'SELL', 'CLOSE'
  size_usdc DECIMAL(18, 8),
  price DECIMAL(18, 8),
  leverage INTEGER,
  
  -- Execution details
  order_id TEXT,
  cloid TEXT,
  status TEXT NOT NULL, -- 'pending', 'filled', 'failed'
  error TEXT,
  
  -- AI decision context
  confidence DECIMAL(3, 2),
  reason TEXT,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: Users can only access their own history
ALTER TABLE trade_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY trade_history_select ON trade_history FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY trade_history_insert ON trade_history FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Index for querying recent trades
CREATE INDEX trade_history_user_created_idx 
  ON trade_history(user_id, created_at DESC);

-- ============================================
-- USAGE TRACKING (FOR MONETIZATION)
-- ============================================
-- Enforcement is centralized in usage-track Edge Function, not SQL triggers

CREATE TABLE IF NOT EXISTS usage_tracking (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Usage period (monthly)
  period_start DATE NOT NULL,
  
  -- Counters (updated via Edge Function, not triggers)
  cycles_executed INTEGER DEFAULT 0,
  trades_executed INTEGER DEFAULT 0,
  ai_tokens_used BIGINT DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(user_id, period_start)
);

-- RLS: Users can only access their own usage
ALTER TABLE usage_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY usage_tracking_select ON usage_tracking FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY usage_tracking_insert ON usage_tracking FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY usage_tracking_update ON usage_tracking FOR UPDATE USING (auth.uid() = user_id);

-- ============================================
-- HELPER FUNCTIONS
-- ============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply to user_settings
CREATE TRIGGER update_user_settings_updated_at
    BEFORE UPDATE ON user_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Apply to usage_tracking
CREATE TRIGGER update_usage_tracking_updated_at
    BEFORE UPDATE ON usage_tracking
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
