// AutonomousVault Edge Functions - Execution Session
// functions/_shared/execution-session.ts
//
// Handles Tier B session validation and password decryption
// Sessions are time-limited and revocable

import { createSupabaseClient } from './supabase.ts';
import { decryptBlob } from './crypto.ts';

/**
 * Execution session from database
 */
interface ExecutionSession {
    session_id: string;
    encrypted_session_token: string;
    expires_at: string;
}

/**
 * Decoded session payload
 */
interface SessionPayload {
    userId: string;
    password: string;
    expiresAt: string;
}

/**
 * Result of session validation
 */
interface SessionValidationResult {
    valid: boolean;
    password?: string;
    error?: string;
    sessionId?: string;
}

/**
 * Validate and extract password from Tier B session
 * 
 * @param userId - User ID to validate session for
 * @returns Session validation result with decrypted password
 */
export async function validateExecutionSession(
    userId: string
): Promise<SessionValidationResult> {
    try {
        const supabase = createSupabaseClient();

        // Get active session using helper function
        const { data, error } = await supabase
            .rpc('get_active_session', { p_user_id: userId });

        if (error) {
            console.error('[execution-session] RPC error:', error);
            return { valid: false, error: 'Failed to check session' };
        }

        if (!data || data.length === 0) {
            return { valid: false, error: 'No active session found' };
        }

        const session = data[0] as ExecutionSession;

        // Check expiration
        const expiresAt = new Date(session.expires_at);
        if (expiresAt < new Date()) {
            return { valid: false, error: 'Session expired' };
        }

        // Decrypt session token to get password
        const payload = await decryptSessionToken(session.encrypted_session_token);

        if (!payload) {
            return { valid: false, error: 'Failed to decrypt session' };
        }

        // Verify user ID matches
        if (payload.userId !== userId) {
            return { valid: false, error: 'Session user mismatch' };
        }

        // Record session usage
        await supabase.rpc('record_session_usage', {
            p_session_id: session.session_id
        });

        return {
            valid: true,
            password: payload.password,
            sessionId: session.session_id
        };
    } catch (e) {
        console.error('[execution-session] Validation error:', e);
        return {
            valid: false,
            error: e instanceof Error ? e.message : 'Unknown error'
        };
    }
}

/**
 * Get password for execution - checks Tier B session or Tier C stored password
 * 
 * @param userId - User ID
 * @returns Password if available, null otherwise
 */
export async function getExecutionPassword(
    userId: string
): Promise<{ password: string | null; tier: 'session' | 'persistent' | 'none'; error?: string }> {
    try {
        const supabase = createSupabaseClient();

        // First check for Tier C (persistent password)
        const { data: keyData, error: keyError } = await supabase
            .from('encrypted_keys')
            .select('encrypted_password')
            .eq('user_id', userId)
            .eq('key_name', 'hyperliquid')
            .single();

        if (!keyError && keyData?.encrypted_password) {
            // Tier C: Decrypt stored password
            const password = await decryptStoredPassword(keyData.encrypted_password);
            if (password) {
                return { password, tier: 'persistent' };
            }
        }

        // Check for Tier B (session)
        const sessionResult = await validateExecutionSession(userId);
        if (sessionResult.valid && sessionResult.password) {
            return { password: sessionResult.password, tier: 'session' };
        }

        return {
            password: null,
            tier: 'none',
            error: sessionResult.error || 'No valid session or stored password'
        };
    } catch (e) {
        console.error('[execution-session] getExecutionPassword error:', e);
        return {
            password: null,
            tier: 'none',
            error: e instanceof Error ? e.message : 'Unknown error'
        };
    }
}

/**
 * Decrypt session token to extract payload
 * 
 * Session token format: Base64(IV + Encrypted(JSON(payload)) + ExportedKey)
 */
async function decryptSessionToken(encryptedToken: string): Promise<SessionPayload | null> {
    try {
        // Decode base64
        const combined = Uint8Array.from(atob(encryptedToken), c => c.charCodeAt(0));

        // Extract parts: IV (12 bytes) + Ciphertext + Key (32 bytes)
        const iv = combined.slice(0, 12);
        const keyBytes = combined.slice(-32);
        const ciphertext = combined.slice(12, -32);

        // Import the key
        const key = await crypto.subtle.importKey(
            'raw',
            keyBytes,
            { name: 'AES-GCM', length: 256 },
            false,
            ['decrypt']
        );

        // Decrypt
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            key,
            ciphertext
        );

        const payloadStr = new TextDecoder().decode(decrypted);
        return JSON.parse(payloadStr) as SessionPayload;
    } catch (e) {
        console.error('[execution-session] Token decryption failed:', e);
        return null;
    }
}

/**
 * Decrypt Tier C stored password
 * 
 * In production, this should use a server-managed key from secrets
 */
async function decryptStoredPassword(encryptedPassword: string): Promise<string | null> {
    try {
        // Decode base64
        const combined = Uint8Array.from(atob(encryptedPassword), c => c.charCodeAt(0));

        // Extract IV and ciphertext
        const iv = combined.slice(0, 12);
        const ciphertext = combined.slice(12);

        // Derive key from server secret (in production, use Deno.env.get)
        const serverSecret = Deno.env.get('ENCRYPTION_SECRET') || 'server-managed-key-placeholder';
        const encoder = new TextEncoder();
        const salt = encoder.encode('autonomousvault-persistent-key-v1');

        const keyMaterial = await crypto.subtle.importKey(
            'raw',
            encoder.encode(serverSecret),
            'PBKDF2',
            false,
            ['deriveKey']
        );

        const key = await crypto.subtle.deriveKey(
            { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
            keyMaterial,
            { name: 'AES-GCM', length: 256 },
            false,
            ['decrypt']
        );

        // Decrypt
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            key,
            ciphertext
        );

        return new TextDecoder().decode(decrypted);
    } catch (e) {
        console.error('[execution-session] Password decryption failed:', e);
        return null;
    }
}

/**
 * Revoke a session (for logout or security)
 */
export async function revokeSession(sessionId: string): Promise<boolean> {
    try {
        const supabase = createSupabaseClient();

        const { error } = await supabase
            .from('execution_sessions')
            .update({ revoked: true })
            .eq('id', sessionId);

        return !error;
    } catch (e) {
        console.error('[execution-session] Revoke failed:', e);
        return false;
    }
}

/**
 * Check if user has any active execution capability (Tier B or C)
 */
export async function hasExecutionCapability(userId: string): Promise<{
    canExecute: boolean;
    tier: 'session' | 'persistent' | 'none';
    expiresAt?: string;
}> {
    const result = await getExecutionPassword(userId);

    return {
        canExecute: result.password !== null,
        tier: result.tier
    };
}
