/**
 * Centralized configuration constants for rental agreements and payments.
 * Authoritative advance payment deadline: 2 minutes (120,000 milliseconds)
 * measured from the exact moment the owner successfully approves the tenant-accepted agreement.
 */
export const RENTAL_PAYMENT_DEADLINE_MS = Number(
    process.env.RENTAL_PAYMENT_DEADLINE_MS || 120000
);

