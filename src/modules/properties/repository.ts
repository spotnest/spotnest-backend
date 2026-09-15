import Property from "./model.js";
import type { IProperty, PropertyStatus, PropertyType } from "./type.js";
import type { ListPropertiesQuery } from "./validation.js";

export interface CreatePropertyData {
    owner: string;
    title: string;
    description: string;
    propertyType: PropertyType;
    price: number;
    bedrooms: number;
    bathrooms: number;
    areaSqFt?: number;
    amenities: string[];
    address: {
        street: string;
        city: string;
        state: string;
        zipCode: string;
        country: string;
    };
    images: { url: string; publicId: string }[];
    status?: PropertyStatus;
}

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const createProperty = async (data: CreatePropertyData): Promise<IProperty> => {
    return Property.create(data);
};

const findById = async (id: string): Promise<IProperty | null> => {
    return Property.findById(id);
};

const findByOwner = async (ownerId: string): Promise<IProperty[]> => {
    return Property.find({ owner: ownerId }).sort({ created_at: -1 });
};

// statusFilter: pass "active" for public listing, undefined for admin (all statuses),
// or a specific status if the admin query explicitly asked for one.
const findMany = async (
    query: ListPropertiesQuery,
    statusFilter: string | undefined
): Promise<{ items: IProperty[]; total: number }> => {
    const filter: Record<string, unknown> = {};
    if (statusFilter) filter.status = statusFilter;
    if (query.city) filter["address.city"] = new RegExp(`^${escapeRegExp(query.city)}$`, "i");
    if (query.propertyType) filter.propertyType = query.propertyType;
    if (query.bedrooms !== undefined) filter.bedrooms = query.bedrooms;
    if (query.minPrice !== undefined || query.maxPrice !== undefined) {
        filter.price = {
            ...(query.minPrice !== undefined ? { $gte: query.minPrice } : {}),
            ...(query.maxPrice !== undefined ? { $lte: query.maxPrice } : {}),
        };
    }

    const skip = (query.page - 1) * query.limit;
    const [items, total] = await Promise.all([
        Property.find(filter).sort({ created_at: -1 }).skip(skip).limit(query.limit),
        Property.countDocuments(filter),
    ]);
    return { items, total };
};

const updateProperty = async (id: string, data: Partial<IProperty>): Promise<IProperty | null> => {
    return Property.findByIdAndUpdate(id, { $set: data }, { new: true });
};

const setStatus = async (id: string, status: string): Promise<void> => {
    await Property.findByIdAndUpdate(id, { $set: { status } });
};

// Hard delete — only used to unwind a listing that never became visible
// (create with status "inactive", so the public never saw it). Soft-delete
// via setStatus("archived") remains the only path for DELETE /:id.
const deletePropertyById = async (id: string): Promise<void> => {
    await Property.findByIdAndDelete(id);
};

const propertyRepository = {
    createProperty,
    findById,
    findByOwner,
    findMany,
    updateProperty,
    setStatus,
    deletePropertyById,
};
export default propertyRepository;