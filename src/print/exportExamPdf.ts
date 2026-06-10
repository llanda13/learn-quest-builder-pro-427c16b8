// Native jsPDF renderer that draws the exam directly from a prepared
// ExamRenderModel using text/line/rect primitives. No html2canvas, no DOM
// rasterization.

import jsPDF from "jspdf";
import { ExamRenderModel } from "./useExamRenderModel";
import { getLogoDataUrl } from "./assets";

const PAGE = { w: 210, h: 297 }; // A4 mm
const MARGIN = { x: 12, y: 12 };
const USABLE_W = PAGE.w - MARGIN.x * 2;
const USABLE_H = PAGE.h - MARGIN.y * 2;

const FS = {
  isoName: 9,
  isoSub: 7.5,
  isoMeta: 7,
  title: 14,
  examPeriod: 11,
  acadYear: 10,
  subject: 11,
  student: 10,
  instrHead: 11,
  instrBody: 9,
  body: 9.5,
  secLabel: 10,
  secInstr: 9,
  question: 9.5,
  option: 9,
  essayPts: 8,
  preparedBy: 10,
  answerKey: 12,
  answerItem: 10,
};

const LINE = 1.35; // mm per text line at ~10pt — we'll compute per call

function ptToMm(pt: number): number {
  return (pt * 25.4) / 72;
}

function lineHeight(fontSizePt: number, factor = 1.25): number {
  return ptToMm(fontSizePt) * factor;
}

interface Ctx {
  pdf: jsPDF;
  y: number;
  page: number;
}

function newPage(ctx: Ctx) {
  ctx.pdf.addPage();
  ctx.y = MARGIN.y;
  ctx.page += 1;
}

function ensureSpace(ctx: Ctx, needed: number) {
  if (ctx.y + needed > PAGE.h - MARGIN.y) newPage(ctx);
}

function setFont(pdf: jsPDF, sizePt: number, style: "normal" | "bold" | "italic" | "bolditalic" = "normal") {
  pdf.setFont("times", style);
  pdf.setFontSize(sizePt);
}

// Draw an array of wrapped text lines at (x, y) and advance ctx.y.
function drawLines(ctx: Ctx, lines: string[], x: number, sizePt: number, opts: { align?: "left" | "center" | "right"; gapAfter?: number } = {}) {
  const lh = lineHeight(sizePt);
  for (const line of lines) {
    ensureSpace(ctx, lh);
    const tx = opts.align === "center" ? PAGE.w / 2 : opts.align === "right" ? PAGE.w - MARGIN.x : x;
    ctx.pdf.text(line, tx, ctx.y + lh - 1.2, opts.align ? { align: opts.align } : undefined);
    ctx.y += lh;
  }
  if (opts.gapAfter) ctx.y += opts.gapAfter;
}

function drawWrapped(ctx: Ctx, text: string, x: number, maxW: number, sizePt: number, style: "normal" | "bold" | "italic" | "bolditalic" = "normal", opts: { align?: "left" | "center" | "right"; gapAfter?: number } = {}) {
  setFont(ctx.pdf, sizePt, style);
  const lines = ctx.pdf.splitTextToSize(text || "", maxW) as string[];
  drawLines(ctx, lines, x, sizePt, opts);
}

function drawHeader(ctx: Ctx, model: ExamRenderModel, logo: string) {
  const { pdf } = ctx;
  const logoSize = 22; // mm (~62pt)
  const startY = ctx.y;

  // Logo
  if (logo) {
    try {
      pdf.addImage(logo, "PNG", MARGIN.x, startY, logoSize, logoSize, undefined, "FAST");
    } catch {
      // ignore image errors
    }
  }

  // Right metadata table
  const metaW = 50;
  const metaX = PAGE.w - MARGIN.x - metaW;
  setFont(pdf, FS.isoMeta, "normal");
  const rows: [string, string][] = [
    ["Doc No.:", "F-DOI-018"],
    ["Effective Date:", "08/25/2017"],
    ["Rev No.:", "0"],
    ["Page No.:", `${ctx.page}`],
  ];
  const rowH = 4.2;
  rows.forEach((row, i) => {
    const ry = startY + i * rowH;
    pdf.rect(metaX, ry, 22, rowH);
    pdf.rect(metaX + 22, ry, metaW - 22, rowH);
    pdf.text(row[0], metaX + 1, ry + rowH - 1.3);
    pdf.text(row[1], metaX + 23, ry + rowH - 1.3);
  });

  // Center institution info
  const infoX = MARGIN.x + logoSize + 4;
  const infoW = metaX - infoX - 4;
  setFont(pdf, FS.isoName, "bold");
  const nameLines = pdf.splitTextToSize(
    "AGUSAN DEL SUR STATE COLLEGE OF AGRICULTURE AND TECHNOLOGY",
    infoW,
  ) as string[];
  let infoY = startY + 3;
  nameLines.forEach((l) => {
    pdf.text(l, infoX, infoY);
    infoY += lineHeight(FS.isoName);
  });
  setFont(pdf, FS.isoSub, "normal");
  ["Bunawan, Agusan del Sur", "website: http://asscat.edu.ph", "email address: op@asscat.edu.ph; mobile no.: +639486379266"].forEach((l) => {
    pdf.text(l, infoX, infoY);
    infoY += lineHeight(FS.isoSub);
  });

  ctx.y = startY + Math.max(logoSize, infoY - startY, rowH * rows.length) + 3;

  // Title box
  setFont(pdf, FS.title, "bold");
  const titleH = 8;
  pdf.rect(MARGIN.x, ctx.y, USABLE_W, titleH);
  pdf.text("TEST QUESTIONNAIRE", PAGE.w / 2, ctx.y + titleH - 2.3, { align: "center" });
  ctx.y += titleH + 3;

  // Exam period + academic year + subject
  drawWrapped(ctx, `${model.examPeriod || "Midterm"} Examination`, MARGIN.x, USABLE_W, FS.examPeriod, "normal", { align: "center" });
  drawWrapped(
    ctx,
    `Academic Year: ${model.schoolYear || "____ – ____"}${model.semester ? `: ${model.semester}` : ""}`,
    MARGIN.x,
    USABLE_W,
    FS.acadYear,
    "normal",
    { align: "center" },
  );
  drawWrapped(ctx, model.subject || model.title, MARGIN.x, USABLE_W, FS.subject, "bolditalic", {
    align: "center",
    gapAfter: 2,
  });

  // Student fields grid
  setFont(pdf, FS.student, "normal");
  const colW = USABLE_W / 2;
  const fieldH = lineHeight(FS.student) + 1;
  const labels: [string, string][] = [
    ["Name:", "Score:"],
    ["Course/Year/Sec.:", "Instructor:"],
  ];
  labels.forEach((row) => {
    ensureSpace(ctx, fieldH);
    [0, 1].forEach((c) => {
      const baseX = MARGIN.x + c * colW;
      const label = row[c];
      pdf.text(label, baseX, ctx.y + fieldH - 1.5);
      const labelW = pdf.getTextWidth(label) + 1.5;
      pdf.line(baseX + labelW, ctx.y + fieldH - 1.2, baseX + colW - 6, ctx.y + fieldH - 1.2);
    });
    ctx.y += fieldH;
  });

  // Thick rule
  ctx.y += 2;
  pdf.setLineWidth(0.5);
  pdf.line(MARGIN.x, ctx.y, PAGE.w - MARGIN.x, ctx.y);
  pdf.setLineWidth(0.2);
  ctx.y += 3;

  // Instructions
  drawWrapped(ctx, "General Instructions:", MARGIN.x, USABLE_W, FS.instrHead, "bold");
  drawWrapped(ctx, model.instructions, MARGIN.x, USABLE_W, FS.instrBody, "italic", { gapAfter: 2 });

  drawWrapped(
    ctx,
    "Read and analyze each of the following questions carefully. Write the CAPITAL LETTER of your choice on the space provided. NOTE: Do not use sticky tape or any kind of eraser fluid to change your answers. MODIFIED/ERASURES IN ANSWERS ARE CONSIDERED WRONG.",
    MARGIN.x,
    USABLE_W,
    FS.instrBody,
    "normal",
    { gapAfter: 3 },
  );
}

function measureQuestionHeight(pdf: jsPDF, text: string, indent: number, sizePt: number): number {
  pdf.setFont("times", "normal");
  pdf.setFontSize(sizePt);
  const lines = pdf.splitTextToSize(text, USABLE_W - indent) as string[];
  return lines.length * lineHeight(sizePt);
}

function drawQuestion(ctx: Ctx, num: number, text: string, sizePt: number, indent = 6): number {
  const { pdf } = ctx;
  setFont(pdf, sizePt, "normal");
  const numStr = `${num}.`;
  const numW = 6;
  const lines = pdf.splitTextToSize(text, USABLE_W - indent) as string[];
  const lh = lineHeight(sizePt);
  const total = lines.length * lh;
  ensureSpace(ctx, total);
  // Draw number
  setFont(pdf, sizePt, "bold");
  pdf.text(numStr, MARGIN.x, ctx.y + lh - 1.2);
  // Draw text
  setFont(pdf, sizePt, "normal");
  lines.forEach((l, i) => {
    pdf.text(l, MARGIN.x + indent, ctx.y + lh - 1.2 + i * lh);
  });
  ctx.y += total;
  return total;
}

function drawMcqOptions(ctx: Ctx, options: { key: string; text: string }[], sizePt: number) {
  if (options.length === 0) return;
  const { pdf } = ctx;
  const colGap = 6;
  const colW = (USABLE_W - 6 - colGap) / 2;
  setFont(pdf, sizePt, "normal");
  // Pre-wrap each option into lines and compute total per row.
  const wrapped = options.map((o) => {
    const text = `${o.key.toLowerCase()}. ${o.text}`;
    return pdf.splitTextToSize(text, colW) as string[];
  });
  const lh = lineHeight(sizePt);
  // Lay out in 2 columns row-major
  for (let i = 0; i < wrapped.length; i += 2) {
    const left = wrapped[i];
    const right = wrapped[i + 1] || [];
    const rowLines = Math.max(left.length, right.length);
    const rowH = rowLines * lh;
    ensureSpace(ctx, rowH);
    left.forEach((l, k) => pdf.text(l, MARGIN.x + 6, ctx.y + lh - 1.2 + k * lh));
    right.forEach((l, k) => pdf.text(l, MARGIN.x + 6 + colW + colGap, ctx.y + lh - 1.2 + k * lh));
    ctx.y += rowH;
  }
  ctx.y += 1;
}

function drawSection(ctx: Ctx, section: ExamRenderModel["sections"][number]) {
  const { pdf } = ctx;
  ctx.y += 3;
  // Section label + instruction (keep together if possible)
  const labelH = lineHeight(FS.secLabel);
  const instrLines = pdf.splitTextToSize(section.instruction, USABLE_W) as string[];
  const instrH = instrLines.length * lineHeight(FS.secInstr);
  ensureSpace(ctx, labelH + instrH + 4);

  setFont(pdf, FS.secLabel, "bold");
  pdf.text(`${section.label}:`, MARGIN.x, ctx.y + labelH - 1.2);
  // Underline label
  const labelW = pdf.getTextWidth(`${section.label}:`);
  pdf.line(MARGIN.x, ctx.y + labelH - 0.6, MARGIN.x + labelW, ctx.y + labelH - 0.6);
  ctx.y += labelH;

  setFont(pdf, FS.secInstr, "italic");
  instrLines.forEach((l) => {
    pdf.text(l, MARGIN.x, ctx.y + lineHeight(FS.secInstr) - 1.2);
    ctx.y += lineHeight(FS.secInstr);
  });
  ctx.y += 2;

  // Items
  for (const item of section.items) {
    if (section.kind === "mcq") {
      // Try to keep question + first row of options together by snapshotting y
      const qH = measureQuestionHeight(pdf, item.text, 6, FS.question);
      const firstOpts = item.options.slice(0, 2).map((o) => `${o.key.toLowerCase()}. ${o.text}`);
      const colW = (USABLE_W - 12) / 2;
      let firstRowH = lineHeight(FS.option);
      firstOpts.forEach((t) => {
        const lines = pdf.splitTextToSize(t, colW) as string[];
        firstRowH = Math.max(firstRowH, lines.length * lineHeight(FS.option));
      });
      ensureSpace(ctx, qH + firstRowH + 1);
      drawQuestion(ctx, item.number, item.text, FS.question);
      drawMcqOptions(ctx, item.options, FS.option);
    } else if (section.kind === "true_false") {
      const lh = lineHeight(FS.question);
      const lines = pdf.splitTextToSize(item.text, USABLE_W - 30) as string[];
      const total = lines.length * lh;
      ensureSpace(ctx, total);
      setFont(pdf, FS.question, "bold");
      pdf.text(`${item.number}.`, MARGIN.x, ctx.y + lh - 1.2);
      // Short blank
      pdf.line(MARGIN.x + 6, ctx.y + lh - 1.0, MARGIN.x + 24, ctx.y + lh - 1.0);
      setFont(pdf, FS.question, "normal");
      lines.forEach((l, i) => pdf.text(l, MARGIN.x + 28, ctx.y + lh - 1.2 + i * lh));
      ctx.y += total + 0.5;
    } else if (section.kind === "fill_blank") {
      drawQuestion(ctx, item.number, item.text, FS.question);
      ctx.y += 0.5;
    } else if (section.kind === "essay") {
      // Question line with points
      const ptsLabel = `(${item.points} ${item.points === 1 ? "point" : "points"})`;
      setFont(pdf, FS.essayPts, "normal");
      const ptsW = pdf.getTextWidth(ptsLabel);
      const textMaxW = USABLE_W - 6 - ptsW - 3;
      setFont(pdf, FS.question, "normal");
      const lines = pdf.splitTextToSize(item.text, textMaxW) as string[];
      const lh = lineHeight(FS.question);
      const qH = lines.length * lh;
      const lineCount = Math.max(5, item.points * 2);
      const linesBlockH = lineCount * 7 + 2; // 7mm per writing line
      ensureSpace(ctx, qH + linesBlockH + 2);
      setFont(pdf, FS.question, "bold");
      pdf.text(`${item.number}.`, MARGIN.x, ctx.y + lh - 1.2);
      setFont(pdf, FS.question, "normal");
      lines.forEach((l, i) => pdf.text(l, MARGIN.x + 6, ctx.y + lh - 1.2 + i * lh));
      setFont(pdf, FS.essayPts, "normal");
      pdf.text(ptsLabel, PAGE.w - MARGIN.x - ptsW, ctx.y + lh - 1.2);
      ctx.y += qH + 1;
      // Writing lines
      pdf.setDrawColor(150);
      for (let i = 0; i < lineCount; i++) {
        ctx.y += 7;
        pdf.line(MARGIN.x + 6, ctx.y, PAGE.w - MARGIN.x, ctx.y);
      }
      pdf.setDrawColor(0);
      ctx.y += 2;
    }
  }
}

function drawPreparedBy(ctx: Ctx, model: ExamRenderModel) {
  const { pdf } = ctx;
  const needed = 22;
  ensureSpace(ctx, needed);
  ctx.y += 10;
  setFont(pdf, FS.preparedBy, "normal");
  pdf.text("Prepared by:", MARGIN.x, ctx.y);
  ctx.y += 10;
  setFont(pdf, FS.preparedBy, "bold");
  pdf.text((model.preparedBy || "________________________").toUpperCase(), MARGIN.x, ctx.y);
  ctx.y += 5;
  setFont(pdf, FS.instrBody, "italic");
  pdf.text("Subject Instructor", MARGIN.x, ctx.y);
}

function drawAnswerKey(ctx: Ctx, model: ExamRenderModel) {
  if (!model.showAnswerKey || model.answerKey.length === 0) return;
  newPage(ctx);
  const { pdf } = ctx;
  setFont(pdf, FS.answerKey, "bold");
  pdf.text("ANSWER KEY", PAGE.w / 2, ctx.y + 8, { align: "center" });
  pdf.line(MARGIN.x, ctx.y + 12, PAGE.w - MARGIN.x, ctx.y + 12);
  ctx.y += 18;

  const cols = model.answerKey.length > 40 ? 3 : 2;
  const colGap = 8;
  const colW = (USABLE_W - colGap * (cols - 1)) / cols;
  const perCol = Math.ceil(model.answerKey.length / cols);
  setFont(pdf, FS.answerItem, "normal");
  const lh = lineHeight(FS.answerItem);
  for (let c = 0; c < cols; c++) {
    const x = MARGIN.x + c * (colW + colGap);
    for (let r = 0; r < perCol; r++) {
      const idx = c * perCol + r;
      if (idx >= model.answerKey.length) break;
      const item = model.answerKey[idx];
      const line = `${item.number}. ${item.answer}`;
      pdf.text(line, x, ctx.y + lh * r + lh - 1.2);
    }
  }
}

export interface ExportResult {
  ok: boolean;
  filename?: string;
  durationMs: number;
  error?: string;
}

export async function exportExamPdf(model: ExamRenderModel): Promise<ExportResult> {
  const t0 = performance.now();
  try {
    const logo = await getLogoDataUrl();
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    pdf.setLineWidth(0.2);
    const ctx: Ctx = { pdf, y: MARGIN.y, page: 1 };
    drawHeader(ctx, model, logo);
    for (const section of model.sections) drawSection(ctx, section);
    drawPreparedBy(ctx, model);
    drawAnswerKey(ctx, model);

    const baseTitle = (model.title || "exam").toLowerCase().replace(/\s+/g, "-");
    const filename = `${baseTitle}.pdf`;
    pdf.save(filename);
    return { ok: true, filename, durationMs: performance.now() - t0 };
  } catch (e: any) {
    return { ok: false, durationMs: performance.now() - t0, error: e?.message || String(e) };
  }
}
