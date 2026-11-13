import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PieChart, Pie, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer, Cell } from "recharts";
import type { Question } from "@/services/db/questions";

interface QuestionBankReportsProps {
  questions: Question[];
}

const COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "#8884d8",
  "#82ca9d",
  "#ffc658",
  "#ff7300",
  "#0088FE",
];

export function QuestionBankReports({ questions }: QuestionBankReportsProps) {
  const byTeacher = useMemo(() => {
    const map: Record<string, number> = {};
    questions.forEach((q) => {
      const teacher = q.created_by || "Unknown";
      map[teacher] = (map[teacher] || 0) + 1;
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 10);
  }, [questions]);

  const byCategory = useMemo(() => {
    const map: Record<string, number> = {};
    questions.forEach((q) => {
      const cat = (q as any).category || "Uncategorized";
      map[cat] = (map[cat] || 0) + 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [questions]);

  const bySpecialization = useMemo(() => {
    const map: Record<string, number> = {};
    questions.forEach((q) => {
      const spec = (q as any).specialization || "Unassigned";
      map[spec] = (map[spec] || 0) + 1;
    });
    return Object.entries(map)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [questions]);

  const byCollege = useMemo(() => {
    const map: Record<string, number> = {};
    questions.forEach((q) => {
      // Use category as a proxy for college grouping
      const cat = (q as any).category;
      const college = cat === "Major" ? "College of Computing Studies" : cat === "GE" ? "General Education" : "Other";
      map[college] = (map[college] || 0) + 1;
    });
    return Object.entries(map).map(([name, value]) => ({ name, value }));
  }, [questions]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* By Category - Pie */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Distribution by Category</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={byCategory}
                  cx="50%"
                  cy="50%"
                  labelLine={true}
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  outerRadius={100}
                  dataKey="value"
                >
                  {byCategory.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* By College - Pie */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Distribution by College</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={byCollege}
                  cx="50%"
                  cy="50%"
                  labelLine={true}
                  label={({ name, percent }) => `${name} (${(percent * 100).toFixed(0)}%)`}
                  outerRadius={100}
                  dataKey="value"
                >
                  {byCollege.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* By Teacher - Bar */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Questions by Teacher</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={byTeacher} layout="vertical" margin={{ left: 80 }}>
                <XAxis type="number" />
                <YAxis type="category" dataKey="name" width={75} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="value" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* By Specialization - Bar */}
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium">Questions by Specialization</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={bySpecialization} margin={{ bottom: 40 }}>
                <XAxis dataKey="name" angle={-35} textAnchor="end" tick={{ fontSize: 11 }} />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="hsl(var(--chart-2))" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
