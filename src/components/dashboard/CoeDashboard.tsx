import { useState, useEffect, useRef } from 'react';
import { supabase } from '../../lib/supabase';
import { GraduationCap, Save, FileText, CheckCircle2, Calendar, Upload, Plus, Trash2, X, Image as ImageIcon, Download, Palette, Move, RotateCcw, Layers } from 'lucide-react';
import { getFriendlyErrorMessage } from '../../lib/errorHandler';
import Papa from 'papaparse';
import { Rnd } from 'react-rnd';

type MappingCoordinate = {
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  w: number; // percentage width
  h: number; // percentage height
  fontSize?: number; // pt size for PDF
};

type MappingCoordinates = {
  [key: string]: MappingCoordinate;
};

type HallTicketTemplate = {
  id: string;
  institution_name: string;
  title: string;
  instructions: string;
  signature_text: string; // Legacy
  logo_url: string | null;
  signatures: string[] | null;
  bg_image_url: string | null;
  mapping_coordinates: MappingCoordinates | null;
  template_mode: 'editor' | 'builder';
};

// The draggable variable definitions — only dynamic student data
// Static content (college name, logo, signatures, instructions) is part of the uploaded image
const TEMPLATE_VARIABLES = [
  { key: 'student_name', label: 'Student Name', color: '#06b6d4', defaultW: 40, defaultH: 4, defaultX: 10, defaultY: 25 },
  { key: 'roll_no', label: 'Roll Number', color: '#14b8a6', defaultW: 35, defaultH: 4, defaultX: 10, defaultY: 31 },
  { key: 'department', label: 'Department', color: '#f59e0b', defaultW: 35, defaultH: 4, defaultX: 10, defaultY: 37 },
  { key: 'subject_table', label: 'Subject Table', color: '#ef4444', defaultW: 80, defaultH: 35, defaultX: 10, defaultY: 44 },
] as const;

type Subject = {
  id: string;
  subject_name: string;
  subject_code: string;
  department_id: string | null;
  semester_id: string | null;
  exam_date: string | null;
  exam_time: string | null;
};

type Department = { id: string; name: string };
type Semester = { id: string; name: string };

export default function CoeDashboard() {
  const [activeTab, setActiveTab] = useState<'template' | 'timetable' | 'builder'>('template');
  
  // Template State
  const [template, setTemplate] = useState<HallTicketTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMSG, setErrorMSG] = useState<string | null>(null);
  const [successMSG, setSuccessMSG] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Timetable State
  const [departments, setDepartments] = useState<Department[]>([]);
  const [semesters, setSemesters] = useState<Semester[]>([]);
  const [subjects, setSubjects] = useState<Subject[]>([]);
  const [savingTime, setSavingTime] = useState(false);
  const csvInputRef = useRef<HTMLInputElement>(null);

  // Visual Builder State
  const [builderCoords, setBuilderCoords] = useState<MappingCoordinates>({});
  const [bgImage, setBgImage] = useState<string | null>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const bgUploadRef = useRef<HTMLInputElement>(null);
  const [savingBuilder, setSavingBuilder] = useState(false);
  const [activeVariable, setActiveVariable] = useState<string | null>(null);

  useEffect(() => {
    fetchTemplate();
    if (activeTab === 'timetable') {
      fetchTimetableData();
    }
  }, [activeTab]);

  // Measure canvas container for responsive drag bounds
  useEffect(() => {
    if (activeTab === 'builder' && canvasContainerRef.current) {
      const measure = () => {
        const el = canvasContainerRef.current;
        if (el) {
          // A4 ratio is ~1:1.414
          const w = el.clientWidth;
          const h = w * 1.414;
          setCanvasSize({ width: w, height: h });
        }
      };
      measure();
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
  }, [activeTab]);

  // Initialize builder coords from template when switching to builder tab
  useEffect(() => {
    if (activeTab === 'builder' && template) {
      setBgImage(template.bg_image_url || null);
      if (template.mapping_coordinates && Object.keys(template.mapping_coordinates).length > 0) {
        setBuilderCoords(template.mapping_coordinates);
      } else {
        // Initialize default positions for all variables
        const defaults: MappingCoordinates = {};
        TEMPLATE_VARIABLES.forEach(v => {
          defaults[v.key] = { x: v.defaultX, y: v.defaultY, w: v.defaultW, h: v.defaultH, fontSize: 12 };
        });
        setBuilderCoords(defaults);
      }
    }
  }, [activeTab, template]);

  // ================= TEMPLATE LOGIC =================
  const fetchTemplate = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.from('hall_ticket_templates').select('*').limit(1).single();
      if (error && error.code !== 'PGRST116') throw error;
      
      if (data) {
        setTemplate({
          ...data,
          signatures: data.signatures || ['Controller of Examinations'],
          bg_image_url: data.bg_image_url || null,
          mapping_coordinates: data.mapping_coordinates || null,
          template_mode: data.template_mode || ((data.mapping_coordinates as any)?._mode) || 'editor',
        });
      } else {
        setTemplate({
          id: '',
          institution_name: 'Institutional Name',
          title: 'EXAMINATION HALL TICKET',
          instructions: '1. Bring this ticket.\n2. No electronics permitted.',
          signature_text: '',
          logo_url: null,
          signatures: ['Controller of Examinations'],
          bg_image_url: null,
          mapping_coordinates: null,
          template_mode: 'editor' as const,
        });
      }
    } catch (err: any) {
      console.error(err);
      setErrorMSG(getFriendlyErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleSaveTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!template) return;
    
    setSaving(true);
    setErrorMSG(null);
    setSuccessMSG(null);
    
    try {
      const payload = {
         institution_name: template.institution_name,
         title: template.title,
         instructions: template.instructions,
         logo_url: template.logo_url,
         signatures: template.signatures || ['Controller of Examinations'],
         updated_at: new Date().toISOString()
      };

      let resultError;
      if (template.id) {
        const { error } = await supabase.from('hall_ticket_templates').update(payload).eq('id', template.id);
        resultError = error;
      } else {
        const { data, error } = await supabase.from('hall_ticket_templates').insert([payload]).select().single();
        if (data) setTemplate(data);
        resultError = error;
      }
      
      if (resultError) throw resultError;
      
      setSuccessMSG('Hall Ticket Template saved successfully!');
      setTimeout(() => setSuccessMSG(null), 3000);
    } catch (err: any) {
      setErrorMSG(getFriendlyErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert("Image must be smaller than 2MB");
      return;
    }

    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setTemplate(prev => prev ? { ...prev, logo_url: base64 } : null);
    };
    reader.readAsDataURL(file);
  };

  const addSignature = () => {
    setTemplate(prev => {
      if (!prev) return null;
      return { ...prev, signatures: [...(prev.signatures || []), 'New Signature'] };
    });
  };

  const updateSignature = (index: number, val: string) => {
    setTemplate(prev => {
      if (!prev) return null;
      const newSigs = [...(prev.signatures || [])];
      newSigs[index] = val;
      return { ...prev, signatures: newSigs };
    });
  };

  const removeSignature = (index: number) => {
    setTemplate(prev => {
      if (!prev) return null;
      const newSigs = [...(prev.signatures || [])];
      newSigs.splice(index, 1);
      return { ...prev, signatures: newSigs };
    });
  };

  // ================= TIMETABLE LOGIC =================
  const fetchTimetableData = async () => {
    try {
      const [deptRes, semRes, subRes] = await Promise.all([
        supabase.from('departments').select('id, name').order('name'),
        supabase.from('semesters').select('id, name').order('name'),
        supabase.from('subjects').select('*').order('subject_code')
      ]);
      if (deptRes.error) throw deptRes.error;
      if (semRes.error) throw semRes.error;
      if (subRes.error) throw subRes.error;

      setDepartments(deptRes.data || []);
      setSemesters(semRes.data || []);
      setSubjects(subRes.data as Subject[] || []);
    } catch (err: any) {
      setErrorMSG(getFriendlyErrorMessage(err));
    }
  };

  const handleSubjectTimeChange = (id: string, field: 'exam_date' | 'exam_time', value: string) => {
    setSubjects(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const saveTimetable = async () => {
    setSavingTime(true);
    setErrorMSG(null);
    setSuccessMSG(null);
    try {
      // Supabase doesn't easily support bulk upsert of heterogeneous partials without a solid unique key 
      // but we can bulk upsert using id
      const { error } = await supabase.from('subjects').upsert(
        subjects.map(s => ({
          id: s.id,
          subject_name: s.subject_name,
          subject_code: s.subject_code,
          department_id: s.department_id,
          semester_id: s.semester_id,
          exam_date: s.exam_date || null,
          exam_time: s.exam_time || null
        }))
      );
      if (error) throw error;
      setSuccessMSG('Timetable updated successfully!');
      setTimeout(() => setSuccessMSG(null), 3000);
    } catch (err: any) {
      setErrorMSG("Failed to save timetable: " + getFriendlyErrorMessage(err));
    } finally {
      setSavingTime(false);
    }
  };

  const handleCSVUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const rows = results.data as any[];
        let updatedCount = 0;
        const toUpsert: any[] = [];
        
        let newSubjects = [...subjects];
        
        rows.forEach(row => {
          const code = row['Subject Code'] || row['subject_code'];
          let date = row['Exam Date'] || row['exam_date']; 
          const time = row['Exam Time'] || row['exam_time'];

          if (code && date && time) {
            // Auto convert DD-MM-YYYY or DD/MM/YYYY to Postgres YYYY-MM-DD format
            date = date.trim();
            if (date.includes('-')) {
              const p = date.split('-');
              if (p.length === 3 && p[0].length <= 2 && p[2].length === 4) {
                date = `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
              }
            } else if (date.includes('/')) {
              const p = date.split('/');
              if (p.length === 3 && p[0].length <= 2 && p[2].length === 4) {
                date = `${p[2]}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
              }
            }

            const idx = newSubjects.findIndex(s => s.subject_code.trim().toUpperCase() === code.trim().toUpperCase());
            if (idx !== -1) {
              newSubjects[idx] = { ...newSubjects[idx], exam_date: date, exam_time: time };
              
              toUpsert.push({
                id: newSubjects[idx].id,
                subject_name: newSubjects[idx].subject_name,
                subject_code: newSubjects[idx].subject_code,
                department_id: newSubjects[idx].department_id,
                semester_id: newSubjects[idx].semester_id,
                exam_date: date,
                exam_time: time
              });
              
              updatedCount++;
            }
          }
        });

        if (updatedCount > 0) {
          try {
            setSavingTime(true);
            const { error } = await supabase.from('subjects').upsert(toUpsert);
            if (error) throw error;
            
            setSubjects(newSubjects);
            setSuccessMSG(`CSV Uploaded & Saved! Dates/times applied to ${updatedCount} subjects.`);
            setTimeout(() => setSuccessMSG(null), 4000);
          } catch (err: any) {
            alert("Failed to save CSV to database: " + err.message);
          } finally {
            setSavingTime(false);
          }
        } else {
          alert('Parsed CSV, but no matches were found for the subject codes provided.');
        }

        if (csvInputRef.current) csvInputRef.current.value = '';
      },
      error: (error) => {
        alert("Failed to parse CSV: " + error.message);
      }
    });
  };

  const handleDownloadCSVTemplate = () => {
    const csvContent = "Subject Code,Exam Date,Exam Time\nCS301,2026-12-14,10:00 AM - 01:00 PM\nCS302,2026-12-16,10:00 AM - 01:00 PM\n";
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'timetable_upload_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // ================= VISUAL BUILDER LOGIC =================
  const handleBgImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      alert('Background image must be smaller than 5MB');
      return;
    }
    const reader = new FileReader();
    reader.onload = (event) => {
      const base64 = event.target?.result as string;
      setBgImage(base64);
    };
    reader.readAsDataURL(file);
  };

  const handleVariableDragStop = (key: string, x: number, y: number) => {
    if (canvasSize.width === 0 || canvasSize.height === 0) return;
    const xPct = (x / canvasSize.width) * 100;
    const yPct = (y / canvasSize.height) * 100;
    setBuilderCoords(prev => ({
      ...prev,
      [key]: { ...prev[key], x: Math.max(0, Math.min(100, xPct)), y: Math.max(0, Math.min(100, yPct)) }
    }));
  };

  const handleVariableResize = (key: string, w: number, h: number, x: number, y: number) => {
    if (canvasSize.width === 0 || canvasSize.height === 0) return;
    const wPct = (w / canvasSize.width) * 100;
    const hPct = (h / canvasSize.height) * 100;
    const xPct = (x / canvasSize.width) * 100;
    const yPct = (y / canvasSize.height) * 100;
    setBuilderCoords(prev => ({
      ...prev,
      [key]: { ...prev[key], x: xPct, y: yPct, w: wPct, h: hPct }
    }));
  };

  const resetBuilderToDefaults = () => {
    const defaults: MappingCoordinates = {};
    TEMPLATE_VARIABLES.forEach(v => {
      defaults[v.key] = { x: v.defaultX, y: v.defaultY, w: v.defaultW, h: v.defaultH, fontSize: 12 };
    });
    setBuilderCoords(defaults);
  };

  const handleSaveBuilder = async () => {
    if (!template) return;
    setSavingBuilder(true);
    setErrorMSG(null);
    setSuccessMSG(null);
    try {
      const payload = {
        bg_image_url: bgImage,
        mapping_coordinates: { ...builderCoords, _mode: 'builder' } as any,
        updated_at: new Date().toISOString(),
      };

      let resultError;
      if (template.id) {
        const { error } = await supabase.from('hall_ticket_templates').update(payload).eq('id', template.id);
        resultError = error;
      } else {
        // Need to create the template first with all fields
        const { data, error } = await supabase.from('hall_ticket_templates').insert([{
          institution_name: template.institution_name,
          title: template.title,
          instructions: template.instructions,
          signatures: template.signatures,
          logo_url: template.logo_url,
          ...payload
        }]).select().single();
        if (data) setTemplate(prev => prev ? { ...prev, ...data } : null);
        resultError = error;
      }

      if (resultError) throw resultError;

      // Update local template state
      setTemplate(prev => prev ? { ...prev, bg_image_url: bgImage, mapping_coordinates: { ...builderCoords, _mode: 'builder' } as any, template_mode: 'builder' } : null);
      setSuccessMSG('Visual template mapping saved successfully!');
      setTimeout(() => setSuccessMSG(null), 3000);
    } catch (err: any) {
      setErrorMSG(getFriendlyErrorMessage(err));
    } finally {
      setSavingBuilder(false);
    }
  };

  const handleFontSizeChange = (key: string, size: number) => {
    setBuilderCoords(prev => ({
      ...prev,
      [key]: { ...prev[key], fontSize: size }
    }));
  };

  if (loading) {
    return <div className="p-8 text-center animate-pulse text-muted-foreground">Loading Configuration...</div>;
  }

  return (
    <div className="space-y-6 fade-in max-w-6xl mx-auto">
      {/* Header */}
      <div className="bg-card rounded-3xl p-8 shadow-sm border border-border relative overflow-hidden flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full -translate-y-1/2 translate-x-1/2"></div>
        <div>
          <h1 className="text-3xl font-bold text-foreground mb-2 flex items-center">
            <GraduationCap className="w-8 h-8 mr-3 text-indigo-500" />
            Control of Examination (COE)
          </h1>
          <p className="text-muted-foreground">Manage institutional hall ticket templates and examination timetables.</p>
        </div>
      </div>

      {errorMSG && (
        <div className="p-4 bg-destructive/10 text-destructive border border-destructive/20 rounded-xl relative">
          {errorMSG}
          <button onClick={() => setErrorMSG(null)} className="absolute right-4 top-4"><X className="w-4 h-4"/></button>
        </div>
      )}
      
      {successMSG && (
        <div className="fixed bottom-6 right-6 p-4 bg-emerald-500 text-white shadow-xl rounded-xl flex items-center gap-3 z-50 animate-in slide-in-from-bottom-5">
          <CheckCircle2 className="w-5 h-5" />
          <span className="font-medium">{successMSG}</span>
        </div>
      )}

      {/* Tabs */}
      <div className="bg-card rounded-2xl p-1.5 shadow-sm border border-border flex gap-1 overflow-x-auto w-full md:w-fit">
        <button
          onClick={() => setActiveTab('template')}
          className={`flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium text-sm transition-all whitespace-nowrap ${
            activeTab === 'template' ? 'bg-indigo-500 text-white shadow-md' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
          }`}
        >
          <FileText className="w-4 h-4" />
          Template Editor
        </button>
        <button
          onClick={() => setActiveTab('builder')}
          className={`flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium text-sm transition-all whitespace-nowrap ${
            activeTab === 'builder' ? 'bg-indigo-500 text-white shadow-md' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
          }`}
        >
          <Palette className="w-4 h-4" />
          Visual Builder
        </button>
        <button
          onClick={() => setActiveTab('timetable')}
          className={`flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-medium text-sm transition-all whitespace-nowrap ${
            activeTab === 'timetable' ? 'bg-indigo-500 text-white shadow-md' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
          }`}
        >
          <Calendar className="w-4 h-4" />
          Timetable Allotment
        </button>
      </div>

      {/* Active Mode Toggle */}
      <div className="bg-card rounded-2xl p-4 shadow-sm border border-border flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-foreground">Active Hall Ticket Mode</h3>
          <p className="text-xs text-muted-foreground mt-0.5">Choose which layout students will receive when downloading their hall ticket.</p>
        </div>
        <div className="flex bg-secondary rounded-xl p-1 gap-1">
          <button
            onClick={async () => {
              setTemplate(prev => prev ? { ...prev, template_mode: 'editor' } : null);
              if (template?.id) {
                // Store mode in mapping_coordinates JSONB
                const updatedCoords = { ...(template.mapping_coordinates || {}), _mode: 'editor' };
                await supabase.from('hall_ticket_templates').update({ mapping_coordinates: updatedCoords, updated_at: new Date().toISOString() }).eq('id', template.id);
                setTemplate(prev => prev ? { ...prev, mapping_coordinates: updatedCoords as any } : null);
              }
              setSuccessMSG('Mode set to Template Editor. Students will get the editor-based layout.');
              setTimeout(() => setSuccessMSG(null), 3000);
            }}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              template?.template_mode !== 'builder'
                ? 'bg-indigo-500 text-white shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <FileText className="w-3.5 h-3.5 inline mr-1.5" />
            Template Editor
          </button>
          <button
            onClick={async () => {
              if (!template?.bg_image_url && !bgImage) {
                setErrorMSG('Please upload a background image in the Visual Builder tab first.');
                return;
              }
              setTemplate(prev => prev ? { ...prev, template_mode: 'builder' } : null);
              if (template?.id) {
                const updatedCoords = { ...(template.mapping_coordinates || {}), _mode: 'builder' };
                await supabase.from('hall_ticket_templates').update({ mapping_coordinates: updatedCoords, updated_at: new Date().toISOString() }).eq('id', template.id);
                setTemplate(prev => prev ? { ...prev, mapping_coordinates: updatedCoords as any } : null);
              }
              setSuccessMSG('Mode set to Visual Builder. Students will get the custom image-based layout.');
              setTimeout(() => setSuccessMSG(null), 3000);
            }}
            className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
              template?.template_mode === 'builder'
                ? 'bg-indigo-500 text-white shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Palette className="w-3.5 h-3.5 inline mr-1.5" />
            Visual Builder
          </button>
        </div>
      </div>

      {activeTab === 'template' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start fade-in">
          {/* Editor */}
          <div className="bg-card rounded-3xl p-6 shadow-sm border border-border flex flex-col" style={{ maxHeight: '80vh' }}>
            <h2 className="text-xl font-bold flex items-center gap-2 mb-6 shrink-0">
              <FileText className="w-5 h-5 text-indigo-500" />
              Template Settings
            </h2>
            
            <form onSubmit={handleSaveTemplate} className="space-y-5 overflow-y-auto flex-1 pr-1">
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">College Logo (Top Left)</label>
                <div className="flex items-center gap-4">
                  {template?.logo_url ? (
                    <div className="relative w-16 h-16 rounded-lg border border-border overflow-hidden bg-white">
                      <img src={template.logo_url} alt="Logo" className="w-full h-full object-contain" />
                      <button type="button" onClick={() => setTemplate(p => p ? {...p, logo_url: null} : null)} className="absolute inset-0 bg-black/50 opacity-0 hover:opacity-100 flex items-center justify-center transition-opacity text-white">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <div className="w-16 h-16 rounded-lg border-2 border-dashed border-border flex items-center justify-center bg-secondary/50 text-muted-foreground">
                      <ImageIcon className="w-6 h-6" />
                    </div>
                  )}
                  <input type="file" accept="image/*" className="hidden" ref={fileInputRef} onChange={handleLogoUpload} />
                  <button type="button" onClick={() => fileInputRef.current?.click()} className="px-4 py-2 bg-secondary hover:bg-secondary/80 rounded-xl text-sm font-medium border border-border transition-colors">
                    Upload Logo
                  </button>
                </div>
                <p className="text-xs text-muted-foreground mt-2">Recommended: PNG with transparent background. Max 2MB.</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Institution Name / Header</label>
                <input type="text" className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500" value={template?.institution_name || ''} onChange={e => setTemplate(prev => prev ? { ...prev, institution_name: e.target.value } : null)} required />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Ticket Title</label>
                <input type="text" className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500" value={template?.title || ''} onChange={e => setTemplate(prev => prev ? { ...prev, title: e.target.value } : null)} required />
              </div>

              <div>
                <label className="block text-sm font-medium text-foreground mb-1.5">Instructions to Candidates</label>
                <textarea rows={6} className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-y" value={template?.instructions || ''} onChange={e => setTemplate(prev => prev ? { ...prev, instructions: e.target.value } : null)} required />
              </div>

              {/* Signatures List */}
              <div className="pt-4 border-t border-border">
                <div className="flex justify-between items-center mb-4">
                  <label className="block text-sm font-medium text-foreground">Signatories (Bottom)</label>
                  <button type="button" onClick={addSignature} className="text-xs flex items-center gap-1 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 px-2 py-1 rounded-lg hover:bg-indigo-500/20 transition-colors">
                    <Plus className="w-3 h-3" /> Add Signature
                  </button>
                </div>
                
                <div className="space-y-3">
                  {(template?.signatures || []).map((sig, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                       <input type="text" className="flex-1 px-4 py-2.5 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm" value={sig} onChange={e => updateSignature(idx, e.target.value)} placeholder="e.g. Principal" required />
                       <button type="button" onClick={() => removeSignature(idx)} className="p-2.5 text-destructive hover:bg-destructive/10 rounded-xl transition-colors">
                         <Trash2 className="w-4 h-4" />
                       </button>
                    </div>
                  ))}
                  {(template?.signatures?.length || 0) === 0 && (
                    <p className="text-sm text-muted-foreground italic">No signatures defined.</p>
                  )}
                </div>
              </div>

              <button type="submit" disabled={saving} className="w-full flex items-center justify-center gap-2 bg-indigo-500 text-white font-bold py-3 px-4 rounded-xl hover:bg-indigo-600 disabled:opacity-50 transition-all shadow-sm mt-6">
                <Save className="w-5 h-5" />
                {saving ? 'Saving...' : 'Save Template'}
              </button>
            </form>
          </div>

          {/* Live Preview */}
          <div className="bg-secondary/30 rounded-3xl p-6 shadow-inner border border-border sticky top-24">
             <h2 className="text-sm font-bold text-muted-foreground uppercase tracking-wider mb-4 flex items-center justify-between">
                Live Preview
                <span className="text-xs bg-indigo-500/10 text-indigo-500 px-2 py-1 rounded-md">Draft PDF Structure</span>
             </h2>
             
             <div className="bg-white rounded-lg shadow border border-gray-200 aspect-[1/1.2] p-6 text-black flex flex-col" style={{ fontFamily: 'Helvetica, Arial, sans-serif' }}>
                <div className="flex items-center gap-4 mb-4">
                  {template?.logo_url && (
                    <img src={template.logo_url} alt="Logo" className="w-12 h-12 object-contain shrink-0" />
                  )}
                  <div className="flex-1 text-center">
                    <h1 className="text-lg font-bold uppercase text-gray-800">{template?.institution_name || 'Institution Name'}</h1>
                    <h2 className="text-sm font-bold uppercase text-indigo-800 mt-1">{template?.title || 'Hall Ticket'}</h2>
                  </div>
                  {/* Keep center alignment perfectly balanced if logo exists on the left */}
                  {template?.logo_url && <div className="w-12 shrink-0"></div>}
                </div>
                
                <hr className="border-gray-300 mb-4" />
                
                <div className="space-y-1 mb-4 text-sm">
                   <p><strong>Name:</strong> John Doe (Example)</p>
                   <p><strong>Student ID:</strong> 21CS001</p>
                </div>
                
                <div className="mb-4 flex-1">
                  <h3 className="text-sm font-bold border-b border-gray-300 pb-1 mb-2">Registered Subjects</h3>
                  <table className="w-full text-xs text-left">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <th className="py-1">Code</th>
                        <th className="py-1">Subject</th>
                        <th className="py-1">Date</th>
                        <th className="py-1">Time</th>
                      </tr>
                    </thead>
                    <tbody className="text-gray-700">
                      <tr>
                        <td className="py-1 border-b border-gray-100">CS301</td>
                        <td className="py-1 border-b border-gray-100">Data Structures</td>
                        <td className="py-1 border-b border-gray-100">14 Dec 2026</td>
                        <td className="py-1 border-b border-gray-100">10:00 AM</td>
                      </tr>
                      <tr>
                        <td className="py-1 border-b border-gray-100">CS302</td>
                        <td className="py-1 border-b border-gray-100">Algorithms</td>
                        <td className="py-1 border-b border-gray-100">16 Dec 2026</td>
                        <td className="py-1 border-b border-gray-100">10:00 AM</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
                
                <div className="mb-8">
                  <h3 className="text-sm font-bold border-b border-gray-300 pb-1 mb-2">Instructions</h3>
                  <div className="text-[10px] whitespace-pre-wrap text-gray-600 leading-relaxed">
                    {template?.instructions || 'No instructions provided.'}
                  </div>
                </div>
                
                {/* Dynamic Signatures */}
                <div className="flex justify-between items-end mt-auto pt-6 gap-2">
                   {(template?.signatures || []).map((sig, idx) => (
                     <div key={idx} className="text-[10px] sm:text-xs border-t border-gray-400 pt-1 text-center font-medium flex-1">
                       {sig}
                     </div>
                   ))}
                </div>
             </div>
          </div>
        </div>
      )}

      {/* =================== VISUAL BUILDER TAB =================== */}
      {activeTab === 'builder' && (
        <div className="grid grid-cols-1 xl:grid-cols-[300px_1fr] gap-6 items-start fade-in">
          {/* Sidebar: Variable Controls */}
          <div className="bg-card rounded-3xl p-6 shadow-sm border border-border flex flex-col" style={{ maxHeight: '85vh' }}>
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-500" />
                Variables
              </h2>
              <button
                onClick={resetBuilderToDefaults}
                className="text-xs flex items-center gap-1 bg-secondary hover:bg-secondary/80 px-2 py-1.5 rounded-lg transition-colors text-muted-foreground"
                title="Reset all positions to defaults"
              >
                <RotateCcw className="w-3 h-3" />
                Reset
              </button>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed shrink-0">
              Drag the labelled blocks on the canvas to position each field. Resize them by pulling corners.
            </p>

            <div className="flex-1 overflow-y-auto space-y-4 pr-1">

            {/* Background Image Upload */}
            <div className="border-t border-border pt-4">
              <label className="block text-sm font-medium text-foreground mb-2">Background Template Image</label>
              {bgImage ? (
                <div className="relative rounded-xl overflow-hidden border border-border bg-white">
                  <img src={bgImage} alt="Background" className="w-full h-32 object-cover" />
                  <button
                    onClick={() => setBgImage(null)}
                    className="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 rounded-lg text-white transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => bgUploadRef.current?.click()}
                  className="w-full py-10 border-2 border-dashed border-border rounded-xl flex flex-col items-center gap-2 text-muted-foreground hover:border-indigo-500/50 hover:text-indigo-500 transition-all hover:bg-indigo-500/5"
                >
                  <Upload className="w-7 h-7" />
                  <span className="text-sm font-semibold">Upload Hall Ticket Background</span>
                  <span className="text-[11px]">PNG or JPG &bull; Max 5MB</span>
                </button>
              )}
              <input type="file" accept="image/*" className="hidden" ref={bgUploadRef} onChange={handleBgImageUpload} />

              {/* Upload Guidance */}
              <div className="mt-3 bg-indigo-500/5 border border-indigo-500/15 rounded-xl p-3.5 space-y-2.5">
                <h4 className="text-xs font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1.5">
                  <ImageIcon className="w-3.5 h-3.5" />
                  What to Upload
                </h4>
                <ul className="text-[11px] text-muted-foreground space-y-1.5 leading-relaxed">
                  <li className="flex gap-2">
                    <span className="text-indigo-500 font-bold shrink-0">•</span>
                    <span><strong className="text-foreground">Your complete hall ticket design</strong> — with college name, logo, signatures, instructions, borders, watermarks, and all static content already printed on it.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-indigo-500 font-bold shrink-0">•</span>
                    <span><strong className="text-foreground">Leave blank areas</strong> where the student name, roll number, and subject table will be placed. Use the drag-and-drop canvas to position them.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-indigo-500 font-bold shrink-0">•</span>
                    <span><strong className="text-foreground">Orientation:</strong> Portrait (vertical) A4 layout.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-indigo-500 font-bold shrink-0">•</span>
                    <span><strong className="text-foreground">Size:</strong> 2480 × 3508 px (A4 at 300 DPI) recommended. PNG or JPG, max 5MB.</span>
                  </li>
                  <li className="flex gap-2">
                    <span className="text-indigo-500 font-bold shrink-0">•</span>
                    <span><strong className="text-foreground">Tip:</strong> Design in MS Word or Canva, then export as a high-quality image. You can also scan a printed letterhead.</span>
                  </li>
                </ul>
              </div>
            </div>

            {/* Variable List */}
            <div className="border-t border-border pt-4 space-y-2">
              {TEMPLATE_VARIABLES.map(v => {
                const coord = builderCoords[v.key];
                return (
                  <div
                    key={v.key}
                    className={`p-3 rounded-xl border transition-all cursor-pointer ${
                      activeVariable === v.key
                        ? 'border-indigo-500 bg-indigo-500/5 shadow-sm'
                        : 'border-border hover:border-indigo-500/30 hover:bg-secondary/50'
                    }`}
                    onClick={() => setActiveVariable(activeVariable === v.key ? null : v.key)}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: v.color }} />
                      <span className="text-sm font-medium text-foreground flex-1">{v.label}</span>
                      <Move className="w-3 h-3 text-muted-foreground" />
                    </div>
                    {activeVariable === v.key && coord && (
                      <div className="mt-3 space-y-2" onClick={e => e.stopPropagation()}>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-[10px] text-muted-foreground block mb-0.5">X%</label>
                            <input type="number" min={0} max={100} step={0.5} className="w-full px-2 py-1 bg-background border border-border rounded-lg text-xs" value={Math.round(coord.x * 10) / 10} onChange={e => setBuilderCoords(prev => ({...prev, [v.key]: {...prev[v.key], x: parseFloat(e.target.value) || 0}}))} />
                          </div>
                          <div>
                            <label className="text-[10px] text-muted-foreground block mb-0.5">Y%</label>
                            <input type="number" min={0} max={100} step={0.5} className="w-full px-2 py-1 bg-background border border-border rounded-lg text-xs" value={Math.round(coord.y * 10) / 10} onChange={e => setBuilderCoords(prev => ({...prev, [v.key]: {...prev[v.key], y: parseFloat(e.target.value) || 0}}))} />
                          </div>
                        </div>
                        <div>
                          <label className="text-[10px] text-muted-foreground block mb-0.5">Font Size (pt)</label>
                          <input type="number" min={6} max={36} className="w-full px-2 py-1 bg-background border border-border rounded-lg text-xs" value={coord.fontSize || 12} onChange={e => handleFontSizeChange(v.key, parseInt(e.target.value) || 12)} />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            </div>

            {/* Save Button */}
            <button
              onClick={handleSaveBuilder}
              disabled={savingBuilder}
              className="w-full flex items-center justify-center gap-2 bg-indigo-500 text-white font-bold py-3 px-4 rounded-xl hover:bg-indigo-600 disabled:opacity-50 transition-all shadow-sm"
            >
              <Save className="w-5 h-5" />
              {savingBuilder ? 'Saving Layout...' : 'Save Visual Layout'}
            </button>
          </div>

          {/* Canvas Area */}
          <div className="bg-card rounded-3xl p-6 shadow-sm border border-border">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold flex items-center gap-2">
                <Palette className="w-5 h-5 text-indigo-500" />
                Template Canvas
              </h2>
              <span className="text-xs bg-indigo-500/10 text-indigo-500 px-3 py-1.5 rounded-lg font-medium">
                A4 Portrait Preview — Drag & Resize
              </span>
            </div>

            <div
              ref={canvasContainerRef}
              className="relative bg-white rounded-xl shadow-lg border border-gray-200 overflow-hidden mx-auto"
              style={{
                width: '100%',
                height: canvasSize.height || 'auto',
                aspectRatio: canvasSize.height ? undefined : '1 / 1.414',
              }}
            >
              {/* Background Image */}
              {bgImage && (
                <img
                  src={bgImage}
                  alt="Template Background"
                  className="absolute inset-0 w-full h-full object-cover pointer-events-none"
                  style={{ opacity: 0.3 }}
                />
              )}

              {/* Grid overlay */}
              {!bgImage && (
                <div className="absolute inset-0" style={{
                  backgroundImage: 'linear-gradient(rgba(99,102,241,0.06) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.06) 1px, transparent 1px)',
                  backgroundSize: '10% 10%',
                }} />
              )}

              {/* Draggable Variables */}
              {canvasSize.width > 0 && TEMPLATE_VARIABLES.map(v => {
                const coord = builderCoords[v.key];
                if (!coord) return null;

                const pixelX = (coord.x / 100) * canvasSize.width;
                const pixelY = (coord.y / 100) * canvasSize.height;
                const pixelW = (coord.w / 100) * canvasSize.width;
                const pixelH = (coord.h / 100) * canvasSize.height;

                return (
                  <Rnd
                    key={v.key}
                    position={{ x: pixelX, y: pixelY }}
                    size={{ width: pixelW, height: pixelH }}
                    onDragStop={(_e, d) => handleVariableDragStop(v.key, d.x, d.y)}
                    onResizeStop={(_e, _dir, ref, _delta, pos) => {
                      handleVariableResize(v.key, ref.offsetWidth, ref.offsetHeight, pos.x, pos.y);
                    }}
                    bounds="parent"
                    minWidth={30}
                    minHeight={16}
                    style={{ zIndex: activeVariable === v.key ? 50 : 10 }}
                  >
                    <div
                      className={`w-full h-full rounded-lg flex items-center justify-center cursor-move select-none transition-all ${
                        activeVariable === v.key ? 'ring-2 ring-offset-1' : ''
                      }`}
                      style={{
                        backgroundColor: `${v.color}18`,
                        border: `2px solid ${v.color}60`,
                      }}
                      onClick={() => setActiveVariable(v.key)}
                    >
                      <span className="text-[10px] sm:text-xs font-bold px-1 truncate" style={{ color: v.color }}>
                        {v.label}
                      </span>
                    </div>
                  </Rnd>
                );
              })}

              {/* Empty state */}
              {!bgImage && canvasSize.width === 0 && (
                <div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
                  <p className="text-sm">Canvas loading...</p>
                </div>
              )}
            </div>

            {/* Coordinate Summary */}
            <div className="mt-4 bg-secondary/30 rounded-xl p-4 border border-border">
              <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Saved Coordinates (% of page)</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {TEMPLATE_VARIABLES.map(v => {
                  const coord = builderCoords[v.key];
                  return (
                    <div key={v.key} className="text-[10px] bg-background rounded-lg p-2 border border-border">
                      <div className="flex items-center gap-1 mb-1">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: v.color }} />
                        <span className="font-medium">{v.label}</span>
                      </div>
                      {coord ? (
                        <span className="text-muted-foreground font-mono">
                          x:{Math.round(coord.x)}% y:{Math.round(coord.y)}% {coord.fontSize}pt
                        </span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'timetable' && (
        <div className="bg-card rounded-3xl p-6 shadow-sm border border-border animation-fade-in relative">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-4">
            <div>
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Calendar className="w-5 h-5 text-indigo-500" />
                Examination Timetable
              </h2>
              <p className="text-sm text-muted-foreground mt-1">Map subjects to exam dates and times globally.</p>
            </div>
            <div className="flex flex-wrap gap-2 w-full sm:w-auto">
              <button onClick={handleDownloadCSVTemplate} className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-background border border-border text-foreground hover:bg-secondary px-4 py-2.5 rounded-xl text-sm font-medium transition-colors" title="Download Template">
                <Download className="w-4 h-4" /> <span className="hidden md:inline">Template</span>
              </button>
              <input type="file" accept=".csv" className="hidden" ref={csvInputRef} onChange={handleCSVUpload} />
              <button onClick={() => csvInputRef.current?.click()} className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-secondary text-foreground hover:bg-secondary/80 px-4 py-2.5 rounded-xl text-sm font-medium transition-colors">
                <Upload className="w-4 h-4" /> CSV Upload
              </button>
              <button disabled={savingTime} onClick={saveTimetable} className="flex-1 sm:flex-none flex items-center justify-center gap-2 bg-indigo-500 text-white px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-600 transition-colors disabled:opacity-50">
                <Save className="w-4 h-4" /> Save
              </button>
            </div>
          </div>

          <div className="mb-4 text-xs bg-indigo-500/10 text-indigo-800 dark:text-indigo-300 p-4 rounded-xl border border-indigo-500/20">
            <strong>CSV Format Required:</strong> Your CSV must contain exact headers: <code>Subject Code</code>, <code>Exam Date</code>, <code>Exam Time</code>. Other columns will be ignored.
          </div>

          <div className="space-y-8">
            {departments.length === 0 && <p className="text-muted-foreground text-center py-8">No departments found.</p>}
            
            {departments.map(dept => {
              const deptSubjects = subjects.filter(s => s.department_id === dept.id);
              if (deptSubjects.length === 0) return null;

              return (
                <div key={dept.id} className="border border-border rounded-2xl overflow-hidden shadow-sm">
                  <div className="bg-secondary/30 px-6 py-4 border-b border-border text-foreground font-bold text-lg">
                    {dept.name}
                  </div>
                  
                  {semesters.map(sem => {
                    const semSubjects = deptSubjects.filter(s => s.semester_id === sem.id);
                    if (semSubjects.length === 0) return null;

                    return (
                      <div key={sem.id} className="border-b border-border last:border-b-0">
                        <div className="bg-background px-6 py-3 text-sm font-bold text-indigo-600 dark:text-indigo-400 border-b border-border border-dashed">
                          {sem.name}
                        </div>
                        <div className="px-6 py-4">
                          <div className="overflow-x-auto">
                            <table className="w-full text-left text-sm">
                              <thead>
                                <tr className="text-muted-foreground">
                                  <th className="pb-3 font-medium w-1/4">Code</th>
                                  <th className="pb-3 font-medium w-1/3">Subject</th>
                                  <th className="pb-3 font-medium w-1/5">Date</th>
                                  <th className="pb-3 font-medium w-1/5">Time</th>
                                </tr>
                              </thead>
                              <tbody>
                                {semSubjects.map(sub => (
                                  <tr key={sub.id} className="hover:bg-secondary/20 transition-colors group">
                                    <td className="py-2.5 font-medium">{sub.subject_code}</td>
                                    <td className="py-2.5">{sub.subject_name}</td>
                                    <td className="py-2.5 pr-4">
                                      <input 
                                        type="date" 
                                        className="w-full px-3 py-1.5 bg-background border border-border rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                                        value={sub.exam_date || ''}
                                        onChange={(e) => handleSubjectTimeChange(sub.id, 'exam_date', e.target.value)}
                                      />
                                    </td>
                                    <td className="py-2.5">
                                      <input 
                                        type="text" 
                                        placeholder="e.g. 10:00 AM - 1:00 PM"
                                        className="w-full px-3 py-1.5 bg-background border border-border rounded-lg text-xs focus:ring-1 focus:ring-indigo-500 outline-none"
                                        value={sub.exam_time || ''}
                                        onChange={(e) => handleSubjectTimeChange(sub.id, 'exam_time', e.target.value)}
                                      />
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
