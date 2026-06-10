import { useEffect, useMemo, useState } from "react";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Download, History as HistoryIcon } from "lucide-react";
import { fetchAuditReport } from "@/services/rotation/rotationEngine";

export default function RotationAudit() {
  const [filters, setFilters] = useState({ school_year: "", semester: "", subject: "" });
  const [rows, setRows] = useState<Awaited<ReturnType<typeof fetchAuditReport>>>([]);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchAuditReport({
        school_year: filters.school_year || undefined,
        semester: filters.semester || undefined,
        subject: filters.subject || undefined,
      });
      setRows(data);
    } catch (e: any) {
      toast.error(e.message || "Failed to load audit report");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const csv = useMemo(() => {
    const head = "question_id,subject,topic,used_count,last_used_at,last_used_school_year,last_used_semester,distinct_periods,question_text\n";
    const body = rows.map((r) =>
      [r.question_id, r.subject, r.topic, r.used_count, r.last_used_at ?? "",
       r.last_used_school_year ?? "", r.last_used_semester ?? "", r.distinct_periods,
       JSON.stringify(r.question_text || "")
      ].join(",")
    ).join("\n");
    return head + body;
  }, [rows]);

  const downloadCsv = () => {
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `rotation-audit-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-6xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
          <HistoryIcon className="h-7 w-7" /> Rotation Audit
        </h1>
        <p className="text-muted-foreground">
          See which questions have been reused and across which academic periods.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
          <CardDescription>Leave blank to include all.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-4">
          <div className="space-y-2">
            <Label>School Year</Label>
            <Input value={filters.school_year}
              onChange={(e) => setFilters({ ...filters, school_year: e.target.value })}
              placeholder="2025-2026" />
          </div>
          <div className="space-y-2">
            <Label>Semester</Label>
            <Input value={filters.semester}
              onChange={(e) => setFilters({ ...filters, semester: e.target.value })}
              placeholder="1st Semester" />
          </div>
          <div className="space-y-2">
            <Label>Subject</Label>
            <Input value={filters.subject}
              onChange={(e) => setFilters({ ...filters, subject: e.target.value })}
              placeholder="IS 9" />
          </div>
          <div className="flex items-end gap-2">
            <Button onClick={load} disabled={loading}>Apply</Button>
            <Button variant="outline" onClick={downloadCsv} disabled={!rows.length}>
              <Download className="h-4 w-4 mr-2" /> CSV
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Results ({rows.length})</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Question</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>Topic</TableHead>
                <TableHead className="text-right">Used</TableHead>
                <TableHead>Last Used</TableHead>
                <TableHead>Periods</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.question_id}>
                  <TableCell className="max-w-md truncate" title={r.question_text}>
                    {r.question_text}
                  </TableCell>
                  <TableCell>{r.subject}</TableCell>
                  <TableCell>{r.topic}</TableCell>
                  <TableCell className="text-right">
                    <Badge variant={r.used_count > 2 ? "destructive" : "secondary"}>
                      {r.used_count}×
                    </Badge>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {r.last_used_school_year || "—"}
                    {r.last_used_semester ? ` · ${r.last_used_semester}` : ""}
                    {r.last_used_at ? ` · ${new Date(r.last_used_at).toLocaleDateString()}` : ""}
                  </TableCell>
                  <TableCell>{r.distinct_periods}</TableCell>
                </TableRow>
              ))}
              {!loading && !rows.length && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No usage history found.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
