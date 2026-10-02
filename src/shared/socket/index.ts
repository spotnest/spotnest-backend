import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { parse } from "cookie";
import jwt from "jsonwebtoken";

let io: Server;

export function initSocket(httpServer: HttpServer) {
    const clientOrigin = (process.env.CLIENT_URL || "http://localhost:3000").replace(/\/$/, "");

    io = new Server(httpServer, {
        cors: { origin: clientOrigin, credentials: true },
    });

    // Auth: ninte REST auth engane aanenno athu pole maattuka
    io.use((socket, next) => {
        try {
            const cookies = parse(socket.handshake.headers.cookie || "");
            const token = cookies.token; // TODO: ninte login cookie-yude actual name
            if (!token) return next(new Error("Unauthorized"));
            const payload = jwt.verify(token, process.env.JWT_SECRET!) as { id: string }; // TODO: actual secret name + payload field
            socket.data.user = { id: payload.id };
            next();
        } catch {
            next(new Error("Unauthorized"));
        }
    });

    io.on("connection", (socket) => {
        const userId = socket.data.user.id;
        socket.join(`user:${userId}`); // unread/notification-inu

        socket.on("conversation:join", async (id: string) => {
            // TODO: user ee conversation-inte bhaagam aanennu check cheyyuka
            socket.join(`conv:${id}`);
        });

        socket.on("conversation:leave", (id: string) => socket.leave(`conv:${id}`));

        socket.on("message:send", async ({ conversationId, message }, ack) => {
            try {
                // TODO: ninte existing send-message service vilikkuka
                // const saved = await chatService.sendMessage(conversationId, userId, message);
                const saved = {
                    id: "TODO",
                    conversationId,
                    senderId: userId,
                    message,
                    createdAt: new Date().toISOString(),
                };

                io.to(`conv:${conversationId}`).emit("message:new", saved);
                ack?.({ ok: true });
            } catch {
                ack?.({ ok: false });
            }
        });
    });

    return io;
}

export const getIO = () => io;