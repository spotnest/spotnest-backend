import Booking from "../bookings/model.js";
import { Payment, Rental } from "../dashboard/tenantDashboard/model.js";
import { AppError } from "../../shared/errors/AppError.js";
import { getRazorpayClient, verifyRazorpaySignature } from "./razorpay.js";
import paymentRepository from "./repository.js";
import type { VerifyPaymentInput } from "./validation.js";
import type { RazorpayPaymentType } from "./type.js";
import { RentalAgreement, RentalOccupant } from "../rentals/model.js";
import notificationService from "../notifications/service.js";
import User from "../auth/model.js";
import { UserRole } from "../auth/type.js";

const MOCK_PAYMENTS_ENABLED =
    process.env.NODE_ENV !== "production" &&
    process.env.ALLOW_MOCK_PAYMENTS === "true";

const dueDateForMonth = (
    leaseStart: Date,
    billingMonth: string
): Date | null => {
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

const createGatewayOrder = async (input: {
    bookingId: string;
    userId: string;
    type: RazorpayPaymentType;
    amount: number;
    billingMonth?: string;
}) => {
    const booking = await Booking.findOne({
        _id: input.bookingId,
        userId: input.userId,
    }).exec();

    if (!booking) throw new AppError(404, "Booking not found");

    const rental = await paymentRepository.findRentalByBooking(
        booking._id.toString()
    );

    const occupant = rental
        ? await RentalOccupant.findOne({
              rental: rental._id,
              tenant: input.userId,
              status: { $nin: ["TERMINATED", "LEFT"] },
          }).exec()
        : null;

    let payAmount = input.amount;

    if (input.type === "ADVANCE") {
        if (
            booking.status !== "APPROVED" ||
            booking.paymentStatus !== "ADVANCE_PAYMENT_PENDING"
        ) {
            throw new AppError(
                409,
                "Advance payment is unavailable for this booking"
            );
        }

        if (!rental) {
            throw new AppError(
                409,
                "Rental must be created before advance payment"
            );
        }

        const agreement = await RentalAgreement.findOne({
            rental: rental._id,
            tenant: input.userId,
        }).exec();

        if (!agreement) {
            throw new AppError(409, "Rental agreement not found");
        }

        if (agreement.status !== "APPROVED_PENDING_PAYMENT") {
            throw new AppError(
                409,
                "Both parties must approve the rental agreement before advance payment"
            );
        }

        const now = new Date();

        if (!agreement.paymentDeadline || now >= agreement.paymentDeadline) {
            agreement.status = "EXPIRED";
            await agreement.save();

            throw new AppError(
                409,
                "The agreement payment deadline has expired. Contact the property owner."
            );
        }

        // Use the server-side booking amount, not a client-supplied amount.
        payAmount = booking.advanceAmount;
    } else {
        if (!["CONFIRMED", "ACTIVE"].includes(booking.status)) {
            throw new AppError(
                409,
                "Monthly rent is available after the advance payment is confirmed"
            );
        }

        if (booking.endDate < new Date()) {
            throw new AppError(409, "Rental period has ended");
        }

        if (!input.billingMonth) {
            throw new AppError(400, "Billing month is required");
        }

        const dueDate = dueDateForMonth(booking.startDate, input.billingMonth);

        if (!dueDate) {
            throw new AppError(400, "Invalid billing month for this lease");
        }

        const now = new Date();
        const currentMonthStr = `${now.getUTCFullYear()}-${String(
            now.getUTCMonth() + 1
        ).padStart(2, "0")}`;

        const fifteenDaysAhead = new Date(
            now.getTime() + 15 * 24 * 60 * 60 * 1000
        );

        const existingForCycle = await paymentRepository.findForCycle(
            booking._id.toString(),
            input.type,
            input.billingMonth,
            input.userId
        );

        if (
            input.billingMonth > currentMonthStr &&
            dueDate > fifteenDaysAhead &&
            !existingForCycle
        ) {
            throw new AppError(409, "This rent installment is not due yet");
        }

        if (occupant) {
            payAmount = occupant.rentAmount;
        }
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

    if (existing?.status === "PAID") {
        throw new AppError(409, "This billing item has already been paid");
    }

    const client = getRazorpayClient();

    type GatewayOrder = {
        id: string;
        amount: string | number;
        currency: string;
        status: string;
    };

    let order: GatewayOrder | null = null;

    if (existing?.status === "PENDING" && existing.razorpayOrderId) {
        order = (await client.orders
            .fetch(existing.razorpayOrderId)
            .catch(() => null)) as unknown as GatewayOrder | null;
    }

    if (order?.status === "paid") {
        throw new AppError(
            409,
            "Payment is being confirmed; refresh the booking shortly"
        );
    }

    if (order && !["created", "attempted"].includes(order.status)) {
        order = null;
    }

    if (!order) {
        const receiptMonth = input.billingMonth?.replace("-", "") ?? "advance";

        try {
            const createdOrder = await client.orders.create({
                amount: amountInPaise,
                currency: "INR",
                receipt: `sn_${booking._id.toString().slice(-10)}_${
                    input.type === "ADVANCE" ? "adv" : receiptMonth
                }_${Date.now()}`,
            });

            order = createdOrder as unknown as GatewayOrder;
        } catch (err: unknown) {
            const errObj = err as {
                statusCode?: number;
                error?: { description?: string; code?: string };
                message?: string;
            };

            const isAuthError =
                errObj?.statusCode === 401 ||
                errObj?.error?.code === "BAD_REQUEST_ERROR" ||
                Boolean(
                    errObj?.error?.description?.includes(
                        "Authentication failed"
                    )
                );

            if (isAuthError && MOCK_PAYMENTS_ENABLED) {
                console.warn(
                    "[RAZORPAY_DEV_MODE] Using explicitly enabled development mock payment."
                );

                order = {
                    id: `order_mock_${Date.now()}`,
                    amount: amountInPaise,
                    currency: "INR",
                    status: "created",
                };
            } else {
                throw new AppError(
                    400,
                    errObj?.error?.description ||
                        errObj?.message ||
                        "Failed to create payment order"
                );
            }
        }
    }

    if (!order) {
        throw new AppError(500, "Failed to create payment order with gateway");
    }

    const dueDate = input.billingMonth
        ? dueDateForMonth(booking.startDate, input.billingMonth)
        : undefined;

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

    return {
        orderId: order.id,
        amount: Number(order.amount),
        currency: order.currency,
        keyId: process.env.RAZORPAY_KEY_ID || "",
    };
};

const notifyPaymentSuccess = async (
    booking: {
        _id: { toString(): string };
        userId: { toString(): string };
        ownerId: { toString(): string };
    },
    payment: { type: string; amount: number; billingMonth?: string }
) => {
    try {
        const isAdvance = payment.type === "ADVANCE";

        const titleTenant = isAdvance
            ? "Advance Payment Received"
            : "Rent Payment Successful";

        const msgTenant = isAdvance
            ? `Your advance payment of ₹${payment.amount.toLocaleString(
                  "en-IN"
              )} was received. Rental activation depends on agreement and payment validation.`
            : `Your rent payment of ₹${payment.amount.toLocaleString(
                  "en-IN"
              )} for ${payment.billingMonth} was received successfully.`;

        const titleOwner = isAdvance
            ? "Advance Payment Received"
            : "Rent Payment Received";

        const msgOwner = isAdvance
            ? `Advance payment of ₹${payment.amount.toLocaleString(
                  "en-IN"
              )} was received for your property booking.`
            : `Rent payment of ₹${payment.amount.toLocaleString(
                  "en-IN"
              )} for ${payment.billingMonth} was received from your tenant.`;

        await Promise.allSettled([
            notificationService.createNotification({
                recipient: booking.userId.toString(),
                title: titleTenant,
                message: msgTenant,
                type: "system",
                referenceId: booking._id.toString(),
                referenceType: "booking",
            }),
            notificationService.createNotification({
                recipient: booking.ownerId.toString(),
                title: titleOwner,
                message: msgOwner,
                type: "system",
                referenceId: booking._id.toString(),
                referenceType: "booking",
            }),
        ]);
    } catch (error) {
        console.warn("[PAYMENT_NOTIFICATION_ERROR]", error);
    }
};

const notifyLateAdvancePayment = async (
    booking: {
        _id: { toString(): string };
        userId: { toString(): string };
        ownerId: { toString(): string };
    }
) => {
    await Promise.allSettled([
        notificationService.createNotification({
            recipient: booking.userId.toString(),
            title: "Advance received — agreement expired",
            message:
                "Your payment was captured, but the agreement deadline had expired. The rental was not activated. Please contact support for refund or manual resolution.",
            type: "system",
            referenceId: booking._id.toString(),
            referenceType: "booking",
        }),
        notificationService.createNotification({
            recipient: booking.ownerId.toString(),
            title: "Advance received — review required",
            message:
                "An advance payment was captured after the agreement deadline. The rental was not activated. Review the payment for refund or manual resolution.",
            type: "system",
            referenceId: booking._id.toString(),
            referenceType: "booking",
        }),
    ]);
};

const areAllCurrentOccupantsReady = async (
    rentalId: string
): Promise<boolean> => {
    const occupants = await RentalOccupant.find({
        rental: rentalId,
        status: { $nin: ["TERMINATED", "LEFT"] },
    })
        .select("_id tenant status")
        .lean();

    if (occupants.length === 0) {
        return false;
    }

    for (const occupant of occupants) {
        if (occupant.status !== "ACTIVE") {
            return false;
        }

        const agreement = await RentalAgreement.findOne({
            rental: rentalId,
            tenant: occupant.tenant,
        })
            .select("status advancePaidAt")
            .lean();

        if (
            !agreement ||
            agreement.status !== "ACTIVE" ||
            !agreement.advancePaidAt
        ) {
            return false;
        }

        const paidAdvance = await Payment.exists({
            rental: rentalId,
            tenant: occupant.tenant,
            type: "ADVANCE",
            status: "PAID",
        });

        if (!paidAdvance) {
            return false;
        }
    }

    return true;
};

const confirmAdvanceRental = async (bookingId: string) => {
    const booking = await Booking.findById(bookingId).exec();

    if (!booking) throw new AppError(404, "Booking not found");

    const rental = await Rental.findOne({ booking: booking._id }).exec();

    if (!rental) {
        return { booking, activated: false, expired: false };
    }

    const agreement = await RentalAgreement.findOne({
        rental: rental._id,
        tenant: booking.userId,
    }).exec();

    if (!agreement) {
        return { booking, activated: false, expired: false };
    }

    const paidAdvance = await Payment.findOne({
        rental: rental._id,
        tenant: booking.userId,
        type: "ADVANCE",
        status: "PAID",
    })
        .sort({ paidAt: -1 })
        .exec();

    if (!paidAdvance) {
        return {
            booking,
            activated: false,
            expired: agreement.status === "EXPIRED",
        };
    }

    if (agreement.status === "EXPIRED") {
        return { booking, activated: false, expired: true };
    }

    const now = new Date();

    if (agreement.status === "APPROVED_PENDING_PAYMENT") {
        const verifiedPaidAt = paidAdvance.paidAt;

        if (
            !agreement.paymentDeadline ||
            !verifiedPaidAt ||
            verifiedPaidAt >= agreement.paymentDeadline
        ) {
            agreement.status = "EXPIRED";
            await agreement.save();

            return { booking, activated: false, expired: true };
        }

        const occupant = await RentalOccupant.findById(
            agreement.occupant
        ).exec();

        if (
            !occupant ||
            occupant.status === "TERMINATED" ||
            occupant.status === "LEFT"
        ) {
            return { booking, activated: false, expired: false };
        }

        agreement.status = "ACTIVE";
        agreement.advancePaidAt = verifiedPaidAt;
        await agreement.save();

        occupant.status = "ACTIVE";
        await occupant.save();
    } else if (agreement.status !== "ACTIVE") {
        return { booking, activated: false, expired: false };
    }

    const allOccupantsReady = await areAllCurrentOccupantsReady(
        rental._id.toString()
    );

    booking.paymentStatus = "PAID";

    if (allOccupantsReady) {
        const rentalStatus =
            rental.leaseStart <= now ? "active" : "scheduled";

        rental.status = rentalStatus;
        await rental.save();

        booking.status =
            rentalStatus === "active" ? "ACTIVE" : "CONFIRMED";

        booking.confirmedAt ??= now;
    }

    await booking.save();

    await User.updateOne(
        { _id: booking.userId, role: UserRole.USER },
        { $set: { role: UserRole.TENANT } }
    ).exec();

    return {
        booking,
        activated: allOccupantsReady,
        expired: false,
    };
};

const verifyPayment = async (
    payload: VerifyPaymentInput,
    userId: string
) => {
    const booking = await Booking.findOne({
        _id: payload.bookingId,
        userId,
    }).exec();

    if (!booking) throw new AppError(404, "Booking not found");

    const payment = await paymentRepository.findForCycle(
        booking._id.toString(),
        payload.type,
        payload.type === "MONTHLY_RENT" ? payload.billingMonth : undefined,
        userId
    );

    if (!payment) throw new AppError(404, "Payment record not found");

    if (payment.razorpayOrderId !== payload.razorpay_order_id) {
        throw new AppError(
            400,
            "Payment order does not match this booking payment"
        );
    }

    if (
        payment.status === "PAID" &&
        payment.razorpayPaymentId === payload.razorpay_payment_id
    ) {
        if (payload.type === "ADVANCE") {
            const result = await confirmAdvanceRental(booking._id.toString());

            if (result.expired) {
                await notifyLateAdvancePayment(booking);
            }

            return {
                bookingId: booking._id.toString(),
                paymentStatus: "PAID",
                bookingStatus: result.booking.status,
                rentalActivated: result.activated,
                agreementExpired: result.expired,
            };
        }

        return {
            bookingId: booking._id.toString(),
            paymentStatus: "PAID",
            bookingStatus: booking.status,
        };
    }

    if (payload.razorpay_order_id.startsWith("order_mock_")) {
        if (!MOCK_PAYMENTS_ENABLED) {
            throw new AppError(
                403,
                "Mock payments are disabled. Use a valid Razorpay payment."
            );
        }

        payment.status = "PAID";
        payment.razorpayPaymentId =
            payload.razorpay_payment_id || `pay_mock_${Date.now()}`;
        payment.paidAt = new Date();
        payment.referenceId = payment.razorpayPaymentId;

        await payment.save();

        if (payload.type === "ADVANCE") {
            const result = await confirmAdvanceRental(booking._id.toString());

            if (result.expired) {
                await notifyLateAdvancePayment(booking);
            } else {
                await notifyPaymentSuccess(booking, payment);
            }

            return {
                bookingId: booking._id.toString(),
                paymentStatus: "PAID",
                bookingStatus: result.booking.status,
                rentalActivated: result.activated,
                agreementExpired: result.expired,
            };
        }

        await notifyPaymentSuccess(booking, payment);

        return {
            bookingId: booking._id.toString(),
            paymentStatus: "PAID",
            bookingStatus: booking.status,
        };
    }

    if (
        !verifyRazorpaySignature(
            payload.razorpay_order_id,
            payload.razorpay_payment_id,
            payload.razorpay_signature
        )
    ) {
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
    ) {
        throw new AppError(
            400,
            "Razorpay order details do not match this payment"
        );
    }

    if (gatewayPayment.status !== "captured") {
        throw new AppError(409, "Payment has not been captured yet");
    }

    payment.status = "PAID";
    payment.razorpayPaymentId = payload.razorpay_payment_id;
    payment.paidAt = new Date(gatewayPayment.created_at * 1000);
    payment.referenceId = payload.razorpay_payment_id;

    await payment.save();

    if (payload.type === "ADVANCE") {
        const result = await confirmAdvanceRental(booking._id.toString());

        if (result.expired) {
            await notifyLateAdvancePayment(booking);
        } else {
            await notifyPaymentSuccess(booking, payment);
        }

        return {
            bookingId: booking._id.toString(),
            paymentStatus: "PAID",
            bookingStatus: result.booking.status,
            rentalActivated: result.activated,
            agreementExpired: result.expired,
        };
    }

    await notifyPaymentSuccess(booking, payment);

    return {
        bookingId: booking._id.toString(),
        paymentStatus: "PAID",
        bookingStatus: booking.status,
    };
};

const handleWebhook = async (event: {
    event?: string;
    created_at?: number;
    payload?: {
        payment?: {
            entity?: {
                id?: string;
                order_id?: string;
                amount?: number;
                currency?: string;
                status?: string;
                created_at?: number;
            };
        };
    };
}) => {
    const paymentEntity = event.payload?.payment?.entity;

    if (!paymentEntity) {
        return;
    }

    const orderId = paymentEntity.order_id;
    const paymentId = paymentEntity.id;

    const paymentRecord =
        (orderId && (await paymentRepository.findByOrderId(orderId))) ||
        (paymentId && (await paymentRepository.findByPaymentId(paymentId))) ||
        null;

    if (!paymentRecord) {
        return;
    }

    if (event.event === "payment.failed") {
        paymentRecord.status = "FAILED";
        await paymentRecord.save();
        return;
    }

    if (event.event !== "payment.captured") {
        return;
    }

    if (!paymentId) {
        return;
    }

    if (
        paymentRecord.status === "PAID" &&
        paymentRecord.razorpayPaymentId === paymentId
    ) {
        return;
    }

    paymentRecord.status = "PAID";
    paymentRecord.razorpayPaymentId = paymentId;
    paymentRecord.paidAt = new Date(
        (paymentEntity.created_at ?? event.created_at ?? Math.floor(Date.now() / 1000)) * 1000
    );
    paymentRecord.referenceId = paymentId;

    await paymentRecord.save();

    const booking = await Booking.findById(paymentRecord.booking).exec();

    if (!booking) {
        return;
    }

    if (paymentRecord.type === "ADVANCE") {
        const result = await confirmAdvanceRental(booking._id.toString());

        if (result.expired) {
            await notifyLateAdvancePayment(booking);
        } else {
            await notifyPaymentSuccess(booking, paymentRecord);
        }

        return;
    }

    await notifyPaymentSuccess(booking, paymentRecord);
};

const ensureMonthlyRentPayments = async (rentalId: string) => {
    const rental = await Rental.findById(rentalId).exec();

    if (!rental?.booking || rental.status !== "active") return;

    const booking = await Booking.findById(rental.booking).exec();

    if (!booking) return;

    const now = new Date();

    const cursor = new Date(
        Date.UTC(
            rental.leaseStart.getUTCFullYear(),
            rental.leaseStart.getUTCMonth(),
            1
        )
    );

    const endMonth = new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)
    );

    while (cursor <= endMonth) {
        const billingMonth = `${cursor.getUTCFullYear()}-${String(
            cursor.getUTCMonth() + 1
        ).padStart(2, "0")}`;

        const dueDate = dueDateForMonth(rental.leaseStart, billingMonth);

        if (dueDate && dueDate <= now && dueDate <= rental.leaseEnd) {
            await Payment.updateOne(
                {
                    booking: booking._id,
                    type: "MONTHLY_RENT",
                    billingMonth,
                },
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
    createAdvanceOrder: async (bookingId: string, userId: string) => {
        const booking = await Booking.findOne({
            _id: bookingId,
            userId,
        }).exec();

        if (!booking) throw new AppError(404, "Booking not found");

        return createGatewayOrder({
            bookingId,
            userId,
            type: "ADVANCE",
            amount: booking.advanceAmount,
        });
    },

    createMonthlyRentOrder: async (
        bookingId: string,
        billingMonth: string,
        userId: string
    ) => {
        const booking = await Booking.findOne({
            _id: bookingId,
            userId,
        }).exec();

        if (!booking) throw new AppError(404, "Booking not found");

        return createGatewayOrder({
            bookingId,
            userId,
            type: "MONTHLY_RENT",
            amount: booking.monthlyRent,
            billingMonth,
        });
    },

    verifyPayment,
    handleWebhook,
    ensureMonthlyRentPayments,
};