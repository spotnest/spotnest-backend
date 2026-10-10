import User from "../../auth/model.js";
import { UserRole, UserStatus } from "../../auth/type.js";
import Property from "../../properties/model.js";
import Booking from "../../bookings/model.js";
import { Payment, Rental } from "../tenantDashboard/model.js";
import type { DashboardProperty, DashboardUser } from "./type.js";

const PROPERTY_STATUS_LABEL = {
    active: "Live",
    inactive: "Pending",
    archived: "Archived",
} as const;

const getOverview = async () => {
    const [
        totalUsers,
        totalOwners,
        pendingUserVerification,
        pendingOwnerCount,
        totalProperties,
        activeListings,
        pendingRequests,
        activeRentals,
        overduePayments,
        paymentTotals,
    ] = await Promise.all([
        User.countDocuments(),
        User.countDocuments({ role: UserRole.OWNER }),
        User.countDocuments({ verificationStatus: "pending" }),
        User.countDocuments({ role: UserRole.OWNER, verificationStatus: { $in: ["pending", "unsubmitted"] } }),
        Property.countDocuments(),
        Property.countDocuments({ status: "active" }),
        Booking.countDocuments({ status: "PENDING" }),
        Rental.countDocuments({ status: "active" }),
        Payment.countDocuments({ type: "MONTHLY_RENT", status: { $in: ["OVERDUE", "overdue"] } }),
        Payment.aggregate<{ total: number; count: number }>([
            { $match: { status: { $in: ["PAID", "paid"] } } },
            { $group: { _id: null, total: { $sum: "$amount" }, count: { $sum: 1 } } },
        ]),
    ]);

    return {
        totalUsers,
        totalOwners,
        totalProperties,
        activeListings,
        pendingRequests,
        pendingOwnerCount,
        pendingUserVerification,
        activeRentals,
        overduePayments,
        paymentsReceivedTotal: paymentTotals[0]?.total ?? 0,
        paymentsReceivedCount: paymentTotals[0]?.count ?? 0,
    };
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
};

export default dashboardRepository;
