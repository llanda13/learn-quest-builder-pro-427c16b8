import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
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
import { ShieldCheck } from "lucide-react";

interface EvaluationRecord {
  id: string;
  generated_test_id: string;
  evaluator_name: string | null;
  evaluator_email: string | null;
  evaluator_role: string | null;
  decision: string;
  weighted_mean: number | null;
  interpretation: string | null;
  content_validity_index: number | null;
  comments: string | null;
  created_at: string;
  test_title?: string | null;
  test_subject?: string | null;
}

export default function EvaluationRecords() {
  const [rows, setRows] = useState<EvaluationRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await (supabase as any)
        .from("test_validations")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);

      const records = (data ?? []) as EvaluationRecord[];
      const testIds = Array.from(new Set(records.map((r) => r.generated_test_id)));
      if (testIds.length) {
        const { data: tests } = await (supabase as any)
          .from("generated_tests")
          .select("id, title, subject")
          .in("id", testIds);
        const map = new Map((tests ?? []).map((t: any) => [t.id, t]));
        records.forEach((r) => {
          const t: any = map.get(r.generated_test_id);
          r.test_title = t?.title ?? null;
          r.test_subject = t?.subject ?? null;
        });
      }
      setRows(records);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="container mx-auto py-8 px-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-6 w-6" />
            Evaluation Records
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Read-only audit trail of every Expert Validation. Records are attributed to the
            authenticated evaluator who performed the review — administrators cannot submit or
            edit an evaluation on anyone's behalf.
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground py-6">Loading evaluation records…</p>
          ) : rows.length === 0 ? (
            <p className="text-muted-foreground py-6">No evaluations have been submitted yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date / Time</TableHead>
                  <TableHead>Evaluator</TableHead>
                  <TableHead>Questionnaire</TableHead>
                  <TableHead>Rating</TableHead>
                  <TableHead>CVI</TableHead>
                  <TableHead>Result</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="whitespace-nowrap">
                      {new Date(r.created_at).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{r.evaluator_name || "—"}</div>
                      <div className="text-xs text-muted-foreground">
                        {r.evaluator_email || "—"} · {r.evaluator_role || "evaluator"}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="font-medium">{r.test_title || r.generated_test_id}</div>
                      <div className="text-xs text-muted-foreground">{r.test_subject || "—"}</div>
                    </TableCell>
                    <TableCell>
                      {r.weighted_mean ?? "—"}
                      <div className="text-xs text-muted-foreground">{r.interpretation || ""}</div>
                    </TableCell>
                    <TableCell>{r.content_validity_index ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={r.decision === "approved" ? "default" : "destructive"}>
                        {r.decision === "approved" ? "Validated" : "Revision Requested"}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
