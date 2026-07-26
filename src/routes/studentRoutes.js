// routes/studentRoutes.js
import { Router } from "express";
import {
  listStudents,
  getStudentById,
  createStudent,
  bulkCreateStudents,
  updateStudent,
  promoteStudents,
  deleteStudent,
} from "../controllers/studentController.js";
import { requireAuth } from "../middleware/auth.js";

const studentRoutes = Router();
studentRoutes.use(requireAuth);

studentRoutes.get("/", listStudents);
studentRoutes.get("/:id", getStudentById);
studentRoutes.post("/", createStudent);
studentRoutes.post("/bulk", bulkCreateStudents);
studentRoutes.post("/promote", promoteStudents);
studentRoutes.put("/:id", updateStudent);
studentRoutes.delete("/:id", deleteStudent);

export default studentRoutes;
