"use client";

import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // A real deployment would ship this to an error-tracking sink.
    // eslint-disable-next-line no-console
    console.error("StadiumOS crashed:", error, info.componentStack);
  }

  private handleReset = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    if (this.state.error) {
      return (
        <div className="crash-panel" role="alert">
          <div className="crash-panel__code">SYS_FAULT</div>
          <h2>The simulation core hit an unrecoverable error.</h2>
          <p>{this.state.error.message}</p>
          <button type="button" className="btn btn--primary" onClick={this.handleReset}>
            Restart StadiumOS
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
