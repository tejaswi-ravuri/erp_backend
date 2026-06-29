import User from "../models/User.js";
import { verifyAccessToken } from "../utils/tokens.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ACTIVE_ROLES } from "../config/constants.js";

/**
 * Requires a valid access token. Loads the full user document (minus password)
 * onto req.user. This is the ONLY source of truth for role/branch on every
 * subsequent request - nothing in the request body/query is ever trusted for
 * authorization decisions.
 */
export const requireAuth = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) {
    throw new ApiError(401, "Authentication required. No token provided.");
  }

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    throw new ApiError(401, "Invalid or expired access token.");
  }

  const user = await User.findById(payload.sub);
  if (!user || !user.is_active) {
    throw new ApiError(401, "Account not found or has been deactivated.");
  }

  if (!ACTIVE_ROLES.includes(user.role)) {
    throw new ApiError(403, "This role is not currently active.");
  }

  req.user = user; // full mongoose doc; controllers use req.user.role / req.user.branch / req.user._id
  next();
});

/**
 * Restricts a route to a fixed set of roles, regardless of entity-level RBAC.
 * Useful for auth/user-management and analytics routes.
 * Usage: requireRole(ROLES.PRINCIPAL, ROLES.SUPER_ADMIN)
 */
export const requireRole = (...allowedRoles) => (req, res, next) => {
  if (!req.user) {
    return next(new ApiError(401, "Authentication required."));
  }
  if (req.user.role === "super_admin" || allowedRoles.includes(req.user.role)) {
    return next();
  }
  return next(new ApiError(403, "You do not have permission to perform this action."));
};
