// controllers/branchController.js
//
// ASSUMPTION FLAGGED: I don't have your actual Branch model or an
// existing branch controller/routes in this conversation - this is a
// minimal list-only endpoint assumed to exist so the Admissions form has
// somewhere to fetch real branches from (replacing the old hardcoded
// ["Hyderabad", "Secunderabad", "Kukatpally", "Miyapur"] array). If you
// already have a Branch model/controller, skip this file entirely and
// just point branchApi.list() (frontend/api.js) at your existing
// GET /api/branches (or whatever it's actually called).

import Branch from "../models/Branch.js";
import { ROLES } from "../config/constants.js";

// GET /api/branches
export const list = async (req, res) => {
  try {
    const filter = {};
    // Single-branch roles only ever see their own branch. Multi-branch
    // roles other than super_admin (currently just admin_officer) are
    // scoped to the specific branches they've been allotted, not every
    // branch in the system - super_admin still sees everything.
    if (req.user.branch) {
      filter._id = req.user.branch;
    } else if (
      req.user.role !== ROLES.SUPER_ADMIN &&
      Array.isArray(req.user.branches) &&
      req.user.branches.length > 0
    ) {
      filter._id = { $in: req.user.branches };
    }

    const branches = await Branch.find(filter).select("name code").lean();
    return res.json({ success: true, data: branches });
  } catch (err) {
    console.error("branches.list error:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch branches." });
  }
};
