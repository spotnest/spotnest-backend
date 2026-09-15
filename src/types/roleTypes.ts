import type { Request } from 'express';

export interface AuthRequest extends Request {
    user?: {
        id: string;
        name: string;
        role: 'user' | 'admin' | 'owner';
        email: string;
        permissions: string[];
        isVerified: boolean;
        isBlock: boolean;
        image?: string;
        verificationStatus?: 'unsubmitted' | 'pending' | 'approved' | 'rejected';
    };
}