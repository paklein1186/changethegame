import { useTranslation } from "react-i18next";
import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Send, Loader2, CheckCircle } from "lucide-react";
import logoImg from "@/assets/logo.png";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

export default function ForgotPassword() {
  const { t } = useTranslation();
  const { resetPassword } = useAuth();
  const { toast } = useToast();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    const { error } = await resetPassword(email.trim());
    setLoading(false);
    if (error) {
      toast({ title: t("uiForgotPassword.error"), description: error, variant: "destructive" });
    } else {
      setSent(true);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link to="/" className="inline-flex items-center gap-2 font-display text-2xl font-bold">
            <img src={logoImg} alt="changethegame" className="h-7 w-7" /> changethegame
          </Link>
          <p className="text-muted-foreground mt-2">{t("uiForgotPassword.resetYourPassword")}</p>
        </div>

        {sent ? (
          <div className="rounded-2xl border border-border bg-card p-8 text-center space-y-4">
            <CheckCircle className="h-12 w-12 text-primary mx-auto" />
            <h2 className="font-display text-xl font-bold">{t("uiForgotPassword.checkYourEmail")}</h2>
            <p className="text-sm text-muted-foreground">
              {t("uiForgotPassword.weSentAPasswordResetLink")} <strong>{email}</strong>{t("uiForgotPassword.clickTheLinkToSetA")}
            </p>
            <Link to="/login" className="text-sm text-primary hover:underline">{t("uiForgotPassword.backToLogin")}</Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="rounded-2xl border border-border bg-card p-8 space-y-5">
            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t("uiForgotPassword.youExampleCom")}
                required
                autoComplete="email"
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : <Send className="h-4 w-4 mr-2" />}
              {t("uiForgotPassword.sendResetLink")}
            </Button>
            <p className="text-center text-sm text-muted-foreground">
              <Link to="/login" className="text-primary hover:underline">{t("uiForgotPassword.backToLogin")}</Link>
            </p>
          </form>
        )}
      </motion.div>
    </div>
  );
}
