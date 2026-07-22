// routes/classRoutes.js
import { Router } from "express";
import {
  listClasses,
  createClass,
  updateClass,
  deleteClass,
  assignSubjectTeacher,
  removeSubjectTeacher,
} from "../controllers/classController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();
router.use(requireAuth);

router.get("/", listClasses);
router.post("/", createClass);
router.put("/:id", updateClass);
router.delete("/:id", deleteClass);
router.put("/:id/subject-teachers", assignSubjectTeacher);
router.delete("/:id/subject-teachers", removeSubjectTeacher);

export default router;
