// controllers/branchController.js
import Branch from "../models/Branch.js";
import User from "../models/User.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ROLES } from "../config/constants.js";

// GET /api/branches
export const list = async (req, res) => {
  try {
    const filter = {};
    // Single-branch roles only ever see their own branch. Multi-branch
    // roles (admin_officer, super_admin) see every branch in the system -
    // they're the roles responsible for branch-level administration.
    if (req.user.branch) {
      filter._id = req.user.branch;
    }

    const branches = await Branch.find(filter).sort({ name: 1 }).lean();
    return res.json({ success: true, data: branches });
  } catch (err) {
    console.error("branches.list error:", err.message);
    return res
      .status(500)
      .json({ success: false, message: "Failed to fetch branches." });
  }
};

// POST /api/branches — Admin Officer only (see branchRouter.js)
export const create = asyncHandler(async (req, res) => {
  const { name, code, address, phone, is_active, schoolName } = req.body;

  if (!name || !code) {
    throw new ApiError(400, "name and code are required.");
  }
  if (
    !address?.line1 ||
    !address?.city ||
    !address?.state ||
    !address?.pincode
  ) {
    throw new ApiError(
      400,
      "Address line 1, city, state, and pincode are required.",
    );
  }

  const branch = await Branch.create({
    name,
    code,
    address,
    phone,
    is_active,
    schoolName,
  });

  // Admin Officers are scoped to User.branches - only the admin_officer who
  // created this branch should gain access to it, not every admin_officer.
  if (req.user.role === ROLES.ADMIN_OFFICER) {
    await User.updateOne(
      { _id: req.user._id },
      { $addToSet: { branches: branch._id } },
    );
  }

  res.status(201).json({ success: true, data: branch });
});

// PUT /api/branches/:id — Admin Officer only
export const update = asyncHandler(async (req, res) => {
  const { name, code, address, phone, is_active, schoolName } = req.body;
  const updates = {};
  if (name !== undefined) updates.name = name;
  if (code !== undefined) updates.code = code;
  if (address !== undefined) updates.address = address;
  if (phone !== undefined) updates.phone = phone;
  if (is_active !== undefined) updates.is_active = is_active;
  if (schoolName !== undefined) updates.schoolName = schoolName;

  const branch = await Branch.findByIdAndUpdate(req.params.id, updates, {
    new: true,
    runValidators: true,
  });
  if (!branch) throw new ApiError(404, "Branch not found.");
  res.json({ success: true, data: branch });
});

// DELETE /api/branches/:id — Admin Officer only. Soft-delete (is_active:
// false) rather than a hard delete, since Users/Students/Classes reference
// a branch by ObjectId — matches the soft-delete convention used elsewhere
// (e.g. classController.deleteClass).
export const remove = asyncHandler(async (req, res) => {
  const staffCount = await User.countDocuments({
    is_active: true,
    $or: [{ branch: req.params.id }, { branches: req.params.id }],
  });
  if (staffCount > 0) {
    throw new ApiError(
      409,
      `Cannot delete — ${staffCount} active staff member(s) are still assigned to this branch.`,
    );
  }

  const branch = await Branch.findByIdAndUpdate(
    req.params.id,
    { is_active: false },
    { new: true },
  );
  if (!branch) throw new ApiError(404, "Branch not found.");
  res.json({ success: true, data: branch });
});
