import bcrypt from "bcryptjs";
import authRepository from "./repository.js";
import { AppError } from "../../shared/errors/AppError.js";

import {
    UserRole,
    UserStatus,
    type IUser,
    type JwtPayload,
    type AuthResponse,
    type SignupPendingResponse,
    type OwnerEmailVerifiedResponse,
} from "./type.js";

import type {
    LoginInput,
    RefreshTokenInput,
    SignupInput,
    VerifyEmailInput,
    ResendVerificationInput,
    ForgotPasswordInput,
    ResetPasswordInput,
    UpdateLocationInput,
} from "./validation.js";

import {
    verifyToken,
    toAuthResponse,
} from "../../shared/utils/token.js";

import {
    generateOtp,
    hashOtp,
    compareOtp,
} from "../../shared/utils/otp.js";

import { geocode } from "../../shared/utils/geocode.js";

import {
    uploadImage,
    deleteImage,
    uploadIdDocument,
    deleteIdDocument,
    getSignedIdDocumentUrl,
} from "../../shared/utils/cloudinary.js";

import {
    sendOtpEmail,
    sendOwnerRegistrationAlert,
    sendOwnerApprovedEmail,
    sendOwnerRejectedEmail,
} from "../../shared/utils/email.js";

import settingsRepository from "../settings/repository.js";
import notificationService from "../notifications/service.js";

// -----------------------------------------------------
// REGISTER
// -----------------------------------------------------

const register = async (
    data: SignupInput,
    file?: {
        buffer: Buffer;
        mimetype: string;
    }
): Promise<SignupPendingResponse> => {
    const settings =
        await settingsRepository.getGlobal();

    if (!settings.userRegistrationEnabled) {
        throw new AppError(
            403,
            "User registration is currently disabled"
        );
    }

    if (
        data.role === UserRole.OWNER &&
        !settings.ownerRegistrationEnabled
    ) {
        throw new AppError(
            403,
            "Owner registration is currently disabled"
        );
    }

    // Owner registration requires the certification document
    // during registration itself.
    if (
        data.role === UserRole.OWNER &&
        !file
    ) {
        throw new AppError(
            400,
            "Verification document is required for owner registration"
        );
    }

    const existing =
        await authRepository.findByEmail(data.email);

    if (existing) {
        throw new AppError(
            409,
            "Email already registered"
        );
    }

    const password_hash = await bcrypt.hash(
        data.password,
        10
    );

    const user = await authRepository.createUser({
        name: data.name,
        email: data.email,
        password_hash,
        role: data.role as UserRole,

        ...(data.role === UserRole.OWNER
            ? {
                  verificationStatus:
                      "unsubmitted" as const,
              }
            : {}),

        ...(data.phone
            ? { phone: data.phone }
            : {}),

        ...(data.image
            ? { image: data.image }
            : {}),
    });

    let uploadedDocument: {
        publicId: string;
        resourceType: "image" | "raw";
        format: "jpg" | "png" | "pdf";
    } | null = null;

    try {
        // -------------------------------------------------
        // OWNER DOCUMENT
        // -------------------------------------------------

        if (
            data.role === UserRole.OWNER &&
            file
        ) {
            uploadedDocument =
                await uploadIdDocument(
                    file.buffer,
                    user._id.toString(),
                    file.mimetype
                );

            await authRepository.submitVerificationDocument(
                user._id.toString(),
                uploadedDocument.publicId,
                uploadedDocument.resourceType,
                uploadedDocument.format
            );

            // -------------------------------------------------
            // ADMIN NOTIFICATION
            // -------------------------------------------------

            const adminIds =
                await authRepository.findAdminIds();

            await Promise.all(
                adminIds.map((adminId) =>
                    notificationService.createNotification({
                        recipient: adminId,
                        title: "New owner approval request",
                        message: `${user.name} submitted an ID document for approval.`,
                        type: "owner_approval_request",
                        referenceId:
                            user._id.toString(),
                        referenceType: "user",
                    })
                )
            );

            // Best-effort owner registration alert email.
            settingsRepository
                .getGlobal()
                .then((currentSettings) => {
                    if (
                        currentSettings.newOwnerRegistrationAlerts
                    ) {
                        sendOwnerRegistrationAlert(
                            user.email,
                            user.name
                        ).catch((err) => {
                            console.error(
                                "[EMAIL_FAILED] owner registration alert:",
                                err
                            );
                        });
                    }
                })
                .catch((err) => {
                    console.error(
                        "[SETTINGS_FAILED] owner registration alert:",
                        err
                    );
                });
        }

        // -------------------------------------------------
        // EMAIL OTP
        // -------------------------------------------------

        const otp = generateOtp();
        const otpHash = await hashOtp(otp);

        const otpExpiry = new Date(
            Date.now() +
                Number(
                    process.env.OTP_EXPIRY_MINUTES ?? 10
                ) *
                    60_000
        );

        if (settings.emailVerificationRequired) {
            await authRepository.updateOtp(
                user._id.toString(),
                otpHash,
                otpExpiry,
                "email_verify"
            );

            await sendOtpEmail(
                user.email,
                otp,
                "email_verify"
            );
        } else {
            await authRepository.markVerified(
                user._id.toString()
            );
        }
    } catch (error) {
        // If anything after user creation fails,
        // clean up the uploaded private document.
        if (uploadedDocument) {
            await deleteIdDocument(
                uploadedDocument.publicId,
                uploadedDocument.resourceType
            ).catch((cleanupError) => {
                console.error(
                    `[CLEANUP_FAILED] orphaned verification document publicId=${uploadedDocument?.publicId}`,
                    cleanupError
                );
            });
        }

        // Prevent partially-created accounts.
        await authRepository
            .deleteUser(user._id.toString())
            .catch((cleanupError) => {
                console.error(
                    `[CLEANUP_FAILED] could not delete partially-created user userId=${user._id}`,
                    cleanupError
                );
            });

        throw error;
    }

    if (data.role === UserRole.OWNER) {
        return {
            message:
                "Owner account created successfully. Check your email for the verification code. After email verification, your registration will be reviewed by an administrator.",
            user: {
                id: user._id.toString(),
                name: user.name,
                email: user.email,
            },
        };
    }

    return {
        message:
            "Account created. Check your email for a verification code.",
        user: {
            id: user._id.toString(),
            name: user.name,
            email: user.email,
        },
    };
};

// -----------------------------------------------------
// LOGIN
// -----------------------------------------------------

const login = async (
    data: LoginInput
): Promise<AuthResponse> => {
    const user =
        await authRepository.findByEmail(data.email);

    if (!user) {
        throw new AppError(
            401,
            "Invalid email or password"
        );
    }

    const isMatch = await bcrypt.compare(
        data.password,
        user.password_hash
    );

    if (!isMatch) {
        throw new AppError(
            401,
            "Invalid email or password"
        );
    }

    if (
        user.isBlock ||
        user.status !== UserStatus.ACTIVE
    ) {
        throw new AppError(
            403,
            "Account is not active"
        );
    }

    const settings =
        await settingsRepository.getGlobal();

    // Email verification is required for login.
    if (
        settings.emailVerificationRequired &&
        !user.isVerified
    ) {
        throw new AppError(
            403,
            "Please verify your email before logging in"
        );
    }

    // -------------------------------------------------
    // OWNER APPROVAL REQUIREMENT
    // -------------------------------------------------

    // An owner can login ONLY after admin approval.
    if (
        user.role === UserRole.OWNER &&
        user.verificationStatus !== "approved"
    ) {
        if (
            user.verificationStatus === "pending"
        ) {
            throw new AppError(
                403,
                "Your owner account is pending admin approval"
            );
        }

        if (
            user.verificationStatus === "rejected"
        ) {
            throw new AppError(
                403,
                "Your owner verification was rejected"
            );
        }

        throw new AppError(
            403,
            "Please submit your owner certification for admin approval"
        );
    }

    return toAuthResponse(user);
};

// -----------------------------------------------------
// VERIFY EMAIL
// -----------------------------------------------------

const verifyEmail = async (
    data: VerifyEmailInput
): Promise<
    AuthResponse | OwnerEmailVerifiedResponse
> => {
    const user =
        await authRepository.findByEmailWithOtp(
            data.email
        );

    const genericError = () =>
        new AppError(
            400,
            "Invalid or expired verification code"
        );

    if (
        !user ||
        !user.otpHash ||
        !user.otpExpiry ||
        user.otpType !== "email_verify"
    ) {
        throw genericError();
    }

    if (user.otpExpiry < new Date()) {
        throw genericError();
    }

    if (
        (user.otpAttempts ?? 0) >=
        Number(
            process.env.OTP_MAX_ATTEMPTS ?? 5
        )
    ) {
        throw new AppError(
            429,
            "Too many attempts. Request a new code."
        );
    }

    const isMatch = await compareOtp(
        data.otp,
        user.otpHash
    );

    if (!isMatch) {
        await authRepository.incrementOtpAttempts(
            user._id.toString()
        );

        throw genericError();
    }

    // Email verification only.
    await authRepository.markVerified(
        user._id.toString()
    );

    await authRepository.clearOtp(
        user._id.toString()
    );

    // -------------------------------------------------
    // OWNER
    // -------------------------------------------------

    // Email verification does NOT approve an owner.
    // The owner must submit certification and wait
    // for admin approval before receiving login tokens.
    if (user.role === UserRole.OWNER) {
        return {
            message:
                "Email verified. Please submit your owner certification for admin approval.",
            user: {
                id: user._id.toString(),
                name: user.name,
                email: user.email,
                role: user.role,
                verificationStatus:
                    user.verificationStatus ??
                    "unsubmitted",
            },
        };
    }

    // -------------------------------------------------
    // NORMAL USER
    // -------------------------------------------------

    // Normal users can authenticate immediately
    // after successful email verification.
    return toAuthResponse(user);
};

// -----------------------------------------------------
// RESEND EMAIL VERIFICATION
// -----------------------------------------------------

const resendVerification = async (
    data: ResendVerificationInput
): Promise<{ message: string }> => {
    const genericResponse = {
        message:
            "If that email is registered and unverified, a new code was sent.",
    };

    const user =
        await authRepository.findByEmailWithOtp(
            data.email
        );

    if (!user || user.isVerified) {
        return genericResponse;
    }

    const cooldownMs =
        Number(
            process.env
                .OTP_RESEND_COOLDOWN_SECONDS ?? 60
        ) * 1000;

    const expiryWindowMs =
        Number(
            process.env.OTP_EXPIRY_MINUTES ?? 10
        ) * 60_000;

    if (
        user.otpExpiry &&
        user.otpExpiry.getTime() - Date.now() >
            expiryWindowMs - cooldownMs
    ) {
        return genericResponse;
    }

    const otp = generateOtp();
    const otpHash = await hashOtp(otp);

    const otpExpiry = new Date(
        Date.now() + expiryWindowMs
    );

    await authRepository.updateOtp(
        user._id.toString(),
        otpHash,
        otpExpiry,
        "email_verify"
    );

    await sendOtpEmail(
        user.email,
        otp,
        "email_verify"
    );

    return genericResponse;
};

// -----------------------------------------------------
// FORGOT PASSWORD
// -----------------------------------------------------

const forgotPassword = async (
    data: ForgotPasswordInput
): Promise<{ message: string }> => {
    const genericResponse = {
        message:
            "If that email is registered, a reset code was sent.",
    };

    const user =
        await authRepository.findByEmailWithOtp(
            data.email
        );

    if (!user) {
        return genericResponse;
    }

    const cooldownMs =
        Number(
            process.env
                .OTP_RESEND_COOLDOWN_SECONDS ?? 60
        ) * 1000;

    const expiryWindowMs =
        Number(
            process.env.OTP_EXPIRY_MINUTES ?? 10
        ) * 60_000;

    if (
        user.otpExpiry &&
        user.otpExpiry.getTime() - Date.now() >
            expiryWindowMs - cooldownMs
    ) {
        return genericResponse;
    }

    const otp = generateOtp();
    const otpHash = await hashOtp(otp);

    const otpExpiry = new Date(
        Date.now() + expiryWindowMs
    );

    await authRepository.updateOtp(
        user._id.toString(),
        otpHash,
        otpExpiry,
        "password_reset"
    );

    await sendOtpEmail(
        user.email,
        otp,
        "password_reset"
    );

    return genericResponse;
};

// -----------------------------------------------------
// RESET PASSWORD
// -----------------------------------------------------

const resetPassword = async (
    data: ResetPasswordInput
): Promise<{ message: string }> => {
    const genericError = () =>
        new AppError(
            400,
            "Invalid or expired reset code"
        );

    const user =
        await authRepository.findByEmailWithOtp(
            data.email
        );

    if (
        !user ||
        !user.otpHash ||
        !user.otpExpiry ||
        user.otpType !== "password_reset"
    ) {
        throw genericError();
    }

    if (user.otpExpiry < new Date()) {
        throw genericError();
    }

    if (
        (user.otpAttempts ?? 0) >=
        Number(
            process.env.OTP_MAX_ATTEMPTS ?? 5
        )
    ) {
        throw new AppError(
            429,
            "Too many attempts. Request a new code."
        );
    }

    const isMatch = await compareOtp(
        data.otp,
        user.otpHash
    );

    if (!isMatch) {
        await authRepository.incrementOtpAttempts(
            user._id.toString()
        );

        throw genericError();
    }

    const password_hash =
        await bcrypt.hash(
            data.newPassword,
            10
        );

    await authRepository.updatePassword(
        user._id.toString(),
        password_hash
    );

    await authRepository.clearOtp(
        user._id.toString()
    );

    return {
        message:
            "Password updated. You can now log in.",
    };
};

// -----------------------------------------------------
// REFRESH TOKEN
// -----------------------------------------------------

const refresh = async (
    data: RefreshTokenInput
): Promise<AuthResponse> => {
    let decoded: JwtPayload;

    try {
        const payload = verifyToken(
            data.refreshToken
        );

        if (payload.type !== "refresh") {
            throw new AppError(
                401,
                "Invalid or expired refresh token"
            );
        }

        decoded = payload;
    } catch (err) {
        if (err instanceof AppError) {
            throw err;
        }

        throw new AppError(
            401,
            "Invalid or expired refresh token"
        );
    }

    const user =
        await authRepository.findById(
            decoded.userId
        );

    if (!user) {
        throw new AppError(
            401,
            "User no longer exists"
        );
    }

    if (
        user.isBlock ||
        user.status !== UserStatus.ACTIVE
    ) {
        throw new AppError(
            403,
            "Account is not active"
        );
    }

    // Owners must remain approved.
    if (
        user.role === UserRole.OWNER &&
        user.verificationStatus !== "approved"
    ) {
        throw new AppError(
            403,
            "Your owner account is not approved"
        );
    }

    return toAuthResponse(user);
};

// -----------------------------------------------------
// LOGOUT
// -----------------------------------------------------

const logout = async (
    _refreshToken?: string
): Promise<{ message: string }> => {
    return {
        message: "Logged out successfully",
    };
};

// -----------------------------------------------------
// UPDATE PROFILE
// -----------------------------------------------------

const updateProfile = async (
    userId: string,
    data: {
        name?: string;
        phone?: string;
    }
) => {
    const user =
        await authRepository.updateProfile(
            userId,
            data
        );

    if (!user) {
        throw new AppError(
            404,
            "User not found"
        );
    }

    return {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        phone: user.phone,
        role: user.role,
        image: user.image,
    };
};

// -----------------------------------------------------
// UPDATE LOCATION
// -----------------------------------------------------

const updateLocation = async (
    userId: string,
    data: UpdateLocationInput
) => {
    const user =
        await authRepository.findById(userId);

    if (!user) {
        throw new AppError(
            404,
            "User not found"
        );
    }

    const result =
        await geocode(data.locationName);

    if (!result) {
        throw new AppError(
            400,
            "Could not find that place. Try including the city or district, e.g. 'Mankavu, Calicut'."
        );
    }

    await authRepository.updateUserLocation(
        userId,
        result.lng,
        result.lat,
        data.locationName,
        result.displayName
    );

    return {
        message: "Location updated",
        locationName: data.locationName,
        resolvedTo: result.displayName,
    };
};

// -----------------------------------------------------
// CHANGE PASSWORD
// -----------------------------------------------------

const changePassword = async (
    userId: string,
    currentPassword: string,
    newPassword: string
) => {
    const user =
        await authRepository.findById(userId);

    if (
        !user ||
        !(await bcrypt.compare(
            currentPassword,
            user.password_hash
        ))
    ) {
        throw new AppError(
            400,
            "Current password is incorrect"
        );
    }

    await authRepository.updatePassword(
        userId,
        await bcrypt.hash(
            newPassword,
            10
        )
    );

    return {
        message:
            "Password changed successfully",
    };
};

// -----------------------------------------------------
// LIST USERS
// -----------------------------------------------------

const listUsers = async () => {
    const users =
        await authRepository.findAllUsers();

    return users.map((user) => ({
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        status: user.status,
        isVerified: user.isVerified,
        verificationStatus:
            user.verificationStatus,
        createdAt:
            user.created_at.toISOString(),
    }));
};

// -----------------------------------------------------
// PROFILE IMAGE
// -----------------------------------------------------

const uploadProfileImage = async (
    userId: string,
    file: {
        buffer: Buffer;
        mimetype: string;
    }
): Promise<{
    message: string;
    imageUrl: string;
}> => {
    const user =
        await authRepository.findByIdWithImagePublicId(
            userId
        );

    if (!user) {
        throw new AppError(
            404,
            "User not found"
        );
    }

    const previousPublicId =
        user.imagePublicId;

    const {
        publicId,
        url,
    } = await uploadImage(
        file.buffer,
        "spotnest/profiles"
    );

    try {
        await authRepository.updateProfileImage(
            userId,
            url,
            publicId
        );
    } catch (err) {
        await deleteImage(publicId).catch(
            () => {
                console.error(
                    `[CLEANUP_FAILED] orphaned Cloudinary asset publicId=${publicId}`
                );
            }
        );

        throw new AppError(
            500,
            "Failed to save profile image"
        );
    }

    if (previousPublicId) {
        deleteImage(
            previousPublicId
        ).catch(() => {
            console.error(
                `[CLEANUP_FAILED] could not delete old asset publicId=${previousPublicId}`
            );
        });
    }

    return {
        message:
            "Profile image updated successfully",
        imageUrl: url,
    };
};

// -----------------------------------------------------
// SUBMIT OWNER ID VERIFICATION
// -----------------------------------------------------

const submitIdVerification = async (
    userId: string,
    file: {
        buffer: Buffer;
        mimetype: string;
    }
): Promise<{
    message: string;
    status: string;
}> => {
    const user =
        await authRepository.findById(userId);

    if (!user) {
        throw new AppError(
            404,
            "User not found"
        );
    }

    if (user.role !== UserRole.OWNER) {
        throw new AppError(
            403,
            "Only property owners can submit owner certification"
        );
    }

    if (!user.isVerified) {
        throw new AppError(
            403,
            "Please verify your email before submitting owner certification"
        );
    }

    if (
        user.verificationStatus === "approved"
    ) {
        throw new AppError(
            409,
            "Your account is already verified"
        );
    }

    if (
        user.verificationStatus === "pending"
    ) {
        throw new AppError(
            409,
            "A verification request is already pending review"
        );
    }

    const {
        publicId,
        resourceType,
        format,
    } = await uploadIdDocument(
        file.buffer,
        userId,
        file.mimetype
    );

    try {
        await authRepository.submitVerificationDocument(
            userId,
            publicId,
            resourceType,
            format
        );
    } catch (err) {
        await deleteIdDocument(
            publicId,
            resourceType
        ).catch((cleanupError) => {
            console.error(
                `[CLEANUP_FAILED] orphaned verification document publicId=${publicId}`,
                cleanupError
            );
        });

        throw new AppError(
            500,
            "Failed to save verification document"
        );
    }

    const adminIds =
        await authRepository.findAdminIds();

    await Promise.all(
        adminIds.map((adminId) =>
            notificationService.createNotification({
                recipient: adminId,
                title: "New owner approval request",
                message: `${user.name} submitted an ID document for approval.`,
                type: "owner_approval_request",
                referenceId: userId,
                referenceType: "user",
            })
        )
    );

    settingsRepository
        .getGlobal()
        .then((settings) => {
            if (
                settings.newOwnerRegistrationAlerts
            ) {
                sendOwnerRegistrationAlert(
                    user.email,
                    user.name
                ).catch((err) => {
                    console.error(
                        "[EMAIL_FAILED] owner registration alert:",
                        err
                    );
                });
            }
        })
        .catch((err) => {
            console.error(
                "[SETTINGS_FAILED] owner registration alert:",
                err
            );
        });

    return {
        message:
            "Certification submitted for review",
        status: "pending",
    };
};

// -----------------------------------------------------
// LIST PENDING OWNER VERIFICATIONS
// -----------------------------------------------------

const listPendingVerifications =
    async (): Promise<
        Array<{
            id: string;
            name: string;
            email: string;
            phone?: string;
            status: UserStatus;
            isVerified: boolean;
            verificationStatus: string;
            created_at: Date;
            verificationSubmittedAt?: Date;
        }>
    > => {
        const users =
            await authRepository.findPendingVerifications();
return users.map((user) => ({
    id: user._id.toString(),
    name: user.name,
    email: user.email,

    ...(user.phone
        ? { phone: user.phone }
        : {}),

    status: user.status,
    isVerified: user.isVerified,

    verificationStatus:
        user.verificationStatus ?? "unsubmitted",

    created_at: user.created_at,

    ...(user.verificationSubmittedAt
        ? {
              verificationSubmittedAt:
                  user.verificationSubmittedAt,
          }
        : {}),
}));

    };

// -----------------------------------------------------
// GET OWNER ID DOCUMENT
// -----------------------------------------------------

// -----------------------------------------------------
// GET OWNER ID DOCUMENT
// -----------------------------------------------------

const getIdDocumentUrl = async (
    userId: string
): Promise<{
    url: string;
    expiresAt: Date;
}> => {
    const user =
        await authRepository.findByIdWithIdDocument(
            userId
        );

    if (!user) {
        throw new AppError(
            404,
            "User not found"
        );
    }

    if (!user.idDocumentPublicId) {
        throw new AppError(
            404,
            "Verification document not found"
        );
    }

    if (
        !user.idDocumentResourceType ||
        !user.idDocumentFormat
    ) {
        throw new AppError(
            500,
            "Verification document metadata is incomplete"
        );
    }

    const signedDocument =
        await getSignedIdDocumentUrl(
            user.idDocumentPublicId,
            user.idDocumentResourceType,
            user.idDocumentFormat
        );

    return signedDocument;
};

// -----------------------------------------------------
// APPROVE OWNER
// -----------------------------------------------------

const approveOwnerVerification =
    async (
        userId: string,
        adminId: string
    ): Promise<{ message: string }> => {
        const user =
            await authRepository.findById(userId);

        if (
            !user ||
            user.role !== UserRole.OWNER ||
            user.verificationStatus !== "pending"
        ) {
            throw new AppError(
                400,
                "No pending verification request for this user"
            );
        }

        await authRepository.approveVerification(
            userId,
            adminId
        );

        // Notify the owner.
        await notificationService.createNotification({
            recipient: userId,
            title: "Owner account approved",
            message:
                "Your owner account has been approved. You can now list properties.",
            type: "owner_approved",
            referenceId: userId,
            referenceType: "user",
        });

        // Send approval email if enabled.
        settingsRepository
            .getGlobal()
            .then((settings) => {
                if (
                    settings.ownerApprovalEmails
                ) {
                    sendOwnerApprovedEmail(
                        user.email
                    ).catch((err) => {
                        console.error(
                            "[EMAIL_FAILED] owner approved:",
                            err
                        );
                    });
                }
            })
            .catch((err) => {
                console.error(
                    "[SETTINGS_FAILED] owner approval email:",
                    err
                );
            });

        return {
            message:
                "Owner verification approved",
        };
    };

// -----------------------------------------------------
// REJECT OWNER
// -----------------------------------------------------

const rejectOwnerVerification = async (
    userId: string,
    adminId: string,
    reason: string
): Promise<{ message: string }> => {
    const user =
        await authRepository.findByIdWithIdDocument(
            userId
        );

    if (
        !user ||
        user.role !== UserRole.OWNER ||
        user.verificationStatus !== "pending"
    ) {
        throw new AppError(
            400,
            "No pending verification request for this user"
        );
    }

    const idPublicId =
        user.idDocumentPublicId;

    const idResourceType =
        user.idDocumentResourceType;

    // Mark the verification as rejected and
    // remove document metadata from database.
    await authRepository.rejectVerification(
        userId,
        adminId,
        reason
    );

    // Delete the actual private Cloudinary document.
    if (
        idPublicId &&
        idResourceType
    ) {
        await deleteIdDocument(
            idPublicId,
            idResourceType
        ).catch((err) => {
            console.error(
                `[CLEANUP_FAILED] could not delete rejected ID doc publicId=${idPublicId}`,
                err
            );
        });
    }

    // Notify the owner.
    await notificationService.createNotification({
        recipient: userId,
        title: "Owner account rejected",
        message:
            `Your owner registration request was rejected: ${reason}`,
        type: "owner_rejected",
        referenceId: userId,
        referenceType: "user",
    });

    // Send rejection email.
    await sendOwnerRejectedEmail(
        user.email,
        reason
    ).catch((err) => {
        console.error(
            "[EMAIL_FAILED] owner rejected:",
            err
        );
    });

    return {
        message:
            "Owner verification rejected",
    };
};

// -----------------------------------------------------
// EXPORT
// -----------------------------------------------------

const authService = {
    register,
    login,
    verifyEmail,
    resendVerification,
    forgotPassword,
    resetPassword,
    refresh,
    logout,
    updateProfile,
    updateLocation,
    changePassword,
    listUsers,
    uploadProfileImage,
    submitIdVerification,
    listPendingVerifications,
    getIdDocumentUrl,
    approveOwnerVerification,
    rejectOwnerVerification,
};

export default authService;