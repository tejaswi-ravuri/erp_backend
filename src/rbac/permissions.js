import { ROLES } from "../config/constants.js";

const {
  SUPER_ADMIN,
  PRINCIPAL,
  ADMIN_OFFICER,
  ACCOUNTS_MANAGER,
  TEACHER,
  STUDENT,
} = ROLES;

/**
 * permission shape per entity:
 * {
 *   create: [roles],
 *   read:   [roles],
 *   update: [roles],
 *   delete: [roles],     // includes soft-delete, bulk-delete, restore
 *   // ownerScope: when true, a record can also be read/updated/deleted by the
 *   // role(s) listed in ownerScope even if their role isn't generally allowed,
 *   // as long as they created it / are the subject of it. Handled in the controller.
 *   studentOwnOnly: true // STUDENT role, if present in `read`, is restricted to records about themselves
 * }
 *
 * super_admin is implicitly allowed to do everything everywhere - enforced in
 * the middleware, not listed here, so this file doesn't get cluttered.
 */
export const PERMISSIONS = {
  User: {
    create: [PRINCIPAL, ADMIN_OFFICER],
    read: [PRINCIPAL, ADMIN_OFFICER, ACCOUNTS_MANAGER],
    update: [PRINCIPAL, ADMIN_OFFICER],
    delete: [PRINCIPAL, ADMIN_OFFICER],
  },
  Admission: {
    create: [ACCOUNTS_MANAGER, ADMIN_OFFICER],
    read: [PRINCIPAL, ADMIN_OFFICER, ACCOUNTS_MANAGER],
    update: [ACCOUNTS_MANAGER, ADMIN_OFFICER],
    delete: [ACCOUNTS_MANAGER],
  },
  Class: {
    create: [PRINCIPAL, ADMIN_OFFICER, ACCOUNTS_MANAGER],
    read: [PRINCIPAL, ADMIN_OFFICER, ACCOUNTS_MANAGER, TEACHER],
    update: [PRINCIPAL, ADMIN_OFFICER, TEACHER],
    delete: [PRINCIPAL],
  },
  Student: {
    create: [ACCOUNTS_MANAGER],
    read: [PRINCIPAL, ADMIN_OFFICER, TEACHER, ACCOUNTS_MANAGER, STUDENT],
    update: [ACCOUNTS_MANAGER],
    delete: [ACCOUNTS_MANAGER],
    studentOwnOnly: true,
  },
  Staff: {
    create: [PRINCIPAL, ADMIN_OFFICER],
    read: [PRINCIPAL, ADMIN_OFFICER, ACCOUNTS_MANAGER, TEACHER], // teacher sees staff directory, scoped to own branch
    update: [PRINCIPAL, ADMIN_OFFICER],
    delete: [PRINCIPAL],
  },
  Attendance: {
    create: [TEACHER, PRINCIPAL, ADMIN_OFFICER],
    read: [TEACHER, PRINCIPAL, ADMIN_OFFICER, ACCOUNTS_MANAGER, STUDENT],
    update: [TEACHER, PRINCIPAL, ADMIN_OFFICER],
    delete: [PRINCIPAL, ADMIN_OFFICER],
    studentOwnOnly: true,
  },
  Marks: {
    create: [TEACHER, PRINCIPAL],
    read: [TEACHER, PRINCIPAL, ADMIN_OFFICER, ACCOUNTS_MANAGER, STUDENT],
    update: [TEACHER, PRINCIPAL],
    delete: [TEACHER, PRINCIPAL],
    studentOwnOnly: true,
  },
  Exam: {
    create: [PRINCIPAL, ADMIN_OFFICER],
    read: [PRINCIPAL, ADMIN_OFFICER, TEACHER, STUDENT],
    update: [PRINCIPAL, ADMIN_OFFICER],
    delete: [PRINCIPAL, ADMIN_OFFICER],
  },
  ExamSchedule: {
    create: [PRINCIPAL, ADMIN_OFFICER],
    read: [PRINCIPAL, ADMIN_OFFICER, TEACHER, STUDENT],
    update: [PRINCIPAL, ADMIN_OFFICER],
    delete: [PRINCIPAL, ADMIN_OFFICER],
  },
  Homework: {
    create: [TEACHER, PRINCIPAL],
    read: [TEACHER, PRINCIPAL, STUDENT],
    update: [TEACHER, PRINCIPAL],
    delete: [TEACHER, PRINCIPAL],
  },
  HomeworkNotification: {
    create: [TEACHER, PRINCIPAL], // usually system-generated, see homeworkController fanout
    read: [TEACHER, PRINCIPAL, STUDENT],
    update: [TEACHER, PRINCIPAL, STUDENT], // student updates status -> "Read"
    delete: [TEACHER, PRINCIPAL],
    studentOwnOnly: true,
  },
  FeePayment: {
    create: [ADMIN_OFFICER, ACCOUNTS_MANAGER],
    read: [ADMIN_OFFICER, ACCOUNTS_MANAGER, PRINCIPAL, STUDENT],
    update: [ADMIN_OFFICER, ACCOUNTS_MANAGER],
    delete: [ADMIN_OFFICER, ACCOUNTS_MANAGER, PRINCIPAL],
    studentOwnOnly: true,
  },
  StudentFeeReport: {
    create: [ADMIN_OFFICER, ACCOUNTS_MANAGER],
    read: [ADMIN_OFFICER, ACCOUNTS_MANAGER, PRINCIPAL],
    update: [ADMIN_OFFICER, ACCOUNTS_MANAGER],
    delete: [ADMIN_OFFICER, ACCOUNTS_MANAGER, PRINCIPAL],
  },
  Income: {
    create: [ADMIN_OFFICER, ACCOUNTS_MANAGER],
    read: [ADMIN_OFFICER, ACCOUNTS_MANAGER, PRINCIPAL],
    update: [ADMIN_OFFICER, ACCOUNTS_MANAGER],
    delete: [ADMIN_OFFICER, ACCOUNTS_MANAGER, PRINCIPAL],
  },
  Expenditure: {
    create: [ADMIN_OFFICER, ACCOUNTS_MANAGER, PRINCIPAL],
    read: [ADMIN_OFFICER, ACCOUNTS_MANAGER, PRINCIPAL],
    update: [ADMIN_OFFICER, ACCOUNTS_MANAGER, PRINCIPAL],
    delete: [ADMIN_OFFICER, ACCOUNTS_MANAGER, PRINCIPAL],
  },
  Event: {
    create: [PRINCIPAL, ADMIN_OFFICER],
    read: [PRINCIPAL, ADMIN_OFFICER, TEACHER, ACCOUNTS_MANAGER, STUDENT],
    update: [PRINCIPAL, ADMIN_OFFICER],
    delete: [PRINCIPAL, ADMIN_OFFICER],
  },
  Appointment: {
    create: [PRINCIPAL, ADMIN_OFFICER, TEACHER],
    read: [PRINCIPAL, ADMIN_OFFICER, TEACHER], // further scoped to creator/with_whom in controller
    update: [PRINCIPAL, ADMIN_OFFICER, TEACHER],
    delete: [PRINCIPAL, ADMIN_OFFICER],
    ownerScope: [TEACHER], // teacher can only touch appointments they created or are the subject of
  },
};

export function isAllowed(entityName, action, role) {
  if (role === SUPER_ADMIN) return true;
  const rule = PERMISSIONS[entityName];
  if (!rule || !rule[action]) return false;
  return rule[action].includes(role);
}

export function getPermissionRule(entityName) {
  return PERMISSIONS[entityName] || null;
}
