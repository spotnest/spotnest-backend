import { Document, Types } from "mongoose";

export type PropertyType = "apartment" | "house" | "villa" | "studio" | "room";
export type PropertyStatus = "active" | "inactive" | "archived";
export type PropertyRentalStatus = "available";

export interface PropertyImage {
    url: string;
    publicId: string;
}

export interface PropertyAddress {
    street: string;
    city: string;
    state: string;
    zipCode: string;
    country: string;
}

export interface IProperty extends Document {
    owner: Types.ObjectId;
    title: string;
    description: string;
    propertyType: PropertyType;
    price: number;
    bedrooms: number;
    bathrooms: number;
    areaSqFt?: number;
    amenities: string[];
    address: PropertyAddress;
    images: PropertyImage[];
    status: PropertyStatus;
    created_at: Date;
    updated_at: Date;
}

export interface AdminPropertyOwner {
    _id: Types.ObjectId;
    name: string;
    email: string;
    phone?: string;
    isVerified: boolean;
    verificationStatus?: "unsubmitted" | "pending" | "approved" | "rejected";
    status: "active" | "inactive" | "suspended";
}

export type AdminProperty = Omit<IProperty, "owner" | "price"> & {
    owner: AdminPropertyOwner | null;
    price: number | null;
    rentalStatus: PropertyRentalStatus;
};