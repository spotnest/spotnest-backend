import crypto from "node:crypto";

import {
    razorpayKeyId,
    razorpayKeySecret,
    razorpayWebhookSecret,
} from "../config/env.js";

/**
 * Thin Razorpay Orders client.
 *
 * Deliberately uses the built-in fetch with HTTP Basic auth instead of the
 * `razorpay` npm package: creating an order is one POST, and the official SDK
 * would add a dependency (and a heavier fetch/agent implementation) for
 * nothing we use.
 *
 * ONE-TIME ORDERS ONLY.
 *
 * This is intentionally not the Razorpay Subscriptions API. There is no
 * auto-debit here: every plan is a fixed-duration order paid once, and the
 * entitlement expires when the purchased duration runs out.
 */

const ORDERS_URL = "https://api.razorpay.com/v1/orders";

export interface RazorpayOrderInput {
    /** Amount in paise (the smallest INR unit). Never derived from the client. */
    amountPaise: number;
    currency: string;
    receipt: string;
    notes: Record<string, string>;
}

export interface RazorpayOrder {
    id: string;
    amount: number;
    currency: string;
    status: string;
}

/**
 * Create a one-time Razorpay Order.
 *
 * Throws on a non-2xx response. The response body may contain Razorpay's own
 * error detail, which is safe to surface, but never log the request — it
 * carries the Basic auth header.
 */
export const createRazorpayOrder = async (
    input: RazorpayOrderInput
): Promise<RazorpayOrder> => {
    if (!razorpayKeyId || !razorpayKeySecret) {
        throw new Error(
            "Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET."
        );
    }

    const basicAuth = Buffer.from(
        `${razorpayKeyId}:${razorpayKeySecret}`
    ).toString("base64");

    const response = await fetch(ORDERS_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Basic ${basicAuth}`,
        },
        body: JSON.stringify({
            amount: input.amountPaise,
            currency: input.currency,
            receipt: input.receipt,
            notes: input.notes,
            payment_capture: 1,
        }),
    });

    const body = (await response.json()) as Partial<RazorpayOrder> & {
        error?: { description?: string };
    };

    if (!response.ok) {
        // Log the status only — never the request or the auth header.
        console.error(
            `[RAZORPAY] order creation failed with status ${response.status}`
        );

        throw new Error(
            body.error?.description ||
                "Could not start the payment. Please try again."
        );
    }

    if (!body.id) {
        throw new Error("Razorpay returned an order without an id");
    }

    return {
        id: body.id,
        amount: body.amount ?? input.amountPaise,
        currency: body.currency ?? input.currency,
        status: body.status ?? "created",
    };
};

/**
 * Verify a Razorpay HMAC-SHA256 signature in constant time.
 *
 * `timingSafeEqual` throws when the two buffers differ in length, so the
 * length check runs first and returns false instead.
 */
export const verifyRazorpaySignature = (
    payload: string,
    signature: string,
    secret: string
): boolean => {
    if (!signature || !secret) {
        return false;
    }

    const expected = crypto
        .createHmac("sha256", secret)
        .update(payload, "utf8")
        .digest("hex");

    const expectedBuffer = Buffer.from(expected, "utf8");
    const receivedBuffer = Buffer.from(signature, "utf8");

    if (expectedBuffer.length !== receivedBuffer.length) {
        return false;
    }

    return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
};

/**
 * Signature check for the checkout `handler` response.
 *
 * Razorpay signs the concatenation of order id and payment id.
 */
export const verifyCheckoutSignature = (input: {
    orderId: string;
    paymentId: string;
    signature: string;
}): boolean => {
    if (!razorpayKeySecret) {
        return false;
    }

    return verifyRazorpaySignature(
        `${input.orderId}|${input.paymentId}`,
        input.signature,
        razorpayKeySecret
    );
};

/**
 * Signature check for the webhook `x-razorpay-signature` header.
 *
 * The signed payload is the RAW request body, byte for byte. A re-serialized
 * JSON object will not verify, which is why the route uses express.raw().
 */
export const verifyWebhookSignature = (
    rawBody: Buffer | string,
    signature: string
): boolean => {
    if (!razorpayWebhookSecret) {
        return false;
    }

    const payload = Buffer.isBuffer(rawBody)
        ? rawBody.toString("utf8")
        : rawBody;

    return verifyRazorpaySignature(
        payload,
        signature,
        razorpayWebhookSecret
    );
};
