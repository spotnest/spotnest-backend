import jwt from "jsonwebtoken";
import type { IUser, JwtPayload, AuthResponse } from "../../modules/auth/type.js";

const getSecret = (): string => {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error("JWT_SECRET is not defined in environment variables");
    }
    return secret;
};

const parseExpiry = (value: string | undefined, fallback: string): Exclude<jwt.SignOptions["expiresIn"], undefined> => {
    const input = value || fallback;
    if (!/^\d+(ms|s|m|h|d|w|y)$/.test(input)) {
        throw new Error(`Invalid JWT expiry duration: "${input}"`);
    }
    return input as Exclude<jwt.SignOptions["expiresIn"], undefined>;
};

const buildTokenPayload = (user: IUser, type: "access" | "refresh"): JwtPayload => ({
    id: user._id.toString(),
    userId: user._id.toString(),
    email: user.email,
    role: user.role,
    type,
});

const signAccessToken = (payload: JwtPayload): string => {
    const expiresIn = parseExpiry(process.env.JWT_EXPIRES_IN, "15m");
    return jwt.sign(payload, getSecret(), { expiresIn });
};

const signRefreshToken = (payload: JwtPayload): string => {
    const expiresIn = parseExpiry(process.env.JWT_REFRESH_EXPIRES_IN, "7d");
    return jwt.sign(payload, getSecret(), { expiresIn });
};

const verifyToken = (token: string): JwtPayload => {
    return jwt.verify(token, getSecret()) as JwtPayload;
};

const toAuthResponse = (user: IUser): AuthResponse => {
    return {
        user: {
            id: user._id.toString(),
            name: user.name,
            email: user.email,
            role: user.role,
            ...(user.image ? { image: user.image } : {}),
        },
        token: signAccessToken(buildTokenPayload(user, "access")),
        refreshToken: signRefreshToken(buildTokenPayload(user, "refresh")),
    };
};

export { getSecret, parseExpiry, buildTokenPayload, signAccessToken, signRefreshToken, verifyToken, toAuthResponse };
