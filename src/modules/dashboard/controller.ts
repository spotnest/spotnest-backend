import type { Request, Response, NextFunction } from "express";
import User from "../auth/model.js";
import Property from "../properties/model.js";
import { UserRole } from "../auth/type.js";

export const getAdminDashboardData = async (_req: Request, res: Response, next: NextFunction) => {
    try {
        const [
            totalUsers,
            totalOwners,
            pendingUserVerification,
            recentUsersList,
            totalProperties,
            activeListings,
            recentPropertiesList,
        ] = await Promise.all([
            User.countDocuments(),
            User.countDocuments({ role: UserRole.OWNER }),
            User.countDocuments({ verificationStatus: "pending" }),
            User.find().sort({ created_at: -1 }).limit(5).lean(),
            Property.countDocuments(),
            Property.countDocuments({ status: "active" }),
            Property.find().populate("owner", "name email").sort({ created_at: -1 }).limit(5).lean(),
        ]);

        const recentUsers = recentUsersList.map((u: any) => ({
            id: u._id.toString(),
            name: u.name || "User",
            email: u.email,
            role: u.role || "user",
            status: u.status || "active",
            isVerified: !!u.isVerified,
            createdAt: u.created_at ? new Date(u.created_at).toISOString() : new Date().toISOString(),
        }));

        const recentProperties = recentPropertiesList.map((p: any) => ({
            name: p.title || "Property",
            owner: p.owner && typeof p.owner === "object" ? p.owner.name || p.owner.email : "Owner",
            location: p.address ? `${p.address.city}, ${p.address.state}` : "N/A",
            status: p.status === "active" ? "Live" : p.status === "inactive" ? "Pending" : "Archived",
            date: p.created_at ? new Date(p.created_at).toLocaleDateString("en-US", { month: "short", day: "2-digit", year: "numeric" }) : "N/A",
        }));

        const recentActivities = [
            {
                id: "act-1",
                title: "System initialized",
                detail: "Platform operations active",
                createdAt: new Date().toISOString(),
                icon: "users" as const,
                tone: "teal" as const,
            },
        ];

        return res.status(200).json({
            success: true,
            data: {
                overview: {
                    totalUsers,
                    totalOwners,
                    totalProperties,
                    activeListings,
                    pendingRequests: 0,
                    pendingUserVerification,
                },
                recentActivities,
                recentUsers,
                recentProperties,
            },
        });
    } catch (error) {
        next(error);
    }
};
