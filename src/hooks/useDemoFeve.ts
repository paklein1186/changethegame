import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { isDemoFeveEmail } from "@/lib/demoFeve";

export type DemoFeveSnapshot = {
  registry_count: number;
  profiles: any[];
  territories: any[];
  companies: any[];
  guilds: any[];
  quests: any[];
  quest_needs: any[];
  opportunity_needs: any[];
  opportunity_matches: any[];
  capabilities: any[];
  services: any[];
  feed_posts: any[];
  natural_systems: any[];
  natural_system_indicators: any[];
  quest_territories: any[];
  company_territories: any[];
  guild_territories: any[];
  service_territories: any[];
  guild_events: any[];
};

export function useDemoFeveAccess() {
  const { user, loading: authLoading } = useAuth();
  const query = useQuery({
    queryKey: ["demo-feve-access", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("is_demo_feve_viewer");
      if (error) throw error;
      return data === true;
    },
    staleTime: 30_000,
  });
  const email = user?.email?.toLowerCase() ?? "";
  return {
    access: query.data === true,
    loading: authLoading || (!!user && query.isLoading),
    isDemoAccount: isDemoFeveEmail(email),
    isMaurice: email === "demo+maurice@changethegame.xyz",
    user,
  };
}

export function useDemoFeveSnapshot() {
  const { access, loading } = useDemoFeveAccess();
  return useQuery<DemoFeveSnapshot>({
    queryKey: ["demo-feve-snapshot"],
    enabled: !loading && access,
    queryFn: async () => {
      const { data, error } = await (supabase as any).rpc("demo_feve_snapshot");
      if (error) throw error;
      return data as DemoFeveSnapshot;
    },
    staleTime: 20_000,
  });
}
