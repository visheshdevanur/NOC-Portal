import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../lib/useAuth';
import { supabase } from '../../lib/supabase';
import { getAllAicteClearances, updateAicteStatus } from '../../lib/api/aicte';
import { Search, Building2, Users, ChevronRight, Download, Upload, ClipboardList, CheckCircle2, XCircle, AlertTriangle } from 'lucide-react';
import * as XLSX from 'xlsx';

type AicteRecord = {
  id: string | null;
  student_id: string;
  status: 'not_submitted' | 'submitted' | 'permitted';
  updated_by: string | null;
  updated_at: string | null;
  profiles: {
    full_name: string;
    section?: string;
    roll_number?: string;
    department_id?: string;
    departments?: { name: string } | null;
    semester_id?: string;
    semesters?: { name: string } | null;
  } | null;
};

export default function AicteDashboard() {
  const { profile } = useAuth();
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  // Drill-down state
  const [selectedDept, setSelectedDept] = useState<string | null>(null);
  const [selectedSem, setSelectedSem] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);

  // Fetch all students with AICTE status
  const { data: aicteData, isLoading: loading, refetch } = useQuery({
    queryKey: ['aicteClearances'],
    queryFn: getAllAicteClearances,
    refetchInterval: 30_000,
  });
  const records = (aicteData || []) as AicteRecord[];

  // Department list from data
  const departments = (() => {
    const deptMap = new Map<string, { id: string; name: string; count: number; cleared: number }>();
    records.forEach(r => {
      const deptId = r.profiles?.department_id || 'unknown';
      const deptName = r.profiles?.departments?.name || 'Unknown';
      if (!deptMap.has(deptId)) deptMap.set(deptId, { id: deptId, name: deptName, count: 0, cleared: 0 });
      const dept = deptMap.get(deptId)!;
      dept.count++;
      if (r.status === 'submitted' || r.status === 'permitted') dept.cleared++;
    });
    return Array.from(deptMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  })();

  // Semesters for selected dept
  const semesters = (() => {
    if (!selectedDept) return [];
    const semMap = new Map<string, { id: string; name: string; count: number; cleared: number }>();
    records.filter(r => (r.profiles?.department_id || 'unknown') === selectedDept).forEach(r => {
      const semId = r.profiles?.semester_id || 'unknown';
      const semName = r.profiles?.semesters?.name || 'Unknown';
      if (!semMap.has(semId)) semMap.set(semId, { id: semId, name: semName, count: 0, cleared: 0 });
      const sem = semMap.get(semId)!;
      sem.count++;
      if (r.status === 'submitted' || r.status === 'permitted') sem.cleared++;
    });
    return Array.from(semMap.values()).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
  })();

  // Sections for selected semester
  const sections = (() => {
    if (!selectedSem) return [];
    const secMap = new Map<string, { name: string; count: number; cleared: number }>();
    records.filter(r =>
      (r.profiles?.department_id || 'unknown') === selectedDept &&
      (r.profiles?.semester_id || 'unknown') === selectedSem
    ).forEach(r => {
      const sec = r.profiles?.section || 'Unknown';
      if (!secMap.has(sec)) secMap.set(sec, { name: sec, count: 0, cleared: 0 });
      const s = secMap.get(sec)!;
      s.count++;
      if (r.status === 'submitted' || r.status === 'permitted') s.cleared++;
    });
    return Array.from(secMap.values()).sort((a, b) => a.name.localeCompare(b.name));
  })();

  // Students for selected section
  const filteredStudents = records.filter(r =>
    (r.profiles?.department_id || 'unknown') === selectedDept &&
    (r.profiles?.semester_id || 'unknown') === selectedSem &&
    (r.profiles?.section || 'Unknown') === selectedSection &&
    (searchTerm.trim().length < 2 ||
      r.profiles?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.profiles?.roll_number?.toLowerCase().includes(searchTerm.toLowerCase()))
  ).sort((a, b) => (a.profiles?.roll_number || '').localeCompare(b.profiles?.roll_number || ''));

  // Global search
  const isGlobalSearch = searchTerm.trim().length >= 2 && !selectedSection;
  const globalResults = isGlobalSearch ? records.filter(r =>
    r.profiles?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    r.profiles?.roll_number?.toLowerCase().includes(searchTerm.toLowerCase())
  ).slice(0, 50) : [];

  // Status badge component
  const StatusBadge = ({ status }: { status: string }) => {
    const config = {
      not_submitted: { bg: 'bg-red-500/15 text-red-600', icon: <XCircle className="w-3.5 h-3.5" />, label: 'Not Submitted' },
      submitted: { bg: 'bg-emerald-500/15 text-emerald-600', icon: <CheckCircle2 className="w-3.5 h-3.5" />, label: 'Submitted' },
      permitted: { bg: 'bg-amber-500/15 text-amber-600', icon: <AlertTriangle className="w-3.5 h-3.5" />, label: 'Permitted' },
    }[status] || { bg: 'bg-secondary text-muted-foreground', icon: null, label: status };
    return (
      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold ${config.bg}`}>
        {config.icon} {config.label}
      </span>
    );
  };

  // Toggle status
  const handleStatusChange = async (studentId: string, newStatus: 'not_submitted' | 'submitted' | 'permitted') => {
    try {
      await updateAicteStatus(studentId, newStatus, profile?.id || '', profile?.tenant_id || null);
      refetch();
    } catch (err: any) {
      setError(err.message);
    }
  };

  // Download template
  const downloadTemplate = () => {
    const csvContent = "data:text/csv;charset=utf-8,roll_number\n4MH24CS001\n4MH24CS002";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "AICTE_Submitted_Template.csv");
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  // Upload CSV/Excel
  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    setSuccess(null);

    try {
      let rollNumbers: string[] = [];

      if (file.name.endsWith('.csv')) {
        const text = await file.text();
        const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
        if (lines.length < 2) throw new Error("File is empty or missing data rows.");
        const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
        const rnIdx = headers.indexOf('roll_number');
        if (rnIdx < 0) throw new Error("Missing required column: roll_number");
        for (let i = 1; i < lines.length; i++) {
          const cols = lines[i].split(',').map(c => c.trim());
          if (cols[rnIdx]) rollNumbers.push(cols[rnIdx].toUpperCase().trim());
        }
      } else {
        // Excel
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        rows.forEach(row => {
          const rn = String(row.roll_number || row.Roll_Number || row.USN || row.usn || row.ROLL_NUMBER || '').trim().toUpperCase();
          if (rn) rollNumbers.push(rn);
        });
      }

      if (rollNumbers.length === 0) throw new Error("No roll numbers found in the file.");

      // Match roll numbers to student records
      const toUpdate: any[] = [];
      let matched = 0, skipped = 0;
      const rollSet = new Set(rollNumbers);

      records.forEach(r => {
        const rn = r.profiles?.roll_number?.toUpperCase().trim();
        if (rn && rollSet.has(rn)) {
          toUpdate.push({
            student_id: r.student_id,
            status: 'submitted',
            updated_by: profile?.id || null,
            tenant_id: profile?.tenant_id || null,
          });
          matched++;
        }
      });
      skipped = rollNumbers.length - matched;

      if (toUpdate.length > 0) {
        const { error: rpcErr } = await supabase.rpc('aicte_bulk_upsert', { p_rows: toUpdate });
        if (rpcErr) throw rpcErr;
      }

      setSuccess(`✅ ${matched} students marked as Submitted. ${skipped} skipped (unmatched).`);
      refetch();
    } catch (err: any) {
      setError(err.message || 'Failed to process file');
    } finally {
      setUploading(false);
      event.target.value = '';
    }
  };

  // Stats
  const totalStudents = records.length;
  const submittedCount = records.filter(r => r.status === 'submitted').length;
  const permittedCount = records.filter(r => r.status === 'permitted').length;
  const notSubmittedCount = records.filter(r => r.status === 'not_submitted').length;

  // Student row renderer
  const renderStudentRow = (r: AicteRecord, idx: number) => (
    <tr key={r.student_id} className="hover:bg-secondary/10 transition-colors">
      <td className="p-3 text-sm text-muted-foreground">{idx + 1}</td>
      <td className="p-3 text-xs font-mono text-muted-foreground">{r.profiles?.roll_number || '—'}</td>
      <td className="p-3 font-medium text-sm text-foreground">{r.profiles?.full_name || '—'}</td>
      <td className="p-3 text-center"><StatusBadge status={r.status} /></td>
      <td className="p-3 text-center">
        <div className="flex items-center justify-center gap-1.5">
          {r.status === 'not_submitted' ? (
            <>
              <button onClick={() => handleStatusChange(r.student_id, 'submitted')}
                className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500 hover:text-white transition-all">
                Submitted
              </button>
              <button onClick={() => handleStatusChange(r.student_id, 'permitted')}
                className="px-3 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-600 hover:bg-amber-500 hover:text-white transition-all">
                Permitted
              </button>
            </>
          ) : (
            <button onClick={() => handleStatusChange(r.student_id, 'not_submitted')}
              className="px-3 py-1 rounded-full text-xs font-bold bg-red-500/15 text-red-600 hover:bg-red-500 hover:text-white transition-all">
              Not Submitted
            </button>
          )}
        </div>
      </td>
    </tr>
  );

  return (
    <div className="space-y-6 fade-in">
      {/* Header */}
      <div className="bg-card rounded-3xl p-8 shadow-sm border border-border relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-full bg-indigo-500"></div>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2 flex items-center">
              <ClipboardList className="w-8 h-8 mr-3 text-indigo-500" />
              AICTE Activity Portal
            </h1>
            <p className="text-muted-foreground flex items-center">
              <span className="font-medium bg-secondary px-3 py-1 rounded-full text-foreground text-sm mr-3">
                {profile?.full_name || 'AICTE Coordinator'}
              </span>
              Manage AICTE activity clearance for all students
            </p>
          </div>

          <div className="flex items-center gap-3">
            <button onClick={downloadTemplate}
              className="flex items-center gap-2 bg-secondary text-foreground hover:bg-secondary/80 px-4 py-3 rounded-xl font-medium transition-all shadow-sm">
              <Download className="w-4 h-4" /> Template
            </button>
            <label className="flex items-center gap-2 bg-indigo-500 text-white hover:bg-indigo-600 px-4 py-3 rounded-xl font-bold transition-all shadow-sm cursor-pointer">
              <Upload className="w-4 h-4" />
              {uploading ? 'Processing...' : 'Upload Submitted List'}
              <input type="file" accept=".csv,.xlsx,.xls" className="hidden" onChange={handleFileUpload} disabled={uploading} />
            </label>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-6">
          <div className="bg-secondary/30 rounded-xl p-4">
            <p className="text-2xl font-bold text-foreground">{totalStudents}</p>
            <p className="text-xs text-muted-foreground">Total Students</p>
          </div>
          <div className="bg-emerald-500/10 rounded-xl p-4">
            <p className="text-2xl font-bold text-emerald-600">{submittedCount}</p>
            <p className="text-xs text-emerald-600">Submitted</p>
          </div>
          <div className="bg-amber-500/10 rounded-xl p-4">
            <p className="text-2xl font-bold text-amber-600">{permittedCount}</p>
            <p className="text-xs text-amber-600">Permitted</p>
          </div>
          <div className="bg-red-500/10 rounded-xl p-4">
            <p className="text-2xl font-bold text-red-600">{notSubmittedCount}</p>
            <p className="text-xs text-red-600">Not Submitted</p>
          </div>
        </div>

        {/* Messages */}
        {error && (
          <div className="mt-4 p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-sm flex justify-between items-center">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-destructive hover:text-destructive/80"><XCircle className="w-4 h-4" /></button>
          </div>
        )}
        {success && (
          <div className="mt-4 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-600 text-sm flex justify-between items-center">
            <span>{success}</span>
            <button onClick={() => setSuccess(null)} className="text-emerald-600 hover:text-emerald-500"><XCircle className="w-4 h-4" /></button>
          </div>
        )}
      </div>

      {/* Main Content */}
      <div className="bg-card rounded-3xl shadow-sm border border-border overflow-hidden">
        {/* Search bar */}
        <div className="flex items-center gap-3 px-6 py-4 border-b border-border bg-secondary/5">
          <div className="relative flex-1 max-w-md">
            <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input type="text" placeholder="Search students by name or USN..."
              className="pl-10 pr-4 py-2.5 bg-background border border-border rounded-xl w-full focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
              value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
          </div>
        </div>

        {/* Breadcrumb */}
        <div className="flex items-center gap-1 text-sm text-muted-foreground px-6 py-3 border-b border-border flex-wrap">
          <button onClick={() => { setSelectedDept(null); setSelectedSem(null); setSelectedSection(null); }}
            className={`hover:text-indigo-500 transition-colors ${!selectedDept ? 'text-indigo-500 font-bold' : ''}`}>
            All Departments
          </button>
          {selectedDept && (<>
            <ChevronRight className="w-4 h-4 mx-1" />
            <button onClick={() => { setSelectedSem(null); setSelectedSection(null); }}
              className={`hover:text-indigo-500 transition-colors ${selectedDept && !selectedSem ? 'text-indigo-500 font-bold' : ''}`}>
              {departments.find(d => d.id === selectedDept)?.name || selectedDept}
            </button>
          </>)}
          {selectedSem && (<>
            <ChevronRight className="w-4 h-4 mx-1" />
            <button onClick={() => setSelectedSection(null)}
              className={`hover:text-indigo-500 transition-colors ${selectedSem && !selectedSection ? 'text-indigo-500 font-bold' : ''}`}>
              Sem {semesters.find(s => s.id === selectedSem)?.name || selectedSem}
            </button>
          </>)}
          {selectedSection && (<>
            <ChevronRight className="w-4 h-4 mx-1" />
            <span className="text-indigo-500 font-bold">Section {selectedSection}</span>
          </>)}
        </div>

        {loading ? (
          <div className="p-8 text-center text-muted-foreground animate-pulse">Loading students...</div>
        ) : isGlobalSearch ? (
          /* Global search results */
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-background text-xs border-b border-border">
                  <th className="p-3 font-semibold">#</th>
                  <th className="p-3 font-semibold">USN</th>
                  <th className="p-3 font-semibold">Student</th>
                  <th className="p-3 font-semibold">Department</th>
                  <th className="p-3 font-semibold text-center">Status</th>
                  <th className="p-3 font-semibold text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {globalResults.length === 0 ? (
                  <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No students match your search.</td></tr>
                ) : globalResults.map((r, idx) => (
                  <tr key={r.student_id} className="hover:bg-secondary/10 transition-colors">
                    <td className="p-3 text-sm text-muted-foreground">{idx + 1}</td>
                    <td className="p-3 text-xs font-mono text-muted-foreground">{r.profiles?.roll_number || '—'}</td>
                    <td className="p-3 font-medium text-sm text-foreground">{r.profiles?.full_name || '—'}</td>
                    <td className="p-3 text-xs text-muted-foreground">{r.profiles?.departments?.name || '—'}</td>
                    <td className="p-3 text-center"><StatusBadge status={r.status} /></td>
                    <td className="p-3 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {r.status === 'not_submitted' ? (<>
                          <button onClick={() => handleStatusChange(r.student_id, 'submitted')} className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-600 hover:bg-emerald-500 hover:text-white transition-all">Submitted</button>
                          <button onClick={() => handleStatusChange(r.student_id, 'permitted')} className="px-3 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-600 hover:bg-amber-500 hover:text-white transition-all">Permitted</button>
                        </>) : (
                          <button onClick={() => handleStatusChange(r.student_id, 'not_submitted')} className="px-3 py-1 rounded-full text-xs font-bold bg-red-500/15 text-red-600 hover:bg-red-500 hover:text-white transition-all">Not Submitted</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : !selectedDept ? (
          /* LEVEL 1: Department cards */
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 p-6">
            {departments.length === 0 ? (
              <div className="col-span-full p-8 text-center text-muted-foreground">No students found.</div>
            ) : departments.map(dept => (
              <button key={dept.id} onClick={() => setSelectedDept(dept.id)}
                className="bg-secondary/30 hover:bg-secondary/60 border border-border rounded-2xl p-6 text-left transition-all hover:shadow-md group">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 bg-indigo-500/10 rounded-xl flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-indigo-500" />
                  </div>
                  <h3 className="font-bold text-foreground text-lg group-hover:text-indigo-500 transition-colors">{dept.name}</h3>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-sm text-muted-foreground">{dept.count} students</span>
                  <span className="text-xs font-medium bg-emerald-500/10 text-emerald-600 px-2 py-0.5 rounded-full">{dept.cleared} cleared</span>
                  {(dept.count - dept.cleared) > 0 && (
                    <span className="text-xs font-medium bg-red-500/10 text-red-600 px-2 py-0.5 rounded-full">{dept.count - dept.cleared} pending</span>
                  )}
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground mt-3 group-hover:text-indigo-500 group-hover:translate-x-1 transition-all" />
              </button>
            ))}
          </div>
        ) : !selectedSem ? (
          /* LEVEL 2: Semester cards */
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-6">
            {semesters.length === 0 ? (
              <div className="col-span-full p-8 text-center text-muted-foreground">No semesters in this department.</div>
            ) : semesters.map(sem => (
              <button key={sem.id} onClick={() => setSelectedSem(sem.id)}
                className="bg-secondary/30 hover:bg-secondary/60 border border-border rounded-2xl p-5 text-left transition-all hover:shadow-md group">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 bg-amber-500/10 rounded-xl flex items-center justify-center">
                    <Users className="w-4 h-4 text-amber-500" />
                  </div>
                  <h3 className="font-bold text-foreground group-hover:text-indigo-500 transition-colors">Sem {sem.name}</h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{sem.count} students</span>
                  <span className="text-xs font-medium bg-emerald-500/10 text-emerald-600 px-2 py-0.5 rounded-full">{sem.cleared} cleared</span>
                </div>
              </button>
            ))}
          </div>
        ) : !selectedSection ? (
          /* LEVEL 3: Section cards */
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 p-6">
            {sections.length === 0 ? (
              <div className="col-span-full p-8 text-center text-muted-foreground">No sections in this semester.</div>
            ) : sections.map(sec => (
              <button key={sec.name} onClick={() => setSelectedSection(sec.name)}
                className="bg-secondary/30 hover:bg-secondary/60 border border-border rounded-2xl p-5 text-left transition-all hover:shadow-md group">
                <div className="flex items-center gap-3 mb-2">
                  <div className="w-9 h-9 bg-emerald-500/10 rounded-xl flex items-center justify-center">
                    <Users className="w-4 h-4 text-emerald-500" />
                  </div>
                  <h3 className="font-bold text-foreground group-hover:text-indigo-500 transition-colors">Section {sec.name}</h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">{sec.count} students</span>
                  <span className="text-xs font-medium bg-emerald-500/10 text-emerald-600 px-2 py-0.5 rounded-full">{sec.cleared} cleared</span>
                </div>
              </button>
            ))}
          </div>
        ) : (
          /* LEVEL 4: Student table */
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-background text-xs border-b border-border">
                  <th className="p-3 font-semibold">#</th>
                  <th className="p-3 font-semibold">USN</th>
                  <th className="p-3 font-semibold">Student</th>
                  <th className="p-3 font-semibold text-center">Status</th>
                  <th className="p-3 font-semibold text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredStudents.length === 0 ? (
                  <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No students found.</td></tr>
                ) : filteredStudents.map((r, idx) => renderStudentRow(r, idx))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
