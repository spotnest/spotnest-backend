import type {
    NextFunction,
    Response,
} from "express";

import type { AuthRequest } from "../../types/roleTypes.js";

import User from "../../modules/auth/model.js";

import { UserRole, UserStatus } from "../../modules/auth/type.js";

import { verifyToken } from "../utils/token.js";
import settingsRepository from "../../modules/settings/repository.js";

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

        const settings = await settingsRepository.getGlobal();
        if (
            settings.ownerApprovalRequired &&
            user.role === UserRole.OWNER &&
            (user.verificationStatus === "pending" || user.verificationStatus === "rejected" || !user.isVerified)
        ) {
            return res.status(403).json({
                success: false,
                message: user.verificationStatus === "rejected"
                    ? "Your account approval request was rejected."
                    : "Your account is pending admin approval. Please wait for approval.",
            });
        }

        req.user = {
            id: user._id.toString(),
            name: user.name,
            role: user.role,
            email: user.email,
            ...(user.phone ? { phone: user.phone } : {}),
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
            ...(user.locationName
                ? { locationName: user.locationName }
                : {}),
            ...(user.locationResolvedName
                ? {
                    locationResolvedName:
                        user.locationResolvedName,
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
