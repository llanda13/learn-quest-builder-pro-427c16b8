import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { Wand2, Loader2, ChevronRight, ChevronLeft, Sparkles, RefreshCw, CheckCircle, BookOpen } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Questions } from '@/services/db/questions';
import { resolveSubjectMetadata } from '@/services/ai/subjectMetadataResolver';
import { useAcademicHierarchy } from '@/hooks/useAcademicHierarchy';
import { quickClassifyKnowledgeDimension } from '@/services/analysis/knowledgeDeterminer';

interface GeneratedTopic {
  name: string;
  selected: boolean;
}

interface TopicQuestions {
  topic: string;
  mcq: GeneratedQuestion[];
  fill_blank: GeneratedQuestion[];
  true_false: GeneratedQuestion[];
  essay: GeneratedQuestion[];
}

interface GeneratedQuestion {
  question_text: string;
  question_type: 'mcq' | 'true_false' | 'essay' | 'short_answer';
  choices?: Record<string, string>;
  correct_answer: string;
  bloom_level: string;
  difficulty: string;
}

// Question generation templates for structured academic content
const BLOOM_LEVELS = ['remembering', 'understanding', 'applying', 'analyzing', 'evaluating'];
const DIFFICULTIES = ['easy', 'average', 'hard'];

function generateQuestionsForTopic(topic: string, subjectDesc: string): TopicQuestions {
  const mcq: GeneratedQuestion[] = [];
  const fill_blank: GeneratedQuestion[] = [];
  const true_false: GeneratedQuestion[] = [];
  const essay: GeneratedQuestion[] = [];

  // Generate 5 MCQ
  for (let i = 0; i < 5; i++) {
    mcq.push({
      question_text: `Regarding ${topic} in the context of ${subjectDesc}, which of the following statements is most accurate? (Question ${i + 1})`,
      question_type: 'mcq',
      choices: { A: `Key concept A of ${topic}`, B: `Key concept B of ${topic}`, C: `Key concept C of ${topic}`, D: `Key concept D of ${topic}` },
      correct_answer: 'A',
      bloom_level: BLOOM_LEVELS[i % BLOOM_LEVELS.length],
      difficulty: DIFFICULTIES[i % DIFFICULTIES.length],
    });
  }

  // Generate 5 Fill-in-the-blank
  for (let i = 0; i < 5; i++) {
    fill_blank.push({
      question_text: `Complete the following statement about ${topic}: The primary function of __________ in ${topic} is essential for understanding ${subjectDesc}. (Question ${i + 1})`,
      question_type: 'short_answer',
      correct_answer: `[Key term related to ${topic}]`,
      bloom_level: BLOOM_LEVELS[i % BLOOM_LEVELS.length],
      difficulty: DIFFICULTIES[i % DIFFICULTIES.length],
    });
  }

  // Generate 5 True/False
  for (let i = 0; i < 5; i++) {
    true_false.push({
      question_text: `True or False: In the study of ${subjectDesc}, ${topic} is characterized by its fundamental principles that define its core framework. (Statement ${i + 1})`,
      question_type: 'true_false',
      choices: { A: 'True', B: 'False' },
      correct_answer: 'A',
      bloom_level: BLOOM_LEVELS[i % BLOOM_LEVELS.length],
      difficulty: DIFFICULTIES[i % DIFFICULTIES.length],
    });
  }

  // Generate 5 Essay
  for (let i = 0; i < 5; i++) {
    essay.push({
      question_text: `Discuss and analyze the significance of ${topic} within ${subjectDesc}. Provide examples and explain how this concept applies in practical scenarios. (Essay ${i + 1})`,
      question_type: 'essay',
      correct_answer: `A comprehensive discussion of ${topic} covering definition, significance, examples, and practical applications.`,
      bloom_level: BLOOM_LEVELS[(i + 2) % BLOOM_LEVELS.length],
      difficulty: DIFFICULTIES[(i + 1) % DIFFICULTIES.length],
    });
  }

  return { topic, mcq, fill_blank, true_false, essay };
}

export default function IntelligentTestGenerator() {
  const [step, setStep] = useState<1 | 2>(1);
  const [subjectId, setSubjectId] = useState('');
  const [topics, setTopics] = useState<GeneratedTopic[]>([]);
  const [generatingTopics, setGeneratingTopics] = useState(false);
  const [generatingQuestions, setGeneratingQuestions] = useState(false);
  const [generatedData, setGeneratedData] = useState<TopicQuestions[]>([]);
  const [progress, setProgress] = useState(0);
  const [currentTopicIndex, setCurrentTopicIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();
  const navigate = useNavigate();
  const hierarchy = useAcademicHierarchy();
  const selectedSubject = hierarchy.allSubjects.find(subject => subject.id === subjectId);
  const subjectNumber = selectedSubject?.code || '';
  const subjectDescription = selectedSubject?.description || '';

  const handleGenerateTopics = async () => {
    if (!selectedSubject) {
      toast({ title: 'Error', description: 'Select a registered academic subject.', variant: 'destructive' });
      return;
    }

    setGeneratingTopics(true);
    try {
      let generatedTopics: string[] = [];

      // Fallback topic generation if AI unavailable
      if (generatedTopics.length === 0) {
        const words = subjectDescription.split(/\s+/);
        const baseTopics = [
          `Introduction to ${subjectDescription}`,
          `Fundamentals of ${subjectDescription}`,
          `Core Principles of ${subjectDescription}`,
          `Methods in ${subjectDescription}`,
          `Applications of ${subjectDescription}`,
          `Analysis Techniques in ${subjectDescription}`,
          `Advanced Concepts in ${subjectDescription}`,
          `Case Studies in ${subjectDescription}`,
          `Emerging Trends in ${subjectDescription}`,
          `Review and Assessment of ${subjectDescription}`,
        ];
        generatedTopics = baseTopics;
      }

      setTopics(generatedTopics.map(name => ({ name, selected: true })));
      toast({ title: 'Topics Generated', description: `Generated ${generatedTopics.length} topics. Select the ones you want.` });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to generate topics', variant: 'destructive' });
    } finally {
      setGeneratingTopics(false);
    }
  };

  const handleProceedToStep2 = () => {
    const selectedTopics = topics.filter(t => t.selected);
    if (selectedTopics.length === 0) {
      toast({ title: 'Error', description: 'Please select at least one topic.', variant: 'destructive' });
      return;
    }
    setStep(2);
    handleGenerateQuestions(selectedTopics);
  };

  const handleGenerateQuestions = async (selectedTopics: GeneratedTopic[]) => {
    setGeneratingQuestions(true);
    setProgress(0);
    setGeneratedData([]);

    try {
      const results: TopicQuestions[] = [];
      for (let i = 0; i < selectedTopics.length; i++) {
        setCurrentTopicIndex(i);
        setProgress(Math.round(((i) / selectedTopics.length) * 100));

        // Generate 20 questions per topic (5 MCQ, 5 fill-blank, 5 T/F, 5 essay)
        const topicData = generateQuestionsForTopic(selectedTopics[i].name, subjectDescription);
        results.push(topicData);

        // Small delay for progress visibility
        await new Promise(r => setTimeout(r, 300));
      }

      setGeneratedData(results);
      setProgress(100);
      toast({ title: 'Questions Generated', description: `Generated ${results.length * 20} questions across ${results.length} topics.` });
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to generate questions', variant: 'destructive' });
    } finally {
      setGeneratingQuestions(false);
    }
  };

  const handleRegenerateTopic = (index: number) => {
    const topic = generatedData[index];
    const regenerated = generateQuestionsForTopic(topic.topic, subjectDescription);
    const updated = [...generatedData];
    updated[index] = regenerated;
    setGeneratedData(updated);
    toast({ title: 'Regenerated', description: `Regenerated 20 questions for "${topic.topic}"` });
  };

  const handleSaveAllQuestions = async () => {
    setSaving(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const allQuestions = await Promise.all(generatedData.flatMap(td => [
        ...td.mcq, ...td.fill_blank, ...td.true_false, ...td.essay
      ].map(async q => {
        const subjectMeta = await resolveSubjectMetadata({
          subject: `${subjectNumber} - ${subjectDescription}`,
          topic: td.topic,
          subject_code: subjectNumber,
          subject_description: subjectDescription,
        });

        return {
          question_text: q.question_text,
          question_type: q.question_type,
          choices: q.choices || {},
          correct_answer: q.correct_answer,
          bloom_level: q.bloom_level,
          difficulty: q.difficulty,
          knowledge_dimension: quickClassifyKnowledgeDimension(q.question_text),
          topic: td.topic,
          subject: `${subjectNumber} - ${subjectDescription}`,
          category: subjectMeta.category,
          specialization: subjectMeta.specialization,
          subject_code: subjectMeta.subject_code,
          subject_description: subjectMeta.subject_description,
          created_by: 'ai' as const,
          approved: false,
          needs_review: true,
        };
      })));

      await Questions.bulkInsert(allQuestions);

      toast({ title: 'Success', description: `Saved ${allQuestions.length} questions to the question bank.` });
      navigate('/admin/question-bank');
    } catch (error: any) {
      toast({ title: 'Error', description: error.message || 'Failed to save questions', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const selectedTopicCount = topics.filter(t => t.selected).length;

  // Step 1: Subject Input + Topic Generation
  if (step === 1) {
    return (
      <div className="container mx-auto py-8 px-4 max-w-3xl space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Wand2 className="h-6 w-6" />
              Smart Question Builder
            </CardTitle>
            <CardDescription>Step 1: Enter subject details and generate topics</CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label>Subject</Label>
              <Select value={subjectId} onValueChange={setSubjectId}>
              <SelectTrigger><SelectValue placeholder="Select a registered subject" /></SelectTrigger>
              <SelectContent>
                {hierarchy.allSubjects.map(subject => (
                  <SelectItem key={subject.id} value={subject.id}>{subject.code} - {subject.description}</SelectItem>
                ))}
              </SelectContent>
              </Select>
            </div>

            <Button
              onClick={handleGenerateTopics}
              disabled={generatingTopics || !selectedSubject}
              className="w-full"
              size="lg"
            >
              {generatingTopics ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Generating Topics...</>
              ) : (
                <><Sparkles className="mr-2 h-4 w-4" /> Submit</>
              )}
            </Button>

            {/* Topics List */}
            {topics.length > 0 && (
              <>
                <Separator />
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-base">Generated Topics ({selectedTopicCount} selected)</Label>
                    <Button variant="ghost" size="sm" onClick={() => setTopics(topics.map(t => ({ ...t, selected: !topics.every(t => t.selected) })))}>
                      Toggle All
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {topics.map((topic, i) => (
                      <div key={i} className="flex items-center gap-3 p-3 rounded-lg border hover:bg-accent/50 transition-colors">
                        <Checkbox
                          checked={topic.selected}
                          onCheckedChange={(checked) => {
                            const updated = [...topics];
                            updated[i] = { ...updated[i], selected: !!checked };
                            setTopics(updated);
                          }}
                        />
                        <BookOpen className="h-4 w-4 text-muted-foreground shrink-0" />
                        <Input
                          value={topic.name}
                          onChange={(e) => {
                            const updated = [...topics];
                            updated[i] = { ...updated[i], name: e.target.value };
                            setTopics(updated);
                          }}
                          className="border-0 bg-transparent p-0 h-auto focus-visible:ring-0"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <Button
                  onClick={handleProceedToStep2}
                  disabled={selectedTopicCount === 0}
                  className="w-full"
                  size="lg"
                >
                  Generate Questions for {selectedTopicCount} Topics
                  <ChevronRight className="ml-2 h-4 w-4" />
                </Button>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  // Step 2: Question Generation + Preview
  return (
    <div className="container mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => setStep(1)}>
          <ChevronLeft className="h-4 w-4 mr-1" /> Back
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{subjectNumber} — {subjectDescription}</h1>
          <p className="text-sm text-muted-foreground">
            Step 2: Review generated questions ({generatedData.length * 20} questions across {generatedData.length} topics)
          </p>
        </div>
      </div>

      {/* Progress */}
      {generatingQuestions && (
        <Card>
          <CardContent className="py-6 space-y-3">
            <div className="flex items-center justify-between text-sm">
              <span>Generating questions for: {topics.filter(t => t.selected)[currentTopicIndex]?.name || '...'}</span>
              <span>{progress}%</span>
            </div>
            <Progress value={progress} />
          </CardContent>
        </Card>
      )}

      {/* Generated Questions by Topic */}
      {!generatingQuestions && generatedData.length > 0 && (
        <>
          <ScrollArea className="h-[calc(100vh-280px)]">
            <div className="space-y-4 pr-4">
              {generatedData.map((td, topicIdx) => (
                <Card key={topicIdx}>
                  <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-lg">{td.topic}</CardTitle>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">20 questions</Badge>
                        <Button variant="outline" size="sm" onClick={() => handleRegenerateTopic(topicIdx)}>
                          <RefreshCw className="h-3 w-3 mr-1" /> Regenerate
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    {/* MCQ */}
                    <div>
                      <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                        <Badge>MCQ</Badge> 5 Multiple Choice
                      </h4>
                      <div className="space-y-2 pl-4">
                        {td.mcq.map((q, i) => (
                          <div key={i} className="text-sm p-2 rounded border bg-muted/30">
                            <p>{q.question_text}</p>
                            <div className="flex gap-1 mt-1">
                              <Badge variant="outline" className="text-xs capitalize">{q.bloom_level}</Badge>
                              <Badge variant="outline" className="text-xs capitalize">{q.difficulty}</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Fill in the blank */}
                    <div>
                      <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                        <Badge>Fill-in</Badge> 5 Fill in the Blank
                      </h4>
                      <div className="space-y-2 pl-4">
                        {td.fill_blank.map((q, i) => (
                          <div key={i} className="text-sm p-2 rounded border bg-muted/30">
                            <p>{q.question_text}</p>
                            <div className="flex gap-1 mt-1">
                              <Badge variant="outline" className="text-xs capitalize">{q.bloom_level}</Badge>
                              <Badge variant="outline" className="text-xs capitalize">{q.difficulty}</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* True/False */}
                    <div>
                      <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                        <Badge>T/F</Badge> 5 True or False
                      </h4>
                      <div className="space-y-2 pl-4">
                        {td.true_false.map((q, i) => (
                          <div key={i} className="text-sm p-2 rounded border bg-muted/30">
                            <p>{q.question_text}</p>
                            <div className="flex gap-1 mt-1">
                              <Badge variant="outline" className="text-xs capitalize">{q.bloom_level}</Badge>
                              <Badge variant="outline" className="text-xs capitalize">{q.difficulty}</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Essay */}
                    <div>
                      <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                        <Badge>Essay</Badge> 5 Essay Questions
                      </h4>
                      <div className="space-y-2 pl-4">
                        {td.essay.map((q, i) => (
                          <div key={i} className="text-sm p-2 rounded border bg-muted/30">
                            <p>{q.question_text}</p>
                            <div className="flex gap-1 mt-1">
                              <Badge variant="outline" className="text-xs capitalize">{q.bloom_level}</Badge>
                              <Badge variant="outline" className="text-xs capitalize">{q.difficulty}</Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>

          {/* Save Button */}
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={() => setStep(1)}>
              <ChevronLeft className="h-4 w-4 mr-1" /> Back to Topics
            </Button>
            <Button className="flex-1" size="lg" onClick={handleSaveAllQuestions} disabled={saving}>
              {saving ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Saving...</>
              ) : (
                <><CheckCircle className="mr-2 h-4 w-4" /> Save {generatedData.length * 20} Questions to Bank</>
              )}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
