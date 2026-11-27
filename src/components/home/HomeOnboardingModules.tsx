import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, Loader2, MapPin, Plus, Sparkles, Star, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useTerritoryLeaderboard } from "@/hooks/useNetworkLeaderboardData";
import { rankHomeGuilds, rankHomeTerritories, remainingGuildFavorites } from "@/lib/homeOnboarding";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";

interface Props {
  userId: string;
}

interface GuildCard {
  id: string;
  name: string;
  description: string | null;
  logo_url: string | null;
  banner_url: string | null;
  topicIds: string[];
  territoryIds: string[];
  memberCount: number;
}

export function HomeOnboardingModules({ userId }: Props) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [pendingGuildId, setPendingGuildId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["home-onboarding", userId],
    enabled: !!userId,
    staleTime: 30_000,
    queryFn: async () => {
      const [profileResult, territoryResult, topicResult, followResult] = await Promise.all([
        supabase.from("profiles").select("bio, headline, location").eq("user_id", userId).maybeSingle(),
        supabase.from("user_territories").select("territory_id").eq("user_id", userId),
        supabase.from("user_topics").select("topic_id, topics(name)").eq("user_id", userId),
        supabase.from("follows").select("target_id, created_at").eq("follower_id", userId).eq("target_type", "GUILD").order("created_at"),
      ]);
      const error = profileResult.error || territoryResult.error || topicResult.error || followResult.error;
      if (error) throw error;

      const followedIds = (followResult.data ?? []).map((follow) => follow.target_id);
      let followedGuilds: Array<Pick<GuildCard, "id" | "name" | "logo_url">> = [];
      if (followedIds.length > 0) {
        const { data: guilds, error: guildError } = await supabase
          .from("guilds")
          .select("id, name, logo_url")
          .in("id", followedIds)
          .eq("is_deleted", false);
        if (guildError) throw guildError;
        const guildById = new Map((guilds ?? []).map((guild) => [guild.id, guild]));
        followedGuilds = followedIds.map((id) => guildById.get(id)).filter(Boolean) as typeof followedGuilds;
      }

      return {
        profileComplete: Boolean(
          profileResult.data?.headline?.trim() && (profileResult.data.bio?.trim().length ?? 0) > 100,
        ),
        territoryIds: (territoryResult.data ?? []).map((row) => row.territory_id),
        location: profileResult.data?.location ?? "",
        topicIds: (topicResult.data ?? []).map((row) => row.topic_id),
        topicNames: (topicResult.data ?? []).map((row) => (row.topics as any)?.name).filter(Boolean) as string[],
        followedGuilds,
      };
    },
  });

  const followedIds = useMemo(() => new Set((data?.followedGuilds ?? []).map((guild) => guild.id)), [data]);
  const favoritesNeeded = remainingGuildFavorites(data?.followedGuilds.length ?? 0);
  const showTerritories = (data?.territoryIds.length ?? 0) < 3;

  const { data: territoryLeaderboard = [], isLoading: territoriesLoading } = useTerritoryLeaderboard(!!data && showTerritories);
  const territories = useMemo(() => {
    if (!showTerritories) return [];
    return rankHomeTerritories(territoryLeaderboard, {
      topicNames: data?.topicNames ?? [],
      territoryIds: data?.territoryIds ?? [],
      location: data?.location ?? "",
    });
  }, [territoryLeaderboard, showTerritories, data?.topicNames, data?.territoryIds, data?.location]);

  const { data: guildCandidates = [], isLoading: guildsLoading } = useQuery({
    queryKey: ["home-guild-candidates", userId],
    enabled: !!userId && !!data && favoritesNeeded > 0,
    staleTime: 60_000,
    queryFn: async () => {
      const { data: guilds, error } = await supabase
        .from("guilds")
        .select("id, name, description, logo_url, banner_url, guild_topics(topic_id), guild_territories(territory_id), guild_members(id)")
        .eq("is_deleted", false)
        .eq("is_approved", true)
        .eq("is_draft", false)
        .order("updated_at", { ascending: false })
        .limit(60);
      if (error) throw error;
      return (guilds ?? []).map((guild: any) => ({
        id: guild.id,
        name: guild.name,
        description: guild.description,
        logo_url: guild.logo_url,
        banner_url: guild.banner_url,
        topicIds: (guild.guild_topics ?? []).map((row: any) => row.topic_id),
        territoryIds: (guild.guild_territories ?? []).map((row: any) => row.territory_id),
        memberCount: (guild.guild_members ?? []).length,
      })) as GuildCard[];
    },
  });

  const suggestedGuilds = useMemo(() => {
    const candidates = guildCandidates.filter((guild) => !followedIds.has(guild.id));
    return rankHomeGuilds(candidates, {
      topicIds: data?.topicIds ?? [],
      territoryIds: data?.territoryIds ?? [],
    }).slice(0, Math.max(3, favoritesNeeded));
  }, [guildCandidates, followedIds, data?.topicIds, data?.territoryIds, favoritesNeeded]);

  const favoriteMutation = useMutation({
    mutationFn: async ({ guildId, follow }: { guildId: string; follow: boolean }) => {
      setPendingGuildId(guildId);
      if (follow) {
        const { error } = await supabase.from("follows").insert({
          follower_id: userId,
          target_type: "GUILD",
          target_id: guildId,
        });
        if (error && error.code !== "23505") throw error;
      } else {
        const { error } = await supabase
          .from("follows")
          .delete()
          .eq("follower_id", userId)
          .eq("target_type", "GUILD")
          .eq("target_id", guildId);
        if (error) throw error;
      }
    },
    onSuccess: (_result, variables) => {
      toast.success(variables.follow ? t("uiHomeOnboarding.guildAdded") : t("uiHomeOnboarding.guildRemoved"));
      queryClient.invalidateQueries({ queryKey: ["home-onboarding", userId] });
      queryClient.invalidateQueries({ queryKey: ["home-guild-candidates", userId] });
      queryClient.invalidateQueries({ queryKey: ["my-follows"] });
      queryClient.invalidateQueries({ queryKey: ["following-feed"] });
      queryClient.invalidateQueries({ queryKey: ["follow", userId, "GUILD", variables.guildId] });
    },
    onError: () => toast.error(t("uiHomeOnboarding.favoriteError")),
    onSettled: () => setPendingGuildId(null),
  });

  if (!userId || isLoading || !data) return null;
  if (data.profileComplete && !showTerritories && data.followedGuilds.length === 0) return null;

  return (
    <div className="max-w-[960px] mx-auto px-3 sm:px-4 pt-4 space-y-5 sm:space-y-6">
      {!data.profileComplete && (
        <section className="rounded-xl border border-primary/30 bg-primary/5 p-4 sm:p-5">
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-primary">01</p>
                <h2 className="font-display text-lg font-semibold text-foreground">{t("uiHomeOnboarding.enrichTitle")}</h2>
                <p className="text-sm text-muted-foreground mt-1">{t("uiHomeOnboarding.enrichDescription")}</p>
              </div>
            </div>
            <Button asChild className="shrink-0">
              <Link to="/profile/enrich">
                {t("uiHomeOnboarding.enrichAction")} <ArrowRight className="h-4 w-4 ml-1.5" />
              </Link>
            </Button>
          </div>
        </section>
      )}

      {showTerritories && (territoriesLoading || territories.length > 0) && (
        <section>
          <div className="flex items-end justify-between gap-3 mb-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">02</p>
              <h2 className="font-display text-base font-semibold text-foreground flex items-center gap-2">
                <MapPin className="h-4 w-4 text-primary" /> {t("uiHomeOnboarding.territoriesTitle")}
              </h2>
              <p className="text-xs text-muted-foreground mt-1">{t("uiHomeOnboarding.territoriesDescription")}</p>
            </div>
            <Button variant="ghost" size="sm" asChild className="shrink-0 text-xs">
              <Link to="/explore/territories">{t("uiHomeOnboarding.viewAll")}</Link>
            </Button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {territoriesLoading
              ? Array.from({ length: 3 }, (_, index) => <Skeleton key={index} className="h-28 rounded-xl" />)
              : territories.map((territory) => (
                  <Link
                    key={territory.id}
                    to={`/territories/${territory.id}`}
                    className="group rounded-xl border border-border bg-card overflow-hidden hover:border-primary/40 transition-colors"
                  >
                    <div className="h-12 bg-muted/50 relative overflow-hidden">
                      {(territory.cover_url || territory.logo_url) && (
                        <img src={territory.cover_url || territory.logo_url || ""} alt="" className="w-full h-full object-cover" />
                      )}
                    </div>
                    <div className="p-3">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
                        <h3 className="text-sm font-medium truncate group-hover:text-primary transition-colors">{territory.name}</h3>
                      </div>
                      <p className="text-[11px] text-muted-foreground mt-1.5 truncate">
                        {territory.parent_name || territory.level || t("uiHomeOnboarding.territory")}
                      </p>
                      <div className="flex items-center gap-2 mt-2 text-[10px] text-muted-foreground">
                        <span>{territory.quests} {t("uiHomeOnboarding.quests")}</span>
                        <span>·</span>
                        <span>{territory.entities} {t("uiHomeOnboarding.collectives")}</span>
                      </div>
                    </div>
                  </Link>
                ))}
          </div>
        </section>
      )}

      {(data.followedGuilds.length > 0 || favoritesNeeded > 0) && (
        <section>
          <div className="flex items-end justify-between gap-3 mb-3">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">03</p>
              <h2 className="font-display text-base font-semibold text-foreground flex items-center gap-2">
                <Star className="h-4 w-4 text-primary" /> {t("uiHomeOnboarding.guildsTitle")}
              </h2>
              <p className="text-xs text-muted-foreground mt-1">
                {favoritesNeeded > 0
                  ? t("uiHomeOnboarding.guildsDescription", { count: favoritesNeeded })
                  : t("uiHomeOnboarding.guildsReady")}
              </p>
            </div>
            {favoritesNeeded > 0 && <Badge variant="secondary">{Math.min(data.followedGuilds.length, 3)}/3</Badge>}
          </div>

          {data.followedGuilds.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-3">
              {data.followedGuilds.slice(0, 3).map((guild) => (
                <div key={guild.id} className="flex items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 p-2.5">
                  <Avatar className="h-8 w-8 rounded-md shrink-0">
                    <AvatarImage src={guild.logo_url ?? undefined} />
                    <AvatarFallback><Users className="h-4 w-4" /></AvatarFallback>
                  </Avatar>
                  <Link to={`/guilds/${guild.id}`} className="text-sm font-medium truncate flex-1 hover:text-primary">{guild.name}</Link>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 shrink-0 text-primary"
                    aria-label={t("uiHomeOnboarding.removeFavorite", { name: guild.name })}
                    disabled={pendingGuildId === guild.id}
                    onClick={() => favoriteMutation.mutate({ guildId: guild.id, follow: false })}
                  >
                    {pendingGuildId === guild.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Star className="h-3.5 w-3.5 fill-current" />}
                  </Button>
                </div>
              ))}
            </div>
          )}

          {favoritesNeeded > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {guildsLoading
                ? Array.from({ length: favoritesNeeded }, (_, index) => <Skeleton key={index} className="h-24 rounded-xl" />)
                : suggestedGuilds.map((guild) => (
                    <div key={guild.id} className="rounded-xl border border-border bg-card p-3 flex flex-col gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <Avatar className="h-9 w-9 rounded-md shrink-0">
                          <AvatarImage src={guild.logo_url ?? undefined} />
                          <AvatarFallback><Users className="h-4 w-4" /></AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <Link to={`/guilds/${guild.id}`} className="text-sm font-medium truncate block hover:text-primary">{guild.name}</Link>
                          <span className="text-[10px] text-muted-foreground">{guild.memberCount} {t("uiHomeOnboarding.members")}</span>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        className="w-full mt-auto"
                        disabled={pendingGuildId === guild.id}
                        onClick={() => favoriteMutation.mutate({ guildId: guild.id, follow: true })}
                      >
                        {pendingGuildId === guild.id ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1.5" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
                        {t("uiHomeOnboarding.addFavorite")}
                      </Button>
                    </div>
                  ))}
              {!guildsLoading && suggestedGuilds.length === 0 && (
                <div className="col-span-full rounded-lg border border-dashed border-border p-4 text-center">
                  <Check className="h-4 w-4 text-primary mx-auto mb-1" />
                  <Link to="/explore?tab=guilds" className="text-xs text-primary hover:underline">{t("uiHomeOnboarding.exploreGuilds")}</Link>
                </div>
              )}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
