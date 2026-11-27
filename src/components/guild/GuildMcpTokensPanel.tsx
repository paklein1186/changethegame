import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { Copy, Plug, Trash2, KeyRound, Loader2 } from "lucide-react";

type TokenRecord = {
  id: string;
  name: string;
  token_prefix: string;
  scopes: string[];
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
};

type Props = { guildId: string; guildName?: string };

export function GuildMcpTokensPanel({ guildId, guildName }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [tokens, setTokens] = useState<TokenRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  // Lecture seule par défaut : un agent qui suit la guilde n'a pas à y écrire.
  const [readOnly, setReadOnly] = useState(true);
  const [revealed, setRevealed] = useState<{ name: string; token: string } | null>(null);

  const mcpUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/guild-mcp`;
  // Connecteur OAuth : agit au nom de la personne connectée (recommandé pour suivre la guilde).
  const oauthUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/mcp`;

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke(
      `guild-mcp-tokens?guild_id=${guildId}`,
      { method: "GET" },
    );
    if (error) toast({ title: t("guildMcp.loadFailed"), description: error.message, variant: "destructive" });
    setTokens((data as any)?.tokens ?? []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [guildId]);

  const createToken = async () => {
    if (!name.trim()) return;
    setCreating(true);
    const { data, error } = await supabase.functions.invoke("guild-mcp-tokens", {
      method: "POST",
      body: { guild_id: guildId, name: name.trim(), scopes: readOnly ? ["read"] : ["read", "write"] },
    });
    setCreating(false);
    if (error || (data as any)?.error) {
      toast({ title: t("guildMcp.createFailed"), description: error?.message ?? (data as any)?.error, variant: "destructive" });
      return;
    }
    setRevealed({ name: name.trim(), token: (data as any).token });
    setName("");
    load();
  };

  const revoke = async (id: string) => {
    if (!confirm(t("guildMcp.revokeConfirm"))) return;
    const { error } = await supabase.functions.invoke(`guild-mcp-tokens?id=${id}`, { method: "DELETE" });
    if (error) {
      toast({ title: t("guildMcp.revokeFailed"), description: error.message, variant: "destructive" });
      return;
    }
    toast({ title: t("guildMcp.revoked") });
    load();
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: t("guildMcp.copied") });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <Plug className="h-5 w-5" /> {t("guildMcp.title")}
        </h3>
        <p className="text-sm text-muted-foreground mt-1">{t("guildMcp.intro")}</p>
      </div>

      <Card className="p-4 space-y-3">
        <div className="text-sm font-medium flex items-center gap-2">
          <KeyRound className="h-4 w-4" /> {t("guildMcp.oauthTitle")}
        </div>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs bg-muted px-2 py-1.5 rounded font-mono break-all">{oauthUrl}</code>
          <Button size="sm" variant="ghost" onClick={() => copy(oauthUrl)} aria-label={t("guildMcp.copy")}>
            <Copy className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">{t("guildMcp.oauthHint")}</p>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="text-sm font-medium flex items-center gap-2">
          <KeyRound className="h-4 w-4" /> {t("guildMcp.keyTitle")}
        </div>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs bg-muted px-2 py-1.5 rounded font-mono break-all">{mcpUrl}</code>
          <Button size="sm" variant="ghost" onClick={() => copy(mcpUrl)} aria-label={t("guildMcp.copy")}>
            <Copy className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          {t("guildMcp.keyHeader")} <code>Authorization: Bearer ctg_…</code>. {t("guildMcp.keyAddress")}{" "}
          <code>{mcpUrl}?key=ctg_…</code> {t("guildMcp.keyAddressReadOnly")}
        </p>
        <p className="text-xs text-muted-foreground">
          {t("guildMcp.activityHint")} <code>get_guild_activity</code> {t("guildMcp.activityHintSince")} <code>next_since</code>.
        </p>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="text-sm font-medium">{t("guildMcp.createTitle")}</div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={readOnly} onChange={(e) => setReadOnly(e.target.checked)} className="accent-primary" />
          {t("guildMcp.readOnly")}
        </label>
        <div className="flex gap-2">
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("guildMcp.namePlaceholder", { guild: guildName ?? t("guildMcp.myGuild") })}
            aria-label={t("guildMcp.nameLabel")}
          />
          <Button onClick={createToken} disabled={creating || !name.trim()}>
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : t("guildMcp.generate")}
          </Button>
        </div>
        {revealed && (
          <div className="mt-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-3 space-y-2">
            <p className="text-sm font-medium">{t("guildMcp.copyNow")}</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-background px-2 py-1.5 rounded font-mono break-all">
                {revealed.token}
              </code>
              <Button size="sm" variant="outline" onClick={() => copy(revealed.token)} aria-label={t("guildMcp.copy")}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t("guildMcp.connectorAddress")}</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-background px-2 py-1.5 rounded font-mono break-all">
                {`${mcpUrl}?key=${revealed.token}`}
              </code>
              <Button size="sm" variant="outline" onClick={() => copy(`${mcpUrl}?key=${revealed.token}`)} aria-label={t("guildMcp.copy")}>
                <Copy className="h-4 w-4" />
              </Button>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setRevealed(null)}>{t("guildMcp.saved")}</Button>
          </div>
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <div className="text-sm font-medium">{t("guildMcp.activeTitle")}</div>
        {loading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : tokens.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("guildMcp.none")}</p>
        ) : (
          <ul className="divide-y">
            {tokens.map((tk) => (
              <li key={tk.id} className="py-2 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="text-sm font-medium truncate">{tk.name}</div>
                  <div className="text-xs text-muted-foreground">
                    <code>{tk.token_prefix}…</code> · {t("guildMcp.created", { date: new Date(tk.created_at).toLocaleDateString() })}
                    {tk.last_used_at && ` · ${t("guildMcp.lastUsed", { date: new Date(tk.last_used_at).toLocaleDateString() })}`}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {tk.revoked_at ? (
                    <Badge variant="outline">{t("guildMcp.revokedBadge")}</Badge>
                  ) : (
                    <>
                      {tk.scopes.map((s) => <Badge key={s} variant="secondary">{t(`guildMcp.scope.${s}`, { defaultValue: s })}</Badge>)}
                      <Button size="sm" variant="ghost" onClick={() => revoke(tk.id)} aria-label={t("guildMcp.revoke")}>
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
