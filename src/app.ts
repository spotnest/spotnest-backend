
import "./shared/config/env.js";

import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import apiRouter from "./routes/index.js";
import errorHandler from "./shared/middleware/errorHandler.js";

const app = express();

const clientOrigin = (process.env.CLIENT_URL || "http://localhost:3000").replace(/\/$/, "");

app.use(
  cors({
    origin: clientOrigin,
    credentials: true,
  })
);
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));
app.use(cookieParser());

app.use("/api/v1", apiRouter);

app.use((req, res) => {
  res.status(404).json({ success: false, message: "Route not found" });
});

app.use(errorHandler);

export default app;