import type { Request } from 'express';

export interface AuthRequest extends Request {
    user?: {
        id: string;
        name: string;
        role: 'user' | 'admin' | 'owner' | 'tenant';
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
