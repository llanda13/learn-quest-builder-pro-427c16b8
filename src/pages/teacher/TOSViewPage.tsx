import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { TOSMatrix } from "@/components/TOSMatrix";
import { calculateCanonicalTOSMatrix, CanonicalTOSMatrix, BloomLevel } from "@/utils/tosCalculator";

export default function TOSViewPage() {
  const { tosId } = useParams<{ tosId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [tosMatrix, setTosMatrix] = useState<CanonicalTOSMatrix | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (tosId) fetchTOS();
  }, [tosId]);

  const fetchTOS = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from("tos_entries")
        .select("*")
        .eq("id", tosId!)
        .single();

      if (error) throw error;
      if (!data) throw new Error("TOS not found");

      // Reconstruct topics from distribution or topics field
      let topics: { topic: string; hours: number }[] = [];

      if (data.topics && Array.isArray(data.topics)) {
        topics = (data.topics as any[]).map((t: any) => ({
          topic: t.topic || t.name || "",
          hours: t.hours || 0,
        }));
      } else if (data.distribution && typeof data.distribution === "object") {
        topics = Object.entries(data.distribution as Record<string, any>).map(
          ([name, d]: [string, any]) => ({
            topic: name,
            hours: d?.hours || 3,
          })
        );
      }

      // Also fetch learning competencies as fallback
      if (topics.length === 0) {
        const { data: comps } = await supabase
          .from("learning_competencies")
          .select("*")
          .eq("tos_id", tosId!);

        if (comps && comps.length > 0) {
          topics = comps.map((c) => ({
            topic: c.topic_name,
            hours: c.hours || 3,
          }));
        }
      }

      if (topics.length === 0) {
        throw new Error("No topics found for this TOS");
      }

      // Check if distribution already has the canonical format
      const dist = data.distribution as Record<string, any> | null;
      const hasCanonicalFormat = dist && Object.values(dist).some(
        (v: any) => v?.remembering && typeof v.remembering === 'object' && 'count' in v.remembering
      );

      if (hasCanonicalFormat && dist) {
        // Already canonical - reconstruct directly
        const bloomLevels: BloomLevel[] = ['remembering', 'understanding', 'applying', 'analyzing', 'evaluating', 'creating'];
        const bloom_totals: Record<BloomLevel, number> = {} as any;
        bloomLevels.forEach(l => {
          bloom_totals[l] = Object.values(dist).reduce((sum: number, t: any) => sum + (t[l]?.count || 0), 0);
        });

        const matrix: CanonicalTOSMatrix = {
          id: data.id,
          title: data.title || `${data.course} - ${data.exam_period}`,
          subject_no: data.subject_no || "",
          course: data.course || "",
          description: data.description || "",
          year_section: data.year_section || "",
          exam_period: data.exam_period || "",
          school_year: data.school_year || "",
          semester: (data as any).semester || "",
          prepared_by: data.prepared_by || "",
          checked_by: data.checked_by || "",
          noted_by: data.noted_by || "",
          created_at: data.created_at,
          total_items: data.total_items || 50,
          total_hours: topics.reduce((s, t) => s + t.hours, 0),
          topics,
          distribution: dist as any,
          bloom_totals,
          matrix: {} as any,
        };
        setTosMatrix(matrix);
      } else {
        // Recalculate from scratch
        const matrix = calculateCanonicalTOSMatrix({
          subject_no: data.subject_no || "",
          course: data.course || "",
          description: data.description || "",
          year_section: data.year_section || "",
          exam_period: data.exam_period || "",
          school_year: data.school_year || "",
          semester: (data as any).semester || "",
          total_items: data.total_items || 50,
          prepared_by: data.prepared_by || "",
          checked_by: data.checked_by || "",
          noted_by: data.noted_by || "",
          topics,
        });
        // Override ID with the real DB id
        matrix.id = data.id;
        setTosMatrix(matrix);
      }
    } catch (error: any) {
      console.error("Error fetching TOS:", error);
      toast({
        title: "Error",
        description: error.message || "Failed to load TOS",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto py-8 space-y-6">
        <Skeleton className="h-12 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!tosMatrix) {
    return (
      <div className="container mx-auto py-8 text-center">
        <p className="text-muted-foreground">TOS not found</p>
        <Button className="mt-4" onClick={() => navigate("/teacher/tos-history")}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to History
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center justify-between print:hidden">
        <Button variant="outline" onClick={() => navigate("/teacher/tos-history")}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to History
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.print()}>
            <Printer className="w-4 h-4 mr-2" />
            Print
          </Button>
        </div>
      </div>

      <TOSMatrix data={tosMatrix} />
    </div>
  );
}
