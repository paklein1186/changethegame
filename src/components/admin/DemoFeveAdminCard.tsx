import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, FlaskConical, Loader2, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function DemoFeveAdminCard() {
  const qc = useQueryClient();
  const [action, setAction] = useState<string | null>(null);
  const { data: count = 0, refetch } = useQuery({
    queryKey: ["demo-feve-registry-count"],
    queryFn: async () => {
      const { count, error } = await (supabase as any).from("demo_seed_registry").select("id", { count: "exact", head: true }).eq("seed_key", "feve-2026-12");
      if (error) throw error;
      return count ?? 0;
    },
  });
  const mutation = useMutation({
    mutationFn: async (value: "seed" | "reset" | "purge") => {
      setAction(value);
      const { data, error } = await supabase.functions.invoke("demo-feve-seed", { body: { action: value } });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: async (_data, value) => {
      toast.success(value === "seed" ? "Démo FEVE chargée" : value === "reset" ? "Démo FEVE réinitialisée" : "Données démo purgées");
      await Promise.all([refetch(), qc.invalidateQueries({ queryKey: ["demo-feve-snapshot"] })]);
    },
    onError: (error: any) => toast.error(error?.message ?? "L’action démo a échoué"),
    onSettled: () => setAction(null),
  });
  const run = (value: "seed" | "reset" | "purge") => {
    if (value !== "seed" && !window.confirm(value === "reset" ? "Purger puis recréer toute la démo FEVE ?" : "Supprimer toutes les données inventoriées de la démo FEVE ?")) return;
    mutation.mutate(value);
  };
  return <Card>
    <CardHeader>
      <CardTitle className="flex items-center gap-2"><FlaskConical className="h-5 w-5 text-primary" /> Démo FEVE</CardTitle>
      <CardDescription>Données fictives isolées des comptes réels. {count} lignes actuellement inventoriées.</CardDescription>
    </CardHeader>
    <CardContent className="flex flex-wrap gap-2">
      <Button disabled={!!action} onClick={() => run("seed")}>{action === "seed" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />} Charger</Button>
      <Button variant="outline" disabled={!!action} onClick={() => run("reset")}>{action === "reset" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RotateCcw className="mr-2 h-4 w-4" />} Réinitialiser</Button>
      <Button variant="destructive" disabled={!!action || count === 0} onClick={() => run("purge")}>{action === "purge" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />} Purger</Button>
    </CardContent>
  </Card>;
}
