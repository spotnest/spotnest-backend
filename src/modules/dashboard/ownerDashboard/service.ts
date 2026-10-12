import repository from "./repository.js";
import type { OwnerDashboardResponse } from "./type.js";

const RECENT_LIMIT = 5;

/**
 * Owner dashboard figures, computed on the server from persisted bookings,
 * rentals, agreements and payments. The client never derives financial
 * totals itself.
 */
const getDashboard = async (ownerId: string): Promise<OwnerDashboardResponse> => {
    const [summary, recentRequests, recentPayments] = await Promise.all([
        repository.getSummary(ownerId),
        repository.findRecentPendingRequests(ownerId, RECENT_LIMIT),
        repository.findRecentPayments(ownerId, RECENT_LIMIT),
    ]);

    const properties = summary.propertyCounts;
    const rentals = summary.rentalCounts;

    return {
        properties: {
            total: Object.values(properties).reduce((total, count) => total + count, 0),
            active: properties.active ?? 0,
            inactive: properties.inactive ?? 0,
            archived: properties.archived ?? 0,
        },
        requests: {
            pending: summary.pendingRequests,
            awaitingAdvance: summary.awaitingAdvance,
        },
        rentals: {
            active: rentals.active ?? 0,
            scheduled: rentals.scheduled ?? 0,
            agreementsAwaitingConfirmation: summary.agreementsAwaitingConfirmation,
        },
        payments: {
            currency: "INR",
            totalReceived: summary.totalReceived,
            receivedThisMonth: summary.receivedThisMonth,
            outstandingRent: summary.outstandingRent,
            overdueCount: summary.overdueCount,
        },
        recentRequests: recentRequests.map((booking) => ({
            id: booking._id.toString(),
            propertyTitle: booking.propertyId?.title ?? "Property",
            tenantName: booking.userId?.name ?? "Tenant",
            startDate: booking.startDate.toISOString(),
            endDate: booking.endDate.toISOString(),
            monthlyRent: booking.monthlyRent,
            createdAt: booking.created_at.toISOString(),
        })),
        recentPayments: recentPayments.map((payment) => ({
            id: payment._id.toString(),
            type: payment.type,
            status: payment.status.toUpperCase(),
            amount: payment.amount,
            ...(payment.billingMonth ? { billingMonth: payment.billingMonth } : {}),
            ...(payment.dueDate ? { dueDate: payment.dueDate.toISOString() } : {}),
            ...(payment.paidAt ? { paidAt: payment.paidAt.toISOString() } : {}),
            propertyTitle: payment.property?.title ?? "Property",
            tenantName: payment.tenant?.name ?? "Tenant",
            updatedAt: payment.updated_at.toISOString(),
        })),
    };
};

export default { getDashboard };
