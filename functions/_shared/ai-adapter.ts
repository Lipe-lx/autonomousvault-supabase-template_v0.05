// AI Adapter
// functions/_shared/ai-adapter.ts

export interface AIAnalysisResult {
    signal: 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'HOLD';
    confidence: number;
    reason: string;
}

export interface AIProviderConfig {
    provider: 'gemini' | 'openai' | 'claude';
    apiKey: string;
    modelId: string;
    systemPrompt?: string;
}

export async function analyzeMarket(
    marketContext: any,
    config: AIProviderConfig
): Promise<AIAnalysisResult> {
    if (!config.apiKey) {
        return { signal: 'NEUTRAL', confidence: 0, reason: 'Missing API Key' };
    }

    const systemPrompt = config.systemPrompt || "You are an expert crypto trader. Analyze data and provide signal.";

    // Format context for LLM
    const userPrompt = JSON.stringify(marketContext, null, 2);

    try {
        if (config.provider === 'gemini') {
            return await callGemini(config.apiKey, config.modelId, systemPrompt, userPrompt);
        } else if (config.provider === 'openai') {
            return await callOpenAI(config.apiKey, config.modelId, systemPrompt, userPrompt);
        } else {
            return { signal: 'NEUTRAL', confidence: 0, reason: 'Unsupported Provider' };
        }
    } catch (e) {
        console.error('[AIAdapter] Analysis error:', e);
        return { signal: 'NEUTRAL', confidence: 0, reason: `AI Error: ${e instanceof Error ? e.message : 'Unknown'}` };
    }
}

async function callGemini(apiKey: string, model: string, system: string, user: string): Promise<AIAnalysisResult> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            contents: [{
                role: 'user',
                parts: [{ text: `${system}\n\nMarket Context:\n${user}\n\nProvide output as JSON: { "signal": "BUY/SELL/HOLD", "confidence": 0.0-1.0, "reason": "..." }` }]
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

    try {
        const parsed = JSON.parse(text);
        return {
            signal: mapSignal(parsed.signal),
            confidence: parseFloat(parsed.confidence) || 0,
            reason: parsed.reason || 'No reason provided'
        };
    } catch (e) {
        throw new Error(`Failed to parse AI JSON: ${text}`);
    }
}

async function callOpenAI(apiKey: string, model: string, system: string, user: string): Promise<AIAnalysisResult> {
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
                { role: 'user', content: `${user}\n\nProvide output as JSON: { "signal": "BUY/SELL/HOLD", "confidence": 0.0-1.0, "reason": "..." }` }
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

    try {
        const parsed = JSON.parse(text);
        return {
            signal: mapSignal(parsed.signal),
            confidence: parseFloat(parsed.confidence) || 0,
            reason: parsed.reason || 'No reason provided'
        };
    } catch (e) {
        throw new Error(`Failed to parse AI JSON: ${text}`);
    }
}

function mapSignal(raw: string): 'BULLISH' | 'BEARISH' | 'NEUTRAL' | 'HOLD' {
    const s = raw?.toUpperCase();
    if (s === 'BUY' || s === 'BULLISH') return 'BULLISH';
    if (s === 'SELL' || s === 'BEARISH') return 'BEARISH';
    if (s === 'HOLD') return 'HOLD';
    return 'NEUTRAL';
}
