import { useState } from 'react';
import { X, Flag, AlertTriangle, CheckCircle2, Send, ChevronDown } from 'lucide-react';
import { useAuth } from '../lib/useAuth';
import { submitIssue } from '../lib/api/issues';

const CATEGORIES = [
  { value: 'ui_bug', label: 'UI or Display Bug' },
  { value: 'performance', label: 'Performance Issue' },
  { value: 'wrong_data', label: 'Wrong Data' },
  { value: 'feature_broken', label: 'Feature Not Working' },
  { value: 'access_issue', label: 'Access or Permission Problem' },
  { value: 'other', label: 'Other' },
];

const SEVERITIES = [
  { value: 'low', label: 'Low', desc: 'Minor issue', color: 'bg-slate-500/10 text-slate-600 border-slate-500/20' },
  { value: 'medium', label: 'Medium', desc: 'Affecting work', color: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
  { value: 'high', label: 'High', desc: 'Blocking work', color: 'bg-orange-500/10 text-orange-600 border-orange-500/20' },
  { value: 'critical', label: 'Critical', desc: 'Data loss or system down', color: 'bg-red-500/10 text-red-600 border-red-500/20' },
];

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function ReportIssueModal({ isOpen, onClose }: Props) {
  const { user, profile } = useAuth();
  const [category, setCategory] = useState('');
  const [severity, setSeverity] = useState('medium');
  const [description, setDescription] = useState('');
  const [pageName, setPageName] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !profile) return;
    if (description.length < 10) {
      setError('Description must be at least 10 characters.');
      return;
    }
    if (!category) {
      setError('Please select a category.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      await submitIssue(
        { category, severity, description, page_name: pageName || undefined },
        {
          id: user.id,
          full_name: profile.full_name || 'Unknown',
          email: profile.email || undefined,
          role: profile.role || 'unknown',
          tenant_id: profile.tenant_id || undefined,
        }
      );
      setSubmitted(true);
      setTimeout(() => {
        handleClose();
      }, 2500);
    } catch (err: any) {
      setError(err.message || 'Failed to submit issue. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    setCategory('');
    setSeverity('medium');
    setDescription('');
    setPageName('');
    setSubmitted(false);
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-3 sm:p-4 animate-fade-in">
      <div className="bg-card rounded-2xl sm:rounded-3xl p-6 sm:p-8 shadow-2xl border border-border w-full max-w-lg relative max-h-[90vh] overflow-y-auto">
        {/* Close button */}
        <button
          onClick={handleClose}
          className="absolute top-3 right-3 sm:top-4 sm:right-4 p-2 rounded-full hover:bg-secondary transition-colors"
        >
          <X className="w-4 h-4 text-muted-foreground" />
        </button>

        {/* Success State */}
        {submitted ? (
          <div className="flex flex-col items-center text-center py-8">
            <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mb-4">
              <CheckCircle2 className="w-8 h-8 text-emerald-500" />
            </div>
            <h3 className="text-xl font-bold text-foreground mb-2">Issue Reported</h3>
            <p className="text-muted-foreground text-sm">
              Thank you. Our team will look into it.
            </p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center shadow-lg">
                <Flag className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-lg sm:text-xl font-bold text-foreground">Report an Issue</h3>
                <p className="text-xs text-muted-foreground">Help us improve by reporting problems</p>
              </div>
            </div>

            {error && (
              <div className="mb-4 p-3 bg-destructive/10 text-destructive text-sm rounded-xl border border-destructive/20 flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Category */}
              <div>
                <label className="block text-sm font-semibold text-foreground mb-1.5">
                  Category <span className="text-destructive">*</span>
                </label>
                <div className="relative">
                  <select
                    value={category}
                    onChange={e => setCategory(e.target.value)}
                    required
                    className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary appearance-none text-foreground text-sm"
                  >
                    <option value="" disabled>Select issue type...</option>
                    {CATEGORIES.map(c => (
                      <option key={c.value} value={c.value}>{c.label}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-3.5 w-4 h-4 text-muted-foreground pointer-events-none" />
                </div>
              </div>

              {/* Severity */}
              <div>
                <label className="block text-sm font-semibold text-foreground mb-1.5">Severity</label>
                <div className="grid grid-cols-2 gap-2">
                  {SEVERITIES.map(s => (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => setSeverity(s.value)}
                      className={`px-3 py-2.5 rounded-xl border-2 text-left transition-all text-sm ${
                        severity === s.value
                          ? `${s.color} border-current ring-2 ring-current/20`
                          : 'bg-secondary/50 border-border text-muted-foreground hover:border-border/80'
                      }`}
                    >
                      <span className="font-bold block text-xs">{s.label}</span>
                      <span className="text-[10px] opacity-70">{s.desc}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-semibold text-foreground mb-1.5">
                  Description <span className="text-destructive">*</span>
                </label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  required
                  minLength={10}
                  rows={4}
                  className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-foreground text-sm resize-none"
                  placeholder="Describe the issue and what you expected to happen..."
                />
                <p className="text-[10px] text-muted-foreground mt-1 text-right">
                  {description.length} / min 10 characters
                </p>
              </div>

              {/* Page / Screen (optional) */}
              <div>
                <label className="block text-sm font-semibold text-foreground mb-1.5">
                  Page / Screen <span className="text-muted-foreground text-xs font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  value={pageName}
                  onChange={e => setPageName(e.target.value)}
                  className="w-full px-4 py-3 bg-background border border-border rounded-xl focus:outline-none focus:ring-2 focus:ring-primary text-foreground text-sm"
                  placeholder="e.g. Student Dashboard > Attendance Fines"
                />
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={isSubmitting || !category || description.length < 10}
                className="w-full mt-2 bg-gradient-to-r from-amber-500 to-orange-500 text-white font-bold py-3 px-4 rounded-xl hover:from-amber-600 hover:to-orange-600 transition-all shadow-md disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Submit Report
                  </>
                )}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
