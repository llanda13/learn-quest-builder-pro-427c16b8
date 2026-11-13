import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Brain, CircleCheck as CheckCircle, TriangleAlert as AlertTriangle, Info, TrendingUp, Target, ChevronDown, ChevronUp } from 'lucide-react';
import { ConfidenceResult } from '@/services/ai/confidenceScoring';
import { ClassificationExplanation } from '@/services/ai/explainability';

interface ClassificationConfidenceProps {
  confidence: ConfidenceResult;
  classification: {
    bloom_level: string;
    knowledge_dimension: string;
    difficulty: string;
  };
  explanation?: ClassificationExplanation;
  onValidate?: () => void;
  onReject?: () => void;
  showActions?: boolean;
}

export const ClassificationConfidence: React.FC<ClassificationConfidenceProps> = ({
  confidence,
  classification,
  explanation,
  onValidate,
  onReject,
  showActions = true
}) => {
  const [showExplanation, setShowExplanation] = useState(false);
  const getConfidenceColor = (score: number) => {
    if (score >= 0.8) return 'text-green-600';
    if (score >= 0.6) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getConfidenceBadge = (score: number) => {
    if (score >= 0.8) return { variant: 'default' as const, label: 'High Confidence' };
    if (score >= 0.6) return { variant: 'secondary' as const, label: 'Medium Confidence' };
    return { variant: 'destructive' as const, label: 'Low Confidence' };
  };

  const getFactorIcon = (factorName: string) => {
    switch (factorName) {
      case 'verbMatch':
        return <Target className="w-4 h-4" />;
      case 'contextMatch':
        return <Brain className="w-4 h-4" />;
      case 'structuralClarity':
        return <CheckCircle className="w-4 h-4" />;
      default:
        return <Info className="w-4 h-4" />;
    }
  };

  const getFactorLabel = (factorName: string) => {
    const labels = {
      verbMatch: 'Verb Alignment',
      contextMatch: 'Context Match',
      structuralClarity: 'Structural Clarity',
      domainSpecificity: 'Domain Specificity',
      linguisticComplexity: 'Linguistic Complexity',
      validationHistory: 'Validation History'
    };
    return labels[factorName as keyof typeof labels] || factorName;
  };

  const confidenceBadge = getConfidenceBadge(confidence.overallConfidence);

  return (
    <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Brain className="w-5 h-5 text-primary" />
            AI Classification Confidence
          </div>
          <Badge variant={confidenceBadge.variant} className="flex items-center gap-1">
            {confidence.overallConfidence >= 0.8 ? (
              <CheckCircle className="w-3 h-3" />
            ) : (
              <AlertTriangle className="w-3 h-3" />
            )}
            {confidenceBadge.label}
          </Badge>
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Overall Confidence Score */}
        <div className="text-center space-y-2">
          <div className={`text-4xl font-bold ${getConfidenceColor(confidence.overallConfidence)}`}>
            {(confidence.overallConfidence * 100).toFixed(1)}%
          </div>
          <Progress value={confidence.overallConfidence * 100} className="h-3" />
          <p className="text-sm text-muted-foreground">
            Overall Classification Confidence
          </p>
        </div>

        {/* Classification Results */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="text-center p-3 border rounded-lg">
            <div className="font-semibold text-primary">
              {classification.bloom_level.charAt(0).toUpperCase() + classification.bloom_level.slice(1)}
            </div>
            <div className="text-xs text-muted-foreground">Bloom's Level</div>
          </div>
          <div className="text-center p-3 border rounded-lg">
            <div className="font-semibold text-secondary">
              {classification.knowledge_dimension.charAt(0).toUpperCase() + classification.knowledge_dimension.slice(1)}
            </div>
            <div className="text-xs text-muted-foreground">Knowledge Type</div>
          </div>
          <div className="text-center p-3 border rounded-lg">
            <div className="font-semibold text-accent">
              {classification.difficulty.charAt(0).toUpperCase() + classification.difficulty.slice(1)}
            </div>
            <div className="text-xs text-muted-foreground">Difficulty</div>
          </div>
        </div>

        {/* Confidence Factors Breakdown */}
        <div className="space-y-3">
          <h4 className="font-semibold text-sm flex items-center gap-2">
            <TrendingUp className="w-4 h-4" />
            Confidence Factors
          </h4>
          <div className="grid gap-3">
            {Object.entries(confidence.factors).map(([factorName, score]) => (
              <div key={factorName} className="flex items-center gap-3">
                <div className="flex items-center gap-2 min-w-[140px]">
                  {getFactorIcon(factorName)}
                  <span className="text-sm font-medium">
                    {getFactorLabel(factorName)}
                  </span>
                </div>
                <div className="flex-1">
                  <Progress value={score * 100} className="h-2" />
                </div>
                <div className="text-sm font-medium min-w-[50px] text-right">
                  {(score * 100).toFixed(0)}%
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Explanation */}
        <div className="p-3 bg-muted/50 rounded-lg">
          <h4 className="font-semibold text-sm mb-2">Analysis</h4>
          <p className="text-sm text-muted-foreground">{confidence.explanation}</p>
        </div>

        {/* Recommendations */}
        {confidence.recommendations.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-semibold text-sm">Recommendations</h4>
            <ul className="space-y-1">
              {confidence.recommendations.map((rec, index) => (
                <li key={index} className="text-sm text-muted-foreground flex items-start gap-2">
                  <span className="text-primary">•</span>
                  <span>{rec}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Enhanced Explanation Section */}
        {explanation && (
          <Collapsible open={showExplanation} onOpenChange={setShowExplanation} className="border-t pt-4">
            <CollapsibleTrigger asChild>
              <Button variant="outline" className="w-full flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <Info className="w-4 h-4" />
                  <span>Detailed Explanation</span>
                </span>
                {showExplanation ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="mt-4 space-y-4">
              {/* Evidence Breakdown */}
              <div className="space-y-3">
                <h4 className="font-semibold text-sm">Evidence Analysis</h4>
                <div className="grid gap-2">
                  {explanation.supportingEvidence.verbsFound.length > 0 && (
                    <div className="p-2 bg-muted/50 rounded">
                      <span className="text-xs font-medium">Action Verbs Found:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {explanation.supportingEvidence.verbsFound.map((verb, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">{verb}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {explanation.supportingEvidence.keywordsFound.length > 0 && (
                    <div className="p-2 bg-muted/50 rounded">
                      <span className="text-xs font-medium">Keywords Identified:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {explanation.supportingEvidence.keywordsFound.map((keyword, i) => (
                          <Badge key={i} variant="outline" className="text-xs">{keyword}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* Reasoning */}
              <div className="space-y-2">
                <h4 className="font-semibold text-sm">Classification Reasoning</h4>
                <ul className="space-y-1">
                  {explanation.reasoning.map((reason, index) => (
                    <li key={index} className="text-sm text-muted-foreground flex items-start gap-2">
                      <span className="text-primary mt-1">→</span>
                      <span>{reason}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {/* Weaknesses */}
              {explanation.weaknesses.length > 0 && (
                <div className="space-y-2">
                  <h4 className="font-semibold text-sm text-yellow-600">Identified Weaknesses</h4>
                  <ul className="space-y-1">
                    {explanation.weaknesses.map((weakness, index) => (
                      <li key={index} className="text-sm text-muted-foreground flex items-start gap-2">
                        <AlertTriangle className="w-3 h-3 text-yellow-600 mt-1" />
                        <span>{weakness}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Visual Breakdown */}
              <div className="space-y-2">
                <h4 className="font-semibold text-sm">Evidence Strength Breakdown</h4>
                <div className="space-y-2">
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span>Bloom's Level Evidence</span>
                      <span>{(explanation.visualBreakdown.bloomEvidence * 100).toFixed(0)}%</span>
                    </div>
                    <Progress value={explanation.visualBreakdown.bloomEvidence * 100} className="h-2" />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span>Knowledge Type Evidence</span>
                      <span>{(explanation.visualBreakdown.knowledgeEvidence * 100).toFixed(0)}%</span>
                    </div>
                    <Progress value={explanation.visualBreakdown.knowledgeEvidence * 100} className="h-2" />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span>Structural Quality</span>
                      <span>{(explanation.visualBreakdown.structuralEvidence * 100).toFixed(0)}%</span>
                    </div>
                    <Progress value={explanation.visualBreakdown.structuralEvidence * 100} className="h-2" />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs mb-1">
                      <span>Contextual Indicators</span>
                      <span>{(explanation.visualBreakdown.contextualEvidence * 100).toFixed(0)}%</span>
                    </div>
                    <Progress value={explanation.visualBreakdown.contextualEvidence * 100} className="h-2" />
                  </div>
                </div>
              </div>
            </CollapsibleContent>
          </Collapsible>
        )}

        {/* Needs Review Alert */}
        {confidence.needsReview && (
          <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
            <div className="flex items-center gap-2 text-yellow-800">
              <AlertTriangle className="w-4 h-4" />
              <span className="font-medium text-sm">Manual Review Recommended</span>
            </div>
            <p className="text-sm text-yellow-700 mt-1">
              This classification has low confidence and should be reviewed by a teacher.
            </p>
          </div>
        )}

        {/* Action Buttons */}
        {showActions && (
          <div className="flex gap-2 pt-2 border-t">
            {onValidate && (
              <Button 
                onClick={onValidate}
                size="sm"
                className="flex-1"
                disabled={confidence.overallConfidence < 0.3}
              >
                <CheckCircle className="w-4 h-4 mr-2" />
                Validate Classification
              </Button>
            )}
            {onReject && (
              <Button 
                onClick={onReject}
                variant="outline"
                size="sm"
                className="flex-1"
              >
                <AlertTriangle className="w-4 h-4 mr-2" />
                Reject & Review
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};