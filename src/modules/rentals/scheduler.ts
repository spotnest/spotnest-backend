import { Types } from "mongoose";
import { Payment, Rental } from "../dashboard/tenantDashboard/model.js";
import Notification from "../notifications/model.js";
import notificationService from "../notifications/service.js";
import { RentalOccupant } from "./model.js";

const SCHEDULER_INTERVAL_MS = 6 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

type ReminderStage = "7_DAYS" | "3_DAYS" | "DUE_TODAY" | "OVERDUE";

interface ReminderDetails {
    stage: ReminderStage;
    title: string;
    message: string;
}

let schedulerInterval: NodeJS.Timeout | null = null;
let schedulerRunning = false;

const startOfUtcDay = (date: Date): Date =>
    new Date(
        Date.UTC(
            date.getUTCFullYear(),
            date.getUTCMonth(),
            date.getUTCDate()
        )
    );

const endOfUtcDay = (date: Date): Date =>
    new Date(startOfUtcDay(date).getTime() + DAY_MS - 1);

const sameUtcCalendarDay = (a: Date, b: Date): boolean =>
    startOfUtcDay(a).getTime() === startOfUtcDay(b).getTime();

const getBillingMonth = (date: Date): string =>
    `${date.getUTCFullYear()}-${String(
        date.getUTCMonth() + 1
    ).padStart(2, "0")}`;

const isDuplicateKeyError = (error: unknown): boolean =>
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === 11000;

/**
 * Uses the lease-start day as the monthly due day.
 * For short months, clamps the day to that month's last day.
 *
 * Example: a lease starting on January 31 has a February
 * due date of February 28 or 29.
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

    const day = Math.min(leaseStart.getUTCDate(), lastDay);

    return new Date(Date.UTC(year, monthIndex, day));
};

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

    if (diffDays < 0 && paymentStatus === "OVERDUE") {
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

/**
 * Sends a reminder only if one with the same payment and
 * reminder title does not already exist.
 *
 * This prevents repeat reminders during normal sequential runs.
 * A unique database deduplication key is needed for a strict
 * cross-process guarantee; see the note below.
 */
const sendReminderOnce = async (
    payment: {
        _id: unknown;
        tenant: unknown;
        amount: number;
        billingMonth?: string;
    },
    details: ReminderDetails
): Promise<void> => {
    const recipientId = String(payment.tenant);
    const paymentId = String(payment._id);

    const alreadySent = await Notification.exists({
        recipient: recipientId,
        referenceId: paymentId,
        title: details.title,
    });

    if (alreadySent) {
        return;
    }

    await notificationService.createNotification({
        recipient: recipientId,
        title: details.title,
        message: details.message,
        type: "system",
        referenceId: paymentId,

        // The current notification schema does not support
        // "payment" as a referenceType. Keep "booking" for
        // compatibility until that schema is extended.
        referenceType: "booking",
    });
};

/**
 * Ensures old rentals have a primary occupant only when
 * no occupant records exist at all.
 *
 * A rental with pending, left, or terminated occupants must
 * not silently create a new active occupant.
 */
const ensureLegacyOccupant = async (rental: {
    _id: Types.ObjectId;
    tenant?: Types.ObjectId;
    monthlyRent: number;
    securityDeposit: number;
    leaseStart: Date;
}): Promise<void> => {
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

/**
 * Generates monthly payments using an atomic upsert.
 *
 * The Payment model must have its unique index:
 * rental + occupant + type + billingMonth.
 */
const generateMonthlyPayments = async (
rental: {
    _id: Types.ObjectId;
    booking?: Types.ObjectId;
    property: Types.ObjectId;
    owner: Types.ObjectId;
    monthlyRent: number;
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
    const leaseStartDay = startOfUtcDay(rental.leaseStart);
    const leaseEndDay = startOfUtcDay(rental.leaseEnd);

    if (leaseStartDay > today || leaseEndDay < leaseStartDay) {
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

                // Do not bill before this occupant joined.
                if (
                    occupant.joinedAt &&
                    startOfUtcDay(occupant.joinedAt) >
                        startOfUtcDay(dueDate)
                ) {
                    continue;
                }

                // Do not bill after the occupant left.
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
                            rental: new Types.ObjectId(
                                String(rental._id)
                            ),
                            occupant: new Types.ObjectId(
                                String(occupant._id)
                            ),
                            type: "MONTHLY_RENT",
                            billingMonth,
                        },
                        {
                            $setOnInsert: {
                                ...(rental.booking
                                    ? { booking: rental.booking }
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
                    // Safe only when the unique index exists
                    // and the duplicate is this payment key.
                    if (!isDuplicateKeyError(error)) {
                        throw error;
                    }
                }
            }
        }

        cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
};

export const runRentalScheduler = async (): Promise<void> => {
    // Prevent overlapping executions in the same process.
    if (schedulerRunning) {
        return;
    }

    schedulerRunning = true;

    try {
        const now = new Date();
        const today = startOfUtcDay(now);
        const tomorrow = new Date(today.getTime() + DAY_MS);

        // 1. End expired rentals first.
        // A lease remains valid through its leaseEnd calendar day.
        const expiredRentals = await Rental.find({
            status: { $in: ["scheduled", "active"] },
            leaseEnd: { $lt: today },
        })
            .select("_id")
            .lean();

        if (expiredRentals.length > 0) {
            const expiredRentalIds = expiredRentals.map(
                (rental) => rental._id
            );

            await Rental.updateMany(
                {
                    _id: { $in: expiredRentalIds },
                    status: { $in: ["scheduled", "active"] },
                },
                { $set: { status: "ended" } }
            );

            await RentalOccupant.updateMany(
                {
                    rental: { $in: expiredRentalIds },
                    status: { $in: ["ACTIVE", "PENDING", "LEFT"] },
                },
                {
                    $set: {
                        status: "TERMINATED",
                        leftAt: now,
                    },
                }
            );
        }

        // 2. Activate scheduled rentals on their lease-start day.
        await Rental.updateMany(
            {
                status: "scheduled",
                leaseStart: { $lt: tomorrow },
                leaseEnd: { $gte: today },
            },
            { $set: { status: "active" } }
        );

        // 3. Fetch active rentals with only required fields.
        const activeRentals = await Rental.find({
            status: "active",
            leaseStart: { $lt: tomorrow },
            leaseEnd: { $gte: today },
        })
            .select(
                "_id booking property owner tenant monthlyRent " +
                "securityDeposit leaseStart leaseEnd"
            )
            .lean();

        for (const rental of activeRentals) {
            // Backward compatibility for older records.
            await ensureLegacyOccupant(rental);

            // Only ACTIVE occupants may be billed.
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

        // 4. Mark overdue payments in one database operation.
        await Payment.updateMany(
            {
                type: "MONTHLY_RENT",
                status: "PENDING",
                dueDate: { $lt: today },
            },
            { $set: { status: "OVERDUE" } }
        );

        // 5. Find only unpaid monthly payments with a due date.
        const activePayments = await Payment.find({
            type: "MONTHLY_RENT",
            status: { $in: ["PENDING", "OVERDUE", "DUE"] },
            dueDate: { $exists: true, $ne: null },
        })
            .select(
                "_id tenant amount billingMonth dueDate status"
            )
            .lean();

        for (const payment of activePayments) {
            if (!payment.dueDate || !payment.billingMonth) {
                continue;
            }

            const dueDay = startOfUtcDay(
                new Date(payment.dueDate)
            );

            const diffDays = Math.round(
                (dueDay.getTime() - today.getTime()) / DAY_MS
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

            try {
                await sendReminderOnce(payment, details);
            } catch (error) {
                // One notification failure must not prevent
                // reminders for all remaining payments.
                console.error(
                    `Failed rent reminder for payment ${payment._id}:`,
                    error
                );
            }
        }
    } catch (error) {
        console.error("Error running rental scheduler:", error);
    } finally {
        schedulerRunning = false;
    }
};

export const startRentalScheduler = (): void => {
    if (schedulerInterval) {
        return;
    }

    void runRentalScheduler();

    schedulerInterval = setInterval(() => {
        void runRentalScheduler();
    }, SCHEDULER_INTERVAL_MS);
};

export const stopRentalScheduler = (): void => {
    if (!schedulerInterval) {
        return;
    }

    clearInterval(schedulerInterval);
    schedulerInterval = null;
};
