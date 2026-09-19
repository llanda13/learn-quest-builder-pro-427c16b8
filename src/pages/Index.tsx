import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { HeroSection } from "@/components/HeroSection";
import { Button } from "@/components/ui/button";
import { useUserRole } from "@/hooks/useUserRole";
import { supabase } from "@/integrations/supabase/client";

const Index = () => {
  const navigate = useNavigate();
  const { role, loading } = useUserRole();

  // Redirect authenticated users to their appropriate dashboard
  useEffect(() => {
    if (loading) return;
    
    if (role === 'admin') {
      navigate('/admin/dashboard');
    } else if (role === 'validator') {
      navigate('/validator/pending');
    } else if (role === 'teacher') {
      navigate('/teacher/dashboard');
    }
  }, [role, loading, navigate]);

  const handleGetStarted = () => {
    navigate('/auth');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <HeroSection 
        onGetStarted={handleGetStarted}
        onLearnMore={() => {
          document.getElementById('features')?.scrollIntoView({ behavior: 'smooth' });
        }}
      />

      <section id="features" className="container mx-auto py-16 px-4">
        <h2 className="text-3xl font-bold text-center mb-12">System Features</h2>
        <div className="grid gap-6 md:grid-cols-3 max-w-6xl mx-auto">
          <div className="p-6 rounded-lg border bg-card">
            <h3 className="text-xl font-semibold mb-2">AI-Powered Generation</h3>
            <p className="text-muted-foreground">
              Automatically generate questions with semantic similarity detection to ensure non-redundant content
            </p>
          </div>
          <div className="p-6 rounded-lg border bg-card">
            <h3 className="text-xl font-semibold mb-2">Role-Based Access</h3>
            <p className="text-muted-foreground">
              Separate interfaces for Admins and Teachers with appropriate permissions
            </p>
          </div>
          <div className="p-6 rounded-lg border bg-card">
            <h3 className="text-xl font-semibold mb-2">Auto Answer Keys</h3>
            <p className="text-muted-foreground">
              Automatically generate answer keys for every test created
            </p>
          </div>
        </div>
      </section>
    </div>
  );
};

export default Index;
