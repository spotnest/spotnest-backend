import { Payment, Rental } from "../dashboard/tenantDashboard/model.js";
import notificationService from "../notifications/service.js";
import { RentalOccupant } from "./model.js";

const SCHEDULER_INTERVAL_MS = 6 * 60 * 60 * 1000;

// ============================================================
// HELPERS
// ============================================================

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

    const dueDate = new Date(
        Date.UTC(year, monthIndex, day)
    );

    if (dueDate < leaseStart) {
        return null;
    }

    return dueDate;
};

// ============================================================
// RENTAL SCHEDULER
// ============================================================

export const runRentalScheduler = async (): Promise<void> => {
    try {
        const currentDate = new Date();

        const today = new Date(currentDate);
        today.setUTCHours(0, 0, 0, 0);

        // ====================================================
        // 1. ACTIVATE SCHEDULED RENTALS
        // ====================================================

        const dueScheduledRentals = await Rental.find({
            status: "scheduled",
            leaseStart: {
                $lte: currentDate,
            },
        });

        for (const rental of dueScheduledRentals) {
            rental.status = "active";
            await rental.save();
        }

        // ====================================================
        // 2. END EXPIRED RENTALS
        // ====================================================

        const expiredRentals = await Rental.find({
            status: {
                $in: ["scheduled", "active"],
            },
            leaseEnd: {
                $lt: currentDate,
            },
        });

        for (const rental of expiredRentals) {
            rental.status = "ended";

            await rental.save();

            await RentalOccupant.updateMany(
                {
                    rental: rental._id,
                    status: {
                        $ne: "TERMINATED",
                    },
                },
                {
                    $set: {
                        status: "TERMINATED",
                        leftAt: currentDate,
                    },
                }
            );
        }

        // ====================================================
        // 3. FIND ACTIVE RENTALS
        // ====================================================

        const activeRentals = await Rental.find({
            status: "active",
        });

        for (const rental of activeRentals) {
            let occupants = await RentalOccupant.find({
                rental: rental._id,
                status: {
                    $in: ["ACTIVE", "PENDING"],
                },
            });

            // =================================================
            // FALLBACK PRIMARY OCCUPANT
            // =================================================

            if (
                occupants.length === 0 &&
                rental.tenant
            ) {
                try {
                    const primaryOccupant =
                        await RentalOccupant.create({
                            rental: rental._id,
                            tenant: rental.tenant,
                            rentAmount: rental.monthlyRent,
                            securityDepositShare:
                                rental.securityDeposit,
                            status: "ACTIVE",
                            joinedAt: rental.leaseStart,
                        });

                    occupants = [primaryOccupant];
                } catch (error) {
                    console.error(
                        `Failed to create primary occupant for rental ${rental._id}:`,
                        error
                    );

                    continue;
                }
            }

            // =================================================
            // 4. GENERATE MONTHLY RENT PAYMENTS
            // =================================================

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
                const billingMonth =
                    `${cursor.getUTCFullYear()}-${String(
                        cursor.getUTCMonth() + 1
                    ).padStart(2, "0")}`;

                const dueDate = dueDateForMonth(
                    rental.leaseStart,
                    billingMonth
                );

                if (
                    dueDate &&
                    dueDate <= rental.leaseEnd
                ) {
                    for (const occupant of occupants) {
                        // =================================================
                        // PAYMENT UNIQUENESS:
                        //
                        // rental + occupant + type + billingMonth
                        // =================================================

                        const existingPayment =
                            await Payment.findOne({
                                rental: rental._id,
                                occupant: occupant._id,
                                type: "MONTHLY_RENT",
                                billingMonth,
                            });

                        if (existingPayment) {
                            continue;
                        }

                        // =================================================
                        // ATOMIC UPSERT
                        // =================================================

                        try {
                            await Payment.findOneAndUpdate(
                                {
                                    rental: rental._id,
                                    occupant: occupant._id,
                                    type: "MONTHLY_RENT",
                                    billingMonth,
                                },
                                {
                                    $setOnInsert: {
                                        ...(rental.booking
                                            ? {
                                                  booking:
                                                      rental.booking,
                                              }
                                            : {}),
                                        rental: rental._id,
                                        occupant:
                                            occupant._id,
                                        tenant:
                                            occupant.tenant,
                                        owner:
                                            rental.owner,
                                        property:
                                            rental.property,
                                        type: "MONTHLY_RENT",
                                        amount:
                                            occupant.rentAmount,
                                        currency: "INR",
                                        status: "PENDING",
                                        billingMonth,
                                        dueDate,
                                        lateFee: 0,
                                    },
                                },
                                {
                                    upsert: true,

                                    // FIX:
                                    // `new: true` is deprecated.
                                    returnDocument: "after",

                                    setDefaultsOnInsert: true,
                                }
                            );
                        } catch (error: unknown) {
                            // Another scheduler instance/process may
                            // have created the payment simultaneously.
                            //
                            // Duplicate-key errors are safe to ignore
                            // because the payment already exists.

                            if (
                                typeof error === "object" &&
                                error !== null &&
                                "code" in error &&
                                error.code === 11000
                            ) {
                                continue;
                            }

                            throw error;
                        }
                    }
                }

                cursor.setUTCMonth(
                    cursor.getUTCMonth() + 1
                );
            }
        }

        // ====================================================
        // 5. MARK PENDING PAYMENTS AS OVERDUE
        // ====================================================

        const pendingPayments = await Payment.find({
            type: "MONTHLY_RENT",
            status: "PENDING",
            dueDate: {
                $lt: today,
            },
        });

        for (const payment of pendingPayments) {
            payment.status = "OVERDUE";

            await payment.save();
        }

        // ====================================================
        // 6. SEND RENT REMINDERS
        // ====================================================

        const activePayments = await Payment.find({
            type: "MONTHLY_RENT",
            status: {
                $in: [
                    "PENDING",
                    "OVERDUE",
                    "DUE",
                ],
            },
        });

        for (const payment of activePayments) {
            if (!payment.dueDate) {
                continue;
            }

            const dueDateStart = new Date(
                payment.dueDate
            );

            dueDateStart.setUTCHours(
                0,
                0,
                0,
                0
            );

            const diffTime =
                dueDateStart.getTime() -
                today.getTime();

            const diffDays = Math.round(
                diffTime /
                    (1000 * 60 * 60 * 24)
            );

            let notificationTitle = "";
            let notificationMessage = "";

            // 7 DAYS BEFORE
            if (diffDays === 7) {
                notificationTitle =
                    "Rent Reminder: Due in 7 days";

                notificationMessage =
                    `Your monthly rent of ₹${payment.amount.toLocaleString(
                        "en-IN"
                    )} for ${
                        payment.billingMonth
                    } is due in 7 days.`;
            }

            // 3 DAYS BEFORE
            else if (diffDays === 3) {
                notificationTitle =
                    "Rent Reminder: Due in 3 days";

                notificationMessage =
                    `Your monthly rent of ₹${payment.amount.toLocaleString(
                        "en-IN"
                    )} for ${
                        payment.billingMonth
                    } is due in 3 days.`;
            }

            // DUE TODAY
            else if (diffDays === 0) {
                notificationTitle =
                    "Rent Reminder: Due Today";

                notificationMessage =
                    `Your monthly rent of ₹${payment.amount.toLocaleString(
                        "en-IN"
                    )} for ${
                        payment.billingMonth
                    } is due today.`;
            }

            // OVERDUE
            else if (
                diffDays < 0 &&
                payment.status === "OVERDUE"
            ) {
                notificationTitle =
                    "Rent Overdue Alert";

                notificationMessage =
                    `Your monthly rent of ₹${payment.amount.toLocaleString(
                        "en-IN"
                    )} for ${
                        payment.billingMonth
                    } is overdue. Please make your payment promptly.`;
            }

            if (!notificationTitle) {
                continue;
            }

            await notificationService.createNotification(
                {
                    recipient:
                        payment.tenant.toString(),

                    title:
                        notificationTitle,

                    message:
                        notificationMessage,

                    type: "system",

                    referenceId:
                        payment._id.toString(),

                    referenceType:
                        "booking",
                }
            );
        }
    } catch (error) {
        console.error(
            "Error running rental scheduler:",
            error
        );
    }
};

// ============================================================
// SCHEDULER LIFECYCLE
// ============================================================

let schedulerInterval:
    NodeJS.Timeout | null = null;

export const startRentalScheduler =
    (): void => {
        // Prevent multiple scheduler intervals.
        if (schedulerInterval) {
            return;
        }

        // Run immediately when server starts.
        void runRentalScheduler();

        // Run every 6 hours.
        schedulerInterval = setInterval(
            () => {
                void runRentalScheduler();
            },
            SCHEDULER_INTERVAL_MS
        );
    };

export const stopRentalScheduler =
    (): void => {
        if (!schedulerInterval) {
            return;
        }

        clearInterval(
            schedulerInterval
        );

        schedulerInterval = null;
    };