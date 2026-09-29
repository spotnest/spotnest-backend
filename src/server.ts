import "./shared/config/env.js";

import connectDb from './shared/config/db.js';
import app from './app.js';
import { createServer } from "node:http";
import { initSocket } from "./shared/socket/index.js";

const PORT = process.env.PORT || 5000;
const startServer = async (): Promise<void> => {
    await connectDb();

    // app.listen(PORT, () => {
    //     console.log(`SpotNest backend running on port ${PORT}`);
    // });
    const httpServer = createServer(app);
    initSocket(httpServer);
    httpServer.listen(PORT, () => {
        console.log(`SpotNest backend running on port ${PORT}`);
    });
};

startServer();