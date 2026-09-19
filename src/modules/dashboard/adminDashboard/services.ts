import dashboardRepository from "./repository.js";
import type { AdminDashboardResponse, DashboardActivity } from "./type.js";

const getAdminDashboard = async (): Promise<AdminDashboardResponse> => {
    const [overview, recentUsers, recentProperties] = await Promise.all([
        dashboardRepository.getOverview(),
        dashboardRepository.findRecentUsers(3),
        dashboardRepository.findRecentProperties(5),
    ]);

    const recentActivities: DashboardActivity[] = recentUsers.map((user) => ({
        id: user.id,
        title: "New user registration",
        detail: `${user.name} created an account`,
        createdAt: user.createdAt,
        icon: "users",
        tone: "teal",
    }));

    return {
        overview,
        recentActivities,
        recentUsers,
        recentProperties,
    };
};

export default { getAdminDashboard };
