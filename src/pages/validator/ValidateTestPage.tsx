import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { TestValidations } from "@/services/db/testValidations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, CheckCircle2, RotateCcw } from "lucide-react";

// Validation instrument — each item is scored yes/no; % correctness = yes/total.
const INSTRUMENT: { key: string; label: string }[] = [
  { key: "aligned_tos", label: "Items are aligned with the assigned TOS topics and weights" },
  { key: "bloom_correct", label: "Bloom's Taxonomy levels are correctly represented" },
  { key: "content_accurate", label: "Question content is factually and academically accurate" },
  { key: "no_ambiguity", label: "Questions are clearly worded and free from ambiguity" },
  { key: "plausible_distractors", label: "Distractors are plausible and grade-appropriate" },
  { key: "answer_key_correct", label: "Answer key is correct for every item" },
  { key: "difficulty_appropriate", label: "Difficulty is appropriate for the target learners" },
  { key: "no_bias", label: "Items are free from cultural, gender, or ideological bias" },
  { key: "coverage_complete", label: "Content coverage matches the TOS distribution" },
  { key: "language_quality", label: "Grammar, spelling, and formatting meet academic standards" },
];

export default function ValidateTestPage() {
  const { testId } = useParams<{ testId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [test, setTest] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [scores, setScores] = useState<Record<string, boolean>>({});
  const [comments, setComments] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!testId) return;
    (async () => {
      const { data, error } = await supabase
        .from("generated_tests")
        .select("*")
        .eq("id", testId)
        .maybeSingle();
      if (error) {
        toast({ title: "Load error", description: error.message, variant: "destructive" });
      } else {
        setTest(data);
      }
      setLoading(false);
    })();
  }, [testId, toast]);

  const percentage = useMemo(() => {
    const yes = INSTRUMENT.filter((c) => scores[c.key]).length;
    return Math.round((yes / INSTRUMENT.length) * 100);
  }, [scores]);

  const submit = async (decision: "approved" | "revision_requested") => {
    if (!testId) return;
    if (decision === "revision_requested" && !comments.trim()) {
      toast({
        title: "Comments required",
        description: "Please explain what needs revision.",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      await TestValidations.submit({
        generated_test_id: testId,
        percentage_correctness: percentage,
        decision,
        comments: comments.trim() || undefined,
        instrument_scores: scores,
      });
      toast({
        title: decision === "approved" ? "Approved" : "Revision requested",
        description:
          decision === "approved"
            ? "The questionnaire is now Validated and eligible for printing/export."
            : "The teacher will see your comments and can regenerate.",
      });
      navigate("/validator/pending");
    } catch (err: any) {
      toast({
        title: "Submission failed",
        description: err?.message ?? String(err),
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="container mx-auto py-8">Loading questionnaire…</div>;
  }
  if (!test) {
    return (
      <div className="container mx-auto py-8">
        <Button variant="outline" onClick={() => navigate("/validator/pending")}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back
        </Button>
        <p className="mt-4 text-muted-foreground">Questionnaire not found.</p>
      </div>
    );
  }

  const items: any[] = Array.isArray(test.items) ? test.items : [];

  return (
    <div className="container mx-auto py-8 px-4 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => navigate("/validator/pending")}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Pending
        </Button>
        <Badge variant="secondary">Status: {test.validation_status}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{test.title || "Untitled Questionnaire"}</CardTitle>
          <div className="text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
            <span>Subject: {test.course ? `${test.course} — ` : ""}{test.subject || "—"}</span>
            <span>Exam: {test.exam_period || "—"}</span>
            <span>SY: {test.school_year || "—"}</span>
            <span>Semester: {test.semester || "—"}</span>
            <span>Items: {items.length}</span>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="max-h-[500px] overflow-y-auto space-y-3 pr-2 border rounded p-3 bg-muted/30">
            {items.map((it: any, i: number) => {
              const choices = it?.choices;
              return (
                <div key={i} className="text-sm">
                  <div className="font-medium">
                    {i + 1}. {it?.question_text || it?.question || "(no text)"}
                  </div>
                  {Array.isArray(choices) ? (
                    <ul className="ml-5 mt-1 space-y-0.5">
                      {choices.map((c: any, ci: number) => (
                        <li key={ci}>
                          {String.fromCharCode(65 + ci)}. {String(c)}
                        </li>
                      ))}
                    </ul>
                  ) : choices && typeof choices === "object" ? (
                    <ul className="ml-5 mt-1 space-y-0.5">
                      {Object.entries(choices).map(([k, v]) => (
                        <li key={k}>
                          {k}. {String(v)}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                  <div className="text-xs text-muted-foreground mt-1">
                    Answer: {String(it?.correct_answer ?? it?.correctAnswer ?? "—")} · Bloom:{" "}
                    {it?.bloom_level || "—"} · Topic: {it?.topic || "—"}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Validation Instrument</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {INSTRUMENT.map((c) => (
            <label
              key={c.key}
              className="flex items-start gap-3 p-2 rounded hover:bg-muted/50 cursor-pointer"
            >
              <Checkbox
                checked={!!scores[c.key]}
                onCheckedChange={(v) =>
                  setScores((s) => ({ ...s, [c.key]: v === true }))
                }
              />
              <span className="text-sm">{c.label}</span>
            </label>
          ))}
          <Separator />
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {INSTRUMENT.filter((c) => scores[c.key]).length} of {INSTRUMENT.length} criteria met
            </div>
            <div className="text-2xl font-semibold">
              {percentage}% <span className="text-sm font-normal text-muted-foreground">correctness</span>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="comments">Comments / feedback</Label>
            <Textarea
              id="comments"
              rows={4}
              placeholder="Add any comments for the teacher (required when requesting revision)…"
              value={comments}
              onChange={(e) => setComments(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => submit("revision_requested")}
              disabled={submitting}
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Request Revision
            </Button>
            <Button onClick={() => submit("approved")} disabled={submitting}>
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Approve
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
