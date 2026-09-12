import React from 'react';
import { useNavigate } from 'react-router-dom';

// Top-level error boundary: a render crash must never white-screen the demo.
// Shows a human message with a way back into the product.
class ErrorBoundary extends React.Component<{ children: React.ReactNode }, { error: Error | null }> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Kisan360 render error:', error.message, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <ErrorFallback
          message={this.state.error.message}
          onRetry={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}

// The fallback needs routing ("Go to Dashboard" must actually reset the
// crashing route, not re-mount the same broken tree), so it lives as a
// function component inside the Router context.
function ErrorFallback({ message, onRetry }: { message: string; onRetry: () => void }) {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-stone-50 flex items-center justify-center px-4">
      <div className="card p-8 max-w-md text-center">
        <div className="text-3xl">⚠️</div>
        <h1 className="text-lg font-semibold text-stone-900 mt-3">Something went wrong on this screen</h1>
        <p className="text-sm text-stone-500 mt-2">
          The rest of Kisan360 is still available. Your data is safe — this was a display error, not a data error.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-2 mt-5">
          <button className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-stone-200 bg-white text-stone-700 text-[13px] font-semibold hover:bg-stone-50 transition-colors" onClick={onRetry}>Try again</button>
          <button
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-800 text-white text-[13px] font-semibold hover:bg-emerald-900 shadow-sm transition-colors"
            onClick={() => { onRetry(); navigate('/dashboard', { replace: true }); }}
          >
            Go to Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}

export default ErrorBoundary;
