import { OAuth2Client } from "google-auth-library";
import type { NextFunction, Request, Response } from "express";
import crypto from "crypto";
import bcrypt from "bcryptjs";

import User from "../model.js";
import authRepository from "../repository.js";
import { UserRole, UserStatus } from "../type.js";
import {
    buildTokenPayload,
    signAccessToken,
    signRefreshToken,
} from "../../../shared/utils/token.js";
import { AppError } from "../../../shared/errors/AppError.js";

const getGoogleOAuthEnv = (): {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
} => {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_CALLBACK_URL;

    if (!clientId || !clientSecret || !redirectUri) {
        throw new AppError(
            500,
            "Google OAuth configuration is missing"
        );
    }

    return {
        clientId,
        clientSecret,
        redirectUri,
    };
};

const getGoogleOAuthClient = (): OAuth2Client => {
    const {
        clientId,
        clientSecret,
        redirectUri,
    } = getGoogleOAuthEnv();

    return new OAuth2Client({
        clientId,
        clientSecret,
        redirectUri,
    });
};

const getClientUrl = (): string => {
    return (
        process.env.CLIENT_URL ||
        "http://localhost:3000"
    );
};

/**
 * GET /api/v1/auth/google
 *
 * Starts Google OAuth flow.
 */
const googleAuth = (
    req: Request,
    res: Response,
    next: NextFunction
): void => {
    try {
        const client = getGoogleOAuthClient();

        const authUrl = client.generateAuthUrl({
            access_type: "offline",
            scope: [
                "openid",
                "https://www.googleapis.com/auth/userinfo.profile",
                "https://www.googleapis.com/auth/userinfo.email",
            ],
            prompt: "select_account",
        });

        res.redirect(authUrl);
    } catch (err) {
        next(err);
    }
};

/**
 * GET /api/v1/auth/google/callback
 *
 * Handles Google's OAuth callback.
 */
const googleCallback = async (
    req: Request,
    res: Response,
    next: NextFunction
): Promise<void> => {
    try {
        const { code, error } = req.query;

        if (error) {
            throw new AppError(
                400,
                `Google OAuth error: ${String(error)}`
            );
        }

        if (!code || typeof code !== "string") {
            throw new AppError(
                400,
                "Authorization code is required"
            );
        }

        const { clientId } = getGoogleOAuthEnv();
        const client = getGoogleOAuthClient();

        let tokens;

        try {
            const tokenResponse = await client.getToken(code);
            tokens = tokenResponse.tokens;
        } catch {
            throw new AppError(
                400,
                "Invalid authorization code or failed to retrieve tokens from Google"
            );
        }

        if (!tokens.id_token) {
            throw new AppError(
                400,
                "Google did not return an ID token"
            );
        }

        let payload;

        try {
            const ticket = await client.verifyIdToken({
                idToken: tokens.id_token,
                audience: clientId,
            });

            payload = ticket.getPayload();
        } catch {
            throw new AppError(
                401,
                "Failed to verify Google ID token"
            );
        }

        if (!payload || !payload.email) {
            throw new AppError(
                400,
                "Google account does not provide an email address"
            );
        }

        const email = payload.email
            .toLowerCase()
            .trim();

        const name =
            payload.name ||
            email.split("@")[0] ||
            "User";

        const image = payload.picture || "";

        let user = await authRepository.findByEmail(email);

        /**
         * Existing SpotNest user
         */
        if (user) {
            if (user.isBlock) {
                throw new AppError(
                    403,
                    "Account is blocked"
                );
            }

            if (user.status !== UserStatus.ACTIVE) {
                throw new AppError(
                    403,
                    "Account is not active"
                );
            }

            // Update Google profile image if available.
            if (image && !user.image) {
                user.image = image;
                await user.save();
            }
        } else {
            /**
             * New SpotNest user
             *
             * Google users don't need to know this
             * random password because authentication
             * happens through Google.
             */
            const randomSecret = crypto
                .randomBytes(32)
                .toString("hex");

            const password_hash = await bcrypt.hash(
                randomSecret,
                10
            );

            user = await User.create({
                name,
                email,
                password_hash,
                image,
                role: UserRole.USER,
                status: UserStatus.ACTIVE,
                isVerified: true,
                isBlock: false,
                permissions: [],
            });
        }

        /**
         * Generate SpotNest JWT tokens.
         */
        const accessToken = signAccessToken(
            buildTokenPayload(user, "access")
        );

        const refreshToken = signRefreshToken(
            buildTokenPayload(user, "refresh")
        );

        const authResponse = {
            user: {
                id: user._id.toString(),
                name: user.name,
                email: user.email,
                role: user.role,
                ...(user.image
                    ? { image: user.image }
                    : {}),
            },
            token: accessToken,
            refreshToken,
        };

        /**
         * Optional JSON response.
         *
         * Useful for testing.
         *
         * Example:
         * /google/callback?format=json
         */
        if (req.query.format === "json") {
            res.status(200).json({
                success: true,
                data: authResponse,
            });

            return;
        }

        /**
         * Redirect back to frontend.
         */
        const clientUrl = getClientUrl();

   const targetUrl = new URL("/oauth/callback", clientUrl);

        targetUrl.searchParams.set(
            "token",
            authResponse.token
        );

        targetUrl.searchParams.set(
            "refreshToken",
            authResponse.refreshToken
        );

        targetUrl.searchParams.set(
            "user",
            JSON.stringify(authResponse.user)
        );

        res.redirect(targetUrl.toString());
    } catch (err) {
        next(err);
    }
};

const googleOAuth = {
    googleAuth,
    googleCallback,
};

export {
    googleAuth,
    googleCallback,
};

export default googleOAuth;