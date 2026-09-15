import type { Request, Response, NextFunction } from "express";
import type { AuthRequest } from "../../types/roleTypes.js";
import { AppError } from "../../shared/errors/AppError.js";
import propertyService from "./service.js";
import {
    createPropertySchema,
    updatePropertySchema,
    listPropertiesQuerySchema,
    adminListPropertiesQuerySchema,
} from "./validation.js";

// multipart form-data delivers `address` and `amenities` as raw strings;
// Zod expects real objects/arrays, so JSON-parse them before validation.
const parseJsonFields = (body: Record<string, unknown>) => {
    const parsed = { ...body };
    for (const key of ["address", "amenities"]) {
        if (typeof parsed[key] === "string") {
            try {
                parsed[key] = JSON.parse(parsed[key] as string);
            } catch {
                throw new AppError(400, `${key} must be valid JSON`);
            }
        }
    }
    return parsed;
};

export const createProperty = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const data = createPropertySchema.parse(parseJsonFields(req.body));
        const files = (req.files as Express.Multer.File[] | undefined) ?? [];
        const property = await propertyService.createProperty(
            req.user!.id,
            data,
            files.map((f) => ({ buffer: f.buffer, mimetype: f.mimetype }))
        );
        res.status(201).json(property);
    } catch (err) {
        next(err);
    }
};

export const listProperties = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const query = listPropertiesQuerySchema.parse(req.query);
        const result = await propertyService.listProperties(query);
        res.status(200).json(result);
    } catch (err) {
        next(err);
    }
};

export const getProperty = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const property = await propertyService.getPublicPropertyById(req.params.id as string);
        res.status(200).json(property);
    } catch (err) {
        next(err);
    }
};

export const listMyProperties = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const properties = await propertyService.listOwnerProperties(req.user!.id);
        res.status(200).json(properties);
    } catch (err) {
        next(err);
    }
};

export const updateProperty = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const data = updatePropertySchema.parse(parseJsonFields(req.body));
        const property = await propertyService.updateProperty(req.params.id as string, req.user!.id, req.user!.role, data);
        res.status(200).json(property);
    } catch (err) {
        next(err);
    }
};

export const updateStatus = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { status } = req.body;
        if (status !== "active" && status !== "inactive") {
            throw new AppError(400, "status must be 'active' or 'inactive'");
        }
        const result = await propertyService.updateStatus(req.params.id as string, req.user!.id, req.user!.role, status);
        res.status(200).json(result);
    } catch (err) {
        next(err);
    }
};

export const addImages = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const files = (req.files as Express.Multer.File[] | undefined) ?? [];
        if (files.length === 0) throw new AppError(400, "No images uploaded");
        const property = await propertyService.addImages(
            req.params.id as string,
            req.user!.id,
            req.user!.role,
            files.map((f) => ({ buffer: f.buffer, mimetype: f.mimetype }))
        );
        res.status(200).json(property);
    } catch (err) {
        next(err);
    }
};

export const removeImage = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { publicId } = req.body;
        if (!publicId || typeof publicId !== "string") {
            throw new AppError(400, "publicId is required in the request body");
        }
        const result = await propertyService.removeImage(req.params.id as string, req.user!.id, req.user!.role, publicId);
        res.status(200).json(result);
    } catch (err) {
        next(err);
    }
};

export const archiveProperty = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const result = await propertyService.archiveProperty(req.params.id as string, req.user!.id, req.user!.role);
        res.status(200).json(result);
    } catch (err) {
        next(err);
    }
};

export const listAllForAdmin = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const query = adminListPropertiesQuerySchema.parse(req.query);
        const result = await propertyService.listAllForAdmin(query);
        res.status(200).json(result);
    } catch (err) {
        next(err);
    }
};