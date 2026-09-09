import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import authRepository from "./repository.js";
import { AppError } from "../../shared/errors/AppError.js";
import { UserStatus, type IUser, type JwtPayload, type AuthResponse } from "./type.js";
import type { LoginInput, RefreshTokenInput, SignupInput } from "./validation.js";

// Access-control model: Option A (role-first). `admin`/`owner` roles bypass
// granular permission checks; the `permissions` array only filters what a
// plain `user` can do. Signup assigns `permissions: []` consistently.
// Token model: fully stateless JWT. Access and refresh tokens are both JWT;
// nothing is stored server-side, so there is no server-side revocation.

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

const signAccessToken = (user: IUser): string => {
    const payload: JwtPayload = {
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
        type: "access",
    };
    const expiresIn = parseExpiry(process.env.JWT_EXPIRES_IN, "15m");
    return jwt.sign(payload, getSecret(), { expiresIn });
};

const signRefreshToken = (user: IUser): string => {
    const payload: JwtPayload = {
        userId: user._id.toString(),
        email: user.email,
        role: user.role,
        type: "refresh",
    };
    const expiresIn = parseExpiry(process.env.JWT_REFRESH_EXPIRES_IN, "7d");
    return jwt.sign(payload, getSecret(), { expiresIn });
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
        token: signAccessToken(user),
        refreshToken: signRefreshToken(user),
    };
};

const register = async (data: SignupInput): Promise<AuthResponse> => {
    const existing = await authRepository.findByEmail(data.email);
    if (existing) {
        throw new AppError(409, "Email already registered");
    }

    const password_hash = await bcrypt.hash(data.password, 10);

    let user: IUser;
    try {
        user = await authRepository.createUser({
            name: data.name,
            email: data.email,
            password_hash,
            ...(data.phone ? { phone: data.phone } : {}),
            ...(data.image ? { image: data.image } : {}),
        });
    } catch (err) {
        const mongoErr = err as { code?: number };
        if (mongoErr?.code === 11000) {
            throw new AppError(409, "Email already registered");
        }
        throw err;
    }

    return toAuthResponse(user);
};

const login = async (data: LoginInput): Promise<AuthResponse> => {
    const user = await authRepository.findByEmail(data.email);
    if (!user) {
        throw new AppError(401, "Invalid email or password");
    }

    const isMatch = await bcrypt.compare(data.password, user.password_hash);
    if (!isMatch) {
        throw new AppError(401, "Invalid email or password");
    }

    if (user.isBlock || user.status !== UserStatus.ACTIVE) {
        throw new AppError(403, "Account is not active");
    }

    return toAuthResponse(user);
};

const refresh = async (data: RefreshTokenInput): Promise<AuthResponse> => {
    let decoded: JwtPayload;
    try {
        const payload = jwt.verify(data.refreshToken, getSecret()) as JwtPayload;
        if (payload.type !== "refresh") {
            throw new AppError(401, "Invalid or expired refresh token");
        }
        decoded = payload;
    } catch (err) {
        if (err instanceof AppError) {
            throw err;
        }
        throw new AppError(401, "Invalid or expired refresh token");
    }

    const user = await authRepository.findById(decoded.userId);
    if (!user) {
        throw new AppError(401, "User no longer exists");
    }

    if (user.isBlock || user.status !== UserStatus.ACTIVE) {
        throw new AppError(403, "Account is not active");
    }

    return toAuthResponse(user);
};

const authService = { register, login, refresh };
export default authService;
