import dns from 'node:dns';
import mongoose from 'mongoose';

try {
    dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {
    // Keep system defaults if custom servers are disallowed
}

const connectDB = async (): Promise<void> => {
    //fsgohgsogkg
    try {
        const mongoUri = process.env.MONGO_URI;

        if (!mongoUri) {
            throw new Error('MONGO_URI is not defined in environment variables');
        }

        await mongoose.connect(mongoUri, {
            serverSelectionTimeoutMS: 15000,
            maxIdleTimeMS: 30000,
            socketTimeoutMS: 45000,
            retryWrites: true,
        });

        console.log('MongoDB connected successfully');
    } catch (error) {
        console.error('MongoDB connection failed:', error);
        process.exit(1);
    }
};

export default connectDB;
