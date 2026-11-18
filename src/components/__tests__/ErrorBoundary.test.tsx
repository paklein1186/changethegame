import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ErrorBoundary from "@/components/ErrorBoundary";

const signOut = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { signOut: () => signOut() } },
}));

const Boom = ({ message }: { message: string }) => {
  throw new Error(message);
};

describe("ErrorBoundary", () => {
  beforeEach(() => {
    signOut.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
  });

  it("shows a sign-in recovery path when an edge function rejected the session", () => {
    render(
      <ErrorBoundary label="App">
        <Boom message={'Edge function returned 401: Error, {"error":"Unauthorized"}'} />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Your session has expired")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /sign in again/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /retry/i })).not.toBeInTheDocument();
  });

  it("shows a retry path for any other crash and re-renders the child", () => {
    let shouldThrow = true;
    const Flaky = () => {
      if (shouldThrow) throw new Error("boom");
      return <p>recovered</p>;
    };

    render(
      <ErrorBoundary label="App">
        <Flaky />
      </ErrorBoundary>,
    );

    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    const retry = screen.getByRole("button", { name: /retry/i });
    expect(retry).toBeInTheDocument();

    shouldThrow = false;
    fireEvent.click(retry);

    expect(screen.getByText("recovered")).toBeInTheDocument();
  });
});
