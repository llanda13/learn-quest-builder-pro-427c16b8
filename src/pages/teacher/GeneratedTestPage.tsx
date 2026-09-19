import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, Printer, Download, Key, Pencil, Send, Lock } from "lucide-react";
import { GeneratedTests } from "@/services/db/generatedTests";
import { useToast } from "@/hooks/use-toast";
import { usePDFExport } from "@/hooks/usePDFExport";
import { Skeleton } from "@/components/ui/skeleton";
import { useTestAutoRepair } from "@/hooks/useTestAutoRepair";
import { useExamRenderModel, buildExamRenderModel } from "@/print/useExamRenderModel";
import { printExam } from "@/print/printExam";
import { exportExamPdf } from "@/print/exportExamPdf";
import { TOSReferencePanel } from "@/components/TOSReferencePanel";

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { SEMESTER_OPTIONS } from "@/constants/semesters";

interface TestItem {
  question_text?: string;
  question?: string;
  question_type?: string;
  type?: string;
  choices?: Record<string, string> | string[];
  options?: string[];
  correct_answer?: string | number;
  correctAnswer?: string | number;
  points?: number;
  difficulty?: string;
  bloom_level?: string;
  topic?: string;
  /** Original position inside test.items — used for editing. */
  __idx?: number;
}

interface GroupedQuestions {
  mcq: TestItem[];
  secondary: TestItem[];
  essay: TestItem[];
  secondaryType: 'true_false' | 'short_answer' | null;
}

function groupQuestionsByType(items: TestItem[]): GroupedQuestions {
  const mcq: TestItem[] = [];
  const trueFalse: TestItem[] = [];
  const shortAnswer: TestItem[] = [];
  const essay: TestItem[] = [];

  items.forEach((raw, originalIndex) => {
    const item = { ...raw, __idx: originalIndex };
    const type = (item.question_type || item.type || '').toLowerCase();
    if (type === 'mcq' || type === 'multiple-choice' || type === 'multiple_choice') {
      mcq.push(item);
    } else if (type === 'true_false' || type === 'true-false' || type === 'truefalse') {
      trueFalse.push(item);
    } else if (type === 'short_answer' || type === 'fill-blank' || type === 'fill_blank' || type === 'identification') {
      shortAnswer.push(item);
    } else if (type === 'essay') {
      essay.push(item);
    }
  });

  let secondaryType: 'true_false' | 'short_answer' | null = null;
  let secondary: TestItem[] = [];
  
  if (trueFalse.length > 0 && shortAnswer.length === 0) {
    secondaryType = 'true_false';
    secondary = trueFalse;
  } else if (shortAnswer.length > 0 && trueFalse.length === 0) {
    secondaryType = 'short_answer';
    secondary = shortAnswer;
  } else if (trueFalse.length > 0 && shortAnswer.length > 0) {
    if (trueFalse.length >= shortAnswer.length) {
      secondaryType = 'true_false';
      secondary = trueFalse;
    } else {
      secondaryType = 'short_answer';
      secondary = shortAnswer;
    }
  }

  return { mcq, secondary, essay, secondaryType };
}

const EDITABLE_STATUSES = ["draft", "revision_requested"];

interface QuestionDraft {
  index: number;
  question_text: string;
  question_type: string;
  choices: { key: string; text: string }[];
  correct_answer: string;
  points: string;
  difficulty: string;
  bloom_level: string;
  topic: string;
}

export default function GeneratedTestPage() {
  const { testId } = useParams<{ testId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const [test, setTest] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showAnswerKey, setShowAnswerKey] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ college: '', examType: '', subjectCode: '', subjectDescription: '', schoolYear: '', semester: '' });
  const [saving, setSaving] = useState(false);
  const [college, setCollege] = useState<string | null>(null);
  const [questionDraft, setQuestionDraft] = useState<QuestionDraft | null>(null);
  const [savingQuestion, setSavingQuestion] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { checkAndRepair, isRepairing } = useTestAutoRepair(testId);

  const renderModel = useExamRenderModel(test, { college, showAnswerKey });


  useEffect(() => {
    if (testId) {
      fetchTest();
    }
    fetchCollege();
  }, [testId]);

  const fetchCollege = async () => {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data } = await supabase.from('profiles').select('college').eq('id', user.id).single();
    setCollege(data?.college || null);
  };

  const fetchTest = async () => {
    try {
      setLoading(true);
      const data = await GeneratedTests.getById(testId!);
      // Show the test immediately so Print/Export are not blocked behind repair.
      setTest(data);
      setLoading(false);

      // Run auto-repair in the background; update state when done.
      if (data) {
        Promise.resolve(checkAndRepair(data))
          .then((repaired) => {
            if (repaired && repaired !== data) setTest(repaired);
          })
          .catch((err) => console.warn('Auto-repair failed:', err));
      }
    } catch (error) {
      console.error("Error fetching test:", error);
      toast({
        title: "Error",
        description: "Failed to load test",
        variant: "destructive",
      });
      setLoading(false);
    }
  };

  const handlePrint = async () => {
    if (!test) return;
    if (test.validation_status !== "validated") {
      toast({
        title: "Awaiting expert validation",
        description:
          "This questionnaire cannot be printed until an Evaluator approves it.",
        variant: "destructive",
      });
      return;
    }
    const t0 = performance.now();
    // Build a fresh model at click time so the current showAnswerKey flag is
    // guaranteed to flow through — Print and Export must stay in sync.
    const model = buildExamRenderModel(test, { college, showAnswerKey });
    console.info(`[print] showAnswerKey=${showAnswerKey} answerKeyItems=${model.answerKey.length}`);
    const result = await printExam(model);
    const elapsed = Math.round(performance.now() - t0);
    console.info(`[print] dialog opened in ${elapsed}ms`);
    if (!result.ok && result.error) {
      toast({ title: "Print failed", description: result.error, variant: "destructive" });
    }
  };

  const handleExport = async () => {
    if (!test) return;
    if (test.validation_status !== "validated") {
      toast({
        title: "Awaiting expert validation",
        description:
          "This questionnaire cannot be exported until an Evaluator approves it.",
        variant: "destructive",
      });
      return;
    }
    const t0 = performance.now();
    // Build a fresh model at click time using the exact same inputs as Print
    // so both outputs are identical when "Show Answer Key" is toggled.
    const model = buildExamRenderModel(test, { college, showAnswerKey });
    console.info(`[export-pdf] showAnswerKey=${showAnswerKey} answerKeyItems=${model.answerKey.length}`);
    const result = await exportExamPdf(model);
    const elapsed = Math.round(performance.now() - t0);
    console.info(`[export-pdf] generated in ${elapsed}ms`);
    if (result.ok) {
      toast({
        title: "Export Successful",
        description: `PDF generated in ${(elapsed / 1000).toFixed(2)}s${showAnswerKey ? " (with answer key)" : ""}`,
      });
    } else {
      toast({
        title: "Export Failed",
        description: result.error || "Failed to export test",
        variant: "destructive",
      });
    }
  };


  const handleBack = () => {
    navigate("/teacher/my-tests");
  };

  const openEditDialog = () => {
    setEditForm({
      college: college || '',
      examType: test?.exam_period || '',
      subjectCode: test?.course || '',
      subjectDescription: test?.subject || '',
      schoolYear: test?.school_year || '',
      semester: test?.semester || '',
    });
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    if (!test || !testId) return;
    setSaving(true);
    try {
      // Build new title from course + exam type
      const newTitle = `${editForm.subjectCode || test.course} - ${editForm.examType || test.exam_period}`;
      
      await GeneratedTests.update(testId, {
        course: editForm.subjectCode,
        subject: editForm.subjectDescription,
        exam_period: editForm.examType,
        school_year: editForm.schoolYear,
        semester: editForm.semester,
        title: newTitle,
      });

      // Update college in profile
      const { data: { user } } = await supabase.auth.getUser();
      if (user && editForm.college) {
        await supabase.from('profiles').update({ college: editForm.college }).eq('id', user.id);
        setCollege(editForm.college);
      }

      setTest((prev: any) => ({
        ...prev,
        course: editForm.subjectCode,
        subject: editForm.subjectDescription,
        exam_period: editForm.examType,
        school_year: editForm.schoolYear,
        semester: editForm.semester,
        title: newTitle,
      }));

      setEditOpen(false);
      toast({ title: "Updated", description: "Test information saved successfully." });
    } catch (error) {
      console.error("Error updating test:", error);
      toast({ title: "Error", description: "Failed to update test information.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const openQuestionEditor = (item: TestItem, index: number) => {
    const rawChoices = item.choices || item.options;
    let choices: { key: string; text: string }[] = [];
    if (rawChoices && !Array.isArray(rawChoices)) {
      choices = Object.keys(rawChoices)
        .sort()
        .map((key) => ({ key, text: String((rawChoices as Record<string, string>)[key] ?? '') }));
    } else if (Array.isArray(rawChoices)) {
      choices = rawChoices.map((text, i) => ({ key: String.fromCharCode(65 + i), text: String(text) }));
    }
    setQuestionDraft({
      index,
      question_text: item.question_text || item.question || '',
      question_type: (item.question_type || item.type || '').toLowerCase(),
      choices,
      correct_answer: String(item.correct_answer ?? item.correctAnswer ?? ''),
      points: String(item.points ?? 1),
      difficulty: item.difficulty || '',
      bloom_level: item.bloom_level || '',
      topic: item.topic || '',
    });
  };

  const handleSaveQuestion = async () => {
    if (!questionDraft || !testId) return;
    if (!questionDraft.question_text.trim()) {
      toast({ title: "Question text is required", variant: "destructive" });
      return;
    }
    setSavingQuestion(true);
    try {
      const allItems: TestItem[] = Array.isArray(test?.items) ? test.items : [];
      const original = allItems[questionDraft.index] || {};
      const patch: Record<string, any> = {
        question_text: questionDraft.question_text.trim(),
        correct_answer: questionDraft.correct_answer.trim(),
        points: Number(questionDraft.points) || 1,
        difficulty: questionDraft.difficulty || null,
        bloom_level: questionDraft.bloom_level || null,
        topic: questionDraft.topic || null,
      };
      if ('question' in original) patch.question = patch.question_text;
      if ('correctAnswer' in original) patch.correctAnswer = patch.correct_answer;
      if (questionDraft.choices.length > 0) {
        if (Array.isArray(original.choices) || Array.isArray(original.options)) {
          const arr = questionDraft.choices.map((c) => c.text);
          if (Array.isArray(original.options)) patch.options = arr;
          else patch.choices = arr;
        } else {
          patch.choices = Object.fromEntries(questionDraft.choices.map((c) => [c.key, c.text]));
        }
      }

      const updated = await GeneratedTests.updateItem(testId, questionDraft.index, patch);
      setTest(updated);
      setQuestionDraft(null);
      toast({ title: "Question updated", description: "The draft questionnaire has been saved." });
    } catch (error: any) {
      console.error("Error saving question:", error);
      toast({ title: "Save failed", description: error?.message ?? "Could not save the question.", variant: "destructive" });
    } finally {
      setSavingQuestion(false);
    }
  };

  const handleSubmitForValidation = async () => {
    if (!testId) return;
    setSubmitting(true);
    try {
      const updated = await GeneratedTests.submitForValidation(testId);
      setTest(updated);
      toast({
        title: "Submitted for Expert Validation",
        description: "The questionnaire is now locked and queued for an Evaluator.",
      });
    } catch (error: any) {
      console.error("Error submitting test:", error);
      toast({ title: "Submission failed", description: error?.message ?? "Could not submit questionnaire.", variant: "destructive" });
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="container mx-auto py-8 space-y-6">
        <Skeleton className="h-12 w-full" />
        <div className="text-center text-muted-foreground">Loading test...</div>
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }


  if (!test) {
    return (
      <div className="container mx-auto py-8">
        <Card>
          <CardContent className="pt-6">
            <p className="text-center text-muted-foreground">Test not found</p>
            <div className="flex justify-center mt-4">
              <Button onClick={handleBack}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to My Tests
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  const items: TestItem[] = Array.isArray(test.items) ? test.items : [];
  const totalPoints = items.reduce((sum, item) => sum + (item.points || 1), 0);
  const groupedQuestions = groupQuestionsByType(items);
  const isDraft = test.validation_status === "draft";
  const isEditable = EDITABLE_STATUSES.includes(test.validation_status);

  const mcqStart = 1;
  const secondaryStart = mcqStart + groupedQuestions.mcq.length;
  const essayStart = secondaryStart + groupedQuestions.secondary.length;

  const getSectionBTitle = () => {
    if (groupedQuestions.secondaryType === 'true_false') {
      return "Section B: True or False";
    }
    return "Section B: Fill in the Blank / Short Answer";
  };

  const getSectionBInstruction = () => {
    if (groupedQuestions.secondaryType === 'true_false') {
      return "Write TRUE if the statement is correct, FALSE if incorrect.";
    }
    return "Write the correct answer on the blank provided.";
  };

  return (
    <>
      {/* Screen UI */}
      <div className="flex flex-col h-screen screen-only">
        {/* Fixed top: banner, actions, TOS */}
        <div className="shrink-0 border-b bg-background">
          <div className="container mx-auto px-4 pt-6 pb-3 space-y-4">
            {isRepairing && (
              <div className="text-xs text-muted-foreground text-center">Refining test in background…</div>
            )}

            {/* Draft / editable review banner */}
            {isEditable && (
              <div className="rounded-md border border-primary/40 bg-primary/5 p-3 text-sm flex flex-wrap items-center justify-between gap-3">
                <div>
                  <strong>
                    {isDraft ? "Draft — editable review stage." : "Revision requested — this draft is editable again."}
                  </strong>{" "}
                  Review each question and use <em>Edit</em> to correct the text, choices, or correct
                  answer. Nothing is sent to an Evaluator until you submit.
                </div>
                <Button onClick={handleSubmitForValidation} disabled={submitting}>
                  <Send className="w-4 h-4 mr-2" />
                  {submitting ? "Submitting…" : "Submit for Expert Validation"}
                </Button>
              </div>
            )}

            {test.validation_status === "pending_validation" && (
              <div className="rounded-md border border-muted-foreground/30 bg-muted p-3 text-sm flex items-center gap-2">
                <Lock className="w-4 h-4 shrink-0" />
                <span>
                  <strong>Locked — under Expert Validation.</strong> This submitted version can no
                  longer be modified while an Evaluator reviews it.
                </span>
              </div>
            )}

            {/* Expert Validation status banner */}
            {test.validation_status !== "validated" && !isEditable && (
              <div
                className={
                  "rounded-md border p-3 text-sm " +
                  (test.validation_status === "revision_requested"
                    ? "border-destructive/50 bg-destructive/10 text-destructive"
                    : "border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-200")
                }
              >
                <strong>
                  {test.validation_status === "revision_requested"
                    ? "Revision requested by Evaluator."
                    : "Awaiting Expert Validation."}
                </strong>{" "}
                Printing and PDF export are locked until this questionnaire is approved by an Evaluator.
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center justify-between">
              <Button variant="outline" onClick={handleBack}>
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to My Tests
              </Button>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowAnswerKey(!showAnswerKey)}>
                  <Key className="w-4 h-4 mr-2" />
                  {showAnswerKey ? "Hide" : "Show"} Answer Key
                </Button>
                <Button
                  variant="outline"
                  onClick={handlePrint}
                  disabled={test.validation_status !== "validated"}
                  title={test.validation_status !== "validated" ? "Awaiting expert validation" : undefined}
                >
                  <Printer className="w-4 h-4 mr-2" />
                  Print
                </Button>
                <Button
                  onClick={handleExport}
                  disabled={test.validation_status !== "validated"}
                  title={test.validation_status !== "validated" ? "Awaiting expert validation" : undefined}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Export PDF
                </Button>
              </div>
            </div>

            {/* Fixed TOS reference — always visible while reviewing the questionnaire */}
            <TOSReferencePanel
              title={test.title}
              course={test.course}
              subject={test.subject}
              examPeriod={test.exam_period}
              schoolYear={test.school_year}
              semester={test.semester}
              totalItems={items.length}
              items={items as any}
              tosId={test.tos_id}
            />
          </div>
        </div>

        {/* Independently scrollable questionnaire area */}
        <div className="flex-1 overflow-y-auto">
          <div className="container mx-auto px-4 py-6 space-y-6">

      <Card className="print:shadow-none print:border-none" id="test-content">
        <CardHeader className="text-center border-b print:border-black">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex-1" />
              <h1 className="text-2xl font-bold flex-auto">{test.title || "Examination"}</h1>
              <div className="flex-1 flex justify-end">
                <Button variant="ghost" size="sm" onClick={openEditDialog} className="gap-1.5">
                  <Pencil className="w-4 h-4" />
                  Edit Info
                </Button>
              </div>
            </div>
            <div className="flex flex-wrap justify-center gap-2 text-sm">
              {test.course && <Badge variant="secondary">{test.course}</Badge>}
              {test.subject && <Badge variant="secondary">{test.subject}</Badge>}
              {test.exam_period && <Badge variant="secondary">{test.exam_period}</Badge>}
              {test.school_year && <Badge variant="secondary">SY {test.school_year}</Badge>}
              {test.semester && <Badge variant="secondary">{test.semester}</Badge>}
            </div>
            {college && (
              <p className="text-sm text-muted-foreground">College: {college}</p>
            )}
            
            {/* Student Info Section */}
            <div className="mt-4 pt-4 border-t text-left grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <span className="font-medium">Name:</span>
                <span className="flex-1 border-b border-dashed border-muted-foreground"></span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium">Date:</span>
                <span className="flex-1 border-b border-dashed border-muted-foreground"></span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium">Section:</span>
                <span className="flex-1 border-b border-dashed border-muted-foreground"></span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-medium">Score:</span>
                <span className="flex-1 border-b border-dashed border-muted-foreground"></span>
                <span>/ {totalPoints}</span>
              </div>
            </div>
            
            <div className="text-sm text-muted-foreground flex justify-between items-center pt-2">
              <span>Total Points: {totalPoints}</span>
              {test.time_limit && <span>Time Limit: {test.time_limit} minutes</span>}
              <span>Questions: {items.length}</span>
            </div>
          </div>
        </CardHeader>

      {/* Edit Information Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Edit Test Information</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="edit-college">College</Label>
              <Input
                id="edit-college"
                value={editForm.college}
                onChange={(e) => setEditForm(f => ({ ...f, college: e.target.value }))}
                placeholder="e.g. College of Information Technology"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-exam-type">Exam Type</Label>
              <Select value={editForm.examType} onValueChange={(v) => setEditForm(f => ({ ...f, examType: v }))}>
                <SelectTrigger id="edit-exam-type">
                  <SelectValue placeholder="Select exam type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Midterm Examination">Midterm Examination</SelectItem>
                  <SelectItem value="Final Examination">Final Examination</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-subject-code">Subject Code</Label>
              <Input
                id="edit-subject-code"
                value={editForm.subjectCode}
                onChange={(e) => setEditForm(f => ({ ...f, subjectCode: e.target.value }))}
                placeholder="e.g. IT101"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-subject-desc">Subject Description</Label>
              <Input
                id="edit-subject-desc"
                value={editForm.subjectDescription}
                onChange={(e) => setEditForm(f => ({ ...f, subjectDescription: e.target.value }))}
                placeholder="e.g. Introduction to Computing"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-school-year">Academic Year / School Year</Label>
              <Input
                id="edit-school-year"
                value={editForm.schoolYear}
                onChange={(e) => setEditForm(f => ({ ...f, schoolYear: e.target.value }))}
                placeholder="e.g. 2024-2025"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-semester">Semester</Label>
              <Select value={editForm.semester} onValueChange={(v) => setEditForm(f => ({ ...f, semester: v }))}>
                <SelectTrigger id="edit-semester">
                  <SelectValue placeholder="Select semester" />
                </SelectTrigger>
                <SelectContent>
                  {SEMESTER_OPTIONS.map(s => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="text-sm text-muted-foreground">
              <span className="font-medium">Date Generated:</span> {new Date(test.created_at).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
            </div>
            <div className="text-sm text-muted-foreground">
              <span className="font-medium">Total Points:</span> {totalPoints} (auto-calculated)
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveEdit} disabled={saving}>
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

        <CardContent className="pt-6 space-y-6">
          {/* Instructions */}
          {test.instructions && (
            <div className="bg-muted p-4 rounded-lg print:bg-gray-100">
              <h3 className="font-semibold mb-2">Instructions:</h3>
              <p className="text-sm">{test.instructions}</p>
            </div>
          )}

          <Separator />

          {/* Questions - 3 Sections */}
          <div className="space-y-8">
            {groupedQuestions.mcq.length > 0 && (
              <QuestionSection
                title="Section A: Multiple Choice Questions"
                instruction="Choose the best answer from the options provided. Write the letter of your answer on the space provided."
                items={groupedQuestions.mcq}
                startNumber={mcqStart}
                showAnswer={showAnswerKey}
                editable={isEditable}
                onEdit={openQuestionEditor}
              />
            )}
            
            {groupedQuestions.secondary.length > 0 && (
              <QuestionSection
                title={getSectionBTitle()}
                instruction={getSectionBInstruction()}
                items={groupedQuestions.secondary}
                startNumber={secondaryStart}
                showAnswer={showAnswerKey}
                editable={isEditable}
                onEdit={openQuestionEditor}
              />
            )}
            
          {groupedQuestions.essay.length > 0 && (
              <QuestionSection
                title="Section C: Essay Questions"
                instruction="Answer the following questions in complete sentences. Provide clear and concise explanations."
                items={groupedQuestions.essay}
                startNumber={essayStart}
                showAnswer={showAnswerKey}
                isEssaySection
                totalTestItems={items.length}
                editable={isEditable}
                onEdit={openQuestionEditor}
              />
            )}
          </div>
        </CardContent>
      </Card>

      {/* Answer Key Section */}
      {showAnswerKey && (
        <Card className="print:shadow-none print:border-none print:break-before-page">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Key className="w-5 h-5" />
              Answer Key
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {groupedQuestions.mcq.length > 0 && (
                <AnswerKeySection title="Multiple Choice" items={groupedQuestions.mcq} startNumber={mcqStart} />
              )}
              {groupedQuestions.secondary.length > 0 && (
                <AnswerKeySection 
                  title={groupedQuestions.secondaryType === 'true_false' ? 'True/False' : 'Short Answer'} 
                  items={groupedQuestions.secondary} 
                  startNumber={secondaryStart} 
                />
              )}
            {groupedQuestions.essay.length > 0 && (
                <AnswerKeySection title="Essay" items={groupedQuestions.essay} startNumber={essayStart} isEssaySection totalTestItems={items.length} />
              )}
            </div>
          </CardContent>
        </Card>
      )}
          </div>
        </div>

        {/* Per-question editor (draft stage only) */}
        <Dialog open={!!questionDraft} onOpenChange={(open) => !open && setQuestionDraft(null)}>
          <DialogContent className="sm:max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Question {questionDraft ? questionDraft.index + 1 : ""}</DialogTitle>
            </DialogHeader>
            {questionDraft && (
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="q-text">Question</Label>
                  <Textarea
                    id="q-text"
                    rows={4}
                    value={questionDraft.question_text}
                    onChange={(e) => setQuestionDraft({ ...questionDraft, question_text: e.target.value })}
                  />
                </div>

                {questionDraft.choices.length > 0 && (
                  <div className="space-y-2">
                    <Label>Answer Choices</Label>
                    {questionDraft.choices.map((choice, i) => (
                      <div key={choice.key} className="flex items-center gap-2">
                        <span className="w-6 text-sm font-medium">{choice.key}.</span>
                        <Input
                          value={choice.text}
                          onChange={(e) => {
                            const next = [...questionDraft.choices];
                            next[i] = { ...next[i], text: e.target.value };
                            setQuestionDraft({ ...questionDraft, choices: next });
                          }}
                        />
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-2">
                  <Label htmlFor="q-answer">Correct Answer</Label>
                  {questionDraft.choices.length > 0 ? (
                    <Select
                      value={questionDraft.correct_answer}
                      onValueChange={(v) => setQuestionDraft({ ...questionDraft, correct_answer: v })}
                    >
                      <SelectTrigger id="q-answer">
                        <SelectValue placeholder="Select the correct option" />
                      </SelectTrigger>
                      <SelectContent>
                        {questionDraft.choices.map((c) => (
                          <SelectItem key={c.key} value={c.key}>
                            {c.key}. {c.text}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : questionDraft.question_type.includes("true") ? (
                    <Select
                      value={questionDraft.correct_answer}
                      onValueChange={(v) => setQuestionDraft({ ...questionDraft, correct_answer: v })}
                    >
                      <SelectTrigger id="q-answer">
                        <SelectValue placeholder="Select TRUE or FALSE" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="True">True</SelectItem>
                        <SelectItem value="False">False</SelectItem>
                      </SelectContent>
                    </Select>
                  ) : (
                    <Textarea
                      id="q-answer"
                      rows={3}
                      value={questionDraft.correct_answer}
                      onChange={(e) => setQuestionDraft({ ...questionDraft, correct_answer: e.target.value })}
                    />
                  )}
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="q-topic">Topic</Label>
                    <Input
                      id="q-topic"
                      value={questionDraft.topic}
                      onChange={(e) => setQuestionDraft({ ...questionDraft, topic: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="q-points">Points</Label>
                    <Input
                      id="q-points"
                      type="number"
                      min={1}
                      value={questionDraft.points}
                      onChange={(e) => setQuestionDraft({ ...questionDraft, points: e.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="q-bloom">Bloom's Level</Label>
                    <Select
                      value={questionDraft.bloom_level}
                      onValueChange={(v) => setQuestionDraft({ ...questionDraft, bloom_level: v })}
                    >
                      <SelectTrigger id="q-bloom">
                        <SelectValue placeholder="Select level" />
                      </SelectTrigger>
                      <SelectContent>
                        {["Remembering", "Understanding", "Applying", "Analyzing", "Evaluating", "Creating"].map((b) => (
                          <SelectItem key={b} value={b}>{b}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="q-difficulty">Difficulty</Label>
                    <Select
                      value={questionDraft.difficulty}
                      onValueChange={(v) => setQuestionDraft({ ...questionDraft, difficulty: v })}
                    >
                      <SelectTrigger id="q-difficulty">
                        <SelectValue placeholder="Select difficulty" />
                      </SelectTrigger>
                      <SelectContent>
                        {["Easy", "Average", "Difficult"].map((d) => (
                          <SelectItem key={d} value={d}>{d}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setQuestionDraft(null)}>Cancel</Button>
              <Button onClick={handleSaveQuestion} disabled={savingQuestion}>
                {savingQuestion ? "Saving…" : "Save Question"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </>

  );
}

function getEssayDisplayNumber(
  essayIndex: number, 
  essayItems: TestItem[], 
  sectionStartNumber: number,
  _totalTestItems: number
): string {
  // Use each essay's points to determine how many item slots it consumes
  let rangeStart = sectionStartNumber;
  for (let i = 0; i < essayIndex; i++) {
    rangeStart += (essayItems[i].points || 1);
  }
  const currentPoints = essayItems[essayIndex].points || 1;
  
  if (currentPoints > 1) {
    const rangeEnd = rangeStart + currentPoints - 1;
    return `${rangeStart}–${rangeEnd}`;
  }
  
  return `${rangeStart}`;
}

function QuestionSection({ 
  title, 
  instruction, 
  items, 
  startNumber, 
  showAnswer,
  isEssaySection = false,
  totalTestItems = 0,
  editable = false,
  onEdit,
}: { 
  title: string; 
  instruction: string; 
  items: TestItem[]; 
  startNumber: number; 
  showAnswer: boolean;
  isEssaySection?: boolean;
  totalTestItems?: number;
  editable?: boolean;
  onEdit?: (item: TestItem, index: number) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="border-b pb-2">
        <h2 className="text-lg font-bold">{title}</h2>
        <p className="text-sm text-muted-foreground italic">{instruction}</p>
      </div>
      <div className="space-y-4">
        {items.map((item, index) => {
          const displayNumber = isEssaySection 
            ? getEssayDisplayNumber(index, items, startNumber, totalTestItems)
            : `${startNumber + index}`;
          return (
            <QuestionItem
              key={index}
              item={item}
              displayNumber={displayNumber}
              number={startNumber + index}
              showAnswer={showAnswer}
              editable={editable}
              onEdit={onEdit}
            />
          );
        })}
      </div>
    </div>
  );
}

function AnswerKeySection({ title, items, startNumber, isEssaySection = false, totalTestItems = 0 }: { title: string; items: TestItem[]; startNumber: number; isEssaySection?: boolean; totalTestItems?: number }) {
  if (isEssaySection) {
    return (
      <div>
        <h3 className="font-semibold mb-2">{title}</h3>
        <div className="space-y-4">
          {items.map((item, index) => {
            const displayNum = getEssayDisplayNumber(index, items, startNumber, totalTestItems);
            const answer = formatAnswer(item);
            return (
              <div key={index} className="p-3 bg-muted rounded">
                <div className="font-semibold mb-1">{displayNum}.</div>
                <div className="text-sm text-primary whitespace-pre-wrap leading-relaxed ml-4">
                  {answer}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  return (
    <div>
      <h3 className="font-semibold mb-2">{title}</h3>
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-2">
        {items.map((item, index) => {
          const displayNum = `${startNumber + index}`;
          return (
            <div key={index} className="flex items-center gap-2 p-2 bg-muted rounded text-sm">
              <span className="font-semibold">{displayNum}.</span>
              <span className="text-primary font-medium">
                {formatAnswer(item)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatAnswer(item: TestItem): string {
  const answer = item.correct_answer ?? item.correctAnswer;
  if (answer === undefined || answer === null) return '—';
  return String(answer);
}

function QuestionItem({ item, number, displayNumber, showAnswer, editable = false, onEdit }: { item: TestItem; number: number; displayNumber?: string; showAnswer: boolean; editable?: boolean; onEdit?: (item: TestItem, index: number) => void }) {
  const getDifficultyColor = (difficulty?: string) => {
    switch (difficulty?.toLowerCase()) {
      case "easy":
        return "bg-green-100 text-green-800";
      case "average":
        return "bg-yellow-100 text-yellow-800";
      case "difficult":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const questionText = item.question_text || item.question || '';
  const questionType = (item.question_type || item.type || '').toLowerCase();
  const correctAnswer = item.correct_answer ?? item.correctAnswer;
  
  const getMCQOptions = (): { key: string; text: string }[] => {
    const choices = item.choices || item.options;
    if (!choices) return [];
    
    if (typeof choices === 'object' && !Array.isArray(choices)) {
      return ['A', 'B', 'C', 'D']
        .filter(key => choices[key])
        .map(key => ({ key, text: choices[key] as string }));
    }
    
    if (Array.isArray(choices)) {
      return choices.map((text, idx) => ({
        key: String.fromCharCode(65 + idx),
        text: String(text)
      }));
    }
    
    return [];
  };

  const mcqOptions = getMCQOptions();

  return (
    <div className="border rounded-lg p-4 space-y-3 print:break-inside-avoid">
      {/* Question Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 flex-1">
          <span className="font-bold text-lg min-w-[30px]">{displayNumber || number}.</span>
          <div className="flex-1">
            <p className="text-sm leading-relaxed">{questionText}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          {item.difficulty && (
            <Badge className={`text-xs ${getDifficultyColor(item.difficulty)}`}>
              {item.difficulty}
            </Badge>
          )}
          {item.points && (
            <Badge variant="outline" className="text-xs">
              {item.points} {item.points === 1 ? "pt" : "pts"}
            </Badge>
          )}
          {editable && onEdit && typeof item.__idx === "number" && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() => onEdit(item, item.__idx as number)}
            >
              <Pencil className="w-3.5 h-3.5" />
              Edit
            </Button>
          )}
        </div>
      </div>

      {/* Question Content based on type */}
      <div className="ml-8">
        {/* MCQ with A, B, C, D options */}
        {(questionType === "mcq" || questionType === "multiple-choice" || questionType === "multiple_choice") && mcqOptions.length > 0 && (
          <div className="space-y-2">
            {mcqOptions.map((option) => {
              const isCorrect = 
                correctAnswer === option.key || 
                correctAnswer === option.key.toLowerCase();
              return (
                <div
                  key={option.key}
                  className={`flex items-start gap-2 p-2 rounded ${
                    showAnswer && isCorrect
                      ? "bg-green-50 border border-green-300"
                      : "hover:bg-muted/50"
                  }`}
                >
                  <span className="font-medium min-w-[24px]">
                    {option.key}.
                  </span>
                  <span className="text-sm">{option.text}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* True/False */}
        {(questionType === "true_false" || questionType === "true-false" || questionType === "truefalse") && (
          <div className="flex gap-4 mt-2">
            <div className={`px-4 py-2 border rounded ${
              showAnswer && String(correctAnswer).toLowerCase() === 'true' 
                ? "bg-green-50 border-green-300" 
                : ""
            }`}>
              TRUE
            </div>
            <div className={`px-4 py-2 border rounded ${
              showAnswer && String(correctAnswer).toLowerCase() === 'false' 
                ? "bg-green-50 border-green-300" 
                : ""
            }`}>
              FALSE
            </div>
          </div>
        )}

        {/* Short Answer / Fill in blank */}
        {(questionType === "short_answer" || questionType === "fill-blank" || questionType === "fill_blank" || questionType === "identification") && (
          <div className="mt-2">
            <div className="border-b-2 border-dashed w-48 h-8"></div>
            {showAnswer && correctAnswer && (
              <div className="mt-2 text-green-600 text-sm">
                Answer: {String(correctAnswer)}
              </div>
            )}
          </div>
        )}

        {/* Essay */}
        {questionType === "essay" && (
          <div className="mt-2 space-y-2">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="border-b border-dashed h-6"></div>
            ))}
            {showAnswer && correctAnswer && (
              <div className="mt-2 text-green-600 text-sm bg-green-50 p-2 rounded">
                Sample Answer: {String(correctAnswer)}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
