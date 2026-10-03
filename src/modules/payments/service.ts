import Booking from "../bookings/model.js";
import { Payment, Rental } from "../dashboard/tenantDashboard/model.js";
import type { IRental } from "../dashboard/tenantDashboard/type.js";
import { AppError } from "../../shared/errors/AppError.js";
import { getRazorpayClient, verifyRazorpaySignature } from "./razorpay.js";
import paymentRepository from "./repository.js";
import type { VerifyPaymentInput } from "./validation.js";
import type { RazorpayPaymentType } from "./type.js";

const createGatewayOrder = async (input: {
    bookingId: string;
    userId: string;
    type: RazorpayPaymentType;
    amount: number;
    billingMonth?: string;
}) => {
    const amountInPaise = Math.round(input.amount * 100);
    if (!Number.isSafeInteger(amountInPaise) || amountInPaise <= 0) {
        throw new AppError(400, "Payment amount is invalid");
    }

    const booking = await Booking.findOne({ _id: input.bookingId, userId: input.userId }).exec();
    if (!booking) throw new AppError(404, "Booking not found");

    let rental = await paymentRepository.findRentalByBooking(booking._id.toString());
    const existing = await paymentRepository.findForCycle(
        booking._id.toString(),
        input.type,
        input.billingMonth
    );
    if (existing?.status === "PAID") throw new AppError(409, "This billing item has already been paid");

    if (input.type === "ADVANCE") {
        if (booking.status !== "APPROVED" || booking.paymentStatus !== "ADVANCE_PAYMENT_PENDING") {
            throw new AppError(409, "Advance payment is available only after owner approval");
        }
    } else {
        if (!["CONFIRMED", "ACTIVE"].includes(booking.status)) {
            throw new AppError(409, "Monthly rent is available after the advance payment is confirmed");
        }
        if (booking.startDate > new Date() || booking.endDate < new Date()) {
            throw new AppError(409, "Monthly rent is available only during the rental period");
        }
        if (!input.billingMonth) throw new AppError(400, "Billing month is required");
        const dueDate = dueDateForMonth(booking.startDate, input.billingMonth);
        if (!dueDate || dueDate > new Date()) throw new AppError(409, "This rent installment is not due yet");
        if (rental?.status === "scheduled" && booking.startDate <= new Date()) {
            rental.status = "active";
            await rental.save();
            booking.status = "ACTIVE";
            await booking.save();
        }
    }

    const client = getRazorpayClient();
    let order = existing?.status === "PENDING" && existing.razorpayOrderId
        ? await client.orders.fetch(existing.razorpayOrderId).catch(() => null)
        : null;
    if (order?.status === "paid") throw new AppError(409, "Payment is being confirmed; refresh the booking shortly");
    if (order && !["created", "attempted"].includes(order.status)) order = null;
    if (!order) {
        const receiptMonth = input.billingMonth?.replace("-", "") ?? "advance";
        order = await client.orders.create({
            amount: amountInPaise,
            currency: "INR",
            receipt: `sn_${booking._id.toString().slice(-10)}_${input.type === "ADVANCE" ? "adv" : receiptMonth}_${Date.now()}`,
        });
    }

    const dueDate = input.billingMonth ? dueDateForMonth(booking.startDate, input.billingMonth) : undefined;
    const paymentData = {
        booking: booking._id,
        ...(rental ? { rental: rental._id } : {}),
        tenant: booking.userId,
        owner: booking.ownerId,
        property: booking.propertyId,
        type: input.type,
        amount: input.amount,
        currency: "INR",
        status: "PENDING" as const,
        razorpayOrderId: order.id,
        ...(input.billingMonth ? { billingMonth: input.billingMonth } : {}),
        ...(dueDate ? { dueDate } : {}),
    };

    if (existing) {
        Object.assign(existing, paymentData);
        existing.set("razorpayPaymentId", undefined);
        await existing.save();
    } else {
        await paymentRepository.createPayment(paymentData);
    }

    return { orderId: order.id, amount: order.amount, currency: order.currency, keyId: process.env.RAZORPAY_KEY_ID || "" };
};

const dueDateForMonth = (leaseStart: Date, billingMonth: string): Date | null => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(billingMonth)) return null;
    const [yearText, monthText] = billingMonth.split("-");
    const year = Number(yearText);
    const monthIndex = Number(monthText) - 1;
    const lastDay = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
    const day = Math.min(leaseStart.getUTCDate(), lastDay);
    const dueDate = new Date(Date.UTC(year, monthIndex, day));
    if (dueDate < leaseStart) return null;
    return dueDate;
};

const confirmAdvanceRental = async (bookingId: string) => {
    const booking = await Booking.findById(bookingId).exec();
    if (!booking) throw new AppError(404, "Booking not found");

    const now = new Date();
    const rentalStatus: IRental["status"] = booking.startDate <= now ? "active" : "scheduled";
    const rental = await Rental.findOneAndUpdate(
        { booking: booking._id },
        {
            $setOnInsert: {
                booking: booking._id,
                property: booking.propertyId,
                owner: booking.ownerId,
                tenant: booking.userId,
                monthlyRent: booking.monthlyRent,
                securityDeposit: booking.advanceAmount,
                leaseStart: booking.startDate,
                leaseEnd: booking.endDate,
                paymentFrequency: "monthly",
            },
            $set: { status: rentalStatus },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    booking.status = rentalStatus === "active" ? "ACTIVE" : "CONFIRMED";
    booking.paymentStatus = "PAID";
    booking.confirmedAt ??= now;
    await booking.save();

    await Payment.updateOne(
        { booking: booking._id, type: "ADVANCE" },
        { $set: { rental: rental?._id } }
    );
    return booking;
};

const verifyPayment = async (payload: VerifyPaymentInput, userId: string) => {
    const booking = await Booking.findOne({ _id: payload.bookingId, userId }).exec();
    if (!booking) throw new AppError(404, "Booking not found");

    const payment = await paymentRepository.findForCycle(
        booking._id.toString(),
        payload.type,
        payload.type === "MONTHLY_RENT" ? payload.billingMonth : undefined
    );
    if (!payment) throw new AppError(404, "Payment record not found");

    if (payment.status === "PAID" && payment.razorpayPaymentId === payload.razorpay_payment_id) {
        if (payload.type === "ADVANCE") await confirmAdvanceRental(booking._id.toString());
        return { bookingId: booking._id.toString(), paymentStatus: "PAID", bookingStatus: booking.status };
    }
    if (payment.razorpayOrderId !== payload.razorpay_order_id) {
        throw new AppError(400, "Payment order does not match this booking payment");
    }
    if (!verifyRazorpaySignature(payload.razorpay_order_id, payload.razorpay_payment_id, payload.razorpay_signature)) {
        throw new AppError(400, "Invalid Razorpay signature");
    }

    const client = getRazorpayClient();
    const [order, gatewayPayment] = await Promise.all([
        client.orders.fetch(payload.razorpay_order_id),
        client.payments.fetch(payload.razorpay_payment_id),
    ]);
    const expectedAmount = Math.round(payment.amount * 100);
    if (
        order.id !== payment.razorpayOrderId ||
        gatewayPayment.order_id !== order.id ||
        Number(order.amount) !== expectedAmount ||
        Number(gatewayPayment.amount) !== expectedAmount ||
        order.currency !== "INR" ||
        gatewayPayment.currency !== "INR"
    ) throw new AppError(400, "Razorpay order details do not match this payment");
    if (gatewayPayment.status !== "captured") {
        throw new AppError(409, "Payment has not been captured yet");
    }

    payment.status = "PAID";
    payment.razorpayPaymentId = payload.razorpay_payment_id;
    payment.paidAt = new Date();
    payment.referenceId = payload.razorpay_payment_id;
    await payment.save();

    const updatedBooking = payload.type === "ADVANCE"
        ? await confirmAdvanceRental(booking._id.toString())
        : booking;

    return { bookingId: booking._id.toString(), paymentStatus: "PAID", bookingStatus: updatedBooking.status };
};

const handleWebhook = async (event: {
    event?: string;
    payload?: { payment?: { entity?: { id?: string; order_id?: string; amount?: number; currency?: string; status?: string } } };
}) => {
    const gatewayPayment = event.payload?.payment?.entity;
    if (!gatewayPayment?.id || !gatewayPayment.order_id) return;

    const payment = await paymentRepository.findByOrderId(gatewayPayment.order_id);
    if (!payment) return;

    if (event.event === "payment.captured" && gatewayPayment.status === "captured") {
        if (payment.status === "PAID") {
            if (payment.type === "ADVANCE" && payment.booking) await confirmAdvanceRental(payment.booking.toString());
            return;
        }
        if (Number(gatewayPayment.amount) !== Math.round(payment.amount * 100) || gatewayPayment.currency !== "INR") {
            throw new AppError(400, "Webhook payment amount or currency mismatch");
        }
        payment.status = "PAID";
        payment.razorpayPaymentId = gatewayPayment.id;
        payment.paidAt = new Date();
        payment.referenceId = gatewayPayment.id;
        await payment.save();
        if (payment.type === "ADVANCE" && payment.booking) {
            await confirmAdvanceRental(payment.booking.toString());
        }
    } else if (event.event === "payment.failed") {
        payment.status = "FAILED";
        payment.referenceId = gatewayPayment.id;
        await payment.save();
    }
};

const ensureMonthlyRentPayments = async (rentalId: string) => {
    const rental = await Rental.findById(rentalId).exec();
    if (!rental?.booking || rental.status !== "active") return;
    const booking = await Booking.findById(rental.booking).exec();
    if (!booking) return;

    const now = new Date();
    const cursor = new Date(Date.UTC(rental.leaseStart.getUTCFullYear(), rental.leaseStart.getUTCMonth(), 1));
    const endMonth = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    while (cursor <= endMonth) {
        const billingMonth = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`;
        const dueDate = dueDateForMonth(rental.leaseStart, billingMonth);
        if (dueDate && dueDate <= now && dueDate <= rental.leaseEnd) {
            await Payment.updateOne(
                { booking: booking._id, type: "MONTHLY_RENT", billingMonth },
                {
                    $setOnInsert: {
                        booking: booking._id,
                        rental: rental._id,
                        tenant: booking.userId,
                        owner: booking.ownerId,
                        property: booking.propertyId,
                        type: "MONTHLY_RENT",
                        amount: booking.monthlyRent,
                        currency: "INR",
                        status: "PENDING",
                        billingMonth,
                        dueDate,
                    },
                },
                { upsert: true }
            );
        }
        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
};

export default {
    createAdvanceOrder: (bookingId: string, userId: string) => {
        return Booking.findOne({ _id: bookingId, userId }).exec().then((booking) => {
            if (!booking) throw new AppError(404, "Booking not found");
            return createGatewayOrder({ bookingId, userId, type: "ADVANCE", amount: booking.advanceAmount });
        });
    },
    createMonthlyRentOrder: async (bookingId: string, billingMonth: string, userId: string) => {
        const booking = await Booking.findOne({ _id: bookingId, userId }).exec();
        if (!booking) throw new AppError(404, "Booking not found");
        return createGatewayOrder({ bookingId, userId, type: "MONTHLY_RENT", amount: booking.monthlyRent, billingMonth });
    },
    verifyPayment,
    handleWebhook,
    ensureMonthlyRentPayments,
};
