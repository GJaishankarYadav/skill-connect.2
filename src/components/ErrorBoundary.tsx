import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    message: ''
  };

  public static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      message: error.message || 'An unexpected error occurred.'
    };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught application error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      return (
        <section className="section">
          <div className="container narrow">
            <div className="form-card">
              <span className="eyebrow">Application Notice</span>
              <h1>Something went wrong</h1>
              <p className="muted">
                Please reload the page or try your request again.
              </p>
              <div className="alert error" style={{ wordBreak: 'break-word' }}>
                {this.state.message}
              </div>
              <button
                type="button"
                className="btn primary"
                onClick={() => window.location.reload()}
              >
                Reload Page
              </button>
            </div>
          </div>
        </section>
      );
    }

    return this.props.children;
  }
}
