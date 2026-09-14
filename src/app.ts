// Imported FIRST — its dotenv.config() must run before any transitively
// imported module (email.ts, cloudinary.ts, ...) reads process.env at
// module-eval time. Covers every entry that imports app directly, not just
// server.ts.
import "./shared/config/env.js";

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import apiRouter from "./routes/index.js";
import errorHandler from "./shared/middleware/errorHandler.js";

const app = express();

app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());
app.use(
  cors({
    origin: process.env.CLIENT_URL || "http://localhost:3000",
    credentials: true,
  })
);

app.use("/api/v1", apiRouter);

app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

app.use(errorHandler);

export default app;