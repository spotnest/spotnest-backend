import type { Request } from 'express';

export interface AuthRequest extends Request {
    user?: {
        id: string;
        role: 'employee' | 'manager' | 'admin';
        email: string;
        permissions: unknown;
    };
}