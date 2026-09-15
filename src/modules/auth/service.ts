import bcrypt from "bcryptjs";
import { Resend } from "resend";
import authRepository from "./repository.js";
import { AppError } from "../../shared/errors/AppError.js";
import { UserStatus, type IUser, type JwtPayload, type AuthResponse, type SignupPendingResponse } from "./type.js";
import type { LoginInput, RefreshTokenInput, SignupInput, VerifyEmailInput, ResendVerificationInput, ForgotPasswordInput, ResetPasswordInput } from "./validation.js";
import { verifyToken, toAuthResponse } from "../../shared/utils/token.js";
import { generateOtp, hashOtp, compareOtp } from "../../shared/utils/otp.js";



const sendOtpEmail = async (
    to: string,
    otp: string,
    type: "email_verify" | "password_reset"
): Promise<void> => {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const subject = type === "email_verify" ? "Verify your SpotNest email" : "Reset your SpotNest password";
    const expiry = process.env.OTP_EXPIRY_MINUTES ?? "10";
    await resend.emails.send({
        from: process.env.EMAIL_FROM || '"SpotNest" <no-reply@stitchflow.space>',
        to,
        subject,
        html: `
            <h2>Your SpotNest ${type === "email_verify" ? "Verification Code" : "Password Reset Code"}</h2>
            <p>Your code is: <strong>${otp}</strong></p>
            <p>This code expires in ${expiry} minutes.</p>
        `,
    });
};

const register = async (data: SignupInput): Promise<SignupPendingResponse> => {
    const existing = await authRepository.findByEmail(data.email);
    if (existing) {
        throw new AppError(409, "Email already registered");
    }

    const password_hash = await bcrypt.hash(data.password, 10);

    const user = await authRepository.createUser({
        name: data.name,
        email: data.email,
        password_hash,
        ...(data.phone ? { phone: data.phone } : {}),
        ...(data.image ? { image: data.image } : {}),
    });

    const otp = generateOtp();
    const otpHash = await hashOtp(otp);
    const otpExpiry = new Date(Date.now() + Number(process.env.OTP_EXPIRY_MINUTES ?? 10) * 60_000);

    await authRepository.updateOtp(user._id.toString(), otpHash, otpExpiry, "email_verify");
    await sendOtpEmail(user.email, otp, "email_verify");

    return {
        message: "Account created. Check your email for a verification code.",
        user: { id: user._id.toString(), name: user.name, email: user.email },
    };
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

    if (!user.isVerified) {
        throw new AppError(403, "Please verify your email before logging in");
    }

    return toAuthResponse(user);
};

const verifyEmail = async (data: VerifyEmailInput): Promise<AuthResponse> => {
    const user = await authRepository.findByEmailWithOtp(data.email);

    const genericError = () => new AppError(400, "Invalid or expired verification code");

    if (!user || !user.otpHash || !user.otpExpiry || user.otpType !== "email_verify") {
        throw genericError();
    }

    if (user.otpExpiry < new Date()) {
        throw genericError();
    }

    if ((user.otpAttempts ?? 0) >= Number(process.env.OTP_MAX_ATTEMPTS ?? 5)) {
        throw new AppError(429, "Too many attempts. Request a new code.");
    }

    const isMatch = await compareOtp(data.otp, user.otpHash);
    if (!isMatch) {
        await authRepository.incrementOtpAttempts(user._id.toString());
        throw genericError();
    }

    await authRepository.markVerified(user._id.toString());
    await authRepository.clearOtp(user._id.toString());

    return toAuthResponse(user);
};

const resendVerification = async (data: ResendVerificationInput): Promise<{ message: string }> => {
    const genericResponse = { message: "If that email is registered and unverified, a new code was sent." };

    const user = await authRepository.findByEmailWithOtp(data.email);
    if (!user || user.isVerified) {
        return genericResponse;
    }

    const cooldownMs = Number(process.env.OTP_RESEND_COOLDOWN_SECONDS ?? 60) * 1000;
    const expiryWindowMs = Number(process.env.OTP_EXPIRY_MINUTES ?? 10) * 60_000;
    if (user.otpExpiry && user.otpExpiry.getTime() - Date.now() > expiryWindowMs - cooldownMs) {
        return genericResponse;
    }

    const otp = generateOtp();
    const otpHash = await hashOtp(otp);
    const otpExpiry = new Date(Date.now() + expiryWindowMs);

    await authRepository.updateOtp(user._id.toString(), otpHash, otpExpiry, "email_verify");
    await sendOtpEmail(user.email, otp, "email_verify");

    return genericResponse;
};

const forgotPassword = async (data: ForgotPasswordInput): Promise<{ message: string }> => {
    const genericResponse = { message: "If that email is registered, a reset code was sent." };

    const user = await authRepository.findByEmailWithOtp(data.email);
    if (!user) {
        return genericResponse;
    }

    const cooldownMs = Number(process.env.OTP_RESEND_COOLDOWN_SECONDS ?? 60) * 1000;
    const expiryWindowMs = Number(process.env.OTP_EXPIRY_MINUTES ?? 10) * 60_000;
    if (user.otpExpiry && user.otpExpiry.getTime() - Date.now() > expiryWindowMs - cooldownMs) {
        return genericResponse;
    }

    const otp = generateOtp();
    const otpHash = await hashOtp(otp);
    const otpExpiry = new Date(Date.now() + expiryWindowMs);

    await authRepository.updateOtp(user._id.toString(), otpHash, otpExpiry, "password_reset");
    await sendOtpEmail(user.email, otp, "password_reset");

    return genericResponse;
};

const resetPassword = async (data: ResetPasswordInput): Promise<{ message: string }> => {
    const genericError = () => new AppError(400, "Invalid or expired reset code");

    const user = await authRepository.findByEmailWithOtp(data.email);
    if (!user || !user.otpHash || !user.otpExpiry || user.otpType !== "password_reset") {
        throw genericError();
    }

    if (user.otpExpiry < new Date()) {
        throw genericError();
    }

    if ((user.otpAttempts ?? 0) >= Number(process.env.OTP_MAX_ATTEMPTS ?? 5)) {
        throw new AppError(429, "Too many attempts. Request a new code.");
    }

    const isMatch = await compareOtp(data.otp, user.otpHash);
    if (!isMatch) {
        await authRepository.incrementOtpAttempts(user._id.toString());
        throw genericError();
    }

    const password_hash = await bcrypt.hash(data.newPassword, 10);
    await authRepository.updatePassword(user._id.toString(), password_hash);
    await authRepository.clearOtp(user._id.toString());

    return { message: "Password updated. You can now log in." };
};

const refresh = async (data: RefreshTokenInput): Promise<AuthResponse> => {
    let decoded: JwtPayload;
    try {
        const payload = verifyToken(data.refreshToken);
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

const authService = {
    register,
    login,
    verifyEmail,
    resendVerification,
    forgotPassword,
    resetPassword,
    refresh,
};
export default authService;
