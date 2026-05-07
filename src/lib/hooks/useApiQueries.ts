/**
 * Reusable React Query hooks for all dashboard data fetching.
 * 
 * Benefits over raw useEffect:
 * - Automatic caching (30s stale time)
 * - Request deduplication (multiple components fetching same data = 1 request)
 * - Background refresh on window focus
 * - Built-in loading/error states
 * - Automatic garbage collection (5min)
 */
import { useQuery } from '@tanstack/react-query';

// ─── Shared / System ───
export const useActivityLogs = (limit = 500) =>
  useQuery({ queryKey: ['activityLogs', limit], queryFn: () => import('../api').then(m => m.getActivityLogs(limit)) });

// ─── Student ───
export const useStudentClearance = (studentId: string | undefined) =>
  useQuery({ queryKey: ['studentClearance', studentId], queryFn: () => import('../api').then(m => m.getStudentClearanceRequest(studentId!)), enabled: !!studentId });

export const useStudentSubjects = (studentId: string | undefined) =>
  useQuery({ queryKey: ['studentSubjects', studentId], queryFn: () => import('../api').then(m => m.getStudentSubjects(studentId!)), enabled: !!studentId });

export const useStudentDues = (studentId: string | undefined) =>
  useQuery({ queryKey: ['studentDues', studentId], queryFn: () => import('../api').then(m => m.getStudentDues(studentId!)), enabled: !!studentId });

export const useStudentIAAttendance = (studentId: string | undefined) =>
  useQuery({ queryKey: ['studentIA', studentId], queryFn: () => import('../api').then(m => m.getStudentIAAttendance(studentId!)), enabled: !!studentId });

export const useStudentLibraryDues = (studentId: string | undefined) =>
  useQuery({ queryKey: ['studentLibrary', studentId], queryFn: () => import('../api').then(m => m.getStudentLibraryDues(studentId!)), enabled: !!studentId });

// ─── Faculty ───
export const useFacultyPendingStudents = (facultyId: string | undefined) =>
  useQuery({ queryKey: ['facultyPending', facultyId], queryFn: () => import('../api').then(m => m.getFacultyPendingStudents(facultyId!)), enabled: !!facultyId });

export const useTeacherSubjectsList = (teacherId: string | undefined) =>
  useQuery({ queryKey: ['teacherSubjects', teacherId], queryFn: () => import('../api').then(m => m.getTeacherSubjectsList(teacherId!)), enabled: !!teacherId });

export const useTeacherIAAttendance = (teacherId: string | undefined) =>
  useQuery({ queryKey: ['teacherIA', teacherId], queryFn: () => import('../api').then(m => m.getTeacherIAAttendance(teacherId!)), enabled: !!teacherId });

// ─── HOD ───
export const useHodPendingRequests = (departmentId: string | undefined) =>
  useQuery({ queryKey: ['hodPending', departmentId], queryFn: () => import('../api').then(m => m.getHodPendingRequests(departmentId!)), enabled: !!departmentId });

export const useHodDepartmentStudents = (departmentId: string | undefined) =>
  useQuery({ queryKey: ['hodStudents', departmentId], queryFn: () => import('../api').then(m => m.getHodDepartmentStudents(departmentId!)), enabled: !!departmentId });

export const useHodTeacherAssignments = (departmentId: string | undefined) =>
  useQuery({ queryKey: ['hodTeachers', departmentId], queryFn: () => import('../api').then(m => m.getHodTeacherAssignments(departmentId!)), enabled: !!departmentId });

export const useHodStaffApprovedFines = (departmentId: string | undefined) =>
  useQuery({ queryKey: ['hodApprovedFines', departmentId], queryFn: () => import('../api').then(m => m.getHodStaffApprovedFines(departmentId!)), enabled: !!departmentId });

export const useHodFinePayments = (departmentId: string | undefined) =>
  useQuery({ queryKey: ['hodFinePayments', departmentId], queryFn: () => import('../api').then(m => m.getHodFinePayments(departmentId!)), enabled: !!departmentId });

export const useHodStaffActivityLogs = (departmentId: string | undefined) =>
  useQuery({ queryKey: ['hodLogs', departmentId], queryFn: () => import('../api').then(m => m.getHodStaffActivityLogs(departmentId!)), enabled: !!departmentId });

// ─── Accounts ───
export const useAllStudentDues = (enabled = true) =>
  useQuery({ queryKey: ['allStudentDues'], queryFn: () => import('../api').then(m => m.getAllStudentDues()), enabled });

export const useAccountsApprovedDues = (enabled = true) =>
  useQuery({ queryKey: ['accountsApprovedDues'], queryFn: () => import('../api').then(m => m.getAccountsApprovedDues()), enabled });

export const useAccountsPendingFeeVerifications = (enabled = true) =>
  useQuery({ queryKey: ['accountsPendingFees'], queryFn: () => import('../api').then(m => m.getAccountsPendingFeeVerifications()), enabled });

export const useAccountsVerifiedFees = (enabled = true) =>
  useQuery({ queryKey: ['accountsVerifiedFees'], queryFn: () => import('../api').then(m => m.getAccountsVerifiedFees()), enabled });

// ─── Admin ───
export const useAllUsers = (enabled = true) =>
  useQuery({ queryKey: ['allUsers'], queryFn: () => import('../api').then(m => m.getAllUsers()), enabled });

export const useAllStudentStatuses = (enabled = true) =>
  useQuery({ queryKey: ['allStudentStatuses'], queryFn: () => import('../api').then(m => m.getAllStudentStatuses()), enabled });

export const useAllDepartments = (enabled = true) =>
  useQuery({ queryKey: ['allDepartments'], queryFn: () => import('../api').then(m => m.getAllDepartments()), enabled });

export const useDepartmentById = (departmentId: string | undefined) =>
  useQuery({ queryKey: ['department', departmentId], queryFn: () => import('../api').then(m => m.getDepartmentById(departmentId!)), enabled: !!departmentId });

export const useUsersByDeptAndRoles = (departmentId: string | undefined, roles: string[]) =>
  useQuery({ queryKey: ['usersByDeptRoles', departmentId, roles], queryFn: () => import('../api').then(m => m.getUsersByDeptAndRoles(departmentId!, roles)), enabled: !!departmentId });

export const useSubjectsByDepartment = (departmentId: string | undefined) =>
  useQuery({ queryKey: ['subjects', departmentId], queryFn: () => import('../api').then(m => m.getSubjectsByDepartment(departmentId!)), enabled: !!departmentId });

export const useSemestersByDepartment = (departmentId: string | undefined) =>
  useQuery({ queryKey: ['semesters', departmentId], queryFn: () => import('../api').then(m => m.getSemestersByDepartment(departmentId!)), enabled: !!departmentId });

// ─── Staff ───
export const useStaffStudentDues = (departmentId: string | undefined) =>
  useQuery({ queryKey: ['staffDues', departmentId], queryFn: () => import('../api').then(m => m.getStaffStudentDues(departmentId!)), enabled: !!departmentId });

export const useStaffAttendanceFines = (departmentId: string | undefined) =>
  useQuery({ queryKey: ['staffAttendanceFines', departmentId], queryFn: () => import('../api').then(m => m.getStaffAttendanceFines(departmentId!)), enabled: !!departmentId });

export const useAttendanceCategories = (departmentId: string | undefined) =>
  useQuery({ queryKey: ['attendanceCategories', departmentId], queryFn: () => import('../api').then(m => m.getAttendanceCategories(departmentId!)), enabled: !!departmentId });

// ─── Library ───
export const useLibraryDues = (enabled = true) =>
  useQuery({ queryKey: ['libraryDues'], queryFn: () => import('../api').then(m => m.getLibraryDues()), enabled });

// ─── Promotion ───
export const usePromotionPreview = (enabled = true) =>
  useQuery({ queryKey: ['promotionPreview'], queryFn: () => import('../api').then(m => m.getPromotionPreview()), enabled });

export const useGraduatedStudents = (enabled = true) =>
  useQuery({ queryKey: ['graduatedStudents'], queryFn: () => import('../api').then(m => m.getGraduatedStudents()), enabled });

export const useActiveStudentsDetails = (enabled = true) =>
  useQuery({ queryKey: ['activeStudents'], queryFn: () => import('../api').then(m => m.getActiveStudentsDetails()), enabled });
