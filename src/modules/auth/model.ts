import mongoose, { Schema } from "mongoose";
import { UserRole, UserStatus, type IUser } from "./type.js";

const userSchema = new Schema<IUser>(
    {
        name: {
            type: String,
            required: true,
            maxlength: 100,
        },
        email: {
            type: String,
            required: true,
            unique: true,
            maxlength: 150,
            lowercase: true,
            trim: true,
        },
        phone: {
            type: String,
            maxlength: 20,
        },
        password_hash: {
            type: String,
            required: true,
            maxlength: 255,
        },
        image: {
            type: String,
            default: "",
        },
        role: {
            type: String,
            enum: Object.values(UserRole),
            required: true,
            default: UserRole.USER,
        },
        isBlock: {
            type: Boolean,
            default: false,
        },
        permissions: {
            type: [String],
            default: [],
        },
        isVerified: {
            type: Boolean,
            default: false,
        },
        status: {
            type: String,
            enum: Object.values(UserStatus),
            required: true,
            default: UserStatus.ACTIVE,
        },
    },
    {
        timestamps: { createdAt: "created_at", updatedAt: "updated_at" },
    }
);

const User = mongoose.model<IUser>("User", userSchema);

export default User;