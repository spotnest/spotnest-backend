import { UserRole, UserStatus } from "../../auth/type.js";

export interface DashboardOverview {
    totalUsers: number;
    totalOwners: number;
    totalTenants: number;
    totalRegularUsers: number;
    blockedUsers: number;
    totalProperties: number;
    activeListings: number;
    inactiveListings: number;
    archivedListings: number;
    /** Rental requests (bookings) waiting for an owner decision. */
    pendingRequests: number;
    pendingOwnerCount: number;
    pendingUserVerification: number;
    activeRentals: number;
    gracePeriodRentals: number;
    overduePayments: number;
    /** Sum of all PAID payments (INR). */
    paymentsReceivedTotal: number;
    paymentsReceivedCount: number;
    lateFeesTotal: number;
    totalMaintenance: number;
    pendingMaintenance: number;
    totalVisits: number;
    pendingVisits: number;
}

export interface DashboardUser {
    id: string;
    name: string;
    email: string;
    role: UserRole;
    status: UserStatus;
    isVerified: boolean;
    createdAt: string;
}

export interface DashboardActivity {
    id: string;
    title: string;
    detail: string;
    createdAt: string;
    icon: "users" | "home" | "chart" | "alert" | "inbox";
    tone: "teal" | "warm" | "ink" | "red";
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