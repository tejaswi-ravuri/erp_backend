import express from "express";
import rateLimit from "express-rate-limit";
import { requireAuth, requireRole } from "../middleware/auth.js";
import {
  login,
  refresh,
  logout,
  me,
  changePassword,
  createUser,
  listUsers,
  updateUser,
  adminResetPassword,
} from "../controllers/authController.js";
import { ROLES } from "../config/constants.js";

const router = express.Router();

// Slow down brute-force attempts on login specifically.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: "Too many login attempts. Please try again in a few minutes.",
  },
});

router.post("/login", loginLimiter, login);
router.post("/refresh", refresh);

router.use(requireAuth);

router.post("/logout", logout);
router.get("/me", me);
router.put("/change-password", changePassword);

// User management - only Principal (own branch) or Super Admin (all branches)
router.post("/users", requireRole(ROLES.PRINCIPAL), createUser);
router.get("/users", requireRole(ROLES.PRINCIPAL), listUsers);
router.put("/users/:id", requireRole(ROLES.PRINCIPAL), updateUser);
router.put(
  "/users/:id/reset-password",
  requireRole(ROLES.PRINCIPAL),
  adminResetPassword,
);

export default router;
