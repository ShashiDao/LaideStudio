import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
  resetKey?: string;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  componentDidUpdate(prevProps: Props) {
    if (this.props.resetKey !== prevProps.resetKey && this.state.error !== null) {
      this.setState({ error: null });
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center bg-bg canvas-grid-pattern h-full w-full">
          <div className="flex flex-col items-center gap-4 text-oxide font-sans text-sm border border-oxide/30 bg-surface/90 p-8 rounded-lg max-w-md overflow-auto corner-ticks shadow-sm">
            <AlertCircle size={32} className="shrink-0 text-oxide" />
            <h2 className="text-lg font-bold text-text">Something went wrong</h2>
            <p className="whitespace-pre-wrap text-left break-all font-mono text-xs max-h-48 overflow-y-auto w-full p-2 bg-black/10 rounded">
              {this.state.error.message}
            </p>
            <button
              onClick={this.handleReload}
              className="mt-4 w-full py-2.5 px-3 bg-accent text-accent-text-on font-mono font-bold text-xs rounded flex items-center justify-center gap-2 hover:bg-accent/90 transition-colors shadow-xs cursor-pointer"
            >
              <RefreshCw size={14} />
              <span>Reload App</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
