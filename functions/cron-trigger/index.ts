// AutonomousVault Edge Function - Cron Trigger
// functions/cron-trigger/index.ts
//
// Cron-driven execution hook for scheduled dealer cycles
// CRITICAL: Only executes if user has explicitly enabled the schedule

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createSupabaseClient } from '../_shared/supabase.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { handleError } from '../_shared/errors.ts';

/**
 * Cron schedule from database
 */
interface CronSchedule {
    schedule_id: string;
    user_id: string;
    coins: string[];
    interval_seconds: number;
}

/**
 * Execution result
 */
interface ExecutionResult {
    scheduleId: string;
    userId: string;
    success: boolean;
    error?: string;
    executedAt: string;
}

/**
 * This function is designed to be called by:
 * 1. Supabase's built-in cron (pg_cron extension)
 * 2. External cron service (e.g., Upstash, GitHub Actions)
 * 3. Manual trigger for testing
 * 
 * It uses a shared secret for authentication (not user JWT)
 */
serve(async (req: Request) => {
    // Handle CORS
    const corsResponse = handleCors(req);
    if (corsResponse) return corsResponse;

    try {
        // Authenticate with cron secret (not user JWT)
        const cronSecret = req.headers.get('x-cron-secret');
        const expectedSecret = Deno.env.get('CRON_SECRET');

        if (!cronSecret || cronSecret !== expectedSecret) {
            return errorResponse('Unauthorized', 401);
        }

        // Use service role client (no user context)
        const supabase = createSupabaseClient();

        // Get all due schedules
        // CRITICAL: Only returns schedules where enabled = true
        const { data: dueSchedules, error: fetchError } = await supabase
            .rpc('get_due_schedules');

        if (fetchError) {
            console.error('[cron-trigger] Error fetching schedules:', fetchError);
            throw fetchError;
        }

        if (!dueSchedules || dueSchedules.length === 0) {
            return jsonResponse({
                success: true,
                message: 'No schedules due',
                executed: 0,
            });
        }

        console.log(`[cron-trigger] Found ${dueSchedules.length} due schedules`);

        // Execute each schedule
        const results: ExecutionResult[] = [];

        for (const schedule of dueSchedules as CronSchedule[]) {
            const result = await executeSchedule(supabase, schedule);
            results.push(result);
        }

        const successCount = results.filter(r => r.success).length;
        const failureCount = results.filter(r => !r.success).length;

        return jsonResponse({
            success: true,
            executed: results.length,
            successCount,
            failureCount,
            results,
        });

    } catch (error) {
        const { message, code, statusCode } = handleError(error);
        return errorResponse(`${code}: ${message}`, statusCode);
    }
});

// ============================================
// EXECUTION LOGIC
// ============================================

async function executeSchedule(
    supabase: any,
    schedule: CronSchedule
): Promise<ExecutionResult> {
    const { schedule_id, user_id, coins, interval_seconds } = schedule;

    console.log(`[cron-trigger] Executing schedule ${schedule_id} for user ${user_id}`);

    try {
        // Get user's encrypted key and settings
        const { data: userKey, error: keyError } = await supabase
            .from('encrypted_keys')
            .select('encrypted_blob, encryption_salt')
            .eq('user_id', user_id)
            .eq('key_name', 'hyperliquid')
            .single();

        if (keyError || !userKey) {
            throw new Error('No encrypted key found for user');
        }

        // Get user's dealer settings
        const { data: userSettings, error: settingsError } = await supabase
            .from('user_settings')
            .select('dealer_settings')
            .eq('user_id', user_id)
            .single();

        if (settingsError) {
            console.warn('[cron-trigger] No settings found, using defaults');
        }

        // Note: For server-side execution, we need execution password
        // This is a design decision:
        // Option 1: User provides password via secure session (complex)
        // Option 2: Analysis only, no execution without browser
        // Option 3: User pre-authorizes specific actions
        //
        // For now, we do ANALYSIS ONLY when triggered by cron
        // Execution requires user presence (browser-based)

        console.log(`[cron-trigger] Running analysis for coins: ${coins.join(', ')}`);

        // Call dealer-cycle internally (analysis only)
        // In production, this would call the dealer-cycle function
        const analysisResult = await runAnalysisOnly(user_id, coins, userSettings?.dealer_settings || {});

        // Record successful execution
        await supabase.rpc('record_schedule_success', { p_schedule_id: schedule_id });

        return {
            scheduleId: schedule_id,
            userId: user_id,
            success: true,
            executedAt: new Date().toISOString(),
        };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        // Record error
        await supabase.rpc('record_schedule_error', {
            p_schedule_id: schedule_id,
            p_error: errorMessage,
        });

        return {
            scheduleId: schedule_id,
            userId: user_id,
            success: false,
            error: errorMessage,
            executedAt: new Date().toISOString(),
        };
    }
}

async function runAnalysisOnly(
    userId: string,
    coins: string[],
    settings: Record<string, any>
): Promise<any> {
    // STUB: Would run dealer analysis without execution
    // Results could be:
    // 1. Stored in database for user to review
    // 2. Sent via notification (email, push)
    // 3. Used to prepare a pending order requiring user approval

    console.log(`[cron-trigger] Analysis for ${userId}: ${coins.length} coins`);

    return {
        analyzed: coins.length,
        decisions: coins.map(coin => ({
            coin,
            action: 'HOLD',
            reason: 'Analysis only mode',
        })),
    };
}
