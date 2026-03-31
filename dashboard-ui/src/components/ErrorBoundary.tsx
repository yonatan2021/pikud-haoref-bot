import { Component, type ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { hasError: boolean }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[var(--color-base)] text-[var(--color-text-primary)]" dir="rtl">
          <div className="text-center space-y-4">
            <p className="text-lg font-medium">שגיאה בטעינת העמוד</p>
            <p className="text-sm text-[var(--color-text-muted)]">ייתכן שיש בעיית רשת — נסה לטעון מחדש</p>
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-2 bg-[var(--color-amber)] text-black rounded-lg font-medium hover:opacity-90 transition-opacity"
            >
              טען מחדש
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
