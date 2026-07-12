// controllers/expenditureController.js
//
// isAllowed("Expenditure", action, role) - rbac/permissions.js already
// has an Expenditure entry: create/update/delete/read all include
// ADMIN_OFFICER, ACCOUNTS_MANAGER, PRINCIPAL.
//
// approved_by is a User reference on the schema - set here from
// req.user.id server-side rather than trusting a client-supplied value
// (the reference frontend's ExpenditurePanel had a free-text "Approved
// By" input, which doesn't match a User ObjectId ref at all).

import Expenditure from "../models/Expenditure.js";
import { isAllowed } from "../rbac/permissions.js";

const ENTITY = "Expenditure";

const forbidden = (res, action) =>
  res.status(403).json({
    success: false,
    message: `You do not have permission to ${action} expenditure records.`,
  });

// GET /api/expenditure
// params (all optional): category, sort, limit, from, to
export const list = async (req, res) => {
  try {
    if (!isAllowed(ENTITY, "read", req.user.role))
      return forbidden(res, "view");

    const { category, sort, limit, from, to } = req.query;
    const filter = {};
    if (req.user.branch) filter.branch = req.user.branch;
    if (category) filter.category = category;
    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = new Date(from);
      if (to) filter.date.$lte = new Date(to);
    }

    let query = Expenditure.find(filter).populate("approved_by", "full_name");
    if (sort) query = query.sort(sort);
    if (limit) query = query.limit(Number(limit));

    const records = await query.lean();
    return res.json({ success: true, data: records });
  } catch (err) {
    console.error("expenditure.list error:", err.message);
    return res
      .status(500)
      .json({
        success: false,
        message: "Failed to fetch expenditure records.",
      });
  }
};

// POST /api/expenditure
export const create = async (req, res) => {
  try {
    if (!isAllowed(ENTITY, "create", req.user.role))
      return forbidden(res, "create");

    const branch = req.body.branch || req.user.branch;
    if (!branch) {
      return res
        .status(400)
        .json({ success: false, message: "A branch is required." });
    }

    const record = await Expenditure.create({
      ...req.body,
      branch,
      approved_by: req.user.id,
    });

    const populated = await record.populate("approved_by", "full_name");
    return res.status(201).json({ success: true, data: populated });
  } catch (err) {
    console.error("expenditure.create error:", err.message);
    return res
      .status(500)
      .json({
        success: false,
        message: "Failed to create expenditure record.",
      });
  }
};

// PUT /api/expenditure/:id
export const update = async (req, res) => {
  try {
    if (!isAllowed(ENTITY, "update", req.user.role))
      return forbidden(res, "update");

    const filter = { _id: req.params.id };
    if (req.user.branch) filter.branch = req.user.branch;
    const existing = await Expenditure.findOne(filter);
    if (!existing) {
      return res
        .status(404)
        .json({ success: false, message: "Expenditure record not found." });
    }

    const { approved_by, ...rest } = req.body; // never trust a client-supplied approver
    Object.assign(existing, rest);
    await existing.save();

    return res.json({ success: true, data: existing });
  } catch (err) {
    console.error("expenditure.update error:", err.message);
    return res
      .status(500)
      .json({
        success: false,
        message: "Failed to update expenditure record.",
      });
  }
};

// DELETE /api/expenditure/:id
export const remove = async (req, res) => {
  try {
    if (!isAllowed(ENTITY, "delete", req.user.role))
      return forbidden(res, "delete");

    const filter = { _id: req.params.id };
    if (req.user.branch) filter.branch = req.user.branch;
    const existing = await Expenditure.findOne(filter);
    if (!existing) {
      return res
        .status(404)
        .json({ success: false, message: "Expenditure record not found." });
    }

    await existing.deleteOne();
    return res.json({ success: true, data: { _id: existing._id } });
  } catch (err) {
    console.error("expenditure.remove error:", err.message);
    return res
      .status(500)
      .json({
        success: false,
        message: "Failed to delete expenditure record.",
      });
  }
};
