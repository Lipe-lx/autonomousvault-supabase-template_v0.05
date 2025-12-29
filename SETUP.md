# AutonomousVault Supabase Setup Guide

This guide walks you through setting up your own AutonomousVault backend on Supabase.

> [!IMPORTANT]
> **You own and control the entire backend.** The developer provides only software templates and documentation. All execution, authentication, scheduling, and data persistence occur in your Supabase project.

---

## Quick Setup (One-Click)

### Option A: Supabase Template Deploy

1. Click **"Create my AutonomousVault backend"** in the app
2. You'll be redirected to Supabase to create a new project
3. Supabase will automatically apply:
   - Database schema with RLS policies
   - Edge Functions
   - Auth configuration
4. Return to the app and enter your **Project URL** + **Anon Key**

---

## Manual Setup (CLI)

For advanced users or custom deployments.

### Prerequisites

- [Supabase CLI](https://supabase.com/docs/guides/cli) installed
- Node.js 18+
- A Supabase account

### Step 1: Create Supabase Project

```bash
# Login to Supabase
supabase login

# Initialize local project (or link existing)
supabase init
supabase link --project-ref YOUR_PROJECT_REF
```

### Step 2: Deploy Database Schema

```bash
# Push all migrations
supabase db push

# (Optional) Seed initial data
supabase db seed
```

### Step 3: Deploy Edge Functions

```bash
# Deploy all functions
supabase functions deploy dealer-cycle
supabase functions deploy sync-portfolio
supabase functions deploy usage-track
supabase functions deploy cron-trigger
```

### Step 4: Configure Auth (Optional)

1. Go to Supabase Dashboard → Authentication → Providers
2. Enable **Email/Password** (default)
3. (Optional) Enable **Google** and **GitHub** OAuth

### Step 5: Connect to App

1. Go to Supabase Dashboard → Settings → API
2. Copy **Project URL** and **anon public** key
3. Enter in AutonomousVault → Settings → Supabase Connection

---

## Security Notes

> [!CAUTION]
> **Non-Custodial Guarantees:**
> - Private keys are encrypted client-side before storage
> - Decryption happens only in-memory during execution
> - Server NEVER has access to decryption password
> - Cron NEVER executes trades unless explicitly enabled by you

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Connection failed | Verify Project URL includes `https://` |
| Auth not working | Check if Email provider is enabled |
| Edge Functions timeout | Increase function timeout in dashboard |
| RLS blocking queries | Ensure you're authenticated |

---

## Updating

When a new version of AutonomousVault is released:

```bash
# Pull latest migrations
supabase db push

# Redeploy functions
supabase functions deploy --all
```
