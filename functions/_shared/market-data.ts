// Market Data Adapter
// functions/_shared/market-data.ts

export interface Candle {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
}

export interface MarketContext {
    coin: string;
    currentPrice: number;
    candles: Candle[]; // Analysis candles (e.g., 1h)
    macroCandles?: Candle[]; // Macro candles (e.g., 4h)
    orderBookMetrics?: any; // Spread, liquidity, etc.
}

const HL_API_URL = 'https://api.hyperliquid-testnet.xyz/info'; // Testnet

async function fetchCandles(coin: string, interval: string, limit: number = 50): Promise<Candle[]> {
    try {
        // Calculate startTime
        const intervalMsMap: Record<string, number> = {
            '1m': 60 * 1000,
            '5m': 5 * 60 * 1000,
            '15m': 15 * 60 * 1000,
            '1h': 60 * 60 * 1000,
            '4h': 4 * 60 * 60 * 1000,
            '1d': 24 * 60 * 60 * 1000,
        };
        const intervalMs = intervalMsMap[interval] || 3600000;
        const startTime = Date.now() - (intervalMs * limit);

        const response = await fetch(HL_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'candleSnapshot',
                req: {
                    coin,
                    interval,
                    startTime
                }
            })
        });

        if (!response.ok) throw new Error(`HL API error: ${response.status}`);

        const data = await response.json();

        if (Array.isArray(data)) {
            return data.map((c: any) => ({
                time: c.t,
                open: parseFloat(c.o),
                high: parseFloat(c.h),
                low: parseFloat(c.l),
                close: parseFloat(c.c),
                volume: parseFloat(c.v)
            }));
        }

        return [];
    } catch (e) {
        console.error(`[MarketData] Error fetching candles for ${coin}:`, e);
        return [];
    }
}

async function fetchCurrentPrice(coin: string): Promise<number> {
    try {
        const response = await fetch(HL_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'midOpenInterest',
                coin
            })
        });

        // Response format: { "BTC": { "mid": "...", "openInterest": "..." }, ... }
        // Wait, midOpenInterest returns all coins? Let's check docs or use allMids
        // actually allMids is better for single lookup map

        // Let's use L2 Book for precise mid price matching client logic
        const bookResponse = await fetch(HL_API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: 'l2Book',
                coin
            })
        });

        if (!bookResponse.ok) return 0;
        const book = await bookResponse.json();

        const bestBid = parseFloat(book.levels[0][0]?.px || '0');
        const bestAsk = parseFloat(book.levels[1][0]?.px || '0');

        if (bestBid && bestAsk) {
            return (bestBid + bestAsk) / 2;
        }
        return parseFloat(book.levels[0][0]?.px || '0'); // Fallback
    } catch (e) {
        console.error(`[MarketData] Error fetching price for ${coin}:`, e);
        return 0;
    }
}

export async function getMarketContext(
    coin: string,
    analysisInterval: string = '1h',
    macroInterval: string = '4h'
): Promise<MarketContext> {
    const [currentPrice, candles, macroCandles] = await Promise.all([
        fetchCurrentPrice(coin),
        fetchCandles(coin, analysisInterval),
        fetchCandles(coin, macroInterval)
    ]);

    return {
        coin,
        currentPrice,
        candles,
        macroCandles
    };
}
