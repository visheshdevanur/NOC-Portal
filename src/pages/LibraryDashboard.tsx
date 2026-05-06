import { useState, useEffect } from 'react';
import { getLibraryDues, bulkProcessLibraryDues, getAllDepartments, getSemestersByDepartment, setLibraryDue, permitLibraryDue, clearLibraryDue } from '../lib/api';
import { BookOpen, UserCheck, AlertCircle, Search, Upload, Download, RefreshCw, X, Building2, GraduationCap, CornerUpLeft, Users, ShieldCheck, ShieldOff, ShieldAlert } from 'lucide-react';
import Papa from 'papaparse';
import { getFriendlyErrorMessage } from '../lib/errorHandler';
import { validateCsvFileSize } from '../lib/csvSanitizer';

export default function LibraryDashboard() {
  const [libraryDues, setLibraryDues] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // CSV Upload States
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvProcessing, setCsvProcessing] = useState(false);

  // Action loading
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  // Alerts
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Hierarchical State
  const [departmentsList, setDepartmentsList] = useState<any[]>([]);
  const [semestersList, setSemestersList] = useState<any[]>([]);
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [selectedDeptName, setSelectedDeptName] = useState<string | null>(null);
  const [selectedSemesterId, setSelectedSemesterId] = useState<string | null>(null);
  const [selectedSemesterName, setSelectedSemesterName] = useState<string | null>(null);

  useEffect(() => {
    fetchDues();
    fetchDepartments();
  }, []);

  useEffect(() => {
    if (selectedDeptId) {
      fetchSemesters(selectedDeptId);
    } else {
      setSemestersList([]);
    }
  }, [selectedDeptId]);

  const fetchDepartments = async () => {
    try {
      const data = await getAllDepartments();
      setDepartmentsList(data || []);
    } catch (err: any) {
      setErrorMsg('Failed to load departments');
    }
  };

  const fetchSemesters = async (deptId: string) => {
    try {
      const data = await getSemestersByDepartment(deptId);
      setSemestersList(data || []);
    } catch (err: any) {
      setErrorMsg('Failed to load semesters');
    }
  };

  const fetchDues = async () => {
    setLoading(true);
    try {
      const data = await getLibraryDues();
      setLibraryDues(data || []);
    } catch (err: any) {
      console.error(err);
      setErrorMsg('Failed to load library dues');
    } finally {
      setLoading(false);
    }
  };

  const handleSetDue = async (due: any) => {
    setActionLoading(due.id);
    try {
      await setLibraryDue(due.student_id);
      setSuccessMsg(`Set due for ${due.profiles?.full_name}`);
      fetchDues();
    } catch (err: any) {
      setErrorMsg(getFriendlyErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  };

  const handlePermit = async (due: any) => {
    setActionLoading(due.id);
    try {
      await permitLibraryDue(due.student_id);
      setSuccessMsg(`Permitted clearance for ${due.profiles?.full_name}`);
      fetchDues();
    } catch (err: any) {
      setErrorMsg(getFriendlyErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  };

  const handleClearDue = async (due: any) => {
    setActionLoading(due.id);
    try {
      await clearLibraryDue(due.student_id);
      setSuccessMsg(`Cleared dues for ${due.profiles?.full_name}`);
      fetchDues();
    } catch (err: any) {
      setErrorMsg(getFriendlyErrorMessage(err));
    } finally {
      setActionLoading(null);
    }
  };

  const handleCsvUpload = () => {
    if (!csvFile) return;
    setCsvProcessing(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    // FIX #44: Validate file size before parsing
    try {
      validateCsvFileSize(csvFile, 5);
    } catch (sizeErr: any) {
      setErrorMsg(sizeErr.message);
      setCsvProcessing(false);
      return;
    }

    Papa.parse(csvFile, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const rows = results.data as any[];
          // Support both 'usn' and 'roll_number' column names
          const usnCol = Object.keys(rows[0] || {}).find(k => k.toLowerCase() === 'usn' || k.toLowerCase() === 'roll_number');
          if (!usnCol) {
            throw new Error('No valid column found. Please ensure a "usn" column exists.');
          }
          const notPaidRolls = rows
            .filter(r => r[usnCol])
            .map(r => String(r[usnCol]).trim());

          if (notPaidRolls.length === 0) {
            throw new Error('No valid USNs found in the file.');
          }

          await bulkProcessLibraryDues(notPaidRolls);
          setSuccessMsg(`Upload processed! ${notPaidRolls.length} students marked as having dues. All others auto-cleared.`);
          setCsvFile(null);
          fetchDues();
        } catch (err: any) {
          setErrorMsg(err.message || 'Processing failed');
        } finally {
          setCsvProcessing(false);
        }
      },
      error: (err) => {
        setErrorMsg(`CSV Parse Error: ${err.message}`);
        setCsvProcessing(false);
      }
    });
  };

  const downloadTemplate = () => {
    const csvContent = "data:text/csv;charset=utf-8,usn\n4MH24CS001\n4MH24CS002";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "Library_Dues_USN_Template.csv");
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  // Global search results (bypass hierarchy)
  const globalSearchResults = searchTerm.trim().length >= 2
    ? libraryDues.filter(due => {
        const p = due.profiles || {};
        const s = searchTerm.toLowerCase();
        return (p.full_name?.toLowerCase() || '').includes(s) || (p.roll_number?.toLowerCase() || '').includes(s);
      })
    : [];

  // Filtered dues for selected dept + semester
  const filteredDues = libraryDues.filter(due => {
    const p = due.profiles || {};
    if (selectedDeptId && p.department_id !== selectedDeptId) return false;
    if (selectedSemesterId && p.semester_id !== selectedSemesterId) return false;
    return true;
  });

  // Count dues per department
  const deptDueCounts = (deptId: string) => libraryDues.filter(d => d.profiles?.department_id === deptId).length;
  const deptPendingCounts = (deptId: string) => libraryDues.filter(d => d.profiles?.department_id === deptId && d.has_dues).length;

  // Count dues per semester
  const semDueCounts = (semId: string) => libraryDues.filter(d => d.profiles?.department_id === selectedDeptId && d.profiles?.semester_id === semId).length;
  const semPendingCounts = (semId: string) => libraryDues.filter(d => d.profiles?.department_id === selectedDeptId && d.profiles?.semester_id === semId && d.has_dues).length;

  const isGlobalSearch = searchTerm.trim().length >= 2;

  // Get status info
  const getStatus = (due: any) => {
    if (!due.has_dues) return { label: 'Cleared', color: 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800/30 dark:text-emerald-400' };
    if (due.permitted) return { label: 'Permitted', color: 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-900/20 dark:border-amber-800/30 dark:text-amber-400' };
    return { label: 'Pending', color: 'bg-red-50 text-red-600 border-red-200 dark:bg-red-900/20 dark:border-red-800/30 dark:text-red-400' };
  };

  // Render student row
  const renderStudentRow = (due: any) => {
    const status = getStatus(due);
    const isLoading = actionLoading === due.id;
    return (
      <tr key={due.id} className="hover:bg-secondary/20 transition-colors">
        <td className="p-4">
          <div className="font-bold text-foreground text-[15px]">{due.profiles?.full_name}</div>
          <div className="text-xs text-muted-foreground font-mono mt-0.5 tracking-wider">{due.profiles?.roll_number}</div>
          {isGlobalSearch && (
            <div className="text-xs text-muted-foreground mt-1">
              {due.profiles?.departments?.name || '—'} · {due.profiles?.semesters?.name || '—'}
            </div>
          )}
        </td>
        <td className="p-4 text-center">
          <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${status.color}`}>
            {status.label}
          </span>
        </td>
        <td className="p-4 text-right">
          <div className="flex justify-end items-center gap-2">
            {isLoading ? (
              <span className="text-xs text-muted-foreground animate-pulse">Processing...</span>
            ) : (
              <>
                {/* If cleared → show Set Due */}
                {!due.has_dues && (
                  <button
                    onClick={() => handleSetDue(due)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 text-red-600 hover:bg-red-500 hover:text-white text-xs font-bold rounded-xl transition-all"
                    title="Set this student as having library dues"
                  >
                    <ShieldOff className="w-3.5 h-3.5" />
                    Set Due
                  </button>
                )}
                {/* If blocked → show Permit and Clear */}
                {due.has_dues && !due.permitted && (
                  <>
                    <button
                      onClick={() => handlePermit(due)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 text-amber-600 hover:bg-amber-500 hover:text-white text-xs font-bold rounded-xl transition-all"
                      title="Permit clearance while dues are still pending"
                    >
                      <ShieldAlert className="w-3.5 h-3.5" />
                      Permit
                    </button>
                    <button
                      onClick={() => handleClearDue(due)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500 hover:text-white text-xs font-bold rounded-xl transition-all"
                      title="Clear all library dues for this student"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Clear Due
                    </button>
                  </>
                )}
                {/* If permitted → show Clear */}
                {due.has_dues && due.permitted && (
                  <>
                    <button
                      onClick={() => handleSetDue(due)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-500/10 text-red-600 hover:bg-red-500 hover:text-white text-xs font-bold rounded-xl transition-all"
                      title="Revoke permit and block student"
                    >
                      <ShieldOff className="w-3.5 h-3.5" />
                      Revoke
                    </button>
                    <button
                      onClick={() => handleClearDue(due)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500 hover:text-white text-xs font-bold rounded-xl transition-all"
                      title="Clear all library dues for this student"
                    >
                      <ShieldCheck className="w-3.5 h-3.5" />
                      Clear Due
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </td>
      </tr>
    );
  };

  // Render the student table
  const renderStudentTable = (duesList: any[]) => (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-secondary/40 border-b border-border text-sm text-foreground">
            <th className="p-4 font-semibold w-2/5">Student</th>
            <th className="p-4 font-semibold text-center w-[120px]">Status</th>
            <th className="p-4 font-semibold text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {duesList.length === 0 ? (
            <tr><td colSpan={3} className="text-center p-12 text-muted-foreground">No students found.</td></tr>
          ) : (
            duesList.map(renderStudentRow)
          )}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in zoom-in-95 duration-300">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 bg-card p-6 rounded-3xl shadow-sm border border-border">
        <div>
          <h1 className="text-3xl font-extrabold text-foreground tracking-tight flex items-center gap-3">
            <BookOpen className="w-8 h-8 text-primary p-1.5 bg-primary/10 rounded-xl" />
            Library Dues
          </h1>
          <p className="text-muted-foreground mt-2">Manage student library clearance status.</p>
        </div>
        <div className="relative w-full md:w-72 mt-4 md:mt-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input type="text" placeholder="Search USN or Name..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-3 bg-secondary/50 border border-border rounded-xl focus:ring-2 focus:ring-primary focus:outline-none transition-all shadow-sm font-medium" />
        </div>
      </div>

      {/* Alerts */}
      {successMsg && (
        <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-between">
          <div className="flex items-center text-emerald-600 dark:text-emerald-400 font-medium tracking-wide">
            <UserCheck className="w-5 h-5 mr-3 flex-shrink-0" />{successMsg}
          </div>
          <button onClick={() => setSuccessMsg(null)}><X className="w-5 h-5 opacity-50 hover:opacity-100 transition-opacity" /></button>
        </div>
      )}
      {errorMsg && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-between">
          <div className="flex items-center text-red-600 dark:text-red-400 font-medium tracking-wide">
            <AlertCircle className="w-5 h-5 mr-3 flex-shrink-0" />{errorMsg}
          </div>
          <button onClick={() => setErrorMsg(null)}><X className="w-5 h-5 opacity-50 hover:opacity-100 transition-opacity" /></button>
        </div>
      )}

      {/* GLOBAL SEARCH RESULTS */}
      {isGlobalSearch && (
        <div className="mb-6">
          <div className="bg-card border border-border rounded-3xl shadow-sm overflow-hidden">
            <div className="p-6 border-b border-border bg-secondary/30 flex justify-between items-center">
              <h2 className="font-bold text-lg text-foreground">Search Results ({globalSearchResults.length})</h2>
              <button onClick={() => setSearchTerm('')} className="text-sm text-primary font-medium hover:underline">Clear Search</button>
            </div>
            {renderStudentTable(globalSearchResults)}
          </div>
        </div>
      )}

      {/* HIERARCHICAL VIEW */}
      {!isGlobalSearch && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          <div className="lg:col-span-3 space-y-6">

            {/* LEVEL 1: DEPARTMENTS */}
            {!selectedDeptId && (
              <div className="space-y-4 animate-in fade-in duration-300">
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                    <Building2 className="w-6 h-6 text-primary" /> Select Branch
                  </h2>
                  <button onClick={fetchDues} disabled={loading} className="p-2 text-muted-foreground hover:text-primary transition-colors hover:bg-primary/10 rounded-xl">
                    <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
                {loading && libraryDues.length === 0 ? (
                  <div className="text-center p-12 text-muted-foreground animate-pulse">Loading departments...</div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                    {departmentsList.map(dept => {
                      const total = deptDueCounts(dept.id);
                      const pending = deptPendingCounts(dept.id);
                      return (
                        <button
                          key={dept.id}
                          onClick={() => { setSelectedDeptId(dept.id); setSelectedDeptName(dept.name); }}
                          className="bg-card border border-border rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-primary/50 transition-all text-left group"
                        >
                          <div className="flex items-center gap-3 mb-3">
                            <div className="p-2 bg-primary/10 rounded-xl">
                              <Building2 className="w-6 h-6 text-primary" />
                            </div>
                            <h3 className="text-lg font-bold text-foreground group-hover:text-primary transition-colors">{dept.name}</h3>
                          </div>
                          <div className="flex items-center gap-4 text-sm">
                            <span className="text-muted-foreground"><Users className="w-4 h-4 inline mr-1" />{total} students</span>
                            {pending > 0 && (
                              <span className="text-red-600 dark:text-red-400 font-bold">
                                <AlertCircle className="w-4 h-4 inline mr-1" />{pending} pending
                              </span>
                            )}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* LEVEL 2: SEMESTERS */}
            {selectedDeptId && !selectedSemesterId && (
              <div className="space-y-4 animate-in fade-in duration-300">
                <button
                  onClick={() => { setSelectedDeptId(null); setSelectedDeptName(null); setSemestersList([]); }}
                  className="flex items-center text-sm font-bold text-muted-foreground hover:text-foreground transition-colors"
                >
                  <CornerUpLeft className="w-4 h-4 mr-2" /> Back to Branches
                </button>
                <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
                  <GraduationCap className="w-6 h-6 text-primary" /> {selectedDeptName} — Select Semester
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                  {semestersList.map(sem => {
                    const total = semDueCounts(sem.id);
                    const pending = semPendingCounts(sem.id);
                    return (
                      <button
                        key={sem.id}
                        onClick={() => { setSelectedSemesterId(sem.id); setSelectedSemesterName(sem.name); }}
                        className="bg-card border border-border rounded-2xl p-6 shadow-sm hover:shadow-md hover:border-primary/50 transition-all text-left group"
                      >
                        <div className="flex items-center gap-3 mb-3">
                          <div className="p-2 bg-indigo-500/10 rounded-xl">
                            <GraduationCap className="w-6 h-6 text-indigo-500" />
                          </div>
                          <h3 className="text-lg font-bold text-foreground group-hover:text-indigo-500 transition-colors">{sem.name}</h3>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <span className="text-muted-foreground"><Users className="w-4 h-4 inline mr-1" />{total} students</span>
                          {pending > 0 && (
                            <span className="text-red-600 dark:text-red-400 font-bold">
                              <AlertCircle className="w-4 h-4 inline mr-1" />{pending} pending
                            </span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* LEVEL 3: STUDENTS */}
            {selectedDeptId && selectedSemesterId && (
              <div className="space-y-4 animate-in fade-in duration-300">
                <button
                  onClick={() => { setSelectedSemesterId(null); setSelectedSemesterName(null); }}
                  className="flex items-center text-sm font-bold text-muted-foreground hover:text-foreground transition-colors"
                >
                  <CornerUpLeft className="w-4 h-4 mr-2" /> Back to Semesters
                </button>
                <div className="flex items-center justify-between">
                  <h2 className="text-xl font-bold text-foreground">
                    {selectedDeptName} — {selectedSemesterName}
                    <span className="text-muted-foreground text-sm font-normal ml-3">({filteredDues.length} students)</span>
                  </h2>
                  <button onClick={fetchDues} disabled={loading} className="p-2 text-muted-foreground hover:text-primary transition-colors hover:bg-primary/10 rounded-xl">
                    <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
                  </button>
                </div>
                <div className="bg-card border border-border rounded-3xl shadow-sm overflow-hidden">
                  {renderStudentTable(filteredDues)}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            <div className="bg-card border border-border rounded-3xl p-6 shadow-sm overflow-hidden relative">
              <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-bl-full pointer-events-none"></div>
              <h3 className="font-bold text-lg text-foreground mb-4">Upload Due List</h3>
              <p className="text-sm text-muted-foreground mb-6">Upload a CSV with USNs of students who have dues. All other students will be automatically cleared.</p>
              <input type="file" accept=".csv" className="hidden" id="csv-upload" onChange={(e) => setCsvFile(e.target.files?.[0] || null)} />
              <label
                htmlFor="csv-upload"
                className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-2xl cursor-pointer transition-all ${csvFile ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:bg-secondary/50 hover:border-primary/50'}`}
              >
                <Upload className={`w-8 h-8 mb-3 ${csvFile ? 'text-primary' : 'text-muted-foreground'}`} />
                <span className="font-medium text-[15px]">{csvFile ? csvFile.name : 'Select CSV File'}</span>
                {!csvFile && <span className="text-xs mt-1">Drag and drop or click</span>}
              </label>
              {csvFile && (
                <button onClick={handleCsvUpload} disabled={csvProcessing} className="w-full mt-4 bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-3 px-4 rounded-xl shadow-md disabled:opacity-50 transition-all active:scale-[0.98]">
                  {csvProcessing ? 'Processing File...' : 'Upload Due List'}
                </button>
              )}
              <button onClick={downloadTemplate} className="w-full mt-4 flex justify-center items-center gap-2 text-sm text-primary hover:underline font-medium">
                <Download className="w-4 h-4" /> Download Template
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
