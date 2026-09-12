import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
    ...(process.env.CLOUDINARY_CLOUD_NAME ? { cloud_name: process.env.CLOUDINARY_CLOUD_NAME } : {}),
    ...(process.env.CLOUDINARY_API_KEY ? { api_key: process.env.CLOUDINARY_API_KEY } : {}),
    ...(process.env.CLOUDINARY_API_SECRET ? { api_secret: process.env.CLOUDINARY_API_SECRET } : {}),
});

// ---- Public images (profile pictures, and later: property photos, etc.) ----

export const uploadImage = (
    buffer: Buffer,
    folder: string
): Promise<{ publicId: string; url: string }> => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            { folder, resource_type: "image" }, // default type: "upload" — PUBLIC
            (err, result) => {
                if (err || !result) return reject(err ?? new Error("Cloudinary upload failed"));
                resolve({ publicId: result.public_id, url: result.secure_url });
            }
        );
        stream.end(buffer);
    });
};

export const deleteImage = (publicId: string): Promise<void> => {
    return new Promise((resolve, reject) => {
        cloudinary.uploader.destroy(publicId, (err) => {
            if (err) return reject(err);
            resolve();
        });
    });
};

// ---- Private government ID documents — NEVER public, only signed, short-lived links ----

export const uploadIdDocument = (
    buffer: Buffer,
    userId: string
): Promise<{ publicId: string }> => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder: `gov-ids/${userId}`,
                resource_type: "image",
                type: "authenticated",   // makes the raw URL unusable without a signature
                access_mode: "authenticated",
            },
            (err, result) => {
                if (err || !result) return reject(err ?? new Error("Cloudinary upload failed"));
                resolve({ publicId: result.public_id });
            }
        );
        stream.end(buffer);
    });
};

export const getSignedIdDocumentUrl = (publicId: string): { url: string; expiresAt: Date } => {
    const ttlSeconds = Number(process.env.ID_VERIFICATION_SIGNED_URL_TTL_SECONDS ?? 300);
    const expiresAtUnix = Math.floor(Date.now() / 1000) + ttlSeconds;

    const url = cloudinary.utils.private_download_url(publicId, "jpg", {
        resource_type: "image",
        type: "authenticated",
        expires_at: expiresAtUnix,
    });

    return { url, expiresAt: new Date(expiresAtUnix * 1000) };
};