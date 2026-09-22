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
        // [longitude, latitude] — Kochi city centre
        location: { type: "Point", coordinates: [76.27, 9.97] },
        locationResolvedName: "Kochi, Ernakulam, Kerala, India",
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
        // [longitude, latitude] — Calicut (Kozhikode) city centre
        location: { type: "Point", coordinates: [75.74, 11.25] },
        locationResolvedName: "Calicut, Kozhikode, Kerala, India",
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
        // [longitude, latitude] — Thrissur city centre
        location: { type: "Point", coordinates: [76.21, 10.52] },
        locationResolvedName: "Thrissur, Kerala, India",
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
        // [longitude, latitude] — Trivandrum (Thiruvananthapuram) city centre
        location: { type: "Point", coordinates: [76.94, 8.52] },
        locationResolvedName: "Trivandrum, Thiruvananthapuram, Kerala, India",
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
        // [longitude, latitude] — Kochi (Kakkanad, Infopark area)
        location: { type: "Point", coordinates: [76.27, 9.97] },
        locationResolvedName: "Kochi, Ernakulam, Kerala, India",
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
        // [longitude, latitude] — Calicut (Beypore area)
        location: { type: "Point", coordinates: [75.74, 11.25] },
        locationResolvedName: "Calicut, Kozhikode, Kerala, India",
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
        // [longitude, latitude] — Thrissur
        location: { type: "Point", coordinates: [76.21, 10.52] },
        locationResolvedName: "Thrissur, Kerala, India",
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
        // [longitude, latitude] — Bangalore (Koramangala) city centre; inland,
        // so its longitude is the outlier of this list — that's correct, not a typo
        location: { type: "Point", coordinates: [77.59, 12.97] },
        locationResolvedName: "Bangalore, Bengaluru, Karnataka, India",
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
        // [longitude, latitude] — Trivandrum (Pattom area)
        location: { type: "Point", coordinates: [76.94, 8.52] },
        locationResolvedName: "Trivandrum, Thiruvananthapuram, Kerala, India",
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
        // [longitude, latitude] — Kochi (CUSAT area)
        location: { type: "Point", coordinates: [76.27, 9.97] },
        locationResolvedName: "Kochi, Ernakulam, Kerala, India",
        images: [
            {
                url: "https://images.unsplash.com/photo-1600566753151-384129cf4e3e?auto=format&fit=crop&w=800&q=80",
                publicId: "seed/room-kochi2-1",
            },
        ],
        status: "active",
    },
    {
        title: "Cozy 1BHK in Puthiyara, Calicut",
        description:
            "A cozy 1BHK flat in the quiet Puthiyara locality, a short walk from the city and well connected by bus. Ideal for singles or couples.",
        propertyType: "apartment",
        price: 9000,
        bedrooms: 1,
        bathrooms: 1,
        areaSqFt: 650,
        amenities: ["WiFi", "Parking", "Water Supply", "Power Backup"],
        address: {
            street: "Puthiyara Junction, Kozhikode",
            city: "Calicut",
            state: "Kerala",
            zipCode: "673004",
            country: "India",
        },
        // [longitude, latitude] — ~1.9 km from Mankavu (user's near-me probe point)
        location: { type: "Point", coordinates: [75.8, 11.25] },
        locationResolvedName: "Puthiyara, Kozhikode, Kerala, India",
        images: [
            {
                url: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=800&q=80",
                publicId: "seed/apt-puthiyara-1",
            },
        ],
        status: "active",
    },
    {
        title: "Modern 2BHK near Medical College, Calicut",
        description:
            "A modern 2BHK close to the Medical College campus with wide rooms, lift, and dedicated parking. Great for residents or students.",
        propertyType: "apartment",
        price: 16000,
        bedrooms: 2,
        bathrooms: 2,
        areaSqFt: 1100,
        amenities: ["WiFi", "Parking", "Lift", "Water Supply", "Power Backup"],
        address: {
            street: "Medical College Road, Kozhikode",
            city: "Calicut",
            state: "Kerala",
            zipCode: "673008",
            country: "India",
        },
        // [longitude, latitude] — ~3.6 km from Mankavu
        location: { type: "Point", coordinates: [75.84, 11.24] },
        locationResolvedName: "Kozhikode, Kerala, India",
        images: [
            {
                url: "https://images.unsplash.com/photo-1600573472592-401b489a3cdc?auto=format&fit=crop&w=800&q=80",
                publicId: "seed/apt-medicalcollege-1",
            },
            {
                url: "https://images.unsplash.com/photo-1600566753051-f0b892872171?auto=format&fit=crop&w=800&q=80",
                publicId: "seed/apt-medicalcollege-2",
            },
        ],
        status: "active",
    },
    {
        title: "Independent House in Kottooli, Calicut",
        description:
            "A peaceful independent house in Kottooli with a small garden and covered parking, ideal for families wanting space and privacy.",
        propertyType: "house",
        price: 28000,
        bedrooms: 3,
        bathrooms: 2,
        areaSqFt: 1900,
        amenities: ["Parking", "Garden", "Security", "Water Supply"],
        address: {
            street: "Kottooli, Kozhikode",
            city: "Calicut",
            state: "Kerala",
            zipCode: "673016",
            country: "India",
        },
        // [longitude, latitude] — ~6.6 km from Mankavu, ~5.9 km from Calicut centre
        location: { type: "Point", coordinates: [75.76, 11.2] },
        locationResolvedName: "Kottooli, Kozhikode, Kerala, India",
        images: [
            {
                url: "https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=800&q=80",
                publicId: "seed/house-kottooli-1",
            },
        ],
        status: "active",
    },
    {
        title: "Furnished Studio near Nadakkavu, Calicut",
        description:
            "A compact furnished studio near Nadakkavu bus stand, fully equipped for working professionals looking for a short commute.",
        propertyType: "studio",
        price: 7000,
        bedrooms: 1,
        bathrooms: 1,
        areaSqFt: 450,
        amenities: ["WiFi", "Furnished", "AC", "Water Supply"],
        address: {
            street: "Nadakkavu, Kozhikode",
            city: "Calicut",
            state: "Kerala",
            zipCode: "673011",
            country: "India",
        },
        // [longitude, latitude] — ~8.3 km from Mankavu (inside 10 km), ~15.9 km
        // from Calicut centre (outside) — good two-sided cutoff test
        location: { type: "Point", coordinates: [75.88, 11.21] },
        locationResolvedName: "Nadakkavu, Kozhikode, Kerala, India",
        images: [
            {
                url: "https://images.unsplash.com/photo-1600566752355-35792bedcfea?auto=format&fit=crop&w=800&q=80",
                publicId: "seed/studio-nadakkavu-1",
            },
        ],
        status: "active",
    },
    {
        title: "Beach Villa at Kappad, Calicut",
        description:
            "A premium beach-side villa near Kappad Beach with sea-view balconies, private garden, and high-end fittings throughout.",
        propertyType: "villa",
        price: 40000,
        bedrooms: 3,
        bathrooms: 3,
        areaSqFt: 2200,
        amenities: ["Swimming Pool", "Garden", "Parking", "Security", "AC", "WiFi"],
        address: {
            street: "Kappad Beach Road, Koyilandy",
            city: "Calicut",
            state: "Kerala",
            zipCode: "673304",
            country: "India",
        },
        // [longitude, latitude] — Kappad is ~21 km from Mankavu and ~16 km from
        // Calicut centre, so it must be EXCLUDED from both near-me searches.
        location: { type: "Point", coordinates: [75.68, 11.38] },
        locationResolvedName: "Kappad, Kozhikode, Kerala, India",
        images: [
            {
                url: "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?auto=format&fit=crop&w=800&q=80",
                publicId: "seed/villa-kappad-1",
            },
            {
                url: "https://images.unsplash.com/photo-1600585154526-990dced4db0d?auto=format&fit=crop&w=800&q=80",
                publicId: "seed/villa-kappad-2",
            },
        ],
        status: "active",
    },
    {
        title: "Budget Room in Feroke, Calicut",
        description:
            "A clean budget room in Feroke with shared kitchen and quick access to the rail station. Cheap option for students and daily commuters.",
        propertyType: "room",
        price: 6000,
        bedrooms: 1,
        bathrooms: 1,
        areaSqFt: 300,
        amenities: ["WiFi", "Kitchen", "Laundry"],
        address: {
            street: "Feroke, Kozhikode",
            city: "Calicut",
            state: "Kerala",
            zipCode: "673631",
            country: "India",
        },
        // [longitude, latitude] — ~15.7 km from Mankavu (cutoff test: excluded)
        location: { type: "Point", coordinates: [75.94, 11.18] },
        locationResolvedName: "Feroke, Kozhikode, Kerala, India",
        images: [
            {
                url: "https://images.unsplash.com/photo-1600566753151-384129cf4e3e?auto=format&fit=crop&w=800&q=80",
                publicId: "seed/room-feroke-1",
            },
        ],
        status: "active",
    },
    {
        title: "2BHK Garden Apartment in Edappally, Kochi",
        description:
            "A bright 2BHK in Edappally with a shared garden and gym, minutes from Lulu Mall and the metro.",
        propertyType: "apartment",
        price: 17000,
        bedrooms: 2,
        bathrooms: 2,
        areaSqFt: 1150,
        amenities: ["WiFi", "Gym", "Garden", "Parking", "Power Backup"],
        address: {
            street: "Edappally, Kochi",
            city: "Kochi",
            state: "Kerala",
            zipCode: "682024",
            country: "India",
        },
        // [longitude, latitude] — ~4.5 km east of Kochi centre
        location: { type: "Point", coordinates: [76.31, 9.98] },
        locationResolvedName: "Edappally, Ernakulam, Kerala, India",
        images: [
            {
                url: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?auto=format&fit=crop&w=800&q=80",
                publicId: "seed/apt-edappally-1",
            },
        ],
        status: "active",
    },
    {
        title: "Compact Studio in Vyttila, Kochi",
        description:
            "A value studio in Vyttila by the Ponnurunni junction, fully furnished and close to shopping centers.",
        propertyType: "studio",
        price: 8000,
        bedrooms: 1,
        bathrooms: 1,
        areaSqFt: 420,
        amenities: ["WiFi", "Furnished", "Water Supply"],
        address: {
            street: "Vyttila, Kochi",
            city: "Kochi",
            state: "Kerala",
            zipCode: "682019",
            country: "India",
        },
        // [longitude, latitude] — ~5.9 km from Kochi centre
        location: { type: "Point", coordinates: [76.31, 9.94] },
        locationResolvedName: "Vyttila, Ernakulam, Kerala, India",
        images: [
            {
                url: "https://images.unsplash.com/photo-1600210492486-724fe5c67fb0?auto=format&fit=crop&w=800&q=80",
                publicId: "seed/studio-vyttila-1",
            },
        ],
        status: "active",
    },
    {
        title: "Premium Studio in Indiranagar, Bangalore",
        description:
            "A premium studio on 100 Feet Road, Indiranagar with a rooftop lounge, gym, and 24/7 security.",
        propertyType: "studio",
        price: 20000,
        bedrooms: 1,
        bathrooms: 1,
        areaSqFt: 600,
        amenities: ["WiFi", "Gym", "Rooftop", "Security", "Parking"],
        address: {
            street: "100 Feet Road, Indiranagar",
            city: "Bangalore",
            state: "Karnataka",
            zipCode: "560008",
            country: "India",
        },
        // [longitude, latitude] — ~4.4 km from Bangalore centre
        location: { type: "Point", coordinates: [77.63, 12.97] },
        locationResolvedName: "Indiranagar, Bengaluru, Karnataka, India",
        images: [
            {
                url: "https://images.unsplash.com/photo-1600607687644-aac4c3eac7f4?auto=format&fit=crop&w=800&q=80",
                publicId: "seed/studio-indiranagar-1",
            },
        ],
        status: "active",
    },
    {
        title: "Spacious 3BHK in HSR Layout, Bangalore",
        description:
            "A large 3BHK in HSR Layout Phase 2, close to tech parks, with modular kitchen and covered parking.",
        propertyType: "house",
        price: 35000,
        bedrooms: 3,
        bathrooms: 2,
        areaSqFt: 2100,
        amenities: ["WiFi", "Parking", "Security", "Modular Kitchen"],
        address: {
            street: "27th Main, HSR Layout",
            city: "Bangalore",
            state: "Karnataka",
            zipCode: "560102",
            country: "India",
        },
        // [longitude, latitude] — ~9.0 km from Bangalore centre (near the cutoff)
        location: { type: "Point", coordinates: [77.64, 12.91] },
        locationResolvedName: "HSR Layout, Bengaluru, Karnataka, India",
        images: [
            {
                url: "https://images.unsplash.com/photo-1600566752229-250ed79470f6?auto=format&fit=crop&w=800&q=80",
                publicId: "seed/house-hsr-1",
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
