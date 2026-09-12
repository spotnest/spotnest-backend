import bcrypt from "bcryptjs";
import authRepository from "./repository.js";
import { AppError } from "../../shared/errors/AppError.js";
import { UserRole, UserStatus, type IUser, type JwtPayload, type AuthResponse, type SignupPendingResponse } from "./type.js";
import type { LoginInput, RefreshTokenInput, SignupInput, VerifyEmailInput, ResendVerificationInput, ForgotPasswordInput, ResetPasswordInput } from "./validation.js";
import { verifyToken, toAuthResponse } from "../../shared/utils/token.js";
import { generateOtp, hashOtp, compareOtp } from "../../shared/utils/otp.js";
import { uploadImage, deleteImage, uploadIdDocument, getSignedIdDocumentUrl } from "../../shared/utils/cloudinary.js";
import { sendOtpEmail, sendOwnerRegistrationAlert, sendOwnerApprovedEmail, sendOwnerRejectedEmail } from "../../shared/utils/email.js";

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
        role: data.role as UserRole,
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

// ---- Profile picture ----

const uploadProfileImage = async (
    userId: string,
    file: { buffer: Buffer; mimetype: string }
): Promise<{ message: string; imageUrl: string }> => {
    const user = await authRepository.findByIdWithImagePublicId(userId);
    if (!user) {
        throw new AppError(404, "User not found");
    }

    const previousPublicId = user.imagePublicId;
    const { publicId, url } = await uploadImage(file.buffer, "spotnest/profiles");

    try {
        await authRepository.updateProfileImage(userId, url, publicId);
    } catch (err) {
        await deleteImage(publicId).catch(() => {
            console.error(`[CLEANUP_FAILED] orphaned Cloudinary asset publicId=${publicId}`);
        });
        throw new AppError(500, "Failed to save profile image");
    }

    if (previousPublicId) {
        // Best-effort — don't fail the request if cleanup of the old image fails.
        deleteImage(previousPublicId).catch(() => {
            console.error(`[CLEANUP_FAILED] could not delete old asset publicId=${previousPublicId}`);
        });
    }

    return { message: "Profile image updated successfully", imageUrl: url };
};

// ---- Owner ID verification ----

const submitIdVerification = async (
    userId: string,
    file: { buffer: Buffer; mimetype: string }
): Promise<{ message: string; status: string }> => {
    const user = await authRepository.findById(userId);
    if (!user) {
        throw new AppError(404, "User not found");
    }
    if (user.verificationStatus === "approved") {
        throw new AppError(409, "Your account is already verified");
    }
    if (user.verificationStatus === "pending") {
        throw new AppError(409, "A verification request is already pending review");
    }

    const { publicId } = await uploadIdDocument(file.buffer, userId);
    await authRepository.submitVerificationDocument(userId, publicId);

    // Best-effort — a failed admin-alert email should never break submission.
    const { email, name } = user;
    sendOwnerRegistrationAlert(email, name).catch((err) => {
        console.error("[EMAIL_FAILED] owner registration alert:", err);
    });

    return { message: "ID submitted for review", status: "pending" };
};

const listPendingVerifications = async (): Promise<
    { id: string; name: string; email: string; submittedAt?: Date }[]
> => {
    const users = await authRepository.findPendingVerifications();
    return users.map((u) => ({
        id: u._id.toString(),
        name: u.name,
        email: u.email,
        ...(u.verificationSubmittedAt ? { submittedAt: u.verificationSubmittedAt } : {}),
    }));
};

const getIdDocumentUrl = async (userId: string, adminId: string): Promise<{ url: string; expiresAt: Date }> => {
    const user = await authRepository.findByIdWithIdDocument(userId);
    if (!user || !user.idDocumentPublicId) {
        throw new AppError(404, "No verification document found for this user");
    }

    // Minimum acceptable audit trail for something this sensitive — replace
    // with a real audit-log table before production.
    console.log(`[ID_DOCUMENT_ACCESS] admin=${adminId} viewed userId=${userId} at ${new Date().toISOString()}`);

    return getSignedIdDocumentUrl(user.idDocumentPublicId);
};

const approveOwnerVerification = async (userId: string, adminId: string): Promise<{ message: string }> => {
    const user = await authRepository.findById(userId);
    if (!user || user.verificationStatus !== "pending") {
        throw new AppError(400, "No pending verification request for this user");
    }
    await authRepository.approveVerification(userId, adminId);

    sendOwnerApprovedEmail(user.email).catch((err) => {
        console.error("[EMAIL_FAILED] owner approved:", err);
    });

    return { message: "Owner verification approved" };
};

const rejectOwnerVerification = async (
    userId: string,
    adminId: string,
    reason: string
): Promise<{ message: string }> => {
    const user = await authRepository.findByIdWithIdDocument(userId);
    if (!user || user.verificationStatus !== "pending") {
        throw new AppError(400, "No pending verification request for this user");
    }

    const idPublicId = user.idDocumentPublicId;

    // Clears idDocumentPublicId ($unset) in the same write as status: "rejected",
    // so no signed URL can ever be minted for a deleted asset.
    await authRepository.rejectVerification(userId, adminId, reason);

    if (idPublicId) {
        // Best-effort cleanup of the now-invalid document — a failure here leaves
        // an orphaned private asset, never a dead link.
        await deleteImage(idPublicId).catch((err) => {
            console.error(`[CLEANUP_FAILED] could not delete rejected ID doc publicId=${idPublicId}`, err);
        });
    }

    // Best-effort — don't let a flaky email provider block the rejection.
    await sendOwnerRejectedEmail(user.email, reason).catch((err) => {
        console.error("[EMAIL_FAILED] owner rejected:", err);
    });

    return { message: "Owner verification rejected" };
};

const authService = {
    register,
    login,
    verifyEmail,
    resendVerification,
    forgotPassword,
    resetPassword,
    refresh,
    uploadProfileImage,
    submitIdVerification,
    listPendingVerifications,
    getIdDocumentUrl,
    approveOwnerVerification,
    rejectOwnerVerification,
};
export default authService;
