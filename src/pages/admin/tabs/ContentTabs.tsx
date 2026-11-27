import i18n from "@/i18n/config";
import { useTranslation } from "react-i18next";
/**
 * ContentTabs — ALL data from real Supabase database, zero mocks.
 */
import { attachEmails } from "@/lib/profileEmails";
import { useState, useMemo } from "react";
import { TerritoryCreateWizard } from "@/components/territory/TerritoryCreateWizard";
import { Link } from "react-router-dom";
import {
  Check, X, Star, Pencil, Save, Crown, Hash, Plus, Trash2,
  CreditCard, MapPin, Eye, Zap, Settings, ShoppingBag,
  AlertTriangle, Mail, BarChart3, MessageSquare,
  EyeOff, Send, TrendingUp, Flag, ExternalLink,
  ScrollText, Bell, Loader2,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SortableTableHead } from "@/components/ui/sortable-table-head";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useUserRoles, setUserRole } from "@/lib/admin";
import { useXP } from "@/hooks/useXP";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { useTableSort } from "@/hooks/useTableSort";

// ─── Users & Roles Tab (Superadmin) ─────────────────────────
export function UsersRolesTab() {
  const { t } = useTranslation();
  const currentUser = useCurrentUser();
  const { isSuperAdmin } = useUserRoles(currentUser.id);
  const { setXpManual } = useXP();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editXp, setEditXp] = useState(0);
  const [editCI, setEditCI] = useState(0);

  const { data: profiles = [] } = useQuery({
    queryKey: ["admin-all-profiles"],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("user_id, name, avatar_url, role, xp, contribution_index, created_at")
        .order("created_at", { ascending: false });
      return attachEmails(data);
    },
  });

  const { data: allRoles = [] } = useQuery({
    queryKey: ["admin-all-user-roles"],
    queryFn: async () => {
      const { data } = await supabase.from("user_roles").select("user_id, role");
      return data ?? [];
    },
  });

  const { sorted, sort, toggle } = useTableSort(profiles);

  const hasRole = (userId: string, role: string) => allRoles.filter((r) => r.user_id === userId).map((r) => r.role as string).includes(role);

  const handleToggleRole = async (targetUserId: string, role: "admin" | "superadmin", currentlyHas: boolean) => {
    const { error } = await setUserRole(targetUserId, role, !currentlyHas);
    if (error) { toast({ title: t("uiContentTabs.error"), description: error, variant: "destructive" }); return; }
    toast({ title: currentlyHas ? `${role} removed` : `${role} granted` });
    qc.invalidateQueries({ queryKey: ["admin-all-user-roles"] });
    qc.invalidateQueries({ queryKey: ["user-roles"] });
  };

  const startEdit = (p: typeof profiles[0]) => { setEditingId(p.user_id); setEditXp(p.xp); setEditCI(p.contribution_index); };
  const saveEdit = (userId: string) => { setXpManual(userId, editXp, editCI); setEditingId(null); toast({ title: t("uiContentTabs.xpCiUpdated") }); qc.invalidateQueries({ queryKey: ["admin-all-profiles"] }); };

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <SortableTableHead sortKey="name" currentKey={sort.key} direction={sort.direction} onSort={toggle}>{t("uiContentTabs.name")}</SortableTableHead>
            <SortableTableHead sortKey="email" currentKey={sort.key} direction={sort.direction} onSort={toggle}>{t("uiContentTabs.email")}</SortableTableHead>
            <SortableTableHead sortKey="role" currentKey={sort.key} direction={sort.direction} onSort={toggle}>{t("uiContentTabs.role")}</SortableTableHead>
            <SortableTableHead sortKey="xp" currentKey={sort.key} direction={sort.direction} onSort={toggle} className="text-right">XP</SortableTableHead>
            <SortableTableHead sortKey="contribution_index" currentKey={sort.key} direction={sort.direction} onSort={toggle} className="text-right">CI</SortableTableHead>
            <TableHead>{t("uiContentTabs.admin")}</TableHead>
            <TableHead>{t("uiContentTabs.superadmin")}</TableHead>
            <TableHead className="w-[80px]"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((p) => {
            const isTargetAdmin = hasRole(p.user_id, "admin") || hasRole(p.user_id, "superadmin");
            const isTargetSuperadmin = hasRole(p.user_id, "superadmin");
            const isSelf = p.user_id === currentUser.id;
            return (
              <TableRow key={p.user_id}>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{p.email}</TableCell>
                <TableCell><Badge variant="secondary" className="capitalize text-xs">{p.role?.toLowerCase().replace(/_/g, " ")}</Badge></TableCell>
                <TableCell className="text-right">
                  {editingId === p.user_id ? <Input type="number" value={editXp} onChange={(e) => setEditXp(Number(e.target.value))} className="w-20 h-8 text-right ml-auto" /> : p.xp}
                </TableCell>
                <TableCell className="text-right">
                  {editingId === p.user_id ? <Input type="number" value={editCI} onChange={(e) => setEditCI(Number(e.target.value))} className="w-20 h-8 text-right ml-auto" /> : p.contribution_index}
                </TableCell>
                <TableCell>
                  {isSuperAdmin ? (
                    <AlertDialog>
                      <AlertDialogTrigger asChild><Switch checked={isTargetAdmin} /></AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{isTargetAdmin ? t("uiContentTabs.removeAdmin") : t("uiContentTabs.grantAdmin")}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {isTargetAdmin ? `Remove admin access from ${p.name}?${isTargetSuperadmin ? " This will also remove their superadmin status." : ""}` : `Grant admin access to ${p.name}?`}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t("uiContentTabs.cancel")}</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleToggleRole(p.user_id, "admin", isTargetAdmin)}>{t("uiContentTabs.confirm")}</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : (
                    <Badge variant={isTargetAdmin ? "default" : "secondary"} className="text-xs">{isTargetAdmin ? t("uiContentTabs.yes") : t("uiContentTabs.no")}</Badge>
                  )}
                </TableCell>
                <TableCell>
                  {isSuperAdmin && !isSelf ? (
                    <AlertDialog>
                      <AlertDialogTrigger asChild><Switch checked={isTargetSuperadmin} /></AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{isTargetSuperadmin ? t("uiContentTabs.removeSuperadmin") : t("uiContentTabs.grantSuperadmin")}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {isTargetSuperadmin ? `Remove superadmin from ${p.name}?` : `Grant superadmin to ${p.name}? Admin will also be granted.`}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t("uiContentTabs.cancel")}</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleToggleRole(p.user_id, "superadmin", isTargetSuperadmin)}>{t("uiContentTabs.confirm")}</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  ) : (
                    <Badge variant={isTargetSuperadmin ? "default" : "secondary"} className="text-xs">{isTargetSuperadmin ? t("uiContentTabs.yes") : isSelf && isSuperAdmin ? t("uiContentTabs.you") : t("uiContentTabs.no")}</Badge>
                  )}
                </TableCell>
                <TableCell>
                  {editingId === p.user_id ? (
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => saveEdit(p.user_id)}><Save className="h-3.5 w-3.5 text-primary" /></Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingId(null)}><X className="h-3.5 w-3.5 text-destructive" /></Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => startEdit(p)}><Pencil className="h-3.5 w-3.5" /></Button>
                  )}
                </TableCell>
              </TableRow>
            );
          })}
          {profiles.length === 0 && <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">{t("uiContentTabs.noUsersFound")}</TableCell></TableRow>}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Guilds Tab ─────────────────────────────────────────────
export function GuildsTab() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: guilds = [], isLoading } = useQuery({
    queryKey: ["admin-guilds"],
    queryFn: async () => {
      const { data } = await supabase
        .from("guilds")
        .select("id, name, type, created_by_user_id, is_approved, is_deleted, is_draft, created_at, logo_url")
        .eq("is_deleted", false)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: memberCounts = {} } = useQuery({
    queryKey: ["admin-guild-member-counts"],
    queryFn: async () => {
      const { data } = await supabase.from("guild_members").select("guild_id");
      const counts: Record<string, number> = {};
      (data ?? []).forEach((m) => { counts[m.guild_id] = (counts[m.guild_id] || 0) + 1; });
      return counts;
    },
  });

  const { data: questCounts = {} } = useQuery({
    queryKey: ["admin-guild-quest-counts"],
    queryFn: async () => {
      const { data } = await supabase.from("quests").select("guild_id").eq("is_deleted", false).not("guild_id", "is", null);
      const counts: Record<string, number> = {};
      (data ?? []).forEach((q) => { if (q.guild_id) counts[q.guild_id] = (counts[q.guild_id] || 0) + 1; });
      return counts;
    },
  });

  const { data: creatorProfiles = {} } = useQuery({
    queryKey: ["admin-guild-creators"],
    enabled: guilds.length > 0,
    queryFn: async () => {
      const ids = [...new Set(guilds.map((g) => g.created_by_user_id))];
      if (!ids.length) return {};
      const { data } = await supabase.from("profiles").select("user_id, name").in("user_id", ids);
      const map: Record<string, string> = {};
      (data ?? []).forEach((p) => { map[p.user_id] = p.name; });
      return map;
    },
  });

  const enriched = useMemo(() => guilds.map(g => ({
    ...g,
    _members: memberCounts[g.id] ?? 0,
    _quests: questCounts[g.id] ?? 0,
    _creator: creatorProfiles[g.created_by_user_id] ?? "—",
  })), [guilds, memberCounts, questCounts, creatorProfiles]);

  const { sorted, sort, toggle } = useTableSort(enriched);

  const toggleApproved = async (id: string, current: boolean) => {
    await supabase.from("guilds").update({ is_approved: !current }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["admin-guilds"] });
    toast({ title: current ? t("uiContentTabs.guildUnapproved") : t("uiContentTabs.guildApproved") });
  };

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <SortableTableHead sortKey="name" currentKey={sort.key} direction={sort.direction} onSort={toggle}>{t("uiContentTabs.name")}</SortableTableHead>
            <SortableTableHead sortKey="type" currentKey={sort.key} direction={sort.direction} onSort={toggle}>{t("uiContentTabs.type")}</SortableTableHead>
            <SortableTableHead sortKey="_creator" currentKey={sort.key} direction={sort.direction} onSort={toggle}>{t("uiContentTabs.createdBy")}</SortableTableHead>
            <SortableTableHead sortKey="_members" currentKey={sort.key} direction={sort.direction} onSort={toggle} className="text-right">{t("uiContentTabs.members")}</SortableTableHead>
            <SortableTableHead sortKey="_quests" currentKey={sort.key} direction={sort.direction} onSort={toggle} className="text-right">{t("uiContentTabs.quests")}</SortableTableHead>
            <TableHead>{t("uiContentTabs.approved")}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((guild) => (
            <TableRow key={guild.id}>
              <TableCell>
                <Link to={`/guilds/${guild.id}`} className="flex items-center gap-2 hover:underline">
                  {guild.logo_url && <img src={guild.logo_url} className="h-7 w-7 rounded" alt="" />}
                  <span className="font-medium">{guild.name}</span>
                </Link>
              </TableCell>
              <TableCell><Badge variant="secondary" className="capitalize text-xs">{guild.type.toLowerCase()}</Badge></TableCell>
              <TableCell className="text-sm text-muted-foreground">{guild._creator}</TableCell>
              <TableCell className="text-right">{guild._members}</TableCell>
              <TableCell className="text-right">{guild._quests}</TableCell>
              <TableCell><Switch checked={guild.is_approved} onCheckedChange={() => toggleApproved(guild.id, guild.is_approved)} /></TableCell>
            </TableRow>
          ))}
          {guilds.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">{t("uiContentTabs.noGuildsYet")}</TableCell></TableRow>}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Quests Tab ─────────────────────────────────────────────
export function QuestsTab() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: quests = [], isLoading } = useQuery({
    queryKey: ["admin-quests"],
    queryFn: async () => {
      const { data } = await supabase
        .from("quests")
        .select("id, title, status, monetization_type, reward_xp, guild_id, is_featured, created_at, is_deleted")
        .eq("is_deleted", false)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: guildNames = {} } = useQuery({
    queryKey: ["admin-quest-guild-names"],
    queryFn: async () => {
      const { data } = await supabase.from("guilds").select("id, name");
      const map: Record<string, string> = {};
      (data ?? []).forEach((g) => { map[g.id] = g.name; });
      return map;
    },
  });

  const filtered = quests.filter((q) => statusFilter === "all" || q.status === statusFilter);

  const enriched = useMemo(() => filtered.map(q => ({
    ...q,
    _guild: q.guild_id ? guildNames[q.guild_id] ?? "—" : "—",
  })), [filtered, guildNames]);

  const { sorted, sort, toggle } = useTableSort(enriched);

  const toggleFeatured = async (id: string, current: boolean) => {
    await supabase.from("quests").update({ is_featured: !current }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["admin-quests"] });
    toast({ title: current ? t("uiContentTabs.questUnfeatured") : t("uiContentTabs.questFeatured") });
  };

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[140px]"><SelectValue placeholder={t("uiContentTabs.status")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("uiContentTabs.allStatuses")}</SelectItem>
            <SelectItem value="OPEN">{t("uiContentTabs.open")}</SelectItem>
            <SelectItem value="ACTIVE">{t("uiContentTabs.active")}</SelectItem>
            <SelectItem value="COMPLETED">{t("uiContentTabs.completed")}</SelectItem>
            <SelectItem value="CANCELLED">{t("uiContentTabs.cancelled")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="rounded-xl border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead sortKey="title" currentKey={sort.key} direction={sort.direction} onSort={toggle}>{t("uiContentTabs.title")}</SortableTableHead>
              <SortableTableHead sortKey="_guild" currentKey={sort.key} direction={sort.direction} onSort={toggle}>{t("uiContentTabs.guild")}</SortableTableHead>
              <SortableTableHead sortKey="status" currentKey={sort.key} direction={sort.direction} onSort={toggle}>{t("uiContentTabs.status")}</SortableTableHead>
              <SortableTableHead sortKey="monetization_type" currentKey={sort.key} direction={sort.direction} onSort={toggle}>{t("uiContentTabs.monetization")}</SortableTableHead>
              <SortableTableHead sortKey="reward_xp" currentKey={sort.key} direction={sort.direction} onSort={toggle} className="text-right">{t("uiContentTabs.rewardXp")}</SortableTableHead>
              <TableHead>{t("uiContentTabs.featured")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((quest) => (
              <TableRow key={quest.id}>
                <TableCell><Link to={`/quests/${quest.id}`} className="font-medium hover:underline">{quest.title}</Link></TableCell>
                <TableCell className="text-sm text-muted-foreground">{quest._guild}</TableCell>
                <TableCell><Badge variant="outline" className="capitalize text-xs">{quest.status.toLowerCase().replace(/_/g, " ")}</Badge></TableCell>
                <TableCell><Badge variant="secondary" className="capitalize text-xs">{quest.monetization_type.toLowerCase()}</Badge></TableCell>
                <TableCell className="text-right">{quest.reward_xp}</TableCell>
                <TableCell><Switch checked={quest.is_featured} onCheckedChange={() => toggleFeatured(quest.id, quest.is_featured)} /></TableCell>
              </TableRow>
            ))}
            {sorted.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">{t("uiContentTabs.noQuestsMatchFilters")}</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Plans & XP Tab ─────────────────────────────────────────
export function PlansXpTab() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();

  const { data: plans = [], isLoading } = useQuery({
    queryKey: ["admin-subscription-plans"],
    queryFn: async () => {
      const { data } = await supabase
        .from("subscription_plans")
        .select("*")
        .order("monthly_price_amount");
      return data ?? [];
    },
  });

  const { sorted, sort, toggle } = useTableSort(plans);

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-8">
      <div>
        <h3 className="font-display text-lg font-semibold flex items-center gap-2 mb-3"><CreditCard className="h-5 w-5" /> {t("uiContentTabs.subscriptionPlans")}</h3>
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 flex items-start gap-3 mb-4">
          <span className="text-amber-500 text-lg">⚠️</span>
          <div>
            <p className="text-sm font-semibold text-foreground">{t("uiContentTabs.alphaPhase")}</p>
            <p className="text-sm text-muted-foreground">{t("uiContentTabs.platformCreditPlansAreProvisionalAnd")}</p>
          </div>
        </div>
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead sortKey="name" currentKey={sort.key} direction={sort.direction} onSort={toggle}>{t("uiContentTabs.name")}</SortableTableHead>
                <SortableTableHead sortKey="code" currentKey={sort.key} direction={sort.direction} onSort={toggle}>{t("uiContentTabs.code")}</SortableTableHead>
                <SortableTableHead sortKey="monthly_price_amount" currentKey={sort.key} direction={sort.direction} onSort={toggle} className="text-right">€/mo</SortableTableHead>
                <SortableTableHead sortKey="free_quests_per_week" currentKey={sort.key} direction={sort.direction} onSort={toggle} className="text-right">{t("uiContentTabs.questsWk")}</SortableTableHead>
                <SortableTableHead sortKey="xp_multiplier" currentKey={sort.key} direction={sort.direction} onSort={toggle} className="text-right">{t("uiContentTabs.xp")}</SortableTableHead>
                <SortableTableHead sortKey="is_public" currentKey={sort.key} direction={sort.direction} onSort={toggle}>{t("uiContentTabs.public")}</SortableTableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((plan: any) => (
                <TableRow key={plan.id}>
                  <TableCell className="font-medium">{plan.name}</TableCell>
                  <TableCell><code className="text-xs text-muted-foreground">{plan.code}</code></TableCell>
                  <TableCell className="text-right">{plan.monthly_price_amount ?? 0}</TableCell>
                  <TableCell className="text-right">{plan.free_quests_per_week === -1 ? "∞" : plan.free_quests_per_week ?? "—"}</TableCell>
                  <TableCell className="text-right">{plan.xp_multiplier ?? 1}×</TableCell>
                  <TableCell>{plan.is_public ? <Badge variant="secondary" className="text-xs">{t("uiContentTabs.public")}</Badge> : <Badge variant="outline" className="text-xs">{t("uiContentTabs.internal")}</Badge>}</TableCell>
                </TableRow>
              ))}
              {plans.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">{t("uiContentTabs.noPlansConfigured")}</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

// ─── Houses & Territories Tab ───────────────────────────────
export function HousesTerritoriesTab() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [newTopicName, setNewTopicName] = useState("");
  const [showTerritoryWizard, setShowTerritoryWizard] = useState(false);

  const { data: topics = [] } = useQuery({
    queryKey: ["admin-topics"],
    queryFn: async () => {
      const { data } = await supabase.from("topics").select("*").order("name");
      return data ?? [];
    },
  });

  const { data: territories = [] } = useQuery({
    queryKey: ["admin-territories"],
    queryFn: async () => {
      const { data } = await supabase.from("territories").select("*").order("name");
      return data ?? [];
    },
  });

  const topicSort = useTableSort(topics);
  const territorySort = useTableSort(territories);
  const [editingTerritoryId, setEditingTerritoryId] = useState<string | null>(null);
  const [editingTerritoryName, setEditingTerritoryName] = useState("");

  const saveTerritoryName = async (id: string) => {
    const trimmed = editingTerritoryName.trim();
    if (!trimmed) return;
    const { error } = await supabase.from("territories").update({ name: trimmed }).eq("id", id);
    if (error) { toast({ title: t("uiContentTabs.failedToRenameTerritory"), variant: "destructive" }); return; }
    setEditingTerritoryId(null);
    setEditingTerritoryName("");
    qc.invalidateQueries({ queryKey: ["admin-territories"] });
    toast({ title: t("uiContentTabs.territoryRenamed") });
  };

  const addTopic = async () => {
    if (!newTopicName.trim()) return;
    const slug = newTopicName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
    await supabase.from("topics").insert({ name: newTopicName.trim(), slug });
    setNewTopicName("");
    qc.invalidateQueries({ queryKey: ["admin-topics"] });
    toast({ title: t("uiContentTabs.topicCreated") });
  };

  return (
    <div className="space-y-8">
      <div>
        <h3 className="font-display text-lg font-semibold flex items-center gap-2 mb-3"><Hash className="h-5 w-5" /> {t("uiContentTabs.topicsHouses")}</h3>
        <div className="flex gap-2 mb-3">
          <Input placeholder={t("uiContentTabs.newTopicName")} value={newTopicName} onChange={(e) => setNewTopicName(e.target.value)} className="max-w-xs" />
          <Button size="sm" onClick={addTopic} disabled={!newTopicName.trim()}><Plus className="h-4 w-4 mr-1" /> {t("uiContentTabs.add")}</Button>
        </div>
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead sortKey="name" currentKey={topicSort.sort.key} direction={topicSort.sort.direction} onSort={topicSort.toggle}>{t("uiContentTabs.name")}</SortableTableHead>
                <SortableTableHead sortKey="slug" currentKey={topicSort.sort.key} direction={topicSort.sort.direction} onSort={topicSort.toggle}>{t("uiContentTabs.slug")}</SortableTableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {topicSort.sorted.map((topic: any) => (
                <TableRow key={topic.id}>
                  <TableCell className="font-medium">{topic.name}</TableCell>
                  <TableCell><code className="text-xs text-muted-foreground">{topic.slug}</code></TableCell>
                </TableRow>
              ))}
              {topics.length === 0 && <TableRow><TableCell colSpan={2} className="text-center text-muted-foreground py-8">{t("uiContentTabs.noTopicsYet")}</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </div>
      <Separator />
      <div>
        <h3 className="font-display text-lg font-semibold flex items-center gap-2 mb-3"><MapPin className="h-5 w-5" /> {t("uiContentTabs.territories")}</h3>
        <div className="flex gap-2 mb-3">
          <Button size="sm" onClick={() => setShowTerritoryWizard(true)}><Plus className="h-4 w-4 mr-1" /> {t("uiContentTabs.addTerritory")}</Button>
        </div>
        {showTerritoryWizard && (
          <TerritoryCreateWizard open={showTerritoryWizard} onClose={() => setShowTerritoryWizard(false)} />
        )}
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead sortKey="name" currentKey={territorySort.sort.key} direction={territorySort.sort.direction} onSort={territorySort.toggle}>{t("uiContentTabs.name")}</SortableTableHead>
                <SortableTableHead sortKey="level" currentKey={territorySort.sort.key} direction={territorySort.sort.direction} onSort={territorySort.toggle}>{t("uiContentTabs.level")}</SortableTableHead>
                <TableHead className="w-24 text-right">{t("uiContentTabs.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {territorySort.sorted.map((t: any) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">
                    {editingTerritoryId === t.id ? (
                      <Input
                        autoFocus
                        value={editingTerritoryName}
                        onChange={(e) => setEditingTerritoryName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") saveTerritoryName(t.id); if (e.key === "Escape") setEditingTerritoryId(null); }}
                        className="h-8 max-w-xs"
                      />
                    ) : t.name}
                  </TableCell>
                  <TableCell><Badge variant="outline" className="capitalize text-xs">{t.level?.toLowerCase()}</Badge></TableCell>
                  <TableCell className="text-right">
                    {editingTerritoryId === t.id ? (
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => saveTerritoryName(t.id)}><Save className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditingTerritoryId(null)}><X className="h-3.5 w-3.5" /></Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => { setEditingTerritoryId(t.id); setEditingTerritoryName(t.name); }}><Pencil className="h-3.5 w-3.5" /></Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {territories.length === 0 && <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground py-8">{t("uiContentTabs.noTerritoriesYet")}</TableCell></TableRow>}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}

// ─── Governance Tab ─────────────────────────────────────────
export function GovernanceTab() {
  const { t } = useTranslation();
  const { data: polls = [], isLoading } = useQuery({
    queryKey: ["admin-decision-polls"],
    queryFn: async () => {
      const { data } = await supabase
        .from("decision_polls")
        .select("id, question, decision_type, status, created_at, closes_at")
        .order("created_at", { ascending: false })
        .limit(50);
      return data ?? [];
    },
  });

  const { sorted, sort, toggle } = useTableSort(polls);

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <h3 className="font-display text-lg font-semibold flex items-center gap-2 mb-3"><Star className="h-5 w-5" /> {t("uiContentTabs.decisionsPolls")}</h3>
      {polls.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("uiContentTabs.noDecisionsOrPollsYet")}</p>
      ) : (
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <SortableTableHead sortKey="question" currentKey={sort.key} direction={sort.direction} onSort={toggle}>{t("uiContentTabs.question")}</SortableTableHead>
                <SortableTableHead sortKey="decision_type" currentKey={sort.key} direction={sort.direction} onSort={toggle}>{t("uiContentTabs.type")}</SortableTableHead>
                <SortableTableHead sortKey="status" currentKey={sort.key} direction={sort.direction} onSort={toggle}>{t("uiContentTabs.status")}</SortableTableHead>
                <SortableTableHead sortKey="created_at" currentKey={sort.key} direction={sort.direction} onSort={toggle}>{t("uiContentTabs.created")}</SortableTableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sorted.map((p: any) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium max-w-xs truncate">{p.question}</TableCell>
                  <TableCell><Badge variant="secondary" className="text-xs capitalize">{p.decision_type?.toLowerCase()}</Badge></TableCell>
                  <TableCell><Badge variant={p.status === "OPEN" ? "default" : "outline"} className="text-xs capitalize">{p.status?.toLowerCase()}</Badge></TableCell>
                  <TableCell className="text-sm text-muted-foreground">{new Date(p.created_at).toLocaleDateString()}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

// ─── Services Section ───────────────────────────────────────
export function ServicesSection() {
  const { t } = useTranslation();
  const { data: services = [], isLoading } = useQuery({
    queryKey: ["admin-services"],
    queryFn: async () => {
      const { data } = await supabase
        .from("services")
        .select("id, title, price_amount, price_currency, provider_user_id, provider_guild_id, is_active, is_deleted, created_at")
        .eq("is_deleted", false)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: providerNames = {} } = useQuery({
    queryKey: ["admin-service-providers"],
    enabled: services.length > 0,
    queryFn: async () => {
      const userIds = [...new Set(services.filter(s => s.provider_user_id).map(s => s.provider_user_id!))];
      const guildIds = [...new Set(services.filter(s => s.provider_guild_id).map(s => s.provider_guild_id!))];
      const map: Record<string, string> = {};
      if (userIds.length) {
        const { data } = await supabase.from("profiles").select("user_id, name").in("user_id", userIds);
        (data ?? []).forEach(p => { map[p.user_id] = p.name; });
      }
      if (guildIds.length) {
        const { data } = await supabase.from("guilds").select("id, name").in("id", guildIds);
        (data ?? []).forEach(g => { map[g.id] = g.name; });
      }
      return map;
    },
  });

  const { data: bookingCounts = {} } = useQuery({
    queryKey: ["admin-service-booking-counts"],
    queryFn: async () => {
      const { data } = await supabase.from("bookings").select("service_id").eq("is_deleted", false);
      const counts: Record<string, number> = {};
      (data ?? []).forEach(b => { counts[b.service_id] = (counts[b.service_id] || 0) + 1; });
      return counts;
    },
  });

  const enriched = useMemo(() => services.map(svc => ({
    ...svc,
    _provider: svc.provider_user_id ? providerNames[svc.provider_user_id] : svc.provider_guild_id ? providerNames[svc.provider_guild_id] : "—",
    _bookings: bookingCounts[svc.id] ?? 0,
  })), [services, providerNames, bookingCounts]);

  const { sorted, sort, toggle } = useTableSort(enriched);

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <SortableTableHead sortKey="title" currentKey={sort.key} direction={sort.direction} onSort={toggle}>{t("uiContentTabs.title")}</SortableTableHead>
            <SortableTableHead sortKey="_provider" currentKey={sort.key} direction={sort.direction} onSort={toggle}>{t("uiContentTabs.provider")}</SortableTableHead>
            <SortableTableHead sortKey="price_amount" currentKey={sort.key} direction={sort.direction} onSort={toggle} className="text-right">{t("uiContentTabs.price")}</SortableTableHead>
            <SortableTableHead sortKey="_bookings" currentKey={sort.key} direction={sort.direction} onSort={toggle} className="text-right">{t("uiContentTabs.bookings")}</SortableTableHead>
            <SortableTableHead sortKey="is_active" currentKey={sort.key} direction={sort.direction} onSort={toggle}>{t("uiContentTabs.active")}</SortableTableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sorted.map((svc) => (
            <TableRow key={svc.id} className={!svc.is_active ? "opacity-50" : ""}>
              <TableCell><Link to={`/services/${svc.id}`} className="font-medium hover:underline">{svc.title}</Link></TableCell>
              <TableCell className="text-sm text-muted-foreground">{svc._provider}</TableCell>
              <TableCell className="text-right">{svc.price_amount != null ? `${svc.price_amount} ${svc.price_currency}` : t("uiContentTabs.free")}</TableCell>
              <TableCell className="text-right">{svc._bookings}</TableCell>
              <TableCell><Badge variant={svc.is_active ? "default" : "secondary"} className="text-xs">{svc.is_active ? t("uiContentTabs.active") : t("uiContentTabs.inactive")}</Badge></TableCell>
            </TableRow>
          ))}
          {services.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">{t("uiContentTabs.noServicesYet")}</TableCell></TableRow>}
        </TableBody>
      </Table>
    </div>
  );
}

// ─── Bookings Section ───────────────────────────────────────
export function BookingsSection() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: bookings = [], isLoading } = useQuery({
    queryKey: ["admin-bookings"],
    queryFn: async () => {
      const { data } = await supabase
        .from("bookings")
        .select("id, service_id, requester_id, provider_user_id, provider_guild_id, status, payment_status, amount, currency, created_at, start_date_time")
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(200);
      return data ?? [];
    },
  });

  const { data: nameMap = {} } = useQuery({
    queryKey: ["admin-booking-names"],
    enabled: bookings.length > 0,
    queryFn: async () => {
      const userIds = [...new Set([
        ...bookings.map(b => b.requester_id),
        ...bookings.filter(b => b.provider_user_id).map(b => b.provider_user_id!),
      ])];
      const guildIds = [...new Set(bookings.filter(b => b.provider_guild_id).map(b => b.provider_guild_id!))];
      const serviceIds = [...new Set(bookings.map(b => b.service_id))];
      const map: Record<string, string> = {};
      if (userIds.length) {
        const { data } = await supabase.from("profiles").select("user_id, name").in("user_id", userIds);
        (data ?? []).forEach(p => { map[p.user_id] = p.name; });
      }
      if (guildIds.length) {
        const { data } = await supabase.from("guilds").select("id, name").in("id", guildIds);
        (data ?? []).forEach(g => { map[g.id] = g.name; });
      }
      if (serviceIds.length) {
        const { data } = await supabase.from("services").select("id, title").in("id", serviceIds);
        (data ?? []).forEach(s => { map[`svc-${s.id}`] = s.title; });
      }
      return map;
    },
  });

  const updateStatus = async (id: string, status: string) => {
    await supabase.from("bookings").update({ status }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["admin-bookings"] });
    toast({ title: `Booking set to ${status.toLowerCase()}` });
  };

  const filtered = bookings.filter((b) => statusFilter === "all" || b.status === statusFilter);

  const enriched = useMemo(() => filtered.map(b => ({
    ...b,
    _service: nameMap[`svc-${b.service_id}`] ?? "—",
    _requester: nameMap[b.requester_id] ?? "—",
    _provider: b.provider_user_id ? nameMap[b.provider_user_id] : b.provider_guild_id ? nameMap[b.provider_guild_id] : "—",
  })), [filtered, nameMap]);

  const { sorted, sort, toggle } = useTableSort(enriched);

  if (isLoading) return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder={t("uiContentTabs.status")} /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("uiContentTabs.allStatuses")}</SelectItem>
            <SelectItem value="PENDING">{t("uiContentTabs.pending")}</SelectItem>
            <SelectItem value="CONFIRMED">{t("uiContentTabs.confirmed")}</SelectItem>
            <SelectItem value="CANCELLED">{t("uiContentTabs.cancelled")}</SelectItem>
            <SelectItem value="COMPLETED">{t("uiContentTabs.completed")}</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="rounded-xl border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead sortKey="_service" currentKey={sort.key} direction={sort.direction} onSort={toggle}>{t("uiContentTabs.service")}</SortableTableHead>
              <SortableTableHead sortKey="_requester" currentKey={sort.key} direction={sort.direction} onSort={toggle}>{t("uiContentTabs.requester")}</SortableTableHead>
              <SortableTableHead sortKey="_provider" currentKey={sort.key} direction={sort.direction} onSort={toggle}>{t("uiContentTabs.provider")}</SortableTableHead>
              <SortableTableHead sortKey="status" currentKey={sort.key} direction={sort.direction} onSort={toggle}>{t("uiContentTabs.status")}</SortableTableHead>
              <SortableTableHead sortKey="payment_status" currentKey={sort.key} direction={sort.direction} onSort={toggle}>{t("uiContentTabs.payment")}</SortableTableHead>
              <SortableTableHead sortKey="amount" currentKey={sort.key} direction={sort.direction} onSort={toggle} className="text-right">{t("uiContentTabs.amount")}</SortableTableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((b) => (
              <TableRow key={b.id}>
                <TableCell className="font-medium text-sm">{b._service}</TableCell>
                <TableCell className="text-sm">{b._requester}</TableCell>
                <TableCell className="text-sm text-muted-foreground">{b._provider}</TableCell>
                <TableCell>
                  <Select value={b.status} onValueChange={(v) => updateStatus(b.id, v)}>
                    <SelectTrigger className="h-7 w-[130px] text-xs"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PENDING">{t("uiContentTabs.pending")}</SelectItem>
                      <SelectItem value="CONFIRMED">{t("uiContentTabs.confirmed")}</SelectItem>
                      <SelectItem value="CANCELLED">{t("uiContentTabs.cancelled")}</SelectItem>
                      <SelectItem value="COMPLETED">{t("uiContentTabs.completed")}</SelectItem>
                    </SelectContent>
                  </Select>
                </TableCell>
                <TableCell><Badge variant="outline" className="text-xs capitalize">{(b.payment_status ?? "—").toLowerCase().replace(/_/g, " ")}</Badge></TableCell>
                <TableCell className="text-right text-sm">{b.amount != null ? `${b.amount} ${b.currency}` : "—"}</TableCell>
              </TableRow>
            ))}
            {sorted.length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">{t("uiContentTabs.noBookingsMatchFilter")}</TableCell></TableRow>}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ─── Moderation Tab ─────────────────────────────────────────
export function ModerationTab() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: reports = [], isLoading: loadingReports } = useQuery({
    queryKey: ["admin-reports"],
    queryFn: async () => {
      const { data } = await supabase
        .from("reports")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      return data ?? [];
    },
  });

  const { data: reporterNames = {} } = useQuery({
    queryKey: ["admin-reporter-names"],
    enabled: reports.length > 0,
    queryFn: async () => {
      const ids = [...new Set(reports.map(r => r.reporter_id))];
      if (!ids.length) return {};
      const { data } = await supabase.from("profiles").select("user_id, name").in("user_id", ids);
      const map: Record<string, string> = {};
      (data ?? []).forEach(p => { map[p.user_id] = p.name; });
      return map;
    },
  });

  const { data: comments = [], isLoading: loadingComments } = useQuery({
    queryKey: ["admin-comments"],
    queryFn: async () => {
      const { data } = await supabase
        .from("comments")
        .select("id, author_id, content, target_type, upvote_count, is_deleted, created_at")
        .order("created_at", { ascending: false })
        .limit(200);
      return data ?? [];
    },
  });

  const { data: commentAuthors = {} } = useQuery({
    queryKey: ["admin-comment-authors"],
    enabled: comments.length > 0,
    queryFn: async () => {
      const ids = [...new Set(comments.map(c => c.author_id))];
      if (!ids.length) return {};
      const { data } = await supabase.from("profiles").select("user_id, name").in("user_id", ids);
      const map: Record<string, string> = {};
      (data ?? []).forEach(p => { map[p.user_id] = p.name; });
      return map;
    },
  });

  const filteredReports = reports.filter((r) => statusFilter === "all" || r.status === statusFilter);

  const enrichedReports = useMemo(() => filteredReports.map(r => ({
    ...r,
    _reporter: reporterNames[r.reporter_id] ?? "—",
  })), [filteredReports, reporterNames]);

  const reportSort = useTableSort(enrichedReports);

  const enrichedComments = useMemo(() => comments.map(c => ({
    ...c,
    _author: commentAuthors[c.author_id] ?? "—",
  })), [comments, commentAuthors]);

  const commentSort = useTableSort(enrichedComments);

  const updateReportStatus = async (id: string, status: string) => {
    await supabase.from("reports").update({ status, reviewed_at: new Date().toISOString() }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["admin-reports"] });
    toast({ title: `Report marked as ${status.toLowerCase()}` });
  };

  const toggleCommentVisibility = async (id: string, isDeleted: boolean) => {
    await supabase.from("comments").update({
      is_deleted: !isDeleted,
      deleted_at: !isDeleted ? new Date().toISOString() : null,
    }).eq("id", id);
    qc.invalidateQueries({ queryKey: ["admin-comments"] });
    toast({ title: t("uiContentTabs.commentVisibilityToggled") });
  };

  const targetLink = (r: any) => {
    const map: Record<string, string> = { USER: `/users/${r.target_id}`, GUILD: `/guilds/${r.target_id}`, QUEST: `/quests/${r.target_id}`, POD: `/pods/${r.target_id}`, SERVICE: `/services/${r.target_id}` };
    return map[r.target_type] ?? "#";
  };

  return (
    <div className="space-y-8">
      {/* Reports */}
      <div>
        <h3 className="font-display text-lg font-semibold flex items-center gap-2 mb-3"><Flag className="h-5 w-5" /> {t("uiContentTabs.reports")}{reports.length})</h3>
        <div className="flex flex-wrap gap-3 mb-4">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[160px] h-9"><SelectValue placeholder={t("uiContentTabs.status")} /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("uiContentTabs.allStatuses2")}</SelectItem>
              <SelectItem value="OPEN">{t("uiContentTabs.open")}</SelectItem>
              <SelectItem value="REVIEWED">{t("uiContentTabs.reviewed")}</SelectItem>
              <SelectItem value="RESOLVED">{t("uiContentTabs.resolved")}</SelectItem>
              <SelectItem value="DISMISSED">{t("uiContentTabs.dismissed")}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {loadingReports ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : filteredReports.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("uiContentTabs.noReportsMatchingFilters")}</p>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead sortKey="_reporter" currentKey={reportSort.sort.key} direction={reportSort.sort.direction} onSort={reportSort.toggle}>{t("uiContentTabs.reporter")}</SortableTableHead>
                  <SortableTableHead sortKey="target_type" currentKey={reportSort.sort.key} direction={reportSort.sort.direction} onSort={reportSort.toggle}>{t("uiContentTabs.type")}</SortableTableHead>
                  <SortableTableHead sortKey="reason" currentKey={reportSort.sort.key} direction={reportSort.sort.direction} onSort={reportSort.toggle}>{t("uiContentTabs.reason")}</SortableTableHead>
                  <SortableTableHead sortKey="status" currentKey={reportSort.sort.key} direction={reportSort.sort.direction} onSort={reportSort.toggle}>{t("uiContentTabs.status")}</SortableTableHead>
                  <SortableTableHead sortKey="created_at" currentKey={reportSort.sort.key} direction={reportSort.sort.direction} onSort={reportSort.toggle}>{t("uiContentTabs.date")}</SortableTableHead>
                  <TableHead className="w-[240px]">{t("uiContentTabs.actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reportSort.sorted.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="font-medium text-sm">{r._reporter}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs">{r.target_type}</Badge></TableCell>
                    <TableCell className="text-sm max-w-xs truncate">{r.reason}</TableCell>
                    <TableCell><Badge variant={r.status === "OPEN" ? "destructive" : r.status === "RESOLVED" ? "default" : "secondary"} className="text-xs">{r.status}</Badge></TableCell>
                    <TableCell className="text-sm text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {targetLink(r) !== "#" && <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" asChild><Link to={targetLink(r)}><ExternalLink className="h-3 w-3 mr-1" /> {t("uiContentTabs.view")}</Link></Button>}
                        {r.status === "OPEN" && (
                          <>
                            <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => updateReportStatus(r.id, "REVIEWED")}><Eye className="h-3 w-3 mr-1" /> {t("uiContentTabs.reviewed")}</Button>
                            <Button size="sm" variant="default" className="h-7 px-2 text-xs" onClick={() => updateReportStatus(r.id, "RESOLVED")}><Check className="h-3 w-3 mr-1" /> {t("uiContentTabs.resolve")}</Button>
                            <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => updateReportStatus(r.id, "DISMISSED")}><X className="h-3 w-3 mr-1" /> {t("uiContentTabs.dismiss")}</Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Separator />

      {/* All comments */}
      <div>
        <h3 className="font-display text-lg font-semibold flex items-center gap-2 mb-3"><MessageSquare className="h-5 w-5" /> {t("uiContentTabs.allComments")}</h3>
        {loadingComments ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead sortKey="_author" currentKey={commentSort.sort.key} direction={commentSort.sort.direction} onSort={commentSort.toggle}>{t("uiContentTabs.author")}</SortableTableHead>
                  <SortableTableHead sortKey="content" currentKey={commentSort.sort.key} direction={commentSort.sort.direction} onSort={commentSort.toggle}>{t("uiContentTabs.content")}</SortableTableHead>
                  <SortableTableHead sortKey="target_type" currentKey={commentSort.sort.key} direction={commentSort.sort.direction} onSort={commentSort.toggle}>{t("uiContentTabs.target")}</SortableTableHead>
                  <SortableTableHead sortKey="upvote_count" currentKey={commentSort.sort.key} direction={commentSort.sort.direction} onSort={commentSort.toggle} className="text-right">{t("uiContentTabs.upvotes")}</SortableTableHead>
                  <TableHead>{t("uiContentTabs.visible")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {commentSort.sorted.map((c) => (
                  <TableRow key={c.id} className={c.is_deleted ? "opacity-50" : ""}>
                    <TableCell className="font-medium text-sm">{c._author}</TableCell>
                    <TableCell className="text-sm max-w-xs truncate">{c.content}</TableCell>
                    <TableCell><Badge variant="outline" className="capitalize text-xs">{c.target_type?.toLowerCase().replace(/_/g, " ")}</Badge></TableCell>
                    <TableCell className="text-right">{c.upvote_count}</TableCell>
                    <TableCell>
                      <Button size="sm" variant={c.is_deleted ? "destructive" : "ghost"} className="h-7 px-2 text-xs" onClick={() => toggleCommentVisibility(c.id, c.is_deleted)}>
                        {c.is_deleted ? <><EyeOff className="h-3 w-3 mr-1" /> {t("uiContentTabs.hidden")}</> : <><Eye className="h-3 w-3 mr-1" /> {t("uiContentTabs.visible")}</>}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {comments.length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">{t("uiContentTabs.noCommentsYet")}</TableCell></TableRow>}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Notifications Monitoring Tab ───────────────────────────
export function NotificationsMonitoringTab() {
  const { t } = useTranslation();
  const { toast } = useToast();

  const { data: notifStats, isLoading } = useQuery({
    queryKey: ["admin-notification-stats"],
    queryFn: async () => {
      const d7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data } = await supabase
        .from("notifications")
        .select("type")
        .gte("created_at", d7);
      const rows = data ?? [];
      const byType: Record<string, number> = {};
      rows.forEach((n) => { byType[n.type] = (byType[n.type] || 0) + 1; });
      return {
        total: rows.length,
        byType: Object.entries(byType)
          .map(([type, count]) => ({ type, count }))
          .sort((a, b) => b.count - a.count),
      };
    },
    staleTime: 30_000,
  });

  const notifSort = useTableSort(notifStats?.byType ?? []);

  const { data: users = [] } = useQuery({
    queryKey: ["admin-users-for-push"],
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, name").order("name").limit(50);
      return data ?? [];
    },
  });

  const [testUserId, setTestUserId] = useState("");

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">{t("uiContentTabs.totalSent7d")}</p>
          <p className="text-2xl font-bold">{isLoading ? "…" : notifStats?.total ?? 0}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-xs text-muted-foreground">{t("uiContentTabs.uniqueTypes")}</p>
          <p className="text-2xl font-bold">{isLoading ? "…" : notifStats?.byType.length ?? 0}</p>
        </div>
      </div>
      <div>
        <h3 className="font-display text-lg font-semibold mb-3 flex items-center gap-2"><BarChart3 className="h-5 w-5" /> {t("uiContentTabs.volumeByType7Days")}</h3>
        {isLoading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : notifStats?.byType.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("uiContentTabs.noNotificationsSentInTheLast")}</p>
        ) : (
          <div className="rounded-xl border border-border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead sortKey="type" currentKey={notifSort.sort.key} direction={notifSort.sort.direction} onSort={notifSort.toggle}>{t("uiContentTabs.type")}</SortableTableHead>
                  <SortableTableHead sortKey="count" currentKey={notifSort.sort.key} direction={notifSort.sort.direction} onSort={notifSort.toggle} className="text-right">{t("uiContentTabs.count")}</SortableTableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {notifSort.sorted.map((v) => (
                  <TableRow key={v.type}>
                    <TableCell><Badge variant="secondary" className="text-xs capitalize">{v.type.toLowerCase().replace(/_/g, " ")}</Badge></TableCell>
                    <TableCell className="text-right">{v.count}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>
      <div>
        <h3 className="font-display text-lg font-semibold mb-3 flex items-center gap-2"><Settings className="h-5 w-5" /> {t("uiContentTabs.adminTools")}</h3>
        <div className="space-y-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <h4 className="text-sm font-semibold mb-2">{t("uiContentTabs.testPushNotification")}</h4>
            <div className="flex gap-2">
              <Select value={testUserId} onValueChange={setTestUserId}>
                <SelectTrigger className="w-[200px]"><SelectValue placeholder={t("uiContentTabs.selectUser")} /></SelectTrigger>
                <SelectContent>{users.map((u) => (<SelectItem key={u.user_id} value={u.user_id}>{u.name}</SelectItem>))}</SelectContent>
              </Select>
              <Button size="sm" variant="outline" disabled={!testUserId} onClick={() => toast({ title: t("uiContentTabs.testPushSent") })}><Send className="h-4 w-4 mr-1" /> {t("uiContentTabs.sendTestPush")}</Button>
            </div>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <h4 className="text-sm font-semibold mb-2">{t("uiContentTabs.triggerDigestManually")}</h4>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => toast({ title: t("uiContentTabs.dailyDigestTriggered") })}><Mail className="h-4 w-4 mr-1" /> {t("uiContentTabs.runDailyDigest")}</Button>
              <Button size="sm" variant="outline" onClick={() => toast({ title: t("uiContentTabs.weeklyDigestTriggered") })}><Mail className="h-4 w-4 mr-1" /> {t("uiContentTabs.runWeeklyDigest")}</Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Emails & Digests Tab ───────────────────────────────────
interface EmailTemplate {
  id: string; name: string; description: string; enabled: boolean; subject: string; introText: string;
}

const DEFAULT_EMAIL_TEMPLATES: EmailTemplate[] = [
  { id: "welcome", name: "Welcome Email", get description() { return i18n.t("uiContentTabs.sentWhenANewUserSigns"); }, enabled: true, subject: "Welcome to the platform!", introText: "We're excited to have you join our community." },
  { id: "digest_daily", name: "Daily Digest", get description() { return i18n.t("uiContentTabs.summaryOfRecentActivity"); }, enabled: true, subject: "Your daily digest", introText: "Here's what happened today." },
  { id: "digest_weekly", name: "Weekly Summary", get description() { return i18n.t("uiContentTabs.weeklyRecapEmail"); }, enabled: true, subject: "Your weekly summary", introText: "Here's your week in review." },
  { id: "booking_confirmed", name: "Booking Confirmed", get description() { return i18n.t("uiContentTabs.sentWhenBookingIsConfirmed"); }, enabled: true, subject: "Your booking is confirmed!", introText: "Your session has been confirmed." },
  { id: "quest_update", name: "Quest Update", get description() { return i18n.t("uiContentTabs.sentWhenAQuestYouFollow"); }, enabled: true, subject: "Quest update", introText: "A quest you're following has been updated." },
];

export function EmailsDigestsTab() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [templates, setTemplates] = useState<EmailTemplate[]>(DEFAULT_EMAIL_TEMPLATES);
  const [editId, setEditId] = useState<string | null>(null);
  const [editSubject, setEditSubject] = useState("");
  const [editIntro, setEditIntro] = useState("");

  const { sorted, sort, toggle } = useTableSort(templates);

  const startEdit = (t: EmailTemplate) => { setEditId(t.id); setEditSubject(t.subject); setEditIntro(t.introText); };
  const saveEdit = () => {
    if (!editId) return;
    setTemplates((prev) => prev.map((t) => t.id === editId ? { ...t, subject: editSubject, introText: editIntro } : t));
    setEditId(null); toast({ title: t("uiContentTabs.templateUpdated") });
  };

  return (
    <div className="space-y-6">
      <h3 className="font-display text-lg font-semibold flex items-center gap-2 mb-3"><Mail className="h-5 w-5" /> {t("uiContentTabs.emailTemplatesDigests")}</h3>
      <p className="text-sm text-muted-foreground">{t("uiContentTabs.manageEmailTemplatesSentToUsers")}</p>
      <div className="rounded-xl border border-border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <SortableTableHead sortKey="name" currentKey={sort.key} direction={sort.direction} onSort={toggle}>{t("uiContentTabs.template")}</SortableTableHead>
              <SortableTableHead sortKey="subject" currentKey={sort.key} direction={sort.direction} onSort={toggle}>{t("uiContentTabs.subject")}</SortableTableHead>
              <TableHead>{t("uiContentTabs.enabled")}</TableHead>
              <TableHead className="w-[80px]"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sorted.map((t) => (
              <TableRow key={t.id}>
                <TableCell>
                  <div><span className="font-medium">{t.name}</span><p className="text-xs text-muted-foreground">{t.description}</p></div>
                </TableCell>
                <TableCell>
                  {editId === t.id ? (
                    <div className="space-y-2">
                      <Input value={editSubject} onChange={(e) => setEditSubject(e.target.value)} className="h-8" placeholder="Subject" />
                      <Textarea value={editIntro} onChange={(e) => setEditIntro(e.target.value)} className="h-16" placeholder="Intro text" />
                    </div>
                  ) : <span className="text-sm">{t.subject}</span>}
                </TableCell>
                <TableCell><Switch checked={t.enabled} onCheckedChange={(v) => setTemplates((prev) => prev.map((x) => x.id === t.id ? { ...x, enabled: v } : x))} /></TableCell>
                <TableCell>
                  {editId === t.id ? (
                    <div className="flex gap-1">
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={saveEdit}><Save className="h-3.5 w-3.5 text-primary" /></Button>
                      <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => setEditId(null)}><X className="h-3.5 w-3.5 text-destructive" /></Button>
                    </div>
                  ) : <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => startEdit(t)}><Pencil className="h-3.5 w-3.5" /></Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
