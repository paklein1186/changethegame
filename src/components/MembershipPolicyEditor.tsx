import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Save, Plus, X, ClipboardList } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

interface MembershipPolicyEditorProps {
  joinPolicy: string;
  applicationQuestions: string[];
  onSave: (joinPolicy: string, questions: string[]) => void;
}

export function MembershipPolicyEditor({
  joinPolicy: initialPolicy,
  applicationQuestions: initialQuestions,
  onSave,
}: MembershipPolicyEditorProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const [joinPolicy, setJoinPolicy] = useState(initialPolicy);
  const [questions, setQuestions] = useState<string[]>(initialQuestions);
  const [newQuestion, setNewQuestion] = useState("");

  const handleSave = () => {
    onSave(joinPolicy, questions);
    toast({ title: t("uiMembershipPolicyEditor.membershipPolicySaved") });
  };

  return (
    <div className="space-y-6 max-w-lg">
      <div>
        <h3 className="font-display text-lg font-semibold flex items-center gap-2 mb-3">
          <ClipboardList className="h-5 w-5" /> {t("uiMembershipPolicyEditor.joinPolicy")}
        </h3>
        <p className="text-sm text-muted-foreground mb-3">{t("uiMembershipPolicyEditor.controlHowUsersCanJoin")}</p>
        <Select value={joinPolicy} onValueChange={setJoinPolicy}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="OPEN">{t("uiMembershipPolicyEditor.openAnyoneCanJoinInstantly")}</SelectItem>
            <SelectItem value="APPROVAL_REQUIRED">{t("uiMembershipPolicyEditor.applicationRequiredUsersMustApply")}</SelectItem>
            <SelectItem value="INVITE_ONLY">{t("uiMembershipPolicyEditor.inviteOnlyOnlyAdminsCanAdd")}</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {joinPolicy === "APPROVAL_REQUIRED" && (
        <>
          <Separator />
          <div>
            <h3 className="font-display text-lg font-semibold flex items-center gap-2 mb-3">
              <ClipboardList className="h-5 w-5" /> {t("uiMembershipPolicyEditor.applicationQuestions")}
            </h3>
            <p className="text-sm text-muted-foreground mb-3">
              {t("uiMembershipPolicyEditor.defineQuestionsApplicantsMustAnswerLeave")}
            </p>
            <div className="space-y-2 mb-3">
              {questions.map((q, i) => (
                <div key={i} className="flex items-center gap-2 rounded-lg border border-border bg-card p-3">
                  <span className="text-sm flex-1">{q}</span>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-destructive shrink-0"
                    onClick={() => setQuestions((prev) => prev.filter((_, idx) => idx !== i))}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
              {questions.length === 0 && (
                <p className="text-xs text-muted-foreground italic">{t("uiMembershipPolicyEditor.noQuestionsYetApplicantsWillSubmit")}</p>
              )}
            </div>
            <div className="flex gap-2">
              <Input
                value={newQuestion}
                onChange={(e) => setNewQuestion(e.target.value)}
                placeholder={t("uiMembershipPolicyEditor.addAQuestion")}
                maxLength={200}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newQuestion.trim()) {
                    setQuestions((prev) => [...prev, newQuestion.trim()]);
                    setNewQuestion("");
                  }
                }}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={!newQuestion.trim()}
                onClick={() => {
                  setQuestions((prev) => [...prev, newQuestion.trim()]);
                  setNewQuestion("");
                }}
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}

      <Button onClick={handleSave} className="w-full">
        <Save className="h-4 w-4 mr-2" /> {t("uiMembershipPolicyEditor.saveMembershipPolicy")}
      </Button>
    </div>
  );
}
