import { useTranslation } from "react-i18next";
import i18n from "@/i18n/config";
import { useEffect, useState } from "react";
import { Bot, Plus, RefreshCw, Trash2, Loader2, Sparkles, FileText, Link as LinkIcon, MessageSquare, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

interface Agent {
  id: string;
  guild_id: string;
  name: string;
  persona_prompt: string;
  model: string;
  status: string;
  allow_mcp_write: boolean;
}

interface Source {
  id: string;
  type: string;
  title: string | null;
  status: string;
  last_sync_at: string | null;
  last_error: string | null;
  document_count: number;
}

interface ChatMsg {
  role: "user" | "assistant";
  content: string;
}

interface Props {
  guildId: string;
  guildName?: string;
}

const MODELS = [
  { value: "google/gemini-2.5-flash", get label() { return i18n.t("uiGuildAgentSettingsPanel.gemini25FlashRecommended"); } },
  { value: "google/gemini-2.5-pro", get label() { return i18n.t("uiGuildAgentSettingsPanel.gemini25ProDeepReasoning"); } },
  { value: "google/gemini-2.5-flash-lite", get label() { return i18n.t("uiGuildAgentSettingsPanel.gemini25FlashLiteCheap"); } },
  { value: "openai/gpt-5-mini", get label() { return i18n.t("uiGuildAgentSettingsPanel.gpt5Mini"); } },
  { value: "openai/gpt-5", get label() { return i18n.t("uiGuildAgentSettingsPanel.gpt5"); } },
];

async function call(action: string, payload: Record<string, unknown> = {}) {
  const { data, error } = await supabase.functions.invoke("guild-agent", {
    body: { action, language: i18n.language, ...payload },
  });
  if (error) throw error;
  if ((data as any)?.error) throw new Error((data as any).error);
  return data;
}

export function GuildAgentSettingsPanel({ guildId, guildName }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [agent, setAgent] = useState<Agent | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("Agent");
  const [persona, setPersona] = useState("");
  const [model, setModel] = useState(MODELS[0].value);
  const [allowMcp, setAllowMcp] = useState(false);

  const [sources, setSources] = useState<Source[]>([]);
  const [sourcesLoading, setSourcesLoading] = useState(false);

  const [openAddSource, setOpenAddSource] = useState(false);
  const [sourceType, setSourceType] = useState<"manual" | "url">("manual");
  const [sourceTitle, setSourceTitle] = useState("");
  const [sourceContent, setSourceContent] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [adding, setAdding] = useState(false);

  const [chatInput, setChatInput] = useState("");
  const [chatLog, setChatLog] = useState<ChatMsg[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);

  const loadAgent = async () => {
    setLoading(true);
    try {
      const res = await call("get_agent", { guild_id: guildId });
      const a = (res as any).agent as Agent | null;
      if (a) {
        setAgent(a);
        setName(a.name);
        setPersona(a.persona_prompt);
        setModel(a.model);
        setAllowMcp(a.allow_mcp_write);
      }
    } catch (e: any) {
      toast({ title: t("uiGuildAgentSettingsPanel.failedToLoadAgent"), description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const loadSources = async (agentId: string) => {
    setSourcesLoading(true);
    try {
      const res = await call("list_sources", { agent_id: agentId });
      setSources(((res as any).sources as Source[]) ?? []);
    } catch (e: any) {
      toast({ title: t("uiGuildAgentSettingsPanel.failedToLoadSources"), description: e.message, variant: "destructive" });
    } finally {
      setSourcesLoading(false);
    }
  };

  useEffect(() => {
    loadAgent();
  }, [guildId]);

  useEffect(() => {
    if (agent?.id) loadSources(agent.id);
  }, [agent?.id]);

  const saveAgent = async () => {
    setSaving(true);
    try {
      const res = await call("upsert_agent", {
        guild_id: guildId,
        name,
        persona_prompt: persona,
        model,
        allow_mcp_write: allowMcp,
      });
      setAgent((res as any).agent);
      toast({ title: t("uiGuildAgentSettingsPanel.agentSaved") });
    } catch (e: any) {
      toast({ title: t("uiGuildAgentSettingsPanel.saveFailed"), description: e.message, variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const addSource = async () => {
    if (!agent) return;
    const config =
      sourceType === "manual"
        ? { content: sourceContent }
        : { url: sourceUrl };
    if (sourceType === "manual" && !sourceContent.trim()) {
      toast({ title: t("uiGuildAgentSettingsPanel.addSomeContentFirst"), variant: "destructive" });
      return;
    }
    if (sourceType === "url" && !sourceUrl.trim()) {
      toast({ title: t("uiGuildAgentSettingsPanel.addAUrlFirst"), variant: "destructive" });
      return;
    }
    setAdding(true);
    try {
      await call("add_source", {
        agent_id: agent.id,
        type: sourceType,
        title: sourceTitle || (sourceType === "url" ? sourceUrl : t("uiGuildAgentSettingsPanel.manualEntry")),
        config,
      });
      toast({ title: t("uiGuildAgentSettingsPanel.sourceAddedIndexingInBackground") });
      setOpenAddSource(false);
      setSourceTitle("");
      setSourceContent("");
      setSourceUrl("");
      setTimeout(() => loadSources(agent.id), 1500);
    } catch (e: any) {
      toast({ title: t("uiGuildAgentSettingsPanel.addSourceFailed"), description: e.message, variant: "destructive" });
    } finally {
      setAdding(false);
    }
  };

  const resync = async (id: string) => {
    if (!agent) return;
    try {
      await call("resync_source", { source_id: id });
      toast({ title: t("uiGuildAgentSettingsPanel.resyncStarted") });
      setTimeout(() => loadSources(agent.id), 1500);
    } catch (e: any) {
      toast({ title: t("uiGuildAgentSettingsPanel.resyncFailed"), description: e.message, variant: "destructive" });
    }
  };

  const remove = async (id: string) => {
    if (!agent) return;
    if (!confirm(t("uiGuildAgentSettingsPanel.deleteThisSourceAndAllIts"))) return;
    try {
      await call("delete_source", { source_id: id });
      setSources((prev) => prev.filter((s) => s.id !== id));
    } catch (e: any) {
      toast({ title: t("uiGuildAgentSettingsPanel.deleteFailed"), description: e.message, variant: "destructive" });
    }
  };

  const sendChat = async () => {
    if (!agent || !chatInput.trim()) return;
    const message = chatInput.trim();
    setChatLog((p) => [...p, { role: "user", content: message }]);
    setChatInput("");
    setChatLoading(true);
    try {
      const res = await call("chat", {
        agent_id: agent.id,
        message,
        conversation_id: conversationId,
      });
      const r = res as any;
      if (r.conversation_id) setConversationId(r.conversation_id);
      setChatLog((p) => [...p, { role: "assistant", content: r.reply ?? "(no reply)" }]);
    } catch (e: any) {
      setChatLog((p) => [
        ...p,
        { role: "assistant", content: `⚠️ ${e.message}` },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> {t("uiGuildAgentSettingsPanel.loadingAgent")}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-3">
        <div className="p-2 rounded-lg bg-primary/10">
          <Bot className="w-5 h-5 text-primary" />
        </div>
        <div className="flex-1">
          <h2 className="text-lg font-semibold">{t("uiGuildAgentSettingsPanel.guildAiAgent")}</h2>
          <p className="text-sm text-muted-foreground">
            {t("uiGuildAgentSettingsPanel.giveYourGuildAPrivateAi")}
          </p>
        </div>
      </div>

      <Tabs defaultValue="identity">
        <TabsList>
          <TabsTrigger value="identity"><Sparkles className="w-4 h-4 mr-1" /> {t("uiGuildAgentSettingsPanel.identity")}</TabsTrigger>
          <TabsTrigger value="sources" disabled={!agent}><FileText className="w-4 h-4 mr-1" /> {t("uiGuildAgentSettingsPanel.knowledge")}</TabsTrigger>
          <TabsTrigger value="channels" disabled={!agent}><LinkIcon className="w-4 h-4 mr-1" /> {t("uiGuildAgentSettingsPanel.channels")}</TabsTrigger>
          <TabsTrigger value="chat" disabled={!agent}><MessageSquare className="w-4 h-4 mr-1" /> {t("uiGuildAgentSettingsPanel.testChat")}</TabsTrigger>
        </TabsList>

        {/* IDENTITY */}
        <TabsContent value="identity" className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="agent-name">{t("uiGuildAgentSettingsPanel.agentName")}</Label>
            <Input id="agent-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="agent-persona">{t("uiGuildAgentSettingsPanel.personaSystemPrompt")}</Label>
            <Textarea
              id="agent-persona"
              rows={6}
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
              placeholder={`You are the AI agent of ${guildName ?? "this guild"}. Be concise, professional, and accurate.`}
            />
            <p className="text-xs text-muted-foreground">
              {t("uiGuildAgentSettingsPanel.theAgentAlwaysKnowsTheName")}
            </p>
          </div>
          <div className="space-y-2">
            <Label>{t("uiGuildAgentSettingsPanel.model")}</Label>
            <Select value={model} onValueChange={setModel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MODELS.map((m) => (
                  <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between rounded-md border p-3">
            <div>
              <Label className="text-sm">{t("uiGuildAgentSettingsPanel.allowTheAgentToWriteThrough")}</Label>
              <p className="text-xs text-muted-foreground">
                {t("uiGuildAgentSettingsPanel.whenOnTheAgentCanPost")}
              </p>
            </div>
            <Switch checked={allowMcp} onCheckedChange={setAllowMcp} />
          </div>
          <Button onClick={saveAgent} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
            {agent ? t("uiGuildAgentSettingsPanel.saveChanges") : t("uiGuildAgentSettingsPanel.createAgent")}
          </Button>
        </TabsContent>

        {/* SOURCES */}
        <TabsContent value="sources" className="space-y-4 mt-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-medium">{t("uiGuildAgentSettingsPanel.knowledgeSources")}</h3>
              <p className="text-xs text-muted-foreground">
                {t("uiGuildAgentSettingsPanel.anythingYouAddHereIsChunked")}
              </p>
            </div>
            <Dialog open={openAddSource} onOpenChange={setOpenAddSource}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="w-4 h-4 mr-1" /> {t("uiGuildAgentSettingsPanel.addSource")}</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader><DialogTitle>{t("uiGuildAgentSettingsPanel.addAKnowledgeSource")}</DialogTitle></DialogHeader>
                <div className="space-y-3">
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={sourceType === "manual" ? "default" : "outline"}
                      onClick={() => setSourceType("manual")}
                    >{t("uiGuildAgentSettingsPanel.pasteText")}</Button>
                    <Button
                      size="sm"
                      variant={sourceType === "url" ? "default" : "outline"}
                      onClick={() => setSourceType("url")}
                    >{t("uiGuildAgentSettingsPanel.fromUrl")}</Button>
                    <Button size="sm" variant="outline" disabled>{t("uiGuildAgentSettingsPanel.googleDriveSoon")}</Button>
                    <Button size="sm" variant="outline" disabled>{t("uiGuildAgentSettingsPanel.nextcloudSoon")}</Button>
                  </div>
                  <div className="space-y-2">
                    <Label>{t("uiGuildAgentSettingsPanel.titleOptional")}</Label>
                    <Input value={sourceTitle} onChange={(e) => setSourceTitle(e.target.value)} />
                  </div>
                  {sourceType === "manual" ? (
                    <div className="space-y-2">
                      <Label>{t("uiGuildAgentSettingsPanel.content")}</Label>
                      <Textarea rows={8} value={sourceContent} onChange={(e) => setSourceContent(e.target.value)} />
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <Label>URL</Label>
                      <Input value={sourceUrl} onChange={(e) => setSourceUrl(e.target.value)} placeholder="https://…" />
                      <p className="text-xs text-muted-foreground">{t("uiGuildAgentSettingsPanel.weWillFetchThePageAnd")}</p>
                    </div>
                  )}
                  <Button onClick={addSource} disabled={adding}>
                    {adding ? <Loader2 className="w-4 h-4 animate-spin mr-1" /> : null}
                    {t("uiGuildAgentSettingsPanel.addIndex")}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </div>

          <Separator />

          {sourcesLoading ? (
            <div className="text-sm text-muted-foreground">{t("uiGuildAgentSettingsPanel.loading")}</div>
          ) : sources.length === 0 ? (
            <div className="text-sm text-muted-foreground">{t("uiGuildAgentSettingsPanel.noSourcesYetAddTheFirst")}</div>
          ) : (
            <div className="space-y-2">
              {sources.map((s) => (
                <div key={s.id} className="flex items-center gap-3 rounded-md border p-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <Badge variant="secondary">{s.type}</Badge>
                      <span className="font-medium truncate">{s.title || t("uiGuildAgentSettingsPanel.untitled")}</span>
                      <Badge variant={s.status === "ready" ? "default" : s.status === "error" ? "destructive" : "outline"}>
                        {s.status}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      {s.document_count} chunks
                      {s.last_sync_at ? ` · synced ${formatDistanceToNow(new Date(s.last_sync_at), { addSuffix: true })}` : ""}
                      {s.last_error ? ` · ${s.last_error}` : ""}
                    </div>
                  </div>
                  <Button size="sm" variant="ghost" onClick={() => resync(s.id)}>
                    <RefreshCw className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => remove(s.id)}>
                    <Trash2 className="w-4 h-4 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* CHANNELS (placeholder, next batch) */}
        <TabsContent value="channels" className="space-y-3 mt-4">
          <p className="text-sm text-muted-foreground">
            {t("uiGuildAgentSettingsPanel.conversationalChannelsAreShippingInThe")}
          </p>
          <ul className="text-sm list-disc pl-5 space-y-1">
            <li>{t("uiGuildAgentSettingsPanel.telegramBotPasteATokenFrom")}</li>
            <li>{t("uiGuildAgentSettingsPanel.whatsappViaTwilioMetaBusiness")}</li>
            <li>{t("uiGuildAgentSettingsPanel.signalViaSelfHostedSignalCli")}</li>
            <li>{t("uiGuildAgentSettingsPanel.embeddableWebWidget")}<code>&lt;iframe&gt;</code> {t("uiGuildAgentSettingsPanel.snippet")}</li>
          </ul>
          <p className="text-xs text-muted-foreground">
            {t("uiGuildAgentSettingsPanel.forNowYouCanAlreadyTalk")}
          </p>
        </TabsContent>

        {/* TEST CHAT */}
        <TabsContent value="chat" className="space-y-3 mt-4">
          <div className="rounded-md border h-72 overflow-y-auto p-3 space-y-2 bg-muted/30">
            {chatLog.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("uiGuildAgentSettingsPanel.askYourAgentSomethingItWill")}</p>
            ) : (
              chatLog.map((m, i) => (
                <div key={i} className={m.role === "user" ? "text-right" : ""}>
                  <div className={`inline-block max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                    m.role === "user" ? "bg-primary text-primary-foreground" : "bg-card border"
                  }`}>
                    {m.content}
                  </div>
                </div>
              ))
            )}
            {chatLoading && (
              <div className="text-sm text-muted-foreground flex items-center gap-2">
                <Loader2 className="w-3 h-3 animate-spin" /> {t("uiGuildAgentSettingsPanel.thinking")}
              </div>
            )}
          </div>
          <div className="flex gap-2">
            <Input
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChat(); } }}
              placeholder={t("uiGuildAgentSettingsPanel.askTheAgent")}
              disabled={chatLoading}
            />
            <Button onClick={sendChat} disabled={chatLoading || !chatInput.trim()}>
              <Send className="w-4 h-4" />
            </Button>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
