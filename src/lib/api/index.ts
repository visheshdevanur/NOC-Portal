/**
 * API Domain Module Index
 * FIX #7: Barrel file re-exporting all domain modules.
 * 
 * New code should import from specific domain modules:
 *   import { getStudentDues } from '@/lib/api/students';
 * 
 * Or from this barrel:
 *   import { getStudentDues } from '@/lib/api';
 */
export * from './students';
export * from './faculty';
export * from './clearance';
export * from './payments';
export * from './admin';
