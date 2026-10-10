import { Payment, Rental } from "../dashboard/tenantDashboard/model.js";
import notificationService from "../notifications/service.js";
import { emitDashboardUpdate } from "../../shared/socket/index.js";
import { RentalOccupant } from "./model.js";
import type { IRental } from "../dashboard/tenantDashboard/type.js";

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

const formatInr = (amount: number) => `₹${amount.toLocaleString("en-IN")}`;

const rentalTenantIds = async (rental: IRental): Promise<string[]> => {
    const occupants = await RentalOccupant.find({ rental: rental._id }).select("tenant");
    return [...new Set([rental.tenant.toString(), ...occupants.map((occupant) => occupant.tenant.toString())])];
};

/**
 * Notifies everyone on a rental about a lifecycle change. Dedupe keys make
 * this safe to run on every scheduler pass.
 */
const notifyRentalLifecycle = async (
    rental: IRental,
    event: "started" | "ended",
    tenantIds: string[]
): Promise<void> => {
    const data = { rentalId: rental._id.toString(), propertyId: rental.property.toString() };
    const tenantMessage = event === "started"
        ? "Your lease has started and your rental is now active."
        : "Your lease period has ended and the rental is now closed.";
    const ownerMessage = event === "started"
        ? "A scheduled rental for your property is now active."
        : "A rental for your property has reached its lease end date and is now closed.";

    await Promise.all([
        ...tenantIds.map((tenantId) =>
            notificationService.notify({
                recipient: tenantId,
                title: event === "started" ? "Lease started" : "Lease ended",
                message: tenantMessage,
                type: "rental_status",
                referenceId: rental._id.toString(),
                referenceType: "rental",
                data,
                dedupeKey: `rental-${event}:${rental._id.toString()}`,
            })
        ),
        notificationService.notify({
            recipient: rental.owner.toString(),
            title: event === "started" ? "Rental started" : "Rental ended",
            message: ownerMessage,
            type: "rental_status",
            referenceId: rental._id.toString(),
            referenceType: "rental",
            data,
            dedupeKey: `rental-${event}:${rental._id.toString()}`,
        }),
    ]);

    emitDashboardUpdate(
        { userIds: [rental.owner, ...tenantIds], admins: true },
        "rental",
        "status_changed",
        rental._id
    );
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
            await notifyRentalLifecycle(rental, "started", await rentalTenantIds(rental));
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

            await notifyRentalLifecycle(rental, "ended", await rentalTenantIds(rental));
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
            // Conditional update: only the pass that actually moves the
            // payment to OVERDUE notifies the owner and refreshes dashboards.
            const transition = await Payment.updateOne(
                { _id: payment._id, status: "PENDING" },
                { $set: { status: "OVERDUE" } }
            );
            if (transition.modifiedCount === 0) continue;

            if (payment.owner) {
                await notificationService.notify({
                    recipient: payment.owner.toString(),
                    title: "Rent overdue",
                    message: `Rent of ${formatInr(payment.amount)} for ${payment.billingMonth} is overdue.`,
                    type: "rent_due",
                    referenceId: payment._id.toString(),
                    referenceType: "payment",
                    data: {
                        paymentId: payment._id.toString(),
                        ...(payment.rental ? { rentalId: payment.rental.toString() } : {}),
                    },
                    dedupeKey: `rent-overdue-owner:${payment._id.toString()}`,
                });
            }
            emitDashboardUpdate(
                { userIds: [payment.tenant, payment.owner], admins: true },
                "payment",
                "overdue",
                payment._id
            );
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
            // Reminders run on every 6-hour pass; the key limits each
            // reminder to once (overdue alerts: once per day).
            let dedupeKey = `rent-reminder:${payment._id.toString()}:d${diffDays}`;

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

                dedupeKey = `rent-overdue:${payment._id.toString()}:${today.toISOString().slice(0, 10)}`;

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

            await notificationService.notify({
                recipient: payment.tenant.toString(),
                title: notificationTitle,
                message: notificationMessage,
                type: "rent_due",
                referenceId: payment._id.toString(),
                referenceType: "payment",
                data: {
                    paymentId: payment._id.toString(),
                    ...(payment.rental ? { rentalId: payment.rental.toString() } : {}),
                    ...(payment.booking ? { bookingId: payment.booking.toString() } : {}),
                },
                dedupeKey,
            });
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