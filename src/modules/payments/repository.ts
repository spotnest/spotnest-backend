import { Payment } from "../dashboard/tenantDashboard/model.js";
import type { IPayment } from "../dashboard/tenantDashboard/type.js";

const createPayment = async (payload: Partial<IPayment>) => Payment.create(payload);

const findForCycle = async (bookingId: string, type: "ADVANCE" | "MONTHLY_RENT", billingMonth?: string, tenantId?: string) =>
    Payment.findOne({ booking: bookingId, type, ...(billingMonth ? { billingMonth } : {}), ...(tenantId ? { tenant: tenantId } : {}) });

const findByOrderId = async (razorpayOrderId: string) =>
    Payment.findOne({ razorpayOrderId });

const findByPaymentId = async (razorpayPaymentId: string) =>
    Payment.findOne({ razorpayPaymentId });

/**
 * Atomically moves a payment to PAID. Returns the updated payment only for
 * the call that performed the transition; returns null when it was already
 * PAID (e.g. the client verify call and the Razorpay webhook raced, or a
 * request was retried). Callers notify only when this returns a payment.
 */
const markPaidIfUnpaid = async (
    paymentId: string,
    details: { razorpayPaymentId: string; paidAt: Date; referenceId: string }
) =>
    Payment.findOneAndUpdate(
        { _id: paymentId, status: { $ne: "PAID" } },
        { $set: { status: "PAID", ...details } },
        { returnDocument: "after" }
    );

/**
 * Marks a payment FAILED unless it has been paid in the meantime (a failed
 * attempt can be followed by a successful retry on the same order). Returns
 * null when nothing changed.
 */
const markFailedIfUnpaid = async (paymentId: string, gatewayPaymentId: string) =>
    Payment.findOneAndUpdate(
        { _id: paymentId, status: { $ne: "PAID" } },
        { $set: { status: "FAILED", referenceId: gatewayPaymentId } },
        { returnDocument: "after" }
    );

const findRentalByBooking = async (bookingId: string) =>
    (await import("../dashboard/tenantDashboard/model.js")).Rental.findOne({ booking: bookingId });

export default {
    createPayment,
    findForCycle,
    findByOrderId,
    findByPaymentId,
    findRentalByBooking,
    markPaidIfUnpaid,
    markFailedIfUnpaid,
};
