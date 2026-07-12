import { Component, type ErrorInfo, type ReactNode } from 'react';

type Props = {
  children: ReactNode;
  title?: string;
  onRetry?: () => void;
};

type State = {
  error: Error | null;
};

export class AdminPanelErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[AdminPanelErrorBoundary]', error, info.componentStack);
  }

  private retry = () => {
    this.setState({ error: null });
    this.props.onRetry?.();
  };

  render() {
    if (this.state.error) {
      return (
        <div className="admin-panel-error-boundary" role="alert">
          <h4>{this.props.title || 'This page failed to load'}</h4>
          <p className="muted">
            {this.state.error.message || 'An unexpected error occurred while rendering this tab.'}
          </p>
          <button type="button" onClick={this.retry}>
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
