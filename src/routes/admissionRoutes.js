import express from "express";

import { requireAuth } from "../middleware/auth.js";
import * as admissionController from "../controllers/admissionController.js";

const admissionRouter = express.Router();

admissionRouter.use(requireAuth);

admissionRouter.get("/", admissionController.list);
admissionRouter.post("/", admissionController.create);
admissionRouter.put("/:id", admissionController.update);
admissionRouter.delete("/:id", admissionController.remove);
admissionRouter.post("/:id/admit", admissionController.admit);
admissionRouter.post("/:id/convert", admissionController.convert);

// Enquiry routes
admissionRouter.post("/addEnquiry", admissionController.addApplicationEnquiry);
admissionRouter.get("/enquiries", admissionController.listApplicationEnquiries);
admissionRouter.get(
  "/enquiry/:id",
  admissionController.getApplicationEnquiryById,
);
admissionRouter.put(
  "/enquiry/:id",
  admissionController.updateApplicationEnquiry,
);
admissionRouter.delete(
  "/enquiry/:id",
  admissionController.deleteApplicationEnquiry,
);

export default admissionRouter;
