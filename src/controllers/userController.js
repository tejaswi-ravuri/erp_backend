import User from "../models/User.js";
import { ROLES, SINGLE_BRANCH_ROLES } from "../config/constants.js";
import { isAllowed } from "../rbac/permissions.js";
import { resolveBranchQueryFilter } from "../middleware/branchScope.js";

const ENTITY = "User";

const forbidden = (res, action) =>
  res.status(403).json({
    success: false,
    message: `You do not have permission to ${action} users.`,
  });

// Which roles a creator may assign to a brand-new staff account. Admin
// Officer manages branch-level leadership across the org (Principal,
// Accounts Manager); Accounts Manager only ever adds Teachers into their
// own branch. Principal and super_admin are intentionally left out of
// this map - their existing (broader) ability to create users is
// unchanged, since only these two roles' scopes were narrowed.
const ASSIGNABLE_ROLES_ON_CREATE = {
  [ROLES.ADMIN_OFFICER]: [ROLES.PRINCIPAL, ROLES.ACCOUNTS_MANAGER],
  [ROLES.ACCOUNTS_MANAGER]: [ROLES.TEACHER],
};

// GET /api/users
export const list = async (req, res) => {
  try {
    if (!isAllowed(ENTITY, "read", req.user.role))
      return forbidden(res, "view");

    const { role, exclude_role, branch } = req.query;
    if (role === ROLES.STUDENT) {
      return res.status(400).json({
        success: false,
        message: "Student accounts aren't accessible via this endpoint.",
      });
    }

    const { allowed, filter } = resolveBranchQueryFilter(req.user, branch);
    if (!allowed) {
      return res
        .status(403)
        .json({ success: false, message: "You do not have access to that branch." });
    }
    if (role) {
      filter.role = role;
    } else {
      // Always exclude students by default, on top of whatever else the
      // caller wants excluded.
      const excluded = new Set([ROLES.STUDENT]);
      if (exclude_role) excluded.add(exclude_role);
      filter.role = { $nin: [...excluded] };
    }

    const users = await User.find(filter).lean();
    return res.json({ success: true, data: users });
  } catch (err) {
    console.error("users.list error:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch users." });
  }
};

// POST /api/users
export const create = async (req, res) => {
  try {
    if (!isAllowed(ENTITY, "create", req.user.role))
      return forbidden(res, "create");

    const { role, password } = req.body;
    if (role === ROLES.STUDENT) {
      return res.status(400).json({
        success: false,
        message:
          "Student accounts need the student admission flow, not this endpoint.",
      });
    }
    if (!password) {
      return res.status(400).json({
        success: false,
        message: "A password is required to create a user.",
      });
    }

    const assignableRoles = ASSIGNABLE_ROLES_ON_CREATE[req.user.role];
    if (assignableRoles && !assignableRoles.includes(role)) {
      return res.status(403).json({
        success: false,
        message: `Your role can only add: ${assignableRoles
          .map((r) => r.replace("_", " "))
          .join(", ")}.`,
      });
    }

    const branch = req.body.branch || req.user.branch;
    if (SINGLE_BRANCH_ROLES.includes(role) && !branch) {
      return res.status(400).json({
        success: false,
        message: "Please select a branch for this role.",
      });
    }

    // User.create() runs the schema's own pre-save hook, which hashes
    // the password automatically - never hash it again here.
    const doc = await User.create({
      ...req.body,
      branch,
    });

    return res.status(201).json({ success: true, data: doc.toSafeJSON() });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "A user with that email already exists.",
        details: err.keyValue,
      });
    }
    console.error("users.create error:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to create user." });
  }
};

// PUT /api/users/:id
export const update = async (req, res) => {
  try {
    if (!isAllowed(ENTITY, "update", req.user.role))
      return forbidden(res, "update");

    const existing = await User.findOne({
      _id: req.params.id,
      role: { $ne: ROLES.STUDENT },
    }).select("+password");
    if (!existing) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    const { password, ...rest } = req.body;
    Object.assign(existing, rest);
    if (password) {
      existing.password = password; // pre-save hook re-hashes this on .save()
    }
    await existing.save();

    return res.json({ success: true, data: existing.toSafeJSON() });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({
        success: false,
        message: "A user with that email already exists.",
        details: err.keyValue,
      });
    }
    console.error("users.update error:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to update user." });
  }
};

// DELETE /api/users/:id — soft delete
export const remove = async (req, res) => {
  try {
    if (!isAllowed(ENTITY, "delete", req.user.role))
      return forbidden(res, "deactivate");

    // Excludes students - this endpoint can't touch student User docs.
    const existing = await User.findOne({
      _id: req.params.id,
      role: { $ne: ROLES.STUDENT },
    });
    if (!existing) {
      return res
        .status(404)
        .json({ success: false, message: "User not found." });
    }

    existing.is_active = false;
    await existing.save();

    return res.json({
      success: true,
      data: { _id: existing._id, is_active: false },
    });
  } catch (err) {
    console.error("users.remove error:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to deactivate user." });
  }
};
