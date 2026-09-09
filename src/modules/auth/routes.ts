import { Router } from "express";
import type { Request, Response } from "express";
import type { AuthRequest } from "../../types/roleTypes.js";
import protect from "../../shared/middleware/authMiddleware.js";
import authController from "./controller.js";

const router = Router();

router.post("/signup", authController.signup);
router.post("/login", authController.login);
router.post("/refresh", authController.refresh);
router.get("/me", protect, (req: AuthRequest, res: Response) => {
    res.status(200).json({ success: true, data: req.user });
});

const authRoutes = router;
export default authRoutes;
