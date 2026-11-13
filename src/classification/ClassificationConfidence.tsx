import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Brain, CircleCheck as CheckCircle, TriangleAlert as AlertTriangle, Info, TrendingUp, Target } from 'lucide-react';
import { ConfidenceResult } from '@/services/ai/confidenceScoring';

interface ClassificationConfidenceProps {
  confidence: ConfidenceResult;
  classification: {
    bloom_level: string;
    knowledge_dimension: string;
    difficulty: string;
  };
  onValidate?: () => void;
  onReject?: () => void;
  showActions?: boolean;
}

export const ClassificationConfidence: React.FC<ClassificationConfidenceProps> = ({
  confidence,
  classification,
  onValidate,
  onReject,
  showActions = true
}) => {
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