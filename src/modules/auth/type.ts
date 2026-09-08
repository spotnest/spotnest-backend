import { Document } from "mongoose";

export enum UserRole {
    USER = "user",
    ADMIN = "admin",
    OWNER = "owner",
}

export enum UserStatus {
    ACTIVE = "active",
    INACTIVE = "inactive",
    SUSPENDED = "suspended",
}


export interface IUser extends Document {
    name: string;
    email: string;
    phone?: string;
    password_hash: string;
    image?: string;
    role: UserRole;
    isBlock: boolean;
    isPermission?: string;
    isVerified: boolean;
    status: UserStatus;
    created_at: Date;
    updated_at: Date;
}