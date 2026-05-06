/**
 * Department & Admin API Module
 * FIX #7: Domain-specific API module extracted from api.ts.
 */
export {
  getAllDepartments,
  getDepartmentById,
  getSemestersByDepartment,
  getUsersByRole,
  getUsersByDeptAndRoles,
  updateUserAPI,
  adminUpdateUserCredentials,
  logActivity,
  getActivityLogs,
  isFirstYearSem,
} from '../api';
