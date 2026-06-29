import User from "../models/User.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from "../utils/tokens.js";
import { ACTIVE_ROLES, CROSS_BRANCH_ROLES } from "../config/constants.js";

function issueTokens(user) {
  return {
    accessToken: signAccessToken(user),
    refreshToken: signRefreshToken(user),
  };
}

// POST /api/auth/login
export const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new ApiError(400, "Email and password are required.");
  }

  const user = await User.findOne({ email: email.toLowerCase().trim() }).select(
    "+password",
  );
  if (!user) throw new ApiError(401, "Invalid email or password.");

  if (!user.is_active)
    throw new ApiError(
      403,
      "This account has been deactivated. Contact your administrator.",
    );
  if (!ACTIVE_ROLES.includes(user.role))
    throw new ApiError(403, "This role is not currently active.");

  const valid = await user.comparePassword(password);
  if (!valid) throw new ApiError(401, "Invalid email or password.");

  user.last_login_at = new Date();
  await user.save();

  const { accessToken, refreshToken } = issueTokens(user);
  console.log("tokens--", accessToken);
  res.json({ user: user.toSafeJSON(), accessToken, refreshToken });
});

// POST /api/auth/refresh
export const refresh = asyncHandler(async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) throw new ApiError(400, "refreshToken is required.");

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new ApiError(
      401,
      "Invalid or expired refresh token. Please log in again.",
    );
  }

  const user = await User.findById(payload.sub);
  if (!user || !user.is_active || user.refresh_token_version !== payload.v) {
    throw new ApiError(
      401,
      "Refresh token is no longer valid. Please log in again.",
    );
  }

  const { accessToken, refreshToken: newRefreshToken } = issueTokens(user);
  res.json({ accessToken, refreshToken: newRefreshToken });
});

// POST /api/auth/logout
// Bumps the refresh token version, invalidating every outstanding refresh
// token for this user (this device and any other active session).
export const logout = asyncHandler(async (req, res) => {
  req.user.refresh_token_version += 1;
  await req.user.save();
  res.json({ success: true });
});

// GET /api/auth/me
export const me = asyncHandler(async (req, res) => {
  res.json(req.user.toSafeJSON());
});

// PUT /api/auth/change-password
export const changePassword = asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    throw new ApiError(400, "currentPassword and newPassword are required.");
  }
  if (newPassword.length < 8) {
    throw new ApiError(400, "New password must be at least 8 characters.");
  }

  const user = await User.findById(req.user._id).select("+password");
  const valid = await user.comparePassword(currentPassword);
  if (!valid) throw new ApiError(401, "Current password is incorrect.");

  user.password = newPassword; // pre-save hook hashes it
  user.refresh_token_version += 1; // invalidate other sessions
  await user.save();

  res.json({ success: true });
});

// ---- User management (Principal / Super Admin only - see routes) ----

// POST /api/auth/users  (create a login for a staff member or student)
export const createUser = asyncHandler(async (req, res) => {
  const {
    full_name,
    email,
    password,
    role,
    branch,
    phone,
    linked_staff_id,
    linked_student_id,
  } = req.body;

  if (!full_name || !email || !password || !role) {
    throw new ApiError(
      400,
      "full_name, email, password, and role are required.",
    );
  }
  if (!ACTIVE_ROLES.includes(role)) {
    throw new ApiError(400, `Role '${role}' is not currently active.`);
  }
  if (!CROSS_BRANCH_ROLES.includes(role) && !branch) {
    throw new ApiError(400, "branch is required for this role.");
  }

  // A non-super-admin creator (e.g. Principal) can only create users within their own branch.
  if (req.user.role !== "super_admin" && branch && branch !== req.user.branch) {
    throw new ApiError(403, "You can only create users for your own branch.");
  }

  const existing = await User.findOne({ email: email.toLowerCase().trim() });
  if (existing)
    throw new ApiError(409, "A user with this email already exists.");

  const user = await User.create({
    full_name,
    email,
    password,
    role,
    branch: CROSS_BRANCH_ROLES.includes(role) ? branch || null : branch,
    phone,
    linked_staff_id: linked_staff_id || null,
    linked_student_id: linked_student_id || null,
  });

  res.status(201).json(user.toSafeJSON());
});

// GET /api/auth/users  (list users - Principal sees own branch, Super Admin sees all)
export const listUsers = asyncHandler(async (req, res) => {
  const filter = {};
  if (req.user.role !== "super_admin") {
    filter.branch = req.user.branch;
  }
  if (req.query.role) filter.role = req.query.role;

  const users = await User.find(filter).sort("-created_date").limit(500);
  res.json({ data: users.map((u) => u.toSafeJSON()) });
});

// PUT /api/auth/users/:id  (update role/branch/active-status of a user)
export const updateUser = asyncHandler(async (req, res) => {
  const target = await User.findById(req.params.id);
  if (!target) throw new ApiError(404, "User not found.");

  if (req.user.role !== "super_admin" && target.branch !== req.user.branch) {
    throw new ApiError(403, "You can only manage users in your own branch.");
  }

  const allowedFields = [
    "full_name",
    "phone",
    "is_active",
    "branch",
    "role",
    "linked_staff_id",
    "linked_student_id",
  ];
  for (const field of allowedFields) {
    if (field in req.body) target[field] = req.body[field];
  }
  if (req.body.is_active === false) {
    target.refresh_token_version += 1; // force logout if deactivated
  }
  await target.save();
  res.json(target.toSafeJSON());
});

// PUT /api/auth/users/:id/reset-password (admin resets someone's password)
export const adminResetPassword = asyncHandler(async (req, res) => {
  const { newPassword } = req.body;
  if (!newPassword || newPassword.length < 8) {
    throw new ApiError(400, "newPassword must be at least 8 characters.");
  }
  const target = await User.findById(req.params.id);
  if (!target) throw new ApiError(404, "User not found.");

  if (req.user.role !== "super_admin" && target.branch !== req.user.branch) {
    throw new ApiError(403, "You can only manage users in your own branch.");
  }

  target.password = newPassword;
  target.refresh_token_version += 1;
  await target.save();
  res.json({ success: true });
});
