import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { TestValidations, PendingTestRow } from "@/services/db/testValidations";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useUserRole } from "@/hooks/useUserRole";
import { Eye, ClipboardList, ArrowLeft } from "lucide-react";

export default function ValidatorDashboard() {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { isAdmin } = useUserRole();
  const [rows, setRows] = useState<PendingTestRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const data = await TestValidations.listPending();
        setRows(data);
      } catch (err: any) {
        toast({
          title: "Failed to load pending questionnaires",
          description: err?.message ?? String(err),
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    })();
  }, [toast]);

  const fmt = (d: string) =>
    new Date(d).toLocaleDateString("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });

  return (
    <div className="container mx-auto py-8 px-4 space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <ClipboardList className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-3xl font-bold">Pending Expert Validation</h1>
            <p className="text-sm text-muted-foreground">
              Each generated questionnaire is reviewed independently. Approve to make it
              eligible for printing and export.
            </p>
          </div>
        </div>
        {isAdmin && (
          <Button
            variant="outline"
            onClick={() => navigate("/admin/dashboard")}
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Admin Dashboard
          </Button>
        )}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {loading ? "Loading…" : `${rows.length} questionnaire(s) awaiting review`}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {rows.length === 0 && !loading ? (
            <div className="py-12 text-center text-muted-foreground">
              No questionnaires are currently pending validation.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Subject</TableHead>
                  <TableHead>Teacher</TableHead>
                  <TableHead>Exam Period</TableHead>
                  <TableHead>Items</TableHead>
                  <TableHead>Generated</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => {
                  const itemsCount = Array.isArray(r.items) ? r.items.length : 0;
                  return (
                    <TableRow key={r.id}>
                      <TableCell>
                        <div className="font-medium">
                          {r.course ? `${r.course} — ` : ""}
                          {r.subject || "Untitled subject"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {r.title || "—"}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {r.teacher_name || r.teacher_email || "Unknown"}
                        </div>
                        {r.teacher_name && r.teacher_email && (
                          <div className="text-xs text-muted-foreground">
                            {r.teacher_email}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-sm">
                        {r.exam_period || "—"}
                        <div className="text-xs text-muted-foreground">
                          {[r.school_year, r.semester].filter(Boolean).join(" · ")}
                        </div>
                      </TableCell>
                      <TableCell>{itemsCount}</TableCell>
                      <TableCell className="text-sm">{fmt(r.created_at)}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">Pending Validation</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          onClick={() => navigate(`/validator/review/${r.id}`)}
                        >
                          <Eye className="w-4 h-4 mr-1" />
                          Review
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
