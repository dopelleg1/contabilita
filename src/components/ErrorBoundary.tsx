import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error caught by ErrorBoundary:", error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="bg-white border border-slate-200 rounded-2xl p-6 max-w-md w-full shadow-lg text-center space-y-4">
            <div className="inline-flex p-3 bg-rose-50 border border-rose-100 rounded-xl text-rose-600">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h1 className="text-lg font-bold text-slate-900">Si è verificato un errore</h1>
            <p className="text-xs text-slate-500 leading-relaxed">
              L'applicazione ha riscontrato un problema imprevisto. Puoi provare a ricaricare la pagina o a ripristinare lo stato iniziale.
            </p>
            {this.state.error && (
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-100 text-left">
                <p className="text-[10px] font-mono text-slate-600 break-all overflow-auto max-h-24">
                  {this.state.error.toString()}
                </p>
              </div>
            )}
            <button
              onClick={this.handleReset}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-xs rounded-xl shadow transition-all cursor-pointer"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              Ricarica Applicazione
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
