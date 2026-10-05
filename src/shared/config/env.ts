import dotenv from "dotenv";

// Must be imported FIRST (before any module whose top-level code reads
// process.env). ESM evaluates static imports before the importing module's
// body runs, so a `dotenv.config()` at the bottom of server.ts executes too
// late for modules like email.ts that construct their client at import time.
dotenv.config();

/**
 * =========================
 * RAZORPAY
 * =========================
 *
 * Read once at import time, which is why env.js must be imported before
 * this module anywhere these are used.
 *
 * The key secret and webhook secret are never logged, never returned in an
 * API response, and never sent to the client. Only razorpayKeyId is
 * exposed (Razorpay's checkout script requires it).
 */

/** Public key id handed to the browser checkout widget. */
export const razorpayKeyId = process.env.RAZORPAY_KEY_ID || "";

/** Server-only API secret. Used to authenticate order creation and to sign. */
export const razorpayKeySecret = process.env.RAZORPAY_KEY_SECRET || "";

/** Separate secret used for the x-razorpay-signature webhook header. */
export const razorpayWebhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET || "";
