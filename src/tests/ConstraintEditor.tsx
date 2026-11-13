import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { generateUUID } from "@/utils/uuid";
import { Plus, Trash2 } from "lucide-react";

export interface Constraint {
  id: string;
  type: 'topic_min' | 'topic_max' | 'bloom_required' | 'difficulty_balance';
  target: string;
  value: number;
}

interface ConstraintEditorProps {
  constraints: Constraint[];
  onConstraintsChange: (constraints: Constraint[]) => void;
  topics: string[];
  bloomLevels: string[];
}

export function ConstraintEditor({ 
  constraints, 
  onConstraintsChange,
  topics,
  bloomLevels 
}: ConstraintEditorProps) {
  const addConstraint = (type: Constraint['type']) => {
    const newConstraint: Constraint = {
      id: generateUUID(),
      type,
      target: type.startsWith('topic') ? topics[0] || '' : bloomLevels[0] || '',
      value: type.includes('min') ? 1 : type.includes('max') ? 10 : 50
    };
    onConstraintsChange([...constraints, newConstraint]);
  };

  const removeConstraint = (id: string) => {
    onConstraintsChange(constraints.filter(c => c.id !== id));
  };

  const updateConstraint = (id: string, updates: Partial<Constraint>) => {
    onConstraintsChange(
      constraints.map(c => c.id === id ? { ...c, ...updates } : c)
    );
  };

  const difficultyDistribution = constraints.find(c => c.type === 'difficulty_balance');

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Topic Constraints</CardTitle>
          <CardDescription>Set minimum and maximum questions per topic</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {constraints.filter(c => c.type.startsWith('topic')).map(constraint => (
            <div key={constraint.id} className="flex items-center gap-4">
              <select
                value={constraint.target}
                onChange={(e) => updateConstraint(constraint.id, { target: e.target.value })}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                aria-label={`Select topic for ${constraint.type === 'topic_min' ? 'minimum' : 'maximum'} constraint`}
              >
                {topics.map(topic => (
                  <option key={topic} value={topic}>{topic}</option>
                ))}
              </select>
              <Label className="min-w-[60px]">{constraint.type === 'topic_min' ? 'Min' : 'Max'}:</Label>
              <Input
                type="number"
                min={0}
                value={constraint.value}
                onChange={(e) => updateConstraint(constraint.id, { value: parseInt(e.target.value) })}
                className="w-20"
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeConstraint(constraint.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => addConstraint('topic_min')}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Min
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => addConstraint('topic_max')}
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Max
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Bloom's Taxonomy Requirements</CardTitle>
          <CardDescription>Required number of questions per cognitive level</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {constraints.filter(c => c.type === 'bloom_required').map(constraint => (
            <div key={constraint.id} className="flex items-center gap-4">
              <select
                value={constraint.target}
                onChange={(e) => updateConstraint(constraint.id, { target: e.target.value })}
                className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm"
                aria-label="Select Bloom's taxonomy level for requirement constraint"
              >
                {bloomLevels.map(level => (
                  <option key={level} value={level}>{level}</option>
                ))}
              </select>
              <Label className="min-w-[80px]">Required:</Label>
              <Input
                type="number"
                min={0}
                value={constraint.value}
                onChange={(e) => updateConstraint(constraint.id, { value: parseInt(e.target.value) })}
                className="w-20"
              />
              <Button
                variant="ghost"
                size="icon"
                onClick={() => removeConstraint(constraint.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            onClick={() => addConstraint('bloom_required')}
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Requirement
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Difficulty Balance</CardTitle>
          <CardDescription>Target percentage for difficulty distribution</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between mb-2">
                <Label>Easy - Medium - Hard</Label>
                <span className="text-sm text-muted-foreground">
                  {difficultyDistribution?.value || 50}% balanced
                </span>
              </div>
              <Slider
                value={[difficultyDistribution?.value || 50]}
                min={0}
                max={100}
                step={10}
                onValueChange={([value]) => {
                  if (difficultyDistribution) {
                    updateConstraint(difficultyDistribution.id, { value });
                  } else {
                    addConstraint('difficulty_balance');
                  }
                }}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
