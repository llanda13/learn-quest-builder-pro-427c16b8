import { useEffect, useState } from "react";
import { TestValidations, PendingTestRow } from "@/services/db/testValidations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { History as HistoryIcon } from "lucide-react";

const STATUS_LABEL: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
  pending_validation: { label: "Pending", variant: "secondary" },
  validated: { label: "Validated", variant: "default" },
  revision_requested: { label: "Revision Requested", variant: "destructive" },
};

export default function ValidatorHistory() {
  const [rows, setRows] = useState<PendingTestRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const data = await TestValidations.listAll();
      setRows(data);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="container mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center gap-3">
        <HistoryIcon className="w-6 h-6 text-primary" />
        <h1 className="text-3xl font-bold">Validation History</h1>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {loading ? "Loading…" : `${rows.length} questionnaire(s)`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subject</TableHead>
                <TableHead>Exam</TableHead>
                <TableHead>Generated</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => {
                const s = STATUS_LABEL[r.validation_status] ?? {
                  label: r.validation_status,
                  variant: "outline" as const,
                };
                return (
                  <TableRow key={r.id}>
                    <TableCell>
                      {r.course ? `${r.course} — ` : ""}
                      {r.subject || r.title || "—"}
                    </TableCell>
                    <TableCell className="text-sm">
                      {r.exam_period || "—"}{" "}
                      <span className="text-xs text-muted-foreground">
                        {[r.school_year, r.semester].filter(Boolean).join(" · ")}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      {new Date(r.created_at).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant={s.variant}>{s.label}</Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
