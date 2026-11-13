import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { 
  Brain, 
  CheckCircle, 
  AlertTriangle, 
  Target, 
  Sparkles,
  Eye,
  Save,
  RefreshCw
} from 'lucide-react';
import { useEnhancedClassification } from '@/hooks/useEnhancedClassification';
import { TaxonomyMatrix } from '@/components/classification/TaxonomyMatrix';
import { toast } from 'sonner';

interface EnhancedQuestionFormProps {
  onSave: (question: any) => void;
  onCancel: () => void;
  existingQuestion?: any;
}

export const EnhancedQuestionForm: React.FC<EnhancedQuestionFormProps> = ({
  onSave,
  onCancel,
  existingQuestion
}) => {
  const [formData, setFormData] = useState({
    question_text: '',
    question_type: 'mcq' as 'mcq' | 'essay' | 'true_false' | 'short_answer',
    topic: '',
    choices: ['', '', '', ''],
    correct_answer: '',
    bloom_level: '',
    difficulty: '',
    knowledge_dimension: ''
  });

  const [showMatrix, setShowMatrix] = useState(false);
  const [saving, setSaving] = useState(false);

  const {
    result: classification,
    loading: classifying,
    error: classificationError,
    similarQuestions,
    validationStatus,
    qualityIssues,
    classifyQuestion,
    validateClassification,
    checkQuestionSimilarity,
    isHighQuality,
    isHighConfidence,
    hasIssues,
    needsReview
  } = useEnhancedClassification(
    formData.question_text ? {
      text: formData.question_text,
      type: formData.question_type,
      topic: formData.topic,
      choices: formData.question_type === 'mcq' ? 
        formData.choices.reduce((acc, choice, index) => {
          if (choice.trim()) {
            acc[String.fromCharCode(65 + index)] = choice.trim();
          }
          return acc;
        }, {} as Record<string, string>) : undefined
    } : null,
    {
      autoClassify: true,
      checkSimilarity: true,
      similarityThreshold: 0.7,
      qualityThreshold: 0.6
    }
  );

  useEffect(() => {
    if (existingQuestion) {
      setFormData({
        question_text: existingQuestion.question_text || '',
        question_type: existingQuestion.question_type || 'mcq',
        topic: existingQuestion.topic || '',
        choices: existingQuestion.choices ? Object.values(existingQuestion.choices) : ['', '', '', ''],
        correct_answer: existingQuestion.correct_answer || '',
        bloom_level: existingQuestion.bloom_level || '',
        difficulty: existingQuestion.difficulty || '',
        knowledge_dimension: existingQuestion.knowledge_dimension || ''
      });
    }
  }, [existingQuestion]);

  // Auto-update classification results to form
  useEffect(() => {
    if (classification && !formData.bloom_level) {
      setFormData(prev => ({
        ...prev,
        bloom_level: classification.bloom_level,
        difficulty: classification.difficulty,
        knowledge_dimension: classification.knowledge_dimension
      }));
    }
  }, [classification, formData.bloom_level]);

  const handleManualClassify = async () => {
    if (!formData.question_text.trim()) {
      toast.error('Please enter a question first');
      return;
    }

    await classifyQuestion({
      text: formData.question_text,
      type: formData.question_type,
      topic: formData.topic,
      choices: formData.question_type === 'mcq' ? 
        formData.choices.reduce((acc, choice, index) => {
          if (choice.trim()) {
            acc[String.fromCharCode(65 + index)] = choice.trim();
          }
          return acc;
        }, {} as Record<string, string>) : undefined
    });
  };

  const handleValidateClassification = async () => {
    if (!classification) return;

    await validateClassification();
  };

  const updateChoice = (index: number, value: string) => {
    const newChoices = [...formData.choices];
    newChoices[index] = value;
    setFormData(prev => ({ ...prev, choices: newChoices }));
  };

  const addChoice = () => {
    if (formData.choices.length < 6) {
      setFormData(prev => ({ 
        ...prev, 
        choices: [...prev.choices, ''] 
      }));
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

    if (hasIssues && validationStatus !== 'validated') {
      toast.error('Please resolve quality issues or validate the classification');
      return;
    }

    setSaving(true);
    try {
      const questionData = {
        question_text: formData.question_text,
        question_type: formData.question_type,
        topic: formData.topic,
        bloom_level: formData.bloom_level || classification?.bloom_level,
        difficulty: formData.difficulty || classification?.difficulty,
        knowledge_dimension: formData.knowledge_dimension || classification?.knowledge_dimension,
        choices: formData.question_type === 'mcq' ? 
          formData.choices.reduce((acc, choice, index) => {
            if (choice.trim()) {
              acc[String.fromCharCode(65 + index)] = choice.trim();
            }
            return acc;
          }, {} as Record<string, string>) : null,
        correct_answer: formData.correct_answer,
        created_by: 'teacher',
        approved: isHighQuality && isHighConfidence,
        ai_confidence_score: classification?.confidence || 0.5,
        quality_score: classification?.quality_score || 0.7,
        readability_score: classification?.readability_score || 8.0,
        needs_review: needsReview,
        validation_status: validationStatus
      };

      onSave(questionData);
      toast.success('Question saved successfully!');
    } catch (error) {
      console.error('Error saving question:', error);
      toast.error('Failed to save question');
    } finally {
      setSaving(false);
    }
  };

  const getQualityColor = () => {
    if (!classification) return 'text-muted-foreground';
    if (classification.quality_score >= 0.8) return 'text-green-600';
    if (classification.quality_score >= 0.6) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getConfidenceColor = () => {
    if (!classification) return 'text-muted-foreground';
    if (classification.confidence >= 0.8) return 'text-green-600';
    if (classification.confidence >= 0.6) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="space-y-6">
      <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="w-6 h-6 text-primary" />
            Enhanced Question Builder
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Question Input */}
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="topic">Topic</Label>
                <Input
                  id="topic"
                  value={formData.topic}
                  onChange={(e) => setFormData(prev => ({ ...prev, topic: e.target.value }))}
                  placeholder="Enter topic"
                />
              </div>
              <div>
                <Label htmlFor="questionType">Question Type</Label>
                <select
                  id="questionType"
                  value={formData.question_type}
                  onChange={(e) => setFormData(prev => ({ ...prev, question_type: e.target.value as any }))}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="mcq">Multiple Choice</option>
                  <option value="essay">Essay</option>
                  <option value="true_false">True/False</option>
                  <option value="short_answer">Short Answer</option>
                </select>
              </div>
            </div>

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

            {/* MCQ Choices */}
            {formData.question_type === 'mcq' && (
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <Label>Answer Choices</Label>
                  <Button onClick={addChoice} variant="outline" size="sm" disabled={formData.choices.length >= 6}>
                    Add Choice
                  </Button>
                </div>
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
                        className="hover:bg-destructive/10 hover:text-destructive"
                      >
                        ×
                      </Button>
                    )}
                  </div>
                ))}
                <div>
                  <Label htmlFor="correctAnswer">Correct Answer</Label>
                  <Input
                    id="correctAnswer"
                    value={formData.correct_answer}
                    onChange={(e) => setFormData(prev => ({ ...prev, correct_answer: e.target.value }))}
                    placeholder="Enter the correct answer"
                  />
                </div>
              </div>
            )}
          </div>

          <Separator />

          {/* AI Classification Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <Sparkles className="w-5 h-5 text-primary" />
                  AI Classification & Quality Analysis
                </h3>
                <p className="text-sm text-muted-foreground">
                  Advanced ML-powered analysis with quality assessment
                </p>
              </div>
              <div className="flex gap-2">
                <Button 
                  onClick={handleManualClassify}
                  disabled={classifying || !formData.question_text.trim()}
                  variant="outline"
                  size="sm"
                >
                  {classifying ? (
                    <>
                      <Brain className="w-4 h-4 mr-2 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2" />
                      Re-analyze
                    </>
                  )}
                </Button>
                <Button 
                  onClick={() => setShowMatrix(!showMatrix)}
                  variant="outline"
                  size="sm"
                >
                  <Target className="w-4 h-4 mr-2" />
                  {showMatrix ? 'Hide' : 'Show'} Matrix
                </Button>
              </div>
            </div>

            {/* Classification Results */}
            {classification && (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card className="border-2 border-primary/20">
                  <CardContent className="p-4 text-center">
                    <div className="text-lg font-bold text-primary mb-1">
                      {classification.bloom_level.charAt(0).toUpperCase() + classification.bloom_level.slice(1)}
                    </div>
                    <div className="text-sm text-muted-foreground">Bloom's Level</div>
                    <Progress value={classification.confidence * 100} className="h-1 mt-2" />
                  </CardContent>
                </Card>

                <Card className="border-2 border-secondary/20">
                  <CardContent className="p-4 text-center">
                    <div className="text-lg font-bold text-secondary mb-1">
                      {classification.knowledge_dimension.charAt(0).toUpperCase() + classification.knowledge_dimension.slice(1)}
                    </div>
                    <div className="text-sm text-muted-foreground">Knowledge Type</div>
                    <Progress value={classification.confidence * 100} className="h-1 mt-2" />
                  </CardContent>
                </Card>

                <Card className="border-2 border-accent/20">
                  <CardContent className="p-4 text-center">
                    <div className="text-lg font-bold text-accent mb-1">
                      {classification.difficulty.charAt(0).toUpperCase() + classification.difficulty.slice(1)}
                    </div>
                    <div className="text-sm text-muted-foreground">Difficulty</div>
                    <Progress value={classification.confidence * 100} className="h-1 mt-2" />
                  </CardContent>
                </Card>

                <Card className="border-2 border-green-200">
                  <CardContent className="p-4 text-center">
                    <div className={`text-lg font-bold mb-1 ${getQualityColor()}`}>
                      {(classification.quality_score * 100).toFixed(0)}%
                    </div>
                    <div className="text-sm text-muted-foreground">Quality Score</div>
                    <Progress value={classification.quality_score * 100} className="h-1 mt-2" />
                  </CardContent>
                </Card>
              </div>
            )}

            {/* Quality Issues */}
            {qualityIssues.length > 0 && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-1">
                    <p className="font-medium">Quality Issues Detected:</p>
                    <ul className="list-disc list-inside space-y-1">
                      {qualityIssues.map((issue, index) => (
                        <li key={index} className="text-sm">{issue}</li>
                      ))}
                    </ul>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {/* Similar Questions Warning */}
            {similarQuestions.length > 0 && (
              <Alert>
                <Eye className="h-4 w-4" />
                <AlertDescription>
                  <div className="space-y-2">
                    <p className="font-medium">Similar Questions Found:</p>
                    <div className="space-y-1">
                      {similarQuestions.slice(0, 3).map((similar, index) => (
                        <div key={index} className="text-sm p-2 bg-muted rounded">
                          <div className="flex justify-between items-start">
                            <span className="flex-1">{similar.text.substring(0, 80)}...</span>
                            <Badge variant="outline" className="ml-2">
                              {(similar.similarity * 100).toFixed(0)}%
                            </Badge>
                          </div>
                        </div>
                      ))}
                      {similarQuestions.length > 3 && (
                        <p className="text-sm text-muted-foreground">
                          +{similarQuestions.length - 3} more similar questions
                        </p>
                      )}
                    </div>
                  </div>
                </AlertDescription>
              </Alert>
            )}

            {/* Classification Confidence */}
            {classification && (
              <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${
                    isHighConfidence ? 'bg-green-100 text-green-600' : 
                    classification.confidence >= 0.6 ? 'bg-yellow-100 text-yellow-600' : 
                    'bg-red-100 text-red-600'
                  }`}>
                    {isHighConfidence ? <CheckCircle className="w-4 h-4" /> : <AlertTriangle className="w-4 h-4" />}
                  </div>
                  <div>
                    <div className="font-medium">
                      AI Confidence: {(classification.confidence * 100).toFixed(1)}%
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {isHighConfidence ? 'High confidence classification' : 'Manual review recommended'}
                    </div>
                  </div>
                </div>
                
                {needsReview && validationStatus === 'pending' && (
                  <Button onClick={handleValidateClassification} size="sm">
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Validate
                  </Button>
                )}
              </div>
            )}
          </div>

          {/* Taxonomy Matrix */}
          {showMatrix && (
            <div>
              <Separator />
              <TaxonomyMatrix 
                questions={[]} // Would pass relevant questions
                onCellClick={(bloom, knowledge) => {
                  setFormData(prev => ({
                    ...prev,
                    bloom_level: bloom,
                    knowledge_dimension: knowledge
                  }));
                }}
                showQualityIndicators={true}
                interactive={true}
              />
            </div>
          )}

          {/* Manual Classification Override */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">Manual Classification (Optional)</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="bloomLevel">Bloom's Level</Label>
                <select
                  id="bloomLevel"
                  value={formData.bloom_level}
                  onChange={(e) => setFormData(prev => ({ ...prev, bloom_level: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="">Auto-detect</option>
                  <option value="remembering">Remembering</option>
                  <option value="understanding">Understanding</option>
                  <option value="applying">Applying</option>
                  <option value="analyzing">Analyzing</option>
                  <option value="evaluating">Evaluating</option>
                  <option value="creating">Creating</option>
                </select>
              </div>

              <div>
                <Label htmlFor="difficulty">Difficulty</Label>
                <select
                  id="difficulty"
                  value={formData.difficulty}
                  onChange={(e) => setFormData(prev => ({ ...prev, difficulty: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="">Auto-detect</option>
                  <option value="easy">Easy</option>
                  <option value="average">Average</option>
                  <option value="difficult">Difficult</option>
                </select>
              </div>

              <div>
                <Label htmlFor="knowledgeDimension">Knowledge Dimension</Label>
                <select
                  id="knowledgeDimension"
                  value={formData.knowledge_dimension}
                  onChange={(e) => setFormData(prev => ({ ...prev, knowledge_dimension: e.target.value }))}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="">Auto-detect</option>
                  <option value="factual">Factual</option>
                  <option value="conceptual">Conceptual</option>
                  <option value="procedural">Procedural</option>
                  <option value="metacognitive">Metacognitive</option>
                </select>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4 border-t">
            <Button 
              onClick={handleSave}
              disabled={saving || classifying}
              className="bg-gradient-primary hover:shadow-glow"
            >
              <Save className="w-4 h-4 mr-2" />
              {saving ? 'Saving...' : 'Save Question'}
            </Button>
            <Button variant="outline" onClick={onCancel}>
              Cancel
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};