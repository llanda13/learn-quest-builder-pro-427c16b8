import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { TOSReviewDialog, ParsedTOSData } from "./TOSReviewDialog";

interface TOSUploadParserProps {
  onParsed: (data: ParsedTOSData) => void;
}

export function TOSUploadParser({ onParsed }: TOSUploadParserProps) {
  const [isParsing, setIsParsing] = useState(false);
  const [fileName, setFileName] = useState<string | null>(null);
  const [reviewData, setReviewData] = useState<ParsedTOSData | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const name = file.name.toLowerCase();
    if (!name.endsWith(".pdf") && !name.endsWith(".docx") && !name.endsWith(".doc")) {
      toast.error("Unsupported file format", {
        description: "Please upload a PDF or DOCX file.",
      });
      return;
    }

    if (file.size > 10 * 1024 * 1024) {
      toast.error("File too large", {
        description: "Maximum file size is 10MB.",
      });
      return;
    }

    setFileName(file.name);
    setIsParsing(true);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const { data: { session } } = await supabase.auth.getSession();
      
      const response = await fetch(
        `https://lohmzywgbkntvpuygvfx.supabase.co/functions/v1/parse-tos-document`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${session?.access_token || ""}`,
            apikey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxvaG16eXdnYmtudHZwdXlndmZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTI0MjYyNDUsImV4cCI6MjA2ODAwMjI0NX0.FCiA9ps4QYto38P0-sZcNcR3YtOJba9GV3PGeMwKuds",
          },
          body: formData,
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(errorData.error || `Server error: ${response.status}`);
      }

      const parsed: ParsedTOSData = await response.json();

      // Open review dialog instead of directly applying
      setReviewData(parsed);
      setReviewOpen(true);

      const warnings = parsed._warnings || [];
      if (warnings.length > 0) {
        toast.info("Document parsed — please review extracted data", {
          description: `${warnings.length} warning(s) found. Verify before applying.`,
          duration: 5000,
        });
      } else {
        toast.success("Document parsed successfully!", {
          description: "Review the extracted data and click Apply.",
        });
      }
    } catch (error) {
      console.error("TOS parse error:", error);
      toast.error("Failed to parse document", {
        description: error instanceof Error ? error.message : "Please try again or fill in manually.",
      });
    } finally {
      setIsParsing(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleConfirm = (confirmed: ParsedTOSData) => {
    onParsed(confirmed);
    setReviewData(null);
    
    const filledFields = [
      confirmed.subject_no, confirmed.course, confirmed.description,
      confirmed.year_section, confirmed.exam_period, confirmed.school_year,
    ].filter(f => f && f.length > 0).length;

    toast.success("TOS Data Applied", {
      description: `${filledFields} fields and ${confirmed.topics.length} topic(s) applied to the builder.`,
    });
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf,.docx,.doc"
          onChange={handleFileSelect}
          className="hidden"
          id="tos-upload"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => fileInputRef.current?.click()}
          disabled={isParsing}
          className="gap-2"
        >
          {isParsing ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Parsing {fileName ? `"${fileName}"` : "..."}
            </>
          ) : (
            <>
              <Upload className="h-4 w-4" />
              Upload Existing TOS
            </>
          )}
        </Button>
        {!isParsing && (
          <span className="text-xs text-muted-foreground">PDF or DOCX</span>
        )}
      </div>

      {reviewData && (
        <TOSReviewDialog
          open={reviewOpen}
          onOpenChange={setReviewOpen}
          data={reviewData}
          fileName={fileName || "document"}
          onConfirm={handleConfirm}
        />
      )}
    </>
  );
}
