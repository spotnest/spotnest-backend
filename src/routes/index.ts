import { Router } from "express";
import authRoutes from "../modules/auth/routes.js";

const apiRouter = Router();

apiRouter.use("/auth", authRoutes);

export default apiRouter;
