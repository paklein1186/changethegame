import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Réglage d'accès d'une quête (« inherit » = comme sa guilde) ou par défaut d'une guilde. */
export type AccessMode = "inherit" | "public" | "members" | "hidden";
/** Niveau minimum pour voir la fiche (contrat Trois-Tiers) : N2 adhésion active, N3 rôles ou formules de membrane. */
export type MinLevel = "N2" | "N3";
export type AccessLevel = "full" | "teaser" | "none";

export interface EffectiveAccess {
  mode: Exclude<AccessMode, "inherit">;
  min_level: MinLevel;
  inherited: boolean;
  guild_id: string | null;
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

/** Formules d'adhésion et rôles à code d'une guilde : ce qui peut composer son niveau N3. */
export function useGuildMembranes(guildId: string | null | undefined) {
  return useQuery({
    queryKey: ["guild-membranes", guildId],
    enabled: !!guildId,
    queryFn: async () => {
      const [plans, roles] = await Promise.all([
        (supabase as any).from("guild_membership_plans").select("code, label, level, sort_order")
          .eq("guild_id", guildId).eq("active", true).order("sort_order"),
        (supabase as any).from("entity_roles").select("code, name, level, sort_order")
          .eq("entity_type", "guild").eq("entity_id", guildId).order("sort_order"),
      ]);
      return {
        plans: (plans.data ?? []) as { code: string; label: string; level: number | null }[],
        roles: (roles.data ?? []) as { code: string | null; name: string; level: number | null }[],
      };
    },
    staleTime: 5 * 60_000,
  });
}

/** Rôles et formules qui donnent au moins N3 dans une guilde, et leur résumé lisible, ou null s'il n'y en a pas. */
export function useGuildN3(guildId: string | null | undefined) {
  const { data: membranes } = useGuildMembranes(guildId);
  const roles = (membranes?.roles ?? []).filter((r) => (r.level ?? 0) >= 3);
  const plans = (membranes?.plans ?? []).filter((p) => (p.level ?? 0) >= 3);
  const labels = [...roles.map((r) => r.name), ...plans.map((p) => p.label)];
  return {
    roleCodes: roles.map((r) => r.code).filter((c): c is string => !!c),
    planCodes: plans.map((p) => p.code),
    summary: labels.length ? labels.join(", ") : null,
    membranes,
  };
}
