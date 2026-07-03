import { useState, useEffect, useMemo } from 'react';
import { supabase } from '../../../lib/supabase';
import { useAuth } from '../../../lib/useAuth';
import { Search, ChevronRight, ChevronDown, Globe, Users, Activity, X, CheckCircle2 } from 'lucide-react';

type OEStudent = {
  id: string;
  student_id: string;
  subject_id: string;
  attendance_pct: number | null;
  assignment_status: string | null;
  profiles: { full_name: string; roll_number: string | null; section: string | null; semester_id: string | null; department_id: string | null; departments?: { name: string } | null; semesters?: { name: string } | null } | null;
  subjects: { subject_name: string; subject_code: string; subject_type: string | null } | null;
};

type OELog = {
  id: string;
  action: string;
  actor_name: string | null;
  student_name: string | null;
  subject_name: string | null;
  old_value: string | null;
  new_value: string | null;
  details: string | null;
  created_at: string;
};

export default function OEDashboard() {
  const { profile } = useAuth();
  const [activeSubTab, setActiveSubTab] = useState<'students' | 'logs'>('students');
  const [oeStudents, setOEStudents] = useState<OEStudent[]>([]);
  const [oeLogs, setOELogs] = useState<OELog[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedBranches, setExpandedBranches] = useState<Set<string>>(new Set());
  const [expandedSems, setExpandedSems] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editPct, setEditPct] = useState('');
  const [saving, setSaving] = useState(false);

  const fetchOEData = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('subject_enrollment')
        .select('id, student_id, subject_id, attendance_pct, assignment_status, profiles!subject_enrollment_student_id_fkey(full_name, roll_number, section, semester_id, department_id, departments!profiles_department_id_fkey(name), semesters(name)), subjects(subject_name, subject_code, subject_type)')
        .eq('subjects.subject_type', 'open_elective')
        .order('created_at', { ascending: false });
      if (error) throw error;
      // Filter to only OE subjects (PostgREST inner filter may not work on joined table)
      const filtered = (data || []).filter((d: any) => d.subjects?.subject_type === 'open_elective');
      setOEStudents(filtered as unknown as OEStudent[]);
    } catch (err) { console.error('OE fetch error:', err); }
    setLoading(false);
  };

  const fetchLogs = async () => {
    try {
      const { data, error } = await supabase
        .from('oe_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(200);
      if (error) throw error;
      setOELogs(data || []);
    } catch (err) { console.error('OE logs error:', err); }
  };

  useEffect(() => { fetchOEData(); fetchLogs(); }, []);

  const handleSaveAttendance = async (enrollmentId: string) => {
    setSaving(true);
    try {
      const pct = parseFloat(editPct);
      if (isNaN(pct) || pct < 0 || pct > 100) throw new Error('Invalid percentage');
      const { error } = await supabase.from('subject_enrollment').update({ attendance_pct: pct }).eq('id', enrollmentId);
      if (error) throw error;

      // Log the change
      const student = oeStudents.find(s => s.id === enrollmentId);
      await supabase.from('oe_logs').insert({
        action: 'attendance_edit',
        actor_id: profile?.id,
        actor_name: profile?.full_name,
        student_id: student?.student_id,
        student_name: student?.profiles?.full_name,
        subject_id: student?.subject_id,
        subject_name: student?.subjects?.subject_name,
        old_value: String(student?.attendance_pct ?? 0),
        new_value: String(pct),
        tenant_id: profile?.tenant_id,
      });

      setEditingId(null);
      fetchOEData();
      fetchLogs();
    } catch (err: any) { alert(err.message); }
    setSaving(false);
  };

  // Group: Branch → Semester → Section → Students
  const grouped = useMemo(() => {
    const filtered = oeStudents.filter(s => {
      if (!searchTerm) return true;
      const term = searchTerm.toLowerCase();
      return (s.profiles?.full_name?.toLowerCase().includes(term) || s.profiles?.roll_number?.toLowerCase().includes(term) || s.subjects?.subject_name?.toLowerCase().includes(term));
    });

    const result: Record<string, Record<string, Record<string, OEStudent[]>>> = {};
    filtered.forEach(s => {
      const branch = s.profiles?.departments?.name || 'Unknown Branch';
      const sem = s.profiles?.semesters?.name || 'Unknown Semester';
      const sec = s.profiles?.section || 'Unknown';
      if (!result[branch]) result[branch] = {};
      if (!result[branch][sem]) result[branch][sem] = {};
      if (!result[branch][sem][sec]) result[branch][sem][sec] = [];
      result[branch][sem][sec].push(s);
    });
    return result;
  }, [oeStudents, searchTerm]);

  const toggleBranch = (b: string) => {
    const next = new Set(expandedBranches);
    next.has(b) ? next.delete(b) : next.add(b);
    setExpandedBranches(next);
  };

  const toggleSem = (key: string) => {
    const next = new Set(expandedSems);
    next.has(key) ? next.delete(key) : next.add(key);
    setExpandedSems(next);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-card rounded-3xl p-8 shadow-sm border border-border">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-3">
              <Globe className="w-6 h-6 text-violet-500" />
              Open Elective Dashboard
            </h2>
            <p className="text-sm text-muted-foreground mt-1">Manage OE student attendance across all branches and semesters.</p>
          </div>
          <div className="flex items-center gap-2">
            <span className="px-4 py-2 bg-violet-500/10 text-violet-600 rounded-xl text-sm font-bold">{oeStudents.length} OE Students</span>
          </div>
        </div>

        {/* Sub-tabs */}
        <div className="flex gap-2 mt-6">
          <button onClick={() => setActiveSubTab('students')} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium transition-all ${activeSubTab === 'students' ? 'bg-violet-500 text-white shadow-md' : 'bg-secondary text-muted-foreground hover:bg-secondary/80'}`}>
            <Users className="w-4 h-4" /> Students
          </button>
          <button onClick={() => setActiveSubTab('logs')} className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium transition-all ${activeSubTab === 'logs' ? 'bg-violet-500 text-white shadow-md' : 'bg-secondary text-muted-foreground hover:bg-secondary/80'}`}>
            <Activity className="w-4 h-4" /> Logs
          </button>
        </div>
      </div>

      {/* Students Tab */}
      {activeSubTab === 'students' && (
        <div className="bg-card rounded-3xl shadow-sm border border-border overflow-hidden">
          <div className="p-5 border-b border-border">
            <div className="relative max-w-sm">
              <Search className="w-5 h-5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input type="text" placeholder="Search students, subjects..." className="pl-10 pr-4 py-3 bg-background border border-border rounded-xl w-full focus:outline-none focus:ring-2 focus:ring-violet-500" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
          </div>

          {loading ? (
            <div className="p-8 text-center text-muted-foreground animate-pulse">Loading OE students...</div>
          ) : Object.keys(grouped).length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Globe className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No Open Elective students found.</p>
              <p className="text-xs mt-1">OE subjects must be created first by a DEO.</p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {Object.entries(grouped).sort(([a],[b]) => a.localeCompare(b)).map(([branch, sems]) => (
                <div key={branch}>
                  <button onClick={() => toggleBranch(branch)} className="w-full flex items-center gap-3 p-5 text-left hover:bg-secondary/20 transition-colors">
                    {expandedBranches.has(branch) ? <ChevronDown className="w-5 h-5 text-violet-500" /> : <ChevronRight className="w-5 h-5 text-muted-foreground" />}
                    <h3 className="text-lg font-bold text-foreground">{branch}</h3>
                    <span className="text-xs text-muted-foreground ml-auto">{Object.values(sems).reduce((t, sections) => t + Object.values(sections).reduce((t2, arr) => t2 + arr.length, 0), 0)} students</span>
                  </button>
                  {expandedBranches.has(branch) && (
                    <div className="pl-6 pb-4 space-y-2">
                      {Object.entries(sems).sort(([a],[b]) => a.localeCompare(b, undefined, {numeric: true})).map(([sem, sections]) => {
                        const semKey = `${branch}-${sem}`;
                        return (
                          <div key={semKey} className="border border-border rounded-xl overflow-hidden ml-4">
                            <button onClick={() => toggleSem(semKey)} className="w-full flex items-center gap-3 p-4 text-left hover:bg-secondary/10 transition-colors">
                              {expandedSems.has(semKey) ? <ChevronDown className="w-4 h-4 text-violet-500" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                              <span className="font-bold text-foreground">{sem}</span>
                            </button>
                            {expandedSems.has(semKey) && (
                              <div className="border-t border-border">
                                {Object.entries(sections).sort(([a],[b]) => a.localeCompare(b)).map(([sec, students]) => (
                                  <div key={sec}>
                                    <div className="px-5 py-2 bg-secondary/30 text-sm font-bold text-foreground">Section: {sec} ({students.length})</div>
                                    <table className="w-full text-left">
                                      <thead>
                                        <tr className="bg-background text-xs border-b border-border">
                                          <th className="p-3 font-semibold">#</th>
                                          <th className="p-3 font-semibold">Student</th>
                                          <th className="p-3 font-semibold">Roll No</th>
                                          <th className="p-3 font-semibold">Subject</th>
                                          <th className="p-3 font-semibold text-center">Attendance</th>
                                          <th className="p-3 font-semibold text-center">Assignment</th>
                                        </tr>
                                      </thead>
                                      <tbody className="divide-y divide-border">
                                        {students.map((s, idx) => (
                                          <tr key={s.id} className="hover:bg-secondary/10">
                                            <td className="p-3 text-sm text-muted-foreground">{idx+1}</td>
                                            <td className="p-3 font-medium text-sm">{s.profiles?.full_name}</td>
                                            <td className="p-3 text-xs font-mono text-muted-foreground">{s.profiles?.roll_number || '—'}</td>
                                            <td className="p-3 text-xs text-muted-foreground">{s.subjects?.subject_code}</td>
                                            <td className="p-3 text-center">
                                              {editingId === s.id ? (
                                                <div className="flex items-center gap-1 justify-center">
                                                  <input type="number" min="0" max="100" value={editPct} onChange={e => setEditPct(e.target.value)} className="w-16 px-2 py-1 text-sm bg-background border border-border rounded-lg text-center" />
                                                  <button onClick={() => handleSaveAttendance(s.id)} disabled={saving} className="p-1 rounded bg-emerald-500 text-white hover:bg-emerald-600"><CheckCircle2 className="w-3.5 h-3.5" /></button>
                                                  <button onClick={() => setEditingId(null)} className="p-1 rounded bg-secondary hover:bg-secondary/80"><X className="w-3.5 h-3.5" /></button>
                                                </div>
                                              ) : (
                                                <button onClick={() => { setEditingId(s.id); setEditPct(String(s.attendance_pct ?? 0)); }} className={`px-3 py-1 rounded-full text-xs font-bold ${(s.attendance_pct ?? 0) < 85 ? 'bg-red-500/15 text-red-600' : 'bg-emerald-500/15 text-emerald-600'}`}>
                                                  {s.attendance_pct ?? 0}%
                                                </button>
                                              )}
                                            </td>
                                            <td className="p-3 text-center">
                                              <span className={`px-3 py-1 rounded-full text-xs font-bold ${s.assignment_status === 'pending' ? 'bg-amber-500/15 text-amber-600' : 'bg-emerald-500/15 text-emerald-600'}`}>
                                                {s.assignment_status === 'pending' ? 'Pending' : 'Submitted'}
                                              </span>
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Logs Tab */}
      {activeSubTab === 'logs' && (
        <div className="bg-card rounded-3xl shadow-sm border border-border overflow-hidden">
          <div className="p-5 border-b border-border">
            <h3 className="text-lg font-bold text-foreground flex items-center gap-2"><Activity className="w-5 h-5 text-violet-500" /> OE Activity Logs</h3>
          </div>
          {oeLogs.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No OE activity logs yet.</div>
          ) : (
            <div className="divide-y divide-border max-h-[60vh] overflow-y-auto">
              {oeLogs.map(log => (
                <div key={log.id} className="p-4 hover:bg-secondary/10 transition-colors">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="px-2 py-0.5 rounded-full text-xs font-bold bg-violet-500/10 text-violet-600 mr-2">{log.action.replace(/_/g, ' ')}</span>
                      <span className="text-sm text-foreground font-medium">{log.actor_name || 'System'}</span>
                    </div>
                    <span className="text-xs text-muted-foreground">{new Date(log.created_at).toLocaleString()}</span>
                  </div>
                  {log.details && <p className="text-sm text-muted-foreground mt-1">{log.details}</p>}
                  {log.student_name && <p className="text-xs text-muted-foreground mt-0.5">Student: {log.student_name} | Subject: {log.subject_name || '—'}</p>}
                  {log.old_value && <p className="text-xs text-muted-foreground">Changed: {log.old_value} → {log.new_value}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
