import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { formatDistanceToNow } from "date-fns";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export type FollowedPerson = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  followedAt: string;
};

type FollowedPeopleDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  actorName: string;
  people: FollowedPerson[];
};

export function FollowedPeopleDialog({
  open,
  onOpenChange,
  actorName,
  people,
}: FollowedPeopleDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("followActivity.peopleFollowedBy", { actor: actorName })}</DialogTitle>
          <DialogDescription>
            {t("followActivity.followedPeopleDescription", { actor: actorName, count: people.length })}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          {people.map((person) => (
            <Link
              key={person.id}
              to={`/users/${person.id}`}
              onClick={() => onOpenChange(false)}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-muted/60 focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <Avatar className="h-9 w-9 shrink-0">
                <AvatarImage src={person.avatarUrl || undefined} />
                <AvatarFallback className="text-xs">
                  {person.name[0]?.toUpperCase() || "?"}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{person.name}</p>
                <p className="text-xs text-muted-foreground">
                  {formatDistanceToNow(new Date(person.followedAt), { addSuffix: true })}
                </p>
              </div>
            </Link>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
