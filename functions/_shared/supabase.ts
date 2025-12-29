// AutonomousVault Edge Functions - Shared Supabase Client
// functions/_shared/supabase.ts

import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

/**
 * Create Supabase client for Edge Function
 * Uses service role key for admin operations
 */
export function createSupabaseClient(): SupabaseClient {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseServiceKey) {
        throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }

    return createClient(supabaseUrl, supabaseServiceKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
    });
}

/**
 * Create Supabase client with user's JWT for RLS
 */
export function createSupabaseClientWithAuth(authHeader: string): SupabaseClient {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');

    if (!supabaseUrl || !supabaseAnonKey) {
        throw new Error('Missing SUPABASE_URL or SUPABASE_ANON_KEY');
    }

    return createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
            autoRefreshToken: false,
            persistSession: false,
        },
        global: {
            headers: {
                Authorization: authHeader,
            },
        },
    });
}

/**
 * Get user ID from JWT
 */
export async function getUserIdFromAuth(supabase: SupabaseClient): Promise<string | null> {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user) return null;
    return user.id;
}
