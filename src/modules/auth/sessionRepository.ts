
import Session from "./sessionModel.js";

interface CreateSessionInput {
    userId: string;
    tokenHash: string;
    expiresAt: Date;
}

const createSession = async (data: CreateSessionInput) => {
    return Session.create(data);
};

const findActiveSession = async (tokenHash: string) => {
    return Session.findOne({
        tokenHash,
        revokedAt: { $exists: false },
        expiresAt: { $gt: new Date() },
    });
};

const revokeSession = async (
    tokenHash: string
): Promise<boolean> => {
    const result = await Session.updateOne(
        {
            tokenHash,
            revokedAt: { $exists: false },
            expiresAt: { $gt: new Date() },
        },
        {
            $set: { revokedAt: new Date() },
        }
    );

    return result.modifiedCount === 1;
};

const sessionRepository = {
    createSession,
    findActiveSession,
    revokeSession,
};

export default sessionRepository;
