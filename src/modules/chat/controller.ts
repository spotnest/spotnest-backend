import type { Response, NextFunction } from "express";
import type { AuthRequest } from "../../types/roleTypes.js";
import chatService from "./service.js";
import {
    conversationParamsSchema,
    createConversationSchema,
    listMessagesQuerySchema,
    sendMessageSchema,
} from "./validation.js";

const createConversation = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
        const data = await chatService.createOrGetConversation(req.user!.id, req.user!.role, createConversationSchema.parse(req.body));
        res.status(200).json({ success: true, data });
    } catch (error) { next(error); }
};

const listConversations = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
        const data = await chatService.listConversations(req.user!.id, req.user!.role);
        res.status(200).json({ success: true, data });
    } catch (error) { next(error); }
};

const listMessages = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { conversationId } = conversationParamsSchema.parse(req.params);
        const query = listMessagesQuerySchema.parse(req.query);
        const data = await chatService.listMessages(conversationId, req.user!.id, req.user!.role, query);
        res.status(200).json({ success: true, data });
    } catch (error) { next(error); }
};

const sendMessage = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { conversationId } = conversationParamsSchema.parse(req.params);
        const data = await chatService.sendMessage(conversationId, req.user!.id, req.user!.role, sendMessageSchema.parse(req.body));
        res.status(201).json({ success: true, data });
    } catch (error) { next(error); }
};

const markMessagesRead = async (req: AuthRequest, res: Response, next: NextFunction): Promise<void> => {
    try {
        const { conversationId } = conversationParamsSchema.parse(req.params);
        const data = await chatService.markMessagesRead(conversationId, req.user!.id, req.user!.role);
        res.status(200).json({ success: true, data });
    } catch (error) { next(error); }
};

export default { createConversation, listConversations, listMessages, sendMessage, markMessagesRead };
