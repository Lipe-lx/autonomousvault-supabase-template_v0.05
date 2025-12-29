// AutonomousVault Edge Function - Dealer Cycle
// functions/dealer-cycle/index.ts
//
// Executes a single dealer analysis cycle
// SECURITY: Keys are decrypted in-memory only, cleared after use

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createSupabaseClientWithAuth, getUserIdFromAuth } from '../_shared/supabase.ts';
import { withDecryptedKey } from '../_shared/crypto.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import {
    AuthenticationError,
    ValidationError,
    UsageLimitError,
    handleError
} from '../_shared/errors.ts';

/**
 * Request body for dealer cycle
 */
interface DealerCycleRequest {
    coins: string[];
    settings: {
        intervalMs: number;
        maxPositions: number;
        maxLeverage: number;
        slPercent?: number;
        tpPercent?: number;
    };
    // Required for trade execution
    encryptedKey?: string;
    encryptionSalt?: string;
    executionPassword?: string;
    // If false, only analyze (no trades)
    executeTradesIfSignal?: boolean;
}

/**
 * Response from dealer cycle
 */
interface DealerCycleResponse {
    success: boolean;
    decisions: Array<{
        coin: string;
        action: 'BUY' | 'SELL' | 'CLOSE' | 'HOLD';
        confidence: number;
        reason: string;
        executed?: boolean;
        orderId?: string;
        error?: string;
    }>;
    usage: {
        cyclesUsed: number;
        cyclesRemaining: number;
    };
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
        const body: DealerCycleRequest = await req.json();

        // Validate
        if (!body.coins || body.coins.length === 0) {
            throw new ValidationError('coins array is required');
        }

        // Check usage limits
        const { data: usageCheck } = await supabase
            .rpc('check_usage_allowed', { p_user_id: userId, p_action: 'cycle' });

        if (usageCheck && !usageCheck[0]?.allowed) {
            throw new UsageLimitError(
                'Monthly cycles',
                usageCheck[0]?.used || 0,
                usageCheck[0]?.limit_value || 0
            );
        }

        // Execute analysis for each coin
        const decisions: DealerCycleResponse['decisions'] = [];

        for (const coin of body.coins) {
            try {
                // Fetch market data (stub - would call exchange API)
                const marketData = await fetchMarketData(coin);

                // Run AI analysis (stub - would call AI adapter)
                const analysis = await analyzeMarket(coin, marketData, body.settings);

                const decision: DealerCycleResponse['decisions'][number] = {
                    coin,
                    action: analysis.action,
                    confidence: analysis.confidence,
                    reason: analysis.reason,
                    executed: false,
                };

                // Execute trade if requested and action is not HOLD
                if (
                    body.executeTradesIfSignal &&
                    analysis.action !== 'HOLD' &&
                    body.encryptedKey &&
                    body.encryptionSalt &&
                    body.executionPassword
                ) {
                    try {
                        // Decrypt key and execute trade
                        const orderResult = await withDecryptedKey(
                            body.encryptedKey,
                            body.executionPassword,
                            body.encryptionSalt,
                            async (privateKey) => {
                                return await executeTrade(
                                    privateKey,
                                    coin,
                                    analysis.action as 'BUY' | 'SELL' | 'CLOSE',
                                    body.settings
                                );
                            }
                        );

                        decision.executed = true;
                        decision.orderId = orderResult.orderId;
                    } catch (execError) {
                        decision.error = execError instanceof Error
                            ? execError.message
                            : 'Trade execution failed';
                    }
                }

                decisions.push(decision);

            } catch (coinError) {
                decisions.push({
                    coin,
                    action: 'HOLD',
                    confidence: 0,
                    reason: coinError instanceof Error ? coinError.message : 'Analysis failed',
                });
            }
        }

        // Record usage
        await recordUsage(supabase, userId, 'cycle', 1);

        // Get updated usage
        const { data: updatedUsage } = await supabase
            .rpc('check_usage_allowed', { p_user_id: userId, p_action: 'cycle' });

        const response: DealerCycleResponse = {
            success: true,
            decisions,
            usage: {
                cyclesUsed: updatedUsage?.[0]?.used || 0,
                cyclesRemaining: updatedUsage?.[0]?.remaining || 0,
            },
            timestamp: new Date().toISOString(),
        };

        return jsonResponse(response);

    } catch (error) {
        const { message, code, statusCode } = handleError(error);
        return errorResponse(`${code}: ${message}`, statusCode);
    }
});

// ============================================
// STUB FUNCTIONS - To be implemented with real adapters
// ============================================

interface MarketData {
    price: number;
    volume24h: number;
    change24h: number;
    indicators: Record<string, number>;
}

async function fetchMarketData(coin: string): Promise<MarketData> {
    // STUB: Would call exchange API via adapter
    // In production, this imports from @/adapters/market-data
    console.log(`[dealer-cycle] Fetching market data for ${coin}`);

    return {
        price: 0,
        volume24h: 0,
        change24h: 0,
        indicators: {},
    };
}

interface AnalysisResult {
    action: 'BUY' | 'SELL' | 'CLOSE' | 'HOLD';
    confidence: number;
    reason: string;
}

async function analyzeMarket(
    coin: string,
    data: MarketData,
    settings: DealerCycleRequest['settings']
): Promise<AnalysisResult> {
    // STUB: Would call AI adapter
    // In production, this imports from @/adapters/ai
    console.log(`[dealer-cycle] Analyzing ${coin} with settings:`, settings);

    return {
        action: 'HOLD',
        confidence: 0,
        reason: 'Analysis not implemented',
    };
}

interface OrderResult {
    orderId: string;
    status: string;
}

async function executeTrade(
    privateKey: string,
    coin: string,
    action: 'BUY' | 'SELL' | 'CLOSE',
    settings: DealerCycleRequest['settings']
): Promise<OrderResult> {
    // STUB: Would call execution adapter
    // In production, this imports from @/adapters/execution
    // CRITICAL: privateKey is in memory only, must not be logged or persisted
    console.log(`[dealer-cycle] Executing ${action} for ${coin}`);

    return {
        orderId: `stub-${Date.now()}`,
        status: 'pending',
    };
}

async function recordUsage(
    supabase: any,
    userId: string,
    action: string,
    amount: number
): Promise<void> {
    const periodStart = new Date();
    periodStart.setDate(1);
    periodStart.setHours(0, 0, 0, 0);

    // Upsert usage tracking
    await supabase
        .from('usage_tracking')
        .upsert({
            user_id: userId,
            period_start: periodStart.toISOString().split('T')[0],
            cycles_executed: amount,
        }, {
            onConflict: 'user_id,period_start',
            count: 'planned',
        })
        .select();
}
