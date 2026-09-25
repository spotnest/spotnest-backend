import type { Request } from 'express';
import { UserRole } from "../modules/auth/type.js";
export interface AuthRequest extends Request {
    user?: {
        id: string;
        name: string;
        role: UserRole;
        email: string;
        phone?: string;
        image?: string;
        permissions: string[];
        isVerified: boolean;
        isBlock: boolean;
        verificationStatus?: 'unsubmitted' | 'pending' | 'approved' | 'rejected';
        locationName?: string;
        locationResolvedName?: string;
    };
}
