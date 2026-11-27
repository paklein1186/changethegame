import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Réglage d'accès d'une quête (« inherit » = comme sa guilde) ou par défaut d'une guilde. */
export type AccessMode = "inherit" | "public" | "members" | "selected" | "hidden";
export type AccessLevel = "full" | "teaser" | "none";

export interface EffectiveAccess {
  mode: Exclude<AccessMode, "inherit">;
  inherited: boolean;
  guild_id: string | null;
  plans: string[];
  role_ids: string[];
}

export interface MyQuestAccess {
  level: AccessLevel;
  is_admin: boolean;
  effective: EffectiveAccess | null;
  access_mode: AccessMode | null;
  pending_request: boolean;
  has_grant: boolean;
}

/** Ce que la personne connectée peut voir et faire sur une quête (calculé par la base). */
export function useMyQuestAccess(questId: string | undefined, userId: string | null | undefined) {
  return useQuery({
    queryKey: ["my-quest-access", questId, userId ?? null],
    enabled: !!questId,
    queryFn: async (): Promise<MyQuestAccess | null> => {
      const { data, error } = await (supabase as any).rpc("my_quest_access", { p_quest_id: questId });
      if (error) throw error;
      return (data ?? null) as MyQuestAccess | null;
    },
    staleTime: 30_000,
    // La page attend cette réponse : pas de nouvelles tentatives (en cas d'échec, la quête s'affiche
    // comme la base la livre : la base reste seule juge de ce qui est lisible).
    retry: false,
  });
}

/** Formules d'adhésion et rôles d'une guilde : les « membranes » qu'on peut choisir. */
export function useGuildMembranes(guildId: string | null | undefined) {
  return useQuery({
    queryKey: ["guild-membranes", guildId],
    enabled: !!guildId,
    queryFn: async () => {
      const [plans, roles] = await Promise.all([
        (supabase as any).from("guild_membership_plans").select("code, label, sort_order")
          .eq("guild_id", guildId).eq("active", true).order("sort_order"),
        (supabase as any).from("entity_roles").select("id, name, sort_order")
          .eq("entity_type", "guild").eq("entity_id", guildId).order("sort_order"),
      ]);
      return {
        plans: (plans.data ?? []) as { code: string; label: string }[],
        roles: (roles.data ?? []) as { id: string; name: string }[],
      };
    },
    staleTime: 5 * 60_000,
  });
}
