import { useState, useEffect } from 'react';
import { getLibraryDues, updateLibraryDue, bulkProcessLibraryDues } from '../lib/api';
import { BookOpen, UserCheck, AlertCircle, Search, Upload, Download, RefreshCw, Save, X } from 'lucide-react';
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
  const [editRemarks, setEditRemarks] = useState<string>('');

  // Alerts
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    fetchDues();
  }, []);

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

  const handleClearDue = async (due: any) => {
    try {
      await updateLibraryDue(due.student_id, false, 0, 'Cleared manually');
      setSuccessMsg(`Cleared dues for ${due.profiles.full_name}`);
      fetchDues();
    } catch (err: any) {
      setErrorMsg(getFriendlyErrorMessage(err));
    }
  };

  const handleSaveDue = async (due: any) => {
    try {
      const hasDues = editAmount > 0;
      const remarksToSave = hasDues && !editRemarks.trim() ? 'Library Fine Pending' : editRemarks;
      await updateLibraryDue(due.student_id, hasDues, editAmount, remarksToSave);
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

  const filteredDues = libraryDues.filter(due => {
    const profile = due.profiles || {};
    const searchLow = searchTerm.toLowerCase();
    return (
      (profile.full_name?.toLowerCase() || '').includes(searchLow) ||
      (profile.roll_number?.toLowerCase() || '').includes(searchLow)
    );
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-in fade-in zoom-in-95 duration-300">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8 bg-card p-6 rounded-3xl shadow-sm border border-border">
        <div>
          <h1 className="text-3xl font-extrabold text-foreground tracking-tight flex items-center gap-3">
            <BookOpen className="w-8 h-8 text-primary p-1.5 bg-primary/10 rounded-xl" />
            Library Dues
          </h1>
          <p className="text-muted-foreground mt-2">Manage student textbook returns and library fines.</p>
        </div>

        {/* Global Search */}
        <div className="relative w-full md:w-72 mt-4 md:mt-0">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search USN or Name..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-10 pr-4 py-3 bg-secondary/50 border border-border rounded-xl focus:ring-2 focus:ring-primary focus:outline-none transition-all shadow-sm font-medium"
          />
        </div>
      </div>

      {successMsg && (
        <div className="mb-6 p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-2xl flex items-center justify-between">
          <div className="flex items-center text-emerald-600 dark:text-emerald-400 font-medium tracking-wide">
            <UserCheck className="w-5 h-5 mr-3 flex-shrink-0" />
            {successMsg}
          </div>
          <button onClick={() => setSuccessMsg(null)}><X className="w-5 h-5 opacity-50 hover:opacity-100 transition-opacity" /></button>
        </div>
      )}

      {errorMsg && (
        <div className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl flex items-center justify-between">
          <div className="flex items-center text-red-600 dark:text-red-400 font-medium tracking-wide">
            <AlertCircle className="w-5 h-5 mr-3 flex-shrink-0" />
            {errorMsg}
          </div>
          <button onClick={() => setErrorMsg(null)}><X className="w-5 h-5 opacity-50 hover:opacity-100 transition-opacity" /></button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* Main List */}
        <div className="lg:col-span-3 bg-card border border-border rounded-3xl shadow-sm overflow-hidden flex flex-col min-h-[500px]">
          <div className="p-6 border-b border-border bg-secondary/30 flex justify-between items-center">
            <h2 className="font-bold text-lg text-foreground">Clearance List</h2>
            <button onClick={fetchDues} disabled={loading} className="p-2 text-muted-foreground hover:text-primary transition-colors hover:bg-primary/10 rounded-xl">
              <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="overflow-x-auto flex-1">
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
                {loading && libraryDues.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center p-12 text-muted-foreground animate-pulse">Scanning records...</td>
                  </tr>
                ) : filteredDues.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center p-12 text-muted-foreground">No students found.</td>
                  </tr>
                ) : (
                  filteredDues.map((due) => (
                    <tr key={due.id} className={`transition-colors py-2 ${editingDueId === due.id ? 'bg-indigo-50 dark:bg-indigo-900/10' : 'hover:bg-secondary/20'}`}>
                      <td className="p-4">
                        <div className="font-bold text-foreground text-[15px]">{due.profiles?.full_name}</div>
                        <div className="text-xs text-muted-foreground font-mono mt-0.5 tracking-wider">{due.profiles?.roll_number}</div>
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
                              <input 
                                type="number" 
                                min="0" 
                                value={editAmount}
                                onChange={e => setEditAmount(parseFloat(e.target.value) || 0)}
                                className="w-full pl-7 pr-3 py-1.5 text-sm border border-border rounded-lg bg-background focus:ring-2 focus:ring-primary focus:outline-none"
                              />
                            </div>
                            <input 
                              type="text" 
                              placeholder="Reason (e.g. Lost Book)" 
                              value={editRemarks}
                              onChange={e => setEditRemarks(e.target.value)}
                              className="w-full px-3 py-1.5 text-sm border border-border rounded-lg bg-background focus:ring-2 focus:ring-primary focus:outline-none"
                            />
                          </div>
                        ) : (
                          <div>
                            <div className="font-semibold text-foreground text-sm flex items-center">
                              {due.fine_amount > 0 ? `₹${due.fine_amount}` : '-'}
                              {due.fine_amount > 0 && due.has_dues && <AlertCircle className="w-4 h-4 ml-2 text-amber-500 inline-block" />}
                            </div>
                            {due.remarks && <div className="text-xs text-muted-foreground mt-0.5 italic">{due.remarks}</div>}
                          </div>
                        )}
                      </td>

                      <td className="p-4 text-right">
                        {editingDueId === due.id ? (
                          <div className="flex justify-end gap-2">
                            <button onClick={() => handleSaveDue(due)} className="p-1.5 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors" title="Save">
                              <Save className="w-4 h-4" />
                            </button>
                            <button onClick={() => setEditingDueId(null)} className="p-1.5 bg-secondary text-foreground rounded-lg hover:bg-border transition-colors" title="Cancel">
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex justify-end items-center gap-3">
                            <button 
                              onClick={() => {
                                setEditingDueId(due.id);
                                setEditAmount(due.fine_amount || 0);
                                setEditRemarks(due.remarks || '');
                              }}
                              className="text-sm font-medium text-primary hover:text-primary/70 transition-colors hover:underline"
                            >
                              Edit
                            </button>
                            {due.has_dues && (
                              <button 
                                onClick={() => handleClearDue(due)}
                                className="px-4 py-1.5 bg-emerald-500 text-white rounded-xl shadow-sm shadow-emerald-500/20 hover:bg-emerald-600 transition-all font-bold text-sm tracking-wide active:scale-95"
                              >
                                Clear No-Dues
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Sidebar */}
        <div className="space-y-6">
          
          <div className="bg-card border border-border rounded-3xl p-6 shadow-sm overflow-hidden relative">
            <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-bl-full pointer-events-none"></div>
            <h3 className="font-bold text-lg text-foreground mb-4">Bulk Upload</h3>
            <p className="text-sm text-muted-foreground mb-6">Upload an export from legacy software to batch update fines instantly.</p>
            
            <input 
              type="file" 
              accept=".csv" 
              className="hidden" 
              id="csv-upload" 
              onChange={(e) => setCsvFile(e.target.files?.[0] || null)}
            />
            
            <label 
              htmlFor="csv-upload" 
              className={`flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-2xl cursor-pointer transition-all ${csvFile ? 'border-primary bg-primary/5 text-primary' : 'border-border text-muted-foreground hover:bg-secondary/50 hover:border-primary/50'}`}
            >
              <Upload className={`w-8 h-8 mb-3 ${csvFile ? 'text-primary' : 'text-muted-foreground'}`} />
              <span className="font-medium text-[15px]">{csvFile ? csvFile.name : 'Select CSV File'}</span>
              {!csvFile && <span className="text-xs mt-1">Drag and drop or click</span>}
            </label>

            {csvFile && (
               <button 
                onClick={handleCsvUpload} 
                disabled={csvProcessing}
                className="w-full mt-4 bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-3 px-4 rounded-xl shadow-md disabled:opacity-50 transition-all active:scale-[0.98]"
              >
                {csvProcessing ? 'Processing File...' : 'Upload & Process'}
              </button>
            )}

            <button onClick={downloadTemplate} className="w-full mt-4 flex justify-center items-center gap-2 text-sm text-primary hover:underline font-medium">
              <Download className="w-4 h-4" /> Download Template
            </button>
          </div>

        </div>

      </div>
    </div>
  );
}
