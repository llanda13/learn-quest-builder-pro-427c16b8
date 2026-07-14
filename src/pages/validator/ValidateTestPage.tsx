import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { TestValidations } from "@/services/db/testValidations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, CheckCircle2, RotateCcw } from "lucide-react";
import { TOSReferencePanel } from "@/components/TOSReferencePanel";

// Section 2 — Core Quality Ratings (6 criteria, 4-point Likert)
const LIKERT_ITEMS: { key: string; label: string; description: string }[] = [
  {
    key: "content_validity",
    label: "Content Validity & Accuracy",
    description:
      "The items align with the prescribed course objectives and contain factually correct information.",
  },
  {
    key: "stem_clarity",
    label: "Stem Clarity",
    description: "Question stems are clear, concise, and unambiguous.",
  },
  {
    key: "single_definite_answer",
    label: "Single Definite Answer",
    description: "Each item has exactly one correct answer.",
  },
  {
    key: "distractor_plausibility",
    label: "Distractor Plausibility",
    description:
      "Distractors are realistic, plausible, and based on common misconceptions.",
  },
  {
    key: "technical_formatting",
    label: "Technical Formatting",
    description:
      "Options do not reveal the answer through grammatical cues, length, or formatting patterns.",
  },
  {
    key: "grammar_mechanics",
    label: "Grammar & Mechanics",
    description:
      "Questions are free from spelling, grammar, awkward syntax, or unnatural AI-generated phrasing.",
  },
];

const LIKERT_SCALE = [
  { value: "1", label: "1 — Strongly Disagree" },
  { value: "2", label: "2 — Disagree" },
  { value: "3", label: "3 — Agree" },
  { value: "4", label: "4 — Strongly Agree" },
];

const EXPERIENCE_BANDS = [
  { value: "1-5", label: "1–5 years" },
  { value: "6-10", label: "6–10 years" },
  { value: "11-15", label: "11–15 years" },
  { value: "16+", label: "16+ years" },
];

const MATRIX_OPTIONS: { value: string; label: string; short: string }[] = [
  { value: "aligned", short: "Yes", label: "Yes — Completely Aligned" },
  { value: "too_low", short: "Too Low", label: "No — Mismatched (Too Low / Lower-order)" },
  { value: "too_high", short: "Too High", label: "No — Mismatched (Too High / Too Complex)" },
];

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

  // Section 1 — Expert Profile
  const [expertName, setExpertName] = useState("");
  const [expertPosition, setExpertPosition] = useState("");
  const [expertExperience, setExpertExperience] = useState("");

  // Section 2 — Likert
  const [likert, setLikert] = useState<Record<string, string>>({});

  // Section 3 — Per-item alignment matrix
  const [matrix, setMatrix] = useState<Record<number, string>>({});

  // Section 4 — Qualitative
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
      // Prefill expert name from profile
      const { data: auth } = await supabase.auth.getUser();
      if (auth.user) {
        const { data: prof } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", auth.user.id)
          .maybeSingle();
        if (prof?.full_name) setExpertName(prof.full_name);
      }
      setLoading(false);
    })();
  }, [testId, toast]);

  const items: any[] = useMemo(
    () => (Array.isArray(test?.items) ? test.items : []),
    [test],
  );

  const { weightedMean, percentage, answered, cvi, alignedCount } = useMemo(() => {
    const values = LIKERT_ITEMS.map((i) => Number(likert[i.key])).filter(
      (n) => !Number.isNaN(n) && n > 0,
    );
    const mean = values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;

    const aligned = Object.values(matrix).filter((v) => v === "aligned").length;
    const cviVal = items.length ? aligned / items.length : 0;

    return {
      weightedMean: Number(mean.toFixed(2)),
      percentage: Math.round((mean / 4) * 100),
      answered: values.length,
      cvi: Number(cviVal.toFixed(2)),
      alignedCount: aligned,
    };
  }, [likert, matrix, items.length]);

  const interpretation = weightedMean ? interpretMean(weightedMean) : "—";

  const submit = async (decision: "approved" | "revision_requested") => {
    if (!testId) return;
    if (!expertName.trim() || !expertPosition.trim() || !expertExperience) {
      toast({
        title: "Expert profile required",
        description: "Please complete your full name, position, and years of experience.",
        variant: "destructive",
      });
      return;
    }
    if (answered < LIKERT_ITEMS.length) {
      toast({
        title: "Incomplete ratings",
        description: "Please rate all six Core Quality criteria before submitting.",
        variant: "destructive",
      });
      return;
    }
    if (items.length > 0 && Object.keys(matrix).length < items.length) {
      toast({
        title: "Cognitive matrix incomplete",
        description: `Please classify all ${items.length} items in the Cognitive Domain Verification Matrix.`,
        variant: "destructive",
      });
      return;
    }
    if (!itemsForRevision.trim()) {
      toast({
        title: "Specific items for revision required",
        description:
          "Please indicate item numbers needing revision (or write 'None' if all items are acceptable).",
        variant: "destructive",
      });
      return;
    }
    setSubmitting(true);
    try {
      const matrixArr = items.map((_, i) => ({
        index: i + 1,
        verdict: matrix[i] ?? "unrated",
      }));
      await TestValidations.submit({
        generated_test_id: testId,
        percentage_correctness: percentage,
        decision,
        weighted_mean: weightedMean,
        interpretation,
        content_validity_index: cvi,
        likert_scores: Object.fromEntries(
          Object.entries(likert).map(([k, v]) => [k, Number(v)]),
        ),
        expert_full_name: expertName.trim(),
        expert_position: expertPosition.trim(),
        expert_experience: expertExperience,
        item_alignment_matrix: matrixArr,
        items_for_revision: itemsForRevision.trim(),
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

  return (
    <div className="container mx-auto py-8 px-4 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={() => navigate("/validator/pending")}>
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to Pending
        </Button>
        <Badge variant="secondary">Status: {test.validation_status}</Badge>
      </div>

      {/* Header */}
      <Card>
        <CardHeader>
          <CardTitle>Expert Validation Instrument for AI-Generated Test Questions (TQ)</CardTitle>
          <div className="text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
            <span>Title: {test.title || "Untitled Questionnaire"}</span>
            <span>Subject: {test.course ? `${test.course} — ` : ""}{test.subject || "—"}</span>
            <span>Exam: {test.exam_period || "—"}</span>
            <span>SY: {test.school_year || "—"}</span>
            <span>Semester: {test.semester || "—"}</span>
            <span>Items: {items.length}</span>
          </div>
        </CardHeader>
        <CardContent>
          <div className="max-h-[420px] overflow-y-auto space-y-3 pr-2 border rounded p-3 bg-muted/30">
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

      {/* Section 1 — Expert Profile */}
      <Card>
        <CardHeader>
          <CardTitle>Section 1 — Expert Profile</CardTitle>
          <p className="text-sm text-muted-foreground">
            Please provide your basic professional information.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="expert_name">Full Name</Label>
              <Input
                id="expert_name"
                value={expertName}
                onChange={(e) => setExpertName(e.target.value)}
                placeholder="e.g. Juan D. Dela Cruz"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expert_position">Current Position / Designation</Label>
              <Input
                id="expert_position"
                value={expertPosition}
                onChange={(e) => setExpertPosition(e.target.value)}
                placeholder="e.g. Associate Professor, Department Chair"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Years of Teaching Experience</Label>
            <Select value={expertExperience} onValueChange={setExpertExperience}>
              <SelectTrigger className="w-full md:w-72">
                <SelectValue placeholder="Select range" />
              </SelectTrigger>
              <SelectContent>
                {EXPERIENCE_BANDS.map((b) => (
                  <SelectItem key={b.value} value={b.value}>
                    {b.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Section 2 — Core Quality Ratings */}
      <Card>
        <CardHeader>
          <CardTitle>Section 2 — Core Quality Ratings</CardTitle>
          <p className="text-sm text-muted-foreground">
            4-point Likert Scale: 1 = Strongly Disagree, 2 = Disagree, 3 = Agree, 4 = Strongly Agree
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

      {/* Section 3 — Cognitive Domain Verification Matrix */}
      <Card>
        <CardHeader>
          <CardTitle>Section 3 — Cognitive Domain Verification Matrix</CardTitle>
          <p className="text-sm text-muted-foreground">
            For each item, verify whether the question matches its assigned Bloom's Taxonomy level.
            Total items: {items.length}
          </p>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto border rounded">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left p-2 w-14">#</th>
                  <th className="text-left p-2">Question</th>
                  <th className="text-left p-2 w-28">Assigned Bloom</th>
                  {MATRIX_OPTIONS.map((opt) => (
                    <th key={opt.value} className="text-center p-2 w-28">
                      {opt.short}
                      <div className="text-[10px] font-normal text-muted-foreground">
                        {opt.value === "aligned"
                          ? "Completely Aligned"
                          : opt.value === "too_low"
                          ? "Too Low / Lower-order"
                          : "Too High / Too Complex"}
                      </div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((it: any, i: number) => (
                  <tr key={i} className="border-t align-top">
                    <td className="p-2 font-medium">{i + 1}</td>
                    <td className="p-2">
                      <div className="line-clamp-2">
                        {it?.question_text || it?.question || "(no text)"}
                      </div>
                    </td>
                    <td className="p-2 text-xs text-muted-foreground">
                      {it?.bloom_level || "—"}
                    </td>
                    {MATRIX_OPTIONS.map((opt) => (
                      <td key={opt.value} className="p-2 text-center">
                        <input
                          type="radio"
                          name={`matrix-${i}`}
                          value={opt.value}
                          checked={matrix[i] === opt.value}
                          onChange={() =>
                            setMatrix((s) => ({ ...s, [i]: opt.value }))
                          }
                          aria-label={`Item ${i + 1} — ${opt.label}`}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="text-xs text-muted-foreground mt-2">
            Aligned: {alignedCount}/{items.length} · Content Validity Index (CVI):{" "}
            {items.length ? cvi.toFixed(2) : "—"}
          </div>
        </CardContent>
      </Card>

      {/* Section 4 — Qualitative Feedback & Recommendations */}
      <Card>
        <CardHeader>
          <CardTitle>Section 4 — Qualitative Feedback &amp; Recommendations</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="items_for_revision">
              Specific Items for Revision <span className="text-destructive">*</span>
            </Label>
            <p className="text-xs text-muted-foreground">
              Identify item numbers with factual errors, incorrect answer keys, Bloom's Taxonomy
              mismatches, or unclear wording and provide suggested corrections. Write "None" if all
              items are acceptable.
            </p>
            <Textarea
              id="items_for_revision"
              rows={5}
              placeholder="e.g. Item 3 — incorrect answer key; suggest changing correct answer to B…"
              value={itemsForRevision}
              onChange={(e) => setItemsForRevision(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="general_comments">
              General Comments and Recommendations{" "}
              <span className="text-muted-foreground text-xs">(optional)</span>
            </Label>
            <Textarea
              id="general_comments"
              rows={4}
              placeholder="Overall feedback on the AI question generator…"
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
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="border rounded p-3">
              <div className="text-xs text-muted-foreground">Percentage of Correctness</div>
              <div className="text-2xl font-semibold">{percentage}%</div>
              <div className="text-xs text-muted-foreground">Weighted mean ÷ 4</div>
            </div>
            <div className="border rounded p-3">
              <div className="text-xs text-muted-foreground">Weighted Mean</div>
              <div className="text-2xl font-semibold">{weightedMean || "—"}</div>
              <div className="text-xs text-muted-foreground">
                {answered}/{LIKERT_ITEMS.length} criteria rated
              </div>
            </div>
            <div className="border rounded p-3">
              <div className="text-xs text-muted-foreground">Content Validity Index</div>
              <div className="text-2xl font-semibold">
                {items.length ? cvi.toFixed(2) : "—"}
              </div>
              <div className="text-xs text-muted-foreground">
                {alignedCount}/{items.length} aligned
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
