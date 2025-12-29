-- AutonomousVault v0.04 - Portfolio Snapshots
-- Migration: 20240101000003_portfolio_snapshots.sql
--
-- Historical portfolio tracking for analytics and reporting

-- ============================================
-- PORTFOLIO SNAPSHOTS
-- ============================================

CREATE TABLE IF NOT EXISTS portfolio_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  
  -- Exchange identifier
  exchange TEXT NOT NULL, -- 'hyperliquid', 'polymarket'
  
  -- Balance at snapshot time
  total_equity_usdc DECIMAL(18, 8) NOT NULL,
  available_balance_usdc DECIMAL(18, 8),
  margin_used_usdc DECIMAL(18, 8),
  
  -- PnL metrics
  unrealized_pnl DECIMAL(18, 8),
  realized_pnl_24h DECIMAL(18, 8),
  
  -- Positions summary (JSON for flexibility)
  positions JSONB DEFAULT '[]',
  -- Format: [{ coin, side, size, entryPrice, unrealizedPnl, leverage }]
  
  -- Open orders summary
  open_orders_count INTEGER DEFAULT 0,
  
  -- Timestamps
  snapshot_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS: Users can only access their own snapshots
ALTER TABLE portfolio_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY portfolio_snapshots_select ON portfolio_snapshots FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY portfolio_snapshots_insert ON portfolio_snapshots FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Index for time-series queries
CREATE INDEX portfolio_snapshots_user_time_idx 
  ON portfolio_snapshots(user_id, snapshot_at DESC);

-- Index for exchange-specific queries
CREATE INDEX portfolio_snapshots_exchange_idx 
  ON portfolio_snapshots(user_id, exchange, snapshot_at DESC);

-- ============================================
-- ANALYTICS FUNCTIONS
-- ============================================

-- Get portfolio performance over time
CREATE OR REPLACE FUNCTION get_portfolio_performance(
    p_user_id UUID,
    p_exchange TEXT,
    p_days INTEGER DEFAULT 30
)
RETURNS TABLE (
    snapshot_date DATE,
    equity DECIMAL,
    pnl DECIMAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        DATE(ps.snapshot_at) as snapshot_date,
        MAX(ps.total_equity_usdc) as equity,
        MAX(ps.unrealized_pnl) as pnl
    FROM portfolio_snapshots ps
    WHERE ps.user_id = p_user_id
      AND ps.exchange = p_exchange
      AND ps.snapshot_at >= NOW() - (p_days * INTERVAL '1 day')
    GROUP BY DATE(ps.snapshot_at)
    ORDER BY snapshot_date;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Get latest snapshot for each exchange
CREATE OR REPLACE FUNCTION get_latest_snapshots(p_user_id UUID)
RETURNS TABLE (
    exchange TEXT,
    equity DECIMAL,
    pnl DECIMAL,
    positions JSONB,
    snapshot_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT DISTINCT ON (ps.exchange)
        ps.exchange,
        ps.total_equity_usdc,
        ps.unrealized_pnl,
        ps.positions,
        ps.snapshot_at
    FROM portfolio_snapshots ps
    WHERE ps.user_id = p_user_id
    ORDER BY ps.exchange, ps.snapshot_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================
-- CLEANUP POLICY
-- ============================================
-- Keep only last 90 days of snapshots (can be adjusted)
-- Note: Run this via cron or scheduled function

CREATE OR REPLACE FUNCTION cleanup_old_snapshots()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM portfolio_snapshots
    WHERE snapshot_at < NOW() - INTERVAL '90 days';
    
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
