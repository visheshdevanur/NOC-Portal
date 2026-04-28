import { useState, useEffect, useCallback, useMemo, useRef, memo } from 'react';
import { useAuth } from '../../lib/useAuth';
import { 
  getStudentClearanceRequest, 
  getStudentSubjects, 
  getStudentDues, 
  submitClearanceRequest,
  getStudentIAAttendance,
  getStudentLibraryDues
} from '../../lib/api';
import { CheckCircle2, Clock, XCircle, AlertCircle, BookOpen, Building2, UserCog, RefreshCw, Hand, ShieldCheck, GraduationCap, Eye, User, Hash, Layers, MapPin } from 'lucide-react';
import { supabase } from '../../lib/supabase';

type ClearanceRequest = {
  id: string;
  student_id: string;
  current_stage: string;
  status: string;
  remarks: string | null;
  created_at: string;
  updated_at: string;
};
type SubjectEnrollment = {
  id: string;
  student_id: string;
  subject_id: string;
  teacher_id: string;
  status: string;
  attendance_pct: number | null;
  remarks: string | null;
  created_at: string;
  updated_at: string;
  subjects: { subject_name: string; subject_code: string; exam_date: string | null; exam_time: string | null };
  profiles: { full_name: string } | null;
};
type StudentDues = {
  id: string;
  student_id: string;
  fine_amount: number | null;
  status: string;
  updated_at: string;
};

type IAAttendanceRecord = {
  id: string;
  student_id: string;
  subject_id: string;
  ia_number: number;
  is_present: boolean;
  subjects: { subject_name: string; subject_code: string } | null;
};

export default function StudentDashboard() {
  const { user, profile } = useAuth();
  const [request, setRequest] = useState<ClearanceRequest | null>(null);
  const [enrollments, setEnrollments] = useState<SubjectEnrollment[]>([]);
  const [deptClearances, setDeptClearances] = useState<StudentDues[]>([]);
  const [availableSubjects, setAvailableSubjects] = useState<any[]>([]);
  const [selectedSubjects, setSelectedSubjects] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [hallTemplate, setHallTemplate] = useState<any>(null);
  const [iaRecords, setIaRecords] = useState<IAAttendanceRecord[]>([]);
  const [libraryDue, setLibraryDue] = useState<any>(null);
  const [departmentName, setDepartmentName] = useState<string>('N/A');
  const [semesterName, setSemesterName] = useState<string>('N/A');
  const [showReportModal, setShowReportModal] = useState(false);
  const [payingEnrollmentId, setPayingEnrollmentId] = useState<string | null>(null);
  const [paymentReceipt, setPaymentReceipt] = useState<any>(null);

  // Load Razorpay Script
  useEffect(() => {
    const script = document.createElement('script');
    script.src = 'https://checkout.razorpay.com/v1/checkout.js';
    script.async = true;
    document.body.appendChild(script);
    return () => { document.body.removeChild(script); };
  }, []);

  // Debounce realtime refetches to avoid cascading re-renders
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debouncedFetch = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => fetchStudentData(), 300);
  }, []);

  useEffect(() => {
    if (user) {
      fetchStudentData();
      
      // Setup Realtime Subscription with debounced handler
      const channel = supabase.channel('student-dashboard')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'clearance_requests', filter: `student_id=eq.${user.id}` }, debouncedFetch)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'subject_enrollment', filter: `student_id=eq.${user.id}` }, debouncedFetch)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'student_dues', filter: `student_id=eq.${user.id}` }, debouncedFetch)
        .subscribe();

      return () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        supabase.removeChannel(channel);
      }
    }
  }, [user, profile?.semester_id]);

  const fetchStudentData = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      if (!user) return;

      // Execute all independent database queries simultaneously in a single network round-trip.
      const [req, deptRes, semRes, subsDataRes, subs, depts, templateRes, iaData, libData] = await Promise.all([
        getStudentClearanceRequest(user.id),
        profile?.department_id ? supabase.from('departments').select('name').eq('id', profile.department_id).single() : Promise.resolve({ data: null }),
        profile?.semester_id ? supabase.from('semesters').select('name').eq('id', profile.semester_id).single() : Promise.resolve({ data: null }),
        profile?.semester_id ? supabase.from('subjects').select('*').eq('semester_id', profile.semester_id) : Promise.resolve({ data: null }),
        getStudentSubjects(user.id),
        getStudentDues(user.id),
        supabase.from('hall_ticket_templates').select('*').limit(1).single(),
        getStudentIAAttendance(user.id),
        getStudentLibraryDues(user.id)
      ]);

      setRequest(req);
      
      if (deptRes.data) setDepartmentName(deptRes.data.name);
      if (semRes.data) setSemesterName(semRes.data.name);
      if (!req && subsDataRes.data) setAvailableSubjects(subsDataRes.data);
      if (templateRes.data) setHallTemplate(templateRes.data);
      setIaRecords((iaData || []) as unknown as IAAttendanceRecord[]);
      setLibraryDue(libData || null);
      
      if (req) {
        setEnrollments(subs as unknown as SubjectEnrollment[]);
        setDeptClearances(depts as any[]);
      }
    } catch (error: any) {
      console.error('Error fetching student data:', error);
      setErrorMsg(error?.message || 'Failed to fetch data');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyForClearance = async () => {
    if (selectedSubjects.length === 0) {
      setErrorMsg('Please select at least one subject to apply for clearance.');
      return;
    }

    setApplying(true);
    setErrorMsg(null);
    try {
      // Step 1: Create the clearance request
      const reqResult = await submitClearanceRequest(user!.id);
      console.log('Clearance request created:', reqResult);
      
      // Step 2: Create subject enrollments (WITHOUT teacher_id initially)
      const enrollInserts: any[] = selectedSubjects.map(subId => ({
        student_id: user!.id,
        subject_id: subId,
        teacher_id: null,
        attendance_pct: Math.floor(Math.random() * 30) + 70, // Mock attendance for demo
        status: 'pending',
        remarks: null
      }));
      
      const { error: enrollError } = await supabase.from('subject_enrollment').insert(enrollInserts as any);
      if (enrollError) {
        console.error('Enrollment insert error:', enrollError);
      }

      await fetchStudentData();
    } catch (err: any) {
      console.error("Failed to apply for clearance", err);
      setErrorMsg(err?.message || 'Failed to initialize workflow.');
    } finally {
      setApplying(false);
    }
  };

  const handleRazorpayPayment = async (enrollment: any) => {
    try {
      setPayingEnrollmentId(enrollment.id);
      setErrorMsg(null);
      const { createRazorpayOrder, verifyAndProcessRazorpayPayment } = await import('../../lib/api');
      
      const order = await createRazorpayOrder(enrollment.attendance_fee, enrollment.id);
      
      const options = {
        key: 'rzp_test_YourTestKeyHere', // For demo purposes; in prod use env variable
        amount: Math.round(enrollment.attendance_fee * 100),
        currency: "INR",
        name: "NOC Portal",
        description: `Attendance Due: ${enrollment.subjects?.subject_name}`,
        order_id: order.id,
        handler: async function (response: any) {
          try {
            await verifyAndProcessRazorpayPayment(
              enrollment.id,
              response.razorpay_order_id,
              response.razorpay_payment_id,
              response.razorpay_signature
            );
            setPaymentReceipt({
              amount: enrollment.attendance_fee,
              subject: enrollment.subjects?.subject_name,
              paymentId: response.razorpay_payment_id,
              date: new Date().toLocaleString()
            });
            fetchStudentData(); // Refresh to update status
          } catch (err: any) {
            setErrorMsg("Payment verification failed: " + err.message);
          }
        },
        prefill: {
          name: profile?.full_name || "",
          email: user?.email || "",
        },
        theme: {
          color: "#f59e0b" // amber-500
        }
      };

      const rzp = new (window as any).Razorpay(options);
      rzp.on('payment.failed', function (response: any){
        setErrorMsg(`Payment failed: ${response.error.description}`);
      });
      rzp.open();
    } catch (err: any) {
      setErrorMsg("Error initiating payment: " + err.message);
    } finally {
      setPayingEnrollmentId(null);
    }
  };

  useEffect(() => {
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen') {
        navigator.clipboard.writeText(''); // Attempt to clear clipboard
        alert('Screenshots are disabled for security reasons.');
      }
    };
    
    // Also listen to visibility change
    const handleVisibilityChange = () => {
      if (document.hidden && showReportModal) {
        setShowReportModal(false);
      }
    };

    window.addEventListener('keyup', handleKeyUp);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('blur', handleVisibilityChange);
    
    return () => {
      window.removeEventListener('keyup', handleKeyUp);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('blur', handleVisibilityChange);
    };
  }, [showReportModal]);

  const isHodApproved = request?.current_stage === 'cleared';
  const allFacultyCleared = useMemo(() => enrollments.length > 0 && enrollments.every(e => e.status === 'completed'), [enrollments]);
  const allLibraryCleared = useMemo(() => libraryDue ? !libraryDue.has_dues : true, [libraryDue]);
  const allDeptCleared = useMemo(() => deptClearances.length > 0 && deptClearances.every(d => d.status === 'completed'), [deptClearances]);
  
  const pendingAttendanceDues = useMemo(() => enrollments.filter(e => (e as any).attendance_fee > 0 && !(e as any).attendance_fee_verified), [enrollments]);

  // Check IA eligibility: for each subject that has IA records, student must have >= 2 present
  const { allIAEligible } = useMemo(() => {
    const bySubject: Record<string, { present: number; total: number }> = {};
    iaRecords.forEach(r => {
      if (!bySubject[r.subject_id]) bySubject[r.subject_id] = { present: 0, total: 0 };
      bySubject[r.subject_id].total++;
      if (r.is_present) bySubject[r.subject_id].present++;
    });
    const ids = Object.keys(bySubject);
    const eligible = ids.length === 0 || ids.every(sid => bySubject[sid].present >= 2);
    return { allIAEligible: eligible };
  }, [iaRecords]);
  const canDownloadHallTicket = isHodApproved && allIAEligible;

  if (loading) return <div className="animate-pulse flex flex-col gap-6">
    <div className="h-48 bg-card rounded-2xl w-full"></div>
    <div className="h-64 bg-card rounded-2xl w-full"></div>
  </div>;

  // Student Info Card Component (shared between both views)
  const StudentInfoCard = () => (
    <div className="bg-card rounded-3xl p-6 shadow-sm border border-border relative overflow-hidden">
      <div className="absolute top-0 left-0 w-2 h-full bg-primary"></div>
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-lg font-bold text-foreground mb-3 flex items-center gap-2">
            <User className="w-5 h-5 text-primary" />
            Student Information
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary/10 rounded-lg flex items-center justify-center">
                <User className="w-4 h-4 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Name</p>
                <p className="text-sm font-bold text-foreground">{profile?.full_name || 'N/A'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-violet-500/10 rounded-lg flex items-center justify-center">
                <Hash className="w-4 h-4 text-violet-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">USN</p>
                <p className="text-sm font-bold text-foreground font-mono">{(profile as any)?.roll_number || 'N/A'}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-emerald-500/10 rounded-lg flex items-center justify-center">
                <Building2 className="w-4 h-4 text-emerald-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Department</p>
                <p className="text-sm font-bold text-foreground">{departmentName}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-amber-500/10 rounded-lg flex items-center justify-center">
                <Layers className="w-4 h-4 text-amber-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground font-medium">Semester</p>
                <p className="text-sm font-bold text-foreground">Semester {semesterName}</p>
              </div>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-blue-500/10 rounded-lg flex items-center justify-center">
            <MapPin className="w-4 h-4 text-blue-500" />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium">Section</p>
            <span className={`inline-block px-3 py-1 rounded-full text-xs font-bold ${(profile as any)?.section ? 'bg-emerald-500/10 text-emerald-600' : 'bg-secondary text-muted-foreground'}`}>
              {(profile as any)?.section || 'Unassigned'}
            </span>
          </div>
        </div>
      </div>
    </div>
  );

  if (!request) {
    return (
      <div className="space-y-6">
        <StudentInfoCard />
        <div className="max-w-4xl mx-auto bg-card p-10 rounded-3xl shadow-xl border border-border flex flex-col items-center text-center">
           <div className="w-24 h-24 bg-primary/10 rounded-full flex items-center justify-center mb-6">
             <Hand className="w-12 h-12 text-primary" />
           </div>
           <h1 className="text-3xl font-bold text-foreground mb-4">Welcome to NOC Clearance</h1>
           <p className="text-muted-foreground text-lg mb-8 max-w-xl">
             You have not initiated your clearance pipeline yet. Hit the button below to formally apply for clearance.
           </p>
           {errorMsg && (
              <div className="mb-6 p-4 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-sm w-full max-w-lg">
                <strong>Error:</strong> {errorMsg}
              </div>
            )}
           <div className="w-full max-w-lg mb-8 text-left">
              <h3 className="font-semibold text-lg mb-3">Select your enrolled subjects:</h3>
              <div className="bg-background rounded-xl border border-border p-4 space-y-3 max-h-64 overflow-y-auto">
                {availableSubjects.map(sub => (
                  <label key={sub.id} className="flex items-center gap-3 p-2 hover:bg-secondary rounded-lg cursor-pointer transition-colors">
                    <input 
                      type="checkbox" 
                      className="w-5 h-5 rounded border-border text-primary focus:ring-primary"
                      checked={selectedSubjects.includes(sub.id)}
                      onChange={(e) => {
                        if (e.target.checked) setSelectedSubjects([...selectedSubjects, sub.id]);
                        else setSelectedSubjects(selectedSubjects.filter(id => id !== sub.id));
                      }}
                    />
                    <span><span className="font-bold text-primary">{sub.subject_code}</span> - {sub.subject_name}</span>
                  </label>
                ))}
                {availableSubjects.length === 0 && <p className="text-muted-foreground text-sm text-center">No subjects available to select.</p>}
              </div>
            </div>

           <button 
              onClick={handleApplyForClearance}
              disabled={applying || selectedSubjects.length === 0}
              className="bg-primary hover:bg-primary/90 text-primary-foreground font-bold py-4 px-8 rounded-xl text-lg shadow-md transition-all hover:scale-105 disabled:opacity-50 disabled:hover:scale-100 disabled:cursor-not-allowed"
            >
              {applying ? 'Initializing System...' : 'Apply for Clearance'}
            </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8 fade-in">
      {/* Student Info Card */}
      <StudentInfoCard />
      {/* Error Display */}
      {errorMsg && (
        <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-sm">
          <strong>Error:</strong> {errorMsg}
        </div>
      )}

      {/* Header Section */}
      <div className="bg-card rounded-3xl p-8 shadow-sm border border-border flex flex-col md:flex-row justify-between items-start md:items-center gap-6 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-2 h-full bg-primary"></div>
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2 tracking-tight">Student Dashboard</h1>
          <p className="text-muted-foreground text-lg">Track your No-Due clearance progress here.</p>
          {request.status === 'rejected' && (
            <div className="mt-4 inline-flex items-center gap-2 bg-destructive/10 text-destructive px-4 py-2 rounded-lg font-medium border border-destructive/20">
              <AlertCircle size={18} />
              Clearance has been rejected. Please review remarks and contact respective staff.
            </div>
          )}
        </div>
        
        {/* Clearance Report View */}
        <div className={`p-6 rounded-2xl border-2 transition-all flex flex-col sm:flex-row items-start sm:items-center gap-4 ${canDownloadHallTicket ? "bg-emerald-500/10 border-emerald-500/30" : "bg-secondary border-border"}`}>
          <div className="flex-1">
            <h3 className="font-semibold text-foreground text-lg">No Due Clearance Report</h3>
            <p className={`text-sm ${canDownloadHallTicket ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
              {canDownloadHallTicket
                ? 'Ready to view'
                : !isHodApproved
                  ? 'Requires Final Approval'
                  : 'Blocked: Insufficient IA Attendance'}
            </p>
            {isHodApproved && !allIAEligible && (
              <p className="text-xs text-destructive mt-1 font-medium">
                ⚠ You must attend at least 2 IAs in every subject to view your report.
              </p>
            )}
          </div>
          <button
            onClick={() => setShowReportModal(true)}
            disabled={!canDownloadHallTicket}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all shadow-sm ${
              canDownloadHallTicket
                ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-md hover:-translate-y-0.5"
                : "bg-secondary text-muted-foreground cursor-not-allowed"
            }`}
          >
            <Eye className="w-5 h-5" />
            View Report
          </button>
        </div>
      </div>

      {/* Pending Attendance Dues Section */}
      {pendingAttendanceDues.length > 0 && (
        <div className="bg-card rounded-3xl p-8 shadow-sm border-2 border-amber-500/20">
          <h2 className="text-xl font-bold text-foreground mb-6 flex items-center">
            <AlertCircle className="w-5 h-5 mr-3 text-amber-500" />
            Action Required: Pending Attendance Dues
          </h2>
          <div className="space-y-4">
            {pendingAttendanceDues.map((due: any) => (
              <div key={due.id} className="bg-amber-500/5 border border-amber-500/20 rounded-2xl p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                  <h3 className="text-lg font-bold text-foreground">{due.subjects?.subject_name} ({due.subjects?.subject_code})</h3>
                  <p className="text-sm text-muted-foreground mt-1">Reason: Attendance Shortage Fine</p>
                  <p className="text-amber-600 dark:text-amber-400 font-bold mt-2">Fine Amount: ₹{due.attendance_fee}</p>
                </div>
                <button
                  onClick={() => handleRazorpayPayment(due)}
                  disabled={payingEnrollmentId === due.id}
                  className="px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white font-bold rounded-xl transition-all shadow-md w-full md:w-auto"
                >
                  {payingEnrollmentId === due.id ? 'Initiating...' : 'Pay Now'}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pipeline Stepper */}
      <div className="bg-card rounded-3xl p-8 shadow-sm border border-border">
        <h2 className="text-xl font-bold text-foreground mb-8 flex items-center">
          <RefreshCw className="w-5 h-5 mr-3 text-primary" />
          Clearance Pipeline Match
        </h2>
        
        <div className="relative flex flex-col md:flex-row justify-between w-full mx-auto max-w-5xl px-4 items-stretch md:items-center gap-8 md:gap-0">
          <div className="hidden md:block absolute top-[28px] left-[10%] right-[10%] h-[3px] bg-secondary -z-10 rounded-full">
            <div 
              className="h-full bg-primary rounded-full transition-all duration-1000 ease-in-out"
              style={{ width: allFacultyCleared ? (allLibraryCleared ? (allDeptCleared ? (isHodApproved ? '100%' : '66%') : '33%') : '0%') : '0%' }}
            ></div>
          </div>

          <Step title="Faculty" description="IA + Attendance" isComplete={allFacultyCleared} isActive={!allFacultyCleared} icon={<BookOpen className="w-6 h-6" />} />
          <Step title="Library" description="Books & Fines" isComplete={allFacultyCleared && allLibraryCleared} isActive={allFacultyCleared && !allLibraryCleared} icon={<BookOpen className="w-6 h-6" />} />
          <Step title="Accounts" description="College Fees" isComplete={allFacultyCleared && allLibraryCleared && allDeptCleared} isActive={allFacultyCleared && allLibraryCleared && !allDeptCleared} icon={<Building2 className="w-6 h-6" />} />
          <Step title="HOD Approval" description="Final Sign-off" isComplete={isHodApproved} isActive={allFacultyCleared && allLibraryCleared && allDeptCleared && !isHodApproved} icon={<UserCog className="w-6 h-6" />} />
        </div>
      </div>

      {/* Academic Eligibility Section */}
      {iaRecords.length > 0 && (
        <div className="bg-card rounded-3xl p-8 shadow-sm border border-border">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-foreground flex items-center gap-3">
              <div className="w-10 h-10 bg-violet-500/10 rounded-xl flex items-center justify-center">
                <GraduationCap className="w-5 h-5 text-violet-500" />
              </div>
              Academic Eligibility
            </h2>
            <span className="text-xs font-medium text-muted-foreground bg-secondary px-3 py-1.5 rounded-full">
              Based on Internal Assessment Attendance
            </span>
          </div>
          <p className="text-sm text-muted-foreground mb-6">
            You must be marked <strong>Present</strong> in at least <strong>2 Internal Assessments</strong> per subject to be eligible for clearance.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {(() => {
              // Group IA records by subject
              const bySubject: Record<string, IAAttendanceRecord[]> = {};
              iaRecords.forEach(r => {
                const key = r.subject_id;
                if (!bySubject[key]) bySubject[key] = [];
                bySubject[key].push(r);
              });

              return Object.entries(bySubject).map(([subjectId, records]) => {
                const sorted = [...records].sort((a, b) => a.ia_number - b.ia_number);
                const subjectName = sorted[0]?.subjects?.subject_name || 'Unknown Subject';
                const subjectCode = sorted[0]?.subjects?.subject_code || '';
                const presentCount = sorted.filter(r => r.is_present).length;
                const isEligible = presentCount >= 2;

                return (
                  <div
                    key={subjectId}
                    className={`p-5 rounded-2xl border-2 transition-all ${
                      isEligible
                        ? 'border-emerald-500/30 bg-emerald-500/5'
                        : 'border-destructive/30 bg-destructive/5'
                    }`}
                  >
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="font-bold text-foreground text-base">{subjectName}</h3>
                        <p className="text-xs text-muted-foreground font-medium">{subjectCode}</p>
                      </div>
                      <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold ${
                        isEligible
                          ? 'bg-emerald-500/15 text-emerald-600'
                          : 'bg-destructive/15 text-destructive'
                      }`}>
                        {isEligible ? <ShieldCheck className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                        {isEligible ? 'Eligible' : 'Not Eligible'}
                      </div>
                    </div>

                    {/* IA Grid */}
                    <div className="space-y-2 mb-4">
                      {sorted.map(record => (
                        <div
                          key={record.id}
                          className="flex items-center justify-between px-4 py-2.5 rounded-xl bg-background border border-border"
                        >
                          <span className="text-sm font-semibold text-foreground">IA-{record.ia_number}</span>
                          {record.is_present ? (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-600">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Present
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-destructive/15 text-destructive">
                              <XCircle className="w-3.5 h-3.5" /> Absent
                            </span>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Progress Bar */}
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 bg-secondary rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            isEligible ? 'bg-emerald-500' : 'bg-destructive'
                          }`}
                          style={{ width: `${Math.min((presentCount / 2) * 100, 100)}%` }}
                        />
                      </div>
                      <span className={`text-xs font-bold ${
                        isEligible ? 'text-emerald-600' : 'text-destructive'
                      }`}>
                        {presentCount}/2 IAs
                      </span>
                    </div>

                    {!isEligible && (
                      <p className="mt-3 text-xs text-destructive font-medium bg-destructive/10 px-3 py-2 rounded-lg border border-destructive/20">
                        ⚠ Insufficient IA Attendance — Need {2 - presentCount} more IA{2 - presentCount > 1 ? 's' : ''}
                      </p>
                    )}
                  </div>
                );
              });
            })()}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Faculty Clearances */}
        <div className="bg-card rounded-3xl p-8 shadow-sm border border-border flex flex-col h-full">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-foreground flex items-center">
              <BookOpen className="w-5 h-5 mr-3 text-primary" />
              Faculty Clearance
            </h2>
            <span className="bg-primary/10 text-primary font-medium text-xs px-3 py-1 rounded-full uppercase tracking-wider">
              {enrollments.filter(e => e.status === 'completed').length} / {enrollments.length} Cleared
            </span>
          </div>
          
          <div className="flex-1 space-y-4">
            {enrollments.length === 0 ? (
              <p className="text-muted-foreground text-sm italic text-center py-8">No subjects enrolled yet.</p>
            ) : enrollments.map((enr) => (
              <div key={enr.id} className="p-5 rounded-2xl border border-border hover:shadow-md transition-shadow bg-secondary/30 group">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <h3 className="font-semibold text-foreground text-lg group-hover:text-primary transition-colors">{enr.subjects?.subject_name || 'Unknown Subject'}</h3>
                    {enr.teacher_id ? (
                      <p className="text-sm text-muted-foreground font-medium">{enr.subjects?.subject_code || 'N/A'} • Teacher: {enr.profiles?.full_name || 'N/A'}</p>
                    ) : (
                      <p className="text-sm text-amber-500 font-medium">{enr.subjects?.subject_code || 'N/A'} • Waiting for Teacher Assignment</p>
                    )}
                    <div className="mt-2 flex items-center gap-2">
                       <span className="text-xs text-foreground bg-background px-2 py-1 rounded-md border border-border">
                         Attendance: <span className={`font-bold ${(enr.attendance_pct || 0) < 85 ? "text-destructive" : "text-emerald-500"}`}>{enr.attendance_pct}%</span>
                       </span>
                    </div>
                  </div>
                  <div className="bg-background p-2 rounded-xl shadow-sm border border-border">
                    {enr.status === 'completed' && <CheckCircle2 className="w-6 h-6 text-emerald-500" />}
                    {enr.status === 'pending' && <Clock className="w-6 h-6 text-amber-500" />}
                    {enr.status === 'rejected' && <XCircle className="w-6 h-6 text-destructive" />}
                  </div>
                </div>

                {enr.status === 'rejected' && enr.remarks && (
                  <div className="mt-4 p-4 bg-destructive/10 border border-destructive/20 rounded-xl">
                    <p className="text-sm text-destructive font-medium mb-1">Clearance Rejected: {enr.remarks}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Accounts Clearances */}
        <div className="bg-card rounded-3xl p-8 shadow-sm border border-border flex flex-col h-full">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-foreground flex items-center">
               <Building2 className="w-5 h-5 mr-3 text-primary" />
               Accounts & College Fees
            </h2>
             <span className="bg-primary/10 text-primary font-medium text-xs px-3 py-1 rounded-full uppercase tracking-wider">
              {deptClearances.filter(d => d.status === 'completed').length} / {deptClearances.length === 0 ? 1 : deptClearances.length} Cleared
            </span>
          </div>
          
          <div className="flex-1 space-y-4">
            {deptClearances.length === 0 ? (
               <p className="text-muted-foreground text-sm italic text-center py-8">No college dues recorded.</p>
            ) : deptClearances.map((dept) => (
              <div key={dept.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-5 rounded-2xl border border-border bg-secondary/30 hover:shadow-md transition-shadow">
                <div className="mb-3 sm:mb-0">
                  <h3 className="font-semibold text-foreground capitalize text-lg">Central College Dues</h3>
                  {dept.fine_amount && dept.fine_amount > 0 ? (
                     <p className="text-sm text-destructive font-medium mt-1 bg-destructive/10 inline-block px-2 py-1 rounded-md">Pending Dues: ₹{dept.fine_amount}</p>
                  ) : (
                     <p className="text-sm text-muted-foreground mt-1">No outstanding dues</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                   <div className="bg-background p-2 rounded-xl shadow-sm border border-border">
                    {dept.status === 'completed' && <CheckCircle2 className="w-6 h-6 text-emerald-500" />}
                    {dept.status === 'pending' && <Clock className="w-6 h-6 text-amber-500" />}
                    {dept.status === 'rejected' && <XCircle className="w-6 h-6 text-destructive" />}
                   </div>
                   <span className={`text-sm font-medium ${dept.status === 'completed' ? "text-emerald-500" : "text-amber-500"}`}>
                     {dept.status === 'completed' ? 'Cleared' : 'Pending'}
                   </span>
                </div>
              </div>
            ))}
          </div>
        </div>
        
        {/* Library Clearances */}
        <div className="bg-card rounded-3xl p-8 shadow-sm border border-border flex flex-col h-full lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-foreground flex items-center">
               <BookOpen className="w-5 h-5 mr-3 text-primary" />
               Library Clearance
            </h2>
             <span className="bg-primary/10 text-primary font-medium text-xs px-3 py-1 rounded-full uppercase tracking-wider">
               {allLibraryCleared ? '1 / 1 Cleared' : '0 / 1 Cleared'}
            </span>
          </div>
          
          <div className="flex-1 space-y-4">
            {!libraryDue && allLibraryCleared ? (
               <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-5 rounded-2xl border border-border bg-emerald-500/5 hover:shadow-md transition-shadow">
                 <div className="mb-3 sm:mb-0">
                   <h3 className="font-semibold text-foreground capitalize text-lg">Library Returns</h3>
                   <p className="text-sm text-emerald-600 dark:text-emerald-400 mt-1 font-medium">All books returned & dues cleared.</p>
                 </div>
                 <div className="flex items-center gap-3">
                   <div className="bg-background p-2 rounded-xl shadow-sm border border-emerald-500/30">
                    <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                   </div>
                   <span className="text-sm font-bold text-emerald-500">Cleared</span>
                 </div>
               </div>
            ) : libraryDue && libraryDue.has_dues ? (
               <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-5 rounded-2xl border-2 border-destructive/20 bg-destructive/5 hover:shadow-md transition-shadow">
                 <div className="mb-3 sm:mb-0">
                   <h3 className="font-semibold text-foreground capitalize text-lg">Library Dues</h3>
                   <p className="text-sm text-destructive font-medium mt-1 inline-block">Pending Dues: ₹{libraryDue.fine_amount || 0}</p>
                   {libraryDue.remarks && <p className="text-xs text-muted-foreground mt-1.5 italic">Remarks: {libraryDue.remarks}</p>}
                 </div>
                 <div className="flex items-center gap-3">
                   <div className="bg-background p-2 rounded-xl shadow-sm border border-destructive/20">
                    <XCircle className="w-6 h-6 text-destructive" />
                   </div>
                   <span className="text-sm font-bold text-destructive">Blocked</span>
                 </div>
               </div>
            ) : libraryDue && !libraryDue.has_dues ? (
               <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-5 rounded-2xl border border-border bg-emerald-500/5 hover:shadow-md transition-shadow">
                 <div className="mb-3 sm:mb-0">
                   <h3 className="font-semibold text-foreground capitalize text-lg">Library Returns</h3>
                   <p className="text-sm text-emerald-600 dark:text-emerald-400 mt-1 font-medium">Cleared manually by Librarian.</p>
                   {libraryDue.remarks && <p className="text-xs text-muted-foreground mt-1.5 italic">Remarks: {libraryDue.remarks}</p>}
                 </div>
                 <div className="flex items-center gap-3">
                   <div className="bg-background p-2 rounded-xl shadow-sm border border-emerald-500/30">
                    <CheckCircle2 className="w-6 h-6 text-emerald-500" />
                   </div>
                   <span className="text-sm font-bold text-emerald-500">Cleared</span>
                 </div>
               </div>
            ) : null}
          </div>
        </div>

      </div>

      {/* NO DUE CLEARANCE REPORT MODAL */}
      {showReportModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4"
        >
          <div className="bg-card rounded-3xl w-full max-w-4xl max-h-[90vh] flex flex-col relative overflow-hidden shadow-2xl border border-border">
            <div className="flex justify-between items-center p-6 border-b border-border bg-secondary/50">
              <h2 className="text-2xl font-bold flex items-center gap-2"><ShieldCheck className="w-6 h-6 text-emerald-500" /> No Due Clearance Report</h2>
              <button onClick={() => setShowReportModal(false)} className="p-2 hover:bg-destructive/10 hover:text-destructive rounded-xl transition-colors">
                <XCircle className="w-6 h-6" />
              </button>
            </div>
            
            <div 
              className="p-8 overflow-y-auto select-none relative" 
              onContextMenu={(e) => e.preventDefault()}
            >
              {/* Watermark */}
              <div className="fixed inset-0 flex items-center justify-center pointer-events-none opacity-[0.03] rotate-[-30deg]">
                <h1 className="text-8xl font-black whitespace-nowrap">CONFIDENTIAL & CLEARED</h1>
              </div>

              <div className="text-center mb-10 relative z-10 pointer-events-none">
                <h1 className="text-3xl font-bold uppercase tracking-widest text-primary mb-2">{hallTemplate?.institution_name || 'NOC PORTAL'}</h1>
                <h2 className="text-xl font-semibold text-muted-foreground">OFFICIAL NO DUE CLEARANCE REPORT</h2>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-10 relative z-10 pointer-events-none">
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">Student Name</p>
                  <p className="text-xl font-bold">{profile?.full_name}</p>
                </div>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">Roll Number</p>
                  <p className="text-xl font-bold font-mono">{(profile as any)?.roll_number || profile?.id?.substring(0,8).toUpperCase()}</p>
                </div>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">Department</p>
                  <p className="text-xl font-bold">{departmentName}</p>
                </div>
                <div className="space-y-3">
                  <p className="text-sm text-muted-foreground uppercase tracking-wider font-semibold">Clearance Status</p>
                  <div className="inline-flex items-center gap-2 bg-emerald-500/10 text-emerald-600 px-4 py-2 rounded-xl border border-emerald-500/20">
                    <CheckCircle2 className="w-5 h-5" />
                    <span className="font-bold">Fully Cleared</span>
                  </div>
                </div>
              </div>

              <div className="relative z-10 pointer-events-none">
                <h3 className="text-lg font-bold border-b border-border pb-2 mb-4">Subject Schedule & Attendance</h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-secondary text-muted-foreground text-sm">
                        <th className="p-3 font-semibold rounded-tl-lg">Code</th>
                        <th className="p-3 font-semibold">Subject</th>
                        <th className="p-3 font-semibold text-center">Attendance</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border border-b border-border">
                      {enrollments.map(e => (
                        <tr key={e.id} className="hover:bg-secondary/30">
                          <td className="p-3 font-mono text-sm">{e.subjects?.subject_code}</td>
                          <td className="p-3 font-medium">{e.subjects?.subject_name}</td>
                          <td className="p-3 text-center font-bold text-emerald-500">{e.attendance_pct || 100}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
            
            <div className="bg-destructive/10 p-4 text-center border-t border-border mt-auto">
              <p className="text-sm font-bold text-destructive uppercase tracking-widest flex items-center justify-center gap-2">
                <AlertCircle className="w-4 h-4" /> Downloads and Screenshots Prohibited
              </p>
            </div>
          </div>
        </div>
      )}

      {/* PAYMENT RECEIPT MODAL */}
      {paymentReceipt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-card rounded-3xl w-full max-w-md p-8 shadow-2xl border border-border relative animate-in fade-in zoom-in duration-200">
            <div className="flex flex-col items-center text-center">
              <div className="w-16 h-16 bg-emerald-500/10 text-emerald-500 rounded-full flex items-center justify-center mb-4">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <h2 className="text-2xl font-bold text-foreground mb-2">Payment Successful!</h2>
              <p className="text-muted-foreground mb-6">Your attendance due has been cleared.</p>
              
              <div className="w-full bg-secondary/50 rounded-2xl p-5 mb-8 text-left space-y-3">
                <div className="flex justify-between">
                  <span className="text-muted-foreground text-sm">Amount Paid:</span>
                  <span className="font-bold">₹{paymentReceipt.amount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground text-sm">Subject:</span>
                  <span className="font-medium text-right max-w-[60%] truncate" title={paymentReceipt.subject}>{paymentReceipt.subject}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground text-sm">Date:</span>
                  <span className="font-medium text-right">{paymentReceipt.date}</span>
                </div>
                <div className="pt-3 mt-3 border-t border-border flex justify-between">
                  <span className="text-muted-foreground text-sm">Transaction ID:</span>
                  <span className="font-mono text-xs max-w-[60%] truncate" title={paymentReceipt.paymentId}>{paymentReceipt.paymentId}</span>
                </div>
              </div>

              <button
                onClick={() => setPaymentReceipt(null)}
                className="w-full py-3.5 bg-emerald-500 hover:bg-emerald-600 text-white font-bold rounded-xl transition-colors"
              >
                Close & Return to Dashboard
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

// Stepper Component — memoized to prevent unnecessary re-renders
const Step = memo(function Step({ title, description, isComplete, isActive, icon }: any) {
  return (
    <div className="relative flex flex-col items-center">
      <div className={`w-14 h-14 rounded-2xl flex items-center justify-center mb-4 transition-all duration-300 relative z-10 ${
        isComplete ? "bg-emerald-500 text-white shadow-lg shadow-emerald-500/30" : 
        isActive ? "bg-primary text-primary-foreground shadow-lg shadow-primary/30 animate-pulse ring-4 ring-primary/20" : 
        "bg-card border-2 border-border text-muted-foreground"
      }`}>
        {icon}
        {isComplete && (
           <div className="absolute -bottom-1 -right-1 bg-card rounded-full p-0.5 shadow-sm">
             <CheckCircle2 className="w-4 h-4 text-emerald-500" />
           </div>
        )}
      </div>
      <div className="text-center bg-card md:bg-transparent px-2 md:px-0 z-10">
        <h4 className={`font-bold text-base leading-tight ${isComplete ? "text-emerald-500" : isActive ? "text-foreground" : "text-muted-foreground"}`}>
          {title}
        </h4>
        <p className="text-xs text-muted-foreground mt-1 font-medium tracking-wide">{description}</p>
      </div>
    </div>
  );
});
