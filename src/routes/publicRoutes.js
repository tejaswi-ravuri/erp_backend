import express from "express";
import rateLimit from "express-rate-limit";
import {
  registerTeacher,
  listPublicBranches,
} from "../controllers/publicController.js";

const router = express.Router();

// No requireAuth on this router at all - everything here is meant to be
// reachable with no login (see App.jsx: /teacher-registration). Rate-limited
// more tightly than the global baseline in app.js since unauthenticated
// endpoints are cheaper to hammer.
const publicLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
});
router.use(publicLimiter);

router.get("/branches", listPublicBranches);
router.post("/teacher-registration", registerTeacher);

export default router;
