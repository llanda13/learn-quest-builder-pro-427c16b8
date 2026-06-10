import { useEffect, useState } from "react";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Trash2, Rotate3D } from "lucide-react";
import {
  listRotationSettings,
  upsertRotationSettings,
  deleteSubjectOverride,
  DEFAULT_ROTATION_SETTINGS,
  type RotationSettings,
} from "@/services/rotation/rotationSettings";

export default function RotationSettingsPage() {
  const [rows, setRows] = useState<RotationSettings[]>([]);
  const [loading, setLoading] = useState(true);
  const [global, setGlobal] = useState<RotationSettings>(DEFAULT_ROTATION_SETTINGS);
  const [newSubject, setNewSubject] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const data = await listRotationSettings();
      setRows(data);
      const g = data.find((r) => !r.subject) ?? DEFAULT_ROTATION_SETTINGS;
      setGlobal(g);
    } catch (e: any) {
      toast.error(e.message || "Failed to load rotation settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const saveGlobal = async () => {
    try {
      await upsertRotationSettings({ ...global, subject: null });
      toast.success("Global rotation settings saved");
      load();
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    }
  };

  const addOverride = async () => {
    if (!newSubject.trim()) return;
    try {
      await upsertRotationSettings({
        ...DEFAULT_ROTATION_SETTINGS,
        subject: newSubject.trim(),
      });
      setNewSubject("");
      toast.success("Subject override added");
      load();
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    }
  };

  const removeOverride = async (subject: string) => {
    try {
      await deleteSubjectOverride(subject);
      toast.success(`Removed override for ${subject}`);
      load();
    } catch (e: any) {
      toast.error(e.message || "Delete failed");
    }
  };

  const updateRow = async (row: RotationSettings) => {
    try {
      await upsertRotationSettings(row);
      toast.success(`Updated ${row.subject || "global"}`);
      load();
    } catch (e: any) {
      toast.error(e.message || "Save failed");
    }
  };

  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl space-y-6">
      <div>
        <h1 className="text-3xl font-bold mb-2 flex items-center gap-2">
          <Rotate3D className="h-7 w-7" /> Question Rotation
        </h1>
        <p className="text-muted-foreground">
          Control how often previously-used questions can return in new exams.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Global Defaults</CardTitle>
          <CardDescription>Applied to every subject unless overridden below.</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label>Cooldown periods (semesters)</Label>
            <Input
              type="number" min={0}
              value={global.cooldown_periods}
              onChange={(e) => setGlobal({ ...global, cooldown_periods: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-2">
            <Label>Similarity threshold (0–1)</Label>
            <Input
              type="number" step="0.05" min={0} max={1}
              value={global.similarity_threshold}
              onChange={(e) => setGlobal({ ...global, similarity_threshold: Number(e.target.value) })}
            />
          </div>
          <div className="space-y-2">
            <Label>Max reuse frequency</Label>
            <Input
              type="number" min={1}
              value={global.max_reuse_frequency}
              onChange={(e) => setGlobal({ ...global, max_reuse_frequency: Number(e.target.value) })}
            />
          </div>
          <div className="flex items-center justify-between pt-6">
            <div>
              <Label>Prefer unused questions</Label>
              <p className="text-sm text-muted-foreground">
                Hard-skip recently used items when alternatives exist.
              </p>
            </div>
            <Switch
              checked={global.prefer_unused}
              onCheckedChange={(v) => setGlobal({ ...global, prefer_unused: v })}
            />
          </div>
          <div className="md:col-span-2">
            <Button onClick={saveGlobal} disabled={loading}>Save Global Settings</Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Per-Subject Overrides</CardTitle>
          <CardDescription>Tune rotation per subject when needed.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Subject (e.g. IS 9)"
              value={newSubject}
              onChange={(e) => setNewSubject(e.target.value)}
            />
            <Button onClick={addOverride}>Add Override</Button>
          </div>
          <Separator />
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subject</TableHead>
                <TableHead>Cooldown</TableHead>
                <TableHead>Similarity</TableHead>
                <TableHead>Max Reuse</TableHead>
                <TableHead>Prefer Unused</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.filter((r) => r.subject).map((r) => (
                <RotationRow key={r.subject!} row={r} onSave={updateRow} onDelete={removeOverride} />
              ))}
              {!loading && rows.filter((r) => r.subject).length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    No subject overrides yet.
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

function RotationRow({
  row, onSave, onDelete,
}: {
  row: RotationSettings;
  onSave: (r: RotationSettings) => void;
  onDelete: (subject: string) => void;
}) {
  const [draft, setDraft] = useState<RotationSettings>(row);
  return (
    <TableRow>
      <TableCell className="font-medium">{row.subject}</TableCell>
      <TableCell>
        <Input
          type="number" min={0} className="w-20"
          value={draft.cooldown_periods}
          onChange={(e) => setDraft({ ...draft, cooldown_periods: Number(e.target.value) })}
        />
      </TableCell>
      <TableCell>
        <Input
          type="number" step="0.05" min={0} max={1} className="w-24"
          value={draft.similarity_threshold}
          onChange={(e) => setDraft({ ...draft, similarity_threshold: Number(e.target.value) })}
        />
      </TableCell>
      <TableCell>
        <Input
          type="number" min={1} className="w-20"
          value={draft.max_reuse_frequency}
          onChange={(e) => setDraft({ ...draft, max_reuse_frequency: Number(e.target.value) })}
        />
      </TableCell>
      <TableCell>
        <Switch
          checked={draft.prefer_unused}
          onCheckedChange={(v) => setDraft({ ...draft, prefer_unused: v })}
        />
      </TableCell>
      <TableCell className="flex gap-2 justify-end">
        <Button size="sm" onClick={() => onSave(draft)}>Save</Button>
        <Button size="sm" variant="ghost" onClick={() => onDelete(row.subject!)}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </TableCell>
    </TableRow>
  );
}
