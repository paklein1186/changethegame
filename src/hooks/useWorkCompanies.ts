import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useWorkCompanies(userId: string | undefined) {
  return useQuery({
    queryKey: ["work-companies", userId],
    enabled: !!userId,
    staleTime: 60_000,
    queryFn: async () => {
      if (!userId) return [];
      const { data, error } = await supabase.from("company_members")
        .select("company_id, role, companies(id, name, logo_url)")
        .eq("user_id", userId);
      if (error) throw error;
      return (data || []).filter((m) => m.companies).map((m) => ({
        companyId: m.company_id, role: m.role, company: m.companies,
      }));
    },
  });
}