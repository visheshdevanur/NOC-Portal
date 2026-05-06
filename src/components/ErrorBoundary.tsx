import React, { Component, ErrorInfo } from 'react';

interface Props {
  children: React.ReactNode;
  fallback?: React.ReactNode;
  /** Dashboard name for error reporting */
  dashboardName?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Global error boundary that catches rendering errors in dashboard components.
 * Prevents a single dashboard crash from taking down the entire app.
 * Reports errors to the log-error Edge Function for monitoring.
 */
export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught:', error, errorInfo);

    // Report to log-error Edge Function (fire-and-forget)
    import('../lib/supabase').then(({ supabase }) => {
      supabase.functions.invoke('log-error', {
        body: {
          dashboard_name: this.props.dashboardName || 'Unknown',
          error_code: 'RENDER_CRASH',
          severity: 'CRITICAL',
          error_detail: `${error.message}\n\nComponent Stack:\n${errorInfo.componentStack || 'N/A'}`,
        },
      }).catch(() => {}); // Ignore reporting failures
    }).catch(() => {});
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <div className="min-h-[400px] flex flex-col items-center justify-center gap-6 p-8">
          <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center">
            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-red-500">
              <circle cx="12" cy="12" r="10"/>
              <line x1="12" y1="8" x2="12" y2="12"/>
              <line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
          </div>
          <div className="text-center">
            <h2 className="text-lg font-semibold text-foreground mb-2">Something went wrong</h2>
            <p className="text-sm text-muted-foreground max-w-md">
              {this.state.error?.message || 'An unexpected error occurred. This has been reported automatically.'}
            </p>
          </div>
          <button
            onClick={this.handleRetry}
            className="px-6 py-2.5 rounded-xl bg-primary text-primary-foreground font-medium text-sm hover:opacity-90 transition-opacity"
          >
            Try Again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
