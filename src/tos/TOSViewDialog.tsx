import { useState, useRef, useCallback } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Printer, Download } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { ISODocumentHeader } from '@/components/print/ISODocumentHeader';

interface TopicDistribution {
  hours: number;
  percentage: number;
  total: number;
  remembering: { count: number; items: number[] };
  understanding: { count: number; items: number[] };
  applying: { count: number; items: number[] };
  analyzing: { count: number; items: number[] };
  evaluating: { count: number; items: number[] };
  creating: { count: number; items: number[] };
}

interface TOSData {
  id: string;
  title: string | null;
  subject_no: string | null;
  course: string | null;
  description: string | null;
  year_section: string | null;
  exam_period: string | null;
  school_year: string | null;
  semester?: string | null;
  total_items: number | null;
  prepared_by?: string | null;
  checked_by?: string | null;
  noted_by?: string | null;
  approved_by?: string | null;
  topics: Array<{ topic: string; hours: number }> | null;
  distribution: Record<string, TopicDistribution> | null;
}

interface TOSViewDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tos: TOSData | null;
}

export function TOSViewDialog({ open, onOpenChange, tos }: TOSViewDialogProps) {
  const [exporting, setExporting] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const topicRows = tos?.topics?.map(t => {
    const dist = tos.distribution?.[t.topic];
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
  }) ?? [];

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

  const formatItems = (items: number[]) => {
    if (!items || items.length === 0) return '';
    if (items.length <= 3) return `(${items.join(',')})`;
    const sorted = [...items].sort((a, b) => a - b);
    const ranges: string[] = [];
    let start = sorted[0], end = sorted[0];
    for (let i = 1; i < sorted.length; i++) {
      if (sorted[i] === end + 1) {
        end = sorted[i];
      } else {
        ranges.push(start === end ? `${start}` : `${start}-${end}`);
        start = end = sorted[i];
      }
    }
    ranges.push(start === end ? `${start}` : `${start}-${end}`);
    return `(${ranges.join(',')})`;
  };

  const handlePrint = useCallback(() => {
    if (!printRef.current) return;
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      toast({ title: 'Error', description: 'Could not open print window. Check popup blockers.', variant: 'destructive' });
      return;
    }

    printWindow.document.write(`
      <html><head><title>Table of Specification - ${tos?.title || 'TOS'}</title>
      <style>
        @page { size: letter landscape; margin: 0.5in 0.6in; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: "Times New Roman", Times, serif; font-size: 11pt; color: #000; background: #fff; line-height: 1.4; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        img { max-width: 100%; }
        table { border-collapse: collapse; width: 100%; table-layout: auto; }
        th, td { border: 1.5px solid #000; padding: 4px 6px; text-align: center; vertical-align: middle; font-size: 9.5pt; }
        th { background-color: #91E291 !important; font-weight: bold; }
        @media print { body { margin: 0; padding: 0; } }
      </style></head><body>${printRef.current.innerHTML}</body></html>
    `);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 400);
  }, [tos, toast]);

  const handleExportPDF = useCallback(async () => {
    if (!printRef.current) return;
    setExporting(true);

    try {
      const canvas = await html2canvas(printRef.current, {
        scale: 2.5,
        useCORS: true,
        backgroundColor: '#ffffff',
        width: printRef.current.scrollWidth,
        height: printRef.current.scrollHeight,
      });

      const pdf = new jsPDF('landscape', 'mm', 'a4');
      const pdfW = pdf.internal.pageSize.getWidth();
      const pdfH = pdf.internal.pageSize.getHeight();
      const mx = 12, my = 10;
      const usableW = pdfW - mx * 2;
      const usableH = pdfH - my * 2;
      const imgH = (canvas.height * usableW) / canvas.width;

      if (imgH <= usableH) {
        pdf.addImage(canvas.toDataURL('image/png', 0.95), 'PNG', mx, my, usableW, imgH);
      } else {
        let remaining = imgH, srcY = 0;
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
            ctx.drawImage(canvas, 0, srcY, canvas.width, srcSliceH, 0, 0, canvas.width, srcSliceH);
            pdf.addImage(sc.toDataURL('image/png', 0.95), 'PNG', mx, my, usableW, sliceH);
          }
          srcY += srcSliceH;
          remaining -= usableH;
        }
      }

      const filename = `TOS_${tos?.subject_no || tos?.course || 'export'}_${tos?.exam_period || ''}_${tos?.school_year || ''}.pdf`.replace(/\s+/g, '_');
      pdf.save(filename);
      toast({ title: 'Success', description: 'TOS exported as PDF' });
    } catch (err) {
      console.error('PDF export error:', err);
      toast({ title: 'Error', description: 'Failed to export PDF', variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  }, [tos, toast]);

  if (!tos) return null;

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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[90vh] overflow-auto p-0">
        <DialogHeader className="p-4 pb-2 flex flex-row items-center justify-between sticky top-0 bg-background z-10 border-b screen-only">
          <DialogTitle className="text-lg">Table of Specification Preview</DialogTitle>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handlePrint}>
              <Printer className="h-4 w-4 mr-1" /> Print
            </Button>
            <Button size="sm" onClick={handleExportPDF} disabled={exporting}>
              <Download className="h-4 w-4 mr-1" /> {exporting ? 'Exporting...' : 'Export PDF'}
            </Button>
          </div>
        </DialogHeader>

        {/* Printable TOS content */}
        <div className="p-6 overflow-auto">
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

            {/* Metadata grid - matching reference exactly */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '2px 40px',
              marginBottom: '14px',
              fontSize: '11pt',
            }}>
              <div>
                <span>College: </span>
                <span style={{ textDecoration: 'underline' }}>
                  {tos.description || '_______________'}
                </span>
              </div>
              <div>
                <span>Examination Period: </span>
                <span style={{ textDecoration: 'underline' }}>
                  {tos.exam_period || '_______________'}
                </span>
              </div>
              <div>
                <span>Subject No.: </span>
                <span style={{ textDecoration: 'underline' }}>
                  {tos.subject_no || '_______________'}
                </span>
              </div>
              <div>
                <span>Year and Section: </span>
                <span style={{ textDecoration: 'underline' }}>
                  {tos.year_section || '_______________'}
                </span>
              </div>
              <div>
                <span>Description: </span>
                <span style={{ textDecoration: 'underline' }}>
                  {tos.description || '_______________'}
                </span>
              </div>
              <div>
                <span>Course: </span>
                <span style={{ textDecoration: 'underline' }}>
                  {tos.course || '_______________'}
                </span>
              </div>
              <div>
                <span>School Year / Semester: </span>
                <span style={{ textDecoration: 'underline' }}>
                  {[tos.school_year, tos.semester].filter(Boolean).join(' – ') || '_______________'}
                </span>
              </div>
            </div>

            {/* TOS Table - exact match to reference */}
            <table style={{ borderCollapse: 'collapse', width: '100%', tableLayout: 'auto', marginTop: '8px' }}>
              <thead>
                {/* Row 1: Main grouping headers */}
                <tr>
                  <th rowSpan={3} style={{ ...thStyle, minWidth: '120px', textAlign: 'left', paddingLeft: '8px' }}>
                    TOPIC
                  </th>
                  <th rowSpan={3} style={thStyle}>
                    NO. OF<br />HOURS
                  </th>
                  <th rowSpan={3} style={thStyle}>
                    PERCEN<br />TAGE
                  </th>
                  <th colSpan={6} style={{ ...thStyle, fontSize: '10pt' }}>
                    COGNITIVE DOMAINS
                  </th>
                  <th rowSpan={3} style={thStyle}>
                    ITEM<br />PLACEMENT
                  </th>
                  <th rowSpan={3} style={thStyle}>
                    TOTAL
                  </th>
                </tr>
                {/* Row 2: Difficulty groupings */}
                <tr>
                  <th colSpan={2} style={{ ...thStyle, fontSize: '8.5pt' }}>
                    EASY (30%)
                  </th>
                  <th colSpan={2} style={{ ...thStyle, fontSize: '8.5pt' }}>
                    AVERAGE (40%)
                  </th>
                  <th colSpan={2} style={{ ...thStyle, fontSize: '8.5pt' }}>
                    DIFFICULT (30%)
                  </th>
                </tr>
                {/* Row 3: Bloom's levels */}
                <tr>
                  <th style={{ ...thStyle, fontSize: '8pt' }}>Remembering<br />(15%)</th>
                  <th style={{ ...thStyle, fontSize: '8pt' }}>Understanding<br />(15%)</th>
                  <th style={{ ...thStyle, fontSize: '8pt' }}>Applying<br />(20%)</th>
                  <th style={{ ...thStyle, fontSize: '8pt' }}>Analyzing<br />(20%)</th>
                  <th style={{ ...thStyle, fontSize: '8pt' }}>Evaluating<br />(15%)</th>
                  <th style={{ ...thStyle, fontSize: '8pt' }}>Creating<br />(15%)</th>
                </tr>
              </thead>
              <tbody>
                {topicRows.map((row, idx) => (
                  <tr key={idx}>
                    <td style={{ ...tdStyle, textAlign: 'left', paddingLeft: '8px' }}>
                      {row.topic}
                    </td>
                    <td style={tdStyle}>{row.hours}</td>
                    <td style={tdStyle}>{row.percentage}%</td>
                    {(['remembering', 'understanding', 'applying', 'analyzing', 'evaluating', 'creating'] as const).map(level => (
                      <td key={level} style={tdStyle}>
                        {row[level].count}
                        <span style={{ display: 'block', fontSize: '7.5pt', color: '#333' }}>
                          {formatItems(row[level].items)}
                        </span>
                      </td>
                    ))}
                    <td style={{ ...tdStyle, fontWeight: 'bold' }}>Test I</td>
                    <td style={{ ...tdStyle, fontWeight: 'bold', fontSize: '10pt' }}>{row.total}</td>
                  </tr>
                ))}
                {/* Totals row */}
                <tr style={{ fontWeight: 'bold', backgroundColor: '#f5f5f5' }}>
                  <td style={{ ...tdStyle, textAlign: 'left', paddingLeft: '8px', fontWeight: 'bold', fontSize: '10pt' }}>TOTAL</td>
                  <td style={{ ...tdStyle, fontWeight: 'bold', fontSize: '10pt' }}>{totals.hours}</td>
                  <td style={{ ...tdStyle, fontWeight: 'bold', fontSize: '10pt' }}>100%</td>
                  <td style={{ ...tdStyle, fontWeight: 'bold', fontSize: '10pt' }}>{totals.remembering}</td>
                  <td style={{ ...tdStyle, fontWeight: 'bold', fontSize: '10pt' }}>{totals.understanding}</td>
                  <td style={{ ...tdStyle, fontWeight: 'bold', fontSize: '10pt' }}>{totals.applying}</td>
                  <td style={{ ...tdStyle, fontWeight: 'bold', fontSize: '10pt' }}>{totals.analyzing}</td>
                  <td style={{ ...tdStyle, fontWeight: 'bold', fontSize: '10pt' }}>{totals.evaluating}</td>
                  <td style={{ ...tdStyle, fontWeight: 'bold', fontSize: '10pt' }}>{totals.creating}</td>
                  <td style={{ ...tdStyle, fontSize: '10pt' }}></td>
                  <td style={{ ...tdStyle, fontWeight: 'bold', fontSize: '10pt' }}>{totals.total}</td>
                </tr>
              </tbody>
            </table>

            {/* Signature section - 3 columns matching reference */}
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              marginTop: '30px',
              fontSize: '10pt',
            }}>
              <div style={{ textAlign: 'center', width: '30%' }}>
                <div style={{ fontSize: '9pt', marginBottom: '4px' }}>Prepared by:</div>
                <div style={{
                  borderTop: 'none',
                  marginTop: '20px',
                  paddingTop: '4px',
                  fontWeight: 'bold',
                  textTransform: 'uppercase',
                }}>
                  {tos.prepared_by || '________________________'}
                </div>
                <div style={{ fontSize: '9pt', fontStyle: 'italic' }}>Instructor I</div>
              </div>
              <div style={{ textAlign: 'center', width: '30%' }}>
                <div style={{ fontSize: '9pt', marginBottom: '4px' }}>Checked and Reviewed by:</div>
                <div style={{
                  marginTop: '20px',
                  paddingTop: '4px',
                  fontWeight: 'bold',
                  textTransform: 'uppercase',
                }}>
                  {tos.checked_by || '________________________'}
                </div>
                <div style={{ fontSize: '9pt', fontStyle: 'italic' }}>Program Chair</div>
              </div>
              <div style={{ textAlign: 'center', width: '30%' }}>
                <div style={{ fontSize: '9pt', marginBottom: '4px' }}>Approved by:</div>
                <div style={{
                  marginTop: '20px',
                  paddingTop: '4px',
                  fontWeight: 'bold',
                  textTransform: 'uppercase',
                }}>
                  {tos.noted_by || '________________________'}
                </div>
                <div style={{ fontSize: '9pt', fontStyle: 'italic' }}>Dean</div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
