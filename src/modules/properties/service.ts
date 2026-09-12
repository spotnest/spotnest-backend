import propertyRepository from "./repository.js";
import { AppError } from "../../shared/errors/AppError.js";
import { uploadImage, deleteImage } from "../../shared/utils/cloudinary.js";
import { UserRole } from "../auth/type.js";
import type { IProperty } from "./type.js";
import type {
    CreatePropertyInput,
    UpdatePropertyInput,
    ListPropertiesQuery,
    AdminListPropertiesQuery,
} from "./validation.js";

const MAX_IMAGES = 8;

const assertOwnershipOrAdmin = (property: IProperty, userId: string, role: string) => {
    if (property.owner.toString() !== userId && role !== UserRole.ADMIN) {
        throw new AppError(403, "You do not have permission to modify this property");
    }
};

const createProperty = async (
    ownerId: string,
    data: CreatePropertyInput,
    files: { buffer: Buffer; mimetype: string }[]
): Promise<IProperty> => {
    if (files.length === 0) {
        throw new AppError(400, "At least one property image is required");
    }
    if (files.length > MAX_IMAGES) {
        throw new AppError(400, `A maximum of ${MAX_IMAGES} images is allowed`);
    }

    // Create the listing as "inactive" — it is NOT visible to the public yet
    // (public listing only shows status "active"). It only becomes "active"
    // in the same atomic $set that attaches the uploaded images, so there is
    // no window where an image-less listing is live.
    const { areaSqFt, ...listingFields } = data;
    const property = await propertyRepository.createProperty({
        ...listingFields,
        owner: ownerId,
        images: [],
        status: "inactive",
        ...(areaSqFt !== undefined ? { areaSqFt } : {}),
    });

    const uploaded: { url: string; publicId: string }[] = [];
    try {
        for (const file of files) {
            const { url, publicId } = await uploadImage(
                file.buffer,
                `spotnest/properties/${property._id.toString()}`
            );
            uploaded.push({ url, publicId });
        }
        const withImages = await propertyRepository.updateProperty(property._id.toString(), {
            images: uploaded,
            status: "active",
        } as Partial<IProperty>);
        return withImages!;
    } catch (err) {
        await Promise.allSettled(uploaded.map((img) => deleteImage(img.publicId)));
        // The listing never became public (it stayed "inactive"), so hard-delete
        // it rather than leave an image-less row in the archive.
        await propertyRepository.deletePropertyById(property._id.toString());
        throw new AppError(500, "Failed to create property listing. Please try again.");
    }
};

const listProperties = async (query: ListPropertiesQuery) => {
    const { items, total } = await propertyRepository.findMany(query, "active");
    return {
        items,
        pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) },
    };
};

const getPublicPropertyById = async (id: string): Promise<IProperty> => {
    const property = await propertyRepository.findById(id);
    if (!property || property.status !== "active") {
        throw new AppError(404, "Property not found");
    }
    return property;
};

const listOwnerProperties = async (ownerId: string): Promise<IProperty[]> => {
    return propertyRepository.findByOwner(ownerId);
};

const updateProperty = async (
    id: string,
    userId: string,
    role: string,
    data: UpdatePropertyInput
): Promise<IProperty> => {
    const property = await propertyRepository.findById(id);
    if (!property) throw new AppError(404, "Property not found");
    assertOwnershipOrAdmin(property, userId, role);

    const updated = await propertyRepository.updateProperty(id, data as Partial<IProperty>);
    return updated!;
};

const updateStatus = async (
    id: string,
    userId: string,
    role: string,
    status: "active" | "inactive"
): Promise<{ message: string }> => {
    const property = await propertyRepository.findById(id);
    if (!property) throw new AppError(404, "Property not found");
    assertOwnershipOrAdmin(property, userId, role);
    if (property.status === "archived") {
        throw new AppError(400, "Cannot change status of an archived property");
    }
    await propertyRepository.setStatus(id, status);
    return { message: `Property marked ${status}` };
};

const addImages = async (
    id: string,
    userId: string,
    role: string,
    files: { buffer: Buffer; mimetype: string }[]
): Promise<IProperty> => {
    const property = await propertyRepository.findById(id);
    if (!property) throw new AppError(404, "Property not found");
    assertOwnershipOrAdmin(property, userId, role);

    if (property.images.length + files.length > MAX_IMAGES) {
        throw new AppError(400, `A property can have at most ${MAX_IMAGES} images`);
    }

    const uploaded: { url: string; publicId: string }[] = [];
    try {
        for (const file of files) {
            const { url, publicId } = await uploadImage(file.buffer, `spotnest/properties/${id}`);
            uploaded.push({ url, publicId });
        }
    } catch (err) {
        await Promise.allSettled(uploaded.map((img) => deleteImage(img.publicId)));
        throw new AppError(500, "Failed to upload images");
    }

    const updated = await propertyRepository.updateProperty(id, {
        images: [...property.images, ...uploaded],
    } as Partial<IProperty>);
    return updated!;
};

const removeImage = async (
    id: string,
    userId: string,
    role: string,
    publicId: string
): Promise<{ message: string }> => {
    const property = await propertyRepository.findById(id);
    if (!property) throw new AppError(404, "Property not found");
    assertOwnershipOrAdmin(property, userId, role);

    const exists = property.images.some((img) => img.publicId === publicId);
    if (!exists) throw new AppError(404, "Image not found on this property");
    if (property.images.length <= 1) {
        throw new AppError(400, "A property must have at least one image");
    }

    const remaining = property.images.filter((img) => img.publicId !== publicId);
    await propertyRepository.updateProperty(id, { images: remaining } as Partial<IProperty>);

    // Best-effort — the DB is already the source of truth once the update above succeeds.
    deleteImage(publicId).catch((err) => {
        console.error(`[CLEANUP_FAILED] could not delete property image publicId=${publicId}`, err);
    });

    return { message: "Image removed" };
};

const archiveProperty = async (id: string, userId: string, role: string): Promise<{ message: string }> => {
    const property = await propertyRepository.findById(id);
    if (!property) throw new AppError(404, "Property not found");
    assertOwnershipOrAdmin(property, userId, role);
    await propertyRepository.setStatus(id, "archived");
    return { message: "Property archived" };
};

const listAllForAdmin = async (query: AdminListPropertiesQuery) => {
    const { items, total } = await propertyRepository.findMany(query, query.status);
    return {
        items,
        pagination: { page: query.page, limit: query.limit, total, pages: Math.ceil(total / query.limit) },
    };
};

const propertyService = {
    createProperty,
    listProperties,
    getPublicPropertyById,
    listOwnerProperties,
    updateProperty,
    updateStatus,
    addImages,
    removeImage,
    archiveProperty,
    listAllForAdmin,
};
export default propertyService;