import type { NextFunction, Response } from 'express';
import type { AuthRequest } from '../../types/roleTypes.js';
import User from '../../modules/auth/model.js';
import { PERMISSIONS } from '../../constants/permissions.js';
import { UserStatus } from '../../modules/auth/type.js';
import { verifyToken } from '../utils/token.js';

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

        const decoded = verifyToken(token);
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

        req.user = {
            id: user._id.toString(),
            role: user.role,
            email: user.email,
            permissions: Array.from(user.permissions ?? []),
            ...(user.verificationStatus ? { verificationStatus: user.verificationStatus } : {}),
        };
        next();
    } catch (err) {
        return res.status(401).json({ message: 'Not authorized. Invalid or expired token.' });
    }
};

export default protect;
