import { describe, it, expect, vi } from "vitest";
import { useWorkCompanies } from "../useWorkCompanies";

const mocks = vi.hoisted(() => ({ select: vi.fn(), eq: vi.fn() }));
vi.mock("@tanstack/react-query", () => ({ useQuery: (options: unknown) => options }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ select: mocks.select }) },
}));

describe("compact work company query", () => {
  it("loads only the membership and company fields needed by the list", async () => {
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockResolvedValue({ data: [{ company_id: "company-1", role: "MEMBER", companies: { id: "company-1", name: "Company", logo_url: null } }], error: null });
    const options = useWorkCompanies("user-1") as unknown as { queryFn: () => Promise<unknown>; staleTime: number };
    expect(await options.queryFn()).toEqual([{ companyId: "company-1", role: "MEMBER", company: { id: "company-1", name: "Company", logo_url: null } }]);
    expect(mocks.select).toHaveBeenCalledWith("company_id, role, companies(id, name, logo_url)");
    expect(mocks.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(options.staleTime).toBe(60_000);
  });
});