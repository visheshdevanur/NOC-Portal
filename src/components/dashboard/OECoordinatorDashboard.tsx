import OEDashboard from './shared/OEDashboard';

/**
 * Standalone OE Coordinator Dashboard.
 * 
 * The OE Coordinator is a dedicated role with narrow permissions:
 * - View/edit OE attendance and assignment status for ALL students
 * - View OE activity logs
 * - Cannot create/edit subjects (DEO only)
 * - Cannot assign/de-assign OE Faculty (DEO only)
 * 
 * This dashboard wraps the shared OEDashboard component WITHOUT a teacherId,
 * so it shows ALL OE enrollment data across all branches/semesters/sections.
 */
export default function OECoordinatorDashboard() {
  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <OEDashboard />
      </div>
    </div>
  );
}
