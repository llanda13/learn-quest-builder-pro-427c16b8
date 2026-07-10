import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { TestValidations } from "@/services/db/testValidations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, CheckCircle2, RotateCcw } from "lucide-react";

// Part I — 4-point Likert scale criteria
const LIKERT_ITEMS: { key: string; label: string; description: string }[] = [
  {
    key: "content_validity",
    label: "Content Validity & Accuracy",
    description:
      "The test items align with the prescribed course objectives/syllabus and contain factually correct information.",
  },
  {
    key: "stem_clarity",
    label: "Stem Clarity",
    description:
      "The question stems are clearly stated, concise, and free from grammatical ambiguity.",
  },
  {
    key: "single_definite_answer",
    label: "Single Definite Answer",
    description: "Each generated test question has exactly one correct answer.",
  },
  {
    key: "distractor_plausibility",
    label: "Distractor Plausibility",
    description:
      "The incorrect options are realistic, plausible, and reflect common student misconceptions.",
  },
  {
    key: "technical_formatting",
    label: "Technical Formatting",
    description:
      "The options avoid grammatical cues, answer-length bias, or formatting patterns that reveal the correct answer.",
  },
];

const LIKERT_SCALE: { value: string; label: string }[] = [
  { value: "4", label: "4 — Strongly Agree" },
  { value: "3", label: "3 — Agree" },
  { value: "2", label: "2 — Disagree" },
  { value: "1", label: "1 — Strongly Disagree" },
];

const BLOOM_OPTIONS: { value: string; label: string }[] = [
  { value: "completely_aligned", label: "Yes, completely aligned." },
  { value: "partially_aligned", label: "Partially aligned." },
  { value: "not_aligned", label: "No, not aligned." },
];

// Weighted-mean interpretation bands (standard 4-point Likert)
function interpretMean(mean: number): string {
  if (mean >= 3.25) return "Strongly Agree — Excellent";
  if (mean >= 2.5) return "Agree — Acceptable";
  if (mean >= 1.75) return "Disagree — Needs Improvement";
  return "Strongly Disagree — Unacceptable";
}

export default function ValidateTestPage() {
  const { testId } = useParams<{ testId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [test, setTest] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [likert, setLikert] = useState<Record<string, string>>({});
  const [bloom, setBloom] = useState<string>("");
  const [itemsForRevision, setItemsForRevision] = useState("");
  const [generalComments, setGeneralComments] = useState("");
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

  const { weightedMean, percentage, answered } = useMemo(() => {
    const values = LIKERT_ITEMS.map((i) => Number(likert[i.key])).filter(
      (n) => !Number.isNaN(n) && n > 0,
    );
    if (values.length === 0)
      return { weightedMean: 0, percentage: 0, answered: 0 };
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    return {
      weightedMean: Number(mean.toFixed(2)),
      percentage: Math.round((mean / 4) * 100),
      answered: values.length,
    };
  }, [likert]);

  const interpretation = weightedMean ? interpretMean(weightedMean) : "—";

  const submit = async (decision: "approved" | "revision_requested") => {
    if (!testId) return;
    if (answered < LIKERT_ITEMS.length) {
      toast({
        title: "Incomplete ratings",
        description: "Please rate all five Part I criteria before submitting.",
        variant: "destructive",
      });
      return;
    }
    if (!bloom) {
      toast({
        title: "Bloom's alignment required",
        description: "Please select the cognitive-domain alignment answer.",
        variant: "destructive",
      });
      return;
    }
    if (decision === "revision_requested" && !itemsForRevision.trim() && !generalComments.trim()) {
      toast({
        title: "Comments required",
        description:
          "Please list the items needing revision or provide general comments before requesting revision.",
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
        weighted_mean: weightedMean,
        interpretation,
        likert_scores: Object.fromEntries(
          Object.entries(likert).map(([k, v]) => [k, Number(v)]),
        ),
        bloom_alignment: bloom,
        items_for_revision: itemsForRevision.trim() || undefined,
        general_comments: generalComments.trim() || undefined,
      });
      toast({
        title: decision === "approved" ? "Validated (Approved)" : "Needs Revision",
        description:
          decision === "approved"
            ? "The questionnaire is now Validated and eligible for printing/export."
            : "The teacher will see your feedback and can revise or regenerate.",
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

      {/* Part I — Item Quality & Structural Soundness */}
      <Card>
        <CardHeader>
          <CardTitle>Part I — Item Quality &amp; Structural Soundness</CardTitle>
          <p className="text-sm text-muted-foreground">
            4-point Likert Scale: 4 = Strongly Agree, 3 = Agree, 2 = Disagree, 1 = Strongly Disagree
          </p>
        </CardHeader>
        <CardContent className="space-y-6">
          {LIKERT_ITEMS.map((item) => (
            <div key={item.key} className="space-y-2">
              <div>
                <div className="font-medium text-sm">{item.label}</div>
                <div className="text-xs text-muted-foreground">{item.description}</div>
              </div>
              <RadioGroup
                value={likert[item.key] ?? ""}
                onValueChange={(v) => setLikert((s) => ({ ...s, [item.key]: v }))}
                className="grid grid-cols-1 sm:grid-cols-4 gap-2"
              >
                {LIKERT_SCALE.map((opt) => (
                  <label
                    key={opt.value}
                    className="flex items-center gap-2 border rounded p-2 cursor-pointer hover:bg-muted/50 text-sm"
                  >
                    <RadioGroupItem value={opt.value} id={`${item.key}-${opt.value}`} />
                    <span>{opt.label}</span>
                  </label>
                ))}
              </RadioGroup>
              <Separator className="mt-2" />
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Part II — Cognitive Domain Alignment */}
      <Card>
        <CardHeader>
          <CardTitle>Part II — Cognitive Domain Alignment Verification</CardTitle>
          <p className="text-sm text-muted-foreground">
            Bloom's Taxonomy Alignment — verify whether the generated questions accurately match
            their intended Bloom's Taxonomy cognitive levels, particularly Higher-Order Thinking
            Skills (Applying, Analyzing, Evaluating, and Creating).
          </p>
        </CardHeader>
        <CardContent>
          <RadioGroup value={bloom} onValueChange={setBloom} className="space-y-2">
            {BLOOM_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className="flex items-center gap-3 border rounded p-3 cursor-pointer hover:bg-muted/50 text-sm"
              >
                <RadioGroupItem value={opt.value} id={`bloom-${opt.value}`} />
                <span>{opt.label}</span>
              </label>
            ))}
          </RadioGroup>
        </CardContent>
      </Card>

      {/* Open-ended */}
      <Card>
        <CardHeader>
          <CardTitle>Open-ended Evaluation</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="items_for_revision">Specific Items for Revision</Label>
            <p className="text-xs text-muted-foreground">
              List item numbers with factual errors, ambiguous wording, incorrect answer keys, or
              Bloom's Taxonomy misalignment, together with your suggested revisions.
            </p>
            <Textarea
              id="items_for_revision"
              rows={4}
              placeholder="e.g. Item 3 — incorrect answer key; suggest changing correct answer to B…"
              value={itemsForRevision}
              onChange={(e) => setItemsForRevision(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="general_comments">General Comments and Recommendations</Label>
            <Textarea
              id="general_comments"
              rows={4}
              placeholder="Overall assessment and recommendations regarding the AI-generated questionnaire…"
              value={generalComments}
              onChange={(e) => setGeneralComments(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Summary + actions */}
      <Card>
        <CardHeader>
          <CardTitle>Computed Results</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="border rounded p-3">
              <div className="text-xs text-muted-foreground">Percentage of Correctness</div>
              <div className="text-2xl font-semibold">{percentage}%</div>
              <div className="text-xs text-muted-foreground">
                Based on weighted mean ÷ 4
              </div>
            </div>
            <div className="border rounded p-3">
              <div className="text-xs text-muted-foreground">Overall Weighted Mean</div>
              <div className="text-2xl font-semibold">{weightedMean || "—"}</div>
              <div className="text-xs text-muted-foreground">
                {answered}/{LIKERT_ITEMS.length} criteria rated
              </div>
            </div>
            <div className="border rounded p-3">
              <div className="text-xs text-muted-foreground">Interpretation</div>
              <div className="text-base font-semibold mt-1">{interpretation}</div>
            </div>
          </div>
          <Separator />
          <div className="flex justify-end gap-2 pt-2">
            <Button
              variant="outline"
              onClick={() => submit("revision_requested")}
              disabled={submitting}
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Needs Revision
            </Button>
            <Button onClick={() => submit("approved")} disabled={submitting}>
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Validated (Approve)
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
