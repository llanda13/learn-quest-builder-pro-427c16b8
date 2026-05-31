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
import { Plus, Trash2, Calculator, Brain, Target, AlertTriangle, Upload } from "lucide-react";
import { TOSUploadParser } from "./tos/TOSUploadParser";
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

// localStorage key for the in-progress TOS draft. Bumped versions invalidate
// older shapes so we never crash on a stale payload.
const TOS_DRAFT_KEY = "lovable.persist.v1.tos-builder-draft";

const topicSchema = z.object({
  topic: z.string().min(1, "Topic name is required"),
  hours: z.number().min(0.5, "Minimum 0.5 hours required")
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
  
  // Hydrate topics from any saved draft so refresh / tab switch doesn't wipe input.
  const [topics, setTopics] = useState<{ topic: string; hours: number }[]>(() => {
    if (typeof window === "undefined") return [{ topic: "", hours: 0 }];
    try {
      const raw = window.localStorage.getItem(TOS_DRAFT_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed?.topics) && parsed.topics.length > 0) {
          return parsed.topics;
        }
      }
    } catch { /* ignore */ }
    return [{ topic: "", hours: 0 }];
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
      let parsedTopics: { topic: string; hours: number }[] = [{ topic: "", hours: 0 }];
      
      if (template.topics) {
        if (Array.isArray(template.topics)) {
          // Topics is an array format
          parsedTopics = template.topics.map((t: any) => ({
            topic: t.topic || t.name || "",
            hours: t.hours || 0
          }));
        } else if (typeof template.topics === 'object') {
          // Topics might be an object with topic names as keys
          parsedTopics = Object.entries(template.topics).map(([name, data]: [string, any]) => ({
            topic: name,
            hours: typeof data === 'object' ? (data.hours || 0) : 0
          }));
        }
      } else if (template.distribution && typeof template.distribution === 'object') {
        // Try to extract topics from distribution if topics array is missing
        parsedTopics = Object.keys(template.distribution).map(topicName => ({
          topic: topicName,
          hours: template.distribution[topicName]?.hours || 3
        }));
      }
      
      // Ensure at least one topic
      if (parsedTopics.length === 0) {
        parsedTopics = [{ topic: "", hours: 0 }];
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

  const watchedTotalItems = watch("total_items");

  const addTopic = () => {
    const newTopics = [...topics, { topic: "", hours: 0 }];
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
  };

  const onSubmit = (data: TOSFormData) => {
    try {
      // Validate and convert topics to required format
      const validTopics = data.topics
        .filter(t => t.topic && t.hours > 0)
        .map(t => ({ topic: t.topic!, hours: t.hours! }));
      
      if (validTopics.length === 0) {
        toast.error("Please add at least one topic with hours");
        return;
      }

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
      
      // Build criteria from the canonical TOS matrix
      const criteria: TOSCriteria[] = [];
      const bloomLevels: BloomLevel[] = ['remembering', 'understanding', 'applying', 'analyzing', 'evaluating', 'creating'];

      for (const [topicName, topicData] of Object.entries(tosMatrix.distribution)) {
        for (const level of bloomLevels) {
          const count = topicData[level].count;
          
          if (count > 0) {
            criteria.push({
              topic: topicName,
              bloom_level: level,
              knowledge_dimension: level === 'remembering' ? 'Factual' 
                : level === 'applying' ? 'Procedural' 
                : (level === 'creating' || level === 'evaluating') ? 'Metacognitive' 
                : 'Conceptual',
              difficulty: getDifficultyForBloom(level),
              count,
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
                  onClick={handleGenerateTest}
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
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <CardTitle className="flex items-center gap-2 text-academic-primary">
              <Calculator className="h-5 w-5" />
              Table of Specification Builder
          </CardTitle>
          <TOSUploadParser onParsed={(data) => {
            const parsedTopics = data.topics.length > 0 ? data.topics : [{ topic: "", hours: 0 }];
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
            
            const hasValidTopics = parsedTopics.some(t => t.topic && t.hours > 0);
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
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
            {/* Basic Information */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="subjectNo">Subject No.</Label>
                <Input
                  id="subjectNo"
                  {...register("subject_no")}
                  placeholder="e.g., IS 9"
                />
                {errors.subject_no && (
                  <p className="text-sm text-destructive mt-1">{errors.subject_no.message}</p>
                )}
              </div>
              
              <div>
                <Label htmlFor="course">Course</Label>
                <Input
                  id="course"
                  {...register("course")}
                  placeholder="e.g., BSIS"
                />
                {errors.course && (
                  <p className="text-sm text-destructive mt-1">{errors.course.message}</p>
                )}
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="subjectDescription">Subject Description</Label>
                <Input
                  id="subjectDescription"
                  {...register("description")}
                  placeholder="e.g., System Analysis and Design"
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
                <Input
                  id="examPeriod"
                  {...register("exam_period")}
                  placeholder="e.g., Final Examination"
                />
                {errors.exam_period && (
                  <p className="text-sm text-destructive mt-1">{errors.exam_period.message}</p>
                )}
              </div>

              <div>
                <Label htmlFor="schoolYear">School Year</Label>
                <Input
                  id="schoolYear"
                  {...register("school_year")}
                  placeholder="e.g., 2024-2025"
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
                <Label htmlFor="preparedBy">Prepared By</Label>
                <Input
                  id="preparedBy"
                  {...register("prepared_by")}
                  placeholder="e.g., Teacher Name"
                />
              </div>

              <div>
                <Label htmlFor="checkedBy">Checked and Reviewed By</Label>
                <Input
                  id="checkedBy"
                  {...register("checked_by")}
                  placeholder="e.g., Program Chair Name"
                />
              </div>

              <div>
                <Label htmlFor="notedBy">Noted By</Label>
                <Input
                  id="notedBy"
                  {...register("noted_by")}
                  placeholder="e.g., Dean Name"
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
                        placeholder="Topic/Learning Competency"
                        value={topic.topic}
                        onChange={(e) => updateTopic(index, "topic", e.target.value)}
                      />
                    </div>
                    <div className="w-24">
                      <Input
                        type="number"
                        placeholder="Hours"
                        step="0.5"
                        min="0.5"
                        value={topic.hours || ""}
                        onChange={(e) => updateTopic(index, "hours", parseFloat(e.target.value) || 0)}
                      />
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
