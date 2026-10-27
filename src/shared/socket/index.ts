import type { Server as HttpServer } from "node:http";
import { Server } from "socket.io";
import { parse } from "cookie";
import mongoose from "mongoose";
import authRepository from "../../modules/auth/repository.js";
import { UserRole, UserStatus } from "../../modules/auth/type.js";
import chatRepository from "../../modules/chat/repository.js";
import { verifyToken } from "../utils/token.js";
import {
    ADMIN_ROOM,
    SocketEvents,
    conversationRoom,
    userRoom,
    type DashboardAction,
    type DashboardScope,
    type DashboardUpdatePayload,
    type NotificationNewPayload,
    type NotificationReadPayload,
    type SessionExpiredPayload,
} from "./events.js";

let io: Server | undefined;

// Same origin the REST API allows (see app.ts), so cookies are sent to both.
const clientOrigin = (process.env.CLIENT_URL || "http://localhost:3000").replace(/\/$/, "");

// setTimeout is limited to a signed 32-bit delay (~24.8 days).
const MAX_TIMER_DELAY_MS = 2_147_483_647;

export function initSocket(httpServer: HttpServer) {
    io = new Server(httpServer, {
        cors: { origin: clientOrigin, credentials: true },
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

            // Always use the current database state, like the HTTP `protect`
            // middleware: blocked or inactive users cannot open a socket.
            const user = await authRepository.findById(payload.userId);
            if (!user || user.isBlock || user.status !== UserStatus.ACTIVE) {
                return next(new Error("Unauthorized"));
            }

            socket.data.user = {
                id: user._id.toString(),
                role: user.role,
                tokenExpiresAt: typeof payload.exp === "number" ? payload.exp * 1000 : undefined,
            };
            next();
        } catch (error) {
            // Expired/invalid JWTs land here. Only the message is sent to the
            // client; it then refreshes the session cookie and reconnects.
            if (!(error instanceof Error && (error.name === "TokenExpiredError" || error.name === "JsonWebTokenError"))) {
                console.error("Socket authentication failed", error instanceof Error ? error.stack : error);
            }
            next(new Error("Unauthorized"));
        }
    });

    io.on("connection", (socket) => {
        const { id: userId, role, tokenExpiresAt } = socket.data.user as {
            id: string;
            role: UserRole;
            tokenExpiresAt?: number;
        };

        // Private rooms are derived only from the server-verified identity,
        // never from anything the client sends.
        socket.join(userRoom(userId));
        if (role === UserRole.ADMIN) socket.join(ADMIN_ROOM);

        // The handshake cookie is only checked once. When the access token
        // expires, close the socket so the client refreshes the session and
        // reconnects through the authentication middleware again (which also
        // re-checks blocked/inactive status).
        let expiryTimer: NodeJS.Timeout | undefined;
        if (tokenExpiresAt) {
            const delay = Math.min(Math.max(tokenExpiresAt - Date.now(), 0), MAX_TIMER_DELAY_MS);
            expiryTimer = setTimeout(() => {
                const payload: SessionExpiredPayload = { reason: "token_expired" };
                socket.emit(SocketEvents.SESSION_EXPIRED, payload);
                socket.disconnect(true);
            }, delay);
        }

        socket.on(SocketEvents.CONVERSATION_JOIN, async (id: unknown) => {
            try {
                if (typeof id !== "string" || !mongoose.isValidObjectId(id)) return;
                const conversation = await chatRepository.findById(id);
                if (!conversation) return;
                const isParticipant = conversation.participants.some((participant) => participant.toString() === userId);
                if (isParticipant) socket.join(conversationRoom(id));
            } catch (error) {
                console.error("Failed to join chat room", error instanceof Error ? error.stack : error);
            }
        });

        socket.on(SocketEvents.CONVERSATION_LEAVE, (id: unknown) => {
            if (typeof id === "string") socket.leave(conversationRoom(id));
        });

        socket.on("disconnect", () => {
            if (expiryTimer) clearTimeout(expiryTimer);
        });
    });

    return io;
}

/**
 * Returns the Socket.IO server. Throws when called before `initSocket`, which
 * only happens if an HTTP request is served without the socket layer.
 */
export const getIO = (): Server => {
    if (!io) throw new Error("Socket.IO has not been initialised");
    return io;
};

/*
 * Emit helpers.
 *
 * Realtime delivery is best-effort and must never fail the business
 * operation that triggered it: callers invoke these only after the database
 * write succeeded, and the persisted data is refetched by clients on
 * reconnect. When the socket layer is not running (seed scripts, tests) the
 * helpers are no-ops.
 */
const safeEmit = (emit: (server: Server) => void): void => {
    if (!io) return;
    try {
        emit(io);
    } catch (error) {
        console.error("[SOCKET_EMIT_FAILED]", error instanceof Error ? error.stack : error);
    }
};

export const emitNotification = (recipientId: string, notification: NotificationNewPayload): void =>
    safeEmit((server) => server.to(userRoom(recipientId)).emit(SocketEvents.NOTIFICATION_NEW, notification));

export const emitNotificationRead = (recipientId: string, payload: NotificationReadPayload): void =>
    safeEmit((server) => server.to(userRoom(recipientId)).emit(SocketEvents.NOTIFICATION_READ, payload));

export interface DashboardUpdateTarget {
    /** User ids whose dashboards are affected. Duplicates/empties are ignored. */
    userIds?: Array<string | { toString(): string } | null | undefined>;
    /** Also refresh platform statistics on admin dashboards. */
    admins?: boolean;
}

export const emitDashboardUpdate = (
    target: DashboardUpdateTarget,
    scope: DashboardScope,
    action: DashboardAction,
    entityId?: string | { toString(): string },
): void =>
    safeEmit((server) => {
        const rooms = new Set<string>();
        for (const id of target.userIds ?? []) {
            const value = id?.toString();
            if (value) rooms.add(userRoom(value));
        }
        if (target.admins) rooms.add(ADMIN_ROOM);
        if (rooms.size === 0) return;

        const payload: DashboardUpdatePayload = {
            scope,
            action,
            ...(entityId ? { entityId: entityId.toString() } : {}),
            occurredAt: new Date().toISOString(),
        };
        // A single `to([...])` call sends one copy per socket even when a
        // socket is in several of the target rooms (e.g. an admin user room).
        server.to([...rooms]).emit(SocketEvents.DASHBOARD_UPDATE, payload);
    });
