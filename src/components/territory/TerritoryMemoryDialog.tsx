import { useTranslation } from "react-i18next";
import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { X } from "lucide-react";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import {
  useAddTerritoryMemory,
  useUpdateTerritoryMemory,
  MEMORY_CATEGORIES,
  type TerritoryMemoryEntry,
  type MemoryCategory,
  type MemoryVisibility,
} from "@/hooks/useTerritoryMemory";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  territoryId: string;
  editEntry: TerritoryMemoryEntry | null;
}

export function TerritoryMemoryDialog({ open, onOpenChange, territoryId, editEntry }: Props) {
  const { t } = useTranslation();
  const currentUser = useCurrentUser();
  const addMutation = useAddTerritoryMemory();
  const updateMutation = useUpdateTerritoryMemory();

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [category, setCategory] = useState<MemoryCategory>("RAW_NOTES");
  const [visibility, setVisibility] = useState<MemoryVisibility>("PUBLIC");
  const [tagInput, setTagInput] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  useEffect(() => {
    if (editEntry) {
      setTitle(editEntry.title);
      setContent(editEntry.content);
      setCategory(editEntry.category);
      setVisibility(editEntry.visibility);
      setTags(editEntry.tags ?? []);
    } else {
      setTitle("");
      setContent("");
      setCategory("RAW_NOTES");
      setVisibility("PUBLIC");
      setTags([]);
    }
    setTagInput("");
  }, [editEntry, open]);

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (t && !tags.includes(t)) setTags(prev => [...prev, t]);
    setTagInput("");
  };

  const removeTag = (tag: string) => setTags(prev => prev.filter(t => t !== tag));

  const handleSubmit = () => {
    if (!title.trim() || !content.trim()) return;

    if (editEntry) {
      updateMutation.mutate({
        id: editEntry.id,
        territory_id: territoryId,
        title: title.trim(),
        content: content.trim(),
        category,
        visibility,
        tags,
      }, { onSuccess: () => onOpenChange(false) });
    } else {
      addMutation.mutate({
        territory_id: territoryId,
        title: title.trim(),
        content: content.trim(),
        category,
        visibility,
        tags,
        created_by_user_id: currentUser.id,
      }, { onSuccess: () => onOpenChange(false) });
    }
  };

  const isSubmitting = addMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editEntry ? t("uiTerritoryMemoryDialog.editMemoryEntry") : t("uiTerritoryMemoryDialog.addTerritoryKnowledge")}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="mem-title">{t("uiTerritoryMemoryDialog.title")}</Label>
            <Input id="mem-title" value={title} onChange={e => setTitle(e.target.value)} placeholder={t("uiTerritoryMemoryDialog.eGLocalEconomicOverview2025")} />
          </div>

          <div>
            <Label htmlFor="mem-category">Category</Label>
            <Select value={category} onValueChange={v => setCategory(v as MemoryCategory)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MEMORY_CATEGORIES.map(c => (
                  <SelectItem key={c.value} value={c.value}>{c.icon} {c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label htmlFor="mem-content">Content</Label>
            <Textarea
              id="mem-content"
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Enter detailed knowledge, data, observations..."
              className="min-h-[140px]"
            />
          </div>

          <div>
            <Label htmlFor="mem-visibility">Visibility</Label>
            <Select value={visibility} onValueChange={v => setVisibility(v as MemoryVisibility)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="PUBLIC">{t("uiTerritoryMemoryDialog.publicVisibleToEveryone")}</SelectItem>
                <SelectItem value="ADMINS">{t("uiTerritoryMemoryDialog.membersOnlyTerritoryMembers")}</SelectItem>
                <SelectItem value="AI_ONLY">{t("uiTerritoryMemoryDialog.aiOnlyUsedForAiContext")}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Tags</Label>
            <div className="flex gap-2">
              <Input
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && (e.preventDefault(), addTag())}
                placeholder={t("uiTerritoryMemoryDialog.addATagAndPressEnter")}
                className="flex-1"
              />
              <Button type="button" variant="outline" size="sm" onClick={addTag}>{t("uiTerritoryMemoryDialog.add")}</Button>
            </div>
            {tags.length > 0 && (
              <div className="flex flex-wrap gap-1 mt-2">
                {tags.map(tag => (
                  <Badge key={tag} variant="secondary" className="gap-1 text-xs">
                    {tag}
                    <button onClick={() => removeTag(tag)}><X className="h-3 w-3" /></button>
                  </Badge>
                ))}
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("uiTerritoryMemoryDialog.cancel")}</Button>
          <Button onClick={handleSubmit} disabled={!title.trim() || !content.trim() || isSubmitting}>
            {isSubmitting ? "Saving..." : editEntry ? t("uiTerritoryMemoryDialog.update") : t("uiTerritoryMemoryDialog.addEntry")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
