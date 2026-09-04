import React, { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallbackTitle?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    this.setState({ error, errorInfo });
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="p-6 m-4 bg-[#0d1c32] border border-red-500/50 rounded-lg text-[#dbfcff]">
          <h2 className="text-lg font-bold text-red-400 mb-2">
            {this.props.fallbackTitle || 'Component Error Detected'}
          </h2>
          <div className="font-mono text-xs text-red-300 bg-[#010e24] p-3 rounded overflow-auto max-h-60 mb-4 whitespace-pre-wrap">
            {this.state.error?.toString()}
            {'\n'}
            {this.state.errorInfo?.componentStack}
          </div>
          <button
            onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })}
            className="px-4 py-2 bg-[#00f0ff] text-[#00363a] font-mono text-xs font-bold rounded cursor-pointer hover:bg-[#00dbe9]"
          >
            Retry Component
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
