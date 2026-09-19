import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { describeTosLink } from "@/services/db/tosLink";

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
  /** Persisted TOS id — when provided, the panel loads the stored TOS and renders it verbatim
   *  (no redistribution, recalculation, rounding, or regeneration). */
  tosId?: string | null;
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

type MatrixShape = {
  topics: string[];
  blooms: string[];
  cells: Record<string, Record<string, { count: number; items: number[] }>>;
  topicTotals: Record<string, number>;
  bloomTotals: Record<string, number>;
  total: number;
};

/** Build the render matrix from the persisted tos_entries.distribution (canonical form).
 *  `topicOrder`, when provided, comes from `tos_entries.topics` and is the authoritative
 *  ordering saved by the teacher — no alphabetical / total-based sort is ever applied. */
function fromDistribution(
  dist: Record<string, any>,
  topicOrder?: string[],
): MatrixShape | null {
  if (!dist || typeof dist !== "object") return null;
  const distKeys = Object.keys(dist);
  if (!distKeys.length) return null;

  // Preserve the teacher's original topic order. Prefer the explicit topics array from
  // tos_entries; fall back to the distribution's own insertion order. Never sort.
  let topics: string[];
  if (topicOrder && topicOrder.length) {
    const seen = new Set<string>();
    topics = [];
    topicOrder.forEach((t) => {
      if (t && dist[t] && !seen.has(t)) {
        topics.push(t);
        seen.add(t);
      }
    });
    distKeys.forEach((k) => {
      if (!seen.has(k)) topics.push(k);
    });
  } else {
    topics = distKeys;
  }

  // Detect canonical shape: { topic: { bloom: { count, items } } }
  const isCanonical = topics.some((t) => {
    const v = dist[t];
    return (
      v &&
      typeof v === "object" &&
      BLOOM_ORDER.some(
        (b) => v[b] && typeof v[b] === "object" && "count" in v[b],
      )
    );
  });
  if (!isCanonical) return null;

  const bloomsSet = new Set<string>();
  topics.forEach((t) => {
    const v = dist[t] || {};
    Object.keys(v).forEach((k) => {
      if (BLOOM_ORDER.includes(k)) bloomsSet.add(k);
    });
  });
  const blooms = BLOOM_ORDER.filter((b) => bloomsSet.has(b));

  const cells: MatrixShape["cells"] = {};
  const topicTotals: Record<string, number> = {};
  const bloomTotals: Record<string, number> = {};
  blooms.forEach((b) => (bloomTotals[b] = 0));
  let total = 0;

  topics.forEach((t) => {
    cells[t] = {};
    topicTotals[t] = 0;
    const v = dist[t] || {};
    blooms.forEach((b) => {
      const cell = v[b] || {};
      const count = Number(cell.count || 0);
      const items = Array.isArray(cell.items)
        ? cell.items.map((n: any) => Number(n)).filter((n) => Number.isFinite(n))
        : [];
      cells[t][b] = { count, items };
      topicTotals[t] += count;
      bloomTotals[b] += count;
      total += count;
    });
  });

  return { topics, blooms, cells, topicTotals, bloomTotals, total };
}

/** Build the render matrix from persisted learning_competencies rows.
 *  `topicOrder`, when provided, is the authoritative teacher-defined ordering
 *  (from tos_entries.topics). Rows matching that order come first, remaining
 *  rows keep their DB insertion order. No alphabetical/size-based sort is applied. */
function fromCompetencies(
  rows: any[],
  topicOrder?: string[],
): MatrixShape | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;

  const bloomsSet = new Set<string>();
  rows.forEach((r) => {
    BLOOM_ORDER.forEach((b) => {
      if (Number(r[`${b}_items`] || 0) > 0) bloomsSet.add(b);
    });
  });
  const hasStdColumns = rows.some((r) => "creating_items" in r);
  const blooms = hasStdColumns
    ? [...BLOOM_ORDER]
    : BLOOM_ORDER.filter((b) => bloomsSet.has(b));

  // Reorder rows to match the teacher's original topic sequence when available.
  let orderedRows = rows;
  if (topicOrder && topicOrder.length) {
    const remaining = [...rows];
    const picked: any[] = [];
    topicOrder.forEach((t) => {
      const idx = remaining.findIndex(
        (r) => (r.topic_name || "Unspecified") === t,
      );
      if (idx !== -1) picked.push(remaining.splice(idx, 1)[0]);
    });
    orderedRows = [...picked, ...remaining];
  }

  const topics: string[] = [];
  const cells: MatrixShape["cells"] = {};
  const topicTotals: Record<string, number> = {};
  const bloomTotals: Record<string, number> = {};
  blooms.forEach((b) => (bloomTotals[b] = 0));
  let total = 0;

  orderedRows.forEach((r) => {
    const topic = r.topic_name || "Unspecified";
    topics.push(topic);
    cells[topic] = {};
    topicTotals[topic] = 0;
    const itemNums: Record<string, number[]> = {};
    const raw = r.item_numbers;
    if (raw && typeof raw === "object" && !Array.isArray(raw)) {
      Object.entries(raw as Record<string, any>).forEach(([k, v]) => {
        if (Array.isArray(v)) {
          itemNums[k.toLowerCase()] = v
            .map((n: any) => Number(n))
            .filter((n) => Number.isFinite(n));
        }
      });
    }
    blooms.forEach((b) => {
      const count = Number(r[`${b}_items`] || 0);
      const items = itemNums[b] || [];
      cells[topic][b] = { count, items };
      topicTotals[topic] += count;
      bloomTotals[b] += count;
      total += count;
    });
  });

  return { topics, blooms, cells, topicTotals, bloomTotals, total };
}

/** Last-resort: derive from questionnaire items (used only when no persisted TOS is found). */
function fromItems(items: TestItem[]): MatrixShape {
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

  const cells: MatrixShape["cells"] = {};
  const topicTotals: Record<string, number> = {};
  const bloomTotals: Record<string, number> = {};
  blooms.forEach((b) => (bloomTotals[b] = 0));
  topics.forEach((t) => {
    cells[t] = {};
    topicTotals[t] = 0;
    blooms.forEach((b) => (cells[t][b] = { count: 0, items: [] }));
  });
  items.forEach((it, i) => {
    const t = it.topic || "Unspecified";
    const b = (it.bloom_level || "").toLowerCase();
    if (cells[t] && cells[t][b]) {
      cells[t][b].count += 1;
      cells[t][b].items.push(i + 1);
      topicTotals[t] += 1;
      bloomTotals[b] += 1;
    }
  });

  return {
    topics,
    blooms,
    cells,
    topicTotals,
    bloomTotals,
    total: items.length,
  };
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
  tosId,
  actions,
}: Props) {
  const [persisted, setPersisted] = useState<MatrixShape | null>(null);
  const [loadedTosId, setLoadedTosId] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<
    null | "missing" | "not_found" | "empty" | "failed"
  >(null);

  // Load the exact persisted TOS whenever a tosId is provided.
  useEffect(() => {
    let cancelled = false;
    const link = describeTosLink(tosId);
    if (link.status !== "ok") {
      setPersisted(null);
      setLoadedTosId(null);
      setLoadError(link.status === "missing" ? "missing" : "not_found");
      return;
    }
    setLoadError(null);
    (async () => {
      try {
        const { data: entry } = await supabase
          .from("tos_entries")
          .select("distribution, topics")
          .eq("id", tosId)
          .maybeSingle();

        // Extract the teacher's original topic ordering from tos_entries.topics.
        // This is the authoritative sequence and must never be re-sorted.
        let topicOrder: string[] | undefined;
        if (entry && Array.isArray((entry as any).topics)) {
          topicOrder = ((entry as any).topics as any[])
            .map((t) => (typeof t === "string" ? t : t?.topic || t?.name))
            .filter((t): t is string => typeof t === "string" && t.length > 0);
        }

        let shape: MatrixShape | null = null;
        if (entry && entry.distribution) {
          shape = fromDistribution(
            entry.distribution as Record<string, any>,
            topicOrder,
          );
        }
        if (!shape) {
          // Preserve teacher's original ordering via the row's own creation sequence.
          // Order by `id` (stable insertion order) instead of created_at, which can be
          // identical for rows saved in the same transaction and then sort unpredictably.
          const { data: comps } = await supabase
            .from("learning_competencies")
            .select("*")
            .eq("tos_id", tosId)
            .order("id", { ascending: true });
          shape = fromCompetencies(comps || [], topicOrder);
        }
        if (!cancelled) {
          setPersisted(shape);
          setLoadedTosId(tosId);
          setLoadError(!entry ? "not_found" : shape ? null : "empty");
        }
      } catch (err) {
        console.warn("TOSReferencePanel: failed to load persisted TOS", err);
        if (!cancelled) {
          setPersisted(null);
          setLoadedTosId(tosId);
          setLoadError("failed");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tosId]);

  const derived = useMemo(() => fromItems(items), [items]);

  // When a tosId is supplied, wait for the persisted load to finish before showing
  // anything — never fall back to a recomputed matrix that would contradict the
  // original TOS.
  const awaitingPersisted = !!tosId && loadedTosId !== tosId && !loadError;
  const shape = persisted ?? (tosId ? null : derived);
  const displayTotal = shape ? shape.total || totalItems : totalItems;

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
            <Badge variant="outline">{displayTotal} items</Badge>
          </div>
        </div>
        {actions && <div className="shrink-0">{actions}</div>}
      </div>

      <div className="overflow-auto max-h-56">
        {awaitingPersisted ? (
          <div className="p-4 text-xs text-muted-foreground">
            Loading original Table of Specification…
          </div>
        ) : !shape ? (
          <div className="p-4">
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
              <p className="font-semibold">
                {loadError === "missing"
                  ? "This questionnaire has no Table of Specification attached."
                  : loadError === "empty"
                    ? "The linked Table of Specification has no saved item distribution."
                    : loadError === "failed"
                      ? "The Table of Specification could not be loaded right now."
                      : "The linked Table of Specification record could not be found."}
              </p>
              <p className="mt-1 text-destructive/90">
                {loadError === "missing"
                  ? "It was created before questionnaires were permanently linked to their TOS. Ask the teacher to regenerate it from the original TOS — no substitute TOS is shown here."
                  : loadError === "failed"
                    ? "Please refresh the page. No substitute TOS is shown."
                    : "It may have been removed or replaced. The evaluation must use the original TOS, so nothing is shown in its place."}
              </p>
              {tosId && (
                <p className="mt-1 font-mono text-[10px] opacity-70">
                  TOS reference: {tosId}
                </p>
              )}
            </div>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead className="bg-muted/50 sticky top-0 z-10">
              <tr>
                <th className="text-left px-3 py-2 font-medium">Topic</th>
                {shape.blooms.map((b) => (
                  <th key={b} className="text-center px-2 py-2 font-medium capitalize">
                    {b}
                  </th>
                ))}
                <th className="text-center px-3 py-2 font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {shape.topics.map((t) => (
                <tr key={t} className="border-t">
                  <td className="px-3 py-1.5 font-medium">{t}</td>
                  {shape.blooms.map((b) => {
                    const cell = shape.cells[t]?.[b] || { count: 0, items: [] };
                    return (
                      <td key={b} className="text-center px-2 py-1.5">
                        {cell.count ? (
                          <div>
                            <div className="font-semibold">{cell.count}</div>
                            {cell.items.length > 0 && (
                              <div className="text-[10px] text-muted-foreground">
                                {formatItemNumbers(cell.items)}
                              </div>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="text-center px-3 py-1.5 font-semibold">
                    {shape.topicTotals[t] || 0}
                  </td>
                </tr>
              ))}
              <tr className="border-t bg-muted/30">
                <td className="px-3 py-1.5 font-semibold">Total</td>
                {shape.blooms.map((b) => (
                  <td key={b} className="text-center px-2 py-1.5 font-semibold">
                    {shape.bloomTotals[b] || 0}
                  </td>
                ))}
                <td className="text-center px-3 py-1.5 font-bold">
                  {shape.total || displayTotal}
                </td>
              </tr>
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
