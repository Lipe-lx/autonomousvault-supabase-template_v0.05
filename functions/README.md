# Supabase Edge Functions

> [!IMPORTANT]
> These are **Deno** files, not Node.js. They will show errors in your IDE unless you have Deno configured.

## IDE Configuration

### VSCode

1. Install the [Deno extension](https://marketplace.visualstudio.com/items?itemName=denoland.vscode-deno)
2. Create `.vscode/settings.json` in this directory:
   ```json
   {
     "deno.enable": true,
     "deno.lint": true
   }
   ```

### Alternative: Ignore These Files

These files are deployed to Supabase's Edge runtime, not compiled by the client. You can safely ignore IDE errors here.

## Deployment

```bash
supabase functions deploy dealer-cycle
supabase functions deploy sync-portfolio
supabase functions deploy usage-track
supabase functions deploy cron-trigger
```

## Structure

```
functions/
├── _shared/           # Shared utilities
│   ├── supabase.ts    # Supabase client creation
│   ├── crypto.ts      # Encryption/decryption
│   ├── cors.ts        # CORS headers
│   └── errors.ts      # Error types
├── dealer-cycle/      # Main dealer analysis
├── sync-portfolio/    # Portfolio sync
├── usage-track/       # Usage tracking
└── cron-trigger/      # Scheduled execution
```
