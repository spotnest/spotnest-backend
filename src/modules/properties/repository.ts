
import Property from "./model.js";
import type {
    AdminProperty,
    AdminPropertyOwner,
    GeoPoint,
    IProperty,
    PropertyStatus,
    PropertyType,
    PublicProperty,
    PublicPropertyOwner,
} from "./type.js";
import type {
    AdminListPropertiesQuery,
    ListPropertiesQuery,
    NearbyQuery,
} from "./validation.js";

export const NEARBY_RADIUS_METERS = 10_000;

export interface CreatePropertyData {
    owner: string;
    title: string;
    description: string;
    propertyType: PropertyType;
    price: number;
    advanceAmount?: number;
    rentalTerms: string;
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
    location: GeoPoint;
    locationResolvedName?: string;
    images: { url: string; publicId: string }[];
    status?: PropertyStatus;
}

const escapeRegExp = (value: string): string =>
    value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const createProperty = async (
    data: CreatePropertyData
): Promise<IProperty> => {
    return Property.create(data);
};

const findById = async (
    id: string
): Promise<IProperty | null> => {
    return Property.findById(id);
};

const findPublicById = async (
    id: string
): Promise<PublicProperty | null> => {
    const property = await Property.findById(id)
        .populate<{ owner: PublicPropertyOwner | null }>(
            "owner",
            "name image"
        )
        .lean();

    return property as PublicProperty | null;
};

const findByOwner = async (
    ownerId: string
): Promise<IProperty[]> => {
    return Property.find({ owner: ownerId }).sort({
        created_at: -1,
    });
};

/**
 * Counts an owner's listings against their plan limit.
 * Active and inactive listings count toward the limit.
 * Archived listings do not consume quota.
 */
const countByOwner = async (
    ownerId: string
): Promise<number> => {
    return Property.countDocuments({
        owner: ownerId,
        status: { $ne: "archived" },
    });
};

// Pass "active" for public listing, undefined for all statuses,
// or a specific status for an admin query.
const findMany = async (
    query: ListPropertiesQuery,
    statusFilter: string | undefined
): Promise<{ items: IProperty[]; total: number }> => {
    const filter: Record<string, unknown> = {};

    if (statusFilter) {
        filter.status = statusFilter;
    }

    if (query.city) {
        filter["address.city"] = new RegExp(
            `^${escapeRegExp(query.city)}$`,
            "i"
        );
    }

    if (query.propertyType) {
        filter.propertyType = query.propertyType;
    }

    if (query.bedrooms !== undefined) {
        filter.bedrooms = query.bedrooms;
    }

    if (
        query.minPrice !== undefined ||
        query.maxPrice !== undefined
    ) {
        filter.price = {
            ...(query.minPrice !== undefined
                ? { $gte: query.minPrice }
                : {}),
            ...(query.maxPrice !== undefined
                ? { $lte: query.maxPrice }
                : {}),
        };
    }

    const skip = (query.page - 1) * query.limit;

    // Keep public listing cards lean.
    const [items, total] = await Promise.all([
        Property.find(filter)
            .select({ description: 0, amenities: 0 })
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(query.limit),

        Property.countDocuments(filter),
    ]);

    return { items, total };
};

const findManyForAdmin = async (
    query: AdminListPropertiesQuery
): Promise<{ items: AdminProperty[]; total: number }> => {
    const filter: Record<string, unknown> = {};

    if (query.status) {
        filter.status = query.status;
    }

    if (query.city) {
        filter["address.city"] = new RegExp(
            `^${escapeRegExp(query.city)}$`,
            "i"
        );
    }

    if (query.propertyType) {
        filter.propertyType = query.propertyType;
    }

    if (query.search) {
        const search = new RegExp(
            escapeRegExp(query.search),
            "i"
        );

        filter.$or = [
            { title: search },
            { "address.city": search },
            { "address.state": search },
        ];
    }

    if (query.bedrooms !== undefined) {
        filter.bedrooms = query.bedrooms;
    }

    if (
        query.minPrice !== undefined ||
        query.maxPrice !== undefined
    ) {
        filter.price = {
            ...(query.minPrice !== undefined
                ? { $gte: query.minPrice }
                : {}),
            ...(query.maxPrice !== undefined
                ? { $lte: query.maxPrice }
                : {}),
        };
    }

    const skip = (query.page - 1) * query.limit;

    const [items, total] = await Promise.all([
        Property.find(filter)
            .populate<{ owner: AdminPropertyOwner | null }>(
                "owner",
                "name email phone isVerified verificationStatus status"
            )
            .sort({ created_at: -1 })
            .skip(skip)
            .limit(query.limit)
            .lean(),

        Property.countDocuments(filter),
    ]);

    return {
        items: items.map((property) => ({
            ...property,
            price: property.price ?? null,
            rentalStatus: "available" as const,
        })),
        total,
    };
};

const findAdminById = async (
    id: string
): Promise<AdminProperty | null> => {
    const property = await Property.findById(id)
        .populate<{ owner: AdminPropertyOwner | null }>(
            "owner",
            "name email phone isVerified verificationStatus status"
        )
        .lean();

    return property
        ? {
              ...property,
              price: property.price ?? null,
              rentalStatus: "available" as const,
          }
        : null;
};

const findNearby = async (
    coordinates: [number, number],
    query: NearbyQuery
): Promise<{
    items: (IProperty & { distanceMeters: number })[];
    total: number;
}> => {
    const matchFilter: Record<string, unknown> = {
        status: "active",
    };

    if (query.propertyType) {
        matchFilter.propertyType = query.propertyType;
    }

    if (query.bedrooms !== undefined) {
        matchFilter.bedrooms = query.bedrooms;
    }

    if (
        query.minPrice !== undefined ||
        query.maxPrice !== undefined
    ) {
        matchFilter.price = {
            ...(query.minPrice !== undefined
                ? { $gte: query.minPrice }
                : {}),
            ...(query.maxPrice !== undefined
                ? { $lte: query.maxPrice }
                : {}),
        };
    }

    const skip = (query.page - 1) * query.limit;

    // $geoNear must be the first aggregation stage.
    const [result] = await Property.aggregate([
        {
            $geoNear: {
                near: {
                    type: "Point",
                    coordinates,
                },
                distanceField: "distanceMeters",
                maxDistance: NEARBY_RADIUS_METERS,
                query: matchFilter,
                spherical: true,
            },
        },
        {
            $facet: {
                items: [
                    { $skip: skip },
                    { $limit: query.limit },
                    {
                        $project: {
                            description: 0,
                            amenities: 0,
                        },
                    },
                ],
                totalCount: [{ $count: "count" }],
            },
        },
    ]);

    return {
        items: result?.items ?? [],
        total: result?.totalCount?.[0]?.count ?? 0,
    };
};

const updateProperty = async (
    id: string,
    data: Partial<IProperty>
): Promise<IProperty | null> => {
    return Property.findByIdAndUpdate(
        id,
        { $set: data },
        { returnDocument: "after" }
    );
};

const setStatus = async (
    id: string,
    status: string
): Promise<void> => {
    await Property.findByIdAndUpdate(
        id,
        { $set: { status } }
    );
};

// Hard delete is only for a listing that never became visible.
// Normal deletion uses the archived status.
const deletePropertyById = async (
    id: string
): Promise<void> => {
    await Property.findByIdAndDelete(id);
};

const propertyRepository = {
    createProperty,
    findById,
    findPublicById,
    findByOwner,
    countByOwner,
    findMany,
    findManyForAdmin,
    findAdminById,
    findNearby,
    updateProperty,
    setStatus,
    deletePropertyById,
};

export default propertyRepository;
