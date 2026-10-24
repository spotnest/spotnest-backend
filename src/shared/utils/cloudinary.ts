import { v2 as cloudinary } from "cloudinary";

cloudinary.config({
    ...(process.env.CLOUDINARY_CLOUD_NAME
        ? {
              cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
          }
        : {}),
    ...(process.env.CLOUDINARY_API_KEY
        ? {
              api_key: process.env.CLOUDINARY_API_KEY,
          }
        : {}),
    ...(process.env.CLOUDINARY_API_SECRET
        ? {
              api_secret: process.env.CLOUDINARY_API_SECRET,
          }
        : {}),
});

// -----------------------------------------------------
// Public images
// Profile pictures, property photos, etc.
// -----------------------------------------------------

export const uploadImage = (
    buffer: Buffer,
    folder: string
): Promise<{ publicId: string; url: string }> => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            {
                folder,
                resource_type: "image",
            },
            (err, result) => {
                if (err || !result) {
                    return reject(
                        err ??
                            new Error(
                                "Cloudinary upload failed"
                            )
                    );
                }

                resolve({
                    publicId: result.public_id,
                    url: result.secure_url,
                });
            }
        );

        stream.end(buffer);
    });
};

export const deleteImage = (
    publicId: string
): Promise<void> => {
    return new Promise((resolve, reject) => {
        cloudinary.uploader.destroy(
            publicId,
            (err) => {
                if (err) {
                    return reject(err);
                }

                resolve();
            }
        );
    });
};

// -----------------------------------------------------
// Private owner verification documents
//
// Supported:
// - image/jpeg
// - image/png
// - application/pdf
//
// These files are stored as authenticated/private
// Cloudinary resources.
// -----------------------------------------------------

export type IdDocumentMimeType =
    | "image/jpeg"
    | "image/png"
    | "application/pdf";

export type IdDocumentResourceType =
    | "image"
    | "raw";

export interface UploadedIdDocument {
    publicId: string;
    resourceType: IdDocumentResourceType;
    format: "jpg" | "png" | "pdf";
}

const getIdDocumentInfo = (
    mimetype: string
): {
    resourceType: IdDocumentResourceType;
    format: "jpg" | "png" | "pdf";
} => {
    switch (mimetype) {
        case "image/jpeg":
            return {
                resourceType: "image",
                format: "jpg",
            };

        case "image/png":
            return {
                resourceType: "image",
                format: "png",
            };

        case "application/pdf":
            return {
                resourceType: "raw",
                format: "pdf",
            };

        default:
            throw new Error(
                `Unsupported verification document type: ${mimetype}`
            );
    }
};

export const uploadIdDocument = (
    buffer: Buffer,
    userId: string,
    mimetype: string
): Promise<UploadedIdDocument> => {
    return new Promise((resolve, reject) => {
        let documentInfo: {
            resourceType: IdDocumentResourceType;
            format: "jpg" | "png" | "pdf";
        };

        try {
            documentInfo = getIdDocumentInfo(mimetype);
        } catch (error) {
            return reject(error);
        }

        const stream =
            cloudinary.uploader.upload_stream(
                {
                    folder: `gov-ids/${userId}`,
                    resource_type:
                        documentInfo.resourceType,
                    type: "authenticated",
                    access_mode: "authenticated",
                    format: documentInfo.format,
                },
                (err, result) => {
                    if (err || !result) {
                        return reject(
                            err ??
                                new Error(
                                    "Cloudinary upload failed"
                                )
                        );
                    }

                    resolve({
                        publicId: result.public_id,
                        resourceType:
                            documentInfo.resourceType,
                        format: documentInfo.format,
                    });
                }
            );

        stream.end(buffer);
    });
};

export const deleteIdDocument = (
    publicId: string,
    resourceType: IdDocumentResourceType
): Promise<void> => {
    return new Promise((resolve, reject) => {
        cloudinary.uploader.destroy(
            publicId,
            {
                resource_type: resourceType,
                type: "authenticated",
            },
            (err) => {
                if (err) {
                    return reject(err);
                }

                resolve();
            }
        );
    });
};

// -----------------------------------------------------
// Generate short-lived signed download URL
//
// The caller MUST authorize the admin before calling this
// function.
//
// The URL is temporary and the document remains private.
// -----------------------------------------------------

export const getSignedIdDocumentUrl = (
    publicId: string,
    resourceType: IdDocumentResourceType,
    format: "jpg" | "png" | "pdf"
): {
    url: string;
    expiresAt: Date;
} => {
    const ttlSeconds = Number(
        process.env
            .ID_VERIFICATION_SIGNED_URL_TTL_SECONDS ??
            300
    );

    if (
        !Number.isFinite(ttlSeconds) ||
        ttlSeconds <= 0
    ) {
        throw new Error(
            "Invalid ID_VERIFICATION_SIGNED_URL_TTL_SECONDS configuration"
        );
    }

    const expiresAtUnix =
        Math.floor(Date.now() / 1000) +
        ttlSeconds;

    const url =
        cloudinary.utils.private_download_url(
            publicId,
            format,
            {
                resource_type: resourceType,
                type: "authenticated",
                expires_at: expiresAtUnix,
            }
        );

    return {
        url,
        expiresAt: new Date(
            expiresAtUnix * 1000
        ),
    };
};