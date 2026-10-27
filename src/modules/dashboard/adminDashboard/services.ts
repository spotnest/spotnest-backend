import dashboardRepository from "./repository.js";
import type { AdminDashboardResponse, DashboardActivity } from "./type.js";

const getAdminDashboard = async (): Promise<AdminDashboardResponse> => {
    const [overview, recentUsers, recentProperties, recentActivities] = await Promise.all([
        dashboardRepository.getOverview(),
        dashboardRepository.findRecentUsers(5),
        dashboardRepository.findRecentProperties(5),
        dashboardRepository.findRecentActivities(8),
    ]);

    return {
        overview,
        recentActivities,
        recentUsers,
        recentProperties,
    };
};

export default { getAdminDashboard };
