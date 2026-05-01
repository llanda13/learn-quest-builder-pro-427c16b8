import { ReactNode, useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/lib/auth";
import { supabase } from '@/integrations/supabase/client';
import { 
  LayoutDashboard, 
  FileText, 
  Sparkles, 
  Clock,
  
  Settings,
  LogOut,
  ChevronLeft,
  ChevronRight,
  User,
  BookOpen,
  Database,
  Menu,
  X,
  Brain
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";

const teacherMenuItems = [
  { 
    title: "Dashboard", 
    href: "/teacher/dashboard", 
    icon: LayoutDashboard,
    description: "Personal overview" 
  },
  { 
    title: "TOS Builder", 
    href: "/teacher/tos", 
    icon: FileText,
    description: "Create specifications" 
  },
  { 
    title: "My Tests", 
    href: "/teacher/my-tests", 
    icon: BookOpen,
    description: "View generated tests" 
  },
  { 
    title: "Question Bank", 
    href: "/teacher/question-bank", 
    icon: Database,
    description: "Browse questions" 
  },
  { 
    title: "TOS History", 
    href: "/teacher/tos-history", 
    icon: Clock,
    description: "Saved specifications" 
  },
  { 
    title: "AI Assistant", 
    href: "/teacher/ai-assistant", 
    icon: Brain,
    description: "Academic AI helper" 
  },
];

const bottomMenuItems = [
  { 
    title: "Settings", 
    href: "/teacher/settings", 
    icon: Settings,
    description: "Account preferences" 
  },
];

interface TeacherLayoutProps {
  children: ReactNode;
}

export function TeacherLayout({ children }: TeacherLayoutProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profile, setProfile] = useState<{ full_name?: string; avatar_url?: string } | null>(null);
  const location = useLocation();
  const { user, signOut } = useAuth();

  useEffect(() => {
    if (user) {
      fetchProfile();
    }
  }, [user]);

  const fetchProfile = async () => {
    try {
      const { data } = await supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('id', user?.id)
        .single();
      setProfile(data);
    } catch (error) {
      console.error('Error fetching profile:', error);
    }
  };

  const isActive = (path: string) => location.pathname === path || location.pathname.startsWith(path + "/");

  const handleSignOut = async () => {
    await signOut();
  };

  const getInitials = (name?: string) => {
    if (!name) return 'U';
    return name
      .split(' ')
      .map(n => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);
  };

  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'Teacher';
  const portalTitle = profile?.full_name ? `${profile.full_name.split(' ')[0]}'s Portal` : 'Teacher Portal';

  const SidebarContent = ({ isMobile = false }: { isMobile?: boolean }) => (
    <>
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        {(!collapsed || isMobile) && (
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="font-bold text-lg truncate">EduTest AI</h1>
              <p className="text-xs text-muted-foreground truncate">{portalTitle}</p>
            </div>
          </div>
        )}
        {!isMobile && (
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setCollapsed(!collapsed)}
            className="shrink-0 hidden lg:flex"
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </Button>
        )}
      </div>

      {/* Main Navigation */}
      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {teacherMenuItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          
          return (
            <Link
              key={item.href}
              to={item.href}
              onClick={() => isMobile && setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 group",
                active 
                  ? "bg-primary text-primary-foreground shadow-sm" 
                  : "hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Icon className={cn("w-5 h-5 shrink-0", active ? "text-primary-foreground" : "text-muted-foreground group-hover:text-foreground")} />
              {(!collapsed || isMobile) && (
                <div className="min-w-0 flex-1">
                  <div className="font-medium">{item.title}</div>
                  <div className={cn(
                    "text-xs truncate",
                    active ? "text-primary-foreground/80" : "text-muted-foreground"
                  )}>
                    {item.description}
                  </div>
                </div>
              )}
            </Link>
          );
        })}
      </nav>

      {/* Bottom Navigation */}
      <nav className="p-2 space-y-1 border-t border-border">
        {bottomMenuItems.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.href);
          
          return (
            <Link
              key={item.href}
              to={item.href}
              onClick={() => isMobile && setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200",
                active 
                  ? "bg-primary text-primary-foreground" 
                  : "hover:bg-accent hover:text-accent-foreground"
              )}
            >
              <Icon className="w-5 h-5 shrink-0" />
              {(!collapsed || isMobile) && <div className="font-medium">{item.title}</div>}
            </Link>
          );
        })}
        
        <button
          onClick={handleSignOut}
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-200 w-full hover:bg-accent hover:text-accent-foreground"
        >
          <LogOut className="w-5 h-5 shrink-0" />
          {(!collapsed || isMobile) && <div className="font-medium">Sign Out</div>}
        </button>
      </nav>

      {/* User Info */}
      {(!collapsed || isMobile) && (
        <div className="p-4 border-t border-border">
          <div className="flex items-center gap-3">
            <Avatar className="h-8 w-8">
              <AvatarImage src={profile?.avatar_url} alt={displayName} />
              <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-500 text-white text-xs">
                {getInitials(profile?.full_name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="font-medium text-sm truncate">{displayName}</div>
              <div className="text-xs text-muted-foreground truncate">{user?.email}</div>
            </div>
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="min-h-screen bg-background flex" data-sidebar-provider="true">
      {/* Mobile Header */}
      <div className="lg:hidden fixed top-0 left-0 right-0 h-14 bg-card border-b border-border z-50 flex items-center justify-between px-4 screen-only">
        <div className="flex items-center gap-2">
          <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon">
                <Menu className="h-5 w-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-72 p-0">
              <div className="flex flex-col h-full">
                <SidebarContent isMobile />
              </div>
            </SheetContent>
          </Sheet>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-gradient-to-br from-blue-500 to-cyan-500 rounded-lg flex items-center justify-center">
              <Sparkles className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-bold">EduTest AI</span>
          </div>
        </div>
        <Avatar className="h-8 w-8">
          <AvatarImage src={profile?.avatar_url} alt={displayName} />
          <AvatarFallback className="bg-gradient-to-br from-blue-500 to-purple-500 text-white text-xs">
            {getInitials(profile?.full_name)}
          </AvatarFallback>
        </Avatar>
      </div>

      {/* Desktop Sidebar - Fixed position - Hidden when printing */}
      <div 
        data-sidebar="true"
        className={cn(
          "fixed top-0 left-0 hidden lg:flex flex-col h-screen bg-card border-r border-border transition-all duration-300 z-50 screen-only",
          collapsed ? "w-16" : "w-64"
        )}
      >
        <SidebarContent />
      </div>

      {/* Main Content - with margin to account for fixed sidebar */}
      <main className={cn(
        "flex-1 overflow-auto transition-all duration-300 print:ml-0 pt-14 lg:pt-0",
        collapsed ? "lg:ml-16" : "lg:ml-64"
      )}>
        {children}
      </main>
    </div>
  );
}
