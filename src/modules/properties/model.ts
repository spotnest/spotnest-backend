import mongoose, { Schema } from "mongoose";
import type { IProperty } from "./type.js";

const propertySchema = new Schema<IProperty>(
    {
        owner: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
        title: { type: String, required: true, maxlength: 150 },
        description: { type: String, required: true, maxlength: 3000 },
        propertyType: {
            type: String,
            enum: ["apartment", "house", "villa", "studio", "room"],
            required: true,
        },
        price: { type: Number, required: true, min: 0 },
        bedrooms: { type: Number, required: true, min: 0 },
        bathrooms: { type: Number, required: true, min: 0 },
        areaSqFt: { type: Number, min: 0 },
        amenities: { type: [String], default: [] },
        address: {
            street: { type: String, required: true, maxlength: 200 },
            city: { type: String, required: true, maxlength: 100 },
            state: { type: String, required: true, maxlength: 100 },
            zipCode: { type: String, required: true, maxlength: 20 },
            country: { type: String, required: true, maxlength: 100 },
        },
        images: {
            type: [{ url: String, publicId: String }],
            default: [],
        },
        status: {
            type: String,
            enum: ["active", "inactive", "archived"],
            default: "active",
        },
    },
    { timestamps: { createdAt: "created_at", updatedAt: "updated_at" } }
);

propertySchema.index({ "address.city": 1, price: 1 });

const Property = mongoose.model<IProperty>("Property", propertySchema);
export default Property;