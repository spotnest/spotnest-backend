export interface DashboardOverview {
    totalUsers: number;
    totalOwners: number;
    totalProperties: number;
    activeListings: number;
    pendingRequests: number;
    pendingOwnerCount: number;
    pendingUserVerification: number;
}

export interface DashboardUser {
    id: string;
    name: string;
    email: string;
    role: "admin" | "owner" | "tenant" | "user";
    status: "active" | "inactive" | "suspended";
    isVerified: boolean;
    createdAt: string;
}

export interface DashboardActivity {
    id: string;
    title: "New user registration";
    detail: string;
    createdAt: string;
    icon: "users";
    tone: "teal";
}

export interface DashboardProperty {
    name: string;
    owner: string;
    location: string;
    status: string;
    date: string;
}

export interface AdminDashboardResponse {
    overview: DashboardOverview;
    recentActivities: DashboardActivity[];
    recentUsers: DashboardUser[];
    recentProperties: DashboardProperty[];
}
