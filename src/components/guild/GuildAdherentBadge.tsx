import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

/** Identifiants des personnes dont l'adhésion payante est en cours, pour une guilde (requête partagée). */
export function useGuildAdherents(guildId: string) {
  return useQuery({
    queryKey: ["guild-adherents", guildId],
    queryFn: async () => {
      const { data } = await supabase
        .from("user_guild_memberships" as any)
        .select("user_id, status, current_period_end, membership_expires_at, role")
        .eq("guild_id", guildId)
        .eq("role", "member");
      const now = Date.now();
      return new Set(
        ((data as any[]) ?? [])
          .filter((m) => ["active", "grace"].includes(m.status ?? "active"))
          .filter((m) => {
            const end = m.current_period_end ?? m.membership_expires_at;
            return !end || new Date(end).getTime() > now;
          })
          .map((m) => m.user_id as string),
      );
    },
    staleTime: 60_000,
  });
}

/** « Adhérent » si la cotisation est à jour ; sinon « Observateur » quand la guilde propose une adhésion. */
export function GuildAdherentBadge({ guild, userId }: { guild: any; userId: string }) {
  const offers = Boolean(guild?.euro_membership_enabled || guild?.enable_membership);
  const { data: adherents } = useGuildAdherents(guild.id);
  if (!offers || !adherents) return null;
  return adherents.has(userId) || guild.created_by_user_id === userId ? (
    <Badge className="text-[10px] px-1.5 py-0">Adhérent</Badge>
  ) : (
    <Badge variant="outline" className="text-[10px] px-1.5 py-0">Observateur</Badge>
  );
}
