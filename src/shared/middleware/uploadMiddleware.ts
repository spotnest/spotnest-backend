import multer from "multer";
import { AppError } from "../errors/AppError.js";

const createFileUpload = (
    fieldName: string,
    allowedMimeTypes: string[],
    maxSizeBytes = 5 * 1024 * 1024
) => {
    return multer({
        storage: multer.memoryStorage(), // buffer only, never touches disk
        limits: { fileSize: maxSizeBytes },
        fileFilter: (_req, file, cb) => {
            if (!allowedMimeTypes.includes(file.mimetype)) {
                return cb(new AppError(400, `Only ${allowedMimeTypes.join(", ")} files are allowed`));
            }
            cb(null, true);
        },
    }).single(fieldName);
};

export const profileImageUpload = createFileUpload("image", [
    "image/jpeg",
    "image/png",
    "image/webp",
]);

export const idDocumentUpload = createFileUpload("idDocument", [
    "image/jpeg",
    "image/png",
    "application/pdf",
]);