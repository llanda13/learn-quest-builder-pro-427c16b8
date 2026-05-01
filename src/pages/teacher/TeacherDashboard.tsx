import { useEffect, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useUserRole } from "@/hooks/useUserRole";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { 
  FileText, 
  PlusCircle, 
  Download,
  BarChart3,
  Database,
  Layers,
  Clock,
  TrendingUp
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { format, subMonths, startOfMonth, endOfMonth, eachWeekOfInterval, startOfWeek, endOfWeek, parseISO } from "date-fns";
import { TopicCoverageChart } from "@/components/reports/TopicCoverageChart";

export default function TeacherDashboard() {
  const navigate = useNavigate();
  const { isTeacher, loading } = useUserRole();

  useEffect(() => {
    if (!loading && !isTeacher) {
      navigate("/auth");
    }
  }, [isTeacher, loading, navigate]);

  const { data: stats } = useQuery({
    queryKey: ['teacher-stats'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;

      const [testsRes, recentRes, questionsRes, tosRes] = await Promise.all([
        supabase.from('generated_tests').select('*', { count: 'exact' }),
        supabase.from('generated_tests').select('*').order('created_at', { ascending: false }).limit(5),
        supabase.from('questions').select('*', { count: 'exact' }),
        supabase.from('tos_entries').select('*', { count: 'exact' })
      ]);

      return {
        totalTests: testsRes.count || 0,
        recentTests: recentRes.data || [],
        totalQuestions: questionsRes.count || 0,
        totalTOS: tosRes.count || 0
      };
    }
  });

  // Query for usage analytics - tests generated over time
  const { data: usageData } = useQuery({
    queryKey: ['usage-analytics'],
    queryFn: async () => {
      const sixMonthsAgo = subMonths(new Date(), 6);
      
      const { data, error } = await supabase
        .from('generated_tests')
        .select('created_at')
        .gte('created_at', sixMonthsAgo.toISOString())
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data || [];
    }
  });

  // Process usage data into weekly buckets for the chart
  const chartData = useMemo(() => {
    if (!usageData || usageData.length === 0) {
      // Return placeholder data if no tests yet
      const weeks = eachWeekOfInterval({
        start: subMonths(new Date(), 3),
        end: new Date()
      });
      return weeks.map(week => ({
        week: format(week, 'MMM d'),
        tests: 0
      }));
    }

    const sixMonthsAgo = subMonths(new Date(), 6);
    const weeks = eachWeekOfInterval({
      start: startOfMonth(sixMonthsAgo),
      end: new Date()
    });

    return weeks.map(weekStart => {
      const weekEnd = endOfWeek(weekStart);
      const testsInWeek = usageData.filter(test => {
        const testDate = parseISO(test.created_at);
        return testDate >= weekStart && testDate <= weekEnd;
      }).length;

      return {
        week: format(weekStart, 'MMM d'),
        tests: testsInWeek
      };
    });
  }, [usageData]);

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Teacher Dashboard</h1>
          <p className="text-muted-foreground">Create and manage your tests</p>
        </div>
        <Button onClick={() => navigate("/teacher/tos")} size="lg">
          <PlusCircle className="h-5 w-5 mr-2" />
          Generate New Test
        </Button>
      </div>

      {/* Stats Cards - Tests Generated, Total Questions, TOS Templates */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tests Generated</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalTests || 0}</div>
            <p className="text-xs text-muted-foreground">Total questionnaires</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Questions</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalQuestions || 0}</div>
            <p className="text-xs text-muted-foreground">In question bank</p>
          </CardContent>
        </Card>

        <Card className="bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">TOS Templates</CardTitle>
            <Layers className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-700 dark:text-emerald-400">{stats?.totalTOS || 0}</div>
            <p className="text-xs text-muted-foreground">Saved specifications</p>
          </CardContent>
        </Card>
      </div>

      {/* Usage Over Time - Real Analytics Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Usage Over Time
          </CardTitle>
          <CardDescription>Test generation activity this semester</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="colorTests" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis 
                  dataKey="week" 
                  tick={{ fontSize: 12 }} 
                  tickLine={false}
                  axisLine={false}
                  className="text-muted-foreground"
                />
                <YAxis 
                  tick={{ fontSize: 12 }} 
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  className="text-muted-foreground"
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--background))', 
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px'
                  }}
                  labelStyle={{ color: 'hsl(var(--foreground))' }}
                />
                <Area 
                  type="monotone" 
                  dataKey="tests" 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={2}
                  fillOpacity={1} 
                  fill="url(#colorTests)" 
                  name="Tests Generated"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
          {usageData && usageData.length === 0 && (
            <p className="text-center text-muted-foreground text-sm mt-2">
              Generate your first test to start tracking usage
            </p>
          )}
        </CardContent>
      </Card>

      {/* Activity Stats Row */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg. Questions per Test</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {stats?.totalTests && stats.totalTests > 0
                ? Math.round(stats.totalQuestions / stats.totalTests)
                : 0}
            </div>
            <p className="text-xs text-muted-foreground">Average test length</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Question Bank Usage</CardTitle>
            <Database className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats?.totalQuestions || 0}</div>
            <p className="text-xs text-muted-foreground">Available questions across all topics</p>
          </CardContent>
        </Card>
      </div>

      {/* Topic Coverage */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-primary" />
            Topic Coverage
          </CardTitle>
          <CardDescription>Distribution of questions by topic across your generated tests</CardDescription>
        </CardHeader>
        <CardContent>
          <TopicCoverageChart />
        </CardContent>
      </Card>

      {/* Recent Tests */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5" />
                Recent Tests
              </CardTitle>
              <CardDescription>Your recently generated questionnaires</CardDescription>
            </div>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => navigate("/teacher/my-tests")}
            >
              View All
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {stats?.recentTests && stats.recentTests.length > 0 ? (
            <div className="space-y-2">
              {stats.recentTests.slice(0, 3).map((test: any) => (
                <div
                  key={test.id}
                  className="flex items-center justify-between p-3 rounded-lg border hover:bg-accent cursor-pointer"
                  onClick={() => navigate(`/teacher/generated-test/${test.id}`)}
                >
                  <div>
                    <p className="font-medium">{test.title || 'Untitled Test'}</p>
                    <p className="text-sm text-muted-foreground">
                      {new Date(test.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <Button variant="ghost" size="sm">
                    <Download className="h-4 w-4" />
                  </Button>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-center py-4">
              No tests generated yet. Create your first test!
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}