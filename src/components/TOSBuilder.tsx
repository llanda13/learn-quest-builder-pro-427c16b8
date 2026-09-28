import { useState, useEffect, useRef } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, Calculator, Brain, Target, AlertTriangle, Upload, RotateCcw } from "lucide-react";
import { TOSUploadParser } from "./tos/TOSUploadParser";
import { resolveOfficers } from "@/services/db/departmentOfficers";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

// Subject categories are resolved from the central subject database
// (academic_subjects.subject_type), never from hardcoded code prefixes.
// - major : belongs to a single program -> Course auto-filled (e.g., BSIT)
// - minor / ge / pe / nstp : shared programs -> Course auto-filled "BSIT & BSIS"
// The Course field stays editable so users can override the default.
const SHARED_COURSE_LABEL = 'BSIT & BSIS';


const SUBJECT_TYPE_LABELS: Record<string, string> = {
  major: 'Major',
  minor: 'Minor (shared)',
  ge: 'General Education',
  pe: 'PE',
  nstp: 'NSTP',
};

// Map a specialization name (e.g., "IT", "IS", "BSIT") to a program code.
const toProgramCode = (s?: string): string | undefined => {
  const trimmed = (s ?? '').trim();
  if (!trimmed) return undefined;
  return /^BS/i.test(trimmed) ? trimmed.toUpperCase() : `BS${trimmed.toUpperCase()}`;
};
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Progress } from "@/components/ui/progress";
import { toast } from "sonner";
import { SEMESTER_OPTIONS } from "@/constants/semesters";
import { TOSMatrix } from "./TOSMatrix";
import { TOS } from "@/services/db/tos";
import { Analytics } from "@/services/db/analytics";
import { EdgeFunctions } from "@/services/edgeFunctions";
import { useRealtime } from "@/hooks/useRealtime";
import { usePresence } from "@/hooks/usePresence";
import { buildTestConfigFromTOS } from "@/utils/testVersions";
import { SufficiencyAnalysisPanel } from "@/components/analysis/SufficiencyAnalysisPanel";
import { TOSCriteria } from "@/services/ai/testGenerationService";
import { generateFormatAwareTest } from "@/services/ai/formatAwareTestGeneration";
import { analyzeTOSSufficiency } from "@/services/analysis/sufficiencyAnalysis";
import { useNavigate, useLocation } from "react-router-dom";
import { 
  calculateCanonicalTOSMatrix, 
  validateTOSMatrix, 
  CanonicalTOSMatrix,
  BloomLevel,
  BLOOM_DISTRIBUTION,
  getDifficultyForBloom
} from "@/utils/tosCalculator";
import { ExamFormatSelector, SelectedFormatSummary } from "@/components/generation/ExamFormatSelector";
import { EXAM_FORMATS, getDefaultFormat, getExamFormat } from "@/types/examFormats";
import { clearPersistedState } from "@/hooks/usePersistentState";
import { supabase } from "@/integrations/supabase/client";
import { AcademicHierarchy } from "@/services/db/academicHierarchy";
import { useAuth } from "@/lib/auth";

// localStorage key for the in-progress TOS draft. Bumped versions invalidate
// older shapes so we never crash on a stale payload.
const TOS_DRAFT_KEY = "lovable.persist.v1.tos-builder-draft";

const topicSchema = z.object({
  topic: z.string(),
  hours: z.union([z.number(), z.literal("")])
});

const tosSchema = z.object({
  subject_no: z.string().min(1, "Subject number is required"),
  course: z.string().min(1, "Course is required"),
  description: z.string().min(1, "Subject description is required"),
  year_section: z.string().min(1, "Year & section is required"),
  exam_period: z.string().min(1, "Exam period is required"),
  school_year: z.string().min(1, "School year is required"),
  semester: z.string().min(1, "Semester is required"),
  total_items: z.number().min(10, "Minimum 10 items required").max(100, "Maximum 100 items allowed"),
  prepared_by: z.string().optional(),
  checked_by: z.string().optional(),
  noted_by: z.string().optional(),
  topics: z.array(topicSchema).min(1, "At least one topic is required")
});

type TOSFormData = z.infer<typeof tosSchema>;

interface TOSBuilderProps {
  onBack: () => void;
}

export const TOSBuilder = ({ onBack }: TOSBuilderProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const templateApplied = useRef(false);
  const autoFilledRef = useRef(false);
  const { user } = useAuth();
  const [subjectTypeLabel, setSubjectTypeLabel] = useState<string | null>(null);
  const [subjectLookupStatus, setSubjectLookupStatus] = useState<'idle' | 'looking' | 'found' | 'missing' | 'error'>('idle');
  const [isMinorSubject, setIsMinorSubject] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  
  // Hydrate topics from any saved draft so refresh / tab switch doesn't wipe input.
  const [topics, setTopics] = useState<{ topic: string; hours: number | "" }[]>(() => {
    if (typeof window === "undefined") return [{ topic: "", hours: "" }];
    try {
      const raw = window.localStorage.getItem(TOS_DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed?.topics) && parsed.topics.length > 0) {
          return parsed.topics.map((t: any) => ({
            topic: typeof t?.topic === "string" ? t.topic : "",
            hours: typeof t?.hours === "number" && t.hours > 0 ? t.hours : ""
          }));
        }
      }
    } catch { /* ignore */ }
    return [{ topic: "", hours: "" }];
  });
  const [tosMatrix, setTosMatrix] = useState<CanonicalTOSMatrix | null>(null);
  const [autoGeneratePending, setAutoGeneratePending] = useState(false);
  const [showMatrix, setShowMatrix] = useState(false);
  const [sufficiencyAnalysis, setSufficiencyAnalysis] = useState<any>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isGeneratingTest, setIsGeneratingTest] = useState(false);
  const [generationProgress, setGenerationProgress] = useState(0);
  const [generationStatus, setGenerationStatus] = useState("");
  const [collaborators, setCollaborators] = useState<any[]>([]);
  const [selectedFormatId, setSelectedFormatId] = useState(getDefaultFormat().id);
  const [missingFields, setMissingFields] = useState<{ label: string; elementId: string }[]>([]);
  const [showIncompleteDialog, setShowIncompleteDialog] = useState(false);
  const [showConfirmGenerate, setShowConfirmGenerate] = useState(false);


  // Real-time collaboration setup
  const { users: presenceUsers, isConnected } = usePresence('tos-builder', {
    name: 'Current User',
    email: 'user@example.com'
  });

  // Real-time updates for TOS changes
  useRealtime('tos-collaboration', {
    table: 'tos',
    onChange: (payload) => {
      if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE') {
        toast.info('TOS updated by collaborator');
      }
    }
  });

  // Hydrate full form defaults from the persisted draft if present.
  const persistedDefaults = (() => {
    if (typeof window === "undefined") return null;
    try {
      const raw = window.localStorage.getItem(TOS_DRAFT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  })();

  const form = useForm<TOSFormData>({
    resolver: zodResolver(tosSchema),
    defaultValues: {
      subject_no: persistedDefaults?.subject_no ?? "",
      course: persistedDefaults?.course ?? "",
      description: persistedDefaults?.description ?? "",
      year_section: persistedDefaults?.year_section ?? "",
      exam_period: persistedDefaults?.exam_period ?? "",
      school_year: persistedDefaults?.school_year ?? "",
      semester: persistedDefaults?.semester ?? "",
      total_items: persistedDefaults?.total_items ?? 50,
      prepared_by: persistedDefaults?.prepared_by ?? "",
      checked_by: persistedDefaults?.checked_by ?? "",
      noted_by: persistedDefaults?.noted_by ?? "",
      topics: topics,
    },
  });

  const { register, handleSubmit, formState: { errors }, setValue, watch, reset } = form;

  // ─── Autosave the entire TOS draft (debounced) ───
  // Persists every change to localStorage so accidental tab switches, refreshes,
  // or background interruptions never cost the teacher their work.
  useEffect(() => {
    const sub = watch((values) => {
      try {
        const saveTimer = setTimeout(() => {
          window.localStorage.setItem(TOS_DRAFT_KEY, JSON.stringify(values));
        }, 400);
        return () => clearTimeout(saveTimer);
      } catch { /* ignore */ }
    });
    return () => sub.unsubscribe();
  }, [watch]);

  // Apply template data when navigated with state
  useEffect(() => {
    const state = location.state as { templateData?: any; isReusing?: boolean } | null;
    
    if (state?.templateData && state?.isReusing && !templateApplied.current) {
      templateApplied.current = true;
      const template = state.templateData;
      
      console.log("📋 Loading TOS template:", template);
      
      // Parse topics from template
      let parsedTopics: { topic: string; hours: number | "" }[] = [{ topic: "", hours: "" }];
      
      if (template.topics) {
        if (Array.isArray(template.topics)) {
          // Topics is an array format
          parsedTopics = template.topics.map((t: any) => ({
            topic: t.topic || t.name || "",
            hours: typeof t.hours === "number" && t.hours > 0 ? t.hours : ""
          }));
        } else if (typeof template.topics === 'object') {
          // Topics might be an object with topic names as keys
          parsedTopics = Object.entries(template.topics).map(([name, data]: [string, any]) => ({
            topic: name,
            hours: typeof data === 'object' && typeof data.hours === "number" && data.hours > 0
              ? data.hours
              : ""
          }));
        }
      } else if (template.distribution && typeof template.distribution === 'object') {
        // Try to extract topics from distribution if topics array is missing
        parsedTopics = Object.keys(template.distribution).map(topicName => ({
          topic: topicName,
          hours: typeof template.distribution[topicName]?.hours === "number" && template.distribution[topicName]?.hours > 0
            ? template.distribution[topicName]?.hours
            : ""
        }));
      }
      
      // Ensure at least one topic
      if (parsedTopics.length === 0) {
        parsedTopics = [{ topic: "", hours: "" }];
      }
      
      // Update topics state
      setTopics(parsedTopics);
      
      // Apply all form values
      reset({
        subject_no: template.subject_no || "",
        course: template.course || "",
        description: template.description || "",
        year_section: template.year_section || "",
        exam_period: template.exam_period || "",
        school_year: template.school_year || "",
        semester: template.semester || "",
        total_items: template.total_items || 50,
        prepared_by: template.prepared_by || "",
        checked_by: template.checked_by || "",
        noted_by: template.noted_by || "",
        topics: parsedTopics
      });
      
      console.log("✅ Template applied successfully:", {
        subject_no: template.subject_no,
        course: template.course,
        totalItems: template.total_items,
        topicsCount: parsedTopics.length
      });
      
      toast.success("Template Loaded", {
        description: `Loaded "${template.subject_no || template.course}" template with ${parsedTopics.length} topic(s). Update the details for your new exam.`,
      });
    }
  }, [location.state, reset]);

  // Auto-generate matrix after file upload populates form
  useEffect(() => {
    if (autoGeneratePending) {
      setAutoGeneratePending(false);
      // Trigger form submission programmatically
      handleSubmit(onSubmit)();
    }
  }, [autoGeneratePending]);

  // ─── Auto-populate institutional fields from profile + system settings ───
  // Runs once when the user is available. Only fills empty fields so we never
  // overwrite a value already provided by a template, persisted draft, or
  // manual edit. Centralized records keep these values consistent across TOS.
  useEffect(() => {
    if (!user?.id || autoFilledRef.current) return;
    autoFilledRef.current = true;

    (async () => {
      try {
        const [profileRes, settingsRes] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
          supabase.from('system_settings').select('key, value').in('key', ['active_school_year']),
        ]);

        const fullName = (profileRes.data as any)?.full_name as string | undefined;
        const settingMap = new Map<string, any>((settingsRes.data ?? []).map((r: any) => [r.key, r.value]));
        const activeSY = settingMap.get('active_school_year');
        const res = await resolveOfficers((profileRes.data as any)?.college, (profileRes.data as any)?.course);

        const apply = (field: keyof TOSFormData, value: string | undefined) => {
          if (!value) return;
          const current = (form.getValues(field) as string | undefined) ?? '';
          if (!current.trim()) {
            setValue(field, value as any, { shouldDirty: false });
          }
        };

        apply('prepared_by', fullName);
        apply('school_year', typeof activeSY === 'string' ? activeSY : undefined);
        if (res.ok) {
          apply('checked_by', res.chairperson);
          apply('noted_by', res.dean);
        } else {
          toast.warning(res.message, { duration: 8000 });
        }
      } catch (err) {
        console.warn('TOS auto-fill from profile/settings failed:', err);
      }
    })();
  }, [user?.id, setValue, form]);

  // ─── Subject lookup: when the user enters/changes Subject No, fetch the
  // matching subject record from the centralized Subjects database and
  // auto-fill Subject Description + Course. Case-insensitive code match.
  const lookupSubject = async (rawCode: string) => {
    const code = rawCode.trim();
    if (!code) {
      setSubjectLookupStatus('idle');
      setIsMinorSubject(false);
      setSubjectTypeLabel(null);
      return;
    }
    setSubjectLookupStatus('looking');
    try {
      const subject = await AcademicHierarchy.lookupSubjectByCode(code);

      if (!subject) {
        // Query succeeded, but no record exists in the central subject database.
        setSubjectLookupStatus('missing');
        setIsMinorSubject(false);
        setSubjectTypeLabel(null);
        return;
      }

      const subjectType = (subject.subject_type ?? 'major').toLowerCase();
      setIsMinorSubject(false);
      setSubjectTypeLabel(SUBJECT_TYPE_LABELS[subjectType] ?? 'Major');

      // Subject Description always comes from the central database.
      if (subject.description) {
        setValue('description', subject.description, { shouldDirty: true, shouldValidate: true });
      }

      // Resolve the course(s) the subject belongs to, from stored metadata first.
      const stored = (subject.course_codes ?? [])
        .map((c) => String(c).trim().toUpperCase())
        .filter(Boolean);
      const fromSpecialization = toProgramCode(subject.specialization_name);
      const courses = stored.length > 0 ? stored : (fromSpecialization ? [fromSpecialization] : []);

      // Course is auto-filled for EVERY subject type (still editable in the UI).
      // Major -> the single owning program. Minor / GE / NSTP / PE -> shared label.
      const courseValue = subjectType === 'major'
        ? (courses[0] ?? SHARED_COURSE_LABEL)
        : (courses.length > 1 ? courses.join(' & ') : SHARED_COURSE_LABEL);
      setValue('course', courseValue, { shouldDirty: true, shouldValidate: true });


      setSubjectLookupStatus('found');
    } catch (err) {
      console.warn('Subject lookup failed:', err);
      // A failed query is NOT a "subject not found" result.
      setSubjectLookupStatus('error');
      setSubjectTypeLabel(null);
    }
  };

  const watchedTotalItems = watch("total_items");
  const watchedSubjectNo = watch("subject_no");

  // Re-run the central lookup whenever Subject No changes from any source
  // (persisted draft, template reuse, uploaded TOS) so category/description
  // always reflect the database record.
  useEffect(() => {
    const code = typeof watchedSubjectNo === 'string' ? watchedSubjectNo.trim() : '';
    if (!code) {
      setSubjectLookupStatus('idle');
      setIsMinorSubject(false);
      setSubjectTypeLabel(null);
      return;
    }
    const t = setTimeout(() => { void lookupSubject(code); }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [watchedSubjectNo]);

  // ─── Clear / New TOS ─────────────────────────────────────────────────────
  // Wipes the entire builder back to a fresh state without a page refresh.
  // Re-applies the user's institutional defaults so the form is immediately ready.
  const handleClearForm = async () => {
    const blankTopics = [{ topic: "", hours: "" as number | "" }];

    // Reset every validation / error / dialog state so the form looks untouched.
    setTopicErrors({});
    setMissingFields([]);
    setShowIncompleteDialog(false);
    setShowConfirmGenerate(false);
    setShowClearConfirm(false);
    setAutoGeneratePending(false);
    setIsGeneratingTest(false);
    setGenerationProgress(0);
    setGenerationStatus("");
    setCollaborators([]);

    // Reset TOS data state.
    setTopics(blankTopics);
    setTosMatrix(null);
    setShowMatrix(false);
    setSufficiencyAnalysis(null);
    setSubjectLookupStatus('idle');
    setIsMinorSubject(false);
    setSubjectTypeLabel(null);
    setSelectedFormatId(getDefaultFormat().id);
    templateApplied.current = false;

    // Reset React Hook Form to pristine defaults, clearing errors, dirty, touched, submitted flags.
    reset({
      subject_no: "",
      course: "",
      description: "",
      year_section: "",
      exam_period: "",
      school_year: "",
      semester: "",
      total_items: 50,
      prepared_by: "",
      checked_by: "",
      noted_by: "",
      topics: blankTopics,
    }, {
      keepDirty: false,
      keepErrors: false,
      keepIsSubmitted: false,
      keepTouched: false,
      keepValues: false,
    });
    try {
      window.localStorage.removeItem(TOS_DRAFT_KEY);
    } catch { /* ignore */ }

    if (user?.id) {
      try {
        const [profileRes, settingsRes] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
          supabase.from('system_settings').select('key, value').in('key', ['active_school_year']),
        ]);
        const fullName = (profileRes.data as any)?.full_name as string | undefined;
        const settingMap = new Map<string, any>((settingsRes.data ?? []).map((r: any) => [r.key, r.value]));
        const activeSY = settingMap.get('active_school_year');
        const res = await resolveOfficers((profileRes.data as any)?.college, (profileRes.data as any)?.course);
        if (fullName) setValue('prepared_by', fullName);
        if (typeof activeSY === 'string') setValue('school_year', activeSY);
        if (res.ok) {
          setValue('checked_by', res.chairperson);
          setValue('noted_by', res.dean);
        } else {
          setValue('checked_by', '');
          setValue('noted_by', '');
          toast.warning(res.message, { duration: 8000 });
        }
      } catch { /* non-fatal */ }
    }
    toast.success('Form cleared. Ready for a new TOS.');
  };





  // Per-row inline validation errors for topics / hours
  const [topicErrors, setTopicErrors] = useState<Record<number, { topic?: string; hours?: string }>>({});

  const addTopic = () => {
    const newTopics = [...topics, { topic: "", hours: "" as number | "" }];
    setTopics(newTopics);
    setValue("topics", newTopics);
  };

  const removeTopic = (index: number) => {
    if (topics.length > 1) {
      const newTopics = topics.filter((_, i) => i !== index);
      setTopics(newTopics);
      setValue("topics", newTopics);
    }
  };

  const updateTopic = (index: number, field: "topic" | "hours", value: string | number) => {
    const newTopics = [...topics];
    newTopics[index] = { ...newTopics[index], [field]: value };
    setTopics(newTopics);
    setValue("topics", newTopics);
    // Clear the inline error for the edited cell as soon as the user types.
    setTopicErrors((prev) => {
      if (!prev[index]?.[field === "topic" ? "topic" : "hours"]) return prev;
      const next = { ...prev, [index]: { ...prev[index] } };
      delete next[index][field === "topic" ? "topic" : "hours"];
      if (!next[index].topic && !next[index].hours) delete next[index];
      return next;
    });
  };

  const onSubmit = (data: TOSFormData) => {
    try {
      // ─── Row-level validation: every topic row must have a name AND hours ───
      const rows = topics;
      const rowErrors: Record<number, { topic?: string; hours?: string }> = {};
      let firstInvalidId: string | null = null;

      rows.forEach((t, index) => {
        const name = (t?.topic ?? "").trim();
        const hours = t?.hours;
        if (!name) {
          rowErrors[index] = { ...rowErrors[index], topic: "Learning competency is required." };
          if (!firstInvalidId) firstInvalidId = `topic-${index}`;
        }
        if (hours === "" || hours === undefined || hours === null || Number.isNaN(hours)) {
          rowErrors[index] = { ...rowErrors[index], hours: "Instructional hours are required." };
          if (!firstInvalidId) firstInvalidId = `hours-${index}`;
        } else if (Number(hours) <= 0) {
          rowErrors[index] = { ...rowErrors[index], hours: "Hours must be greater than 0." };
          if (!firstInvalidId) firstInvalidId = `hours-${index}`;
        }
      });

      if (rows.length === 0) {
        toast.error("Please add at least one topic with instructional hours");
        return;
      }

      setTopicErrors(rowErrors);

      if (Object.keys(rowErrors).length > 0) {
        toast.error("Please complete all Learning Competencies and Instructional Hours fields before submitting.");
        if (firstInvalidId) focusField(firstInvalidId);
        return; // Do not calculate the matrix or save any partial TOS record.
      }

      const validTopics = rows.map((t) => ({ topic: t.topic!.trim(), hours: Number(t.hours) }));


      // Use the canonical calculator
      const matrix = calculateCanonicalTOSMatrix({
        subject_no: data.subject_no,
        course: data.course,
        description: data.description,
        year_section: data.year_section,
        exam_period: data.exam_period,
        school_year: data.school_year,
        semester: data.semester,
        total_items: data.total_items,
        prepared_by: data.prepared_by || "",
        checked_by: data.checked_by || "",
        noted_by: data.noted_by || "",
        topics: validTopics
      });

      // Validate the matrix before proceeding
      validateTOSMatrix(matrix);
      
      setTosMatrix(matrix);
      setShowMatrix(true);
      
      // Analyze sufficiency when matrix is generated
      analyzeSufficiency(matrix);
      
      toast.success(`TOS Matrix generated successfully! Total: ${matrix.total_items} items`);
    } catch (error) {
      console.error('Error generating TOS:', error);
      toast.error(error instanceof Error ? error.message : "Failed to generate TOS matrix");
    }
  };

  const analyzeSufficiency = async (matrix: CanonicalTOSMatrix) => {
    setIsAnalyzing(true);
    try {
      const analysis = await analyzeTOSSufficiency(matrix);
      setSufficiencyAnalysis(analysis);
      
      if (analysis.overallStatus === 'pass') {
        toast.success("Question bank is sufficient for test generation!");
      } else if (analysis.overallStatus === 'warning') {
        toast.info("Question bank has marginal coverage. AI will generate additional questions as needed.");
      } else {
        toast.info("Not enough questions in the bank. AI will generate the rest.");
      }
    } catch (error) {
      console.error('Error analyzing TOS sufficiency:', error);
      toast.error("Failed to analyze question bank sufficiency");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleSaveMatrix = () => {
    if (tosMatrix) {
      saveTOSMatrix();
    }
  };
  
  const saveTOSMatrix = async () => {
    if (!tosMatrix) return;
    
    try {
      // Prepare data for database (remove computed fields)
      const tosData = {
        title: tosMatrix.title,
        subject_no: tosMatrix.subject_no,
        course: tosMatrix.course,
        description: tosMatrix.description,
        year_section: tosMatrix.year_section,
        exam_period: tosMatrix.exam_period,
        school_year: tosMatrix.school_year,
        semester: tosMatrix.semester,
        total_items: tosMatrix.total_items,
        prepared_by: tosMatrix.prepared_by,
        checked_by: tosMatrix.checked_by,
        noted_by: tosMatrix.noted_by,
        topics: tosMatrix.topics,
        matrix: tosMatrix.matrix,
        distribution: tosMatrix.distribution
      };
      
      const savedTOS = await TOS.create(tosData);
      setTosMatrix({ ...tosMatrix, id: savedTOS.id });

      // Clear the autosaved draft now that the TOS is safely persisted.
      clearPersistedState("tos-builder-draft");
      toast.success("TOS matrix saved successfully!");
    } catch (error) {
      console.error('Error saving TOS:', error);
      toast.error("Failed to save TOS matrix");
    }
  };

  // ─── Pre-generation TOS validation ───
  // Every required TOS field must be present and consistent before any
  // question generation is allowed. Returns the list of problems found.
  const collectTOSProblems = (): { label: string; elementId: string }[] => {
    const values = form.getValues();
    const problems: { label: string; elementId: string }[] = [];
    const req = (value: unknown, label: string, elementId: string) => {
      if (typeof value !== "string" || value.trim() === "") {
        problems.push({ label, elementId });
      }
    };

    req(tosMatrix?.subject_no ?? values.subject_no, "Subject No.", "subjectNo");
    req(tosMatrix?.course ?? values.course, "Course", "course");
    req(tosMatrix?.description ?? values.description, "Subject Description", "subjectDescription");
    req(tosMatrix?.year_section ?? values.year_section, "Year & Section", "yearSection");
    req(tosMatrix?.exam_period ?? values.exam_period, "Exam Period", "examPeriod");
    req(tosMatrix?.school_year ?? values.school_year, "School Year", "schoolYear");
    req(tosMatrix?.semester ?? values.semester, "Semester", "semester");

    const totalItems = tosMatrix?.total_items ?? values.total_items;
    if (!totalItems || Number.isNaN(totalItems) || totalItems < 10 || totalItems > 100) {
      problems.push({ label: "Total Items (must be between 10 and 100)", elementId: "totalItems" });
    }

    const topicList = tosMatrix?.topics ?? topics;
    const namedTopics = (topicList || []).filter((t) => (t?.topic ?? "").trim() !== "");
    if (namedTopics.length === 0) {
      problems.push({ label: "Learning Competencies / Topics", elementId: "topic-0" });
    } else {
      const missingHoursIndex = (topicList || []).findIndex(
        (t) => (t?.topic ?? "").trim() !== "" && (t?.hours === "" || !t?.hours || Number(t?.hours) <= 0),
      );
      if (missingHoursIndex >= 0) {
        problems.push({
          label: "Instructional Hours (every topic needs hours greater than 0)",
          elementId: `hours-${missingHoursIndex}`,
        });
      }
    }

    // Bloom's Taxonomy distribution must exist and sum exactly to Total Items.
    if (tosMatrix) {
      const bloomTotals = tosMatrix.bloom_totals || ({} as Record<string, number>);
      const bloomSum = Object.values(bloomTotals).reduce((a, b) => a + (b || 0), 0);
      if (bloomSum === 0) {
        problems.push({ label: "Bloom's Taxonomy Distribution", elementId: "totalItems" });
      } else if (bloomSum !== tosMatrix.total_items) {
        problems.push({
          label: `Bloom's Taxonomy Distribution (totals ${bloomSum} but Total Items is ${tosMatrix.total_items})`,
          elementId: "totalItems",
        });
      }
    }

    return problems;
  };

  const focusField = (elementId: string) => {
    const el = document.getElementById(elementId) as HTMLElement | null;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("ring-2", "ring-destructive", "ring-offset-2", "rounded-md");
    try {
      el.focus({ preventScroll: true });
    } catch { /* non-focusable */ }
    window.setTimeout(() => {
      el.classList.remove("ring-2", "ring-destructive", "ring-offset-2", "rounded-md");
    }, 6000);
  };

  const handleGoBackToTOS = () => {
    const first = missingFields[0];
    setShowIncompleteDialog(false);
    setShowMatrix(false);
    window.setTimeout(() => {
      if (first) focusField(first.elementId);
    }, 250);
  };

  // Entry point for the "Generate Test Questionnaire" button.
  const requestGenerateTest = () => {
    const problems = collectTOSProblems();
    if (problems.length > 0) {
      setMissingFields(problems);
      setShowIncompleteDialog(true);
      return;
    }
    setShowConfirmGenerate(true);
  };


  const handleGenerateTest = async () => {
    if (!tosMatrix) {
      toast.error("TOS data missing. Please generate the matrix first.");
      return;
    }

    if (!tosMatrix.topics || !Array.isArray(tosMatrix.topics)) {
      toast.error("TOS data is incomplete. Cannot generate test.");
      return;
    }
    
    setIsGeneratingTest(true);
    setGenerationProgress(0);
    setGenerationStatus("Initializing test generation...");
    
    try {
      // Save TOS to database first
      let savedTOSId = tosMatrix.id;
      
      console.log("🔍 Verifying TOS before test generation...", { currentId: savedTOSId });
      
      let tosExists = false;
      
      if (savedTOSId && !savedTOSId.startsWith('temp-')) {
        try {
          const existingTOS = await TOS.getById(savedTOSId);
          tosExists = !!existingTOS;
          console.log("✅ TOS found in database:", existingTOS.id);
        } catch (error) {
          console.warn("⚠️ TOS ID exists in state but not in database:", savedTOSId);
          tosExists = false;
        }
      }
      
      if (!tosExists) {
        setGenerationStatus("Saving TOS to database...");
        console.log("💾 Creating new TOS entry in database...");
        
        const tosData = {
          title: tosMatrix.title,
          subject_no: tosMatrix.subject_no,
          course: tosMatrix.course,
          description: tosMatrix.description,
          year_section: tosMatrix.year_section,
          exam_period: tosMatrix.exam_period,
          school_year: tosMatrix.school_year,
          semester: tosMatrix.semester,
          total_items: tosMatrix.total_items,
        prepared_by: tosMatrix.prepared_by,
        checked_by: tosMatrix.checked_by,
        noted_by: tosMatrix.noted_by,
        topics: tosMatrix.topics,
        matrix: tosMatrix.matrix,
        distribution: tosMatrix.distribution
      };
      
        try {
          const savedTOS = await TOS.create(tosData);
          
          if (!savedTOS || !savedTOS.id) {
            throw new Error("TOS creation failed - no ID returned");
          }
          
          savedTOSId = savedTOS.id;
          setTosMatrix({ ...tosMatrix, id: savedTOSId });
          console.log("✅ TOS created successfully:", savedTOSId);
        } catch (createError) {
          console.error("❌ Failed to create TOS:", createError);
          throw new Error(`Failed to save TOS: ${createError instanceof Error ? createError.message : 'Unknown error'}`);
        }
      }
      
      if (!savedTOSId) {
        throw new Error("Invalid TOS ID - cannot generate test");
      }
      
      console.log("✅ TOS validation complete. Using ID:", savedTOSId);

      setGenerationProgress(20);
      setGenerationStatus("Analyzing TOS matrix and building criteria...");
      
      // Build criteria from the canonical TOS matrix preserving explicit item placement
      const criteria: TOSCriteria[] = [];
      const bloomLevels: BloomLevel[] = ['remembering', 'understanding', 'applying', 'analyzing', 'evaluating', 'creating'];

      for (const [topicName, topicData] of Object.entries(tosMatrix.distribution)) {
        for (const level of bloomLevels) {
          const count = topicData[level].count;
          const itemNumbers = topicData[level].items || topicData[level]; // Handle both .count + .items structure and direct array
          
          if (count > 0) {
            const questionType = ['remembering', 'understanding', 'applying'].includes(level)
              ? 'mcq'
              : 'essay';

            const knowledgeDimension = level === 'remembering' ? 'Factual'
              : level === 'applying' ? 'Procedural'
              : (level === 'creating' || level === 'evaluating') ? 'Metacognitive'
              : 'Conceptual';

            criteria.push({
              topic: topicName,
              bloom_level: level,
              knowledge_dimension: knowledgeDimension,
              difficulty: getDifficultyForBloom(level),
              count,
              item_numbers: Array.isArray(itemNumbers) ? itemNumbers : undefined,
              question_type: questionType
            });
          }
        }
      }

      if (criteria.length === 0) {
        setIsGeneratingTest(false);
        toast.error('No items found in the TOS matrix. Please generate the TOS first.');
        return;
      }
      
      setGenerationProgress(40);
      setGenerationStatus("Querying question bank and generating questions...");
      
      const testMetadata = {
        subject: tosMatrix.subject_no || tosMatrix.course,
        course: tosMatrix.course,
        year_section: tosMatrix.year_section,
        exam_period: tosMatrix.exam_period,
        school_year: tosMatrix.school_year,
        semester: tosMatrix.semester,
        tos_id: savedTOSId,
      };

      // Use format-aware generation for all formats
      const selectedFormat = getExamFormat(selectedFormatId) || getDefaultFormat();
      
      console.log("📋 Using exam format:", selectedFormat.name);
      console.log("📊 Total criteria items:", criteria.reduce((s, c) => s + c.count, 0));
      
      const formatResult = await generateFormatAwareTest({
        format: selectedFormat,
        tosCriteria: criteria,
        testTitle: tosMatrix.title,
        testMetadata,
      });

      setGenerationProgress(90);
      setGenerationStatus("Test saved successfully!");
      
      setGenerationProgress(100);
      setGenerationStatus("Redirecting to test preview...");
      
      toast.success(`Successfully generated ${formatResult.totalItems}-item test with ${selectedFormat.sections.length} section(s)!`);
      
      setTimeout(() => {
        navigate(`/teacher/generated-test/${formatResult.id}`);
      }, 500);
      
    } catch (error) {
      console.error('Error generating test:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to generate test. Please try again.');
    } finally {
      setIsGeneratingTest(false);
      setTimeout(() => {
        setGenerationProgress(0);
        setGenerationStatus("");
      }, 2000);
    }
  };

  if (showMatrix && tosMatrix) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="outline" onClick={onBack}>
            ← Back to Dashboard
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => setShowMatrix(false)}>
              Edit TOS
            </Button>
          </div>
        </div>
        
        <TOSMatrix data={tosMatrix} />
        
        {/* Sufficiency Analysis */}
        {sufficiencyAnalysis && (
          <SufficiencyAnalysisPanel analysis={sufficiencyAnalysis} />
        )}
        
        {/* Exam Format Selection */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5" />
              Exam Format
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ExamFormatSelector 
              value={selectedFormatId} 
              onChange={setSelectedFormatId}
              totalItems={tosMatrix.total_items}
            />
          </CardContent>
        </Card>

        {/* Generate Test Section */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="w-5 h-5" />
              Generate Test from TOS
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-6">
            <div className="space-y-6">
              <div className="text-center">
                <p className="text-muted-foreground">
                  Generate a complete multi-section test based on this TOS matrix and selected format.
                  The system will use existing approved questions and generate AI questions for any gaps.
                </p>
              </div>
              
              {/* Selected Format Summary */}
              <div className="max-w-md mx-auto">
                <SelectedFormatSummary formatId={selectedFormatId} />
              </div>
              
              {isGeneratingTest && (
                <div className="space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>{generationStatus}</span>
                    <span>{Math.round(generationProgress)}%</span>
                  </div>
                  <Progress value={generationProgress} />
                </div>
              )}
              
              <div className="text-center">
                <Button
                  variant="default"
                  size="lg"
                  className="px-8 py-3"
                  onClick={requestGenerateTest}
                  disabled={isGeneratingTest || isAnalyzing}
                >
                  {isGeneratingTest ? (
                    <>
                      <Brain className="w-5 h-5 mr-2 animate-spin" />
                      {generationStatus || 'Generating Test...'}
                    </>
                  ) : (
                    <>
                      🧠 Generate Test Questionnaire
                    </>
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* TOS incomplete — blocks generation */}
        <AlertDialog open={showIncompleteDialog} onOpenChange={setShowIncompleteDialog}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                <AlertTriangle className="h-5 w-5" />
                TOS Incomplete
              </AlertDialogTitle>
              <AlertDialogDescription asChild>
                <div className="space-y-3">
                  <p>
                    The Test Questionnaire cannot be generated yet. Please complete the
                    following required field{missingFields.length > 1 ? "s" : ""}:
                  </p>
                  <ul className="list-disc pl-5 space-y-1 text-foreground">
                    {missingFields.map((f) => (
                      <li key={f.elementId + f.label}>{f.label}</li>
                    ))}
                  </ul>
                  {missingFields.length > 1 && (
                    <p className="text-xs">
                      You will be taken to the first incomplete field: <strong>{missingFields[0]?.label}</strong>.
                    </p>
                  )}
                </div>
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogAction onClick={handleGoBackToTOS}>Go Back to TOS</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* Final confirmation before generation */}
        <AlertDialog open={showConfirmGenerate} onOpenChange={setShowConfirmGenerate}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>TOS is complete</AlertDialogTitle>
              <AlertDialogDescription>
                All required Table of Specification fields are valid. Do you want to proceed
                with generating the Test Questionnaire?
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={() => {
                  setShowConfirmGenerate(false);
                  handleGenerateTest();
                }}
              >
                Generate Questions
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>

    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4 gap-2">
          <CardTitle className="flex items-center gap-2 text-academic-primary">
              <Calculator className="h-5 w-5" />
              Table of Specification Builder
          </CardTitle>
          <div className="flex items-center gap-2">
            <AlertDialog open={showClearConfirm} onOpenChange={setShowClearConfirm}>
              <AlertDialogTrigger asChild>
                <Button type="button" variant="outline" size="sm">
                  <RotateCcw className="h-4 w-4 mr-2" />
                  New TOS
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Clear the current TOS form?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to clear the current TOS form? All unsaved data —
                    including added topics, instructional hours, and any generated matrix
                    preview — will be removed. Auto-populated fields will be restored.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={() => handleClearForm()}>
                    Clear Form
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>


          <TOSUploadParser onParsed={(data) => {
            const parsedTopics = (data.topics.length > 0 ? data.topics : [{ topic: "", hours: 0 }]).map(t => ({
              topic: t.topic || "",
              hours: typeof t.hours === "number" && t.hours > 0 ? t.hours : "" as number | ""
            }));
            setTopics(parsedTopics);
            
            const formData = {
              subject_no: data.subject_no || "",
              course: data.course || "",
              description: data.description || "",
              year_section: data.year_section || "",
              exam_period: data.exam_period || "",
              school_year: data.school_year || "",
              semester: data.semester || "",
              total_items: data.total_items || 50,
              prepared_by: data.prepared_by || "",
              checked_by: data.checked_by || "",
              noted_by: data.noted_by || "",
              topics: parsedTopics,
            };
            
            reset(formData);

            // Check which required fields are missing
            const missingFields: string[] = [];
            if (!formData.subject_no) missingFields.push("Subject No.");
            if (!formData.course) missingFields.push("Course");
            if (!formData.description) missingFields.push("Subject Description");
            if (!formData.year_section) missingFields.push("Year & Section");
            if (!formData.exam_period) missingFields.push("Exam Period");
            if (!formData.school_year) missingFields.push("School Year");
            if (!formData.semester) missingFields.push("Semester");
            
            const hasValidTopics = parsedTopics.some(t => t.topic && typeof t.hours === "number" && t.hours > 0);
            if (!hasValidTopics) missingFields.push("Topics with hours");

            if (missingFields.length > 0) {
              toast.warning("Some fields could not be extracted", {
                description: `Please fill in: ${missingFields.join(", ")}. Then click "Generate TOS Matrix".`,
                duration: 8000,
              });
            } else {
              // All required fields present — auto-generate matrix
              toast.success("All fields extracted! Generating TOS Matrix...");
              setAutoGeneratePending(true);
            }
          }} />
          </div>
        </CardHeader>

        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Basic Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="subjectNo">Subject No.</Label>
                <Input
                  id="subjectNo"
                  {...register("subject_no", {
                    onBlur: (e) => lookupSubject(e.target.value),
                  })}
                  placeholder="e.g., IS 9"
                />
                {subjectLookupStatus === 'looking' && (
                  <p className="text-xs text-muted-foreground mt-1">Looking up subject…</p>
                )}
                {subjectLookupStatus === 'found' && (
                  <p className="text-xs text-primary mt-1">
                    {subjectTypeLabel ? `${subjectTypeLabel} subject — ` : ''}
                    course &amp; description auto-filled from the central subject database.
                  </p>
                )}

                {subjectLookupStatus === 'missing' && (
                  <p className="text-xs text-amber-600 mt-1">Subject not found in central database — please ask an admin to add it.</p>
                )}
                {subjectLookupStatus === 'error' && (
                  <p className="text-xs text-destructive mt-1">Could not reach the subject database. Please try again.</p>
                )}
                {errors.subject_no && (
                  <p className="text-sm text-destructive mt-1">{errors.subject_no.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="course">
                  Course{' '}
                  <span className="text-xs text-muted-foreground">(auto — editable)</span>
                </Label>
                <Input
                  id="course"
                  {...register("course")}
                  placeholder="Auto-filled from Subject No."
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Auto-filled from the central subject database. You can edit it before saving.
                </p>
                {errors.course && (
                  <p className="text-sm text-destructive mt-1">{errors.course.message}</p>
                )}
              </div>



              <div className="md:col-span-2">
                <Label htmlFor="subjectDescription">Subject Description <span className="text-xs text-muted-foreground">(auto)</span></Label>
                <Input
                  id="subjectDescription"
                  {...register("description")}
                  placeholder={subjectLookupStatus === 'found' ? 'Auto-filled from Subject No.' : 'Enter subject description'}
                  readOnly={subjectLookupStatus === 'found'}
                  className={subjectLookupStatus === 'found' ? 'bg-muted/40' : ''}
                />
                {errors.description && (
                  <p className="text-sm text-destructive mt-1">{errors.description.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="yearSection">Year & Section</Label>
                <Input
                  id="yearSection"
                  {...register("year_section")}
                  placeholder="e.g., BSIS-3A"
                />
                {errors.year_section && (
                  <p className="text-sm text-destructive mt-1">{errors.year_section.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="examPeriod">Exam Period</Label>
                <Select
                  value={watch("exam_period") || ""}
                  onValueChange={(v) => setValue("exam_period", v, { shouldValidate: true, shouldDirty: true })}
                >
                  <SelectTrigger id="examPeriod">
                    <SelectValue placeholder="Select exam period" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Midterm Examination">Midterm Examination</SelectItem>
                    <SelectItem value="Final Examination">Final Examination</SelectItem>
                  </SelectContent>
                </Select>
                {errors.exam_period && (
                  <p className="text-sm text-destructive mt-1">{errors.exam_period.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="schoolYear">School Year <span className="text-xs text-muted-foreground">(auto)</span></Label>
                <Input
                  id="schoolYear"
                  {...register("school_year")}
                  placeholder="Set by admin in System Settings"
                  readOnly
                  className="bg-muted/40"
                />
                {errors.school_year && (
                  <p className="text-sm text-destructive mt-1">{errors.school_year.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="semester">Semester</Label>
                <Select
                  value={watch("semester") || ""}
                  onValueChange={(v) => setValue("semester", v, { shouldValidate: true, shouldDirty: true })}
                >
                  <SelectTrigger id="semester">
                    <SelectValue placeholder="Select semester" />
                  </SelectTrigger>
                  <SelectContent>
                    {SEMESTER_OPTIONS.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {errors.semester && (
                  <p className="text-sm text-destructive mt-1">{errors.semester.message}</p>
                )}
              </div>


              <div>
                <Label htmlFor="totalItems">Total Items</Label>
                <Input
                  id="totalItems"
                  type="number"
                  {...register("total_items", { valueAsNumber: true })}
                  min="10"
                  max="100"
                />
                {errors.total_items && (
                  <p className="text-sm text-destructive mt-1">{errors.total_items.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="preparedBy">Prepared By <span className="text-xs text-muted-foreground">(auto)</span></Label>
                <Input
                  id="preparedBy"
                  {...register("prepared_by")}
                  placeholder="Auto-filled from your profile"
                  readOnly
                  className="bg-muted/40"
                />
              </div>

              <div>
                <Label htmlFor="checkedBy">Checked and Reviewed By <span className="text-xs text-muted-foreground">(auto)</span></Label>
                <Input
                  id="checkedBy"
                  {...register("checked_by")}
                  placeholder="Chairperson set by admin per department"
                  readOnly
                  className="bg-muted/40"
                />
              </div>

              <div>
                <Label htmlFor="notedBy">Noted By <span className="text-xs text-muted-foreground">(auto)</span></Label>
                <Input
                  id="notedBy"
                  {...register("noted_by")}
                  placeholder="Dean set by admin per department"
                  readOnly
                  className="bg-muted/40"
                />
              </div>
            </div>

            <Separator />

            {/* Topics and Hours */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold">Learning Competencies & Instructional Hours</h3>
                <Button type="button" onClick={addTopic} variant="outline" size="sm">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Topic
                </Button>
              </div>

              <div className="space-y-3">
                {topics.map((topic, index) => (
                  <div key={index} className="flex gap-3 items-start">
                    <div className="flex-1">
                      <Input
                        id={`topic-${index}`}
                        placeholder="Topic/Learning Competency"
                        value={topic.topic}
                        aria-invalid={!!topicErrors[index]?.topic}
                        className={topicErrors[index]?.topic ? "border-destructive focus-visible:ring-destructive" : undefined}
                        onChange={(e) => updateTopic(index, "topic", e.target.value)}
                      />
                      {topicErrors[index]?.topic && (
                        <p className="text-sm text-destructive mt-1">{topicErrors[index]?.topic}</p>
                      )}
                    </div>
                    <div className="w-40">
                      <Input
                        id={`hours-${index}`}
                        type="number"
                        placeholder="Hours"
                        step="0.5"
                        min="0.5"
                        value={topic.hours}
                        aria-invalid={!!topicErrors[index]?.hours}
                        className={topicErrors[index]?.hours ? "border-destructive focus-visible:ring-destructive" : undefined}
                        onChange={(e) => updateTopic(index, "hours", e.target.value === "" ? "" : parseFloat(e.target.value))}
                      />
                      {topicErrors[index]?.hours && (
                        <p className="text-sm text-destructive mt-1">{topicErrors[index]?.hours}</p>
                      )}
                    </div>

                    {topics.length > 1 && (
                      <Button
                        type="button"
                        variant="outline"
                        size="icon"
                        onClick={() => removeTopic(index)}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>

              {errors.topics && (
                <p className="text-sm text-destructive mt-2">{errors.topics.message}</p>
              )}
            </div>

            {/* Bloom's Taxonomy Distribution Info */}
            <Card className="bg-muted/50">
              <CardContent className="pt-4">
                <h4 className="font-semibold mb-3">Bloom's Taxonomy Distribution (Fixed Quotas)</h4>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-sm">
                  <div>
                    <strong>Easy (30%):</strong>
                    <ul className="ml-4 list-disc">
                      <li>Remembering: 15%</li>
                      <li>Understanding: 15%</li>
                    </ul>
                  </div>
                  <div>
                    <strong>Average (40%):</strong>
                    <ul className="ml-4 list-disc">
                      <li>Applying: 20%</li>
                      <li>Analyzing: 20%</li>
                    </ul>
                  </div>
                  <div>
                    <strong>Difficult (30%):</strong>
                    <ul className="ml-4 list-disc">
                      <li>Evaluating: 15%</li>
                      <li>Creating: 15%</li>
                    </ul>
                  </div>
                </div>
                <p className="mt-3 text-xs text-muted-foreground">
                  These quotas are enforced exactly. The matrix total will always equal your input total.
                </p>
              </CardContent>
            </Card>

            <Button type="submit" className="w-full" variant="academic">
              <Calculator className="h-4 w-4 mr-2" />
              Submit
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
};
