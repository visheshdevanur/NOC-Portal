import { useState, useEffect } from 'react';
import { useAuth } from '../../lib/useAuth';
import { 
  getStudentClearanceRequest, 
  getStudentSubjects, 
  getStudentDues, 
  submitClearanceRequest,
  getStudentIAAttendance 
} from '../../lib/api';
import { CheckCircle2, Clock, XCircle, AlertCircle, FileDown, BookOpen, Building2, UserCog, RefreshCw, Hand, ShieldCheck, GraduationCap } from 'lucide-react';
import jsPDF from 'jspdf';
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
  const [departmentName, setDepartmentName] = useState<string>('N/A');

  useEffect(() => {
    if (user) {
      fetchStudentData();
      
      // Setup Realtime Subscription
      const channel = supabase.channel('student-dashboard')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'clearance_requests', filter: `student_id=eq.${user.id}` }, () => fetchStudentData())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'subject_enrollment', filter: `student_id=eq.${user.id}` }, () => fetchStudentData())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'student_dues', filter: `student_id=eq.${user.id}` }, () => fetchStudentData())
        .subscribe();

      return () => {
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
      const [req, deptRes, subsDataRes, subs, depts, templateRes, iaData] = await Promise.all([
        getStudentClearanceRequest(user.id),
        profile?.department_id ? supabase.from('departments').select('name').eq('id', profile.department_id).single() : Promise.resolve({ data: null }),
        profile?.semester_id ? supabase.from('subjects').select('*').eq('semester_id', profile.semester_id) : Promise.resolve({ data: null }),
        getStudentSubjects(user.id),
        getStudentDues(user.id),
        supabase.from('hall_ticket_templates').select('*').limit(1).single(),
        getStudentIAAttendance(user.id)
      ]);

      setRequest(req);
      
      if (deptRes.data) setDepartmentName(deptRes.data.name);
      if (!req && subsDataRes.data) setAvailableSubjects(subsDataRes.data);
      if (templateRes.data) setHallTemplate(templateRes.data);
      setIaRecords((iaData || []) as unknown as IAAttendanceRecord[]);
      
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

  const generatePDF = () => {
    if (request?.current_stage !== 'cleared') return;
    // Block if IA attendance insufficient
    const iaCheck: Record<string, number> = {};
    iaRecords.forEach(r => {
      if (r.is_present) iaCheck[r.subject_id] = (iaCheck[r.subject_id] || 0) + 1;
    });
    const iaSubjects = Object.keys(iaCheck);
    if (iaRecords.length > 0 && iaSubjects.some(sid => (iaCheck[sid] || 0) < 2)) return;

    const doc = new jsPDF();
    const pageWidth = doc.internal.pageSize.getWidth(); // 210mm
    const pageHeight = doc.internal.pageSize.getHeight(); // 297mm
    
    // Use template or sensible defaults
    const institution = hallTemplate?.institution_name || "Institutional Name";
    const title = hallTemplate?.title || "EXAMINATION HALL TICKET";
    const instructions = hallTemplate?.instructions || "1. Bring this ticket.\n2. No electronics permitted.";
    const sigs: string[] = hallTemplate?.signatures?.length ? hallTemplate.signatures : ['Controller of Examinations'];

    // Check if COE has chosen Visual Builder mode
    // Mode is stored inside mapping_coordinates JSONB as '_mode' key
    const storedMode = hallTemplate?.mapping_coordinates?._mode || hallTemplate?.template_mode;
    const isBuilderMode = storedMode === 'builder';
    const hasCustomTemplate = isBuilderMode && hallTemplate?.bg_image_url && hallTemplate?.mapping_coordinates && Object.keys(hallTemplate.mapping_coordinates).length > 1;

    if (hasCustomTemplate) {
      // =================== CUSTOM TEMPLATE MODE ===================
      // The uploaded image already contains college name, logo, signatures, etc.
      // We only overlay: Student Name, Roll Number, and Subject Table
      const coords = hallTemplate.mapping_coordinates;

      // 1. Render background image covering full A4
      try {
        doc.addImage(hallTemplate.bg_image_url!, 'PNG', 0, 0, pageWidth, pageHeight);
      } catch (e) {
        console.warn("Could not load background image into PDF", e);
      }

      // Helper to convert percentage coords to mm
      const toX = (pct: number) => (pct / 100) * pageWidth;
      const toY = (pct: number) => (pct / 100) * pageHeight;

      // 2. Student Name
      if (coords.student_name) {
        const fs = coords.student_name.fontSize || 12;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(fs);
        doc.setTextColor(0, 0, 0);
        doc.text(`${profile?.full_name || 'N/A'}`, toX(coords.student_name.x), toY(coords.student_name.y) + (fs * 0.35));
      }

      // 3. Roll Number
      if (coords.roll_no) {
        const fs = coords.roll_no.fontSize || 12;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(fs);
        doc.setTextColor(0, 0, 0);
        doc.text(`${(profile as any)?.roll_number || profile?.id.substring(0,8).toUpperCase()}`, toX(coords.roll_no.x), toY(coords.roll_no.y) + (fs * 0.35));
      }

      // 4. Department (show name, not ID)
      if (coords.department) {
        const fs = coords.department.fontSize || 12;
        doc.setFont("helvetica", "bold");
        doc.setFontSize(fs);
        doc.setTextColor(0, 0, 0);
        doc.text(`${departmentName}`, toX(coords.department.x), toY(coords.department.y) + (fs * 0.35));
      }

      // 5. Subject Table
      if (coords.subject_table) {
        const startX = toX(coords.subject_table.x);
        const startY = toY(coords.subject_table.y);
        const tableW = toX(coords.subject_table.w);
        const fs = coords.subject_table.fontSize || 9;

        // Table header
        doc.setFont("helvetica", "bold");
        doc.setFontSize(fs + 1);
        doc.setTextColor(0, 0, 0);
        doc.setFillColor(230, 230, 230);
        doc.rect(startX, startY, tableW, 7, 'F');
        
        const colCode = startX + 2;
        const colName = startX + tableW * 0.18;
        const colDate = startX + tableW * 0.58;
        const colTime = startX + tableW * 0.78;
        
        doc.text("Subject Code", colCode, startY + 5);
        doc.text("Subject Name", colName, startY + 5);
        doc.text("Date", colDate, startY + 5);
        doc.text("Time", colTime, startY + 5);

        // Table rows
        doc.setFont("helvetica", "normal");
        doc.setFontSize(fs);
        let rowY = startY + 12;
        enrollments.forEach((e) => {
          const rowSubject: any = e.subjects;
          doc.text(`${rowSubject.subject_code}`, colCode, rowY);
          doc.text(doc.splitTextToSize(`${rowSubject.subject_name}`, tableW * 0.35), colName, rowY);
          doc.text(`${rowSubject.exam_date || 'TBA'}`, colDate, rowY);
          doc.text(`${rowSubject.exam_time || 'TBA'}`, colTime, rowY);
          rowY += 7;
        });
      }

    } else {
      // =================== LEGACY HARDCODED MODE ===================
      // Logo
      if (hallTemplate?.logo_url) {
        try {
          doc.addImage(hallTemplate.logo_url, 'PNG', 15, 10, 18, 18);
        } catch(e) {
          console.warn("Could not load logo into PDF", e);
        }
      }

      doc.setFont("helvetica", "bold");
      doc.setFontSize(18);
      doc.setTextColor(30, 64, 175); 
      doc.text(institution.toUpperCase(), pageWidth / 2, 18, { align: "center", maxWidth: pageWidth - 50 });
      
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(80, 80, 80);
      doc.text(title.toUpperCase(), pageWidth / 2, 30, { align: "center" });
      
      doc.setDrawColor(200, 200, 200);
      doc.line(20, 36, pageWidth - 20, 36);

      doc.setFont("helvetica", "bold");
      doc.setTextColor(40, 40, 40);
      doc.setFontSize(14);
      doc.text("Student Details", 20, 50);
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(12);
      doc.text(`Name: ${profile?.full_name}`, 20, 60);
      doc.text(`Student ID: ${(profile as any)?.roll_number || profile?.id.substring(0,8).toUpperCase()}`, 20, 68);
      doc.text(`Department: ${departmentName}`, 20, 76);

      doc.setFont("helvetica", "bold");
      doc.setTextColor(40, 40, 40);
      doc.text("Examination Subject Schedule", 20, 92);
      
      doc.setFontSize(10);
      doc.setFillColor(245, 245, 245);
      const colPositions = { sno: 22, code: 38, name: 72, date: 130, time: 165 };
      doc.rect(20, 97, pageWidth - 40, 8, 'F');
      doc.text("S.No", colPositions.sno, 102);
      doc.text("Subject Code", colPositions.code, 102);
      doc.text("Subject Name", colPositions.name, 102);
      doc.text("Exam Date", colPositions.date, 102);
      doc.text("Exam Time", colPositions.time, 102);

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      let yPos = 110;
      enrollments.forEach((e, index) => {
        const rowSubject: any = e.subjects;
        doc.text(`${index + 1}`, colPositions.sno, yPos);
        doc.text(`${rowSubject.subject_code}`, colPositions.code, yPos);
        doc.text(doc.splitTextToSize(`${rowSubject.subject_name}`, 55), colPositions.name, yPos);
        doc.text(`${rowSubject.exam_date || 'TBA'}`, colPositions.date, yPos);
        doc.text(`${rowSubject.exam_time || 'TBA'}`, colPositions.time, yPos);
        yPos += 8;
      });

      // Instructions
      doc.setFont("helvetica", "bold");
      doc.setFontSize(13);
      doc.setTextColor(40, 40, 40);
      doc.text("Instructions to Candidates", 20, yPos + 10);
      
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(80, 80, 80);
      const splitInstructions = doc.splitTextToSize(instructions, pageWidth - 40);
      doc.text(splitInstructions, 20, yPos + 18);

      // Signatures
      const sigCount = sigs.length;
      const padding = 20;
      const availableWidth = pageWidth - (padding * 2);
      const sigSpacing = sigCount > 1 ? availableWidth / (sigCount - 1) : 0;

      doc.setDrawColor(0, 0, 0);
      doc.setFontSize(10);
      doc.setTextColor(0, 0, 0);
      
      sigs.forEach((sigName, i) => {
        const alignLeft = sigCount === 1 ? pageWidth / 2 : padding + (sigSpacing * i);
        doc.line(alignLeft - 15, 275, alignLeft + 15, 275);
        doc.text(sigName, alignLeft, 281, { align: "center" });
      });
    }

    doc.save(`HallTicket_${profile?.full_name?.replace(/\s+/g, '_')}.pdf`);
  };

  if (loading) return <div className="animate-pulse flex flex-col gap-6">
    <div className="h-48 bg-card rounded-2xl w-full"></div>
    <div className="h-64 bg-card rounded-2xl w-full"></div>
  </div>;

  if (!request) {
    return (
      <div className="max-w-4xl mx-auto mt-12 bg-card p-10 rounded-3xl shadow-xl border border-border flex flex-col items-center text-center">
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
    );
  }

  const isHodApproved = request.current_stage === 'cleared';
  const allFacultyCleared = enrollments.length > 0 && enrollments.every(e => e.status === 'completed');
  const allDeptCleared = deptClearances.length > 0 && deptClearances.every(d => d.status === 'completed');

  // Check IA eligibility: for each subject that has IA records, student must have >= 2 present
  const iaBySubject: Record<string, { present: number; total: number }> = {};
  iaRecords.forEach(r => {
    if (!iaBySubject[r.subject_id]) iaBySubject[r.subject_id] = { present: 0, total: 0 };
    iaBySubject[r.subject_id].total++;
    if (r.is_present) iaBySubject[r.subject_id].present++;
  });
  const iaSubjectIds = Object.keys(iaBySubject);
  const allIAEligible = iaSubjectIds.length === 0 || iaSubjectIds.every(sid => iaBySubject[sid].present >= 2);
  const canDownloadHallTicket = isHodApproved && allIAEligible;

  return (
    <div className="space-y-8 fade-in">
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
        
        {/* Hall Ticket Download */}
        <div className={`p-6 rounded-2xl border-2 transition-all flex flex-col sm:flex-row items-start sm:items-center gap-4 ${canDownloadHallTicket ? "bg-emerald-500/10 border-emerald-500/30" : "bg-secondary border-border"}`}>
          <div className="flex-1">
            <h3 className="font-semibold text-foreground text-lg">Hall Ticket</h3>
            <p className={`text-sm ${canDownloadHallTicket ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground"}`}>
              {canDownloadHallTicket
                ? 'Ready to download'
                : !isHodApproved
                  ? 'Requires Final Approval'
                  : 'Blocked: Insufficient IA Attendance'}
            </p>
            {isHodApproved && !allIAEligible && (
              <p className="text-xs text-destructive mt-1 font-medium">
                ⚠ You must attend at least 2 IAs in every subject to download your hall ticket.
              </p>
            )}
          </div>
          <button
            onClick={generatePDF}
            disabled={!canDownloadHallTicket}
            className={`flex items-center gap-2 px-6 py-3 rounded-xl font-medium transition-all shadow-sm ${
              canDownloadHallTicket
                ? "bg-primary text-primary-foreground hover:bg-primary/90 hover:shadow-md hover:-translate-y-0.5"
                : "bg-secondary text-muted-foreground cursor-not-allowed"
            }`}
          >
            <FileDown className="w-5 h-5" />
            Download PDF
          </button>
        </div>
      </div>

      {/* Pipeline Stepper */}
      <div className="bg-card rounded-3xl p-8 shadow-sm border border-border">
        <h2 className="text-xl font-bold text-foreground mb-8 flex items-center">
          <RefreshCw className="w-5 h-5 mr-3 text-primary" />
          Clearance Pipeline Match
        </h2>
        
        <div className="relative flex flex-col md:flex-row justify-between w-full mx-auto max-w-4xl px-4 items-stretch md:items-center gap-8 md:gap-0">
          <div className="hidden md:block absolute top-[28px] left-[10%] right-[10%] h-[3px] bg-secondary -z-10 rounded-full">
            <div 
              className="h-full bg-primary rounded-full transition-all duration-1000 ease-in-out"
              style={{ width: allFacultyCleared ? (allDeptCleared ? (isHodApproved ? '100%' : '50%') : '0%') : '0%' }}
            ></div>
          </div>

          <Step title="Faculty" description="Subject Tutors" isComplete={allFacultyCleared} isActive={!allFacultyCleared} icon={<BookOpen className="w-6 h-6" />} />
          <Step title="Accounts" description="College Fees" isComplete={allDeptCleared} isActive={allFacultyCleared && !allDeptCleared} icon={<Building2 className="w-6 h-6" />} />
          <Step title="HOD Approval" description="Final Sign-off" isComplete={isHodApproved} isActive={allFacultyCleared && allDeptCleared && !isHodApproved} icon={<UserCog className="w-6 h-6" />} />
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
      </div>
    </div>
  );
}

// Stepper Component
function Step({ title, description, isComplete, isActive, icon }: any) {
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
}
