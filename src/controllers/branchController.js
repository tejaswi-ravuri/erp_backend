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

// GET /api/branches
export const list = async (req, res) => {
  try {
    const filter = {};
    // Single-branch roles only ever see their own branch; multi-branch
    // roles (super_admin, accounts_manager) see all of them.
    if (req.user.branch) filter._id = req.user.branch;

    const branches = await Branch.find(filter).select("name code").lean();
    return res.json({ success: true, data: branches });
  } catch (err) {
    console.error("branches.list error:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch branches." });
  }
};
