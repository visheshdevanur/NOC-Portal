/**
 * Student API Module
 * FIX #7: Domain-specific API module extracted from the 1581-line api.ts monolith.
 * 
 * Re-exports student-specific functions from the main api.ts file.
 * This file serves as the import target for new code. Existing code
 * continues to import from api.ts (which still exports everything).
 */
export { 
  getStudentClearanceRequest,
  submitClearanceRequest,
  getStudentSubjects,
  getStudentDues,
  getStudentIAAttendance,
  getStudentLibraryDues,
} from '../api';
