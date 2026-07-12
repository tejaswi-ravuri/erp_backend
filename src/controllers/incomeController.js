// controllers/incomeController.js
//
// isAllowed("Income", action, role) - rbac/permissions.js already has an
// Income entry: create/update/delete = [ADMIN_OFFICER, ACCOUNTS_MANAGER],
// read adds PRINCIPAL.
//
// This is deliberately separate from feePaymentController.js - Income is
// generic school income not tied to a specific student (donations, rental
// income, misc receipts), while FeePayment is specifically a student's
// fee transaction. Don't merge these two flows.

import Income from "../models/Income.js";
import { isAllowed } from "../rbac/permissions.js";

const ENTITY = "Income";

const forbidden = (res, action) =>
  res.status(403).json({
    success: false,
    message: `You do not have permission to ${action} income records.`,
  });

// GET /api/income
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

    let query = Income.find(filter);
    if (sort) query = query.sort(sort);
    if (limit) query = query.limit(Number(limit));

    const records = await query.lean();
    return res.json({ success: true, data: records });
  } catch (err) {
    console.error("income.list error:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch income records." });
  }
};

// POST /api/income
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

    const record = await Income.create({ ...req.body, branch });
    return res.status(201).json({ success: true, data: record });
  } catch (err) {
    console.error("income.create error:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to create income record." });
  }
};

// PUT /api/income/:id
export const update = async (req, res) => {
  try {
    if (!isAllowed(ENTITY, "update", req.user.role))
      return forbidden(res, "update");

    const filter = { _id: req.params.id };
    if (req.user.branch) filter.branch = req.user.branch;
    const existing = await Income.findOne(filter);
    if (!existing) {
      return res
        .status(404)
        .json({ success: false, message: "Income record not found." });
    }

    Object.assign(existing, req.body);
    await existing.save();
    return res.json({ success: true, data: existing });
  } catch (err) {
    console.error("income.update error:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to update income record." });
  }
};

// DELETE /api/income/:id
export const remove = async (req, res) => {
  try {
    if (!isAllowed(ENTITY, "delete", req.user.role))
      return forbidden(res, "delete");

    const filter = { _id: req.params.id };
    if (req.user.branch) filter.branch = req.user.branch;
    const existing = await Income.findOne(filter);
    if (!existing) {
      return res
        .status(404)
        .json({ success: false, message: "Income record not found." });
    }

    await existing.deleteOne();
    return res.json({ success: true, data: { _id: existing._id } });
  } catch (err) {
    console.error("income.remove error:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to delete income record." });
  }
};
