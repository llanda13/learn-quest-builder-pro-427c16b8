import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Download, RefreshCw } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line } from 'recharts';
import { useToast } from "@/hooks/use-toast";
import { getQuestionStats, getQuestions, getTOSEntries } from "@/lib/supabaseClient";
import { supabase } from "@/integrations/supabase/client";

interface EnhancedAnalyticsProps {
  onBack: () => void;
}

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884D8', '#82CA9D'];

export default function EnhancedAnalytics({ onBack }: EnhancedAnalyticsProps) {
  const [loading, setLoading] = useState(true);
  const [selectedPeriod, setSelectedPeriod] = useState('30');
  const [analyticsData, setAnalyticsData] = useState<any>(null);
  const { toast } = useToast();

  useEffect(() => {
    fetchAnalytics();
    
    // Set up real-time updates
    const channel = supabase
      .channel('analytics-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'questions' }, () => {
        fetchAnalytics();
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tos_entries' }, () => {
        fetchAnalytics();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [selectedPeriod]);

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      
      // Fetch all data in parallel
      const [questionsData, tosData, statsData] = await Promise.all([
        getQuestions(),
        getTOSEntries(),
        getQuestionStats()
      ]);

      // Process analytics data
      const analytics = processAnalyticsData(questionsData as any[], tosData as any[], statsData as any);
      setAnalyticsData(analytics);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch analytics data",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const processAnalyticsData = (questions: any[], tos: any[], stats: any[]) => {
    // Bloom's taxonomy distribution
    const bloomDistribution = questions.reduce((acc, q) => {
      acc[q.bloom_level] = (acc[q.bloom_level] || 0) + 1;
      return acc;
    }, {});

    const bloomData = Object.entries(bloomDistribution).map(([level, count]) => ({
      level,
      count,
      percentage: ((count as number) / questions.length * 100).toFixed(1)
    }));

    // Difficulty distribution
    const difficultyDistribution = questions.reduce((acc, q) => {
      acc[q.difficulty] = (acc[q.difficulty] || 0) + 1;
      return acc;
    }, {});

    const difficultyData = Object.entries(difficultyDistribution).map(([difficulty, count]) => ({
      difficulty,
      count,
      percentage: ((count as number) / questions.length * 100).toFixed(1)
    }));

    // Topic distribution
    const topicDistribution = questions.reduce((acc, q) => {
      acc[q.topic] = (acc[q.topic] || 0) + 1;
      return acc;
    }, {});

    const topicData = Object.entries(topicDistribution)
      .map(([topic, count]) => ({
        topic,
        count,
      percentage: questions.length > 0 ? ((count as number) / questions.length * 100).toFixed(1) : '0'
      }))
      .sort((a, b) => (b.count as number) - (a.count as number))
      .slice(0, 10); // Top 10 topics

    // Knowledge dimension distribution
    const knowledgeDistribution = questions.reduce((acc, q) => {
      acc[q.knowledge_dimension] = (acc[q.knowledge_dimension] || 0) + 1;
      return acc;
    }, {});

    const knowledgeData = Object.entries(knowledgeDistribution).map(([dimension, count]) => ({
      dimension,
      count,
      percentage: ((count as number) / questions.length * 100).toFixed(1)
    }));

    // Approval status
    const approvalData = [
      {
        status: 'Approved',
        count: questions.filter(q => q.approved).length,
        color: '#00C49F'
      },
      {
        status: 'Pending',
        count: questions.filter(q => !q.approved).length,
        color: '#FFBB28'
      }
    ];

    // Creation source
    const sourceData = [
      {
        source: 'Teacher Created',
        count: questions.filter(q => q.created_by === 'teacher').length,
        color: '#0088FE'
      },
      {
        source: 'AI Generated',
        count: questions.filter(q => q.created_by === 'ai').length,
        color: '#8884D8'
      }
    ];

    // TOS coverage analysis
    const tosAnalysis = tos.map(tosEntry => {
      const relatedQuestions = questions.filter(q => q.tos_id === tosEntry.id);
      return {
        title: tosEntry.title,
        total_items: tosEntry.total_items,
        available_questions: relatedQuestions.length,
        approved_questions: relatedQuestions.filter(q => q.approved).length,
        coverage: tosEntry.total_items > 0 ? 
          ((relatedQuestions.filter(q => q.approved).length / tosEntry.total_items) * 100).toFixed(1) : '0'
      };
    });

    // Confidence score analysis
    const confidenceData = questions
      .filter(q => q.confidence_score)
      .reduce((acc, q) => {
        const range = Math.floor(q.confidence_score * 10) * 10;
        const key = `${range}-${range + 9}%`;
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {});

    const confidenceChartData = Object.entries(confidenceData).map(([range, count]) => ({
      range,
      count
    }));

    // Time-based creation trends (mock data for now)
    const trendData = generateTrendData(questions);

    return {
      bloomData,
      difficultyData,
      topicData,
      knowledgeData,
      approvalData,
      sourceData,
      tosAnalysis,
      confidenceChartData,
      trendData,
      summary: {
        totalQuestions: questions.length,
        totalTOS: tos.length,
        approvalRate: questions.length > 0 ? 
          ((questions.filter(q => q.approved).length / questions.length) * 100).toFixed(1) : '0',
        avgConfidence: questions.filter(q => q.confidence_score).length > 0 ?
          (questions.filter(q => q.confidence_score).reduce((sum, q) => sum + q.confidence_score, 0) / 
           questions.filter(q => q.confidence_score).length * 100).toFixed(1) : '0'
      }
    };
  };

  const generateTrendData = (questions: any[]) => {
    // Group questions by creation date (simplified for demo)
    const last30Days = Array.from({ length: 30 }, (_, i) => {
      const date = new Date();
      date.setDate(date.getDate() - (29 - i));
      return {
        date: date.toISOString().split('T')[0],
        questions: 0,
        approved: 0
      };
    });

    questions.forEach(q => {
      if (q.created_at) {
        const questionDate = new Date(q.created_at).toISOString().split('T')[0];
        const dayData = last30Days.find(d => d.date === questionDate);
        if (dayData) {
          dayData.questions++;
          if (q.approved) dayData.approved++;
        }
      }
    });

    return last30Days;
  };

  const exportAnalytics = () => {
    if (!analyticsData) return;
    
    const dataToExport = {
      summary: analyticsData.summary,
      bloomDistribution: analyticsData.bloomData,
      difficultyDistribution: analyticsData.difficultyData,
      topicDistribution: analyticsData.topicData,
      tosAnalysis: analyticsData.tosAnalysis,
      exportedAt: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(dataToExport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `analytics-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Success",
      description: "Analytics data exported successfully"
    });
  };

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Button onClick={onBack} variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <h1 className="text-3xl font-bold">Loading Analytics...</h1>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button onClick={onBack} variant="ghost" size="sm">
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-3xl font-bold">Enhanced Analytics</h1>
            <p className="text-muted-foreground">
              Real-time insights into your question bank and test generation
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button onClick={fetchAnalytics} variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          <Button onClick={exportAnalytics} variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-6">
            <div className="text-2xl font-bold">{analyticsData?.summary.totalQuestions}</div>
            <div className="text-sm text-muted-foreground">Total Questions</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-2xl font-bold">{analyticsData?.summary.totalTOS}</div>
            <div className="text-sm text-muted-foreground">TOS Documents</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-2xl font-bold">{analyticsData?.summary.approvalRate}%</div>
            <div className="text-sm text-muted-foreground">Approval Rate</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-6">
            <div className="text-2xl font-bold">{analyticsData?.summary.avgConfidence}%</div>
            <div className="text-sm text-muted-foreground">Avg AI Confidence</div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bloom's Taxonomy Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Bloom's Taxonomy Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={analyticsData?.bloomData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="level" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#0088FE" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Difficulty Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Difficulty Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={analyticsData?.difficultyData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ difficulty, percentage }) => `${difficulty}: ${percentage}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="count"
                >
                  {analyticsData?.difficultyData.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Topic Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Top Topics</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={analyticsData?.topicData} layout="horizontal">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" />
                <YAxis dataKey="topic" type="category" width={100} />
                <Tooltip />
                <Bar dataKey="count" fill="#00C49F" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Knowledge Dimension */}
        <Card>
          <CardHeader>
            <CardTitle>Knowledge Dimensions</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={analyticsData?.knowledgeData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ dimension, percentage }) => `${dimension}: ${percentage}%`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="count"
                >
                  {analyticsData?.knowledgeData.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Question Creation Trend */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Question Creation Trend (Last 30 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={analyticsData?.trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Line type="monotone" dataKey="questions" stroke="#8884d8" name="Created" />
                <Line type="monotone" dataKey="approved" stroke="#82ca9d" name="Approved" />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Approval Status */}
        <Card>
          <CardHeader>
            <CardTitle>Approval Status</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={analyticsData?.approvalData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ status, count }) => `${status}: ${count}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="count"
                >
                  {analyticsData?.approvalData.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Source Distribution */}
        <Card>
          <CardHeader>
            <CardTitle>Question Sources</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={analyticsData?.sourceData}
                  cx="50%"
                  cy="50%"
                  labelLine={false}
                  label={({ source, count }) => `${source}: ${count}`}
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="count"
                >
                  {analyticsData?.sourceData.map((entry: any, index: number) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* TOS Coverage Analysis */}
      <Card>
        <CardHeader>
          <CardTitle>TOS Coverage Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {analyticsData?.tosAnalysis.map((tos: any, index: number) => (
              <div key={index} className="flex items-center justify-between p-4 border rounded-lg">
                <div>
                  <h4 className="font-medium">{tos.title}</h4>
                  <p className="text-sm text-muted-foreground">
                    {tos.approved_questions} of {tos.total_items} questions available
                  </p>
                </div>
                <div className="text-right">
                  <div className="text-2xl font-bold">{tos.coverage}%</div>
                  <div className="text-sm text-muted-foreground">Coverage</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}