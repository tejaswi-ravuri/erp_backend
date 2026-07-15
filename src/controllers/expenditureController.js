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
import { resolveBranchQueryFilter } from "../middleware/branchScope.js";

const ENTITY = "Expenditure";

const forbidden = (res, action) =>
  res.status(403).json({
    success: false,
    message: `You do not have permission to ${action} expenditure records.`,
  });

// Which payment-mode-specific fields apply to each mode - mirrors the
// Cheque/OnlineTransfer/reference-only grouping in BPFees.jsx. Fields not
// listed for the current mode are cleared out so stale data from a
// previous mode never lingers on the record.
const PAYMENT_MODE_FIELDS = {
  Cheque: ["transaction_no", "cheque_date", "bank_name", "bank_branch"],
  OnlineTransfer: ["transaction_no", "bank_name", "bank_branch"],
  "Bank Transfer": ["transaction_no", "bank_name", "bank_branch"],
  "Swipe machine": ["transaction_no"],
  Paytm: ["transaction_no"],
  GooglePay: ["transaction_no"],
  PhonePay: ["transaction_no"],
  Others: ["transaction_no"],
  Cash: [],
};
const ALL_PAYMENT_FIELDS = ["transaction_no", "cheque_date", "bank_name", "bank_branch"];

function pickPaymentFields(mode, body) {
  const allowed = PAYMENT_MODE_FIELDS[mode] || [];
  const out = {};
  for (const field of ALL_PAYMENT_FIELDS) {
    out[field] = allowed.includes(field) ? body[field] : undefined;
  }
  return out;
}

// GET /api/expenditure
// params (all optional): category, payment_mode, sort, from, to, page, limit, branch
// page/limit turn on pagination - when page is present the response also
// carries a `meta` block ({ total, page, limit, totalPages }); when it's
// omitted (existing callers), the endpoint behaves as before. `branch` only
// has any effect for multi-branch roles (single-branch roles are always
// pinned to their own branch) - see resolveBranchQueryFilter.
export const list = async (req, res) => {
  try {
    if (!isAllowed(ENTITY, "read", req.user.role))
      return forbidden(res, "view");

    const { category, payment_mode, sort, limit, page, from, to, branch } =
      req.query;
    const { allowed, filter } = resolveBranchQueryFilter(req.user, branch);
    if (!allowed) {
      return res
        .status(403)
        .json({ success: false, message: "You do not have access to that branch." });
    }
    if (category) filter.category = category;
    if (payment_mode) filter.payment_mode = payment_mode;
    if (from || to) {
      filter.date = {};
      if (from) filter.date.$gte = new Date(from);
      if (to) filter.date.$lte = new Date(to);
    }

    let query = Expenditure.find(filter)
      .populate("branch", "name")
      .populate("approved_by", "full_name")
      .populate("delete_requested_by", "full_name");
    if (sort) query = query.sort(sort);

    let meta;
    if (page) {
      const pageNum = Math.max(parseInt(page, 10) || 1, 1);
      const pageSize = Math.max(parseInt(limit, 10) || 10, 1);
      const total = await Expenditure.countDocuments(filter);
      query = query.skip((pageNum - 1) * pageSize).limit(pageSize);
      meta = {
        total,
        page: pageNum,
        limit: pageSize,
        totalPages: Math.max(Math.ceil(total / pageSize), 1),
      };
    } else if (limit) {
      query = query.limit(Number(limit));
    }

    const records = await query.lean();
    return res.json({ success: true, data: records, ...(meta && { meta }) });
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

    const paymentMode = req.body.payment_mode || "Cash";
    const record = await Expenditure.create({
      ...req.body,
      ...pickPaymentFields(paymentMode, req.body),
      payment_mode: paymentMode,
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
// Editing a saved record is intentionally limited to payment_mode and its
// related details (transaction_no/cheque_date/bank_name/bank_branch) -
// every other field (amount included) is locked once the record exists.
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

    if (existing.delete_requested) {
      return res.status(409).json({
        success: false,
        message: "This record has a pending deletion request and cannot be edited.",
      });
    }

    if (req.body.payment_mode === undefined) {
      return res
        .status(400)
        .json({ success: false, message: "payment_mode is required." });
    }

    existing.payment_mode = req.body.payment_mode;
    const picked = pickPaymentFields(existing.payment_mode, req.body);
    for (const field of ALL_PAYMENT_FIELDS) existing[field] = picked[field];
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

// POST /api/expenditure/:id/request-delete
// Anyone with delete permission can request deletion, but this does not
// remove the record - it just flags it for an Admin Officer to approve.
export const requestDelete = async (req, res) => {
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

    if (existing.delete_requested) {
      return res.status(409).json({
        success: false,
        message: "A deletion request is already pending for this record.",
      });
    }

    existing.delete_requested = true;
    existing.delete_requested_by = req.user.id;
    existing.delete_requested_at = new Date();
    await existing.save();

    return res.json({ success: true, data: existing });
  } catch (err) {
    console.error("expenditure.requestDelete error:", err.message);
    return res
      .status(500)
      .json({
        success: false,
        message: "Failed to request deletion of expenditure record.",
      });
  }
};

// Admin Officers only manage deletion requests for branches assigned to
// them via User.branches - this is separate from the general "delete"
// RBAC permission, which only governs who can *request* a deletion.
const isBranchAdminOfficer = (user, branchId) =>
  user.role === "admin_officer" &&
  (user.branches || []).some((b) => b.toString() === branchId.toString());

// POST /api/expenditure/:id/approve-delete
export const approveDelete = async (req, res) => {
  try {
    const existing = await Expenditure.findById(req.params.id);
    if (!existing) {
      return res
        .status(404)
        .json({ success: false, message: "Expenditure record not found." });
    }

    if (!isBranchAdminOfficer(req.user, existing.branch)) {
      return forbidden(res, "approve deletion of");
    }

    if (!existing.delete_requested) {
      return res.status(409).json({
        success: false,
        message: "This record has no pending deletion request.",
      });
    }

    await existing.deleteOne();
    return res.json({ success: true, data: { _id: existing._id } });
  } catch (err) {
    console.error("expenditure.approveDelete error:", err.message);
    return res
      .status(500)
      .json({
        success: false,
        message: "Failed to approve deletion of expenditure record.",
      });
  }
};

// POST /api/expenditure/:id/reject-delete
export const rejectDelete = async (req, res) => {
  try {
    const existing = await Expenditure.findById(req.params.id);
    if (!existing) {
      return res
        .status(404)
        .json({ success: false, message: "Expenditure record not found." });
    }

    if (!isBranchAdminOfficer(req.user, existing.branch)) {
      return forbidden(res, "reject deletion of");
    }

    if (!existing.delete_requested) {
      return res.status(409).json({
        success: false,
        message: "This record has no pending deletion request.",
      });
    }

    existing.delete_requested = false;
    existing.delete_requested_by = null;
    existing.delete_requested_at = null;
    await existing.save();

    return res.json({ success: true, data: existing });
  } catch (err) {
    console.error("expenditure.rejectDelete error:", err.message);
    return res
      .status(500)
      .json({
        success: false,
        message: "Failed to reject deletion of expenditure record.",
      });
  }
};
