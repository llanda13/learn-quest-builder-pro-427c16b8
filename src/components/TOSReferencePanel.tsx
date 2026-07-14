import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";

interface TestItem {
  bloom_level?: string;
  topic?: string;
  points?: number;
}

interface Props {
  title?: string;
  course?: string;
  subject?: string;
  examPeriod?: string;
  schoolYear?: string;
  semester?: string;
  totalItems: number;
  items: TestItem[];
  /** Optional right-side slot (e.g., status badge, actions). */
  actions?: React.ReactNode;
}

const BLOOM_ORDER = [
  "remembering",
  "understanding",
  "applying",
  "analyzing",
  "evaluating",
  "creating",
];

function formatItemNumbers(nums: number[]): string {
  if (!nums.length) return "";
  const sorted = [...nums].sort((a, b) => a - b);
  const groups: string[] = [];
  let s = sorted[0];
  let e = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    if (sorted[i] === e + 1) e = sorted[i];
    else {
      groups.push(s === e ? `${s}` : `${s}-${e}`);
      s = e = sorted[i];
    }
  }
  groups.push(s === e ? `${s}` : `${s}-${e}`);
  return groups.join(", ");
}

export function TOSReferencePanel({
  title,
  course,
  subject,
  examPeriod,
  schoolYear,
  semester,
  totalItems,
  items,
  actions,
}: Props) {
  const { topics, bloomsPresent, matrix, topicTotals, bloomTotals } = useMemo(() => {
    const bloomsSet = new Set<string>();
    const topicSet = new Set<string>();
    items.forEach((it) => {
      if (it.bloom_level) bloomsSet.add(it.bloom_level.toLowerCase());
      topicSet.add(it.topic || "Unspecified");
    });
    const blooms = BLOOM_ORDER.filter((b) => bloomsSet.has(b)).concat(
      [...bloomsSet].filter((b) => !BLOOM_ORDER.includes(b)),
    );
    const topics = [...topicSet];

    const matrix: Record<string, Record<string, number[]>> = {};
    topics.forEach((t) => {
      matrix[t] = {};
      blooms.forEach((b) => (matrix[t][b] = []));
    });
    items.forEach((it, i) => {
      const t = it.topic || "Unspecified";
      const b = (it.bloom_level || "").toLowerCase();
      if (matrix[t] && matrix[t][b]) matrix[t][b].push(i + 1);
    });

    const topicTotals: Record<string, number> = {};
    topics.forEach(
      (t) =>
        (topicTotals[t] = blooms.reduce((s, b) => s + matrix[t][b].length, 0)),
    );
    const bloomTotals: Record<string, number> = {};
    blooms.forEach(
      (b) =>
        (bloomTotals[b] = topics.reduce((s, t) => s + matrix[t][b].length, 0)),
    );
    return { topics, bloomsPresent: blooms, matrix, topicTotals, bloomTotals };
  }, [items]);

  return (
    <div className="rounded-lg border bg-card shadow-sm">
      <div className="p-4 border-b flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold truncate">
            Table of Specifications — {title || "Untitled"}
          </h2>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {course && <Badge variant="secondary">{course}</Badge>}
            {subject && <Badge variant="secondary">{subject}</Badge>}
            {examPeriod && <Badge variant="secondary">{examPeriod}</Badge>}
            {schoolYear && <Badge variant="secondary">SY {schoolYear}</Badge>}
            {semester && <Badge variant="secondary">{semester}</Badge>}
            <Badge variant="outline">{totalItems} items</Badge>
          </div>
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>

      <div className="overflow-auto max-h-56">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 sticky top-0 z-10">
            <tr>
              <th className="text-left px-3 py-2 font-medium">Topic</th>
              {bloomsPresent.map((b) => (
                <th key={b} className="text-center px-2 py-2 font-medium capitalize">
                  {b}
                </th>
              ))}
              <th className="text-center px-3 py-2 font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {topics.map((t) => (
              <tr key={t} className="border-t">
                <td className="px-3 py-1.5 font-medium">{t}</td>
                {bloomsPresent.map((b) => {
                  const nums = matrix[t][b];
                  return (
                    <td key={b} className="text-center px-2 py-1.5">
                      {nums.length ? (
                        <div>
                          <div className="font-semibold">{nums.length}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {formatItemNumbers(nums)}
                          </div>
                        </div>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                  );
                })}
                <td className="text-center px-3 py-1.5 font-semibold">
                  {topicTotals[t]}
                </td>
              </tr>
            ))}
            <tr className="border-t bg-muted/30">
              <td className="px-3 py-1.5 font-semibold">Total</td>
              {bloomsPresent.map((b) => (
                <td key={b} className="text-center px-2 py-1.5 font-semibold">
                  {bloomTotals[b]}
                </td>
              ))}
              <td className="text-center px-3 py-1.5 font-bold">{totalItems}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
