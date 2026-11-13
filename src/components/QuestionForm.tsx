import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Plus, Trash2, Save, Target, FileText, Sparkles, Brain } from 'lucide-react';
import { Questions } from '@/services/db/questions';
import { EdgeFunctions } from '@/services/edgeFunctions';
import { classifyQuestion } from '@/services/ai/classify';
import { TaxonomyMatrixSelector } from '@/components/classification/TaxonomyMatrixSelector';
import { toast } from 'sonner';
import { useAcademicHierarchy } from '@/hooks/useAcademicHierarchy';

interface QuestionFormProps {
  onSave: (question: any) => void;
  onCancel: () => void;
  existingQuestion?: any;
}

export const QuestionForm: React.FC<QuestionFormProps> = ({
  onSave,
  onCancel,
  existingQuestion
}) => {
  const [formData, setFormData] = useState({
    question_text: '',
    question_type: 'mcq',
    topic: '',
    bloom_level: 'remembering',
    difficulty: 'easy',
    knowledge_dimension: 'factual',
    choices: ['', '', '', ''],
    correct_answer: '',
    created_by: 'teacher',
    approved: true,
    needs_review: false,
    ai_confidence_score: 1.0
  });

  const [saving, setSaving] = useState(false);
  const [classifying, setClassifying] = useState(false);
  const [subjectId, setSubjectId] = useState('');
  const hierarchy = useAcademicHierarchy();
  const selectedSubject = hierarchy.allSubjects.find((subject) => subject.id === subjectId);

  useEffect(() => {
    if (existingQuestion) {
      const existingSubject = hierarchy.allSubjects.find((subject) => subject.code === existingQuestion.subject_code);
      setSubjectId(existingSubject?.id || '');
      setFormData({
        question_text: existingQuestion.question_text || '',
        question_type: existingQuestion.question_type || 'mcq',
        topic: existingQuestion.topic || '',
        bloom_level: existingQuestion.bloom_level || 'remembering',
        difficulty: existingQuestion.difficulty || 'easy',
        knowledge_dimension: existingQuestion.knowledge_dimension || 'factual',
        choices: existingQuestion.choices ? Object.values(existingQuestion.choices) : ['', '', '', ''],
        correct_answer: existingQuestion.correct_answer || '',
        created_by: existingQuestion.created_by || 'teacher',
        approved: existingQuestion.approved ?? true,
        needs_review: existingQuestion.needs_review ?? false,
        ai_confidence_score: existingQuestion.ai_confidence_score ?? 1.0
      });
    }
  }, [existingQuestion, hierarchy.allSubjects]);

  const handleAutoClassify = async () => {
    if (!formData.question_text.trim()) {
      toast.error('Please enter a question first');
      return;
    }

    setClassifying(true);
    try {
      const classification = await EdgeFunctions.classifySingleQuestion(
        formData.question_text,
        formData.question_type,
        formData.topic
      );

      setFormData(prev => ({
        ...prev,
        bloom_level: classification.bloom_level,
        difficulty: classification.difficulty,
        knowledge_dimension: classification.knowledge_dimension,
        ai_confidence_score: classification.confidence,
        needs_review: classification.needs_review
      }));

      toast.success(`Question classified with ${(classification.confidence * 100).toFixed(0)}% confidence`);
    } catch (error) {
      console.error('Auto-classification error:', error);
      
      // Fallback to local classification
      try {
        const localClassification = classifyQuestion(
          formData.question_text,
          formData.question_type as any,
          formData.topic
        );

        setFormData(prev => ({
          ...prev,
          bloom_level: localClassification.bloom_level,
          difficulty: localClassification.difficulty,
          knowledge_dimension: localClassification.knowledge_dimension,
          ai_confidence_score: localClassification.confidence,
          needs_review: localClassification.needs_review
        }));

        toast.success(`Question classified locally with ${(localClassification.confidence * 100).toFixed(0)}% confidence`);
      } catch (localError) {
        toast.error('Classification failed. Please set categories manually.');
      }
    } finally {
      setClassifying(false);
    }
  };

  const updateChoice = (index: number, value: string) => {
    const newChoices = [...formData.choices];
    newChoices[index] = value;
    setFormData(prev => ({ ...prev, choices: newChoices }));
  };

  const addChoice = () => {
    if (formData.choices.length < 6) {
      setFormData(prev => ({ ...prev, choices: [...prev.choices, ''] }));
    }
  };

  const removeChoice = (index: number) => {
    if (formData.choices.length > 2) {
      const newChoices = formData.choices.filter((_, i) => i !== index);
      setFormData(prev => ({ ...prev, choices: newChoices }));
    }
  };

  const handleSave = async () => {
    // Validation
    if (!formData.question_text.trim()) {
      toast.error('Please enter a question');
      return;
    }

    if (!formData.topic.trim()) {
      toast.error('Please enter a topic');
      return;
    }
    if (!selectedSubject) {
      toast.error('Select a registered academic subject before saving this question');
      return;
    }

    // Validate multiple choice questions
    if (formData.question_type === 'mcq') {
      const validChoices = formData.choices.filter(choice => choice.trim());
      if (validChoices.length < 2) {
        toast.error('Multiple choice questions need at least 2 choices');
        return;
      }
      if (!formData.correct_answer.trim()) {
        toast.error('Please specify the correct answer');
        return;
      }
    }

    setSaving(true);
    try {
      // Prepare question data
      const questionData = {
        question_text: formData.question_text,
        question_type: formData.question_type,
        topic: formData.topic,
        bloom_level: formData.bloom_level,
        difficulty: formData.difficulty,
        knowledge_dimension: formData.knowledge_dimension,
        category: selectedSubject.category_name || '',
        specialization: selectedSubject.specialization_name || '',
        subject: `${selectedSubject.code} - ${selectedSubject.description}`,
        subject_code: selectedSubject.code,
        subject_description: selectedSubject.description,
        metadata: { academic_subject_id: selectedSubject.id },
        choices: formData.question_type === 'mcq' 
          ? formData.choices.reduce((acc, choice, index) => {
              if (choice.trim()) {
                acc[String.fromCharCode(65 + index)] = choice.trim();
              }
              return acc;
            }, {} as Record<string, string>)
          : null,
        correct_answer: formData.question_type === 'mcq' ? formData.correct_answer : null,
        created_by: formData.created_by,
        approved: formData.approved,
        ai_confidence_score: formData.ai_confidence_score,
        needs_review: formData.needs_review
      };

      if (existingQuestion) {
        // Update existing question
        const updatedQuestion = await Questions.update(existingQuestion.id, questionData);
        toast.success('Question updated successfully!');
        onSave(updatedQuestion);
      } else {
        // Create new question
        const newQuestion = await Questions.create(questionData);
        toast.success('Question created successfully!');
        onSave(newQuestion);
      }

    } catch (error) {
      console.error('Error saving question:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to save question');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="bg-card/80 backdrop-blur-sm border border-border/50 shadow-elegant">
      <CardHeader className="border-b border-border/50">
        <CardTitle className="flex items-center gap-2">
          <FileText className="w-6 h-6 text-primary" />
          {existingQuestion ? 'Edit Question' : 'Create New Question'}
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-6 p-6">
        <div>
          <Label htmlFor="registered-question-subject">Registered academic subject</Label>
          <Select value={subjectId} onValueChange={setSubjectId}>
            <SelectTrigger id="registered-question-subject">
              <SelectValue placeholder="Select a subject" />
            </SelectTrigger>
            <SelectContent>
              {hierarchy.allSubjects.map((subject) => (
                <SelectItem key={subject.id} value={subject.id}>
                  {subject.code} - {subject.description}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        {/* Basic Question Info */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="questionType">Question Type</Label>
            <Select 
              value={formData.question_type} 
              onValueChange={(value) => setFormData(prev => ({ ...prev, question_type: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="mcq">Multiple Choice</SelectItem>
                <SelectItem value="true_false">True/False</SelectItem>
                <SelectItem value="essay">Essay</SelectItem>
                <SelectItem value="short_answer">Short Answer</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <Label htmlFor="topic">Topic</Label>
            <Input
              id="topic"
              value={formData.topic}
              onChange={(e) => setFormData(prev => ({ ...prev, topic: e.target.value }))}
              placeholder="Enter topic"
            />
          </div>
        </div>

        {/* Taxonomy Classification Section */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-semibold">Educational Classification</h3>
              <p className="text-sm text-muted-foreground">
                Classify using AI, matrix selector, or manual dropdowns
              </p>
            </div>
            <Button 
              onClick={handleAutoClassify}
              disabled={classifying || !formData.question_text.trim()}
              variant="outline"
              size="sm"
            >
              {classifying ? (
                <>
                  <Brain className="w-4 h-4 mr-2 animate-spin" />
                  Classifying...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-2" />
                  Auto-Classify
                </>
              )}
            </Button>
          </div>
          
          {formData.ai_confidence_score < 1.0 && (
            <div className="flex items-center gap-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <Brain className="w-4 h-4 text-blue-600" />
              <span className="text-sm text-blue-700">
                AI Confidence: {(formData.ai_confidence_score * 100).toFixed(0)}%
                {formData.needs_review && ' - Needs Review'}
              </span>
            </div>
          )}

          <Tabs defaultValue="matrix" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="matrix">Matrix Selector</TabsTrigger>
              <TabsTrigger value="manual">Manual Selection</TabsTrigger>
            </TabsList>
            
            <TabsContent value="matrix" className="mt-4">
              <TaxonomyMatrixSelector
                selectedBloom={formData.bloom_level}
                selectedKnowledge={formData.knowledge_dimension}
                onSelect={(bloom, knowledge) => {
                  setFormData(prev => ({
                    ...prev,
                    bloom_level: bloom,
                    knowledge_dimension: knowledge
                  }));
                }}
              />
            </TabsContent>
            
            <TabsContent value="manual" className="mt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="bloomLevel">Bloom's Cognitive Level</Label>
                  <Select 
                    value={formData.bloom_level} 
                    onValueChange={(value) => setFormData(prev => ({ ...prev, bloom_level: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="remembering">Remembering</SelectItem>
                      <SelectItem value="understanding">Understanding</SelectItem>
                      <SelectItem value="applying">Applying</SelectItem>
                      <SelectItem value="analyzing">Analyzing</SelectItem>
                      <SelectItem value="evaluating">Evaluating</SelectItem>
                      <SelectItem value="creating">Creating</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="knowledgeDimension">Knowledge Dimension</Label>
                  <Select 
                    value={formData.knowledge_dimension} 
                    onValueChange={(value) => setFormData(prev => ({ ...prev, knowledge_dimension: value }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="factual">Factual</SelectItem>
                      <SelectItem value="conceptual">Conceptual</SelectItem>
                      <SelectItem value="procedural">Procedural</SelectItem>
                      <SelectItem value="metacognitive">Metacognitive</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </TabsContent>
          </Tabs>

          <div>
            <Label htmlFor="difficulty">Difficulty Level</Label>
            <Select 
              value={formData.difficulty} 
              onValueChange={(value) => setFormData(prev => ({ ...prev, difficulty: value }))}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="easy">Easy</SelectItem>
                <SelectItem value="average">Average</SelectItem>
                <SelectItem value="difficult">Difficult</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Question Text */}
        <div>
          <Label htmlFor="questionText">Question Text</Label>
          <Textarea
            id="questionText"
            value={formData.question_text}
            onChange={(e) => setFormData(prev => ({ ...prev, question_text: e.target.value }))}
            placeholder="Enter your question here..."
            className="min-h-[120px]"
          />
        </div>

        {/* Multiple Choice Options */}
        {formData.question_type === 'mcq' && (
          <div>
            <div className="flex justify-between items-center mb-4">
              <Label>Answer Choices</Label>
              <Button onClick={addChoice} variant="outline" size="sm" disabled={formData.choices.length >= 6}>
                <Plus className="w-4 h-4 mr-2" />
                Add Choice
              </Button>
            </div>
            
            <div className="space-y-3">
              {formData.choices.map((choice, index) => (
                <div key={index} className="flex gap-3 items-center">
                  <span className="text-sm font-medium min-w-[20px]">
                    {String.fromCharCode(65 + index)}.
                  </span>
                  <Input
                    value={choice}
                    onChange={(e) => updateChoice(index, e.target.value)}
                    placeholder={`Choice ${String.fromCharCode(65 + index)}`}
                    className="flex-1"
                  />
                  {formData.choices.length > 2 && (
                    <Button
                      onClick={() => removeChoice(index)}
                      variant="outline"
                      size="sm"
                      className="hover:bg-destructive/10 hover:text-destructive hover:border-destructive/20"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>

            <div className="mt-4">
              <Label htmlFor="correctAnswer">Correct Answer</Label>
              <Input
                id="correctAnswer"
                value={formData.correct_answer}
                onChange={(e) => setFormData(prev => ({ ...prev, correct_answer: e.target.value }))}
                placeholder="Enter the correct answer exactly as written above"
              />
            </div>
          </div>
        )}

        {/* True/False Options */}
        {formData.question_type === 'true_false' && (
          <div>
            <Label>Correct Answer</Label>
            <Select 
              value={formData.correct_answer} 
              onValueChange={(value) => setFormData(prev => ({ ...prev, correct_answer: value }))}
            >
              <SelectTrigger>
                <SelectValue placeholder="Select correct answer" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="True">True</SelectItem>
                <SelectItem value="False">False</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex gap-3 pt-4 border-t border-border/50">
          <Button 
            onClick={handleSave}
            disabled={saving}
            className="bg-gradient-primary hover:shadow-glow btn-hover focus-ring"
          >
            <Save className="w-4 h-4 mr-2" />
            {saving ? 'Saving...' : (existingQuestion ? 'Update Question' : 'Create Question')}
          </Button>
          <Button variant="outline" onClick={onCancel} className="focus-ring">
            Cancel
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};