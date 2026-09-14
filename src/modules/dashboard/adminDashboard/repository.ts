import User from "../../auth/model.js";
import { UserRole, UserStatus } from "../../auth/type.js";
import type { DashboardUser } from "./type.js";

const getOverview = async () => {
    const [totalUsers, totalOwners, pendingUserVerification] = await Promise.all([
        User.countDocuments(),
        User.countDocuments({ role: UserRole.OWNER }),
        User.countDocuments({ isVerified: false }),
    ]);

    return {
        totalUsers,
        totalOwners,
        totalProperties: 0,
        activeListings: 0,
        pendingRequests: 0,
        pendingUserVerification,
    };
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
};

export default dashboardRepository;
