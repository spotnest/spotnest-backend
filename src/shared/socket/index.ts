import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { parse } from "cookie";
import mongoose from "mongoose";
import authRepository from "../../modules/auth/repository.js";
import { UserStatus } from "../../modules/auth/type.js";
import chatRepository from "../../modules/chat/repository.js";
import { verifyToken } from "../utils/token.js";

let io: Server;

export function initSocket(httpServer: HttpServer) {
    io = new Server(httpServer, {
        cors: { origin: "http://localhost:3000", credentials: true },
    });

    io.use(async (socket, next) => {
        try {
            const cookies = parse(socket.handshake.headers.cookie || "");
            const token = cookies.accessToken;
            if (!token) return next(new Error("Unauthorized"));

            const payload = verifyToken(token);
            if (payload.type !== "access" || !payload.userId) {
                return next(new Error("Unauthorized"));
            }

            const user = await authRepository.findById(payload.userId);
            if (!user || user.isBlock || user.status !== UserStatus.ACTIVE) {
                return next(new Error("Unauthorized"));
            }

            socket.data.user = { id: user._id.toString() };
            next();
        } catch (error) {
            console.error("Socket authentication failed", error instanceof Error ? error.stack : error);
            next(new Error("Unauthorized"));
        }
    });

    io.on("connection", (socket) => {
        const userId = socket.data.user.id;
        socket.join(`user:${userId}`); // unread/notification-inu

        socket.on("conversation:join", async (id: string) => {
            try {
                if (!mongoose.isValidObjectId(id)) return;
                const conversation = await chatRepository.findById(id);
                if (!conversation) return;
                const isParticipant = conversation.participants.some((participant) => participant.toString() === userId);
                if (isParticipant) socket.join(`conv:${id}`);
            } catch (error) {
                console.error("Failed to join chat room", error instanceof Error ? error.stack : error);
            }
        });

        socket.on("conversation:leave", (id: string) => socket.leave(`conv:${id}`));
    });

    return io;
}

export const getIO = () => io;