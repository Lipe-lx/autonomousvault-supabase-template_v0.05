-- AutonomousVault v0.04 - Seed Data
-- seed.sql
--
-- Default plan configurations and initial system data

-- ============================================
-- PLAN TIER DEFAULTS (Reference Only)
-- ============================================
-- These values are set in the user_plans table when a user is created.
-- Modifying this seed does NOT retroactively change existing users.

-- Plan Tier Reference:
-- 
-- | Tier      | Cycles/mo | Trades/mo | AI Tokens/mo | Strategies | Pairs | Min Interval |
-- |-----------|-----------|-----------|--------------|------------|-------|--------------|
-- | free      | 100       | 20        | 100,000      | 1          | 3     | 300s (5min)  |
-- | starter   | 1,000     | 100       | 500,000      | 3          | 10    | 60s (1min)   |
-- | pro       | 10,000    | 500       | 2,000,000    | 10         | 50    | 30s          |
-- | unlimited | ∞         | ∞         | ∞            | ∞          | ∞     | 10s          |

-- ============================================
-- SYSTEM CONFIGURATION (if needed)
-- ============================================
-- Currently no system tables required.
-- The template is fully self-contained with user-scoped data only.

-- ============================================
-- NOTES
-- ============================================
-- 
-- 1. User plans are created automatically via trigger when user signs up
-- 2. Default tier is 'free' with starter limits
-- 3. Plan upgrades are handled via Stripe webhook -> Edge Function
-- 4. No admin tables exist - this is a user-owned system
--
-- To test locally, you can insert a test user plan:
--
-- INSERT INTO user_plans (user_id, tier, max_cycles_per_month, max_trades_per_month)
-- VALUES ('your-user-uuid', 'pro', 10000, 500);
