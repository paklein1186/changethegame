import { useTranslation } from "react-i18next";
import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Cookie, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";

const CONSENT_KEY = "cookie_consent";

export function CookieConsentBanner() {
  const { t } = useTranslation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(CONSENT_KEY);
    if (!stored) setVisible(true);
  }, []);

  const accept = (level: "all" | "essential") => {
    localStorage.setItem(CONSENT_KEY, level);
    setVisible(false);
  };

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ y: 100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 100, opacity: 0 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className="fixed bottom-0 inset-x-0 z-50 p-4"
        >
          <div className="mx-auto max-w-3xl rounded-2xl border border-border bg-card shadow-lg p-5">
            <div className="flex items-start gap-4">
              <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                <Cookie className="h-5 w-5 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-display font-semibold text-sm mb-1">{t("uiCookieConsentBanner.weUseCookies")}</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {t("uiCookieConsentBanner.weUseCookiesToImproveYour")}{" "}
                  <Link to="/cookies" className="text-primary hover:underline">{t("uiCookieConsentBanner.learnMore")}</Link>
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  <Button size="sm" onClick={() => accept("all")}>{t("uiCookieConsentBanner.acceptAll")}</Button>
                  <Button size="sm" variant="outline" onClick={() => accept("essential")}>{t("uiCookieConsentBanner.essentialOnly")}</Button>
                  <Button size="sm" variant="ghost" asChild>
                    <Link to="/cookies"><Settings className="h-3.5 w-3.5 mr-1" /> {t("uiCookieConsentBanner.settings")}</Link>
                  </Button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
