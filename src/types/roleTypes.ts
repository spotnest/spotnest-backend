import type { Request } from 'express';

export interface AuthRequest extends Request {
    user?: {
        id: string;
        role: 'user' | 'admin' | 'owner';
        email: string;
        permissions: string[];
    };
}