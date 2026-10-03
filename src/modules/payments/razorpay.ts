import crypto from "node:crypto";
import Razorpay from "razorpay";

const getRequiredEnv = (name: string): string => {
    const value = process.env[name];
    if (!value) {
        throw new Error(`${name} is not configured`);
    }
    return value;
};

export const getRazorpayClient = () =>
    new Razorpay({
        key_id: getRequiredEnv("RAZORPAY_KEY_ID"),
        key_secret: getRequiredEnv("RAZORPAY_KEY_SECRET"),
    });

export const verifyRazorpaySignature = (
    orderId: string,
    paymentId: string,
    signature: string
): boolean => {
    const expected = crypto
        .createHmac("sha256", getRequiredEnv("RAZORPAY_KEY_SECRET"))
        .update(`${orderId}|${paymentId}`)
        .digest("hex");

    if (!/^[a-f\d]{64}$/i.test(signature)) return false;
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
};

export const verifyWebhookSignature = (payload: string, signature: string): boolean => {
    const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
    if (!secret) {
        return false;
    }

    const expected = crypto.createHmac("sha256", secret).update(payload).digest("hex");

    if (!/^[a-f\d]{64}$/i.test(signature)) return false;
    return crypto.timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(signature, "hex"));
};
