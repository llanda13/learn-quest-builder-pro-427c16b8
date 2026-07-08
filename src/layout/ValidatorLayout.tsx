import { ReactNode, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import {
  LayoutDashboard,
  ClipboardCheck,
  LogOut,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

const menu = [
  {
    title: "Pending Validations",
    href: "/validator/pending",
    icon: ClipboardCheck,
    description: "Review generated questionnaires",
  },
  {
    title: "History",
    href: "/validator/history",
    icon: LayoutDashboard,
    description: "Past validation decisions",
  },
];

interface Props {
  children: ReactNode;
}

export function ValidatorLayout({ children }: Props) {
  const [collapsed, setCollapsed] = useState(false);
  const location = useLocation();
  const { user, signOut } = useAuth();
  const isActive = (path: string) =>
    location.pathname === path || location.pathname.startsWith(path + "/");

  return (
    <div className="min-h-screen text-foreground flex">
      <div
        className={cn(
          "fixed top-0 left-0 flex flex-col h-screen bg-card border-r border-border transition-all duration-300 z-50 shadow-sm",
          collapsed ? "w-16" : "w-64",
        )}
      >
        <div className="flex items-center justify-between p-4 border-b border-border">
          {!collapsed && (
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <ShieldCheck className="w-4 h-4 text-primary-foreground" />
              </div>
              <div>
                <h1 className="font-bold text-lg text-foreground">Evaluator</h1>
                <p className="text-xs text-muted-foreground">Expert Validation</p>
              </div>
            </div>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(!collapsed)}
            className="shrink-0 text-muted-foreground hover:text-foreground hover:bg-muted"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </Button>
        </div>

        <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
          {menu.map((item) => {
            const Icon = item.icon;
            const active = isActive(item.href);
            return (
              <Link
                key={item.href}
                to={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200",
                  active
                    ? "bg-primary text-primary-foreground shadow-lg shadow-primary/20"
                    : "text-foreground/70 hover:bg-muted hover:text-foreground",
                )}
              >
                <Icon className="w-5 h-5 shrink-0" />
                {!collapsed && (
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{item.title}</div>
                    <div
                      className={cn(
                        "text-xs truncate",
                        active ? "text-primary-foreground/80" : "text-muted-foreground",
                      )}
                    >
                      {item.description}
                    </div>
                  </div>
                )}
              </Link>
            );
          })}
        </nav>

        <nav className="p-2 space-y-1 border-t border-border">
          <button
            onClick={() => signOut()}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-all duration-200 w-full text-foreground/70 hover:bg-muted hover:text-foreground"
          >
            <LogOut className="w-5 h-5 shrink-0" />
            {!collapsed && <div className="font-medium">Sign Out</div>}
          </button>
        </nav>

        {!collapsed && (
          <div className="p-4 border-t border-border">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-accent rounded-full flex items-center justify-center">
                <Users className="w-4 h-4 text-accent-foreground" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="font-medium text-sm text-foreground truncate">{user?.email}</div>
                <div className="text-xs text-muted-foreground">Evaluator</div>
              </div>
            </div>
          </div>
        )}
      </div>

      <main
        className={cn(
          "flex-1 overflow-auto transition-all duration-300 bg-secondary/10",
          collapsed ? "ml-16" : "ml-64",
        )}
      >
        {children}
      </main>
    </div>
  );
}
