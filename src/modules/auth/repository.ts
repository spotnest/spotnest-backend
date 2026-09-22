import User from "./model.js";
import { UserRole, type IUser } from "./type.js";

export interface CreateUserInput {
    name: string;
    email: string;
    phone?: string;
    password_hash: string;
    image?: string;
    role?: UserRole;
    isVerified?: boolean;
    verificationStatus?:
        | "unsubmitted"
        | "pending"
        | "approved"
        | "rejected";
}

const createUser = async (
    data: CreateUserInput
): Promise<IUser> => {
    const user = await User.create(data);
    return user;
};

const findByEmail = async (
    email: string
): Promise<IUser | null> => {
    return User.findOne({
        email: email.toLowerCase().trim(),
    });
};

const findById = async (
    id: string
): Promise<IUser | null> => {
    return User.findById(id);
};

const updateProfile = async (
    userId: string,
    data: {
        name?: string;
        phone?: string;
    }
): Promise<IUser | null> => {
    return User.findByIdAndUpdate(
        userId,
        { $set: data },
        { returnDocument: "after" }
    );
};

const findAllUsers = async (): Promise<IUser[]> => {
    return User.find({})
        .select(
            "name email role status isVerified created_at"
        )
        .sort({ created_at: -1 });
};

const findByEmailWithOtp = async (
    email: string
): Promise<IUser | null> => {
    return User.findOne({
        email: email.toLowerCase().trim(),
    }).select(
        "+otpHash +otpExpiry +otpType +otpAttempts"
    );
};

const updateOtp = async (
    userId: string,
    otpHash: string,
    otpExpiry: Date,
    otpType: "email_verify" | "password_reset"
): Promise<void> => {
    await User.findByIdAndUpdate(userId, {
        otpHash,
        otpExpiry,
        otpType,
        otpAttempts: 0,
    });
};

const incrementOtpAttempts = async (
    userId: string
): Promise<number> => {
    const user = await User.findByIdAndUpdate(
        userId,
        { $inc: { otpAttempts: 1 } },
        { returnDocument: "after" }
    ).select("+otpAttempts");

    return user?.otpAttempts ?? 0;
};

const clearOtp = async (
    userId: string
): Promise<void> => {
    await User.findByIdAndUpdate(userId, {
        $unset: {
            otpHash: 1,
            otpExpiry: 1,
            otpType: 1,
            otpAttempts: 1,
        },
    });
};

const updatePassword = async (
    userId: string,
    password_hash: string
): Promise<void> => {
    await User.findByIdAndUpdate(userId, {
        password_hash,
    });
};

/**
 * Email verification only.
 *
 * IMPORTANT:
 * isVerified represents EMAIL verification.
 * It does NOT represent owner/admin approval.
 */
const markVerified = async (
    userId: string
): Promise<void> => {
    await User.findByIdAndUpdate(userId, {
        $set: {
            isVerified: true,
        },
    });
};

// --------------------------------------------------
// Profile picture
// --------------------------------------------------

const findByIdWithImagePublicId = async (
    userId: string
): Promise<IUser | null> => {
    return User.findById(userId).select(
        "+imagePublicId"
    );
};

const updateProfileImage = async (
    userId: string,
    imageUrl: string,
    imagePublicId: string
): Promise<void> => {
    await User.findByIdAndUpdate(userId, {
        image: imageUrl,
        imagePublicId,
    });
};

// --------------------------------------------------
// Owner ID verification
// --------------------------------------------------

const submitVerificationDocument = async (
    userId: string,
    publicId: string,
    resourceType: "image" | "raw",
    format: "jpg" | "png" | "pdf"
): Promise<void> => {
    await User.findByIdAndUpdate(userId, {
        $set: {
            idDocumentPublicId: publicId,
            idDocumentResourceType: resourceType,
            idDocumentFormat: format,
            verificationStatus: "pending",
            verificationSubmittedAt: new Date(),
        },
        $unset: {
            rejectionReason: 1,
            verificationReviewedAt: 1,
            verificationReviewedBy: 1,
        },
    });
};

const findPendingVerifications = async (): Promise<
    IUser[]
> => {
    return User.find({
        role: UserRole.OWNER,
        verificationStatus: "pending",
    })
        .select(
            "name email phone status isVerified verificationStatus created_at verificationSubmittedAt"
        )
        .sort({
            verificationSubmittedAt: -1,
        });
};

const findByIdWithIdDocument = async (
    userId: string
): Promise<IUser | null> => {
    return User.findById(userId).select(
        "+idDocumentPublicId +idDocumentResourceType +idDocumentFormat"
    );
};

/**
 * Approve owner verification.
 *
 * IMPORTANT:
 * This does NOT change isVerified.
 *
 * isVerified = email verification
 * verificationStatus = owner verification
 */
const approveVerification = async (
    userId: string,
    adminId: string
): Promise<void> => {
    const result = await User.findOneAndUpdate(
        {
            _id: userId,
            role: UserRole.OWNER,
            verificationStatus: "pending",
        },
        {
            $set: {
                verificationStatus: "approved",
                verificationReviewedAt: new Date(),
                verificationReviewedBy: adminId,
            },
        },
        {
            new: true,
        }
    );

    if (!result) {
        throw new Error(
            "Owner verification request not found or already processed"
        );
    }
};

const rejectVerification = async (
    userId: string,
    adminId: string,
    reason: string
): Promise<void> => {
    await User.findByIdAndUpdate(userId, {
        $set: {
            verificationStatus: "rejected",
            rejectionReason: reason,
            verificationReviewedAt: new Date(),
            verificationReviewedBy: adminId,
        },
        $unset: {
            idDocumentPublicId: 1,
            idDocumentResourceType: 1,
            idDocumentFormat: 1,
        },
    });
};

// --------------------------------------------------
// Repository
// --------------------------------------------------

const authRepository = {
    createUser,
    findByEmail,
    findById,
    updateProfile,
    findAllUsers,
    findByEmailWithOtp,
    updateOtp,
    incrementOtpAttempts,
    clearOtp,
    updatePassword,
    markVerified,
    findByIdWithImagePublicId,
    updateProfileImage,
    submitVerificationDocument,
    findPendingVerifications,
    findByIdWithIdDocument,
    approveVerification,
    rejectVerification,
};

export default authRepository;
