import User from "./model.js";
import type { IUser } from "./type.js";

export interface CreateUserInput {
    name: string;
    email: string;
    phone?: string;
    password_hash: string;
    image?: string;
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
};
export default authRepository;
