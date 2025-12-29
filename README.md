# AutonomousVault Supabase Template

Pre-configured Supabase backend for AutonomousVault autonomous trading system.

> [!IMPORTANT]
> **You own and control this entire backend.** Deploy to your own Supabase account - no developer access to your data.

## What's Included

| Component | Description |
|-----------|-------------|
| **Database Schema** | RLS-protected tables for settings, trades, usage |
| **Edge Functions** | dealer-cycle, sync-portfolio, usage-track, cron-trigger |
| **Auth Config** | Email/password + OAuth ready |
| **Monetization** | Plan tiers and usage tracking |

## Quick Deploy

### Option A: Supabase CLI

```bash
# 1. Install Supabase CLI
npm install -g supabase

# 2. Login & link project
supabase login
supabase link --project-ref YOUR_PROJECT_REF

# 3. Deploy database
supabase db push

# 4. Deploy Edge Functions
supabase functions deploy dealer-cycle
supabase functions deploy sync-portfolio
supabase functions deploy usage-track
supabase functions deploy cron-trigger

# 5. (Optional) Seed data
supabase db seed
```

### Option B: Dashboard Import

1. Go to Supabase Dashboard → SQL Editor
2. Run each migration file in order
3. Deploy functions via CLI

## Security

> [!CAUTION]
> - Private keys are **encrypted client-side** before storage
> - Decryption happens **in-memory only** during execution
> - Server **NEVER** has access to decryption password
> - Cron **NEVER** executes trades unless explicitly enabled

## Structure

```
├── migrations/          # Database schema & RLS
├── functions/           # Deno Edge Functions
├── seed.sql            # Default plan configs
└── config.toml         # Project settings
```

## Connect to App

After deployment, go to:
- Dashboard → Settings → API
- Copy **Project URL** and **anon public** key
- Enter in AutonomousVault app → Settings → Connect Backend

---

*AutonomousVault Template v0.04*
