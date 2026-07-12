// routes/classRoutes.js
import { Router } from "express";
import {
  listClasses,
  createClass,
  updateClass,
  deleteClass,
} from "../controllers/classController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

router.get("/", listClasses);
router.post("/", createClass);
router.put("/:id", updateClass);
router.delete("/:id", deleteClass);

export default router;
