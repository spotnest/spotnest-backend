import { Types } from "mongoose";

import Booking from "../bookings/model.js";
import { Payment, Rental } from "../dashboard/tenantDashboard/model.js";
import notificationService from "../notifications/service.js";
import { emitDashboardUpdate } from "../../shared/socket/index.js";
import {
    RentalAgreement,
    RentalOccupant,
} from "./model.js";

import type { IRental } from "../dashboard/tenantDashboard/type.js";

const SCHEDULER_INTERVAL_MS = 6 * 60 * 60 * 1000;
const AGREEMENT_EXPIRY_INTERVAL_MS = 10 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

type ReminderStage =
    | "7_DAYS"
    | "3_DAYS"
    | "DUE_TODAY"
    | "OVERDUE";

interface ReminderDetails {
    stage: ReminderStage;
    title: string;
    message: string;
}

let schedulerInterval: NodeJS.Timeout | null = null;
let expiryCheckInterval: NodeJS.Timeout | null = null;
let schedulerRunning = false;
let expiryCheckRunning = false;

// ============================================================
// DATE HELPERS
// ============================================================

const startOfUtcDay = (date: Date): Date =>
    new Date(
        Date.UTC(
            date.getUTCFullYear(),
            date.getUTCMonth(),
            date.getUTCDate()
        )
    );

const getBillingMonth = (date: Date): string =>
    `${date.getUTCFullYear()}-${String(
        date.getUTCMonth() + 1
    ).padStart(2, "0")}`;

const formatInr = (amount: number): string =>
    `₹${amount.toLocaleString("en-IN")}`;

const isDuplicateKeyError = (error: unknown): boolean =>
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000;

/**
 * Uses the lease-start day as the monthly rent due day.
 * For short months, clamps the day to the month's last day.
 */
const dueDateForMonth = (
    leaseStart: Date,
    billingMonth: string
): Date | null => {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(billingMonth)) {
        return null;
    }

    const [yearText, monthText] = billingMonth.split("-");
    const year = Number(yearText);
    const monthIndex = Number(monthText) - 1;

    const lastDay = new Date(
        Date.UTC(year, monthIndex + 1, 0)
    ).getUTCDate();

    const day = Math.min(
        leaseStart.getUTCDate(),
        lastDay
    );

    return new Date(
        Date.UTC(year, monthIndex, day)
    );
};

// ============================================================
// NOTIFICATION HELPERS
// ============================================================

const getReminderDetails = (
    amount: number,
    billingMonth: string,
    diffDays: number,
    paymentStatus: string
): ReminderDetails | null => {
    const formattedAmount = amount.toLocaleString("en-IN");

    if (diffDays === 7) {
        return {
            stage: "7_DAYS",
            title: "Rent Reminder: Due in 7 days",
            message:
                `Your monthly rent of ₹${formattedAmount} ` +
                `for ${billingMonth} is due in 7 days.`,
        };
    }

    if (diffDays === 3) {
        return {
            stage: "3_DAYS",
            title: "Rent Reminder: Due in 3 days",
            message:
                `Your monthly rent of ₹${formattedAmount} ` +
                `for ${billingMonth} is due in 3 days.`,
        };
    }

    if (diffDays === 0) {
        return {
            stage: "DUE_TODAY",
            title: "Rent Reminder: Due Today",
            message:
                `Your monthly rent of ₹${formattedAmount} ` +
                `for ${billingMonth} is due today.`,
        };
    }

    if (
        diffDays < 0 &&
        paymentStatus === "OVERDUE"
    ) {
        return {
            stage: "OVERDUE",
            title: "Rent Overdue Alert",
            message:
                `Your monthly rent of ₹${formattedAmount} ` +
                `for ${billingMonth} is overdue. ` +
                "Please make your payment promptly.",
        };
    }

    return null;
};

const rentalTenantIds = async (
    rental: IRental
): Promise<string[]> => {
    const occupants = await RentalOccupant.find({
        rental: rental._id,
    })
        .select("tenant")
        .lean();

    return [
        ...new Set([
            rental.tenant.toString(),
            ...occupants.map((occupant) =>
                occupant.tenant.toString()
            ),
        ]),
    ];
};

/**
 * Notifies all tenants and the owner when a rental starts or ends.
 * The notification service must enforce dedupeKey atomically
 * for reliable duplicate protection across multiple processes.
 */
const notifyRentalLifecycle = async (
    rental: IRental,
    event: "started" | "ended",
    tenantIds: string[]
): Promise<void> => {
    const rentalId = rental._id.toString();

    const data = {
        rentalId,
        propertyId: rental.property.toString(),
    };

    const started = event === "started";

    const tenantMessage = started
        ? "Your lease has started and your rental is now active."
        : "Your lease period has ended and the rental is now closed.";

    const ownerMessage = started
        ? "A scheduled rental for your property is now active."
        : "A rental for your property has reached its lease end date and is now closed.";

    await Promise.all([
        ...tenantIds.map((tenantId) =>
            notificationService.notify({
                recipient: tenantId,
                title: started
                    ? "Lease started"
                    : "Lease ended",
                message: tenantMessage,
                type: "rental_status",
                referenceId: rentalId,
                referenceType: "rental",
                data,
                dedupeKey: `rental-${event}:${rentalId}`,
            })
        ),

        notificationService.notify({
            recipient: rental.owner.toString(),
            title: started
                ? "Rental started"
                : "Rental ended",
            message: ownerMessage,
            type: "rental_status",
            referenceId: rentalId,
            referenceType: "rental",
            data,
            dedupeKey: `rental-${event}:${rentalId}`,
        }),
    ]);

    emitDashboardUpdate(
        {
            userIds: [
                rental.owner,
                ...tenantIds,
            ],
            admins: true,
        },
        "rental",
        "status_changed",
        rental._id
    );
};

// ============================================================
// LEGACY OCCUPANT COMPATIBILITY
// ============================================================

/**
 * Creates a legacy occupant only for older active rentals.
 */
const ensureLegacyOccupant = async (
    rental: {
        _id: Types.ObjectId;
        tenant?: Types.ObjectId;
        monthlyRent: number;
        securityDeposit: number;
        leaseStart: Date;
    }
): Promise<void> => {
    if (!rental.tenant) {
        return;
    }

    const existingOccupant = await RentalOccupant.findOne({
        rental: rental._id,
    })
        .select("_id")
        .lean();

    if (existingOccupant) {
        return;
    }

    try {
        await RentalOccupant.create({
            rental: rental._id,
            tenant: rental.tenant,
            rentAmount: rental.monthlyRent,
            securityDepositShare: rental.securityDeposit,
            status: "ACTIVE",
            joinedAt: rental.leaseStart,
        });
    } catch (error) {
        if (!isDuplicateKeyError(error)) {
            throw error;
        }
    }
};

// ============================================================
// MONTHLY PAYMENT GENERATION
// ============================================================

/**
 * Generates one monthly payment per eligible occupant and billing
 * month. A unique database index is required to prevent duplicate
 * payments during concurrent scheduler runs.
 */
const generateMonthlyPayments = async (
    rental: {
        _id: Types.ObjectId;
        booking?: Types.ObjectId;
        property: Types.ObjectId;
        owner: Types.ObjectId;
        leaseStart: Date;
        leaseEnd: Date;
    },
    occupants: Array<{
        _id: unknown;
        tenant: unknown;
        rentAmount: number;
        status: string;
        joinedAt?: Date;
        leftAt?: Date;
    }>,
    today: Date
): Promise<void> => {
    const leaseStartDay = startOfUtcDay(
        rental.leaseStart
    );

    const leaseEndDay = startOfUtcDay(
        rental.leaseEnd
    );

    if (
        leaseStartDay > today ||
        leaseEndDay < leaseStartDay
    ) {
        return;
    }

    const cursor = new Date(
        Date.UTC(
            rental.leaseStart.getUTCFullYear(),
            rental.leaseStart.getUTCMonth(),
            1
        )
    );

    const endMonth = new Date(
        Date.UTC(
            today.getUTCFullYear(),
            today.getUTCMonth(),
            1
        )
    );

    while (cursor <= endMonth) {
        const billingMonth = getBillingMonth(cursor);

        const dueDate = dueDateForMonth(
            rental.leaseStart,
            billingMonth
        );

        if (
            dueDate &&
            startOfUtcDay(dueDate) >= leaseStartDay &&
            startOfUtcDay(dueDate) <= leaseEndDay
        ) {
            for (const occupant of occupants) {
                if (occupant.status !== "ACTIVE") {
                    continue;
                }

                if (
                    occupant.joinedAt &&
                    startOfUtcDay(occupant.joinedAt) >
                    startOfUtcDay(dueDate)
                ) {
                    continue;
                }

                if (
                    occupant.leftAt &&
                    startOfUtcDay(occupant.leftAt) <
                    startOfUtcDay(dueDate)
                ) {
                    continue;
                }

                try {
                    await Payment.findOneAndUpdate(
                        {
                            rental: rental._id,
                            occupant: new Types.ObjectId(
                                String(occupant._id)
                            ),
                            type: "MONTHLY_RENT",
                            billingMonth,
                        },
                        {
                            $setOnInsert: {
                                ...(rental.booking
                                    ? {
                                        booking: rental.booking,
                                    }
                                    : {}),
                                rental: rental._id,
                                occupant: occupant._id,
                                tenant: occupant.tenant,
                                owner: rental.owner,
                                property: rental.property,
                                type: "MONTHLY_RENT",
                                amount: occupant.rentAmount,
                                currency: "INR",
                                status: "PENDING",
                                billingMonth,
                                dueDate,
                                lateFee: 0,
                            },
                        },
                        {
                            upsert: true,
                            returnDocument: "after",
                            setDefaultsOnInsert: true,
                        }
                    );
                } catch (error) {
                    if (!isDuplicateKeyError(error)) {
                        throw error;
                    }
                }
            }
        }

        cursor.setUTCMonth(
            cursor.getUTCMonth() + 1
        );
    }
};

// ============================================================
// AGREEMENT EXPIRATION
// ============================================================

/**
 * Expires approved agreements when their payment deadline passes.
 * An expired agreement must never activate its rental.
 */
export const expireUnpaidAgreements = async (
    now: Date = new Date()
): Promise<number> => {
    const overdueAgreements = await RentalAgreement.find({
        status: "APPROVED_PENDING_PAYMENT",
        paymentDeadline: {
            $lte: now,
        },
    })
        .select("_id rental")
        .lean();

    if (overdueAgreements.length === 0) {
        return 0;
    }

    const overdueIds = overdueAgreements.map(
        (agreement) => agreement._id
    );

    const updateResult = await RentalAgreement.updateMany(
        {
            _id: {
                $in: overdueIds,
            },
            status: "APPROVED_PENDING_PAYMENT",
        },
        {
            $set: {
                status: "EXPIRED",
            },
        }
    );

    for (const agreement of overdueAgreements) {
        const rental = await Rental.findById(
            agreement.rental
        )
            .select("booking")
            .lean();

        if (rental?.booking) {
            await Booking.updateOne(
                {
                    _id: rental.booking,
                    status: "APPROVED",
                },
                {
                    $set: {
                        status: "EXPIRED",
                    },
                }
            );
        }
    }

    return updateResult.modifiedCount;
};

// ============================================================
// SCHEDULED RENTAL ACTIVATION
// ============================================================

/**
 * Activates a scheduled rental only when every current occupant:
 * - has ACTIVE status;
 * - has an ACTIVE agreement;
 * - has an advancePaidAt timestamp;
 * - has a PAID advance payment.
 */
const activateEligibleScheduledRentals = async (
    today: Date,
    tomorrow: Date
): Promise<void> => {
    const scheduledRentals = await Rental.find({
        status: "scheduled",
        leaseStart: {
            $lt: tomorrow,
        },
        leaseEnd: {
            $gte: today,
        },
    })
        .select("_id booking")
        .lean();

    for (const rental of scheduledRentals) {
        const occupants = await RentalOccupant.find({
            rental: rental._id,
            status: {
                $nin: ["TERMINATED", "LEFT"],
            },
        })
            .select("_id tenant status")
            .lean();

        if (occupants.length === 0) {
            continue;
        }

        let allEligible = true;

        for (const occupant of occupants) {
            if (occupant.status !== "ACTIVE") {
                allEligible = false;
                break;
            }

            const agreement = await RentalAgreement.findOne({
                rental: rental._id,
                tenant: occupant.tenant,
            })
                .select("_id status advancePaidAt")
                .lean();

            if (
                !agreement ||
                agreement.status !== "ACTIVE" ||
                !agreement.advancePaidAt
            ) {
                allEligible = false;
                break;
            }

            const paidAdvance = await Payment.exists({
                rental: rental._id,
                tenant: occupant.tenant,
                type: "ADVANCE",
                status: "PAID",
            });

            if (!paidAdvance) {
                allEligible = false;
                break;
            }
        }

        if (!allEligible) {
            continue;
        }

        const activation = await Rental.updateOne(
            {
                _id: rental._id,
                status: "scheduled",
                leaseStart: {
                    $lt: tomorrow,
                },
                leaseEnd: {
                    $gte: today,
                },
            },
            {
                $set: {
                    status: "active",
                },
            }
        );

        // Another scheduler or request may have changed the state.
        if (activation.modifiedCount === 0) {
            continue;
        }

        if (rental.booking) {
            await Booking.updateOne(
                {
                    _id: rental.booking,
                    status: {
                        $in: ["CONFIRMED", "APPROVED"],
                    },
                },
                {
                    $set: {
                        status: "ACTIVE",
                    },
                }
            );
        }

        const fullRental = await Rental.findById(
            rental._id
        ).lean();

        if (fullRental) {
            const tenantIds = await rentalTenantIds(
                fullRental as unknown as IRental
            );

            await notifyRentalLifecycle(
                fullRental as unknown as IRental,
                "started",
                tenantIds
            );
        }
    }
};

// ============================================================
// OVERDUE PAYMENTS
// ============================================================

/**
 * Changes overdue monthly rent from PENDING to OVERDUE.
 * Notifications and dashboard updates happen only when the
 * conditional update actually changes the payment.
 */
const processOverduePayments = async (
    today: Date
): Promise<void> => {
    const payments = await Payment.find({
        type: "MONTHLY_RENT",
        status: "PENDING",
        dueDate: {
            $lt: today,
        },
    }).lean();

    for (const payment of payments) {
        const transition = await Payment.updateOne(
            {
                _id: payment._id,
                status: "PENDING",
            },
            {
                $set: {
                    status: "OVERDUE",
                },
            }
        );

        if (transition.modifiedCount === 0) {
            continue;
        }

        if (payment.owner) {
            await notificationService.notify({
                recipient: payment.owner.toString(),
                title: "Rent overdue",
                message:
                    `Rent of ${formatInr(payment.amount)} ` +
                    `for ${payment.billingMonth} is overdue.`,
                type: "rent_due",
                referenceId: payment._id.toString(),
                referenceType: "payment",
                data: {
                    paymentId: payment._id.toString(),
                    ...(payment.rental
                        ? {
                            rentalId: payment.rental.toString(),
                        }
                        : {}),
                },
                dedupeKey:
                    `rent-overdue-owner:${payment._id.toString()}`,
            });
        }

        emitDashboardUpdate(
            {
                userIds: [
                    payment.tenant,
                    ...(payment.owner ? [payment.owner] : []),
                ],
                admins: true,
            },
            "payment",
            "overdue",
            payment._id
        );
    }
};

// ============================================================
// RENT REMINDERS
// ============================================================

/**
 * Sends tenant reminders at 7 days, 3 days, on the due date,
 * and daily after the payment becomes overdue.
 */
const processRentReminders = async (
    today: Date
): Promise<void> => {
    const payments = await Payment.find({
        type: "MONTHLY_RENT",
        status: {
            $in: ["PENDING", "OVERDUE", "DUE"],
        },
        dueDate: {
            $exists: true,
            $ne: null,
        },
    })
        .select(
            "_id tenant amount billingMonth dueDate status rental booking"
        )
        .lean();

    for (const payment of payments) {
        if (
            !payment.dueDate ||
            !payment.billingMonth
        ) {
            continue;
        }

        const dueDay = startOfUtcDay(
            new Date(payment.dueDate)
        );

        const diffDays = Math.round(
            (dueDay.getTime() - today.getTime()) /
            DAY_MS
        );

        const details = getReminderDetails(
            payment.amount,
            payment.billingMonth,
            diffDays,
            payment.status
        );

        if (!details) {
            continue;
        }

        const dayKey = today
            .toISOString()
            .slice(0, 10);

        const dedupeKey =
            details.stage === "OVERDUE"
                ? `rent-reminder:${payment._id.toString()}:overdue:${dayKey}`
                : `rent-reminder:${payment._id.toString()}:${details.stage}`;

        try {
            await notificationService.notify({
                recipient: payment.tenant.toString(),
                title: details.title,
                message: details.message,
                type: "rent_due",
                referenceId: payment._id.toString(),
                referenceType: "payment",
                data: {
                    paymentId: payment._id.toString(),
                    ...(payment.rental
                        ? {
                            rentalId: payment.rental.toString(),
                        }
                        : {}),
                    ...(payment.booking
                        ? {
                            bookingId: payment.booking.toString(),
                        }
                        : {}),
                },
                dedupeKey,
            });
        } catch (error) {
            console.error(
                `Failed rent reminder for payment ${payment._id}:`,
                error
            );
        }
    }
};

// ============================================================
// MAIN RENTAL SCHEDULER
// ============================================================

export const runRentalScheduler = async (): Promise<void> => {
    // Prevent overlapping executions in this Node.js process.
    if (schedulerRunning) {
        return;
    }

    schedulerRunning = true;

    try {
        const now = new Date();
        const today = startOfUtcDay(now);

        const tomorrow = new Date(
            today.getTime() + DAY_MS
        );

        // 1. Expire unpaid agreements.
        await expireUnpaidAgreements(now);

        // 2. End rentals whose lease-end day has passed.
        const expiredRentals = await Rental.find({
            status: {
                $in: ["scheduled", "active"],
            },
            leaseEnd: {
                $lt: today,
            },
        }).lean();

        for (const rental of expiredRentals) {
            const transition = await Rental.updateOne(
                {
                    _id: rental._id,
                    status: {
                        $in: ["scheduled", "active"],
                    },
                    leaseEnd: {
                        $lt: today,
                    },
                },
                {
                    $set: {
                        status: "ended",
                    },
                }
            );

            if (transition.modifiedCount === 0) {
                continue;
            }

            await RentalOccupant.updateMany(
                {
                    rental: rental._id,
                    status: {
                        $in: ["ACTIVE", "PENDING", "LEFT"],
                    },
                },
                {
                    $set: {
                        status: "TERMINATED",
                        leftAt: now,
                    },
                }
            );

            // Notify only the rental that actually transitioned.
            const tenantIds = await rentalTenantIds(
                rental as unknown as IRental
            );

            await notifyRentalLifecycle(
                rental as unknown as IRental,
                "ended",
                tenantIds
            );
        }

        // 3. Activate eligible scheduled rentals.
        await activateEligibleScheduledRentals(
            today,
            tomorrow
        );

        // 4. Generate monthly rent payments for active rentals.
        const activeRentals = await Rental.find({
            status: "active",
            leaseStart: {
                $lt: tomorrow,
            },
            leaseEnd: {
                $gte: today,
            },
        })
            .select(
                "_id booking property owner tenant monthlyRent " +
                "securityDeposit leaseStart leaseEnd"
            )
            .lean();

        for (const rental of activeRentals) {
            await ensureLegacyOccupant(rental);

            const occupants = await RentalOccupant.find({
                rental: rental._id,
                status: "ACTIVE",
            })
                .select(
                    "_id tenant rentAmount status joinedAt leftAt"
                )
                .lean();

            if (occupants.length === 0) {
                continue;
            }

            await generateMonthlyPayments(
                rental,
                occupants,
                today
            );
        }

        // 5. Process overdue payments.
        await processOverduePayments(today);

        // 6. Send rent reminders.
        await processRentReminders(today);
    } catch (error) {
        console.error(
            "Error running rental scheduler:",
            error
        );
    } finally {
        schedulerRunning = false;
    }
};

// ============================================================
// START / STOP SCHEDULER
// ============================================================

export const startRentalScheduler = (): void => {
    if (!schedulerInterval) {
        void runRentalScheduler();

        schedulerInterval = setInterval(() => {
            void runRentalScheduler();
        }, SCHEDULER_INTERVAL_MS);
    }

    if (!expiryCheckInterval) {
        expiryCheckInterval = setInterval(() => {
            if (expiryCheckRunning) {
                return;
            }

            expiryCheckRunning = true;

            void expireUnpaidAgreements()
                .catch((error) => {
                    console.error(
                        "Error expiring unpaid agreements:",
                        error
                    );
                })
                .finally(() => {
                    expiryCheckRunning = false;
                });
        }, AGREEMENT_EXPIRY_INTERVAL_MS);
    }
};

export const stopRentalScheduler = (): void => {
    if (schedulerInterval) {
        clearInterval(schedulerInterval);
        schedulerInterval = null;
    }

    if (expiryCheckInterval) {
        clearInterval(expiryCheckInterval);
        expiryCheckInterval = null;
    }
};