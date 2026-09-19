import "dotenv/config";
import mongoose from "mongoose";
import bcrypt from "bcryptjs";
import User from "./modules/auth/model.js";
import Property from "./modules/properties/model.js";
import { UserRole, UserStatus } from "./modules/auth/type.js";

const MONGO_URI = ((): string => {
    const uri = process.env.MONGO_URI;
    if (!uri) {
        throw new Error("MONGO_URI is not defined in environment variables");
    }
    return uri;
})();

const ownerEmail = "owner@spotnest.com";
const ownerPassword = "Owner@123";

const properties = [
    {
        title: "Modern 2BHK Apartment in Kochi",
        description:
            "A beautifully designed 2BHK apartment in the heart of Kochi with modern amenities, spacious rooms, and excellent connectivity. Perfect for small families or working professionals.",
        propertyType: "apartment",
        price: 18000,
        bedrooms: 2,
        bathrooms: 2,
        areaSqFt: 1050,
        amenities: ["WiFi", "Parking", "Gym", "Swimming Pool", "Power Backup"],
        address: {
            street: "MG Road, Ernakulam",
            city: "Kochi",
            state: "Kerala",
            zipCode: "682016",
            country: "India",
        },
        images: [
            {
                url: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800&q=80",
                publicId: "seed/apt-kochi-1",
            },
            {
                url: "https://images.unsplash.com/photo-1600566753086-00f18fb6b3ea?auto=format&fit=crop&w=800&q=80",
                publicId: "seed/apt-kochi-2",
            },
        ],
        status: "active",
    },
    {
        title: "Spacious Family Home in Calicut",
        description:
            "A large independent house in a quiet residential area of Calicut. Features a spacious garden, covered parking, and proximity to schools and hospitals.",
        propertyType: "house",
        price: 25000,
        bedrooms: 3,
        bathrooms: 2,
        areaSqFt: 1800,
        amenities: ["Parking", "Garden", "Security", "Water Supply", "Power Backup"],
        address: {
            street: "Pavangad, Kozhikode",
            city: "Calicut",
            state: "Kerala",
            zipCode: "673001",
            country: "India",
        },
        images: [
            {
                url: "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=800&q=80",
                publicId: "seed/house-calicut-1",
            },
            {
                url: "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=800&q=80",
                publicId: "seed/house-calicut-2",
            },
        ],
        status: "active",
    },
    {
        title: "Cozy 1BHK Studio in Thrissur",
        description:
            "A compact and well-furnished studio apartment ideal for bachelors or students. Located near Thrissur Round with easy access to public transport.",
        propertyType: "studio",
        price: 10000,
        bedrooms: 1,
        bathrooms: 1,
        areaSqFt: 550,
        amenities: ["WiFi", "Furnished", "Power Backup"],
        address: {
            street: "Round South, Thrissur",
            city: "Thrissur",
            state: "Kerala",
            zipCode: "680001",
            country: "India",
        },
        images: [
            {
                url: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80",
                publicId: "seed/studio-thrissur-1",
            },
        ],
        status: "active",
    },
    {
        title: "Luxurious 3BHK Villa in Trivandrum",
        description:
            "An elegant villa with premium finishes, private garden, and dedicated parking. Located in a gated community with 24/7 security and clubhouse access.",
        propertyType: "villa",
        price: 45000,
        bedrooms: 3,
        bathrooms: 3,
        areaSqFt: 2400,
        amenities: [
            "Swimming Pool",
            "Gym",
            "Garden",
            "Security",
            "Clubhouse",
            "Parking",
            "WiFi",
        ],
        address: {
            street: "Kowdiar, Thiruvananthapuram",
            city: "Trivandrum",
            state: "Kerala",
            zipCode: "695003",
            country: "India",
        },
        images: [
            {
                url: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=800&q=80",
                publicId: "seed/villa-tvm-1",
            },
            {
                url: "https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=800&q=80",
                publicId: "seed/villa-tvm-2",
            },
        ],
        status: "active",
    },
    {
        title: "Furnished Room near IT Park, Kochi",
        description:
            "A fully furnished single room with attached bathroom, ideal for IT professionals. Walking distance to Infopark with food options nearby.",
        propertyType: "room",
        price: 8500,
        bedrooms: 1,
        bathrooms: 1,
        areaSqFt: 350,
        amenities: ["WiFi", "Furnished", "AC", "Meals Available"],
        address: {
            street: "Kakkanad, Kochi",
            city: "Kochi",
            state: "Kerala",
            zipCode: "682030",
            country: "India",
        },
        images: [
            {
                url: "https://images.unsplash.com/photo-1600566752355-35792bedcfea?auto=format&fit=crop&w=800&q=80",
                publicId: "seed/room-kochi-1",
            },
        ],
        status: "active",
    },
    {
        title: "2BHK Apartment near Calicut Beach",
        description:
            "A sea-facing 2BHK apartment just 500 meters from Calicut Beach. Enjoy fresh sea breeze and sunset views from the balcony.",
        propertyType: "apartment",
        price: 15000,
        bedrooms: 2,
        bathrooms: 1,
        areaSqFt: 900,
        amenities: ["Parking", "Beach Proximity", "Balcony", "Water Supply"],
        address: {
            street: "Beypore Road, Kozhikode",
            city: "Calicut",
            state: "Kerala",
            zipCode: "673015",
            country: "India",
        },
        images: [
            {
                url: "https://images.unsplash.com/photo-1600573472592-401b489a3cdc?auto=format&fit=crop&w=800&q=80",
                publicId: "seed/apt-calicut-1",
            },
            {
                url: "https://images.unsplash.com/photo-1600566753051-f0b892872171?auto=format&fit=crop&w=800&q=80",
                publicId: "seed/apt-calicut-2",
            },
        ],
        status: "active",
    },
    {
        title: "Independent House in Thrissur Town",
        description:
            "A traditional Kerala-style independent house with modern interiors. Ideal for families who value privacy and space in a central location.",
        propertyType: "house",
        price: 20000,
        bedrooms: 3,
        bathrooms: 2,
        areaSqFt: 1600,
        amenities: ["Parking", "Garden", "Water Supply", "Security"],
        address: {
            street: "Chembukkavu, Thrissur",
            city: "Thrissur",
            state: "Kerala",
            zipCode: "680020",
            country: "India",
        },
        images: [
            {
                url: "https://images.unsplash.com/photo-1605276374104-dee2a0ed3cd6?auto=format&fit=crop&w=800&q=80",
                publicId: "seed/house-thrissur-1",
            },
            {
                url: "https://images.unsplash.com/photo-1600585154363-67eb9e2e2099?auto=format&fit=crop&w=800&q=80",
                publicId: "seed/house-thrissur-2",
            },
        ],
        status: "active",
    },
    {
        title: "Premium 1BHK in Bangalore",
        description:
            "A premium 1BHK in Koramangala with coworking space, rooftop lounge, and modern fitness center. Perfect for young professionals in the tech hub.",
        propertyType: "apartment",
        price: 22000,
        bedrooms: 1,
        bathrooms: 1,
        areaSqFt: 700,
        amenities: ["WiFi", "Gym", "Coworking Space", "Rooftop", "Security", "Parking"],
        address: {
            street: "5th Block, Koramangala",
            city: "Bangalore",
            state: "Karnataka",
            zipCode: "560095",
            country: "India",
        },
        images: [
            {
                url: "https://images.unsplash.com/photo-1600607687644-aac4c3eac7f4?auto=format&fit=crop&w=800&q=80",
                publicId: "seed/apt-blr-1",
            },
            {
                url: "https://images.unsplash.com/photo-1600566752229-250ed79470f6?auto=format&fit=crop&w=800&q=80",
                publicId: "seed/apt-blr-2",
            },
        ],
        status: "active",
    },
    {
        title: "2BHK Villa with Pool in Trivandrum",
        description:
            "A modern villa with private pool and landscaped garden in the upscale Pattom area. Features smart home automation and premium fittings throughout.",
        propertyType: "villa",
        price: 38000,
        bedrooms: 2,
        bathrooms: 2,
        areaSqFt: 1800,
        amenities: [
            "Swimming Pool",
            "Smart Home",
            "Garden",
            "Parking",
            "Security",
            "AC",
        ],
        address: {
            street: "Pattom, Thiruvananthapuram",
            city: "Trivandrum",
            state: "Kerala",
            zipCode: "695004",
            country: "India",
        },
        images: [
            {
                url: "https://images.unsplash.com/photo-1600047509807-ba8f99d2cdde?auto=format&fit=crop&w=800&q=80",
                publicId: "seed/villa-tvm2-1",
            },
        ],
        status: "active",
    },
    {
        title: "Shared Room near University, Kochi",
        description:
            "A clean shared room near Cochin University with common kitchen and study area. Budget-friendly option for students with reliable internet.",
        propertyType: "room",
        price: 5500,
        bedrooms: 1,
        bathrooms: 1,
        areaSqFt: 250,
        amenities: ["WiFi", "Kitchen", "Study Area", "Laundry"],
        address: {
            street: "CUSAT Campus Road, Kochi",
            city: "Kochi",
            state: "Kerala",
            zipCode: "682022",
            country: "India",
        },
        images: [
            {
                url: "https://images.unsplash.com/photo-1600566753151-384129cf4e3e?auto=format&fit=crop&w=800&q=80",
                publicId: "seed/room-kochi2-1",
            },
        ],
        status: "active",
    },
];

async function seed() {
    try {
        await mongoose.connect(MONGO_URI);
        console.log("MongoDB connected for seeding");

        // Clear existing seed data
        await User.deleteMany({ email: ownerEmail });
        await Property.deleteMany({ title: { $in: properties.map((p) => p.title) } });
        console.log("Cleared existing seed data");

        // Create owner user
        const passwordHash = await bcrypt.hash(ownerPassword, 10);
        const owner = await User.create({
            name: "Demo Owner",
            email: ownerEmail,
            password_hash: passwordHash,
            role: UserRole.OWNER,
            isVerified: true,
            verificationStatus: "approved",
            status: UserStatus.ACTIVE,
        });
        console.log(`Owner created: ${ownerEmail} (id: ${owner._id})`);

        // Insert properties
        const propertyDocs = properties.map((p) => ({
            ...p,
            owner: owner._id,
        }));
        await Property.insertMany(propertyDocs);
        console.log(`${properties.length} properties seeded`);

        await mongoose.disconnect();
        console.log("Done — disconnected from MongoDB");
    } catch (err) {
        console.error("Seeding failed:", err);
        await mongoose.disconnect();
        process.exit(1);
    }
}

seed();
