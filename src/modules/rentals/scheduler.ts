import { Payment, Rental } from "../dashboard/tenantDashboard/model.js";
import notificationService from "../notifications/service.js";
import { RentalOccupant } from "./model.js";

const SCHEDULER_INTERVAL_MS = 6 * 60 * 60 * 1000;

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

    const dueDate = new Date(
        Date.UTC(year, monthIndex, day)
    );

    if (dueDate < leaseStart) {
        return null;
    }

    return dueDate;
};

export const runRentalScheduler = async (): Promise<void> => {
    try {
        const currentDate = new Date();

        const today = new Date(currentDate);
        today.setUTCHours(0, 0, 0, 0);

        // 1. Activate scheduled rentals whose lease has started.
        const dueScheduledRentals = await Rental.find({
            status: "scheduled",
            leaseStart: { $lte: currentDate },
        });

        for (const rental of dueScheduledRentals) {
            rental.status = "active";
            await rental.save();
        }

        // 2. End expired rentals and terminate their occupants.
        const expiredRentals = await Rental.find({
            status: { $in: ["scheduled", "active"] },
            leaseEnd: { $lt: currentDate },
        });

        for (const rental of expiredRentals) {
            rental.status = "ended";
            await rental.save();

            await RentalOccupant.updateMany(
                {
                    rental: rental._id,
                    status: { $ne: "TERMINATED" },
                },
                {
                    $set: {
                        status: "TERMINATED",
                        leftAt: currentDate,
                    },
                }
            );
        }

        // 3. Fetch all active rentals.
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

            // Backward-compatible fallback for rentals without occupants.
            if (occupants.length === 0 && rental.tenant) {
                const primaryOccupant = await RentalOccupant.create({
                    rental: rental._id,
                    tenant: rental.tenant,
                    rentAmount: rental.monthlyRent,
                    securityDepositShare: rental.securityDeposit,
                    status: "ACTIVE",
                    joinedAt: rental.leaseStart,
                });

                occupants = [primaryOccupant];
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

            // Create missing monthly payment records.
            while (cursor <= endMonth) {
                const billingMonth = `${cursor.getUTCFullYear()}-${String(
                    cursor.getUTCMonth() + 1
                ).padStart(2, "0")}`;

                const dueDate = dueDateForMonth(
                    rental.leaseStart,
                    billingMonth
                );

                if (dueDate && dueDate <= rental.leaseEnd) {
                    for (const occupant of occupants) {
                        const existingPayment = await Payment.findOne({
                            rental: rental._id,
                            tenant: occupant.tenant,
                            billingMonth,
                            type: "MONTHLY_RENT",
                        });

                        if (!existingPayment) {
                            await Payment.create({
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
                            });
                        }
                    }
                }

                cursor.setUTCMonth(
                    cursor.getUTCMonth() + 1
                );
            }
        }

        // 4. Mark overdue monthly payments.
        const pendingPayments = await Payment.find({
            type: "MONTHLY_RENT",
            status: "PENDING",
            dueDate: { $lt: today },
        });

        for (const payment of pendingPayments) {
            payment.status = "OVERDUE";
            await payment.save();
        }

        // 5. Send rent reminders.
        const activePayments = await Payment.find({
            type: "MONTHLY_RENT",
            status: {
                $in: ["PENDING", "OVERDUE", "DUE"],
            },
        });

        for (const payment of activePayments) {
            if (!payment.dueDate) {
                continue;
            }

            const dueDateStart = new Date(payment.dueDate);
            dueDateStart.setUTCHours(0, 0, 0, 0);

            const diffTime =
                dueDateStart.getTime() - today.getTime();

            const diffDays = Math.round(
                diffTime / (1000 * 60 * 60 * 24)
            );

            let notificationTitle = "";
            let notificationMessage = "";

            if (diffDays === 7) {
                notificationTitle =
                    "Rent Reminder: Due in 7 days";

                notificationMessage = `Your monthly rent of ₹${payment.amount.toLocaleString(
                    "en-IN"
                )} for ${
                    payment.billingMonth
                } is due in 7 days.`;
            } else if (diffDays === 3) {
                notificationTitle =
                    "Rent Reminder: Due in 3 days";

                notificationMessage = `Your monthly rent of ₹${payment.amount.toLocaleString(
                    "en-IN"
                )} for ${
                    payment.billingMonth
                } is due in 3 days.`;
            } else if (diffDays === 0) {
                notificationTitle =
                    "Rent Reminder: Due Today";

                notificationMessage = `Your monthly rent of ₹${payment.amount.toLocaleString(
                    "en-IN"
                )} for ${
                    payment.billingMonth
                } is due today.`;
            } else if (
                diffDays < 0 &&
                payment.status === "OVERDUE"
            ) {
                notificationTitle = "Rent Overdue Alert";

                notificationMessage = `Your monthly rent of ₹${payment.amount.toLocaleString(
                    "en-IN"
                )} for ${
                    payment.billingMonth
                } is overdue. Please make your payment promptly.`;
            }

            if (!notificationTitle) {
                continue;
            }

            /*
             * Use the existing notification service API.
             * Do not access the notification model directly here.
             */
            await notificationService.createNotification({
                recipient: payment.tenant.toString(),
                title: notificationTitle,
                message: notificationMessage,
                type: "system",
                referenceId: payment._id.toString(),
                referenceType: "booking",
            });
        }
    } catch (error) {
        console.error(
            "Error running rental scheduler:",
            error
        );
    }
};

let schedulerInterval: NodeJS.Timeout | null = null;

export const startRentalScheduler = (): void => {
    // Prevent multiple scheduler intervals.
    if (schedulerInterval) {
        return;
    }

    // Run once immediately on server startup.
    void runRentalScheduler();

    // Run every 6 hours.
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