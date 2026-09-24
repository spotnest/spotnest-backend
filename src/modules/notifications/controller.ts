import type { NextFunction, Response } from "express";
import type { AuthRequest } from "../../types/roleTypes.js";
import notificationService from "./service.js";
import { listNotificationsQuerySchema, notificationIdSchema } from "./validation.js";

const listNotifications = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
        const query = listNotificationsQuerySchema.parse(req.query);
        const data = await notificationService.getNotifications(req.user!.id, query);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

const getUnreadCount = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
        const data = await notificationService.getUnreadCount(req.user!.id);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

const markAsRead = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
        const id = notificationIdSchema.parse(req.params.id);
        const data = await notificationService.markAsRead(id, req.user!.id);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

const markAllAsRead = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
        const data = await notificationService.markAllAsRead(req.user!.id);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

const deleteNotification = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
        const id = notificationIdSchema.parse(req.params.id);
        const data = await notificationService.deleteNotification(id, req.user!.id);
        res.status(200).json({ success: true, data });
    } catch (error) {
        next(error);
    }
};

export default { listNotifications, getUnreadCount, markAsRead, markAllAsRead, deleteNotification };
