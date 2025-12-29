// Hyperliquid Adapter for Edge Functions
// functions/_shared/hyperliquid-adapter.ts

import { ethers } from 'ethers';
import msgpack from 'msgpack-lite';
import { Buffer } from 'node:buffer';

const IS_MAINNET = false; // Testnet by default for safety
const API_URL = 'https://api.hyperliquid-testnet.xyz/exchange';

export interface OrderOptions {
    orderType?: 'limit' | 'market' | 'ioc' | 'alo';
    price?: number;
    reduceOnly?: boolean;
    cloid?: string;
}

export interface TradeResult {
    success: boolean;
    orderId?: string;
    error?: string;
    filledSize?: number;
    filledPrice?: number;
}

/**
 * Execute a trade on Hyperliquid via Edge Function
 */
export async function executeTrade(
    wallet: ethers.Wallet,
    coin: string,
    isBuy: boolean,
    size: number,
    price: number,
    options: OrderOptions
): Promise<TradeResult> {
    try {
        console.log(`[HyperliquidAdapter] Executing ${isBuy ? 'BUY' : 'SELL'} ${coin} Size: ${size} @ ${price}`);

        // 1. Get Asset Index
        const assetIndex = await getAssetIndex(coin);
        if (assetIndex === -1) throw new Error(`Asset ${coin} not found`);

        const action = {
            type: 'order',
            orders: [{
                a: assetIndex,
                b: isBuy,
                p: floatToWire(price),
                s: floatToWire(size),
                r: options.reduceOnly || false,
                t: { limit: { tif: 'Gtc' } }, // Default to GTC limit
                c: options.cloid
            }],
            grouping: 'na'
        };

        const nonce = Date.now();
        const signature = await signL1Action(wallet, action, null, nonce);

        const payload = {
            action,
            nonce,
            signature,
            vaultAddress: null
        };

        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });

        if (!response.ok) {
            const txt = await response.text();
            throw new Error(`API Error: ${response.status} ${txt}`);
        }

        const data = await response.json();

        if (data.status === 'ok') {
            const status = data.response?.data?.statuses?.[0];
            if (status?.error) {
                return { success: false, error: status.error };
            }
            return {
                success: true,
                orderId: data.response?.data?.statuses?.[0]?.resting?.oid?.toString() || 'filled'
            };
        } else {
            return { success: false, error: data.response || 'Unknown error' };
        }

    } catch (e) {
        console.error('[HyperliquidAdapter] Execution error:', e);
        return { success: false, error: e instanceof Error ? e.message : 'Unknown error' };
    }
}

// --- Helpers ---

async function getAssetIndex(coin: string): Promise<number> {
    // Cache map for efficiency (simple in-memory for function lifetime)
    const map: Record<string, number> = {
        'BTC': 0, 'ETH': 1, 'SOL': 4 // Common ones
        // In prod this should fetch meta but for now we fallback or fetch
    };

    if (map[coin] !== undefined) return map[coin];

    // Fetch meta if not found
    try {
        const res = await fetch('https://api.hyperliquid-testnet.xyz/info', {
            method: 'POST',
            body: JSON.stringify({ type: 'meta' })
        });
        const meta = await res.json();
        const asset = meta.universe.find((a: any) => a.name === coin);
        return asset ? meta.universe.indexOf(asset) : -1;
    } catch {
        return -1;
    }
}

function floatToWire(x: number): string {
    if (x === 0) return '0';
    return x.toFixed(8).replace(/\.?0+$/, '');
}

async function signL1Action(
    wallet: ethers.Wallet,
    action: any,
    vaultAddress: string | null,
    nonce: number
): Promise<{ r: string; s: string; v: number }> {
    const actionHash = actionHashFn(action, vaultAddress, nonce);
    const phantomAgent = { source: 'b', connectionId: actionHash }; // 'b' for testnet

    const domain = {
        name: 'Exchange',
        version: '1',
        chainId: 1337,
        verifyingContract: '0x0000000000000000000000000000000000000000'
    };

    const types = {
        Agent: [
            { name: 'source', type: 'string' },
            { name: 'connectionId', type: 'bytes32' }
        ]
    };

    const sig = await wallet.signTypedData(domain, types, phantomAgent);
    const { r, s, v } = ethers.Signature.from(sig);
    return { r, s, v };
}

function actionHashFn(
    action: any,
    vaultAddress: string | null,
    nonce: number
): string {
    let data = msgpack.encode(action);

    const nonceBuffer = Buffer.alloc(8);
    nonceBuffer.writeBigUInt64BE(BigInt(nonce), 0);
    data = Buffer.concat([data, nonceBuffer]);

    if (vaultAddress === null) {
        data = Buffer.concat([data, Buffer.from([0x00])]);
    } else {
        // Handle vault address logic if implemented
        data = Buffer.concat([data, Buffer.from([0x00])]); // Placeholder
    }

    return ethers.keccak256(data);
}
