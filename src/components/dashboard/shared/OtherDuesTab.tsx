import { useState, useEffect, useRef } from 'react';
import { Search, X, CheckCircle2, Upload, Download, Trash2, Banknote, AlertCircle, Plus } from 'lucide-react';
import { supabase } from '../../../lib/supabase';
import {
  getOtherDuesForDept,
  getOtherDuesGlobal,
  upsertOtherDue,
  modifyOtherDue,
  clearOtherDue,
  deleteOtherDue,
  bulkUpsertOtherDues,
  isFirstYearSem,
} from '../../../lib/api';

interface OtherDuesTabProps {
  departmentId?: string;
  role: 'hod' | 'fyc' | 'admin';
  userId?: string;
}

export default function OtherDuesTab({ departmentId, role, userId }: OtherDuesTabProps) {
  const [dues, setDues] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Modify fine state
  const [modifyId, setModifyId] = useState<string | null>(null);
  const [modifyAmount, setModifyAmount] = useState('');
  const [modifyLoading, setModifyLoading] = useState(false);

  // Clear fine state
  const [clearLoading, setClearLoading] = useState<string | null>(null);

  // CSV upload state
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Success/error messages
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Add Due modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [addUsn, setAddUsn] = useState('');
  const [addAmount, setAddAmount] = useState('');
  const [addRemarks, setAddRemarks] = useState('');
  const [addLoading, setAddLoading] = useState(false);

  const isFycGlobal = role === 'fyc' && !departmentId;
  const isAdminGlobal = role === 'admin';
  const canModify = role === 'hod' || role === 'fyc';
  const canUploadCSV = role === 'hod' || role === 'fyc';

  useEffect(() => {
    fetchDues();
  }, [departmentId, role]);

  const fetchDues = async () => {
    setLoading(true);
    try {
      let data: any[];
      if (departmentId) {
        data = await getOtherDuesForDept(departmentId);
      } else {
        data = await getOtherDuesGlobal();
      }

      // Filter by semester based on role
      const filtered = data.filter((item: any) => {
        const semName = item.profiles?.semesters?.name || '';
        if (role === 'admin') return true;
        if (role === 'hod') return !isFirstYearSem(semName);
        if (role === 'fyc') return isFirstYearSem(semName);
        return true;
      });

      setDues(filtered);
    } catch (err) {
      console.error('Failed to fetch other dues:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleModifyFine = async (dueId: string) => {
    const amt = parseFloat(modifyAmount);
    if (isNaN(amt) || amt < 0) return;
    setModifyLoading(true);
    try {
      await modifyOtherDue(dueId, amt);
      setModifyId(null);
      setModifyAmount('');
      setSuccessMsg('Fine amount updated.');
      setTimeout(() => setSuccessMsg(null), 3000);
      fetchDues();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to modify fine');
      setTimeout(() => setErrorMsg(null), 5000);
    } finally {
      setModifyLoading(false);
    }
  };

  const handleClearFine = async (dueId: string) => {
    if (!confirm('Mark this due as PAID (cash payment)? This will clear the requirement.')) return;
    setClearLoading(dueId);
    try {
      await clearOtherDue(dueId);
      setSuccessMsg('Due marked as paid.');
      setTimeout(() => setSuccessMsg(null), 3000);
      fetchDues();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to clear due');
      setTimeout(() => setErrorMsg(null), 5000);
    } finally {
      setClearLoading(null);
    }
  };

  const handleDeleteDue = async (dueId: string, studentName: string) => {
    if (!confirm(`Delete the due for "${studentName}"? This cannot be undone.`)) return;
    try {
      await deleteOtherDue(dueId);
      setSuccessMsg(`Due for "${studentName}" deleted.`);
      setTimeout(() => setSuccessMsg(null), 3000);
      fetchDues();
    } catch (err: any) {
      setErrorMsg(err.message || 'Failed to delete due');
      setTimeout(() => setErrorMsg(null), 5000);
    }
  };

  const handleAddDue = async () => {
    const usn = addUsn.trim().toUpperCase();
    const amt = parseFloat(addAmount);
    if (!usn) { setErrorMsg('Please enter a valid USN.'); return; }
    if (isNaN(amt) || amt <= 0) { setErrorMsg('Please enter a valid amount greater than 0.'); return; }

    setAddLoading(true);
    try {
      // Look up student by USN
      let query = supabase.from('profiles').select('id, full_name, tenant_id').eq('roll_number', usn).eq('role', 'student');
      if (departmentId) query = query.eq('department_id', departmentId);
      const { data: student, error: lookupErr } = await query.maybeSingle();

      if (lookupErr || !student) {
        setErrorMsg(`Student with USN "${usn}" not found${departmentId ? ' in your department' : ''}.`);
        setAddLoading(false);
        return;
      }

      await upsertOtherDue(student.id, departmentId || null, amt, addRemarks.trim(), userId || '', student.tenant_id);
      setSuccessMsg(`Due of ₹${amt} added for ${student.full_name} (${usn}).`);
      setTimeout(() => setSuccessMsg(null), 5000);
      setShowAddModal(false);
      setAddUsn('');
      setAddAmount('');
      setAddRemarks('');
      fetchDues();
    } catch (err: any) {
      setErrorMsg('Failed to add due: ' + (err.message || 'Unknown error'));
    } finally {
      setAddLoading(false);
    }
  };

  const handleDownloadTemplate = () => {
    const csv = 'USN,Amount,Remarks\n4MT22CS001,500,Lab equipment damage\n4MT22CS002,1000,Library fine\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'other_dues_template.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setUploadResult(null);
    setErrorMsg(null);

    try {
      const text = await file.text();
      const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

      if (lines.length < 2) {
        setErrorMsg('CSV must have a header row and at least one data row.');
        setUploading(false);
        return;
      }

      // Parse header
      const header = lines[0].toLowerCase().replace(/"/g, '');
      const cols = header.split(',').map(c => c.trim());
      const usnIdx = cols.findIndex(c => c === 'usn' || c === 'roll_number' || c === 'roll number');
      const amountIdx = cols.findIndex(c => c === 'amount' || c === 'dues amount' || c === 'dues_amount' || c === 'fine');
      const remarksIdx = cols.findIndex(c => c === 'remarks' || c === 'remark' || c === 'reason');

      if (usnIdx === -1 || amountIdx === -1) {
        setErrorMsg('CSV must have "USN" and "Amount" columns. Optional: "Remarks" column.');
        setUploading(false);
        return;
      }

      // Parse rows
      const records: { usn: string; amount: number; remarks: string }[] = [];
      for (let i = 1; i < lines.length; i++) {
        const vals = lines[i].split(',').map(v => v.trim().replace(/^"|"$/g, ''));
        const usn = vals[usnIdx]?.trim();
        const amount = parseFloat(vals[amountIdx]);
        const remarks = remarksIdx >= 0 ? (vals[remarksIdx] || '') : '';

        if (!usn || isNaN(amount)) {
          continue; // Skip invalid rows
        }
        records.push({ usn, amount, remarks });
      }

      if (records.length === 0) {
        setErrorMsg('No valid rows found in CSV. Check format: USN, Amount, Remarks');
        setUploading(false);
        return;
      }

      // Get tenant_id
      let tenantId: string | null = null;
      if (userId) {
        const { data: prof } = await supabase.from('profiles').select('tenant_id').eq('id', userId).single();
        tenantId = prof?.tenant_id || null;
      }

      const result = await bulkUpsertOtherDues(records, departmentId || null, userId || '', tenantId);

      setUploadResult(result);
      if (result.success > 0) {
        setSuccessMsg(`✅ CSV processed: ${result.success} dues added/updated.`);
        setTimeout(() => setSuccessMsg(null), 8000);
      }
      fetchDues();
    } catch (err: any) {
      setErrorMsg('CSV processing failed: ' + (err.message || 'Unknown error'));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleExportCSV = () => {
    if (dues.length === 0) { alert('No data to export.'); return; }
    const header = 'Student Name,USN,Section,Department,Semester,Amount,Remarks,Status\n';
    const rows = dues.map(d =>
      `"${d.profiles?.full_name || ''}","${d.profiles?.roll_number || ''}","${d.profiles?.section || ''}","${d.profiles?.departments?.name || ''}","${d.profiles?.semesters?.name || ''}",${d.amount},"${d.remarks || ''}","${d.status}"`
    ).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `other_dues_export_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const filtered = dues.filter(d =>
    d.profiles?.full_name?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.profiles?.roll_number?.toLowerCase().includes(searchQuery.toLowerCase()) ||
    d.remarks?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const pendingCount = dues.filter(d => d.status === 'pending').length;
  const paidCount = dues.filter(d => d.status === 'paid').length;
  const totalPending = dues.filter(d => d.status === 'pending').reduce((s, d) => s + (d.amount || 0), 0);

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card rounded-2xl p-5 shadow-sm border border-border">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-amber-500/10 flex items-center justify-center">
              <Banknote className="w-5 h-5 text-amber-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Pending Dues</p>
              <p className="text-2xl font-bold text-amber-600">{pendingCount}</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">₹{totalPending.toLocaleString()} outstanding</p>
        </div>
        <div className="bg-card rounded-2xl p-5 shadow-sm border border-border">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle2 className="w-5 h-5 text-emerald-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Cleared</p>
              <p className="text-2xl font-bold text-emerald-600">{paidCount}</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">Students with no pending dues</p>
        </div>
        <div className="bg-card rounded-2xl p-5 shadow-sm border border-border">
          <div className="flex items-center gap-3 mb-2">
            <div className="w-10 h-10 rounded-xl bg-blue-500/10 flex items-center justify-center">
              <AlertCircle className="w-5 h-5 text-blue-500" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground font-medium">Total Records</p>
              <p className="text-2xl font-bold text-blue-600">{dues.length}</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {role === 'admin' ? 'All departments' : role === 'fyc' ? 'Sem 1 & 2' : 'Your department'}
          </p>
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex flex-col md:flex-row gap-4 justify-between">
        <div className="relative w-full md:max-w-xs">
          <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search by name, USN, or remarks..."
            className="pl-10 pr-4 py-3 bg-card border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500 w-full"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {canModify && (
            <button
              onClick={() => setShowAddModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-violet-500 hover:bg-violet-600 text-white font-bold rounded-xl transition-all text-sm shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Add Due
            </button>
          )}
          {canUploadCSV && (
            <>
              <button
                onClick={handleDownloadTemplate}
                className="flex items-center gap-2 px-4 py-2.5 bg-secondary hover:bg-secondary/80 text-foreground font-medium rounded-xl transition-all text-sm border border-border"
              >
                <Download className="w-4 h-4" />
                Download Template
              </button>
              <label className="flex items-center gap-2 px-4 py-2.5 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl transition-all text-sm cursor-pointer shadow-sm">
                <Upload className="w-4 h-4" />
                {uploading ? 'Processing...' : 'Upload CSV'}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleCSVUpload}
                  disabled={uploading}
                />
              </label>
            </>
          )}
          {dues.length > 0 && (
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl transition-all text-sm shadow-sm"
            >
              <Download className="w-4 h-4" />
              Export CSV
            </button>
          )}
        </div>
      </div>

      {/* Success/Error Messages */}
      {successMsg && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/20 rounded-xl flex items-center gap-2 text-emerald-600 text-sm font-medium">
          <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
          {successMsg}
        </div>
      )}
      {errorMsg && (
        <div className="p-3 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-sm font-medium flex justify-between items-center">
          <span>{errorMsg}</span>
          <button onClick={() => setErrorMsg(null)}><X className="w-4 h-4" /></button>
        </div>
      )}

      {/* Upload Result Details */}
      {uploadResult && (
        <div className="p-4 bg-card border border-border rounded-2xl space-y-2">
          <h4 className="font-bold text-foreground text-sm">CSV Upload Results</h4>
          <div className="flex flex-wrap gap-4 text-sm">
            <span className="text-emerald-600 font-medium">✅ {uploadResult.success} added/updated</span>

            {uploadResult.failed > 0 && <span className="text-destructive font-medium">❌ {uploadResult.failed} failed</span>}
          </div>
          {uploadResult.errors?.length > 0 && (
            <div className="mt-2 max-h-32 overflow-y-auto text-xs text-muted-foreground space-y-1">
              {uploadResult.errors.map((e: string, i: number) => (
                <p key={i} className="text-destructive/80">• {e}</p>
              ))}
            </div>
          )}
          <button onClick={() => setUploadResult(null)} className="text-xs text-muted-foreground hover:text-foreground mt-1">Dismiss</button>
        </div>
      )}

      {/* CSV Format Info */}
      {canUploadCSV && (
        <div className="flex items-start gap-3 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
          <AlertCircle className="w-5 h-5 text-blue-500 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-700 dark:text-blue-300">
            <strong>CSV Format:</strong> USN, Amount, Remarks — Only students listed in the CSV will have dues added or updated. Existing dues are not affected.
          </div>
        </div>
      )}

      {/* Dues Table */}
      <div className="bg-card rounded-3xl shadow-sm border border-border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-muted-foreground animate-pulse">Loading other dues...</div>
        ) : filtered.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            {dues.length === 0 ? 'No other dues found. Upload a CSV or add dues manually.' : 'No results match your search.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-secondary/50 text-foreground text-sm border-b border-border">
                  <th className="p-4 font-semibold">Student Name</th>
                  <th className="p-4 font-semibold">USN</th>
                  <th className="p-4 font-semibold">Section</th>
                  {(isAdminGlobal || isFycGlobal) && <th className="p-4 font-semibold">Department</th>}
                  <th className="p-4 font-semibold text-center">Amount (₹)</th>
                  <th className="p-4 font-semibold">Remarks</th>
                  <th className="p-4 font-semibold text-center">Status</th>
                  {canModify && <th className="p-4 font-semibold text-right">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filtered.map(item => (
                  <tr key={item.id} className="hover:bg-secondary/20 transition-colors">
                    <td className="p-4 font-medium text-foreground">{item.profiles?.full_name || '—'}</td>
                    <td className="p-4 text-sm font-mono text-muted-foreground">{item.profiles?.roll_number || '—'}</td>
                    <td className="p-4">
                      <span className="px-2 py-1 bg-secondary rounded-md text-xs font-medium">{item.profiles?.section || 'None'}</span>
                    </td>
                    {(isAdminGlobal || isFycGlobal) && (
                      <td className="p-4 text-sm text-muted-foreground">{item.profiles?.departments?.name || '—'}</td>
                    )}
                    <td className="p-4 text-center">
                      <span className={`px-3 py-1 rounded-lg font-bold whitespace-nowrap ${item.status === 'paid' ? 'bg-emerald-500/10 text-emerald-600' : 'bg-amber-500/10 text-amber-600'}`}>
                        ₹{item.amount}
                      </span>
                    </td>
                    <td className="p-4 text-sm text-muted-foreground max-w-[200px] truncate" title={item.remarks || ''}>
                      {item.remarks || '—'}
                    </td>
                    <td className="p-4 text-center">
                      {item.status === 'paid' ? (
                        <span className="px-2 py-1 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-600">Paid</span>
                      ) : (
                        <span className="px-2 py-1 rounded-full text-xs font-bold bg-amber-500/10 text-amber-600">Pending</span>
                      )}
                    </td>
                    {canModify && (
                      <td className="p-4 text-right">
                        {modifyId === item.id ? (
                          <div className="flex items-center gap-2 justify-end">
                            <input
                              type="number"
                              min="0"
                              placeholder="₹"
                              className="w-24 p-2 border border-border rounded-xl text-sm bg-background focus:ring-2 focus:ring-amber-500 focus:outline-none font-bold"
                              value={modifyAmount}
                              onChange={e => setModifyAmount(e.target.value)}
                              autoFocus
                            />
                            <button
                              onClick={() => handleModifyFine(item.id)}
                              disabled={modifyLoading}
                              className="px-3 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold rounded-xl transition-colors"
                            >
                              {modifyLoading ? '...' : 'Set'}
                            </button>
                            <button
                              onClick={() => { setModifyId(null); setModifyAmount(''); }}
                              className="px-2 py-2 bg-secondary hover:bg-secondary/80 rounded-xl transition-colors"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 justify-end">
                            <button
                              onClick={() => { setModifyId(item.id); setModifyAmount(String(item.amount || 0)); }}
                              className="px-3 py-2 bg-blue-500/10 text-blue-600 hover:bg-blue-500 hover:text-white text-xs font-bold rounded-xl transition-colors whitespace-nowrap"
                            >
                              Modify Fine
                            </button>
                            {item.status === 'pending' && (
                              <button
                                onClick={() => handleClearFine(item.id)}
                                disabled={clearLoading === item.id}
                                className="px-3 py-2 bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500 hover:text-white text-xs font-bold rounded-xl transition-colors whitespace-nowrap"
                              >
                                {clearLoading === item.id ? '...' : 'Clear Fine'}
                              </button>
                            )}
                            <button
                              onClick={() => handleDeleteDue(item.id, item.profiles?.full_name || 'Unknown')}
                              className="p-2 bg-destructive/10 text-destructive hover:bg-destructive hover:text-white rounded-xl transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {/* Add Due Modal */}
      {showAddModal && canModify && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowAddModal(false)}>
          <div className="bg-card rounded-3xl p-8 shadow-2xl border border-border w-full max-w-md animate-fade-in" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Banknote className="w-5 h-5 text-violet-500" />
                Add Student Due
              </h3>
              <button onClick={() => setShowAddModal(false)} className="p-2 hover:bg-secondary rounded-xl transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-sm font-semibold text-foreground block mb-1.5">Student USN *</label>
                <input
                  type="text"
                  placeholder="e.g. 4MT22CS001"
                  className="w-full p-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 font-mono text-sm"
                  value={addUsn}
                  onChange={e => setAddUsn(e.target.value.toUpperCase())}
                  autoFocus
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-foreground block mb-1.5">Amount (₹) *</label>
                <input
                  type="number"
                  min="1"
                  placeholder="e.g. 500"
                  className="w-full p-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 font-bold text-sm"
                  value={addAmount}
                  onChange={e => setAddAmount(e.target.value)}
                />
              </div>

              <div>
                <label className="text-sm font-semibold text-foreground block mb-1.5">Remarks</label>
                <input
                  type="text"
                  placeholder="e.g. Lab equipment damage, Library fine"
                  className="w-full p-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-violet-500 text-sm"
                  value={addRemarks}
                  onChange={e => setAddRemarks(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  onClick={handleAddDue}
                  disabled={addLoading || !addUsn.trim() || !addAmount}
                  className="flex-1 py-3 bg-violet-500 hover:bg-violet-600 text-white font-bold rounded-xl transition-all shadow-sm disabled:opacity-50 text-sm"
                >
                  {addLoading ? 'Adding...' : 'Add Due'}
                </button>
                <button
                  onClick={() => { setShowAddModal(false); setAddUsn(''); setAddAmount(''); setAddRemarks(''); }}
                  className="px-6 py-3 bg-secondary hover:bg-secondary/80 text-foreground font-medium rounded-xl transition-all text-sm border border-border"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
