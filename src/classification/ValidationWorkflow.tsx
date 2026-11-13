import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { CircleCheck as CheckCircle, Circle as XCircle, Clock, Brain, User, MessageSquare, Target, TriangleAlert as AlertTriangle, History } from 'lucide-react';
import { useClassificationValidation } from '@/hooks/useClassificationValidation';
import { ClassificationConfidence } from './ClassificationConfidence';
import { toast } from 'sonner';

interface ValidationWorkflowProps {
  questionId?: string;
  onValidationComplete?: () => void;
  showPendingQueue?: boolean;
}

export const ValidationWorkflow: React.FC<ValidationWorkflowProps> = ({
  questionId,
  onValidationComplete,
  showPendingQueue = true
}) => {
  const [selectedQuestionId, setSelectedQuestionId] = useState<string>(questionId || '');
  const [validationForm, setValidationForm] = useState({
    bloom_level: '',
    knowledge_dimension: '',
    difficulty: '',
    confidence: 0.95,
    notes: ''
  });
  const [showHistory, setShowHistory] = useState(false);
  const [validationHistory, setValidationHistory] = useState<any[]>([]);

  const {
    pendingValidations,
    completedValidations,
    loading,
    error,
    stats,
    submitValidation,
    rejectValidation,
    getValidationHistory,
    refresh
  } = useClassificationValidation();

  useEffect(() => {
    if (selectedQuestionId) {
      loadValidationHistory();
    }
  }, [selectedQuestionId]);

  const loadValidationHistory = async () => {
    if (!selectedQuestionId) return;
    
    try {
      const history = await getValidationHistory(selectedQuestionId);
      setValidationHistory(history);
    } catch (error) {
      console.error('Error loading validation history:', error);
    }
  };

  const handleValidationSubmit = async () => {
    if (!selectedQuestionId) {
      toast.error('Please select a question to validate');
      return;
    }

    if (!validationForm.bloom_level || !validationForm.knowledge_dimension || !validationForm.difficulty) {
      toast.error('Please fill in all classification fields');
      return;
    }

    try {
      // Find the original classification
      const pendingValidation = pendingValidations.find(v => v.question_id === selectedQuestionId);
      
      const validationResult = {
        validated_classification: {
          bloom_level: validationForm.bloom_level,
          knowledge_dimension: validationForm.knowledge_dimension,
          difficulty: validationForm.difficulty
        },
        validation_confidence: validationForm.confidence,
        notes: validationForm.notes,
        changes_made: []
      };

      // Track what changed
      if (pendingValidation) {
        if (pendingValidation.original_classification.bloom_level !== validationForm.bloom_level) {
          validationResult.changes_made.push('bloom_level');
        }
        if (pendingValidation.original_classification.knowledge_dimension !== validationForm.knowledge_dimension) {
          validationResult.changes_made.push('knowledge_dimension');
        }
        if (pendingValidation.original_classification.difficulty !== validationForm.difficulty) {
          validationResult.changes_made.push('difficulty');
        }
      }

      await submitValidation(selectedQuestionId, validationResult);
      
      // Reset form
      setValidationForm({
        bloom_level: '',
        knowledge_dimension: '',
        difficulty: '',
        confidence: 0.95,
        notes: ''
      });
      
      onValidationComplete?.();
    } catch (error) {
      console.error('Validation submission error:', error);
    }
  };

  const handleRejectClassification = async () => {
    if (!selectedQuestionId) return;

    const reason = validationForm.notes || 'Classification rejected by teacher';
    
    try {
      await rejectValidation(selectedQuestionId, reason);
      onValidationComplete?.();
    } catch (error) {
      console.error('Rejection error:', error);
    }
  };

  const loadQuestionForValidation = (validation: any) => {
    setSelectedQuestionId(validation.question_id);
    setValidationForm({
      bloom_level: validation.original_classification.bloom_level,
      knowledge_dimension: validation.original_classification.knowledge_dimension,
      difficulty: validation.original_classification.difficulty,
      confidence: 0.95,
      notes: ''
    });
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="p-6 text-center">
          <Clock className="w-8 h-8 animate-spin mx-auto mb-2" />
          <p>Loading validation workflow...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Validation Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-primary">{stats.totalValidations}</div>
            <div className="text-sm text-muted-foreground">Total Validations</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-600">
              {(stats.accuracyRate * 100).toFixed(1)}%
            </div>
            <div className="text-sm text-muted-foreground">Accuracy Rate</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">
              +{(stats.avgConfidenceImprovement * 100).toFixed(1)}%
            </div>
            <div className="text-sm text-muted-foreground">Avg. Confidence Boost</div>
          </CardContent>
        </Card>
      </div>

      {/* Pending Validations Queue */}
      {showPendingQueue && pendingValidations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Clock className="w-5 h-5" />
              Pending Validations ({pendingValidations.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {pendingValidations.map((validation) => (
                <div key={validation.id} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <p className="font-medium mb-2">{validation.question_text}</p>
                      <div className="flex gap-2 mb-2">
                        <Badge variant="outline">{validation.original_classification.bloom_level}</Badge>
                        <Badge variant="outline">{validation.original_classification.knowledge_dimension}</Badge>
                        <Badge variant="outline">{validation.original_classification.difficulty}</Badge>
                        <Badge variant="secondary">
                          {(validation.original_classification.confidence * 100).toFixed(0)}% confidence
                        </Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">
                        Requested: {new Date(validation.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Button
                      onClick={() => loadQuestionForValidation(validation)}
                      size="sm"
                      variant="outline"
                    >
                      Review
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Validation Form */}
      {selectedQuestionId && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5" />
              Validate Classification
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Current Classification */}
            <div className="p-4 bg-muted/30 rounded-lg">
              <h4 className="font-semibold mb-2">AI Classification:</h4>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <Badge variant="outline">
                  Bloom's: {validationForm.bloom_level}
                </Badge>
                <Badge variant="outline">
                  Knowledge: {validationForm.knowledge_dimension}
                </Badge>
                <Badge variant="outline">
                  Difficulty: {validationForm.difficulty}
                </Badge>
              </div>
            </div>

            {/* Validation Form */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="text-sm font-medium mb-2 block">Bloom's Level</label>
                <Select 
                  value={validationForm.bloom_level} 
                  onValueChange={(value) => setValidationForm(prev => ({ ...prev, bloom_level: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select level" />
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
                <label className="text-sm font-medium mb-2 block">Knowledge Dimension</label>
                <Select 
                  value={validationForm.knowledge_dimension} 
                  onValueChange={(value) => setValidationForm(prev => ({ ...prev, knowledge_dimension: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select dimension" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="factual">Factual</SelectItem>
                    <SelectItem value="conceptual">Conceptual</SelectItem>
                    <SelectItem value="procedural">Procedural</SelectItem>
                    <SelectItem value="metacognitive">Metacognitive</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <label className="text-sm font-medium mb-2 block">Difficulty</label>
                <Select 
                  value={validationForm.difficulty} 
                  onValueChange={(value) => setValidationForm(prev => ({ ...prev, difficulty: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select difficulty" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="easy">Easy</SelectItem>
                    <SelectItem value="average">Average</SelectItem>
                    <SelectItem value="difficult">Difficult</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Validation Notes */}
            <div>
              <label className="text-sm font-medium mb-2 block">Validation Notes</label>
              <Textarea
                value={validationForm.notes}
                onChange={(e) => setValidationForm(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Optional notes about your validation decision..."
                className="min-h-[80px]"
              />
            </div>

            {/* Validation History */}
            {validationHistory.length > 0 && (
              <div>
                <Button
                  onClick={() => setShowHistory(!showHistory)}
                  variant="outline"
                  size="sm"
                  className="mb-3"
                >
                  <History className="w-4 h-4 mr-2" />
                  {showHistory ? 'Hide' : 'Show'} Validation History
                </Button>
                
                {showHistory && (
                  <div className="space-y-2 max-h-40 overflow-y-auto">
                    {validationHistory.map((validation, index) => (
                      <div key={index} className="p-3 border rounded-lg text-sm">
                        <div className="flex justify-between items-start mb-1">
                          <span className="font-medium">
                            {validation.profiles?.full_name || 'Unknown Validator'}
                          </span>
                          <span className="text-muted-foreground">
                            {new Date(validation.created_at).toLocaleDateString()}
                          </span>
                        </div>
                        {validation.notes && (
                          <p className="text-muted-foreground">{validation.notes}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4 border-t">
              <Button 
                onClick={handleValidationSubmit}
                className="flex-1"
                disabled={!validationForm.bloom_level || !validationForm.knowledge_dimension || !validationForm.difficulty}
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Validate Classification
              </Button>
              <Button 
                onClick={handleRejectClassification}
                variant="destructive"
                className="flex-1"
              >
                <XCircle className="w-4 h-4 mr-2" />
                Reject & Flag for Review
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* No Pending Validations */}
      {showPendingQueue && pendingValidations.length === 0 && !selectedQuestionId && (
        <Card>
          <CardContent className="p-12 text-center">
            <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">All Caught Up!</h3>
            <p className="text-muted-foreground mb-4">
              No questions pending validation at this time.
            </p>
            <Button onClick={refresh} variant="outline">
              <Clock className="w-4 h-4 mr-2" />
              Check for New Requests
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Error State */}
      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            Validation workflow error: {error}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
};