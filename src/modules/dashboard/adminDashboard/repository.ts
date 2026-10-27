import User from "../../auth/model.js";
import { UserRole, UserStatus } from "../../auth/type.js";
import Property from "../../properties/model.js";
import Booking from "../../bookings/model.js";
import { Payment, Rental } from "../tenantDashboard/model.js";
import { MaintenanceRequest } from "../../maintenance/model.js";
import Visit from "../../visits/model.js";
import type { DashboardActivity, DashboardOverview, DashboardProperty, DashboardUser } from "./type.js";

const PROPERTY_STATUS_LABEL = {
    active: "Live",
    inactive: "Pending",
    archived: "Archived",
} as const;

const getOverview = async (): Promise<DashboardOverview> => {
    const now = new Date();
    const threeDaysAgo = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);

    const [
        totalUsers,
        totalOwners,
        totalTenants,
        totalRegularUsers,
        blockedUsers,
        pendingUserVerification,
        pendingOwnerCount,
        totalProperties,
        activeListings,
        inactiveListings,
        archivedListings,
        pendingRequests,
        activeRentals,
        gracePeriodRentals,
        overduePayments,
        paymentTotals,
        lateFeesAgg,
        totalMaintenance,
        pendingMaintenance,
        totalVisits,
        pendingVisits,
    ] = await Promise.all([
        User.countDocuments(),
        User.countDocuments({ role: UserRole.OWNER }),
        User.countDocuments({ role: UserRole.TENANT }),
        User.countDocuments({ role: UserRole.USER }),
        User.countDocuments({ isBlock: true }),
        User.countDocuments({ verificationStatus: "pending" }),
        User.countDocuments({ role: UserRole.OWNER, verificationStatus: { $in: ["pending", "unsubmitted"] } }),
        Property.countDocuments(),
        Property.countDocuments({ status: "active" }),
        Property.countDocuments({ status: "inactive" }),
        Property.countDocuments({ status: "archived" }),
        Booking.countDocuments({ status: "PENDING" }),
        Rental.countDocuments({ status: "active" }),
        Rental.countDocuments({
            status: "active",
            leaseEnd: { $lt: now, $gte: threeDaysAgo },
        }),
        Payment.countDocuments({ type: "MONTHLY_RENT", status: { $in: ["OVERDUE", "overdue"] } }),
        Payment.aggregate<{ total: number; count: number }>([
            { $match: { status: { $in: ["PAID", "paid"] } } },
            { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
        ]),
        Payment.aggregate<{ totalLateFees: number }>([
            { $group: { _id: null, totalLateFees: { $sum: { $ifNull: ["$lateFee", 0] } } } },
        ]),
        MaintenanceRequest.countDocuments(),
        MaintenanceRequest.countDocuments({ status: "PENDING" }),
        Visit.countDocuments(),
        Visit.countDocuments({ status: "pending" }),
    ]);

    return {
        totalUsers,
        totalOwners,
        totalTenants,
        totalRegularUsers,
        blockedUsers,
        totalProperties,
        activeListings,
        inactiveListings,
        archivedListings,
        pendingRequests,
        pendingOwnerCount,
        pendingUserVerification,
        activeRentals,
        gracePeriodRentals,
        overduePayments,
        paymentsReceivedTotal: paymentTotals[0]?.total ?? 0,
        paymentsReceivedCount: paymentTotals[0]?.count ?? 0,
        lateFeesTotal: lateFeesAgg[0]?.totalLateFees ?? 0,
        totalMaintenance,
        pendingMaintenance,
        totalVisits,
        pendingVisits,
    };
};

const findRecentActivities = async (limit: number): Promise<DashboardActivity[]> => {
    const [recentUsers, recentProperties, recentPayments, recentMaintenance, recentVisits] = await Promise.all([
        User.find({})
            .select("name created_at")
            .sort({ created_at: -1 })
            .limit(limit)
            .lean(),
        Property.find({})
            .select("title created_at")
            .sort({ created_at: -1 })
            .limit(limit)
            .lean(),
        Payment.find({ status: { $in: ["PAID", "paid"] } })
            .select("amount tenant created_at paidAt")
            .populate<{ tenant: { name: string } | null }>("tenant", "name")
            .sort({ created_at: -1 })
            .limit(limit)
            .lean(),
        MaintenanceRequest.find({})
            .select("title created_at")
            .sort({ created_at: -1 })
            .limit(limit)
            .lean(),
        Visit.find({})
            .select("requester created_at")
            .populate<{ requester: { name: string } | null }>("requester", "name")
            .sort({ created_at: -1 })
            .limit(limit)
            .lean(),
    ]);

    const activities: DashboardActivity[] = [
        ...recentUsers.map((u) => ({
            id: `user-${u._id.toString()}`,
            title: "New user registration",
            detail: `${u.name} registered an account`,
            createdAt: u.created_at.toISOString(),
            icon: "users" as const,
            tone: "teal" as const,
        })),
        ...recentProperties.map((p) => ({
            id: `prop-${p._id.toString()}`,
            title: "New property listing",
            detail: `${p.title} was published`,
            createdAt: p.created_at.toISOString(),
            icon: "home" as const,
            tone: "ink" as const,
        })),
        ...recentPayments.map((pm) => ({
            id: `pay-${pm._id.toString()}`,
            title: "Payment received",
            detail: `₹${pm.amount.toLocaleString("en-IN")} paid by ${pm.tenant?.name || "Tenant"}`,
            createdAt: (pm.paidAt || pm.created_at).toISOString(),
            icon: "chart" as const,
            tone: "teal" as const,
        })),
        ...recentMaintenance.map((m) => ({
            id: `maint-${m._id.toString()}`,
            title: "Maintenance requested",
            detail: m.title,
            createdAt: m.created_at.toISOString(),
            icon: "alert" as const,
            tone: "warm" as const,
        })),
        ...recentVisits.map((v) => ({
            id: `visit-${v._id.toString()}`,
            title: "Visit scheduled",
            detail: `Visit request from ${v.requester?.name || "User"}`,
            createdAt: v.created_at.toISOString(),
            icon: "inbox" as const,
            tone: "warm" as const,
        })),
    ];

    activities.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return activities.slice(0, limit);
};

const findRecentProperties = async (limit: number): Promise<DashboardProperty[]> => {
    const properties = await Property.find({})
        .select("title address status created_at owner")
        .populate<{ owner: { name: string } | null }>("owner", "name")
        .sort({ created_at: -1 })
        .limit(limit)
        .lean();

    return properties.map((property) => ({
        name: property.title,
        owner: property.owner?.name ?? "Unknown owner",
        location: `${property.address.city}, ${property.address.state}`,
        status: PROPERTY_STATUS_LABEL[property.status],
        date: property.created_at.toISOString(),
    }));
};

const findRecentUsers = async (limit: number): Promise<DashboardUser[]> => {
    const users = await User.find({})
        .select("name email role status isVerified created_at")
        .sort({ created_at: -1 })
        .limit(limit)
        .lean();

    return users.map((user) => ({
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status as UserStatus,
        isVerified: user.isVerified,
        createdAt: user.created_at.toISOString(),
    }));
};

const dashboardRepository = {
    getOverview,
    findRecentUsers,
    findRecentProperties,
    findRecentActivities,
};

export default dashboardRepository;

