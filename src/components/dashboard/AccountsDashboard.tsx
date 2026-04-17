import { useState, useEffect } from 'react';
import { useAuth } from '../../lib/useAuth';
import { getAllStudentDues, getAllDepartments, getSemestersByDepartment, updateStudentDueFee, logActivity } from '../../lib/api';
import { Search, X, ShieldCheck, Building2, BookOpen, Users, ChevronRight, CornerUpLeft } from 'lucide-react';
import { supabase } from '../../lib/supabase';

type StudentDues = {
  id: string;
  student_id: string;
  fine_amount: number | null;
  status: string;
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

export default function AccountsDashboard() {
  const { profile } = useAuth();
  const [dues, setDues] = useState<StudentDues[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [uploadingCSV, setUploadingCSV] = useState(false);
  
  const [departmentsList, setDepartmentsList] = useState<any[]>([]);
  const [semestersList, setSemestersList] = useState<any[]>([]);

  // Hierarchical State
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [selectedDeptName, setSelectedDeptName] = useState<string | null>(null);
  const [selectedSemesterId, setSelectedSemesterId] = useState<string | null>(null);
  const [selectedSemesterName, setSelectedSemesterName] = useState<string | null>(null);
  const [selectedSection, setSelectedSection] = useState<string | null>(null);





  useEffect(() => {
    fetchDues();
    fetchDepartments();

    const channel = supabase.channel('accounts-dashboard')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'student_dues' }, () => {
        fetchDues();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
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
      setError(`Departments: ${err?.message || 'Unknown error'}`);
    }
  };

  const fetchSemesters = async (deptId: string) => {
    try {
      const data = await getSemestersByDepartment(deptId);
      setSemestersList(data || []);
    } catch (err: any) {
      setError(`Semesters: ${err?.message || 'Unknown error'}`);
    }
  };

  const fetchDues = async () => {
    setLoading(true);
    try {
      const data = await getAllStudentDues();
      setDues(data as unknown as StudentDues[]);
    } catch (err: any) {
      setError(`Dues: ${err?.message || 'Unknown error'}`);
    } finally {
      setLoading(false);
    }
  };




  const handleManualFeeUpdate = async (dueId: string, fineAmount: number, profileName: string = 'Student') => {
    try {
      // First, strictly fetch the existing due amount from the database
      const { data: currentDue } = await supabase.from('student_dues').select('fine_amount').eq('id', dueId).single();
      const previousAmount = currentDue?.fine_amount || 0;
      const diff = previousAmount - fineAmount;
      
      await updateStudentDueFee(dueId, fineAmount);
      
      if (fineAmount === 0 && previousAmount > 0) {
        await logActivity('Cleared Due Amount', `Cleared dues for ${profileName} (Paid: ₹${previousAmount})`);
      } else if (fineAmount === 0 && previousAmount === 0) {
        await logActivity('Cleared Due Amount', `Cleared dues for ${profileName}`);
      } else if (diff > 0) {
        await logActivity('Updated Due Amount', `Set due amount to ₹${fineAmount} for ${profileName} (Paid: ₹${diff})`);
      } else {
        await logActivity('Updated Due Amount', `Set due amount to ₹${fineAmount} for ${profileName}`);
      }
      // Update local state
      setDues(prev => prev.map(d => d.id === dueId ? { ...d, fine_amount: fineAmount, status: fineAmount > 0 ? 'pending' : 'completed' } : d));
      setSuccess(`Due amount updated to ₹${fineAmount}. Status: ${fineAmount > 0 ? 'Pending' : 'Cleared'}.`);
    } catch (err: any) {
      setError('Failed to update due amount: ' + (err?.message || 'Unknown'));
    }
  };

  const downloadTemplate = () => {
    const csvContent = "data:text/csv;charset=utf-8,roll_number,due_amount\n21CS001,1500\n21CS002,500";
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "College_Dues_Upload_Template.csv");
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    
    setUploadingCSV(true);
    setError(null);
    setSuccess(null);
    
    try {
      const text = await file.text();
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
      
      if (lines.length < 2) throw new Error("CSV file is empty or missing data rows.");
      
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());
      const hasAmountCol = headers.includes('fine_amount') || headers.includes('due_amount');
      if (!headers.includes('roll_number') || !hasAmountCol) {
        throw new Error("Missing required CSV column: roll_number or due_amount");
      }

      const pendingDuesToUpdate: { id: string, fine_amount: number }[] = [];
      const allDuesIds = dues.map(d => d.id);
      
      let errorCount = 0;

      for (let i = 1; i < lines.length; i++) {
        const columns = lines[i].split(',').map(c => c.trim());
        const getVal = (colName: string) => columns[headers.indexOf(colName)] || '';
        
        const roll_number = getVal('roll_number');
        const fine_str = getVal('due_amount') || getVal('fine_amount');
        const fine_amount = parseInt(fine_str, 10);
        
        if (!roll_number || isNaN(fine_amount)) {
          errorCount++;
          continue;
        }

        // Find the match in our dues array
        const match = dues.find(d => d.profiles?.roll_number === roll_number);
        if (match) {
          pendingDuesToUpdate.push({ id: match.id, fine_amount });
        } else {
          errorCount++;
        }
      }
      
      const { bulkProcessCollegeDues } = await import('../../lib/api');
      await bulkProcessCollegeDues(pendingDuesToUpdate, allDuesIds);

      setSuccess(`Upload processed! Set ${pendingDuesToUpdate.length} students as pending with dues. All other students marked as completed.`);
      if (errorCount > 0) setError(`Skipped ${errorCount} invalid rows or unmatched roll numbers.`);
      
      fetchDues();
    } catch (err: any) {
      setError(err?.message || 'Failed to process file');
    } finally {
      setUploadingCSV(false);
      event.target.value = '';
    }
  };

  // 1. Fetch from Database to support empty departments
  const uniqueDepartments = departmentsList.map(d => ({ id: d.id, name: d.name }));

  // 2. Fetch from Database to support empty semesters
  const uniqueSemesters = semestersList.map(s => ({ id: s.id, name: s.name }));

  // 3. Derive Sections for selected Semester (sections are text fields on profiles)
  const sectionsSet = new Set<string>();
  if (selectedSemesterId) {
    dues.filter(d => d.profiles?.department_id === selectedDeptId && d.profiles?.semester_id === selectedSemesterId).forEach(d => {
      if (d.profiles?.section) {
         sectionsSet.add(d.profiles.section);
      }
    });
  }
  const uniqueSections = Array.from(sectionsSet).sort();

  // 4. Filter Students Data for Level 4
  const filteredDues = dues.filter(d => 
    d.profiles?.department_id === selectedDeptId &&
    d.profiles?.semester_id === selectedSemesterId &&
    d.profiles?.section === selectedSection &&
    (d.profiles?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
     d.profiles?.roll_number?.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  // 5. Global search results (bypasses hierarchy)
  const isGlobalSearch = searchTerm.trim().length >= 2;
  const globalSearchResults = isGlobalSearch ? dues.filter(d =>
    d.profiles?.full_name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    d.profiles?.roll_number?.toLowerCase().includes(searchTerm.toLowerCase())
  ) : [];

  return (
    <div className="space-y-6 fade-in">
      {/* Header */}
      <div className="bg-card rounded-3xl p-8 shadow-sm border border-border relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-full bg-emerald-500"></div>
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-3xl font-bold text-foreground mb-2 flex items-center">
              <ShieldCheck className="w-8 h-8 mr-3 text-emerald-500" />
              Accounts Portal
            </h1>
            <p className="text-muted-foreground flex items-center">
              <span className="font-medium bg-secondary px-3 py-1 rounded-full text-foreground text-sm mr-3">
                {profile?.full_name || 'Accounts Manager'}
              </span>
              Manage global college fees and dues
            </p>
          </div>
          
          <div className="flex items-center gap-3">
            <button
              onClick={downloadTemplate}
              className="flex items-center gap-2 bg-secondary text-foreground hover:bg-secondary/80 px-4 py-3 rounded-xl font-medium transition-all shadow-sm"
            >
              Template
            </button>
            <label className="flex items-center gap-2 bg-emerald-500 text-white hover:bg-emerald-600 px-4 py-3 rounded-xl font-bold transition-all shadow-sm cursor-pointer disabled:opacity-50">
              {uploadingCSV ? "Processing..." : "Mass Upload CSV"}
              <input type="file" accept=".csv" className="hidden" onChange={handleFileUpload} disabled={uploadingCSV} />
            </label>
          </div>
        </div>
      </div>

      {/* Main Content Area */}
          {/* Global Search */}
          <div className="relative w-full">
            <input
              type="text"
              placeholder="Search any student by name or roll no..."
              className="px-4 py-3 border border-border rounded-2xl focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-background w-full text-sm"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button onClick={() => setSearchTerm('')} className="absolute right-3 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-secondary transition-colors">
                <X className="w-4 h-4 text-muted-foreground" />
              </button>
            )}
          </div>

      {success && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-600 dark:text-emerald-400 text-sm flex justify-between items-center">
          <span><strong>Success:</strong> {success}</span>
          <button onClick={() => setSuccess(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-sm flex justify-between items-center">
          <span><strong>Error:</strong> {error}</span>
          <button onClick={() => setError(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Breadcrumb Bar — hidden during global search */}
      {!isGlobalSearch && (
      <div className="flex bg-card p-4 rounded-2xl items-center text-sm font-medium text-muted-foreground overflow-x-auto whitespace-nowrap shadow-sm border border-border">
        <button 
          onClick={() => { setSelectedDeptId(null); setSelectedSemesterId(null); setSelectedSection(null); }} 
          className={`hover:text-emerald-500 transition-colors flex items-center ${!selectedDeptId ? 'text-emerald-600 dark:text-emerald-400 font-bold' : ''}`}
        >
          All Departments
        </button>
        {selectedDeptId && (
          <>
            <ChevronRight className="w-4 h-4 mx-2" />
            <button 
              onClick={() => { setSelectedSemesterId(null); setSelectedSection(null); }} 
              className={`hover:text-emerald-500 transition-colors max-w-[200px] truncate ${selectedDeptId && !selectedSemesterId ? 'text-emerald-600 dark:text-emerald-400 font-bold' : ''}`}
            >
              {selectedDeptName}
            </button>
          </>
        )}
        {selectedSemesterId && (
          <>
            <ChevronRight className="w-4 h-4 mx-2" />
            <button 
              onClick={() => { setSelectedSection(null); }} 
              className={`hover:text-emerald-500 transition-colors ${selectedSemesterId && !selectedSection ? 'text-emerald-600 dark:text-emerald-400 font-bold' : ''}`}
            >
              {selectedSemesterName}
            </button>
          </>
        )}
        {selectedSection && (
          <>
             <ChevronRight className="w-4 h-4 mx-2" />
             <span className="text-emerald-600 dark:text-emerald-400 font-bold">Section {selectedSection}</span>
          </>
        )}
      </div>
      )}


      {loading ? (
        <div className="bg-card rounded-3xl p-8 shadow-sm border border-border text-center text-muted-foreground animate-pulse">Loading ledgers...</div>
      ) : isGlobalSearch ? (
        /* GLOBAL SEARCH RESULTS */
        <div className="space-y-4 animate-fade-in">
          <div className="flex items-center gap-3">
            <Search className="w-5 h-5 text-emerald-500" />
            <h2 className="text-lg font-bold text-foreground">
              Search Results <span className="text-muted-foreground font-normal text-sm ml-2">({globalSearchResults.length} found)</span>
            </h2>
          </div>
          <div className="bg-card rounded-3xl shadow-sm border border-border overflow-hidden">
            {globalSearchResults.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground">No students match your search.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-secondary/50 text-foreground text-sm border-b border-border">
                      <th className="p-5 font-semibold">Student Name</th>
                      <th className="p-5 font-semibold">Roll Number</th>
                      <th className="p-5 font-semibold">Dept / Sem / Sec</th>
                      <th className="p-5 font-semibold">Due Amount (₹)</th>
                      <th className="p-5 font-semibold">Status</th>
                      <th className="p-5 font-semibold text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {globalSearchResults.map(d => (
                      <tr key={d.id} className="hover:bg-secondary/40 transition-colors">
                        <td className="p-5 font-medium text-foreground text-sm sm:text-base">{d.profiles?.full_name || 'Unknown'}</td>
                        <td className="p-5 text-sm text-muted-foreground font-bold tracking-widest">{d.profiles?.roll_number || 'N/A'}</td>
                        <td className="p-5 text-sm text-muted-foreground">
                          <span className="font-medium text-foreground">{d.profiles?.departments?.name || '—'}</span>
                          <span className="mx-1">·</span>
                          <span>{d.profiles?.semesters?.name || '—'}</span>
                          <span className="mx-1">·</span>
                          <span>Sec {d.profiles?.section || '—'}</span>
                        </td>
                        <td className="p-5 font-bold text-foreground">
                          {(d.fine_amount || 0) > 0 ? `₹${d.fine_amount}` : '₹0'}     
                        </td>
                        <td className="p-5">
                          <span className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                            d.status === 'completed' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
                            d.status === 'rejected' ? 'bg-destructive/10 text-destructive' :
                            'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                          }`}>
                            {d.status}
                          </span>
                        </td>
                        <td className="p-5 text-right text-muted-foreground text-sm italic">
                           Managed via Upload
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        <>
          {/* LEVEL 1: DEPARTMENTS GRID */}
          {!selectedDeptId && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-fade-in transition-all">
              {uniqueDepartments.length === 0 ? (
                <div className="col-span-full p-8 text-center text-muted-foreground bg-card rounded-3xl border border-border">No departments found in ledger.</div>
              ) : uniqueDepartments.map(dept => (
                <button
                  key={dept.id}
                  onClick={() => { setSelectedDeptId(dept.id); setSelectedDeptName(dept.name); }}
                  className="bg-card hover:bg-secondary/50 transition-all p-8 rounded-3xl shadow-sm border border-border flex flex-col items-center justify-center gap-4 group"
                >
                  <div className="p-4 bg-emerald-500/10 rounded-2xl group-hover:bg-emerald-500 group-hover:text-white transition-colors text-emerald-500">
                    <Building2 className="w-10 h-10" />
                  </div>
                  <h3 className="text-lg font-bold text-foreground text-center">{dept.name}</h3>
                  <span className="text-sm font-medium text-muted-foreground group-hover:text-foreground transition-colors">
                    {dues.filter(d => d.profiles?.department_id === dept.id).length} Students
                  </span>
                </button>
              ))}
            </div>
          )}

          {/* LEVEL 2: SEMESTERS GRID */}
          {selectedDeptId && !selectedSemesterId && (
            <div className="space-y-4 animate-fade-in transition-all">
              <button 
                onClick={() => { setSelectedDeptId(null); setSelectedSemesterId(null); setSelectedSection(null); }}
                className="flex items-center text-sm font-bold text-muted-foreground hover:text-foreground transition-colors mb-2"
              >
                 <CornerUpLeft className="w-4 h-4 mr-2" /> Back to Departments
              </button>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {uniqueSemesters.length === 0 ? (
                  <div className="col-span-full p-8 text-center text-muted-foreground bg-card rounded-3xl border border-border">No semesters found in this department.</div>
                ) : uniqueSemesters.map(sem => (
                  <button
                    key={sem.id}
                    onClick={() => { setSelectedSemesterId(sem.id); setSelectedSemesterName(sem.name); }}
                    className="bg-card hover:bg-secondary/50 transition-all p-8 rounded-3xl shadow-sm border border-border flex flex-col items-center justify-center gap-4 group relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/10 rounded-bl-full -z-10 group-hover:bg-emerald-500 transition-colors"></div>
                    <BookOpen className="w-8 h-8 text-emerald-500 group-hover:text-white transition-colors" />
                    <h3 className="text-lg font-bold text-foreground text-center">{sem.name}</h3>
                    <span className="text-sm font-medium text-muted-foreground">
                       {dues.filter(d => d.profiles?.department_id === selectedDeptId && d.profiles?.semester_id === sem.id).length} Students
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* LEVEL 3: SECTIONS GRID */}
          {selectedDeptId && selectedSemesterId && !selectedSection && (
            <div className="space-y-4 animate-fade-in transition-all">
              <button 
                onClick={() => { setSelectedSemesterId(null); setSelectedSection(null); }}
                className="flex items-center text-sm font-bold text-muted-foreground hover:text-foreground transition-colors mb-2"
              >
                 <CornerUpLeft className="w-4 h-4 mr-2" /> Back to Semesters
              </button>
              <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {uniqueSections.length === 0 ? (
                  <div className="col-span-full p-8 text-center text-muted-foreground bg-card rounded-3xl border border-border">No sections found.</div>
                ) : uniqueSections.map(sec => (
                  <button
                    key={sec}
                    onClick={() => { setSelectedSection(sec); }}
                    className="bg-card hover:bg-secondary/80 transition-all p-6 rounded-2xl shadow-sm border border-border flex flex-col items-center justify-center gap-3 group"
                  >
                    <Users className="w-6 h-6 text-emerald-500" />
                    <h3 className="text-2xl font-black text-foreground">Sec {sec}</h3>
                    <span className="text-xs font-medium text-muted-foreground uppercase tracking-widest bg-secondary px-2 py-1 rounded-md">
                       {dues.filter(d => d.profiles?.department_id === selectedDeptId && d.profiles?.semester_id === selectedSemesterId && d.profiles?.section === sec).length} Students
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* LEVEL 4: STUDENTS LIST */}
          {selectedDeptId && selectedSemesterId && selectedSection && (
            <div className="space-y-6 animate-fade-in transition-all">
              <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 bg-card p-4 rounded-2xl shadow-sm border border-border">
                <button 
                  onClick={() => { setSelectedSection(null); }}
                  className="flex items-center text-sm font-bold text-muted-foreground hover:text-foreground transition-colors"
                >
                   <CornerUpLeft className="w-4 h-4 mr-2" /> Back to Sections
                </button>
                <div className="relative w-full sm:w-72">
                  <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    type="text"
                    placeholder="Search name or roll no..."
                    className="pl-10 pr-4 py-2 border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-emerald-500 bg-background w-full"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                  />
                </div>
              </div>

              <div className="bg-card rounded-3xl shadow-sm border border-border overflow-hidden">
                {filteredDues.length === 0 ? (
                  <div className="p-8 text-center text-muted-foreground">No matching students found in this section.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-secondary/50 text-foreground text-sm border-b border-border">
                          <th className="p-5 font-semibold">Student Name</th>
                          <th className="p-5 font-semibold">Roll Number</th>
                          <th className="p-5 font-semibold">Due Amount (₹)</th>
                          <th className="p-5 font-semibold">Clearance Status</th>
                          <th className="p-5 font-semibold text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {filteredDues.map(d => (
                          <tr key={d.id} className="hover:bg-secondary/40 transition-colors">
                            <td className="p-5 font-medium text-foreground text-sm sm:text-base">{d.profiles?.full_name || 'Unknown'}</td>
                            <td className="p-5 text-sm text-muted-foreground font-bold tracking-widest">{d.profiles?.roll_number || 'N/A'}</td>
                         <td className="p-5 font-bold text-foreground">
                              <input
                                type="number"
                                min="0"
                                className={`w-28 p-2 border rounded-xl text-sm bg-background focus:ring-2 focus:ring-emerald-500 focus:outline-none font-bold ${
                                  (d.fine_amount || 0) > 0 ? 'border-destructive/50 text-destructive' : 'border-emerald-500/50 text-emerald-600'
                                }`}
                                defaultValue={d.fine_amount || 0}
                                onBlur={e => {
                                  const val = parseInt(e.target.value) || 0;
                                  if (val !== (d.fine_amount || 0)) handleManualFeeUpdate(d.id, val, d.profiles?.full_name || 'Unknown');
                                }}
                              />
                            </td>
                            <td className="p-5">
                              <span className={`px-3 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                                d.status === 'completed' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' :
                                d.status === 'rejected' ? 'bg-destructive/10 text-destructive' :
                                'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                              }`}>
                                {d.status}
                              </span>
                            </td>
                            <td className="p-5 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <button
                                  onClick={() => handleManualFeeUpdate(d.id, 0, d.profiles?.full_name || 'Unknown')}
                                  className="px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-lg transition-colors"
                                >
                                  Clear
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
