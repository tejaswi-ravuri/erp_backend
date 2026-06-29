import express from "express";
import { requireAuth } from "../middleware/auth.js";
import { createEntityController } from "../controllers/entityController.js";
import { getModel } from "../models/index.js";
import { ApiError } from "../utils/ApiError.js";
import { asyncHandler } from "../utils/asyncHandler.js";

const router = express.Router();

router.use(requireAuth);

// Resolves :entityName to its Mongoose model once, on every request, and
// attaches the right controller. Keeps this file from needing 15 near-identical
// route blocks while still giving every entity its own RBAC rule (see rbac/permissions.js).
router.use(
  "/:entityName",
  asyncHandler(async (req, res, next) => {
    const Model = getModel(req.params.entityName);
    if (!Model) {
      throw new ApiError(404, `Unknown entity: ${req.params.entityName}`);
    }
    req.entityName = req.params.entityName;
    req.controller = createEntityController(req.params.entityName, Model);
    next();
  }),
);

router.get("/:entityName", (req, res, next) => req.controller.list(req, res, next));
router.post("/:entityName", (req, res, next) => req.controller.create(req, res, next));
router.delete("/:entityName", (req, res, next) => req.controller.deleteMany(req, res, next));

router.post("/:entityName/bulk", (req, res, next) => req.controller.bulkCreate(req, res, next));
router.put("/:entityName/bulk", (req, res, next) => req.controller.bulkUpdate(req, res, next));
router.patch("/:entityName/update-many", (req, res, next) => req.controller.updateMany(req, res, next));

router.get("/:entityName/:id", (req, res, next) => req.controller.getById(req, res, next));
router.put("/:entityName/:id", (req, res, next) => req.controller.update(req, res, next));
router.delete("/:entityName/:id", (req, res, next) => req.controller.deleteOne(req, res, next));
router.put("/:entityName/:id/restore", (req, res, next) => req.controller.restore(req, res, next));

export default router;
