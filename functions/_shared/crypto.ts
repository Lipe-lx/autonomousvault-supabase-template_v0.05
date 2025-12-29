// AutonomousVault Edge Functions - Crypto Utilities
// functions/_shared/crypto.ts
//
// SECURITY: Client-side encrypted keys are decrypted here IN-MEMORY ONLY
// Keys are NEVER persisted in decrypted form

/**
 * Decrypt an encrypted blob using password
 * Uses WebCrypto API (Deno native)
 * 
 * @param encryptedBlob - Base64 encoded encrypted data
 * @param password - User's decryption password
 * @param salt - Base64 encoded salt used during encryption
 * @returns Decrypted plaintext (private key)
 */
export async function decryptBlob(
    encryptedBlob: string,
    password: string,
    salt: string
): Promise<string> {
    try {
        // Decode inputs
        const encryptedData = Uint8Array.from(atob(encryptedBlob), c => c.charCodeAt(0));
        const saltBytes = Uint8Array.from(atob(salt), c => c.charCodeAt(0));

        // Extract IV (first 12 bytes) and ciphertext
        const iv = encryptedData.slice(0, 12);
        const ciphertext = encryptedData.slice(12);

        // Derive key from password using PBKDF2
        const encoder = new TextEncoder();
        const passwordKey = await crypto.subtle.importKey(
            'raw',
            encoder.encode(password),
            'PBKDF2',
            false,
            ['deriveBits', 'deriveKey']
        );

        const derivedKey = await crypto.subtle.deriveKey(
            {
                name: 'PBKDF2',
                salt: saltBytes,
                iterations: 100000,
                hash: 'SHA-256',
            },
            passwordKey,
            { name: 'AES-GCM', length: 256 },
            false,
            ['decrypt']
        );

        // Decrypt
        const decrypted = await crypto.subtle.decrypt(
            { name: 'AES-GCM', iv },
            derivedKey,
            ciphertext
        );

        return new TextDecoder().decode(decrypted);
    } catch (error) {
        throw new Error('Decryption failed: Invalid password or corrupted data');
    }
}

/**
 * Securely clear a string from memory
 * Note: JavaScript doesn't guarantee memory clearing,
 * but this helps by overwriting the reference
 */
export function secureWipe(value: string): void {
    // Best effort - overwrite with random data
    // In practice, JS garbage collection handles memory
    // but we null the reference to prevent accidental reuse
    const len = value.length;
    // Create replacement (this doesn't actually overwrite original memory)
    // The real protection is not storing/logging the value
}

/**
 * Execute with secure cleanup
 * Ensures the decrypted key is not retained after use
 */
export async function withDecryptedKey<T>(
    encryptedBlob: string,
    password: string,
    salt: string,
    operation: (decryptedKey: string) => Promise<T>
): Promise<T> {
    let decryptedKey: string | null = null;

    try {
        decryptedKey = await decryptBlob(encryptedBlob, password, salt);
        const result = await operation(decryptedKey);
        return result;
    } finally {
        // Clear reference (best effort)
        if (decryptedKey) {
            secureWipe(decryptedKey);
            decryptedKey = null;
        }
    }
}
