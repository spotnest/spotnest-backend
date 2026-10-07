import { Payment } from "../dashboard/tenantDashboard/model.js";
import type { IPayment } from "../dashboard/tenantDashboard/type.js";

const createPayment = async (payload: Partial<IPayment>) => Payment.create(payload);

const findForCycle = async (bookingId: string, type: "ADVANCE" | "MONTHLY_RENT", billingMonth?: string, tenantId?: string) =>
    Payment.findOne({ booking: bookingId, type, ...(billingMonth ? { billingMonth } : {}), ...(tenantId ? { tenant: tenantId } : {}) });

const findByOrderId = async (razorpayOrderId: string) =>
    Payment.findOne({ razorpayOrderId });

const findByPaymentId = async (razorpayPaymentId: string) =>
    Payment.findOne({ razorpayPaymentId });

const findRentalByBooking = async (bookingId: string) =>
    (await import("../dashboard/tenantDashboard/model.js")).Rental.findOne({ booking: bookingId });

export default {
    createPayment,
    findForCycle,
    findByOrderId,
    findByPaymentId,
    findRentalByBooking,
};
