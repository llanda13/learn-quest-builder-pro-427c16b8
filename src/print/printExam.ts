// Open a dedicated print window with a self-contained HTML document built
// from the prepared ExamRenderModel. This avoids re-laying out the entire
// React app for window.print().

import { ExamRenderModel } from "./useExamRenderModel";
import { getLogoDataUrl } from "./assets";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderHeader(model: ExamRenderModel, logoDataUrl: string): string {
  return `
    <div class="iso-header">
      <div class="iso-logo">${
        logoDataUrl ? `<img src="${logoDataUrl}" alt="Logo" />` : ""
      }</div>
      <div class="iso-info">
        <div class="iso-name">AGUSAN DEL SUR STATE COLLEGE OF AGRICULTURE AND TECHNOLOGY</div>
        <div class="iso-sub">Bunawan, Agusan del Sur</div>
        <div class="iso-sub">website: <u>http://asscat.edu.ph</u></div>
        <div class="iso-sub">email address: <u>op@asscat.edu.ph</u>; mobile no.: +639486379266</div>
      </div>
      <table class="iso-meta">
        <tr><td>Doc No.:</td><td>F-DOI-018</td></tr>
        <tr><td>Effective Date:</td><td>08/25/2017</td></tr>
        <tr><td>Rev No.:</td><td>0</td></tr>
        <tr><td>Page No.:</td><td>1 of 1</td></tr>
      </table>
    </div>

    <div class="title-box">TEST QUESTIONNAIRE</div>
    <div class="center sm">${escapeHtml(model.examPeriod || "Midterm")} Examination</div>
    <div class="center xs">Academic Year: ${escapeHtml(model.schoolYear || "____ – ____")}${
      model.semester ? `: ${escapeHtml(model.semester)}` : ""
    }</div>
    <div class="center subject">${escapeHtml(model.subject || model.title)}</div>

    <div class="student-grid">
      <div><span>Name:</span><span class="line"></span></div>
      <div><span>Score:</span><span class="line"></span></div>
      <div><span>Course/Year/Sec.:</span><span class="line"></span></div>
      <div><span>Instructor:</span><span class="line"></span></div>
    </div>

    <hr class="thick" />

    <div class="instructions">
      <h3>General Instructions:</h3>
      <p class="italic justify sm">${escapeHtml(model.instructions)}</p>
    </div>

    <p class="sm justify">
      Read and analyze each of the following questions carefully. Write the <strong>CAPITAL LETTER</strong>
      of your choice on the space provided. <u>NOTE</u>: Do not use sticky tape or any kind of eraser fluid
      to change your answers. <em>MODIFIED/ERASURES IN ANSWERS ARE CONSIDERED WRONG.</em>
    </p>
  `;
}

function renderSection(section: ExamRenderModel["sections"][number]): string {
  const items = section.items
    .map((item) => {
      if (section.kind === "mcq") {
        const opts = item.options
          .map(
            (o) =>
              `<div class="opt"><span>${o.key.toLowerCase()}.</span><span>${escapeHtml(
                o.text,
              )}</span></div>`,
          )
          .join("");
        return `
          <div class="q mcq">
            <div class="q-line"><span class="num">${item.number}.</span><span>${escapeHtml(item.text)}</span></div>
            ${opts ? `<div class="opts">${opts}</div>` : ""}
          </div>`;
      }
      if (section.kind === "true_false") {
        return `
          <div class="q tf">
            <span class="num">${item.number}.</span>
            <span class="blank-short"></span>
            <span>${escapeHtml(item.text)}</span>
          </div>`;
      }
      if (section.kind === "fill_blank") {
        return `
          <div class="q fb">
            <span class="num">${item.number}.</span>
            <span>${escapeHtml(item.text)}</span>
          </div>`;
      }
      // essay
      const lines = Array.from({ length: Math.max(5, item.points * 2) })
        .map(() => `<div class="essay-line"></div>`)
        .join("");
      return `
        <div class="q essay">
          <div class="q-line">
            <span class="num">${item.number}.</span>
            <span>${escapeHtml(item.text)}</span>
            <span class="pts">(${item.points} ${item.points === 1 ? "point" : "points"})</span>
          </div>
          <div class="essay-lines">${lines}</div>
        </div>`;
    })
    .join("");

  return `
    <div class="section">
      <p class="sec-label">${escapeHtml(section.label)}:</p>
      <p class="sec-instr">${escapeHtml(section.instruction)}</p>
      ${items}
    </div>
  `;
}

function renderAnswerKey(model: ExamRenderModel): string {
  if (!model.showAnswerKey) return "";
  const cols = model.answerKey.length > 40 ? 3 : 2;
  const items = model.answerKey
    .map((k) => `<li>${escapeHtml(k.answer)}</li>`)
    .join("");
  return `
    <section class="answer-key">
      <h2>ANSWER KEY</h2>
      <ol style="column-count:${cols}">${items}</ol>
    </section>
  `;
}

function buildHtml(model: ExamRenderModel, logoDataUrl: string): string {
  const sectionsHtml = model.sections.map(renderSection).join("");
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(model.title)}</title>
<style>
  @page { size: A4; margin: 12mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: "Times New Roman", Times, serif; color: #000; font-size: 11pt; line-height: 1.35; }
  .iso-header { display: flex; align-items: flex-start; gap: 12pt; margin-bottom: 8pt; }
  .iso-logo { flex: 0 0 72pt; }
  .iso-logo img { width: 72pt; height: 72pt; object-fit: contain; }
  .iso-info { flex: 1; }
  .iso-name { font-weight: bold; font-size: 11pt; text-transform: uppercase; }
  .iso-sub { font-size: 9pt; }
  .iso-meta { border-collapse: collapse; font-size: 8.5pt; }
  .iso-meta td { border: 1px solid #000; padding: 2px 6px; }
  .title-box { text-align: center; font-weight: bold; font-size: 16pt; border: 2px solid #000; padding: 6px 0; margin: 8pt 0 10pt; letter-spacing: 1px; }
  .center { text-align: center; }
  .sm { font-size: 10pt; }
  .xs { font-size: 11pt; margin-bottom: 4pt; }
  .subject { font-size: 12pt; font-weight: bold; font-style: italic; margin-bottom: 10pt; }
  .student-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 4pt 24pt; margin-bottom: 6pt; font-size: 11pt; }
  .student-grid > div { display: flex; align-items: baseline; gap: 4pt; }
  .student-grid .line { flex: 1; border-bottom: 1px solid #000; height: 1em; }
  hr.thick { border: none; border-top: 2px solid #000; margin: 10pt 0; }
  .instructions h3 { font-size: 12pt; margin: 0 0 4pt; }
  .italic { font-style: italic; }
  .justify { text-align: justify; }
  .section { margin-top: 14pt; page-break-inside: auto; }
  .sec-label { font-size: 11pt; font-weight: bold; text-decoration: underline; margin: 0 0 2pt; }
  .sec-instr { font-size: 10pt; font-style: italic; margin: 0 0 6pt; }
  .q { page-break-inside: avoid; break-inside: avoid; margin-bottom: 6pt; }
  .q .num { font-weight: bold; min-width: 20pt; display: inline-block; }
  .q.mcq .q-line { display: flex; gap: 4pt; }
  .q.mcq .opts { margin-left: 28pt; display: grid; grid-template-columns: 1fr 1fr; gap: 0 16pt; font-size: 10pt; }
  .q.mcq .opt { display: flex; gap: 4pt; }
  .q.tf { display: flex; gap: 4pt; align-items: baseline; }
  .blank-short { display: inline-block; width: 60pt; border-bottom: 1px solid #000; margin-right: 6pt; height: 1em; }
  .q.essay .q-line { display: flex; gap: 4pt; }
  .q.essay .pts { font-size: 9pt; white-space: nowrap; margin-left: auto; }
  .essay-lines { margin-left: 20pt; }
  .essay-line { border-bottom: 1pt solid #999; height: 20pt; }
  .answer-key { page-break-before: always; break-before: page; padding-top: 12pt; }
  .answer-key h2 { font-size: 14pt; text-align: center; border-bottom: 2pt solid #000; padding-bottom: 10pt; }
  .answer-key ol { font-size: 10.5pt; column-gap: 32pt; margin: 18pt auto 0; max-width: 70%; }
  .answer-key li { padding: 2pt 0; font-weight: bold; break-inside: avoid; }
  .prepared { margin-top: 30pt; font-size: 11pt; page-break-inside: avoid; }
  .prepared .name { margin-top: 20pt; font-weight: bold; text-transform: uppercase; }
</style>
</head>
<body>
  ${renderHeader(model, logoDataUrl)}
  ${sectionsHtml}
  <div class="prepared">
    <div>Prepared by:</div>
    <div class="name">${escapeHtml(model.preparedBy || "________________________")}</div>
    <div style="font-size:10pt;font-style:italic">Subject Instructor</div>
  </div>
  ${renderAnswerKey(model)}
</body>
</html>`;
}

export interface PrintResult {
  ok: boolean;
  durationMs: number;
  error?: string;
}

export async function printExam(model: ExamRenderModel): Promise<PrintResult> {
  const t0 = performance.now();
  try {
    const logo = await getLogoDataUrl();
    const html = buildHtml(model, logo);
    const w = window.open("", "_blank", "width=900,height=1000");
    if (!w) {
      return {
        ok: false,
        durationMs: performance.now() - t0,
        error: "Popup blocked. Please allow popups to print.",
      };
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    // Wait for the new window to be ready, then trigger print.
    await new Promise<void>((resolve) => {
      const fire = () => {
        try {
          w.focus();
          w.print();
        } catch {
          // ignore
        }
        resolve();
      };
      if (w.document.readyState === "complete") {
        // Small tick so the layout settles.
        setTimeout(fire, 50);
      } else {
        w.addEventListener("load", () => setTimeout(fire, 50), { once: true });
      }
    });
    // Close after print dialog finishes; some browsers don't fire onafterprint
    // so we also fall back to a delayed close.
    try {
      w.onafterprint = () => w.close();
      setTimeout(() => {
        try {
          if (!w.closed) w.close();
        } catch {
          // ignore
        }
      }, 60_000);
    } catch {
      // ignore
    }
    return { ok: true, durationMs: performance.now() - t0 };
  } catch (e: any) {
    return { ok: false, durationMs: performance.now() - t0, error: e?.message || String(e) };
  }
}
