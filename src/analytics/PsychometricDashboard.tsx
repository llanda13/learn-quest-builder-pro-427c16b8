import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell, Legend } from 'recharts';
import { TrendingUp, TrendingDown, Activity, AlertTriangle, CheckCircle, Clock } from 'lucide-react';
import { itemAnalyzer, PsychometricReport } from '@/services/psychometrics/itemAnalysis';
import { useToast } from '@/hooks/use-toast';

interface PsychometricDashboardProps {
  testId?: string;
}

const PsychometricDashboard: React.FC<PsychometricDashboardProps> = ({ testId = 'sample-test' }) => {
  const [report, setReport] = useState<PsychometricReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [difficultyDistribution, setDifficultyDistribution] = useState<any>(null);
  const [reliabilityTrends, setReliabilityTrends] = useState<any>(null);
  const { toast } = useToast();

  useEffect(() => {
    loadPsychometricData();
  }, [testId]);

  const loadPsychometricData = async () => {
    try {
      setLoading(true);
      
      // Load psychometric report
      const psychometricReport = await itemAnalyzer.analyzeTest(testId, []);
      setReport(psychometricReport);
      
      // Load additional data
      const difficulty = await itemAnalyzer.getDifficultyDistribution(testId);
      setDifficultyDistribution(difficulty);
      
      const trends = await itemAnalyzer.getReliabilityTrends(testId);
      setReliabilityTrends(trends);
      
      toast({
        title: "Data loaded successfully",
        description: "Psychometric analysis has been updated.",
      });
    } catch (error) {
      console.error('Error loading psychometric data:', error);
      toast({
        title: "Error loading data",
        description: "Failed to load psychometric analysis.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const getReliabilityColor = (value: number) => {
    if (value >= 0.9) return 'text-green-600';
    if (value >= 0.8) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getReliabilityStatus = (value: number) => {
    if (value >= 0.9) return 'excellent';
    if (value >= 0.8) return 'good';
    return 'poor';
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Psychometric Dashboard</h2>
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 animate-spin" />
            <span className="text-sm text-muted-foreground">Loading analysis...</span>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <div className="h-4 bg-muted rounded animate-pulse" />
              </CardHeader>
              <CardContent>
                <div className="h-8 bg-muted rounded animate-pulse mb-2" />
                <div className="h-3 bg-muted rounded animate-pulse w-2/3" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <AlertTriangle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <h3 className="text-lg font-medium mb-2">No Data Available</h3>
          <p className="text-muted-foreground mb-4">Unable to load psychometric analysis.</p>
          <Button onClick={loadPsychometricData}>Retry</Button>
        </div>
      </div>
    );
  }

  const difficultyData = difficultyDistribution ? [
    { name: 'Very Easy', value: difficultyDistribution.veryEasy, color: '#10b981' },
    { name: 'Easy', value: difficultyDistribution.easy, color: '#22c55e' },
    { name: 'Moderate', value: difficultyDistribution.moderate, color: '#eab308' },
    { name: 'Hard', value: difficultyDistribution.hard, color: '#f97316' },
    { name: 'Very Hard', value: difficultyDistribution.veryHard, color: '#ef4444' }
  ] : [];

  const reliabilityData = reliabilityTrends ? reliabilityTrends.dates.map((date: string, index: number) => ({
    date: new Date(date).toLocaleDateString(),
    cronbach: reliabilityTrends.cronbachAlpha[index],
    splitHalf: reliabilityTrends.splitHalf[index]
  })) : [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Psychometric Dashboard</h2>
          <p className="text-muted-foreground">Test reliability and validity analysis</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={loadPsychometricData} variant="outline">
            Refresh Data
          </Button>
        </div>
      </div>

      {/* Key Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Cronbach's Alpha</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              <span className={getReliabilityColor(report.overallReliability.cronbachAlpha)}>
                {report.overallReliability.cronbachAlpha.toFixed(3)}
              </span>
            </div>
            <Badge variant={getReliabilityStatus(report.overallReliability.cronbachAlpha) === 'excellent' ? 'default' : 'secondary'}>
              {getReliabilityStatus(report.overallReliability.cronbachAlpha)}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Content Validity</CardTitle>
            <CheckCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {(report.validityMeasures.contentValidity * 100).toFixed(1)}%
            </div>
            <Progress 
              value={report.validityMeasures.contentValidity * 100} 
              className="h-2 mt-2" 
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Standard Error</CardTitle>
            <TrendingDown className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {report.overallReliability.standardError.toFixed(3)}
            </div>
            <p className="text-xs text-muted-foreground">Lower is better</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Item Count</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {Object.keys(report.itemStatistics).length}
            </div>
            <p className="text-xs text-muted-foreground">Questions analyzed</p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="reliability" className="space-y-4">
        <TabsList>
          <TabsTrigger value="reliability">Reliability</TabsTrigger>
          <TabsTrigger value="difficulty">Difficulty Analysis</TabsTrigger>
          <TabsTrigger value="items">Item Statistics</TabsTrigger>
          <TabsTrigger value="validity">Validity</TabsTrigger>
          <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
        </TabsList>

        <TabsContent value="reliability" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Reliability Coefficients</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Cronbach's Alpha</span>
                    <span className={getReliabilityColor(report.overallReliability.cronbachAlpha)}>
                      {report.overallReliability.cronbachAlpha.toFixed(3)}
                    </span>
                  </div>
                  <Progress value={report.overallReliability.cronbachAlpha * 100} className="h-2" />
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Split-Half</span>
                    <span className={getReliabilityColor(report.overallReliability.splitHalf)}>
                      {report.overallReliability.splitHalf.toFixed(3)}
                    </span>
                  </div>
                  <Progress value={report.overallReliability.splitHalf * 100} className="h-2" />
                </div>
                
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>KR-20</span>
                    <span className={getReliabilityColor(report.overallReliability.kuderRichardson20)}>
                      {report.overallReliability.kuderRichardson20.toFixed(3)}
                    </span>
                  </div>
                  <Progress value={report.overallReliability.kuderRichardson20 * 100} className="h-2" />
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Reliability Trends</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={{
                    cronbach: { label: "Cronbach's Alpha", color: "hsl(var(--primary))" },
                    splitHalf: { label: "Split-Half", color: "hsl(var(--chart-2))" }
                  }}
                  className="h-[200px]"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={reliabilityData}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis 
                        dataKey="date" 
                        className="text-xs"
                        tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      />
                      <YAxis 
                        domain={[0.7, 1]} 
                        className="text-xs"
                        tick={{ fill: 'hsl(var(--muted-foreground))' }}
                      />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Legend />
                      <Line 
                        type="monotone" 
                        dataKey="cronbach" 
                        stroke="hsl(var(--primary))" 
                        strokeWidth={2}
                        name="Cronbach's Alpha"
                        dot={{ fill: 'hsl(var(--primary))' }}
                      />
                      <Line 
                        type="monotone" 
                        dataKey="splitHalf" 
                        stroke="hsl(var(--chart-2))" 
                        strokeWidth={2}
                        name="Split-Half"
                        dot={{ fill: 'hsl(var(--chart-2))' }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="difficulty" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Difficulty Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <ChartContainer
                  config={{
                    veryEasy: { label: "Very Easy", color: "hsl(var(--chart-1))" },
                    easy: { label: "Easy", color: "hsl(var(--chart-2))" },
                    moderate: { label: "Moderate", color: "hsl(var(--chart-3))" },
                    hard: { label: "Hard", color: "hsl(var(--chart-4))" },
                    veryHard: { label: "Very Hard", color: "hsl(var(--chart-5))" }
                  }}
                  className="h-[250px]"
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={difficultyData}
                        cx="50%"
                        cy="50%"
                        outerRadius={80}
                        dataKey="value"
                        label={({ name, value }) => `${name}: ${value}`}
                      >
                        {difficultyData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </ChartContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Difficulty Statistics</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {difficultyData.map((item) => (
                  <div key={item.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-3 h-3 rounded-full" 
                        style={{ backgroundColor: item.color }}
                      />
                      <span>{item.name}</span>
                    </div>
                    <Badge variant="outline">{item.value}</Badge>
                  </div>
                ))}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="items" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Individual Item Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {Object.entries(report.itemStatistics).map(([itemId, stats]) => (
                  <div key={itemId} className="border rounded-lg p-4 space-y-2">
                    <div className="flex justify-between items-center">
                      <h4 className="font-medium">{itemId}</h4>
                      <Badge variant="outline">n={stats.sampleSize}</Badge>
                    </div>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Difficulty:</span>
                        <div className="font-mono">{stats.difficulty.toFixed(3)}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Discrimination:</span>
                        <div className="font-mono">{stats.discrimination.toFixed(3)}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Point-Biserial:</span>
                        <div className="font-mono">{stats.pointBiserial.toFixed(3)}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Reliability:</span>
                        <div className="font-mono">{stats.reliability.toFixed(3)}</div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="validity" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader>
                <CardTitle>Content Validity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold mb-2">
                  {(report.validityMeasures.contentValidity * 100).toFixed(1)}%
                </div>
                <Progress value={report.validityMeasures.contentValidity * 100} className="h-3" />
                <p className="text-sm text-muted-foreground mt-2">
                  Measures how well test covers the subject
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Construct Validity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold mb-2">
                  {(report.validityMeasures.constructValidity * 100).toFixed(1)}%
                </div>
                <Progress value={report.validityMeasures.constructValidity * 100} className="h-3" />
                <p className="text-sm text-muted-foreground mt-2">
                  Measures intended psychological construct
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Criterion Validity</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="text-3xl font-bold mb-2">
                  {(report.validityMeasures.criterionValidity * 100).toFixed(1)}%
                </div>
                <Progress value={report.validityMeasures.criterionValidity * 100} className="h-3" />
                <p className="text-sm text-muted-foreground mt-2">
                  Correlation with external criteria
                </p>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="recommendations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recommendations</CardTitle>
              <p className="text-sm text-muted-foreground">
                Suggestions to improve test quality and reliability
              </p>
            </CardHeader>
            <CardContent>
              {report.recommendations.length > 0 ? (
                <div className="space-y-3">
                  {report.recommendations.map((recommendation, index) => (
                    <div key={index} className="flex items-start gap-3 p-3 border rounded-lg">
                      <AlertTriangle className="h-5 w-5 text-yellow-500 mt-0.5 flex-shrink-0" />
                      <p className="text-sm">{recommendation}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                  <h3 className="font-medium mb-2">Excellent Test Quality</h3>
                  <p className="text-sm text-muted-foreground">
                    No recommendations needed. Your test meets all psychometric standards.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default PsychometricDashboard;