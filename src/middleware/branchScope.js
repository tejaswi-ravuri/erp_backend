import { MULTI_BRANCH_ROLES, ROLES } from "../config/constants.js";
import { getPermissionRule } from "../rbac/permissions.js";
import { ApiError } from "../utils/ApiError.js";

export function buildScopeFilter(
  entityName,
  user,
  { studentFieldName = "student_id", excludeDeleted = true } = {},
) {
  const scope = {};
  const rule = getPermissionRule(entityName) || {};
  if (excludeDeleted) {
    scope.is_deleted = { $ne: true };
  }
  if (!MULTI_BRANCH_ROLES.includes(user.role)) {
    scope.branch = user.branch;
  }

  // 2. Student self-scoping - a student only ever sees records about themselves.
  if (user.role === ROLES.STUDENT && rule.studentOwnOnly) {
    if (!user.linked_student_id) {
      // Student account isn't linked to a Student record yet - they see nothing, not everything.
      scope._id = null; // guarantees zero results rather than throwing
    } else if (entityName === "Student") {
      scope._id = user.linked_student_id;
    } else {
      scope[studentFieldName] = user.linked_student_id;
    }
  }

  // 3. Owner scoping (e.g. Teacher on Appointment can only touch their own).
  if (rule.ownerScope && rule.ownerScope.includes(user.role)) {
    scope.$or = [{ created_by: user._id }, { with_whom_user_id: user._id }];
  }

  return scope;
}

/**
 * Strips fields a client should never be able to set directly, and forces
 * branch on create to the user's own branch (or the explicitly chosen
 * branch, only for cross-branch roles).
 */
export function sanitizeAndScopeBody(entityName, user, body = {}) {
  const clean = { ...body };
  delete clean._id;
  delete clean.id;
  delete clean.created_by;
  delete clean.updated_by;
  delete clean.is_deleted;
  delete clean.deleted_at;
  delete clean.created_date;
  delete clean.updated_date;

  if (MULTI_BRANCH_ROLES.includes(user.role)) {
    // Cross-branch roles may specify a branch explicitly when creating records
    // (e.g. Accounts Manager entering a correction for a specific branch).
    if (!clean.branch) {
      throw new ApiError(400, "branch is required when creating this record.");
    }
  } else {
    // Branch-scoped roles can NEVER write to another branch, no matter what
    // the request body says.
    clean.branch = user.branch;
  }

  return clean;
}
