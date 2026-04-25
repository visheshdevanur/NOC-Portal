import { useState, useEffect } from 'react';
import { getLibraryDues, updateLibraryDue, bulkProcessLibraryDues, getAllDepartments, getSemestersByDepartment } from '../lib/api';
import { BookOpen, UserCheck, AlertCircle, Search, Upload, Download, RefreshCw, Save, X, Building2, GraduationCap, CornerUpLeft, Users } from 'lucide-react';
import Papa from 'papaparse';
import { getFriendlyErrorMessage } from '../lib/errorHandler';

export default function LibraryDashboard() {
  const [libraryDues, setLibraryDues] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  
  // CSV Upload States
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [csvProcessing, setCsvProcessing] = useState(false);
  
  // Editing Due State
  const [editingDueId, setEditingDueId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState<number>(0);
  const [clearingPaidAmounts, setClearingPaidAmounts] = useState<Record<string, number>>({});
  const [editRemarks, setEditRemarks] = useState<string>('');

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

  const handlePaymentOrClear = async (due: any, payment: number = 0) => {
    try {
      const fine = due.fine_amount || 0;
      const previousPaid = due.paid_amount || 0;
      const totalPaid = previousPaid + payment;
      const remaining = Math.max(0, fine - totalPaid);
      const hasDues = remaining > 0;
      const remarks = hasDues ? (due.remarks || 'Partial payment received') : 'Cleared manually';

      await updateLibraryDue(due.student_id, hasDues, fine, totalPaid, remarks);
      setSuccessMsg(hasDues ? `Payment of ₹${payment} recorded. Remaining: ₹${remaining}` : `Cleared dues for ${due.profiles.full_name}`);
      fetchDues();
    } catch (err: any) {
      setErrorMsg(getFriendlyErrorMessage(err));
    }
  };

  const handleSaveDue = async (due: any) => {
    try {
      const hasDues = editAmount > 0;
      const remarksToSave = hasDues && !editRemarks.trim() ? 'Library Fine Pending' : editRemarks;
      await updateLibraryDue(due.student_id, hasDues, editAmount, due.paid_amount || 0, remarksToSave);
      setSuccessMsg(`Updated dues for ${due.profiles.full_name}`);
      setEditingDueId(null);
      fetchDues();
    } catch (err: any) {
      setErrorMsg(getFriendlyErrorMessage(err));
    }
  };

  const handleCsvUpload = () => {
    if (!csvFile) return;
    setCsvProcessing(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    Papa.parse(csvFile, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const rows = results.data as any[];
          const validRows = rows
            .filter(r => r.roll_number)
            .map(r => ({
              roll_number: String(r.roll_number).trim(),
              fine_amount: parseFloat(r.fine_amount) || 0,
              remarks: String(r.remarks || '').trim()
            }));

          if (validRows.length === 0) {
            throw new Error('No valid rows found. Please ensure "roll_number" column exists.');
          }

          const processed = await bulkProcessLibraryDues(validRows);
          setSuccessMsg(`Successfully processed ${processed} student records.`);
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
    const csvContent = "data:text/csv;charset=utf-8,roll_number,fine_amount,remarks\nUSN123,500,Lost Book\nUSN124,0,Cleared";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "library_fine_template.csv");
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

  // Render student row
  const renderStudentRow = (due: any) => (
    <tr key={due.id} className={`transition-colors py-2 ${editingDueId === due.id ? 'bg-indigo-50 dark:bg-indigo-900/10' : 'hover:bg-secondary/20'}`}>
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
        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-bold border ${due.has_dues ? 'bg-red-50 text-red-600 border-red-200 dark:bg-red-900/20 dark:border-red-800/30 dark:text-red-400' : 'bg-emerald-50 text-emerald-600 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800/30 dark:text-emerald-400'}`}>
          {due.has_dues ? 'Blocked' : 'Cleared'}
        </span>
      </td>
      <td className="p-4">
        {editingDueId === due.id ? (
          <div className="space-y-2">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm font-medium">₹</span>
              <input type="number" min="0" value={editAmount} onChange={e => setEditAmount(parseFloat(e.target.value) || 0)} className="w-full pl-7 pr-3 py-1.5 text-sm border border-border rounded-lg bg-background focus:ring-2 focus:ring-primary focus:outline-none" />
            </div>
            <input type="text" placeholder="Reason (e.g. Lost Book)" value={editRemarks} onChange={e => setEditRemarks(e.target.value)} className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-background focus:ring-2 focus:ring-primary focus:outline-none" />
          </div>
        ) : (
          <div>
            {(() => {
              const fine = due.fine_amount || 0;
              const paid = due.paid_amount || 0;
              const rem = Math.max(0, fine - paid);
              return (
                <div className="flex flex-col gap-1">
                  <div className="font-semibold text-foreground text-sm flex items-center">
                    {fine > 0 ? `Total Fine: ₹${fine}` : '-'}
                    {fine > 0 && due.has_dues && <AlertCircle className="w-4 h-4 ml-2 text-amber-500 inline-block" />}
                  </div>
                  {fine > 0 && (
                    <>
                      <div className="text-sm text-emerald-600 dark:text-emerald-400">Total Paid: ₹{paid}</div>
                      <div className={`text-sm font-bold ${rem > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
                        Remaining: ₹{rem}
                      </div>
                    </>
                  )}
                </div>
              );
            })()}
            {due.remarks && <div className="text-xs text-muted-foreground mt-0.5 italic">{due.remarks}</div>}
          </div>
        )}
      </td>
      <td className="p-4 text-right">
        {editingDueId === due.id ? (
          <div className="flex justify-end gap-2">
            <button onClick={() => handleSaveDue(due)} className="p-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors" title="Save"><Save className="w-4 h-4" /></button>
            <button onClick={() => setEditingDueId(null)} className="p-1.5 bg-secondary text-foreground rounded-lg hover:bg-border transition-colors" title="Cancel"><X className="w-4 h-4" /></button>
          </div>
        ) : (
          <div className="flex justify-end items-center gap-3">
            <button onClick={() => { setEditingDueId(due.id); setEditAmount(due.fine_amount || 0); setEditRemarks(due.remarks || ''); }} className="text-sm font-medium text-primary hover:text-primary/70 transition-colors hover:underline">Edit</button>
            {due.has_dues && (() => {
              const remaining = Math.max(0, (due.fine_amount || 0) - (due.paid_amount || 0));
              return (
                <div className="flex items-center gap-2">
                  <div className="relative w-24">
                    <span className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-medium">Pay ₹</span>
                    <input type="number" min="0" max={remaining} value={clearingPaidAmounts[due.id] !== undefined ? clearingPaidAmounts[due.id] : ''} onChange={e => setClearingPaidAmounts({...clearingPaidAmounts, [due.id]: parseFloat(e.target.value)})} placeholder={String(remaining)} className="w-full pl-11 pr-2 py-1.5 text-xs border border-border rounded-lg bg-background focus:ring-2 focus:ring-emerald-500 focus:outline-none" />
                  </div>
                  <button
                    onClick={() => {
                      let payment = clearingPaidAmounts[due.id];
                      if (payment === undefined || isNaN(payment)) payment = remaining;
                      payment = Math.min(payment, remaining);
                      if (payment > 0 || remaining === 0) {
                        handlePaymentOrClear(due, payment);
                        setClearingPaidAmounts(prev => { const next = {...prev}; delete next[due.id]; return next; });
                      }
                    }}
                    className="px-3 py-1.5 bg-emerald-500 text-white rounded-lg shadow-sm hover:bg-emerald-600 transition-all font-bold text-xs active:scale-95 whitespace-nowrap"
                  >
                    {(clearingPaidAmounts[due.id] !== undefined && clearingPaidAmounts[due.id] < remaining) ? "Add Payment" : "Clear No-Dues"}
                  </button>
                </div>
              );
            })()}
          </div>
        )}
      </td>
    </tr>
  );

  // Render the student table
  const renderStudentTable = (duesList: any[]) => (
    <div className="overflow-x-auto">
      <table className="w-full text-left border-collapse">
        <thead>
          <tr className="bg-secondary/40 border-b border-border text-sm text-foreground">
            <th className="p-4 font-semibold w-1/3">Student</th>
            <th className="p-4 font-semibold text-center w-[120px]">Status</th>
            <th className="p-4 font-semibold w-1/4">Remarks & Fines</th>
            <th className="p-4 font-semibold text-right">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {duesList.length === 0 ? (
            <tr><td colSpan={4} className="text-center p-12 text-muted-foreground">No students found.</td></tr>
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
          <p className="text-muted-foreground mt-2">Manage student textbook returns and library fines.</p>
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
              <h3 className="font-bold text-lg text-foreground mb-4">Bulk Upload</h3>
              <p className="text-sm text-muted-foreground mb-6">Upload an export from legacy software to batch update fines instantly.</p>
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
                  {csvProcessing ? 'Processing File...' : 'Upload & Process'}
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
