import i18n from "@/i18n/config";
import { Component, type ErrorInfo, type ReactNode } from "react";
import { ServerCrash, RefreshCw, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { logger } from "@/lib/logger";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  children: ReactNode;
  /** Optional fallback UI. When omitted, a default crash screen is shown. */
  fallback?: ReactNode;
  /** Optional label for log context (e.g. "AdminPanel", "QuestDetail") */
  label?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

/**
 * Generic React Error Boundary.
 *
 * Catches render-time errors in its subtree and shows a recovery UI
 * instead of a white screen. Also logs the error via the centralized logger.
 *
 * Usage:
 *   <ErrorBoundary label="QuestDetail">
 *     <QuestDetail />
 *   </ErrorBoundary>
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
    const label = this.props.label ?? "ErrorBoundary";
    logger.error(`[${label}] Uncaught render error:`, error, errorInfo.componentStack);
  }

  private handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  // A rejected session (edge function answered 401) is recoverable by signing
  // in again; keep the user out of a dead end.
  private isAuthFailure = () => {
    const message = this.state.error?.message ?? "";
    return /\b401\b|Unauthorized/i.test(message);
  };

  private handleSignInAgain = async () => {
    try {
      await supabase.auth.signOut();
    } catch {
      // ignore: the local session is cleared either way
    }
    window.location.assign("/login");
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      const authFailure = this.isAuthFailure();

      return (
        <div className="flex min-h-[50vh] items-center justify-center">
          <div className="text-center max-w-md px-6">
            <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
              <ServerCrash className="h-8 w-8 text-destructive" />
            </div>
            <h2 className="mb-2 text-2xl font-bold font-display">
              {authFailure ? i18n.t("uiErrorBoundary.sessionExpired") : i18n.t("uiErrorBoundary.somethingWentWrong")}
            </h2>
            <p className="mb-2 text-muted-foreground">
              {authFailure
                ? i18n.t("uiErrorBoundary.signInAgainToContinue")
                : i18n.t("uiErrorBoundary.unexpectedErrorRetry")}
            </p>
            {this.state.error && (
              <p className="mb-4 text-xs text-muted-foreground/60 font-mono break-all">
                {this.state.error.message}
              </p>
            )}
            <div className="flex gap-3 justify-center">
              {authFailure ? (
                <Button variant="default" onClick={this.handleSignInAgain}>
                  <LogIn className="mr-2 h-4 w-4" />
                  {i18n.t("uiErrorBoundary.signInAgain")}
                </Button>
              ) : (
                <Button variant="outline" onClick={this.handleRetry}>
                  <RefreshCw className="mr-2 h-4 w-4" />
                  {i18n.t("uiErrorBoundary.retry")}
                </Button>
              )}
              <Button variant={authFailure ? "outline" : "default"} onClick={() => window.location.assign("/")}>
                {i18n.t("uiErrorBoundary.backToHome")}
              </Button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
