import mongoose from "mongoose";
import Booking from "../../bookings/model.js";
import Property from "../../properties/model.js";
import { RentalAgreement } from "../../rentals/model.js";
import { Payment, Rental } from "../tenantDashboard/model.js";
import type { PaymentStatus } from "../tenantDashboard/type.js";

// Payment.status has historically been written in both cases ("PAID"/"paid").
const PAID_STATUSES: PaymentStatus[] = ["PAID", "paid"];
const UNPAID_RENT_STATUSES: PaymentStatus[] = ["PENDING", "DUE", "OVERDUE", "FAILED", "pending", "due", "overdue", "failed"];
const OVERDUE_STATUSES: PaymentStatus[] = ["OVERDUE", "overdue"];

const countByStatus = async (
    model: mongoose.Model<any>,
    match: Record<string, unknown>
): Promise<Record<string, number>> => {
    const rows = await model.aggregate<{ _id: string; count: number }>([
        { $match: match },
        { $group: { _id: "$status", count: { $sum: 1 } } },
    ]);
    return Object.fromEntries(rows.map((row) => [row._id, row.count]));
};

const sumAmount = async (match: Record<string, unknown>, includeLateFee = false): Promise<number> => {
    // $sum ignores missing fields, so documents without lateFee add 0.
    const [row] = await Payment.aggregate<{ amount: number; lateFee: number }>([
        { $match: match },
        { $group: { _id: null, amount: { $sum: "$amount" }, lateFee: { $sum: "$lateFee" } } },
    ]);
    if (!row) return 0;
    return row.amount + (includeLateFee ? row.lateFee : 0);
};

const getSummary = async (ownerId: string) => {
    const owner = new mongoose.Types.ObjectId(ownerId);
    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

    const [
        propertyCounts,
        pendingRequests,
        awaitingAdvance,
        rentalCounts,
        agreementsAwaitingConfirmation,
        totalReceived,
        receivedThisMonth,
        outstandingRent,
        overdueCount,
    ] = await Promise.all([
        countByStatus(Property, { owner }),
        Booking.countDocuments({ ownerId: owner, status: "PENDING" }),
        Booking.countDocuments({ ownerId: owner, status: "APPROVED", paymentStatus: "ADVANCE_PAYMENT_PENDING" }),
        countByStatus(Rental, { owner }),
        RentalAgreement.countDocuments({ owner, status: "PENDING_OWNER" }),
        sumAmount({ owner, status: { $in: PAID_STATUSES } }),
        sumAmount({ owner, status: { $in: PAID_STATUSES }, paidAt: { $gte: monthStart } }),
        sumAmount(
            { owner, type: "MONTHLY_RENT", status: { $in: UNPAID_RENT_STATUSES }, dueDate: { $lte: now } },
            true
        ),
        Payment.countDocuments({ owner, type: "MONTHLY_RENT", status: { $in: OVERDUE_STATUSES } }),
    ]);

    return {
        propertyCounts,
        pendingRequests,
        awaitingAdvance,
        rentalCounts,
        agreementsAwaitingConfirmation,
        totalReceived,
        receivedThisMonth,
        outstandingRent,
        overdueCount,
    };
};

const findRecentPendingRequests = (ownerId: string, limit: number) =>
    Booking.find({ ownerId, status: "PENDING" })
        .populate<{ userId: { name?: string } | null }>("userId", "name")
        .populate<{ propertyId: { title?: string } | null }>("propertyId", "title")
        .sort({ created_at: -1 })
        .limit(limit)
        .lean();

const findRecentPayments = (ownerId: string, limit: number) =>
    Payment.find({ owner: ownerId })
        .populate<{ tenant: { name?: string } | null }>("tenant", "name")
        .populate<{ property: { title?: string } | null }>("property", "title")
        .sort({ updated_at: -1 })
        .limit(limit)
        .lean();

export default { getSummary, findRecentPendingRequests, findRecentPayments };
