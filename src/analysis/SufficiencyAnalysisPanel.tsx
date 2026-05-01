import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { CheckCircle, AlertTriangle, XCircle, TrendingUp, BookOpen, Tag } from "lucide-react";
import { SufficiencyAnalysis } from "@/services/analysis/sufficiencyAnalysis";

interface SufficiencyAnalysisPanelProps {
  analysis: SufficiencyAnalysis;
}

export function SufficiencyAnalysisPanel({ analysis }: SufficiencyAnalysisPanelProps) {
  const subject = analysis.subjectSummary;
  const topicCoverage = subject?.topicCoverage || [];

  const getStatusIcon = (status: 'pass' | 'warning' | 'fail') => {
    switch (status) {
      case 'pass': return <CheckCircle className="w-4 h-4 text-green-600" />;
      case 'warning': return <AlertTriangle className="w-4 h-4 text-yellow-600" />;
      case 'fail': return <XCircle className="w-4 h-4 text-red-600" />;
    }
  };

  const getStatusBg = (status: 'pass' | 'warning' | 'fail') => {
    switch (status) {
      case 'pass': return "bg-green-100 dark:bg-green-900/30 border-green-300";
      case 'warning': return "bg-yellow-100 dark:bg-yellow-900/30 border-yellow-300";
      case 'fail': return "bg-red-100 dark:bg-red-900/30 border-red-300";
    }
  };

  return (
    <Card className="mt-6">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5" />
            Question Bank Sufficiency Analysis
          </CardTitle>
          <Badge 
            variant={analysis.overallStatus === 'pass' ? 'default' : analysis.overallStatus === 'warning' ? 'secondary' : 'destructive'}
            className="text-sm"
          >
            {analysis.overallStatus.toUpperCase()}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Overall Score */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Overall Sufficiency Score</span>
            <span className="text-2xl font-bold">{Math.round(analysis.overallScore)}%</span>
          </div>
          <Progress value={analysis.overallScore} className="h-2" />
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <span>{analysis.totalAvailable} available / {analysis.totalRequired} required</span>
            <span>{Math.max(0, analysis.totalRequired - analysis.totalAvailable)} gap</span>
          </div>
        </div>

        {/* Subject-Level Summary */}
        {subject && (
          <div className={`p-4 rounded-lg border ${getStatusBg(subject.sufficiency)}`}>
            <div className="flex items-center gap-2 mb-1">
              <BookOpen className="w-4 h-4" />
              <span className="font-semibold text-sm">Subject: {subject.subjectCode || "N/A"}</span>
              {getStatusIcon(subject.sufficiency)}
            </div>
            <p className="text-xs text-muted-foreground mb-1">{subject.subjectDescription}</p>
            <p className="text-sm font-semibold">
              {subject.totalAvailable} / {subject.totalRequired} questions
              {subject.gap > 0 && <span className="text-red-600 ml-2">Gap: {subject.gap}</span>}
            </p>
          </div>
        )}

        {/* Topic-Level Validation (Secondary) */}
        {topicCoverage.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-3 flex items-center gap-2">
              <Tag className="w-4 h-4" />
              Topic Coverage Validation
              <span className="text-xs text-muted-foreground font-normal">(secondary check)</span>
            </h4>

            <div className="space-y-2 max-h-96 overflow-y-auto">
              {topicCoverage.map((topic) => (
                <div
                  key={topic.topic}
                  className={`p-3 rounded-lg border ${getStatusBg(topic.sufficiency)}`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(topic.sufficiency)}
                      <p className="font-medium text-sm capitalize">{topic.topic}</p>
                      {!topic.hasTopic && (
                        <Badge variant="outline" className="text-xs">No topic tags</Badge>
                      )}
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold">
                        {topic.available} / {topic.required}
                      </p>
                      {topic.gap > 0 && (
                        <p className="text-xs text-red-600">Gap: {topic.gap}</p>
                      )}
                      {topic.untaggedCount > 0 && (
                        <p className="text-xs text-yellow-600">{topic.untaggedCount} untagged</p>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Recommendations */}
        {analysis.recommendations.length > 0 && (
          <div>
            <h4 className="text-sm font-semibold mb-3">Recommendations</h4>
            <div className="space-y-2">
              {analysis.recommendations.map((rec, index) => (
                <div key={index} className="flex items-start gap-2 text-sm">
                  <span className="text-muted-foreground">•</span>
                  <span className={
                    rec.startsWith('✓') ? 'text-green-600' : 
                    rec.startsWith('Topic Coverage Incomplete') ? 'text-yellow-600' : 
                    rec.startsWith('Critical') ? 'text-red-600' : ''
                  }>
                    {rec}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
