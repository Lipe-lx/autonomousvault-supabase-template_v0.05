// AutonomousVault Edge Functions - Error Types
// functions/_shared/errors.ts

/**
 * Base error for Edge Functions
 */
export class EdgeFunctionError extends Error {
    constructor(
        message: string,
        public code: string,
        public statusCode: number = 400
    ) {
        super(message);
        this.name = 'EdgeFunctionError';
    }
}

/**
 * Authentication required
 */
export class AuthenticationError extends EdgeFunctionError {
    constructor(message = 'Authentication required') {
        super(message, 'AUTH_REQUIRED', 401);
        this.name = 'AuthenticationError';
    }
}

/**
 * Authorization denied
 */
export class AuthorizationError extends EdgeFunctionError {
    constructor(message = 'Access denied') {
        super(message, 'ACCESS_DENIED', 403);
        this.name = 'AuthorizationError';
    }
}

/**
 * Usage limit exceeded
 */
export class UsageLimitError extends EdgeFunctionError {
    constructor(
        public limitType: string,
        public currentUsage: number,
        public limit: number
    ) {
        super(
            `${limitType} limit exceeded: ${currentUsage}/${limit}`,
            'USAGE_LIMIT_EXCEEDED',
            429
        );
        this.name = 'UsageLimitError';
    }
}

/**
 * Decryption failed
 */
export class DecryptionError extends EdgeFunctionError {
    constructor(message = 'Failed to decrypt: invalid password or corrupted data') {
        super(message, 'DECRYPTION_FAILED', 400);
        this.name = 'DecryptionError';
    }
}

/**
 * External API error (exchange, AI, etc.)
 */
export class ExternalAPIError extends EdgeFunctionError {
    constructor(
        public service: string,
        message: string
    ) {
        super(`${service} error: ${message}`, 'EXTERNAL_API_ERROR', 502);
        this.name = 'ExternalAPIError';
    }
}

/**
 * Validation error
 */
export class ValidationError extends EdgeFunctionError {
    constructor(message: string) {
        super(message, 'VALIDATION_ERROR', 400);
        this.name = 'ValidationError';
    }
}

/**
 * Handle error and return appropriate response
 */
export function handleError(error: unknown): { message: string; code: string; statusCode: number } {
    if (error instanceof EdgeFunctionError) {
        return {
            message: error.message,
            code: error.code,
            statusCode: error.statusCode,
        };
    }

    // Unknown error
    console.error('Unexpected error:', error);
    return {
        message: 'Internal server error',
        code: 'INTERNAL_ERROR',
        statusCode: 500,
    };
}
