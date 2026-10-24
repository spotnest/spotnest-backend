import crypto from "crypto";
import jwt from "jsonwebtoken";
import type {
    IUser,
    JwtPayload,
    AuthResponse,
} from "../../modules/auth/type.js";

const hashToken = (token: string): string => {
    return crypto.createHash("sha256").update(token).digest("hex");
};

const getSecret = (): string => {
    const secret = process.env.JWT_SECRET;

    if (!secret) {
        throw new Error(
            "JWT_SECRET is not defined in environment variables"
        );
    }

    return secret;
};

const parseExpiry = (
    value: string | undefined,
    fallback: string
): Exclude<jwt.SignOptions["expiresIn"], undefined> => {
    const input = value || fallback;

    if (!/^\d+(ms|s|m|h|d|w|y)$/.test(input)) {
        throw new Error(
            `Invalid JWT expiry duration: "${input}"`
        );
    }

    return input as Exclude<
        jwt.SignOptions["expiresIn"],
        undefined
    >;
};

const buildTokenPayload = (
    user: IUser,
    type: "access" | "refresh"
): JwtPayload => ({
    id: user._id.toString(),
    userId: user._id.toString(),
    email: user.email,
    role: user.role,
    type,
});

const signAccessToken = (payload: JwtPayload): string => {
    const expiresIn = parseExpiry(
        process.env.JWT_EXPIRES_IN,
        "15m"
    );

    return jwt.sign(payload, getSecret(), {
        expiresIn,
    });
};

const signRefreshToken = (payload: JwtPayload): string => {
    const expiresIn = parseExpiry(
        process.env.JWT_REFRESH_EXPIRES_IN,
        "7d"
    );

    return jwt.sign(payload, getSecret(), {
        expiresIn,
    });
};

const verifyToken = (token: string): JwtPayload => {
    return jwt.verify(token, getSecret()) as JwtPayload;
};

const toAuthResponse = (user: IUser): AuthResponse => {
    const accessPayload = buildTokenPayload(
        user,
        "access"
    );

    const refreshPayload = buildTokenPayload(
        user,
        "refresh"
    );

    return {
        user: {
            id: user._id.toString(),
            name: user.name,
            email: user.email,
            role: user.role,
            ...(user.verificationStatus
                ? { verificationStatus: user.verificationStatus }
                : {}),
            ...(user.image
                ? { image: user.image }
                : {}),
            // Snapshot only: these mirror the user document at the moment of
            // this login/refresh call for Redux hydration. They are NOT part
            // of the JWT payload (see buildTokenPayload) and MUST NOT be
            // trusted server-side as always-current — the user document is
            // re-read on every authenticated request. Moving them into the
            // token would let them go stale until the next login.
            ...(user.locationName
                ? { locationName: user.locationName }
                : {}),
            ...(user.locationResolvedName
                ? {
                    locationResolvedName:
                        user.locationResolvedName,
                }
                : {}),
        },

        token: signAccessToken(accessPayload),

        refreshToken: signRefreshToken(refreshPayload),
    };
};

export {
    hashToken,
    getSecret,
    parseExpiry,
    buildTokenPayload,
    signAccessToken,
    signRefreshToken,
    verifyToken,
    toAuthResponse,
};
