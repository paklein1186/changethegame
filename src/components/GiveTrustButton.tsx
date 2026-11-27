import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Shield } from "lucide-react";
import { CreateTrustEdgeDialog } from "@/components/CreateTrustEdgeDialog";
import { TrustNodeType } from "@/types/enums";
import { useAuth } from "@/hooks/useAuth";

interface GiveTrustButtonProps {
  targetNodeType: TrustNodeType;
  targetNodeId: string;
  targetName?: string;
  contextQuestId?: string;
  contextGuildId?: string;
  contextTerritoryId?: string;
  onCreated?: () => void;
  size?: "sm" | "default" | "lg" | "icon";
  variant?: "default" | "outline" | "ghost" | "secondary";
}

export function GiveTrustButton({
  targetNodeType,
  targetNodeId,
  targetName,
  contextQuestId,
  contextGuildId,
  contextTerritoryId,
  onCreated,
  size = "sm",
  variant = "outline",
}: GiveTrustButtonProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const { user } = useAuth();

  // Don't show for own profile
  if (targetNodeType === TrustNodeType.PROFILE && user?.id === targetNodeId) return null;
  // Must be logged in
  if (!user) return null;

  return (
    <>
      <Button size={size} variant={variant} onClick={() => setOpen(true)}>
        <Shield className="h-4 w-4 mr-1" /> {t("uiGiveTrustButton.giveTrust")}
      </Button>
      <CreateTrustEdgeDialog
        open={open}
        onOpenChange={setOpen}
        targetNodeType={targetNodeType}
        targetNodeId={targetNodeId}
        targetName={targetName}
        contextQuestId={contextQuestId}
        contextGuildId={contextGuildId}
        contextTerritoryId={contextTerritoryId}
        onCreated={onCreated}
      />
    </>
  );
}
