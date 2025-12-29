// AutonomousVault Edge Function - Sync Portfolio
// functions/sync-portfolio/index.ts
//
// Syncs portfolio state from exchange APIs
// READ-ONLY: No signing required, no private keys used

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createSupabaseClientWithAuth, getUserIdFromAuth } from '../_shared/supabase.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { AuthenticationError, ValidationError, handleError } from '../_shared/errors.ts';

/**
 * Request body
 */
interface SyncPortfolioRequest {
    exchange: 'hyperliquid' | 'polymarket';
    walletAddress: string;
}

/**
 * Portfolio position
 */
interface Position {
    coin: string;
    side: 'LONG' | 'SHORT';
    size: number;
    entryPrice: number;
    markPrice: number;
    unrealizedPnl: number;
    leverage: number;
}

/**
 * Portfolio snapshot
 */
interface PortfolioSnapshot {
    exchange: string;
    totalEquity: number;
    availableBalance: number;
    marginUsed: number;
    unrealizedPnl: number;
    positions: Position[];
    openOrdersCount: number;
    timestamp: string;
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

        // Parse request
        const body: SyncPortfolioRequest = await req.json();

        // Validate
        if (!body.exchange) {
            throw new ValidationError('exchange is required');
        }
        if (!body.walletAddress) {
            throw new ValidationError('walletAddress is required');
        }

        // Fetch portfolio from exchange (READ-ONLY API)
        const portfolio = await fetchPortfolio(body.exchange, body.walletAddress);

        // Store snapshot in database
        const { error: insertError } = await supabase
            .from('portfolio_snapshots')
            .insert({
                user_id: userId,
                exchange: body.exchange,
                total_equity_usdc: portfolio.totalEquity,
                available_balance_usdc: portfolio.availableBalance,
                margin_used_usdc: portfolio.marginUsed,
                unrealized_pnl: portfolio.unrealizedPnl,
                positions: portfolio.positions,
                open_orders_count: portfolio.openOrdersCount,
                snapshot_at: new Date().toISOString(),
            });

        if (insertError) {
            console.error('[sync-portfolio] Insert error:', insertError);
            // Continue - snapshot storage failure shouldn't block response
        }

        return jsonResponse({
            success: true,
            portfolio,
        });

    } catch (error) {
        const { message, code, statusCode } = handleError(error);
        return errorResponse(`${code}: ${message}`, statusCode);
    }
});

// ============================================
// STUB FUNCTIONS - To be implemented with real adapters
// ============================================

async function fetchPortfolio(
    exchange: string,
    walletAddress: string
): Promise<PortfolioSnapshot> {
    // STUB: Would call exchange API
    // Hyperliquid: GET https://api.hyperliquid.xyz/info
    // This is a PUBLIC, READ-ONLY endpoint - no signing required

    console.log(`[sync-portfolio] Fetching portfolio for ${walletAddress} on ${exchange}`);

    // Return stub data
    return {
        exchange,
        totalEquity: 0,
        availableBalance: 0,
        marginUsed: 0,
        unrealizedPnl: 0,
        positions: [],
        openOrdersCount: 0,
        timestamp: new Date().toISOString(),
    };
}
