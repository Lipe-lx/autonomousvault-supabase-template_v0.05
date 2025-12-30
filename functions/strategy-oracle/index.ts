// AutonomousVault Edge Function - Strategy Oracle
// functions/strategy-oracle/index.ts
//
// STATELESS Strategy Analysis Endpoint
// - Receives market context + user's AI API key
// - Injects proprietary system prompt (the "Secret Sauce")
// - Calls AI provider using USER's API key (BYOK)
// - Returns decision without storing ANY data
//
// SECURITY: No logging of API keys. No persistence. Purely functional.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { handleCors, jsonResponse, errorResponse } from '../_shared/cors.ts';
import { ValidationError, handleError } from '../_shared/errors.ts';

// ============================================
// PROPRIETARY SYSTEM PROMPTS (THE SECRET SAUCE)
// ============================================
// These prompts are the intellectual property that we protect.
// Users never see these directly - they only receive the analysis results.

const DEALER_SYSTEM_PROMPT = `You are Hyperliquid Dealer, an autonomous crypto trading engine.
Your goal is to analyze specific assets and output a TRADING DECISION for EACH one.

RULES:
1. Analyze each coin's data INDEPENDENTLY. Do not compare coins to each other.
2. For EACH coin, output a JSON object with: { "asset", "action", "confidence", "reason", "suggestedLeverage", "stopLoss", "takeProfit" }.
3. Actions: "BUY" (open long), "SELL" (open short), "CLOSE" (close existing position), "HOLD" (do nothing).
4. Confidence: 0.0 to 1.0. Only act if >= 0.60.
5. Consider: trend alignment, momentum, volume confirmation, support/resistance levels.
6. Risk Management: Always suggest stopLoss and takeProfit percentages from entry.
7. If data is insufficient or signals conflict, output "HOLD" with low confidence.

PORTFOLIO LIMITS (RESPECT THESE):
- Never suggest opening more positions than maxOpenPositions.
- Never suggest leverage higher than maxLeverage.
- Consider current exposure when sizing positions.

OUTPUT FORMAT:
Return a JSON array with one decision object per coin analyzed.
[
  {
    "asset": "BTC",
    "action": "BUY",
    "confidence": 0.85,
    "reason": "Strong uptrend with RSI pullback to 35, MACD crossing bullish",
    "suggestedLeverage": 3,
    "stopLoss": 2.5,
    "takeProfit": 5.0
  },
  ...
]`;

// ============================================
// REQUEST / RESPONSE TYPES
// ============================================

interface StrategyOracleRequest {
    marketContext: any;           // Full market data for all coins
    aiConfig: {
        provider: 'gemini' | 'openai';
        apiKey: string;           // User's API Key (BYOK)
        modelId: string;
    };
    portfolioContext?: {
        maxOpenPositions: number;
        maxLeverage: number;
        currentPositions: any[];
    };
}

interface StrategyOracleResponse {
    success: boolean;
    decisions: Array<{
        asset: string;
        action: 'BUY' | 'SELL' | 'CLOSE' | 'HOLD';
        confidence: number;
        reason: string;
        suggestedLeverage?: number;
        stopLoss?: number;
        takeProfit?: number;
    }>;
    timestamp: string;
    // Note: No user ID, no tracking, no persistence
}

// ============================================
// MAIN HANDLER
// ============================================

serve(async (req: Request) => {
    // Handle CORS
    const corsResponse = handleCors(req);
    if (corsResponse) return corsResponse;

    try {
        // Parse request - NO AUTHENTICATION REQUIRED
        // This endpoint is stateless and uses the caller's resources
        const body: StrategyOracleRequest = await req.json();

        // Validate required fields
        if (!body.marketContext) {
            throw new ValidationError('marketContext is required');
        }
        if (!body.aiConfig?.apiKey) {
            throw new ValidationError('aiConfig.apiKey is required');
        }
        if (!body.aiConfig?.provider) {
            throw new ValidationError('aiConfig.provider is required');
        }

        // Build the full prompt with portfolio context
        let contextualPrompt = DEALER_SYSTEM_PROMPT;
        if (body.portfolioContext) {
            contextualPrompt += `\n\nPORTFOLIO STATE:
- Max Open Positions: ${body.portfolioContext.maxOpenPositions}
- Max Leverage: ${body.portfolioContext.maxLeverage}
- Current Positions: ${JSON.stringify(body.portfolioContext.currentPositions || [])}`;
        }

        // Call AI using user's API key
        const decisions = await callAI(
            body.aiConfig.provider,
            body.aiConfig.apiKey,
            body.aiConfig.modelId,
            contextualPrompt,
            JSON.stringify(body.marketContext)
        );

        const response: StrategyOracleResponse = {
            success: true,
            decisions,
            timestamp: new Date().toISOString(),
        };

        return jsonResponse(response);

    } catch (error) {
        const { message, code, statusCode } = handleError(error);
        return errorResponse(`${code}: ${message}`, statusCode);
    }
});

// ============================================
// AI PROVIDER CALLS
// ============================================

async function callAI(
    provider: 'gemini' | 'openai',
    apiKey: string,
    model: string,
    systemPrompt: string,
    userPrompt: string
): Promise<StrategyOracleResponse['decisions']> {
    if (provider === 'gemini') {
        return await callGemini(apiKey, model, systemPrompt, userPrompt);
    } else if (provider === 'openai') {
        return await callOpenAI(apiKey, model, systemPrompt, userPrompt);
    } else {
        throw new ValidationError('Unsupported AI provider');
    }
}

async function callGemini(
    apiKey: string,
    model: string,
    system: string,
    user: string
): Promise<StrategyOracleResponse['decisions']> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            contents: [{
                role: 'user',
                parts: [{ text: `${system}\n\nMarket Context:\n${user}` }]
            }],
            generationConfig: {
                temperature: 0.1,
                responseMimeType: "application/json"
            }
        })
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`Gemini API Error: ${err}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;

    if (!text) throw new Error('Empty response from Gemini');

    return parseAIResponse(text);
}

async function callOpenAI(
    apiKey: string,
    model: string,
    system: string,
    user: string
): Promise<StrategyOracleResponse['decisions']> {
    const url = 'https://api.openai.com/v1/chat/completions';

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: model,
            messages: [
                { role: 'system', content: system },
                { role: 'user', content: user }
            ],
            temperature: 0.1,
            response_format: { type: "json_object" }
        })
    });

    if (!response.ok) {
        const err = await response.text();
        throw new Error(`OpenAI API Error: ${err}`);
    }

    const data = await response.json();
    const text = data.choices?.[0]?.message?.content;

    if (!text) throw new Error('Empty response from OpenAI');

    return parseAIResponse(text);
}

function parseAIResponse(text: string): StrategyOracleResponse['decisions'] {
    try {
        const parsed = JSON.parse(text);
        
        // Handle both array and object with decisions key
        const decisions = Array.isArray(parsed) ? parsed : parsed.decisions || [];
        
        return decisions.map((d: any) => ({
            asset: d.asset || d.coin,
            action: normalizeAction(d.action),
            confidence: parseFloat(d.confidence) || 0,
            reason: d.reason || 'No reason provided',
            suggestedLeverage: d.suggestedLeverage,
            stopLoss: d.stopLoss,
            takeProfit: d.takeProfit,
        }));
    } catch (e) {
        throw new Error(`Failed to parse AI response: ${text.substring(0, 200)}`);
    }
}

function normalizeAction(action: string): 'BUY' | 'SELL' | 'CLOSE' | 'HOLD' {
    const a = action?.toUpperCase();
    if (a === 'BUY' || a === 'LONG' || a === 'BULLISH') return 'BUY';
    if (a === 'SELL' || a === 'SHORT' || a === 'BEARISH') return 'SELL';
    if (a === 'CLOSE' || a === 'EXIT') return 'CLOSE';
    return 'HOLD';
}
