import User from "../models/User.js";
import { verifyAccessToken } from "../utils/tokens.js";
import { asyncHandler } from "../utils/asyncHandler.js";
import { ApiError } from "../utils/ApiError.js";
import { ACTIVE_ROLES } from "../config/constants.js";

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

export const requireRole =
  (...allowedRoles) =>
  (req, res, next) => {
    if (!req.user) {
      return next(new ApiError(401, "Authentication required."));
    }
    console.log("====================================");
    console.log(`${req.method} ${req.originalUrl}`);
    console.log("Authorization:", req.headers.authorization);
    console.log("====================================");
    console.log("Allowed Roles:", allowedRoles);
    console.log("User:", req.user);
    console.log("User Role:", req.user.role);

    if (
      req.user.role === "super_admin" ||
      allowedRoles.includes(req.user.role)
    ) {
      return next();
    }

    return next(
      new ApiError(403, "You do not have permission to perform this action."),
    );
  };
