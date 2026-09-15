import User from "./model.js";
import type { IUser, UserRole } from "./type.js";

export interface CreateUserInput {
    name: string;
    email: string;
    phone?: string;
    password_hash: string;
    image?: string;
    role?: UserRole; // NEW
}

const createUser = async (data: CreateUserInput): Promise<IUser> => {
    const user = await User.create(data);
    return user;
};

const findByEmail = async (email: string): Promise<IUser | null> => {
    return User.findOne({ email: email.toLowerCase().trim() });
};

const findById = async (id: string): Promise<IUser | null> => {
    return User.findById(id);
};

const findByEmailWithOtp = async (email: string): Promise<IUser | null> => {
    return User.findOne({ email: email.toLowerCase().trim() })
        .select("+otpHash +otpExpiry +otpType +otpAttempts");
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

const incrementOtpAttempts = async (userId: string): Promise<number> => {
    const user = await User.findByIdAndUpdate(
        userId,
        { $inc: { otpAttempts: 1 } },
        { new: true }
    ).select("+otpAttempts");
    return user?.otpAttempts ?? 0;
};

const clearOtp = async (userId: string): Promise<void> => {
    await User.findByIdAndUpdate(userId, {
        $unset: { otpHash: 1, otpExpiry: 1, otpType: 1, otpAttempts: 1 },
    });
};

const updatePassword = async (userId: string, password_hash: string): Promise<void> => {
    await User.findByIdAndUpdate(userId, { password_hash });
};

const markVerified = async (userId: string): Promise<void> => {
    await User.findByIdAndUpdate(userId, { isVerified: true });
};

// Profile picture
const findByIdWithImagePublicId = async (userId: string): Promise<IUser | null> => {
    return User.findById(userId).select("+imagePublicId");
};

const updateProfileImage = async (userId: string, imageUrl: string, imagePublicId: string): Promise<void> => {
    await User.findByIdAndUpdate(userId, { image: imageUrl, imagePublicId });
};

// Owner ID verification
const submitVerificationDocument = async (userId: string, publicId: string): Promise<void> => {
    await User.findByIdAndUpdate(userId, {
        $set: {
            idDocumentPublicId: publicId,
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

const findPendingVerifications = async (): Promise<IUser[]> => {
    return User.find({ verificationStatus: "pending" }).select("name email verificationSubmittedAt");
};

const findByIdWithIdDocument = async (userId: string): Promise<IUser | null> => {
    return User.findById(userId).select("+idDocumentPublicId");
};

const approveVerification = async (userId: string, adminId: string): Promise<void> => {
    await User.findByIdAndUpdate(userId, {
        verificationStatus: "approved",
        verificationReviewedAt: new Date(),
        verificationReviewedBy: adminId,
    });
};

const rejectVerification = async (userId: string, adminId: string, reason: string): Promise<void> => {
    await User.findByIdAndUpdate(userId, {
        $set: {
            verificationStatus: "rejected",
            rejectionReason: reason,
            verificationReviewedAt: new Date(),
            verificationReviewedBy: adminId,
        },
        $unset: { idDocumentPublicId: 1 },
    });
};

const authRepository = {
    createUser,
    findByEmail,
    findById,
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
