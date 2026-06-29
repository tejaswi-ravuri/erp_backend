import mongoose from "mongoose";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { isAllowed } from "../rbac/permissions.js";
import { buildScopeFilter, sanitizeAndScopeBody } from "../middleware/branchScope.js";

const RESERVED_QUERY_KEYS = new Set(["sort", "limit", "page", "skip"]);

function parseListQuery(query) {
  const filter = {};
  for (const [key, value] of Object.entries(query)) {
    if (RESERVED_QUERY_KEYS.has(key)) continue;
    // supports comma-separated "in" matches: ?class=Class 5,Class 6
    if (typeof value === "string" && value.includes(",")) {
      filter[key] = { $in: value.split(",") };
    } else {
      filter[key] = value;
    }
  }
  const sort = query.sort || "-created_date";
  const limit = query.limit ? Math.min(parseInt(query.limit, 10), 1000) : 200;
  const page = query.page ? Math.max(parseInt(query.page, 10), 1) : 1;
  const skip = query.skip ? parseInt(query.skip, 10) : (page - 1) * limit;
  return { filter, sort, limit, skip };
}

function assertAllowed(entityName, action, role) {
  if (!isAllowed(entityName, action, role)) {
    throw new ApiError(403, `Your role is not permitted to ${action} ${entityName} records.`);
  }
}

export function createEntityController(entityName, Model) {
  return {
    // GET /api/entities/:entityName
    list: asyncHandler(async (req, res) => {
      assertAllowed(entityName, "read", req.user.role);
      const { filter, sort, limit, skip } = parseListQuery(req.query);
      const scope = buildScopeFilter(entityName, req.user);
      const finalFilter = { ...filter, ...scope };

      const [data, total] = await Promise.all([
        Model.find(finalFilter).sort(sort).skip(skip).limit(limit).lean(),
        Model.countDocuments(finalFilter),
      ]);

      res.json({ data, total, page: Math.floor(skip / limit) + 1, limit });
    }),

    // GET /api/entities/:entityName/:id
    getById: asyncHandler(async (req, res) => {
      assertAllowed(entityName, "read", req.user.role);
      const scope = buildScopeFilter(entityName, req.user);
      const doc = await Model.findOne({ _id: req.params.id, ...scope });
      if (!doc) throw new ApiError(404, `${entityName} record not found.`);
      res.json(doc);
    }),

    // POST /api/entities/:entityName
    create: asyncHandler(async (req, res) => {
      assertAllowed(entityName, "create", req.user.role);
      const body = sanitizeAndScopeBody(entityName, req.user, req.body);
      const doc = await Model.create({
        ...body,
        created_by: req.user._id,
        updated_by: req.user._id,
      });
      res.status(201).json(doc);
    }),

    // POST /api/entities/:entityName/bulk  (body: array of records)
    bulkCreate: asyncHandler(async (req, res) => {
      assertAllowed(entityName, "create", req.user.role);
      if (!Array.isArray(req.body)) {
        throw new ApiError(400, "Bulk create expects an array of records in the request body.");
      }
      const docs = req.body.map((item) => ({
        ...sanitizeAndScopeBody(entityName, req.user, item),
        created_by: req.user._id,
        updated_by: req.user._id,
      }));
      const created = await Model.insertMany(docs, { ordered: false });
      res.status(201).json({ created: created.length, data: created });
    }),

    // PUT /api/entities/:entityName/bulk  (body: array of {id, data})
    bulkUpdate: asyncHandler(async (req, res) => {
      assertAllowed(entityName, "update", req.user.role);
      if (!Array.isArray(req.body)) {
        throw new ApiError(400, "Bulk update expects an array of { id, data } records.");
      }
      const scope = buildScopeFilter(entityName, req.user);
      const results = [];
      for (const item of req.body) {
        const { id, data } = item;
        if (!id || !mongoose.isValidObjectId(id)) continue;
        const clean = sanitizeAndScopeBody(entityName, req.user, data || {});
        delete clean.branch; // never allow branch to move on update
        const updated = await Model.findOneAndUpdate(
          { _id: id, ...scope },
          { ...clean, updated_by: req.user._id },
          { new: true, runValidators: true },
        );
        if (updated) results.push(updated);
      }
      res.json({ updated: results.length, data: results });
    }),

    // PATCH /api/entities/:entityName/update-many  (body: { filter: {...}, update: {...} })
    updateMany: asyncHandler(async (req, res) => {
      assertAllowed(entityName, "update", req.user.role);
      const { filter = {}, update = {} } = req.body;
      const scope = buildScopeFilter(entityName, req.user);
      const clean = sanitizeAndScopeBody(entityName, req.user, update);
      delete clean.branch; // never allow a bulk query to move records across branches

      const result = await Model.updateMany(
        { ...filter, ...scope },
        { ...clean, updated_by: req.user._id },
      );
      res.json({ matched: result.matchedCount, modified: result.modifiedCount });
    }),

    // PUT /api/entities/:entityName/:id
    update: asyncHandler(async (req, res) => {
      assertAllowed(entityName, "update", req.user.role);
      const scope = buildScopeFilter(entityName, req.user);
      const clean = sanitizeAndScopeBody(entityName, req.user, req.body);
      delete clean.branch; // branch is immutable after creation via this endpoint

      const doc = await Model.findOneAndUpdate(
        { _id: req.params.id, ...scope },
        { ...clean, updated_by: req.user._id },
        { new: true, runValidators: true },
      );
      if (!doc) throw new ApiError(404, `${entityName} record not found.`);
      res.json(doc);
    }),

    // DELETE /api/entities/:entityName/:id  (soft delete)
    deleteOne: asyncHandler(async (req, res) => {
      assertAllowed(entityName, "delete", req.user.role);
      const scope = buildScopeFilter(entityName, req.user);
      const doc = await Model.findOneAndUpdate(
        { _id: req.params.id, ...scope },
        { is_deleted: true, deleted_at: new Date(), updated_by: req.user._id },
        { new: true },
      );
      if (!doc) throw new ApiError(404, `${entityName} record not found.`);
      res.json({ success: true, id: doc._id });
    }),

    // DELETE /api/entities/:entityName  (body: { ids: [...] }, soft delete many)
    deleteMany: asyncHandler(async (req, res) => {
      assertAllowed(entityName, "delete", req.user.role);
      const { ids } = req.body;
      if (!Array.isArray(ids) || ids.length === 0) {
        throw new ApiError(400, "Provide an array of ids to delete in the request body.");
      }
      const scope = buildScopeFilter(entityName, req.user);
      const result = await Model.updateMany(
        { _id: { $in: ids }, ...scope },
        { is_deleted: true, deleted_at: new Date(), updated_by: req.user._id },
      );
      res.json({ deleted: result.modifiedCount });
    }),

    // PUT /api/entities/:entityName/:id/restore
    restore: asyncHandler(async (req, res) => {
      assertAllowed(entityName, "delete", req.user.role); // restoring is gated by delete permission
      const scope = buildScopeFilter(entityName, req.user, { excludeDeleted: false });
      const doc = await Model.findOneAndUpdate(
        { _id: req.params.id, ...scope },
        { is_deleted: false, deleted_at: null, updated_by: req.user._id },
        { new: true },
      );
      if (!doc) throw new ApiError(404, `${entityName} record not found.`);
      res.json(doc);
    }),
  };
}
