// Central place for every enum the app relies on.
// Keeping these in one file means RBAC, models, and validators never drift apart.

export const ROLES = {
  SUPER_ADMIN: "super_admin", // inactive feature flag-gated, see ROLES_ENABLED below
  PRINCIPAL: "principal",
  ADMIN_OFFICER: "admin_officer", // frontend label "finance" / "Admin Officer"
  ACCOUNTS_MANAGER: "accounts_manager", // frontend label "consultant" / "Accounts Manager"
  TEACHER: "teacher",
  STUDENT: "student",
};

export const ALL_ROLES = Object.values(ROLES);

// Super Admin is built but disabled per current product decision.
// Flip this to true (or drive it from an env var) when you're ready to activate it.
export const SUPER_ADMIN_ENABLED = false;

// Roles that are allowed to log in right now, given SUPER_ADMIN_ENABLED.
export const ACTIVE_ROLES = SUPER_ADMIN_ENABLED
  ? ALL_ROLES
  : ALL_ROLES.filter((r) => r !== ROLES.SUPER_ADMIN);

// Roles whose data access spans ALL branches rather than being scoped to one.
export const MULTI_BRANCH_ROLES = [ROLES.SUPER_ADMIN, ROLES.ADMIN_OFFICER];
export const SINGLE_BRANCH_ROLES = [
  ROLES.TEACHER,
  ROLES.ACCOUNTS_MANAGER,
  ROLES.PRINCIPAL,
];

export const BRANCHES = [
  "Hyderabad",
  "Secunderabad",
  "Miyapur",
  "Jahangirnagar",
  "Karmanghat",
  "Hayathnagar Branch 1",
  "Alwal",
  "Kapra",
  "Boduppal",
  "Jogipet",
  "Siddipet 2",
  "Sircilla 2",
  "Suraram",
  "RC Puram",
  "Chintal",
  "Medchal",
  "Beeramguda",
  "Lingampally",
  "Chandanagar",
  "Narayankhed",
  "Gopanpally",
  "Siddipet 1",
  "Shaheen Nagar",
  "Shankarpally",
  "Siddipet 3",
  "Bowenpally",
  "Yellareddypet",
  "Sircilla 1",
  "Mallampet",
  "Kukatpally",
  "Rampally",
  "Pragathi Nagar",
  "Kishanbagh",
  "Falaknuma",
  "Vani Block",
  "Ayyappa Society",
  "Fatehnagar",
  "Kukatpally 2"
];

export const STATES = [
  "Telangana",
  "Andhra Pradesh",
  "Maharashtra",
  "Karnataka",
];

// Used by /entities/:entityName generic routes to know which Mongoose model to use.
export const ENTITY_NAMES = [
  "Admission",
  "Student",
  "Staff",
  "Branch",
  "Attendance",
  "Marks",
  "Exam",
  "ExamSchedule",
  "Homework",
  "HomeworkNotification",
  "FeePayment",
  "StudentFeeReport",
  "Income",
  "Expenditure",
  "Event",
  "Appointment",
];
