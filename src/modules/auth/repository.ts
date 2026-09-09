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

const authRepository = { createUser, findByEmail, findById };
export default authRepository;
