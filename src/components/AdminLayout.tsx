import i18n from "@/i18n/config";
import { Navigate, Outlet, useLocation, Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  BarChart3, Users as UsersIcon, Shield, Compass, ShoppingBag, Sprout,
  Hash, CreditCard, MessageSquare, Star, ScrollText, Bell, Mail,
  Settings, Zap, Flag, Building2, LayoutDashboard, ChevronRight,
  Menu, X, ShieldAlert, ToggleLeft, Trophy, Bot, Loader2,
  Image as ImageIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useCurrentUser } from "@/hooks/useCurrentUser";
import { useUserRoles } from "@/lib/admin";
import { AppNav } from "@/components/AppNav";
import { useState } from "react";
import {
  DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

interface NavItem {
  to: string;
  label: string;
  icon: React.ElementType;
}

interface NavCluster {
  label: string;
  icon: React.ElementType;
  items: NavItem[];
  superadminOnly?: boolean;
}

const clusters: NavCluster[] = [
  {
    get label() { return i18n.t("uiAdminLayout.overview"); },
    icon: BarChart3,
    items: [
      { to: "/admin", get label() { return i18n.t("uiAdminLayout.dashboard"); }, icon: LayoutDashboard },
    ],
  },
  {
    get label() { return i18n.t("uiAdminLayout.community"); },
    icon: UsersIcon,
    items: [
      { to: "/admin/community/users", get label() { return i18n.t("uiAdminLayout.users"); }, icon: UsersIcon },
      { to: "/admin/community/guilds", get label() { return i18n.t("uiAdminLayout.guilds"); }, icon: Shield },
      { to: "/admin/community/pods", get label() { return i18n.t("uiAdminLayout.pods"); }, icon: Hash },
      { to: "/admin/community/companies", get label() { return i18n.t("uiAdminLayout.tradOrganizations"); }, icon: Building2 },
    ],
  },
  {
    get label() { return i18n.t("uiAdminLayout.content"); },
    icon: Compass,
    items: [
      { to: "/admin/content/quests", get label() { return i18n.t("uiAdminLayout.quests"); }, icon: Compass },
      { to: "/admin/content/territory-covers", get label() { return i18n.t("uiAdminLayout.territoryCovers"); }, icon: ImageIcon },
      { to: "/admin/content/courses", get label() { return i18n.t("uiAdminLayout.courses"); }, icon: ScrollText },
      { to: "/admin/content/services", get label() { return i18n.t("uiAdminLayout.services"); }, icon: ShoppingBag },
      { to: "/admin/content/reports", get label() { return i18n.t("uiAdminLayout.reportsModeration"); }, icon: Flag },
      { to: "/admin/content/feature-suggestions", get label() { return i18n.t("uiAdminLayout.featureIdeas"); }, icon: Zap },
    ],
  },
  {
    get label() { return i18n.t("uiAdminLayout.economyOps"); },
    icon: CreditCard,
    items: [
      { to: "/admin/economy/bookings", get label() { return i18n.t("uiAdminLayout.bookingsSessions"); }, icon: CreditCard },
      { to: "/admin/economy/payments", get label() { return i18n.t("uiAdminLayout.paymentsRevenue"); }, icon: Zap },
      { to: "/admin/economy/commissions", get label() { return i18n.t("uiAdminLayout.commissionRules"); }, icon: CreditCard },
      { to: "/admin/economy/xp", get label() { return i18n.t("uiAdminLayout.xpAchievements"); }, icon: Star },
      { to: "/admin/economy/plans", get label() { return i18n.t("uiAdminLayout.plans"); }, icon: CreditCard },
      { to: "/admin/economy/notifications", get label() { return i18n.t("uiAdminLayout.notifications"); }, icon: Bell },
      { to: "/admin/economy/emails", get label() { return i18n.t("uiAdminLayout.emailsDigests"); }, icon: Mail },
      { to: "/admin/economy/treasury", get label() { return i18n.t("uiAdminLayout.treasuryRevenue"); }, icon: Zap },
      { to: "/admin/economy/milestones", get label() { return i18n.t("uiAdminLayout.milestones"); }, icon: Trophy },
      { to: "/admin/economy/agent-billing", get label() { return i18n.t("uiAdminLayout.agentBilling"); }, icon: Bot },
      { to: "/admin/economy/ctg", get label() { return i18n.t("uiAdminLayout.ctgToken"); }, icon: Sprout },
      { to: "/admin/economy/distribution-concerns", get label() { return i18n.t("uiAdminLayout.distributionConcerns"); }, icon: Flag },
    ],
  },
  {
    get label() { return i18n.t("uiAdminLayout.system"); },
    icon: Settings,
    superadminOnly: true,
    items: [
      { to: "/admin/system/super-mode", get label() { return i18n.t("uiAdminLayout.superAdminMode"); }, icon: ShieldAlert },
      { to: "/admin/system/email-templates", get label() { return i18n.t("uiAdminLayout.emailTemplates"); }, icon: Mail },
      { to: "/admin/system/feature-toggles", get label() { return i18n.t("uiAdminLayout.featureToggles"); }, icon: ToggleLeft },
      { to: "/admin/system/roles", get label() { return i18n.t("uiAdminLayout.usersRoles"); }, icon: UsersIcon },
      { to: "/admin/system/houses", get label() { return i18n.t("uiAdminLayout.topicsTerritories"); }, icon: Hash },
      { to: "/admin/system/stewardship", get label() { return i18n.t("uiAdminLayout.stewardship"); }, icon: Shield },
      { to: "/admin/system/governance", get label() { return i18n.t("uiAdminLayout.governance"); }, icon: Star },
      { to: "/admin/system/audit", get label() { return i18n.t("uiAdminLayout.auditLogs"); }, icon: ScrollText },
      { to: "/admin/system/integrations", get label() { return i18n.t("uiAdminLayout.integrations"); }, icon: Settings },
    ],
  },
];

export default function AdminLayout() {
  const currentUser = useCurrentUser();
  const { isAdmin, isSuperAdmin, isLoading: rolesLoading } = useUserRoles(currentUser.id);
  const { pathname } = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Wait for the roles query before deciding to redirect — otherwise every
  // hard navigation/refresh briefly sees isAdmin:false (query hasn't resolved
  // yet) and bounces a real admin straight back to "/".
  if (rolesLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return <Navigate to="/" replace />;
  }

  const visibleClusters = clusters.filter(
    (c) => !c.superadminOnly || isSuperAdmin
  );

  const isActive = (to: string) => {
    if (to === "/admin") return pathname === "/admin";
    return pathname.startsWith(to);
  };

  const sidebar = (
    <nav className="flex flex-col gap-1 py-4 px-3">
      {visibleClusters.map((cluster) => (
        <div key={cluster.label} className="mb-2">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold px-3 mb-1">
            {cluster.label}
          </p>
          {cluster.items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              onClick={() => setSidebarOpen(false)}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm transition-colors",
                isActive(item.to)
                  ? "bg-primary text-primary-foreground font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <item.icon className="h-3.5 w-3.5 shrink-0" />
              <span>{item.label}</span>
            </Link>
          ))}
        </div>
      ))}
    </nav>
  );

  return (
    <div className="min-h-screen flex flex-col">
      <AppNav />

      {/* Mobile top nav - horizontal scrollable chips */}
      <div className="lg:hidden sticky top-14 z-30 bg-card/95 backdrop-blur border-b border-border overflow-x-auto">
        <div className="flex items-center gap-1 px-2 py-2 min-w-max">
          {visibleClusters.map((cluster) => (
            <DropdownMenu key={cluster.label}>
              <DropdownMenuTrigger asChild>
                <button
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-colors shrink-0",
                    cluster.items.some((i) => isActive(i.to))
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted text-muted-foreground hover:text-foreground"
                  )}
                >
                  <cluster.icon className="h-3.5 w-3.5" />
                  {cluster.label}
                  <ChevronRight className="h-3 w-3 rotate-90" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                {cluster.items.map((item) => (
                  <DropdownMenuItem key={item.to} asChild>
                    <Link
                      to={item.to}
                      className={cn(
                        "cursor-pointer",
                        isActive(item.to) && "bg-primary/10 font-medium"
                      )}
                    >
                      <item.icon className="h-3.5 w-3.5 mr-2" />
                      {item.label}
                    </Link>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          ))}
        </div>
      </div>

      <div className="flex flex-1">
        {/* Desktop sidebar */}
        <aside className="hidden lg:flex w-56 shrink-0 border-r border-border bg-card/50 overflow-y-auto sticky top-14 h-[calc(100vh-3.5rem)]">
          {sidebar}
        </aside>

        {/* Main content */}
        <main className="flex-1 min-w-0 p-3 sm:p-6 lg:p-8 overflow-x-auto">
          <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2 }}>
            <Outlet />
          </motion.div>
        </main>
      </div>
    </div>
  );
}
