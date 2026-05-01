import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, Check, Pencil, Plus, Trash2 } from "lucide-react";

export interface ParsedTOSData {
  subject_no: string;
  course: string;
  description: string;
  college?: string;
  year_section: string;
  exam_period: string;
  school_year: string;
  total_items: number;
  prepared_by: string;
  checked_by: string;
  noted_by: string;
  topics: Array<{
    topic: string;
    hours: number;
    remembering?: number;
    understanding?: number;
    applying?: number;
    analyzing?: number;
    evaluating?: number;
    creating?: number;
    total?: number;
  }>;
  _warnings?: string[];
}

interface TOSReviewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  data: ParsedTOSData;
  fileName: string;
  onConfirm: (data: ParsedTOSData) => void;
}

export function TOSReviewDialog({ open, onOpenChange, data, fileName, onConfirm }: TOSReviewDialogProps) {
  const [editData, setEditData] = useState<ParsedTOSData>(data);

  const updateField = (field: keyof ParsedTOSData, value: string | number) => {
    setEditData(prev => ({ ...prev, [field]: value }));
  };

  const updateTopic = (index: number, field: string, value: string | number) => {
    setEditData(prev => ({
      ...prev,
      topics: prev.topics.map((t, i) => i === index ? { ...t, [field]: value } : t),
    }));
  };

  const removeTopic = (index: number) => {
    if (editData.topics.length > 1) {
      setEditData(prev => ({
        ...prev,
        topics: prev.topics.filter((_, i) => i !== index),
      }));
    }
  };

  const addTopic = () => {
    setEditData(prev => ({
      ...prev,
      topics: [...prev.topics, { topic: "", hours: 0 }],
    }));
  };

  const totalHours = editData.topics.reduce((s, t) => s + (t.hours || 0), 0);
  const warnings = editData._warnings || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-5 w-5 text-primary" />
            Review Extracted Data
          </DialogTitle>
          <DialogDescription>
            Parsed from <strong>{fileName}</strong>. Please verify and correct any inaccurate values before applying.
          </DialogDescription>
        </DialogHeader>

        {warnings.length > 0 && (
          <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-3 space-y-1">
            <div className="flex items-center gap-2 text-destructive font-medium text-sm">
              <AlertTriangle className="h-4 w-4" />
              Extraction Warnings
            </div>
            {warnings.map((w, i) => (
              <p key={i} className="text-xs text-destructive/80 ml-6">• {w}</p>
            ))}
          </div>
        )}

        <ScrollArea className="max-h-[55vh] pr-4">
          <div className="space-y-4">
            {/* Subject Info */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Subject No.</Label>
                <Input
                  value={editData.subject_no}
                  onChange={e => updateField("subject_no", e.target.value)}
                  className={!editData.subject_no ? "border-amber-400" : ""}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Course</Label>
                <Input
                  value={editData.course}
                  onChange={e => updateField("course", e.target.value)}
                  className={!editData.course ? "border-amber-400" : ""}
                />
              </div>
              <div className="col-span-2">
                <Label className="text-xs text-muted-foreground">Description</Label>
                <Input
                  value={editData.description}
                  onChange={e => updateField("description", e.target.value)}
                  className={!editData.description ? "border-amber-400" : ""}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Year & Section</Label>
                <Input
                  value={editData.year_section}
                  onChange={e => updateField("year_section", e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Exam Period</Label>
                <Input
                  value={editData.exam_period}
                  onChange={e => updateField("exam_period", e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">School Year</Label>
                <Input
                  value={editData.school_year}
                  onChange={e => updateField("school_year", e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Total Items</Label>
                <Input
                  type="number"
                  value={editData.total_items}
                  onChange={e => updateField("total_items", Number(e.target.value))}
                />
              </div>
            </div>

            {/* Signatories */}
            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Prepared by</Label>
                <Input
                  value={editData.prepared_by}
                  onChange={e => updateField("prepared_by", e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Checked by</Label>
                <Input
                  value={editData.checked_by}
                  onChange={e => updateField("checked_by", e.target.value)}
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Noted by</Label>
                <Input
                  value={editData.noted_by}
                  onChange={e => updateField("noted_by", e.target.value)}
                />
              </div>
            </div>

            {/* Topics */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="font-medium">
                  Topics / Learning Competencies
                  <Badge variant="secondary" className="ml-2">{editData.topics.length}</Badge>
                </Label>
                <span className="text-xs text-muted-foreground">Total Hours: {totalHours}</span>
              </div>
              <div className="space-y-2">
                {editData.topics.map((topic, idx) => (
                  <div key={idx} className="flex gap-2 items-start">
                    <div className="flex-1">
                      <Input
                        value={topic.topic}
                        onChange={e => updateTopic(idx, "topic", e.target.value)}
                        placeholder="Topic name"
                        className={`text-sm ${!topic.topic ? "border-amber-400" : ""}`}
                      />
                    </div>
                    <div className="w-20">
                      <Input
                        type="number"
                        value={topic.hours}
                        onChange={e => updateTopic(idx, "hours", Number(e.target.value))}
                        placeholder="Hrs"
                        className="text-sm"
                      />
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0 h-9 w-9 text-muted-foreground hover:text-destructive"
                      onClick={() => removeTopic(idx)}
                      disabled={editData.topics.length <= 1}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={addTopic} className="gap-1">
                  <Plus className="h-3 w-3" /> Add Topic
                </Button>
              </div>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onConfirm(editData);
              onOpenChange(false);
            }}
            className="gap-2"
          >
            <Check className="h-4 w-4" />
            Apply to TOS Builder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
