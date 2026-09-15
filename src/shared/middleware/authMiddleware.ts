import type {
    NextFunction,
    Response,
} from "express";

import type { AuthRequest } from "../../types/roleTypes.js";

import User from "../../modules/auth/model.js";

import { UserStatus } from "../../modules/auth/type.js";

import { verifyToken } from "../utils/token.js";

const protect = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction
): Promise<Response | void> => {
    try {
        let token: string | undefined;

        /**
         * Primary authentication method:
         * HttpOnly accessToken cookie.
         */
        if (req.cookies?.accessToken) {
            token = req.cookies.accessToken;
        }

        /**
         * Optional backward compatibility:
         * Allows Bearer tokens during the migration.
         *
         * Once every frontend request uses cookies,
         * this fallback can be removed.
         */
        if (!token) {
            const authHeader =
                req.headers.authorization;

            if (
                authHeader &&
                authHeader.startsWith("Bearer ")
            ) {
                token = authHeader.substring(7);
            }
        }

        if (!token) {
            return res.status(401).json({
                success: false,
                message:
                    "Not authorized. No access token provided.",
            });
        }

        const decoded = verifyToken(token);

        if (decoded.type !== "access") {
            return res.status(401).json({
                success: false,
                message:
                    "Not authorized. Invalid token type.",
            });
        }

        const user = await User.findById(
            decoded.userId
        );

        if (!user) {
            return res.status(401).json({
                success: false,
                message:
                    "Not authorized. User no longer exists.",
            });
        }

        if (
            user.isBlock ||
            user.status !== UserStatus.ACTIVE
        ) {
            return res.status(403).json({
                success: false,
                message:
                    "Account is not active.",
            });
        }

        req.user = {
            id: user._id.toString(),
            name: user.name,
            role: user.role,
            email: user.email,
            permissions: Array.from(
                user.permissions ?? []
            ),
            isVerified: user.isVerified,
            isBlock: user.isBlock,
            ...(user.image ? { image: user.image } : {}),
            ...(user.verificationStatus
                ? {
                      verificationStatus:
                          user.verificationStatus,
                  }
                : {}),
        };

        next();
    } catch {
        return res.status(401).json({
            success: false,
            message:
                "Not authorized. Invalid or expired access token.",
        });
    }
};

export default protect;