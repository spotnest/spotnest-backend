
import type { NextFunction, Response } from 'express';
import type { AuthRequest } from '../../types/roleTypes.js';
import jwt from 'jsonwebtoken';
import User from '../../modules/auth/model.js';
import { PERMISSIONS } from '../../constants/permissions.js';
import type { JwtPayload } from '../../modules/auth/type.js';

import { UserStatus, type JwtPayload } from '../../modules/auth/type.js';

const protect = async (req: AuthRequest, res: Response, next: NextFunction): Promise<Response | void> => {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        return res.status(500).json({ message: 'Server configuration error: JWT_SECRET is not set.' });
    }

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

        const decoded = jwt.verify(token, secret) as JwtPayload;
        if (decoded.type !== 'access') {
            return res.status(401).json({ message: 'Not authorized. Invalid token type.' });
        }

        const user = await User.findById(decoded.userId);
        if (!user) {
            return res.status(401).json({ message: 'Not authorized. User no longer exists.' });
        }

        if (user.isBlock || user.status !== UserStatus.ACTIVE) {
            return res.status(403).json({ message: 'Account is not active.' });
        }
        const dbPermissions = Array.from(user.permissions ?? []);
        const fallbackManagerPermissions =
            user.role === 'admin' && dbPermissions.length === 0
                ? [PERMISSIONS.CUSTOMERS_VIEW, PERMISSIONS.CUSTOMERS_UPDATE]
                : [];

        req.user = {
            id: user._id.toString(),
            role: user.role,
            email: user.email,
            permissions: Array.from(user.permissions ?? []),
        };
        next();
    } catch (err) {
        return res.status(401).json({ message: 'Not authorized. Invalid or expired token.' });
    }
};

export default protect;