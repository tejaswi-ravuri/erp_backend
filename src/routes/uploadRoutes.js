import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { upload } from "../middleware/upload.js";
import { uploadFile } from "../controllers/uploadController.js";

const router = express.Router();
router.use(requireAuth);

// :category is one of students | staff | documents - controls which local subfolder it lands in.
router.post("/:category", upload.single("file"), uploadFile);

export default router;
