// AutonomousVault Edge Function - Usage Track
// functions/usage-track/index.ts
//
// Centralized usage tracking and plan enforcement
// NO SQL triggers - all enforcement happens here for transparency

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createSupabaseClientWithAuth, createSupabaseClient, getUserIdFromAuth } from '../_shared/supabase.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { AuthenticationError, ValidationError, UsageLimitError, handleError } from '../_shared/errors.ts';

/**
 * Request body
 */
interface UsageTrackRequest {
    action: 'cycle' | 'trade' | 'tokens';
    amount: number;
    metadata?: {
        coin?: string;
        orderId?: string;
        modelId?: string;
    };
}

/**
 * Usage status response
 */
interface UsageStatus {
    plan: {
        tier: string;
        isActive: boolean;
    };
    usage: {
        cycles: { used: number; limit: number; remaining: number };
        trades: { used: number; limit: number; remaining: number };
        tokens: { used: number; limit: number; remaining: number };
    };
    periodStart: string;
    periodEnd: string;
}

serve(async (req: Request) => {
    // Handle CORS
    const corsResponse = handleCors(req);
    if (corsResponse) return corsResponse;

    try {
        // Authenticate
        const authHeader = req.headers.get('Authorization');
        if (!authHeader) {
            throw new AuthenticationError();
        }

        const supabase = createSupabaseClientWithAuth(authHeader);
        const userId = await getUserIdFromAuth(supabase);
        if (!userId) {
            throw new AuthenticationError('Invalid token');
        }

        // GET = status, POST = record usage
        if (req.method === 'GET') {
            const status = await getUsageStatus(supabase, userId);
            return jsonResponse(status);
        }

        // Parse request (POST)
        const body: UsageTrackRequest = await req.json();

        // Validate
        if (!body.action) {
            throw new ValidationError('action is required');
        }
        if (typeof body.amount !== 'number' || body.amount < 0) {
            throw new ValidationError('amount must be a positive number');
        }

        // Check if action is allowed
        const checkResult = await checkUsageAllowed(supabase, userId, body.action, body.amount);

        if (!checkResult.allowed) {
            throw new UsageLimitError(
                body.action,
                checkResult.used,
                checkResult.limit
            );
        }

        // Record usage
        await recordUsage(supabase, userId, body.action, body.amount);

        // Return updated status
        const status = await getUsageStatus(supabase, userId);

        return jsonResponse({
            success: true,
            recorded: {
                action: body.action,
                amount: body.amount,
            },
            status,
        });

    } catch (error) {
        const { message, code, statusCode } = handleError(error);
        return errorResponse(`${code}: ${message}`, statusCode);
    }
});

// ============================================
// HELPER FUNCTIONS
// ============================================

async function getUsageStatus(supabase: any, userId: string): Promise<UsageStatus> {
    const periodStart = getMonthStart();

    // Get plan
    const { data: plan } = await supabase
        .from('user_plans')
        .select('*')
        .eq('user_id', userId)
        .single();

    // Get usage
    const { data: usage } = await supabase
        .from('usage_tracking')
        .select('*')
        .eq('user_id', userId)
        .eq('period_start', periodStart)
        .single();

    const cycles = usage?.cycles_executed || 0;
    const trades = usage?.trades_executed || 0;
    const tokens = usage?.ai_tokens_used || 0;

    return {
        plan: {
            tier: plan?.tier || 'free',
            isActive: plan?.is_active ?? true,
        },
        usage: {
            cycles: {
                used: cycles,
                limit: plan?.max_cycles_per_month || 100,
                remaining: Math.max(0, (plan?.max_cycles_per_month || 100) - cycles),
            },
            trades: {
                used: trades,
                limit: plan?.max_trades_per_month || 20,
                remaining: Math.max(0, (plan?.max_trades_per_month || 20) - trades),
            },
            tokens: {
                used: tokens,
                limit: plan?.max_ai_tokens_per_month || 100000,
                remaining: Math.max(0, (plan?.max_ai_tokens_per_month || 100000) - tokens),
            },
        },
        periodStart,
        periodEnd: getMonthEnd(),
    };
}

async function checkUsageAllowed(
    supabase: any,
    userId: string,
    action: string,
    amount: number
): Promise<{ allowed: boolean; used: number; limit: number }> {
    const status = await getUsageStatus(supabase, userId);

    let used: number, limit: number;

    switch (action) {
        case 'cycle':
            used = status.usage.cycles.used;
            limit = status.usage.cycles.limit;
            break;
        case 'trade':
            used = status.usage.trades.used;
            limit = status.usage.trades.limit;
            break;
        case 'tokens':
            used = status.usage.tokens.used;
            limit = status.usage.tokens.limit;
            break;
        default:
            return { allowed: true, used: 0, limit: Infinity };
    }

    return {
        allowed: used + amount <= limit,
        used,
        limit,
    };
}

async function recordUsage(
    supabase: any,
    userId: string,
    action: string,
    amount: number
): Promise<void> {
    const periodStart = getMonthStart();

    // Get current usage
    const { data: existing } = await supabase
        .from('usage_tracking')
        .select('*')
        .eq('user_id', userId)
        .eq('period_start', periodStart)
        .single();

    if (existing) {
        // Update existing record
        const updates: Record<string, number> = {};

        if (action === 'cycle') {
            updates.cycles_executed = existing.cycles_executed + amount;
        } else if (action === 'trade') {
            updates.trades_executed = existing.trades_executed + amount;
        } else if (action === 'tokens') {
            updates.ai_tokens_used = existing.ai_tokens_used + amount;
        }

        await supabase
            .from('usage_tracking')
            .update(updates)
            .eq('id', existing.id);
    } else {
        // Insert new record
        const insertData: Record<string, any> = {
            user_id: userId,
            period_start: periodStart,
            cycles_executed: action === 'cycle' ? amount : 0,
            trades_executed: action === 'trade' ? amount : 0,
            ai_tokens_used: action === 'tokens' ? amount : 0,
        };

        await supabase
            .from('usage_tracking')
            .insert(insertData);
    }
}

function getMonthStart(): string {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
}

function getMonthEnd(): string {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];
}
