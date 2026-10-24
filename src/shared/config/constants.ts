/**
 * Centralized configuration constants for rental agreements and payments.
 * Authoritative advance payment deadline: 72 hours (259,200,000 milliseconds)
 * measured from the exact moment the owner successfully approves the tenant-accepted agreement.
 */
export const RENTAL_PAYMENT_DEADLINE_MS = Number(
    process.env.RENTAL_PAYMENT_DEADLINE_MS || 259200000
);

