import i18n from "@/i18n/config";
import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { Eye, EyeOff, Trash2, Search, ShieldAlert, Save, Pencil, X, ExternalLink } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

type EntityType = "profiles" | "guilds" | "companies" | "quests" | "services" | "courses" | "pods";

const ENTITY_CONFIG: Record<EntityType, {
  label: string;
  searchField: string;
  nameField: string;
  idField: string;
  editableFields: string[];
  columns: string[];
}> = {
  profiles: {
    get label() { return i18n.t("uiAdminEntityEditor.users"); },
    searchField: "name",
    nameField: "name",
    idField: "user_id",
    editableFields: ["name", "bio", "role", "persona"],
    columns: ["name", "email", "role", "xp", "created_at"],
  },
  guilds: {
    get label() { return i18n.t("uiAdminEntityEditor.guilds"); },
    searchField: "name",
    nameField: "name",
    idField: "id",
    editableFields: ["name", "description", "type", "universe_visibility"],
    columns: ["name", "type", "is_draft", "is_deleted", "created_at"],
  },
  companies: {
    get label() { return i18n.t("uiAdminEntityEditor.traditionalOrganizations"); },
    searchField: "name",
    nameField: "name",
    idField: "id",
    editableFields: ["name", "description", "sector", "size"],
    columns: ["name", "sector", "size", "is_deleted", "created_at"],
  },
  quests: {
    get label() { return i18n.t("uiAdminEntityEditor.quests"); },
    searchField: "title",
    nameField: "title",
    idField: "id",
    editableFields: ["title", "description", "status", "budget_amount"],
    columns: ["title", "status", "budget_amount", "is_deleted", "created_at"],
  },
  services: {
    get label() { return i18n.t("uiAdminEntityEditor.services"); },
    searchField: "title",
    nameField: "title",
    idField: "id",
    editableFields: ["title", "description", "price_amount", "price_currency"],
    columns: ["title", "price_amount", "is_deleted", "created_at"],
  },
  courses: {
    get label() { return i18n.t("uiAdminEntityEditor.courses"); },
    searchField: "title",
    nameField: "title",
    idField: "id",
    editableFields: ["title", "description", "level", "is_published"],
    columns: ["title", "level", "is_published", "is_deleted", "created_at"],
  },
  pods: {
    get label() { return i18n.t("uiAdminEntityEditor.pods"); },
    searchField: "name",
    nameField: "name",
    idField: "id",
    editableFields: ["name", "description", "type"],
    columns: ["name", "type", "is_draft", "is_deleted", "created_at"],
  },
};

function getEntityLink(entityType: EntityType, record: any): string | null {
  const config = ENTITY_CONFIG[entityType];
  const id = record[config.idField];
  if (!id) return null;
  switch (entityType) {
    case "profiles": return `/users/${id}`;
    case "guilds": return `/guilds/${id}`;
    case "companies": return `/companies/${id}`;
    case "quests": return `/quests/${id}`;
    case "services": return `/services/${id}`;
    case "courses": return `/courses/${id}`;
    case "pods": return `/pods/${id}`;
    default: return null;
  }
}

interface AdminEntityEditorProps {
  maskPII: boolean;
}

function maskString(str: string): string {
  if (!str || str.length <= 2) return "***";
  return str[0] + "*".repeat(Math.min(str.length - 2, 8)) + str[str.length - 1];
}

function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "***@hidden";
  return `${local?.[0] ?? "u"}***@${domain}`;
}

export function AdminEntityEditor({ maskPII }: AdminEntityEditorProps) {
  const { t } = useTranslation();
  const [entityType, setEntityType] = useState<EntityType>("profiles");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValues, setEditValues] = useState<Record<string, any>>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  const config = ENTITY_CONFIG[entityType];

  const doSearch = async () => {
    setLoading(true);
    try {
      let query = supabase.from(entityType as any).select("*");
      if (search.trim()) {
        query = query.ilike(config.searchField as any, `%${search}%` as any);
      }
      const { data, error } = await query.order("created_at", { ascending: false }).limit(50);
      if (error) throw error;
      setResults((data ?? []) as any[]);
      setEditingId(null);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  };

  const startEdit = (record: any) => {
    const id = record[config.idField];
    setEditingId(id);
    const vals: Record<string, any> = {};
    config.editableFields.forEach((f) => {
      vals[f] = record[f] ?? "";
    });
    setEditValues(vals);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValues({});
  };

  const saveEdit = async (record: any) => {
    const id = record[config.idField];
    setSaving(true);
    try {
      const updatePayload: Record<string, any> = {};
      config.editableFields.forEach((f) => {
        const val = editValues[f];
        if (val === "") {
          updatePayload[f] = null;
        } else if (f === "budget_amount" || f === "price_amount") {
          updatePayload[f] = val ? Number(val) : null;
        } else if (f === "is_published") {
          updatePayload[f] = val === "true" || val === true;
        } else {
          updatePayload[f] = val;
        }
      });

      const { error } = await (supabase
        .from(entityType as any)
        .update(updatePayload as any) as any)
        .eq(config.idField, id);
      if (error) throw error;
      toast.success(t("uiAdminEntityEditor.recordUpdated"));
      setEditingId(null);
      doSearch();
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleSoftDelete = async (record: any) => {
    const id = record[config.idField];
    const newVal = !record.is_deleted;
    try {
      const { error } = await (supabase
        .from(entityType as any)
        .update({
          is_deleted: newVal,
          deleted_at: newVal ? new Date().toISOString() : null,
        } as any) as any)
        .eq(config.idField, id);
      if (error) throw error;
      toast.success(newVal ? t("uiAdminEntityEditor.recordHidden") : t("uiAdminEntityEditor.recordRestored"));
      doSearch();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const hardDelete = async (record: any) => {
    const id = record[config.idField];
    try {
      const { error } = await (supabase
        .from(entityType as any)
        .delete() as any)
        .eq(config.idField, id);
      if (error) throw error;
      toast.success(t("uiAdminEntityEditor.recordPermanentlyDeleted"));
      doSearch();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const displayValue = (key: string, value: any) => {
    if (value === null || value === undefined) return <span className="text-muted-foreground italic text-xs">—</span>;
    if (maskPII && key === "email" && typeof value === "string") return maskEmail(value);
    if (maskPII && (key === "name" || key === "title") && typeof value === "string") return maskString(value);
    if (typeof value === "boolean") {
      return value
        ? <Badge variant="default" className="text-[10px]">{t("uiAdminEntityEditor.yes")}</Badge>
        : <Badge variant="outline" className="text-[10px]">{t("uiAdminEntityEditor.no")}</Badge>;
    }
    if (key === "created_at" || key === "updated_at") {
      return new Date(value).toLocaleDateString();
    }
    return String(value);
  };

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="flex gap-2 items-end flex-wrap">
        <div>
          <Label className="text-xs mb-1 block">{t("uiAdminEntityEditor.entityType")}</Label>
          <Select
            value={entityType}
            onValueChange={(v) => {
              setEntityType(v as EntityType);
              setResults([]);
              setEditingId(null);
            }}
          >
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(ENTITY_CONFIG).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <Label className="text-xs mb-1 block">{t("uiAdminEntityEditor.searchBy")} {config.searchField}</Label>
          <div className="flex gap-2">
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={`Search ${config.label}…`}
              onKeyDown={(e) => e.key === "Enter" && doSearch()}
            />
            <Button onClick={doSearch} disabled={loading} size="sm">
              <Search className="h-4 w-4 mr-1" /> {t("uiAdminEntityEditor.search")}
            </Button>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {t("uiAdminEntityEditor.leaveSearchEmptyAndClickSearch")}
      </p>

      {/* Results table */}
      {results.length > 0 && (
        <div className="rounded-xl border border-border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                {config.columns.map((col) => (
                  <TableHead key={col} className="text-xs uppercase">{col.replace(/_/g, " ")}</TableHead>
                ))}
                <TableHead className="text-xs uppercase text-right">{t("uiAdminEntityEditor.actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {results.map((record) => {
                const id = record[config.idField];
                const isEditing = editingId === id;

                return (
                  <TableRow key={id} className={record.is_deleted ? "opacity-50" : ""}>
                    {config.columns.map((col) => {
                      const isNameCol = col === config.nameField;
                      const link = isNameCol ? getEntityLink(entityType, record) : null;
                      return (
                        <TableCell key={col} className="text-sm">
                          {isEditing && config.editableFields.includes(col) ? (
                            col === "description" || col === "bio" ? (
                              <Textarea
                                value={editValues[col] ?? ""}
                                onChange={(e) => setEditValues((v) => ({ ...v, [col]: e.target.value }))}
                                className="text-xs min-h-[60px]"
                              />
                            ) : (
                              <Input
                                value={editValues[col] ?? ""}
                                onChange={(e) => setEditValues((v) => ({ ...v, [col]: e.target.value }))}
                                className="text-xs h-7"
                              />
                            )
                          ) : link ? (
                            <Link to={link} className="text-primary hover:underline font-medium inline-flex items-center gap-1">
                              {displayValue(col, record[col])}
                              <ExternalLink className="h-3 w-3 opacity-50" />
                            </Link>
                          ) : (
                            displayValue(col, record[col])
                          )}
                        </TableCell>
                      );
                    })}
                    <TableCell className="text-right">
                      <div className="flex gap-1 justify-end">
                        {isEditing ? (
                          <>
                            <Button size="sm" variant="default" onClick={() => saveEdit(record)} disabled={saving}>
                              <Save className="h-3.5 w-3.5 mr-1" /> {t("uiAdminEntityEditor.save")}
                            </Button>
                            <Button size="sm" variant="ghost" onClick={cancelEdit}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button size="sm" variant="ghost" onClick={() => startEdit(record)} title={t("uiAdminEntityEditor.edit")}>
                              <Pencil className="h-3.5 w-3.5" />
                            </Button>
                            {"is_deleted" in record && (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => toggleSoftDelete(record)}
                                title={record.is_deleted ? t("uiAdminEntityEditor.restore") : t("uiAdminEntityEditor.hide")}
                              >
                                {record.is_deleted ? <Eye className="h-3.5 w-3.5 text-primary" /> : <EyeOff className="h-3.5 w-3.5 text-muted-foreground" />}
                              </Button>
                            )}
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button size="sm" variant="ghost" title={t("uiAdminEntityEditor.deletePermanently")}>
                                  <Trash2 className="h-3.5 w-3.5 text-destructive" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>{t("uiAdminEntityEditor.permanentlyDeleteThisRecord")}</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    {t("uiAdminEntityEditor.thisWillPermanentlyRemove")} <strong>{record[config.nameField]}</strong> {t("uiAdminEntityEditor.fromTheDatabaseThisActionCannot")}
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>{t("uiAdminEntityEditor.cancel")}</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => hardDelete(record)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                                    {t("uiAdminEntityEditor.deleteForever")}
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Inline editor for non-column fields */}
      {editingId && (() => {
        const record = results.find((r) => r[config.idField] === editingId);
        if (!record) return null;
        const hiddenEditableFields = config.editableFields.filter((f) => !config.columns.includes(f));
        if (hiddenEditableFields.length === 0) return null;

        return (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldAlert className="h-4 w-4 text-primary" />
                {t("uiAdminEntityEditor.additionalFieldsFor")} {maskPII ? maskString(record[config.nameField]) : record[config.nameField]}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {hiddenEditableFields.map((field) => (
                <div key={field} className="space-y-1">
                  <Label className="text-xs uppercase tracking-wider">{field.replace(/_/g, " ")}</Label>
                  {field === "description" || field === "bio" ? (
                    <Textarea
                      value={editValues[field] ?? ""}
                      onChange={(e) => setEditValues((v) => ({ ...v, [field]: e.target.value }))}
                      className="text-sm"
                    />
                  ) : (
                    <Input
                      value={editValues[field] ?? ""}
                      onChange={(e) => setEditValues((v) => ({ ...v, [field]: e.target.value }))}
                      className="text-sm"
                    />
                  )}
                </div>
              ))}
            </CardContent>
          </Card>
        );
      })()}

      {results.length === 0 && !loading && (
        <p className="text-sm text-muted-foreground text-center py-8">
          {t("uiAdminEntityEditor.useTheSearchAboveToFind")}
        </p>
      )}
    </div>
  );
}
