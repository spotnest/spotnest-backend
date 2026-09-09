
import { response } from 'express';
import type { NextFunction, Response } from 'express';
import type { AuthRequest } from '../../types/roleTypes.js';
import jwt from 'jsonwebtoken';
import User from '../../modules/auth/model.js';
import { PERMISSIONS } from '../../constants/permissions.js';

interface JwtPayload {
    id: string;
}

const protect = async (req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> => {
    try {
        let token: string | undefined;

        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.split(' ')[1];
        } else if (req.cookies?.token) {
            token = req.cookies.token;
        } else if (req.cookies?.jwt) {
            token = req.cookies.jwt;
        }

        if (!token) {
            return res.status(401).json({ message: 'Not authorized. No token provided.' });
        }

        const secret = process.env.JWT_SECRET || 'your-secret-key';
        const decoded = jwt.verify(token, secret) as JwtPayload;

        const user = await User.findById(decoded.id);
        if (!user) {
            return res.status(401).json({ message: 'Not authorized. User no longer exists.' });
        }

        const dbPermissions = Array.from(user.permissions ?? []);
        const fallbackManagerPermissions =
            user.role === 'admin' && dbPermissions.length === 0
                ? [PERMISSIONS.CUSTOMERS_VIEW, PERMISSIONS.CUSTOMERS_UPDATE]
                : [];

        req.user = {
            id: user._id.toString(),
            role: user.role as "employee" | "manager" | "admin",
            email: user.email,
            permissions: (dbPermissions.length > 0 ? dbPermissions : fallbackManagerPermissions) as any,
        };
        console.log('[authMiddleware Debug]', {
            userId: user._id.toString(),
            role: user.role,
            permissionsFromDB: dbPermissions,
            permissionsCount: dbPermissions.length,
            effectivePermissions: req.user.permissions,
        });
        next();
    } catch (err) {
        return res.status(401).json({ message: 'Not authorized. Invalid or expired token.' });
    }
};

export default protect;