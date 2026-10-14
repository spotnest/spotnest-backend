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

// --------------------------------------------------
// Create / Delete
// --------------------------------------------------

const createUser = async (
    data: CreateUserInput
): Promise<IUser> => {
    const user = await User.create(data);
    return user;
};

const deleteUser = async (
    userId: string
): Promise<void> => {
    await User.findByIdAndDelete(userId);
};

// --------------------------------------------------
// Find Users
// --------------------------------------------------

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
            "name email phone role status isVerified verificationStatus created_at"
        )
        .sort({ created_at: -1 });
};

const adminFindUsers = async (options: {
    page: number;
    limit: number;
    role?: string | undefined;
    status?: string | undefined;
    verificationStatus?: string | undefined;
    search?: string | undefined;
}): Promise<{ users: IUser[]; total: number }> => {
    const filter: Record<string, unknown> = {};

    if (options.role) {
        filter.role = options.role;
    }
    if (options.status) {
        filter.status = options.status;
    }
    if (options.verificationStatus) {
        filter.verificationStatus = options.verificationStatus;
    }
    if (options.search && options.search.trim()) {
        const regex = new RegExp(options.search.trim(), "i");
        filter.$or = [{ name: regex }, { email: regex }, { phone: regex }];
    }

    const skip = (options.page - 1) * options.limit;
    const [users, total] = await Promise.all([
        User.find(filter)
            .select("name email phone role status isVerified verificationStatus rejectionReason image created_at")
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(options.limit)
            .lean(),
        User.countDocuments(filter),
    ]);

    return { users: users as unknown as IUser[], total };
};

const adminUpdateUser = async (
    userId: string,
    data: { [K in "name" | "email" | "phone" | "role" | "status" | "isVerified" | "verificationStatus"]?: IUser[K] | undefined }
): Promise<IUser | null> => {
    return User.findByIdAndUpdate(
        userId,
        { $set: data },
        { returnDocument: "after", runValidators: true }
    );
};



// --------------------------------------------------
// Admins
// --------------------------------------------------

/**
 * Find admin user IDs.
 *
 * Used by the notification service when a new owner
 * verification request is submitted.
 */
const findAdminIds = async (): Promise<string[]> => {
    const admins = await User.find({
        role: UserRole.ADMIN,
    })
        .select("_id")
        .lean();

    return admins.map((admin) =>
        admin._id.toString()
    );
};

// --------------------------------------------------
// OTP
// --------------------------------------------------

/**
 * Find a user with OTP fields.
 *
 * OTP fields are excluded from normal User queries,
 * so they must be explicitly selected here.
 */
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
    otpType:
        | "email_verify"
        | "password_reset"
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
        {
            $inc: {
                otpAttempts: 1,
            },
        },
        {
            returnDocument: "after",
        }
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

// --------------------------------------------------
// Email Verification
// --------------------------------------------------

/**
 * Email verification only.
 *
 * IMPORTANT:
 *
 * isVerified = email verification
 * verificationStatus = owner/admin verification
 *
 * This method must NOT approve an owner.
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
// Profile Picture
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
// Owner ID Verification
// --------------------------------------------------

/**
 * Save the owner's verification document.
 *
 * IMPORTANT:
 *
 * This does NOT move the owner to "pending".
 *
 * Registration flow:
 *
 * document upload
 *       ↓
 * unsubmitted
 *       ↓
 * email verification
 *       ↓
 * markVerificationPending()
 *       ↓
 * pending
 *       ↓
 * admin review
 */
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
            verificationStatus: "unsubmitted",
        },
        $unset: {
            rejectionReason: 1,
            verificationReviewedAt: 1,
            verificationReviewedBy: 1,
        },
    });
};

/**
 * Move an email-verified owner into the
 * admin-review state.
 *
 * This is intentionally separate from
 * submitVerificationDocument().
 */
const markVerificationPending = async (
    userId: string
): Promise<void> => {
    const result = await User.findOneAndUpdate(
        {
            _id: userId,
            role: UserRole.OWNER,
            isVerified: true,
            verificationStatus: "unsubmitted",
        },
        {
            $set: {
                verificationStatus: "pending",
                verificationSubmittedAt: new Date(),
            },
            $unset: {
                rejectionReason: 1,
                verificationReviewedAt: 1,
                verificationReviewedBy: 1,
            },
        }
    );

    if (!result) {
        throw new Error(
            "Owner verification could not be moved to pending"
        );
    }
};

/**
 * Return only owners whose verification request
 * is actually pending.
 */
const findPendingVerifications = async (): Promise<
    IUser[]
> => {
    return User.find({
        role: UserRole.OWNER,
        verificationStatus: "pending",
    })
        .select(
            "name email phone status isVerified verificationStatus created_at verificationSubmittedAt +idDocumentPublicId +idDocumentResourceType +idDocumentFormat"
        )
        .sort({
            verificationSubmittedAt: -1,
        });
};

/**
 * Fetch all information required to securely
 * access an owner's verification document.
 */
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
            isVerified: true,
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

/**
 * Reject owner verification.
 *
 * Document metadata is removed from the database.
 * The service layer deletes the actual Cloudinary asset.
 */
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
// User Location
// --------------------------------------------------

const updateUserLocation = async (
    userId: string,
    lng: number,
    lat: number,
    locationName: string,
    locationResolvedName: string
): Promise<void> => {
    await User.findByIdAndUpdate(userId, {
        $set: {
            location: {
                type: "Point",
                coordinates: [lng, lat],
            },
            locationName,
            locationResolvedName,
            locationUpdatedAt: new Date(),
        },
    });
};

// --------------------------------------------------
// Repository Export
// --------------------------------------------------

const authRepository = {
    createUser,
    deleteUser,

    findByEmail,
    findById,
    updateProfile,
    findAllUsers,
    adminFindUsers,
    adminUpdateUser,
    findAdminIds,

    findByEmailWithOtp,
    updateOtp,
    incrementOtpAttempts,
    clearOtp,
    updatePassword,

    markVerified,

    findByIdWithImagePublicId,
    updateProfileImage,

    submitVerificationDocument,
    markVerificationPending,
    findPendingVerifications,
    findByIdWithIdDocument,
    approveVerification,
    rejectVerification,

    updateUserLocation,
};

export default authRepository;