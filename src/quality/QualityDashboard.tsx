import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Shield, 
  CheckCircle, 
  AlertTriangle, 
  TrendingUp, 
  Download,
  RefreshCw,
  Award,
  BarChart3,
  Settings
} from 'lucide-react';
import { iso25010Evaluator, type QualityAssessment } from '@/services/quality/iso25010Evaluator';
import { QualityMetricsChart } from './QualityMetricsChart';
import { toast } from 'sonner';

export const QualityDashboard: React.FC = () => {
  const [assessment, setAssessment] = useState<QualityAssessment | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<string>('');

  useEffect(() => {
    loadQualityAssessment();
  }, []);

  const loadQualityAssessment = async () => {
    setLoading(true);
    try {
      const result = await iso25010Evaluator.evaluateSystemQuality();
      setAssessment(result);
      setLastUpdate(new Date().toLocaleString());
      toast.success('Quality assessment completed');
    } catch (error) {
      console.error('Error loading quality assessment:', error);
      toast.error('Failed to load quality assessment');
    } finally {
      setLoading(false);
    }
  };

  const exportReport = async () => {
    if (!assessment) return;
    
    try {
      const report = await iso25010Evaluator.generateComplianceReport();
      const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `iso25010-compliance-report-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast.success('Quality report exported successfully');
    } catch (error) {
      toast.error('Failed to export report');
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 0.9) return 'text-green-600';
    if (score >= 0.75) return 'text-blue-600';
    if (score >= 0.6) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getScoreStatus = (score: number) => {
    if (score >= 0.9) return 'excellent';
    if (score >= 0.75) return 'good';
    if (score >= 0.6) return 'fair';
    return 'poor';
  };

  const getComplianceBadge = (level: string) => {
    const variants = {
      'full': 'default',
      'substantial': 'secondary',
      'partial': 'outline',
      'minimal': 'destructive'
    } as const;
    
    return variants[level as keyof typeof variants] || 'outline';
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Shield className="w-8 h-8 text-primary animate-pulse" />
          <div>
            <h1 className="text-3xl font-bold">Quality Dashboard</h1>
            <p className="text-muted-foreground">Loading ISO 25010 assessment...</p>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="p-6">
                <div className="h-16 bg-muted rounded"></div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!assessment) {
    return (
      <div className="p-6">
        <Card>
          <CardContent className="p-12 text-center">
            <AlertTriangle className="w-16 h-16 text-yellow-500 mx-auto mb-4" />
            <h3 className="text-xl font-semibold mb-2">Assessment Failed</h3>
            <p className="text-muted-foreground mb-4">Unable to load quality assessment data</p>
            <Button onClick={loadQualityAssessment}>
              <RefreshCw className="w-4 h-4 mr-2" />
              Retry Assessment
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-primary/10 rounded-lg">
            <Shield className="w-8 h-8 text-primary" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">ISO 25010 Quality Dashboard</h1>
            <p className="text-muted-foreground">
              System quality assessment and compliance monitoring
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={loadQualityAssessment} variant="outline">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={exportReport} variant="outline">
            <Download className="w-4 h-4 mr-2" />
            Export Report
          </Button>
        </div>
      </div>

      {/* Overall Score Card */}
      <Card className="bg-gradient-to-br from-primary/5 to-primary/10 border-primary/20">
        <CardContent className="p-8">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold mb-2">Overall Quality Score</h2>
              <div className="flex items-center gap-4">
                <div className={`text-4xl font-bold ${getScoreColor(assessment.overallScore)}`}>
                  {(assessment.overallScore * 100).toFixed(1)}%
                </div>
                <Badge variant={getComplianceBadge(assessment.complianceLevel)} className="text-lg px-4 py-2">
                  <Award className="w-4 h-4 mr-2" />
                  {assessment.complianceLevel.toUpperCase()} Compliance
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground mt-2">
                Last assessed: {lastUpdate}
              </p>
            </div>
            <div className="text-right">
              <div className="w-32 h-32 relative">
                <svg className="w-32 h-32 transform -rotate-90" viewBox="0 0 100 100">
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="transparent"
                    className="text-muted"
                  />
                  <circle
                    cx="50"
                    cy="50"
                    r="40"
                    stroke="currentColor"
                    strokeWidth="8"
                    fill="transparent"
                    strokeDasharray={`${2 * Math.PI * 40}`}
                    strokeDashoffset={`${2 * Math.PI * 40 * (1 - assessment.overallScore)}`}
                    className="text-primary transition-all duration-1000"
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-2xl font-bold">
                    {(assessment.overallScore * 100).toFixed(0)}%
                  </span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quality Metrics Visualization */}
      <QualityMetricsChart characteristics={assessment.characteristics} />

      {/* Quality Characteristics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {assessment.characteristics.map((characteristic, index) => (
          <Card key={index} className="hover:shadow-md transition-shadow">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center justify-between">
                <span>{characteristic.name}</span>
                <Badge variant={getScoreStatus(characteristic.score) === 'excellent' ? 'default' : 'secondary'}>
                  {getScoreStatus(characteristic.score)}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-2xl font-bold">
                    {(characteristic.score * 100).toFixed(1)}%
                  </span>
                  <div className={`p-2 rounded-lg ${
                    characteristic.score >= 0.9 ? 'bg-green-100 text-green-600' :
                    characteristic.score >= 0.75 ? 'bg-blue-100 text-blue-600' :
                    characteristic.score >= 0.6 ? 'bg-yellow-100 text-yellow-600' :
                    'bg-red-100 text-red-600'
                  }`}>
                    {characteristic.score >= 0.9 ? <CheckCircle className="w-4 h-4" /> :
                     characteristic.score >= 0.6 ? <TrendingUp className="w-4 h-4" /> :
                     <AlertTriangle className="w-4 h-4" />}
                  </div>
                </div>
                <Progress value={characteristic.score * 100} className="h-2" />
                <div className="text-xs text-muted-foreground">
                  {characteristic.subCharacteristics.length} sub-characteristics
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Detailed Analysis */}
      <Tabs defaultValue="characteristics" className="space-y-4">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="characteristics">Characteristics</TabsTrigger>
          <TabsTrigger value="metrics">Metrics</TabsTrigger>
          <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
          <TabsTrigger value="trends">Trends</TabsTrigger>
        </TabsList>

        <TabsContent value="characteristics" className="space-y-4">
          <div className="grid gap-6">
            {assessment.characteristics.map((characteristic, index) => (
              <Card key={index}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    {characteristic.name}
                    <Badge variant="outline">
                      {(characteristic.score * 100).toFixed(1)}%
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                    {characteristic.subCharacteristics.map((subChar, subIndex) => (
                      <Card key={subIndex} className="border-muted">
                        <CardContent className="p-4">
                          <h4 className="font-semibold mb-2">{subChar.name}</h4>
                          <div className="space-y-2">
                            <div className="flex justify-between items-center">
                              <span className="text-sm">Score</span>
                              <span className="font-bold">
                                {(subChar.score * 100).toFixed(1)}%
                              </span>
                            </div>
                            <Progress value={subChar.score * 100} className="h-1" />
                            <div className="space-y-1">
                              {subChar.metrics.map((metric, metricIndex) => (
                                <div key={metricIndex} className="flex justify-between text-xs">
                                  <span className="text-muted-foreground">{metric.name}</span>
                                  <span className={`font-medium ${
                                    metric.status === 'excellent' ? 'text-green-600' :
                                    metric.status === 'good' ? 'text-blue-600' :
                                    metric.status === 'fair' ? 'text-yellow-600' :
                                    'text-red-600'
                                  }`}>
                                    {metric.value}{metric.unit}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="metrics" className="space-y-4">
          <div className="grid gap-4">
            {assessment.characteristics.map((characteristic) => (
              <Card key={characteristic.name}>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="w-5 h-5" />
                    {characteristic.name} Metrics
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {characteristic.subCharacteristics.map((subChar) => (
                      <div key={subChar.name} className="space-y-2">
                        <h4 className="font-medium">{subChar.name}</h4>
                        <div className="grid gap-2 md:grid-cols-2 lg:grid-cols-3">
                          {subChar.metrics.map((metric, index) => (
                            <div key={index} className="p-3 border rounded-lg">
                              <div className="flex justify-between items-center mb-1">
                                <span className="text-sm font-medium">{metric.name}</span>
                                <Badge variant={
                                  metric.status === 'excellent' ? 'default' :
                                  metric.status === 'good' ? 'secondary' :
                                  metric.status === 'fair' ? 'outline' : 'destructive'
                                }>
                                  {metric.status}
                                </Badge>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span>Current: {metric.value}{metric.unit}</span>
                                <span className="text-muted-foreground">
                                  Target: {metric.target}{metric.unit}
                                </span>
                              </div>
                              <Progress 
                                value={(metric.value / metric.target) * 100} 
                                className="h-1 mt-2" 
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="recommendations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5" />
                Improvement Recommendations
              </CardTitle>
            </CardHeader>
            <CardContent>
              {assessment.recommendations.length > 0 ? (
                <div className="space-y-3">
                  {assessment.recommendations.map((recommendation, index) => (
                    <div key={index} className="flex items-start gap-3 p-4 border rounded-lg">
                      <AlertTriangle className="w-5 h-5 text-yellow-500 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm">{recommendation}</p>
                      </div>
                      <Badge variant="outline" className="text-xs">
                        Priority: {index < 3 ? 'High' : index < 6 ? 'Medium' : 'Low'}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <CheckCircle className="w-16 h-16 text-green-500 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold mb-2">Excellent Quality!</h3>
                  <p className="text-muted-foreground">
                    No immediate improvements needed. System meets all quality standards.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="trends" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="w-5 h-5" />
                Quality Trends
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-center py-8 text-muted-foreground">
                <BarChart3 className="w-16 h-16 mx-auto mb-4 opacity-50" />
                <p>Quality trend analysis will be available after multiple assessments</p>
                <p className="text-sm">Run assessments regularly to track improvement over time</p>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Quick Actions */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Actions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-4">
            <Button variant="outline" className="justify-start">
              <Shield className="w-4 h-4 mr-2" />
              Run Security Audit
            </Button>
            <Button variant="outline" className="justify-start">
              <TrendingUp className="w-4 h-4 mr-2" />
              Performance Test
            </Button>
            <Button variant="outline" className="justify-start">
              <CheckCircle className="w-4 h-4 mr-2" />
              Validate Functions
            </Button>
            <Button variant="outline" className="justify-start">
              <Settings className="w-4 h-4 mr-2" />
              Configure Metrics
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};