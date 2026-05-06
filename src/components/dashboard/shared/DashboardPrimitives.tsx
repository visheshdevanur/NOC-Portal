/**
 * Reusable Dashboard Components
 * FIX #7: Shared UI primitives extracted from god-components.
 * 
 * These replace duplicated markup across Staff, Clerk, HOD, FYC dashboards.
 */
import { memo } from 'react';
import type { ReactNode } from 'react';
import { X, Search, RefreshCw } from 'lucide-react';

// ─── Error Banner ───
export const ErrorBanner = memo(({ message, onDismiss }: { message: string | null; onDismiss: () => void }) => {
  if (!message) return null;
  return (
    <div role="alert" aria-live="assertive" className="p-4 bg-destructive/10 border border-destructive/20 rounded-xl text-destructive text-sm flex justify-between items-center">
      <span><strong>Error:</strong> {message}</span>
      <button onClick={onDismiss} aria-label="Dismiss error"><X className="w-4 h-4" /></button>
    </div>
  );
});
ErrorBanner.displayName = 'ErrorBanner';

// ─── Success Banner ───
export const SuccessBanner = memo(({ message, onDismiss }: { message: string | null; onDismiss: () => void }) => {
  if (!message) return null;
  return (
    <div role="status" aria-live="polite" className="p-4 bg-emerald-500/10 border border-emerald-500/20 rounded-xl text-emerald-600 dark:text-emerald-400 text-sm flex justify-between items-center">
      <span>✓ {message}</span>
      <button onClick={onDismiss} aria-label="Dismiss success"><X className="w-4 h-4" /></button>
    </div>
  );
});
SuccessBanner.displayName = 'SuccessBanner';

// ─── Search Bar ───
export const SearchBar = memo(({ value, onChange, placeholder = 'Search...' }: { 
  value: string; 
  onChange: (v: string) => void; 
  placeholder?: string;
}) => (
  <div className="relative flex-1 max-w-md">
    <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
    <input
      type="text"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      aria-label={placeholder}
      className="w-full pl-10 pr-4 py-2.5 bg-secondary/50 border border-border rounded-xl text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary/40 transition-all"
    />
    {value && (
      <button
        onClick={() => onChange('')}
        className="absolute right-3 top-1/2 -translate-y-1/2"
        aria-label="Clear search"
      >
        <X className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
      </button>
    )}
  </div>
));
SearchBar.displayName = 'SearchBar';

// ─── Empty State ───
export const EmptyState = memo(({ icon, message }: { icon: ReactNode; message: string }) => (
  <div className="text-center py-16">
    <div className="inline-flex items-center justify-center w-16 h-16 bg-secondary rounded-2xl mb-4">
      {icon}
    </div>
    <p className="text-muted-foreground text-sm">{message}</p>
  </div>
));
EmptyState.displayName = 'EmptyState';

// ─── Loading Skeleton ───
export const LoadingSkeleton = memo(({ rows = 5 }: { rows?: number }) => (
  <div className="space-y-3 animate-pulse">
    {Array.from({ length: rows }).map((_, i) => (
      <div key={i} className="h-14 bg-secondary/50 rounded-xl" />
    ))}
  </div>
));
LoadingSkeleton.displayName = 'LoadingSkeleton';

// ─── Section Header ───
export const SectionHeader = memo(({ 
  title, 
  subtitle, 
  icon, 
  action,
  onRefresh 
}: { 
  title: string; 
  subtitle?: string; 
  icon: ReactNode; 
  action?: ReactNode;
  onRefresh?: () => void;
}) => (
  <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-4">
    <div>
      <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
        {icon}
        {title}
      </h2>
      {subtitle && <p className="text-muted-foreground text-sm mt-1">{subtitle}</p>}
    </div>
    <div className="flex items-center gap-2">
      {onRefresh && (
        <button
          onClick={onRefresh}
          className="p-2 rounded-lg hover:bg-secondary transition-colors"
          aria-label="Refresh"
        >
          <RefreshCw className="w-4 h-4 text-muted-foreground" />
        </button>
      )}
      {action}
    </div>
  </div>
));
SectionHeader.displayName = 'SectionHeader';

// ─── Stat Card ───
export const StatCard = memo(({ label, value, icon, color = 'primary' }: {
  label: string;
  value: string | number;
  icon: ReactNode;
  color?: 'primary' | 'emerald' | 'amber' | 'destructive';
}) => {
  const colorMap = {
    primary: 'bg-primary/10 text-primary',
    emerald: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400',
    amber: 'bg-amber-500/10 text-amber-600 dark:text-amber-400',
    destructive: 'bg-destructive/10 text-destructive',
  };
  return (
    <div className="bg-card rounded-2xl p-5 shadow-sm border border-border">
      <div className="flex items-center gap-3 mb-2">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colorMap[color]}`}>
          {icon}
        </div>
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
    </div>
  );
});
StatCard.displayName = 'StatCard';
