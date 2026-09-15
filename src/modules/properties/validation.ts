import { z } from "zod";

const addressSchema = z.object({
    street: z.string().min(1).max(200),
    city: z.string().min(1).max(100),
    state: z.string().min(1).max(100),
    zipCode: z.string().min(1).max(20),
    country: z.string().min(1).max(100),
});

const propertyTypeEnum = z.enum(["apartment", "house", "villa", "studio", "room"]);

export const createPropertySchema = z.object({
    title: z.string().min(3).max(150),
    description: z.string().min(10).max(3000),
    propertyType: propertyTypeEnum,
    price: z.coerce.number().positive(),
    bedrooms: z.coerce.number().int().min(0),
    bathrooms: z.coerce.number().int().min(0),
    areaSqFt: z.coerce.number().positive().optional(),
    amenities: z.array(z.string()).optional().default([]),
    address: addressSchema,
});
export type CreatePropertyInput = z.infer<typeof createPropertySchema>;

export const updatePropertySchema = createPropertySchema.partial();
export type UpdatePropertyInput = z.infer<typeof updatePropertySchema>;

export const listPropertiesQuerySchema = z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(10),
    city: z.string().optional(),
    minPrice: z.coerce.number().min(0).optional(),
    maxPrice: z.coerce.number().min(0).optional(),
    bedrooms: z.coerce.number().int().min(0).optional(),
    propertyType: propertyTypeEnum.optional(),
});
export type ListPropertiesQuery = z.infer<typeof listPropertiesQuerySchema>;

export const adminListPropertiesQuerySchema = listPropertiesQuerySchema.extend({
    status: z.enum(["active", "inactive", "archived"]).optional(),
});
export type AdminListPropertiesQuery = z.infer<typeof adminListPropertiesQuerySchema>;