import { useRef, useCallback, useState } from "react";
import { Button } from "@/components/ui/button";
import { Download, Printer } from "lucide-react";
import { toast } from "sonner";
import { CanonicalTOSMatrix, BloomLevel } from "@/utils/tosCalculator";
import { ISODocumentHeader } from "@/components/print/ISODocumentHeader";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

interface TOSMatrixProps {
  data: CanonicalTOSMatrix;
}

export const TOSMatrix = ({ data }: TOSMatrixProps) => {
  const { distribution, total_hours, bloom_totals } = data;
  const printRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);

  const bloomLevels: { key: BloomLevel; label: string; difficulty: string; pct: string }[] = [
    { key: 'remembering', label: 'Remembering', difficulty: 'Easy', pct: '15%' },
    { key: 'understanding', label: 'Understanding', difficulty: 'Easy', pct: '15%' },
    { key: 'applying', label: 'Applying', difficulty: 'Average', pct: '20%' },
    { key: 'analyzing', label: 'Analyzing', difficulty: 'Average', pct: '20%' },
    { key: 'evaluating', label: 'Evaluating', difficulty: 'Difficult', pct: '15%' },
    { key: 'creating', label: 'Creating', difficulty: 'Difficult', pct: '15%' },
  ];

  const formatItemNumbers = (items: number[]) => {
    if (items.length === 0) return "";
    if (items.length <= 3) return `(${items.join(',')})`;
    const sorted = [...items].sort((a, b) => a - b);
    const groups: string[] = [];
    let start = sorted[0], end = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === end + 1) { end = sorted[i]; }
      else {
        groups.push(start === end ? `${start}` : `${start}-${end}`);
        start = end = sorted[i];
      }
    }
    groups.push(start === end ? `${start}` : `${start}-${end}`);
    return `(${groups.join(',')})`;
  };

  const getTopicTotal = (topic: string) => distribution[topic]?.total || 0;
  const actualTotal = Object.values(distribution).reduce((sum, t) => sum + t.total, 0);

  const thStyle: React.CSSProperties = {
    border: '1.5px solid #000',
    padding: '4px 6px',
    backgroundColor: '#91E291',
    fontWeight: 'bold',
    fontSize: '9.5pt',
    textAlign: 'center',
    verticalAlign: 'middle',
  };

  const tdStyle: React.CSSProperties = {
    border: '1.5px solid #000',
    padding: '4px 6px',
    textAlign: 'center',
    fontSize: '9.5pt',
    verticalAlign: 'middle',
  };

  // Build the inner HTML for print popup (includes ISO header as HTML string)
  const buildTOSHTML = useCallback(() => {
    const topicRows = data.topics.map(t => {
      const dist = distribution[t.topic];
      return {
        topic: t.topic,
        hours: dist?.hours ?? t.hours ?? 0,
        percentage: dist?.percentage ?? 0,
        remembering: dist?.remembering ?? { count: 0, items: [] },
        understanding: dist?.understanding ?? { count: 0, items: [] },
        applying: dist?.applying ?? { count: 0, items: [] },
        analyzing: dist?.analyzing ?? { count: 0, items: [] },
        evaluating: dist?.evaluating ?? { count: 0, items: [] },
        creating: dist?.creating ?? { count: 0, items: [] },
        total: dist?.total ?? 0,
      };
    });

    const totals = topicRows.reduce(
      (acc, r) => ({
        hours: acc.hours + r.hours,
        remembering: acc.remembering + r.remembering.count,
        understanding: acc.understanding + r.understanding.count,
        applying: acc.applying + r.applying.count,
        analyzing: acc.analyzing + r.analyzing.count,
        evaluating: acc.evaluating + r.evaluating.count,
        creating: acc.creating + r.creating.count,
        total: acc.total + r.total,
      }),
      { hours: 0, remembering: 0, understanding: 0, applying: 0, analyzing: 0, evaluating: 0, creating: 0, total: 0 }
    );

    const fmtItems = (items: number[]) => {
      if (!items || items.length === 0) return '';
      if (items.length <= 3) return `(${items.join(',')})`;
      const sorted = [...items].sort((a, b) => a - b);
      const ranges: string[] = [];
      let s = sorted[0], e = sorted[0];
      for (let i = 1; i < sorted.length; i++) {
        if (sorted[i] === e + 1) { e = sorted[i]; }
        else { ranges.push(s === e ? `${s}` : `${s}-${e}`); s = e = sorted[i]; }
      }
      ranges.push(s === e ? `${s}` : `${s}-${e}`);
      return `(${ranges.join(',')})`;
    };

    const levels = ['remembering', 'understanding', 'applying', 'analyzing', 'evaluating', 'creating'] as const;

    return `
      <!-- ISO Document Header -->
      <div style="display:flex;align-items:flex-start;gap:12pt;margin-bottom:8pt;font-family:'Times New Roman',Times,serif;">
        <div style="flex-shrink:0;width:72pt;height:72pt;">
          <img src="/images/institution-logo.png" alt="Logo" style="width:72pt;height:72pt;object-fit:contain;background:#ffffff;border-radius:0;" crossorigin="anonymous" />
        </div>
        <div style="flex:1;text-align:left;padding-top:2pt;">
          <div style="font-weight:bold;font-size:11pt;text-transform:uppercase;">AGUSAN DEL SUR STATE COLLEGE OF AGRICULTURE AND TECHNOLOGY</div>
          <div style="font-size:9pt;">Bunawan, Agusan del Sur</div>
          <div style="font-size:9pt;">website: <span style="text-decoration:underline">http://asscat.edu.ph</span></div>
          <div style="font-size:9pt;">email address: <span style="text-decoration:underline">op@asscat.edu.ph</span>; mobile no.: +639486379266</div>
        </div>
        <div style="flex-shrink:0;">
          <table style="border-collapse:collapse;font-size:8.5pt;">
            <tr><td style="border:1px solid #000;padding:2px 6px;">Doc No.:</td><td style="border:1px solid #000;padding:2px 6px;">F-DOI-009</td></tr>
            <tr><td style="border:1px solid #000;padding:2px 6px;">Effective Date:</td><td style="border:1px solid #000;padding:2px 6px;">11/17/2025</td></tr>
            <tr><td style="border:1px solid #000;padding:2px 6px;">Rev No.:</td><td style="border:1px solid #000;padding:2px 6px;">3</td></tr>
            <tr><td style="border:1px solid #000;padding:2px 6px;">Page No.:</td><td style="border:1px solid #000;padding:2px 6px;">1 of 1</td></tr>
          </table>
        </div>
      </div>

      <div class="tos-header">Two-Way Table of Specification</div>
      <div class="meta-grid">
        <div><span>College: </span><span class="value">${data.description || '_______________'}</span></div>
        <div><span>Examination Period: </span><span class="value">${data.exam_period || '_______________'}</span></div>
        <div><span>Subject No.: </span><span class="value">${data.subject_no || '_______________'}</span></div>
        <div><span>Year and Section: </span><span class="value">${data.year_section || '_______________'}</span></div>
        <div><span>Description: </span><span class="value">${data.description || '_______________'}</span></div>
        <div><span>Course: </span><span class="value">${data.course || '_______________'}</span></div>
        <div><span>School Year / Semester: </span><span class="value">${[data.school_year, data.semester].filter(Boolean).join(' – ') || '_______________'}</span></div>
      </div>
      <table>
        <thead>
          <tr>
            <th rowspan="3" style="min-width:120px;text-align:left;padding-left:8px">TOPIC</th>
            <th rowspan="3">NO. OF<br>HOURS</th>
            <th rowspan="3">PERCEN<br>TAGE</th>
            <th colspan="6" style="font-size:10pt">COGNITIVE DOMAINS</th>
            <th rowspan="3">ITEM<br>PLACEMENT</th>
            <th rowspan="3">TOTAL</th>
          </tr>
          <tr>
            <th colspan="2" style="font-size:8.5pt">EASY (30%)</th>
            <th colspan="2" style="font-size:8.5pt">AVERAGE (40%)</th>
            <th colspan="2" style="font-size:8.5pt">DIFFICULT (30%)</th>
          </tr>
          <tr>
            <th style="font-size:8pt">Remembering<br>(15%)</th>
            <th style="font-size:8pt">Understanding<br>(15%)</th>
            <th style="font-size:8pt">Applying<br>(20%)</th>
            <th style="font-size:8pt">Analyzing<br>(20%)</th>
            <th style="font-size:8pt">Evaluating<br>(15%)</th>
            <th style="font-size:8pt">Creating<br>(15%)</th>
          </tr>
        </thead>
        <tbody>
          ${topicRows.map(row => `
            <tr>
              <td style="text-align:left;padding-left:8px">${row.topic}</td>
              <td>${row.hours}</td>
              <td>${row.percentage}%</td>
              ${levels.map(level => `
                <td>
                  ${row[level].count}
                  <span class="item-nums">${fmtItems(row[level].items)}</span>
                </td>
              `).join('')}
              <td style="font-weight:bold">Test I</td>
              <td style="font-weight:bold;font-size:10pt">${row.total}</td>
            </tr>
          `).join('')}
          <tr class="total-row">
            <td style="text-align:left;padding-left:8px;font-size:10pt;font-weight:bold">TOTAL</td>
            <td style="font-size:10pt;font-weight:bold">${totals.hours}</td>
            <td style="font-size:10pt;font-weight:bold">100%</td>
            <td style="font-size:10pt;font-weight:bold">${totals.remembering}</td>
            <td style="font-size:10pt;font-weight:bold">${totals.understanding}</td>
            <td style="font-size:10pt;font-weight:bold">${totals.applying}</td>
            <td style="font-size:10pt;font-weight:bold">${totals.analyzing}</td>
            <td style="font-size:10pt;font-weight:bold">${totals.evaluating}</td>
            <td style="font-size:10pt;font-weight:bold">${totals.creating}</td>
            <td></td>
            <td style="font-size:10pt;font-weight:bold">${totals.total}</td>
          </tr>
        </tbody>
      </table>
      <div class="sig-section">
        <div class="sig-block">
          <div style="font-size:9pt;margin-bottom:4px;">Prepared by:</div>
          <div style="margin-top:20px;font-weight:bold;text-transform:uppercase;border-bottom:1px solid #000;padding-bottom:2px;display:inline-block;min-width:160px;">${data.prepared_by || '\u00A0'}</div>
          <div class="sig-title" style="font-style:italic">Instructor</div>
        </div>
        <div class="sig-block">
          <div style="font-size:9pt;margin-bottom:4px;">Checked and Reviewed by:</div>
          <div style="margin-top:20px;font-weight:bold;text-transform:uppercase;border-bottom:1px solid #000;padding-bottom:2px;display:inline-block;min-width:160px;">${data.checked_by || '\u00A0'}</div>
          <div class="sig-title" style="font-style:italic">Program Chair</div>
        </div>
        <div class="sig-block">
          <div style="font-size:9pt;margin-bottom:4px;">Approved by:</div>
          <div style="margin-top:20px;font-weight:bold;text-transform:uppercase;border-bottom:1px solid #000;padding-bottom:2px;display:inline-block;min-width:160px;">${data.noted_by || '\u00A0'}</div>
          <div class="sig-title" style="font-style:italic">Dean</div>
        </div>
      </div>
    `;
  }, [data, distribution]);

  // Shared inline styles for the printable content
  const printStyles = `
    @page { size: A4 landscape; margin: 8mm 10mm; }
    * { margin: 0; padding: 0; box-sizing: border-box; }
    html, body { font-family: "Times New Roman", Times, serif; font-size: 9.5pt; color: #000; background: #fff; line-height: 1.2; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    img { max-width: 100%; }
    .tos-header { text-align: center; font-weight: bold; font-size: 12pt; border: 1.5px solid #000; padding: 3px 0; margin: 4px 0 6px; text-transform: uppercase; letter-spacing: 1px; }
    .meta-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 1px 30px; margin-bottom: 6px; font-size: 9pt; }
    .meta-grid .value { text-decoration: underline; margin-left: 4px; }
    table { border-collapse: collapse; width: 100%; table-layout: auto; margin-top: 4px; page-break-inside: avoid; }
    th, td { border: 1px solid #000; padding: 2px 4px; text-align: center; vertical-align: middle; font-size: 8.5pt; }
    th { background-color: #91E291 !important; font-weight: bold; }
    .item-nums { font-size: 7pt; display: block; color: #333; }
    .sig-section { display: flex; justify-content: space-between; margin-top: 14px; font-size: 9pt; page-break-inside: avoid; }
    .sig-block { text-align: center; width: 30%; }
    .sig-title { font-size: 8.5pt; }
    .total-row td { font-weight: bold; background-color: #f5f5f5 !important; }
    @media print { body { margin: 0; padding: 0; } }
  `;

  const handlePrint = useCallback(() => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast.error('Could not open print window. Check popup blockers.');
      return;
    }
    printWindow.document.write(`
      <html><head><title>Table of Specification - ${data.title || 'TOS'}</title>
      <style>${printStyles}</style></head>
      <body>${buildTOSHTML()}</body></html>
    `);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 400);
  }, [data, printStyles, buildTOSHTML]);

  const handleExportPDF = useCallback(async () => {
    if (!printRef.current) return;
    setExporting(true);

    // Temporarily compact the printable element for export-only sizing
    const el = printRef.current;
    const prevPadding = el.style.padding;
    const prevWidth = el.style.width;
    el.style.padding = '8px';
    // A4 landscape ~ 1123px wide at 96dpi minus margins; render at this width to maximize fit
    el.style.width = '1100px';

    try {
      // Allow layout to settle
      await new Promise(r => requestAnimationFrame(() => r(null)));

      const canvas = await html2canvas(el, {
        scale: 2,
        useCORS: true,
        backgroundColor: '#ffffff',
        width: el.scrollWidth,
        height: el.scrollHeight,
        windowWidth: el.scrollWidth,
      });

      const pdf = new jsPDF('landscape', 'mm', 'a4');
      const pdfW = pdf.internal.pageSize.getWidth();   // 297
      const pdfH = pdf.internal.pageSize.getHeight();  // 210
      const mx = 8, my = 8;
      const usableW = pdfW - mx * 2;
      const usableH = pdfH - my * 2;

      const widthScaledH = (canvas.height * usableW) / canvas.width;
      const imgData = canvas.toDataURL('image/png');

      // Single-page fit: if content fits, OR overflow is modest (<=25%), uniformly scale to one page
      const overflowRatio = widthScaledH / usableH;
      if (overflowRatio <= 1.25) {
        // Fit entirely on one page (preserve aspect ratio)
        const fit = Math.min(1, usableH / widthScaledH);
        const renderW = usableW * fit;
        const renderH = widthScaledH * fit;
        const offsetX = mx + (usableW - renderW) / 2;
        const offsetY = my + (usableH - renderH) / 2;
        pdf.addImage(imgData, 'PNG', offsetX, offsetY, renderW, renderH);
      } else {
        // Fallback: paginate by slicing source canvas
        let remaining = widthScaledH, srcY = 0;
        const ratio = canvas.width / usableW;
        while (remaining > 0) {
          if (srcY > 0) pdf.addPage();
          const sliceH = Math.min(remaining, usableH);
          const srcSliceH = sliceH * ratio;
          const sc = document.createElement('canvas');
          sc.width = canvas.width;
          sc.height = srcSliceH;
          const ctx = sc.getContext('2d');
          if (ctx) {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, sc.width, sc.height);
            ctx.drawImage(canvas, 0, srcY, canvas.width, srcSliceH, 0, 0, canvas.width, srcSliceH);
            pdf.addImage(sc.toDataURL('image/png'), 'PNG', mx, my, usableW, sliceH);
          }
          srcY += srcSliceH;
          remaining -= usableH;
        }
      }

      const filename = `TOS_${data.subject_no || 'export'}_${data.exam_period || ''}.pdf`.replace(/\s+/g, '_');
      pdf.save(filename);
      toast.success("TOS exported as PDF successfully!");
    } catch (err) {
      console.error('PDF export error:', err);
      toast.error("Failed to export PDF");
    } finally {
      el.style.padding = prevPadding;
      el.style.width = prevWidth;
      setExporting(false);
    }
  }, [data]);

  return (
    <div className="space-y-6">
      {/* Action Buttons - hidden in print */}
      <div className="flex gap-2 print:hidden">
        <Button onClick={handleExportPDF} variant="default" disabled={exporting}>
          <Download className="h-4 w-4 mr-2" />
          {exporting ? 'Exporting...' : 'Export PDF'}
        </Button>
        <Button onClick={handlePrint} variant="outline">
          <Printer className="h-4 w-4 mr-2" />
          Print
        </Button>
      </div>

      {/* Printable TOS Document */}
      <div
        ref={printRef}
        style={{
          fontFamily: '"Times New Roman", Times, serif',
          fontSize: '11pt',
          color: '#000',
          background: '#fff',
          padding: '20px',
          lineHeight: 1.4,
        }}
      >
        {/* ISO Document Header */}
        <ISODocumentHeader
          docNo="F-DOI-009"
          effectiveDate="11/17/2025"
          revNo="3"
          pageInfo="1 of 1"
        />

        {/* Title */}
        <div style={{
          textAlign: 'center',
          fontWeight: 'bold',
          fontSize: '14pt',
          border: '2px solid #000',
          padding: '6px 0',
          marginBottom: '14px',
          marginTop: '8px',
          textTransform: 'uppercase',
          letterSpacing: '1px',
        }}>
          Two-Way Table of Specification
        </div>

        {/* Metadata grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2px 40px', marginBottom: '14px', fontSize: '11pt' }}>
          <div><span>College: </span><span style={{ textDecoration: 'underline' }}>{data.description || '_______________'}</span></div>
          <div><span>Examination Period: </span><span style={{ textDecoration: 'underline' }}>{data.exam_period || '_______________'}</span></div>
          <div><span>Subject No.: </span><span style={{ textDecoration: 'underline' }}>{data.subject_no || '_______________'}</span></div>
          <div><span>Year and Section: </span><span style={{ textDecoration: 'underline' }}>{data.year_section || '_______________'}</span></div>
          <div><span>Description: </span><span style={{ textDecoration: 'underline' }}>{data.description || '_______________'}</span></div>
          <div><span>Course: </span><span style={{ textDecoration: 'underline' }}>{data.course || '_______________'}</span></div>
          <div><span>School Year / Semester: </span><span style={{ textDecoration: 'underline' }}>{[data.school_year, data.semester].filter(Boolean).join(' – ') || '_______________'}</span></div>
        </div>

        {/* TOS Table */}
        <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'auto', marginTop: '8px' }}>
          <thead>
            <tr>
              <th rowSpan={3} style={{ ...thStyle, minWidth: '120px', textAlign: 'left', paddingLeft: '8px' }}>TOPIC</th>
              <th rowSpan={3} style={thStyle}>NO. OF<br/>HOURS</th>
              <th rowSpan={3} style={thStyle}>PERCEN<br/>TAGE</th>
              <th colSpan={6} style={{ ...thStyle, fontSize: '10pt' }}>COGNITIVE DOMAINS</th>
              <th rowSpan={3} style={thStyle}>ITEM<br/>PLACEMENT</th>
              <th rowSpan={3} style={thStyle}>TOTAL</th>
            </tr>
            <tr>
              <th colSpan={2} style={{ ...thStyle, fontSize: '8.5pt' }}>EASY (30%)</th>
              <th colSpan={2} style={{ ...thStyle, fontSize: '8.5pt' }}>AVERAGE (40%)</th>
              <th colSpan={2} style={{ ...thStyle, fontSize: '8.5pt' }}>DIFFICULT (30%)</th>
            </tr>
            <tr>
              {bloomLevels.map(level => (
                <th key={level.key} style={{ ...thStyle, fontSize: '8pt' }}>
                  {level.label}<br/>({level.pct})
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.topics.map((topic) => {
              const topicDist = distribution[topic.topic];
              return (
                <tr key={topic.topic}>
                  <td style={{ ...tdStyle, textAlign: 'left', paddingLeft: '8px' }}>
                    {topic.topic}
                  </td>
                  <td style={tdStyle}>{topic.hours}</td>
                  <td style={tdStyle}>{topicDist?.percentage || 0}%</td>
                  {bloomLevels.map(level => {
                    const bloomData = topicDist?.[level.key];
                    return (
                      <td key={level.key} style={tdStyle}>
                        {bloomData?.count || 0}
                        <span style={{ display: 'block', fontSize: '7.5pt', color: '#333' }}>
                          {formatItemNumbers(bloomData?.items || [])}
                        </span>
                      </td>
                    );
                  })}
                  <td style={{ ...tdStyle, fontWeight: 'bold' }}>Test I</td>
                  <td style={{ ...tdStyle, fontWeight: 'bold', fontSize: '10pt' }}>
                    {getTopicTotal(topic.topic)}
                  </td>
                </tr>
              );
            })}
            {/* Totals row */}
            <tr style={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>
              <td style={{ ...tdStyle, textAlign: 'left', paddingLeft: '8px', fontWeight: 'bold', fontSize: '10pt' }}>TOTAL</td>
              <td style={{ ...tdStyle, fontWeight: 'bold', fontSize: '10pt' }}>{total_hours}</td>
              <td style={{ ...tdStyle, fontWeight: 'bold', fontSize: '10pt' }}>100%</td>
              {bloomLevels.map(level => (
                <td key={level.key} style={{ ...tdStyle, fontWeight: 'bold', fontSize: '10pt' }}>
                  {bloom_totals[level.key]}
                </td>
              ))}
              <td style={{ ...tdStyle, fontSize: '10pt' }}></td>
              <td style={{ ...tdStyle, fontWeight: 'bold', fontSize: '10pt' }}>{actualTotal}</td>
            </tr>
          </tbody>
        </table>

        {/* Signature Section - matching tos-history format exactly */}
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: '30px',
          fontSize: '10pt',
        }}>
          <div style={{ textAlign: 'center', width: '30%' }}>
            <div style={{ fontSize: '9pt', marginBottom: '4px' }}>Prepared by:</div>
            <div style={{
              marginTop: '20px',
              fontWeight: 'bold',
              textTransform: 'uppercase' as const,
              borderBottom: '1px solid #000',
              paddingBottom: '2px',
              display: 'inline-block',
              minWidth: '160px',
            }}>
              {data.prepared_by || '\u00A0'}
            </div>
            <div style={{ fontSize: '9pt', fontStyle: 'italic' }}>Instructor</div>
          </div>
          <div style={{ textAlign: 'center', width: '30%' }}>
            <div style={{ fontSize: '9pt', marginBottom: '4px' }}>Checked and Reviewed by:</div>
            <div style={{
              marginTop: '20px',
              fontWeight: 'bold',
              textTransform: 'uppercase' as const,
              borderBottom: '1px solid #000',
              paddingBottom: '2px',
              display: 'inline-block',
              minWidth: '160px',
            }}>
              {data.checked_by || '\u00A0'}
            </div>
            <div style={{ fontSize: '9pt', fontStyle: 'italic' }}>Program Chair</div>
          </div>
          <div style={{ textAlign: 'center', width: '30%' }}>
            <div style={{ fontSize: '9pt', marginBottom: '4px' }}>Approved by:</div>
            <div style={{
              marginTop: '20px',
              fontWeight: 'bold',
              textTransform: 'uppercase' as const,
              borderBottom: '1px solid #000',
              paddingBottom: '2px',
              display: 'inline-block',
              minWidth: '160px',
            }}>
              {data.noted_by || '\u00A0'}
            </div>
            <div style={{ fontSize: '9pt', fontStyle: 'italic' }}>Dean</div>
          </div>
        </div>
      </div>
    </div>
  );
};
