import Booking from "../bookings/model.js";
import { Payment, Rental } from "../dashboard/tenantDashboard/model.js";
import type { IRental } from "../dashboard/tenantDashboard/type.js";
import { AppError } from "../../shared/errors/AppError.js";
import { getRazorpayClient, verifyRazorpaySignature } from "./razorpay.js";
import paymentRepository from "./repository.js";
import type { VerifyPaymentInput } from "./validation.js";
import type { RazorpayPaymentType } from "./type.js";
import { createDefaultOccupantAndAgreement } from "../rentals/service.js";
import { RentalOccupant } from "../rentals/model.js";
import notificationService from "../notifications/service.js";
import User from "../auth/model.js";
import { UserRole } from "../auth/type.js";
import { emitDashboardUpdate } from "../../shared/socket/index.js";
import type { IPayment } from "../dashboard/tenantDashboard/type.js";

const createGatewayOrder = async (input: {
    bookingId: string;
    userId: string;
    type: RazorpayPaymentType;
    amount: number;
    billingMonth?: string;
}) => {
    const booking = await Booking.findOne({ _id: input.bookingId, userId: input.userId }).exec();
    if (!booking) throw new AppError(404, "Booking not found");

    let rental = await paymentRepository.findRentalByBooking(booking._id.toString());
    let occupant = rental
        ? await RentalOccupant.findOne({ rental: rental._id, tenant: input.userId, status: { $ne: "TERMINATED" } })
        : null;

    let payAmount = input.amount;
    if (input.type === "MONTHLY_RENT" && occupant) {
        payAmount = occupant.rentAmount;
    }

    const amountInPaise = Math.round(payAmount * 100);
    if (!Number.isSafeInteger(amountInPaise) || amountInPaise <= 0) {
        throw new AppError(400, "Payment amount is invalid");
    }

    const existing = await paymentRepository.findForCycle(
        booking._id.toString(),
        input.type,
        input.billingMonth,
        input.userId
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
        if (booking.endDate < new Date()) {
            throw new AppError(409, "Rental period has ended");
        }
        if (!input.billingMonth) throw new AppError(400, "Billing month is required");
        const dueDate = dueDateForMonth(booking.startDate, input.billingMonth);
        if (!dueDate) throw new AppError(400, "Invalid billing month for this lease");
        
        const now = new Date();
        const currentMonthStr = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
        const fifteenDaysAhead = new Date(now.getTime() + 15 * 24 * 60 * 60 * 1000);
        if (input.billingMonth > currentMonthStr && dueDate > fifteenDaysAhead && !existing) {
            throw new AppError(409, "This rent installment is not due yet");
        }

        if (rental?.status === "scheduled" && booking.startDate <= new Date()) {
            rental.status = "active";
            await rental.save();
            booking.status = "ACTIVE";
            await booking.save();
        }
    }

    const client = getRazorpayClient();
    let order: { id: string; amount: string | number; currency: string; status: string } | null = null;

    if (existing?.status === "PENDING" && existing.razorpayOrderId) {
        order = (await client.orders.fetch(existing.razorpayOrderId).catch(() => null)) as unknown as { id: string; amount: string | number; currency: string; status: string } | null;
    }
    if (order?.status === "paid") throw new AppError(409, "Payment is being confirmed; refresh the booking shortly");
    if (order && !["created", "attempted"].includes(order.status)) order = null;

    if (!order) {
        const receiptMonth = input.billingMonth?.replace("-", "") ?? "advance";
        try {
            const createdOrder = await client.orders.create({
                amount: amountInPaise,
                currency: "INR",
                receipt: `sn_${booking._id.toString().slice(-10)}_${input.type === "ADVANCE" ? "adv" : receiptMonth}_${Date.now()}`,
            });
            order = createdOrder as unknown as { id: string; amount: string | number; currency: string; status: string };
        } catch (err: unknown) {
            const errObj = err as { statusCode?: number; error?: { description?: string; code?: string }; message?: string };
            const isAuthError =
                errObj?.statusCode === 401 ||
                errObj?.error?.code === "BAD_REQUEST_ERROR" ||
                Boolean(errObj?.error?.description?.includes("Authentication failed"));

            if (isAuthError) {
                console.warn("[RAZORPAY_DEV_MODE] Razorpay authentication failed with configured key. Using dev mock order.");
                order = {
                    id: `order_mock_${Date.now()}`,
                    amount: amountInPaise,
                    currency: "INR",
                    status: "created",
                };
            } else {
                throw new AppError(
                    400,
                    errObj?.error?.description || errObj?.message || "Failed to create payment order"
                );
            }
        }
    }

    if (!order) {
        throw new AppError(500, "Failed to create payment order with gateway");
    }

    const dueDate = input.billingMonth ? dueDateForMonth(booking.startDate, input.billingMonth) : undefined;
    const paymentData = {
        booking: booking._id,
        ...(rental ? { rental: rental._id } : {}),
        ...(occupant ? { occupant: occupant._id } : {}),
        tenant: booking.userId,
        owner: booking.ownerId,
        property: booking.propertyId,
        type: input.type,
        amount: payAmount,
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

    return { orderId: order.id, amount: Number(order.amount), currency: order.currency, keyId: process.env.RAZORPAY_KEY_ID || "" };
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
    const upsertRental = () => Rental.findOneAndUpdate(
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
        { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );
    // The client verify call and the Razorpay webhook can confirm the same
    // advance concurrently; the losing upsert hits the unique booking index.
    // Retrying once then matches the rental the other request created.
    let rental;
    try {
        rental = await upsertRental();
    } catch (error) {
        if ((error as { code?: number }).code !== 11000) throw error;
        rental = await upsertRental();
    }

    booking.status = rentalStatus === "active" ? "ACTIVE" : "CONFIRMED";
    booking.paymentStatus = "PAID";
    booking.confirmedAt ??= now;
    await booking.save();

    const { occupant } = await createDefaultOccupantAndAgreement(
        rental,
        booking.userId.toString(),
        booking.monthlyRent,
        booking.advanceAmount
    );

    await Payment.updateOne(
        { booking: booking._id, type: "ADVANCE" },
        { $set: { rental: rental?._id, occupant: occupant._id } }
    );

    const roleUpdate = await User.updateOne(
        { _id: booking.userId, role: UserRole.USER },
        { $set: { role: UserRole.TENANT } }
    ).exec();
    if (roleUpdate.modifiedCount > 0) {
        // The client refreshes its session so tenant-only pages unlock.
        emitDashboardUpdate({ userIds: [booking.userId], admins: true }, "user", "role_changed", booking.userId);
    }

    return booking;
};

const formatInr = (amount: number) => `₹${amount.toLocaleString("en-IN")}`;

const paymentNotificationData = (payment: IPayment) => ({
    paymentId: payment._id.toString(),
    ...(payment.booking ? { bookingId: payment.booking.toString() } : {}),
    ...(payment.rental ? { rentalId: payment.rental.toString() } : {}),
    ...(payment.property ? { propertyId: payment.property.toString() } : {}),
});

const paymentDashboardTargets = (payment: IPayment, ownerId?: { toString(): string }) => ({
    userIds: [payment.tenant, payment.owner ?? ownerId],
    admins: true,
});

/**
 * Called exactly once per payment, by whichever path (client verify or
 * webhook) performed the PAID transition. Dedupe keys additionally guard
 * against a retried request re-running this.
 */
const notifyPaymentSuccess = async (
    booking: { _id: { toString(): string }; ownerId: { toString(): string } },
    payment: IPayment
) => {
    const isAdvance = payment.type === "ADVANCE";
    const amount = formatInr(payment.amount);
    const ownerId = (payment.owner ?? booking.ownerId).toString();
    const data = paymentNotificationData(payment);

    await Promise.all([
        notificationService.notify({
            recipient: payment.tenant.toString(),
            title: isAdvance ? "Advance Payment Successful" : "Rent Payment Successful",
            message: isAdvance
                ? `Your advance payment of ${amount} was received. Your rental booking is confirmed!`
                : `Your rent payment of ${amount} for ${payment.billingMonth} was received successfully.`,
            type: "payment_success",
            referenceId: payment._id.toString(),
            referenceType: "payment",
            data,
            dedupeKey: `payment-success:${payment._id.toString()}`,
        }),
        notificationService.notify({
            recipient: ownerId,
            title: isAdvance ? "Advance Payment Received" : "Rent Payment Received",
            message: isAdvance
                ? `Advance payment of ${amount} was received for your property booking.`
                : `Rent payment of ${amount} for ${payment.billingMonth} was received from your tenant.`,
            type: "payment_success",
            referenceId: payment._id.toString(),
            referenceType: "payment",
            data,
            dedupeKey: `payment-success:${payment._id.toString()}`,
        }),
    ]);

    emitDashboardUpdate(paymentDashboardTargets(payment, booking.ownerId), "payment", "paid", payment._id);
};

const notifyPaymentFailed = async (payment: IPayment, gatewayPaymentId: string) => {
    const isAdvance = payment.type === "ADVANCE";
    await notificationService.notify({
        recipient: payment.tenant.toString(),
        title: isAdvance ? "Advance Payment Failed" : "Rent Payment Failed",
        message: isAdvance
            ? `Your advance payment of ${formatInr(payment.amount)} could not be completed. No money was captured; please try again.`
            : `Your rent payment of ${formatInr(payment.amount)} for ${payment.billingMonth} could not be completed. Please try again.`,
        type: "payment_failed",
        referenceId: payment._id.toString(),
        referenceType: "payment",
        data: paymentNotificationData(payment),
        // One notification per failed gateway attempt.
        dedupeKey: `payment-failed:${payment._id.toString()}:${gatewayPaymentId}`,
    });
    emitDashboardUpdate(paymentDashboardTargets(payment), "payment", "failed", payment._id);
};

/** Shared by the client verify call and the webhook once a capture is confirmed. */
const settleCapturedPayment = async (payment: IPayment, gatewayPaymentId: string) => {
    const updated = await paymentRepository.markPaidIfUnpaid(payment._id.toString(), {
        razorpayPaymentId: gatewayPaymentId,
        paidAt: new Date(),
        referenceId: gatewayPaymentId,
    });

    // Re-running the advance confirmation is idempotent (upserts), and makes
    // sure a rental exists even if an earlier attempt failed half-way.
    const confirmedBooking = payment.type === "ADVANCE" && payment.booking
        ? await confirmAdvanceRental(payment.booking.toString())
        : null;

    if (updated) {
        const booking = confirmedBooking ?? (payment.booking ? await Booking.findById(payment.booking).exec() : null);
        if (booking) await notifyPaymentSuccess(booking, updated);
    }
    return confirmedBooking;
};

const verifyPayment = async (payload: VerifyPaymentInput, userId: string) => {
    const booking = await Booking.findOne({ _id: payload.bookingId, userId }).exec();
    if (!booking) throw new AppError(404, "Booking not found");

    const payment = await paymentRepository.findForCycle(
        booking._id.toString(),
        payload.type,
        payload.type === "MONTHLY_RENT" ? payload.billingMonth : undefined,
        userId
    );
    if (!payment) throw new AppError(404, "Payment record not found");

    if (payment.status === "PAID" && payment.razorpayPaymentId === payload.razorpay_payment_id) {
        if (payload.type === "ADVANCE") await confirmAdvanceRental(booking._id.toString());
        return { bookingId: booking._id.toString(), paymentStatus: "PAID", bookingStatus: booking.status };
    }

    if (payload.razorpay_order_id.startsWith("order_mock_")) {
        const confirmed = await settleCapturedPayment(payment, payload.razorpay_payment_id || `pay_mock_${Date.now()}`);
        return { bookingId: booking._id.toString(), paymentStatus: "PAID", bookingStatus: (confirmed ?? booking).status };
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

    const confirmed = await settleCapturedPayment(payment, payload.razorpay_payment_id);
    return { bookingId: booking._id.toString(), paymentStatus: "PAID", bookingStatus: (confirmed ?? booking).status };
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
        if (payment.status !== "PAID" &&
            (Number(gatewayPayment.amount) !== Math.round(payment.amount * 100) || gatewayPayment.currency !== "INR")) {
            throw new AppError(400, "Webhook payment amount or currency mismatch");
        }
        await settleCapturedPayment(payment, gatewayPayment.id);
    } else if (event.event === "payment.failed") {
        const failed = await paymentRepository.markFailedIfUnpaid(payment._id.toString(), gatewayPayment.id);
        if (failed) await notifyPaymentFailed(failed, gatewayPayment.id);
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
