import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ErrorBoundary from "@/components/ErrorBoundary";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { auth: { signOut: () => Promise.resolve() } },
}));

describe("debug retry", () => {
  it("logs dom after click", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
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
    const retry = screen.getByRole("button", { name: /retry/i });
    console.log("BEFORE:", document.body.innerText.replace(/\s+/g, " ").slice(0, 200));
    shouldThrow = false;
    fireEvent.click(retry);
    console.log("AFTER :", document.body.innerText.replace(/\s+/g, " ").slice(0, 200));
    expect(true).toBe(true);
  });
});
