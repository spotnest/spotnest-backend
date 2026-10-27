import dns from "node:dns";

// Fix MongoDB Atlas SRV DNS resolution
dns.setServers(["1.1.1.1", "8.8.8.8"]);

import "./shared/config/env.js";

import connectDb from "./shared/config/db.js";
import app from "./app.js";
import { createServer } from "node:http";
import { initSocket } from "./shared/socket/index.js";
import { startRentalScheduler } from "./modules/rentals/scheduler.js";

const PORT = process.env.PORT || 5000;

const startServer = async (): Promise<void> => {
    try {
        await connectDb();
        startRentalScheduler();

        const httpServer = createServer(app);

        initSocket(httpServer);

        httpServer.listen(PORT, () => {
            console.log(`SpotNest backend running on port ${PORT}`);
        });
    } catch (error) {
        console.error("Failed to start SpotNest backend:", error);
        process.exit(1);
    }
};

startServer();
