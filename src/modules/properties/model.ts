import mongoose, { Schema } from "mongoose";
import type { IProperty } from "./type.js";

const propertySchema = new Schema<IProperty>(
    {
        owner: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true,
            index: true,
        },

        title: {
            type: String,
            required: true,
            maxlength: 150,
            trim: true,
        },

        description: {
            type: String,
            required: true,
            maxlength: 3000,
            trim: true,
        },

        propertyType: {
            type: String,
            enum: ["apartment", "house", "villa", "studio", "room"],
            required: true,
        },

        price: {
            type: Number,
            required: true,
            min: 0,
        },

        advanceAmount: {
            type: Number,
            min: 1,
        },

        // Rental terms defined by the owner for this property.
        rentalTerms: {
            type: String,
            required: true,
            trim: true,
            minlength: 20,
            maxlength: 10000,
        },

        bedrooms: {
            type: Number,
            required: true,
            min: 0,
        },

        bathrooms: {
            type: Number,
            required: true,
            min: 0,
        },

        areaSqFt: {
            type: Number,
            min: 0,
        },

        amenities: {
            type: [String],
            default: [],
        },

        address: {
            street: {
                type: String,
                required: true,
                maxlength: 200,
                trim: true,
            },
            city: {
                type: String,
                required: true,
                maxlength: 100,
                trim: true,
            },
            state: {
                type: String,
                required: true,
                maxlength: 100,
                trim: true,
            },
            zipCode: {
                type: String,
                required: true,
                maxlength: 20,
                trim: true,
            },
            country: {
                type: String,
                required: true,
                maxlength: 100,
                trim: true,
            },
        },

        location: {
            type: {
                type: String,
                enum: ["Point"],
                required: true,
            },
            coordinates: {
                type: [Number],
                required: true,
                // [longitude, latitude]
            },
        },

        locationResolvedName: {
            type: String,
            maxlength: 300,
            trim: true,
        },

        images: {
            type: [
                {
                    url: {
                        type: String,
                        trim: true,
                    },
                    publicId: {
                        type: String,
                        trim: true,
                    },
                },
            ],
            default: [],
        },

        status: {
            type: String,
            enum: ["active", "inactive", "archived"],
            default: "active",
        },
    },
    {
        timestamps: {
            createdAt: "created_at",
            updatedAt: "updated_at",
        },
    }
);

propertySchema.index({
    "address.city": 1,
    price: 1,
});

propertySchema.index({
    location: "2dsphere",
});

const Property = mongoose.model<IProperty>(
    "Property",
    propertySchema
);

export default Property;
