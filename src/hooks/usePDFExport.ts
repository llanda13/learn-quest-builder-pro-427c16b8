import { useCallback } from 'react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { addWatermarkToPDF, generateWatermarkCode, logSecurityEvent } from '@/services/testGeneration/security';

interface ExportQuestion {
  question_text?: string;
  question?: string;
}

export const usePDFExport = () => {
  const uploadToStorage = useCallback(async (blob: Blob, filename: string, folder: string) => {
    try {
      // Get current user for owner-based storage path
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        throw new Error('User must be authenticated to upload files');
      }

      const timestamp = new Date().toISOString().slice(0, 10);
      // Use user ID as first folder segment for owner-based RLS
      const path = `${user.id}/${folder}/${timestamp}/${filename}`;

      const { error: uploadError } = await supabase.storage
        .from('exports')
        .upload(path, blob, {
          upsert: true,
          contentType: 'application/pdf'
        });

      if (uploadError) throw uploadError;

      // Use signed URL instead of public URL for secure access
      const { data: signedUrlData, error: signedUrlError } = await supabase.storage
        .from('exports')
        .createSignedUrl(path, 3600); // 1 hour expiry

      if (signedUrlError) throw signedUrlError;

      return {
        storageUrl: signedUrlData.signedUrl,
        storagePath: path
      };
    } catch (error) {
      console.error('Storage upload error:', error);
      throw new Error('Failed to upload PDF to storage');
    }
  }, []);

  const exportTOSMatrix = useCallback(async (elementId: string = 'tos-document', uploadToCloud: boolean = false) => {
    try {
      const element = document.getElementById(elementId);
      if (!element) {
        throw new Error('TOS matrix element not found');
      }

      // Create PDF with landscape A4 dimensions for TOS
      const pdf = new jsPDF('l', 'mm', 'a4');
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = pdf.internal.pageSize.getHeight();

      // Convert HTML to canvas (lower scale + JPEG for compact text PDFs)
      const canvas = await html2canvas(element, {
        scale: 1.5,
        useCORS: true,
        allowTaint: true,
        backgroundColor: '#ffffff'
      });

      const imgWidth = pdfWidth - 20; // 10mm margin on each side
      const usableH = pdfHeight - 20;
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      if (imgHeight <= usableH) {
        pdf.addImage(canvas.toDataURL('image/jpeg', 0.75), 'JPEG', 10, 10, imgWidth, imgHeight, undefined, 'FAST');
      } else {
        // Slice the source canvas per page so we never embed the full image more than once
        const ratio = canvas.width / imgWidth;
        let remaining = imgHeight;
        let srcY = 0;
        let first = true;
        while (remaining > 0) {
          if (!first) pdf.addPage();
          first = false;
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
            pdf.addImage(sc.toDataURL('image/jpeg', 0.75), 'JPEG', 10, 10, imgWidth, sliceH, undefined, 'FAST');
          }
          srcY += srcSliceH;
          remaining -= usableH;
        }
      }

      const blob = pdf.output('blob');
      
      // Upload to storage if requested
      if (uploadToCloud) {
        try {
          const { storageUrl } = await uploadToStorage(blob, 'table-of-specifications.pdf', 'tos');
          toast.success(`PDF exported and uploaded successfully!`);
          
          // Also download locally
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = 'table-of-specifications.pdf';
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
          
          return { success: true, storageUrl };
        } catch (error) {
          toast.error('Failed to upload PDF to cloud storage');
          // Fallback to local download
          pdf.save('table-of-specifications.pdf');
          return { success: true };
        }
      } else {
        // Save locally only
        pdf.save('table-of-specifications.pdf');
        return { success: true };
      }
    } catch (error) {
      console.error('Error exporting TOS as PDF:', error);
      return false;
    }
  }, [uploadToStorage]);

  const exportTestQuestions = useCallback(async (
    questions: ExportQuestion[], 
    testTitle: string, 
    uploadToCloud: boolean = false, 
    versionLabel?: string,
    testId?: string,
    studentName?: string,
    studentId?: string
  ) => {
    try {
      // Use the print template element if available (same layout as print)
      const printElement = document.querySelector('.print-exam-only') as HTMLElement;

      if (printElement) {
        // Temporarily make the print element visible & sized for capture
        const original = {
          display: printElement.style.display,
          position: printElement.style.position,
          left: printElement.style.left,
          top: printElement.style.top,
          background: printElement.style.background,
          width: printElement.style.width,
          padding: printElement.style.padding,
          fontFamily: printElement.style.fontFamily,
          zIndex: printElement.style.zIndex,
        };
        printElement.style.display = 'block';
        printElement.style.position = 'fixed';
        printElement.style.left = '-10000px';
        printElement.style.top = '0';
        printElement.style.background = 'white';
        printElement.style.width = '210mm';
        printElement.style.padding = '0';
        printElement.style.fontFamily = '"Times New Roman", Times, serif';
        printElement.style.zIndex = '-1';

        // A4 page in mm
        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfW = pdf.internal.pageSize.getWidth();   // 210
        const pdfH = pdf.internal.pageSize.getHeight();  // 297
        const marginX = 12;
        const marginY = 12;
        const usableW = pdfW - marginX * 2;
        const usableH = pdfH - marginY * 2;
        const blockGapMM = 2;

        const SCALE = 2; // crisp vector-like text
        let currentY = marginY;
        

        const captureBlock = async (el: HTMLElement) => {
          // Force layout to settle and ensure the node has measurable size
          const w = Math.ceil(el.scrollWidth || el.offsetWidth || printElement.clientWidth);
          const h = Math.ceil(el.scrollHeight || el.offsetHeight);
          if (h <= 0 || w <= 0) return null;
          return await html2canvas(el, {
            scale: SCALE,
            useCORS: true,
            backgroundColor: '#ffffff',
            width: w,
            height: h,
            windowWidth: w,
            scrollX: 0,
            scrollY: 0,
          });
        };

        const placeCanvas = (canvas: HTMLCanvasElement) => {
          // Convert from canvas px to mm based on locked content width
          const renderW = usableW;
          const renderH = (canvas.height * renderW) / canvas.width;
          const remaining = pdfH - marginY - currentY;

          // If the block fits — place it on the current page
          if (renderH <= remaining + 0.01) {
            pdf.addImage(canvas.toDataURL('image/png'), 'PNG', marginX, currentY, renderW, renderH, undefined, 'FAST');
            currentY += renderH + blockGapMM;
            return;
          }

          // Block does not fit on current page
          if (renderH <= usableH) {
            // Move whole block to a fresh page (avoids splitting questions)
            pdf.addPage();
            currentY = marginY;
            pdf.addImage(canvas.toDataURL('image/png'), 'PNG', marginX, currentY, renderW, renderH, undefined, 'FAST');
            currentY += renderH + blockGapMM;
            return;
          }

          // Block is taller than a full page — must slice (rare; only oversized header)
          const ratio = canvas.width / renderW;
          let srcY = 0;
          let leftMM = renderH;
          let firstSlice = true;
          while (leftMM > 0) {
            const availMM = firstSlice ? remaining : usableH;
            if (!firstSlice || (firstSlice && remaining < usableH * 0.25)) {
              pdf.addPage();
              currentY = marginY;
            }
            const sliceMM = Math.min(leftMM, firstSlice ? availMM : usableH);
            const srcSliceH = Math.min(canvas.height - srcY, sliceMM * ratio);
            const sc = document.createElement('canvas');
            sc.width = canvas.width;
            sc.height = srcSliceH;
            const ctx = sc.getContext('2d');
            if (ctx) {
              ctx.fillStyle = '#ffffff';
              ctx.fillRect(0, 0, sc.width, sc.height);
              ctx.drawImage(canvas, 0, srcY, canvas.width, srcSliceH, 0, 0, canvas.width, srcSliceH);
              pdf.addImage(sc.toDataURL('image/png'), 'PNG', marginX, currentY, renderW, sliceMM, undefined, 'FAST');
            }
            srcY += srcSliceH;
            currentY += sliceMM;
            leftMM -= sliceMM;
            firstSlice = false;
          }
          currentY += blockGapMM;
        };

        try {
          // Collect blocks in document order; fall back to whole sections if none marked
          const blocks = Array.from(printElement.querySelectorAll<HTMLElement>('[data-pdf-block]'));
          const questionBlocks = blocks.length > 0 ? blocks : Array.from(printElement.querySelectorAll<HTMLElement>('[data-pdf-section="questions"]'));

          for (const block of questionBlocks) {
            const canvas = await captureBlock(block);
            if (!canvas) continue;
            placeCanvas(canvas);
            
          }

          // Answer key — always on a new page, centered
          const answerKey = printElement.querySelector<HTMLElement>('[data-pdf-section="answer-key"]');
          if (answerKey) {
            pdf.addPage();
            currentY = marginY;
            const canvas = await captureBlock(answerKey);
            if (canvas) {
              const naturalH = (canvas.height * usableW) / canvas.width;
              const fitScale = Math.min(1, usableH / naturalH);
              const renderW = usableW * fitScale;
              const renderH = naturalH * fitScale;
              const x = marginX + (usableW - renderW) / 2;
              const y = marginY + (usableH - renderH) / 2;
              pdf.addImage(canvas.toDataURL('image/png'), 'PNG', x, y, renderW, renderH, undefined, 'FAST');
            }
          }
        } finally {
          // Restore original styles
          printElement.style.display = original.display;
          printElement.style.position = original.position;
          printElement.style.left = original.left;
          printElement.style.top = original.top;
          printElement.style.background = original.background;
          printElement.style.width = original.width;
          printElement.style.padding = original.padding;
          printElement.style.fontFamily = original.fontFamily;
          printElement.style.zIndex = original.zIndex;
        }

        // Add watermarks if version label and test ID are provided
        if (versionLabel && testId) {
          const watermarkCode = generateWatermarkCode(testId, versionLabel, studentId);
          const totalPages = pdf.getNumberOfPages();
          const pages = Array.from({ length: totalPages }, (_, i) => i + 1);

          addWatermarkToPDF(pdf, {
            testId,
            versionLabel,
            studentName,
            studentId,
            uniqueCode: watermarkCode,
            timestamp: new Date()
          }, pages);

          await logSecurityEvent('export', testId, {
            version_label: versionLabel,
            student_id: studentId,
            student_name: studentName,
            watermark_code: watermarkCode,
            exported_at: new Date().toISOString()
          });
        }

        const filename = `${testTitle.toLowerCase().replace(/\s+/g, '-')}${versionLabel ? `-version-${versionLabel}` : ''}${studentName ? `-${studentName.toLowerCase().replace(/\s+/g, '-')}` : ''}.pdf`;
        const blob = pdf.output('blob');

        if (uploadToCloud) {
          try {
            const { storageUrl } = await uploadToStorage(blob, filename, 'tests');
            toast.success(`Test PDF exported and uploaded successfully!`);
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            link.download = filename;
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
            return { success: true, storageUrl, filename };
          } catch (error) {
            toast.error('Failed to upload PDF to cloud storage');
            pdf.save(filename);
            return { success: true, filename };
          }
        } else {
          pdf.save(filename);
          return { success: true, filename };
        }
      }

      // Fallback: basic jsPDF text-based export if no print element is available
      const pdf = new jsPDF('p', 'mm', 'a4');
      const pageWidth = pdf.internal.pageSize.getWidth();
      const margin = 15;
      let yPosition = margin;

      pdf.setFontSize(14);
      pdf.setFont('times', 'bold');
      pdf.text(testTitle, pageWidth / 2, yPosition, { align: 'center' });
      yPosition += 10;

      pdf.setFontSize(10);
      pdf.setFont('times', 'normal');
      questions.forEach((q, i) => {
        const text = q.question_text || q.question || '';
        if (yPosition > 270) { pdf.addPage(); yPosition = margin; }
        pdf.text(`${i + 1}. ${text}`, margin, yPosition);
        yPosition += 7;
      });

      const filename = `${testTitle.toLowerCase().replace(/\s+/g, '-')}.pdf`;
      pdf.save(filename);
      return { success: true, filename };
    } catch (error) {
      console.error('Error exporting test as PDF:', error);
      return false;
    }
  }, [uploadToStorage]);

  return {
    exportTOSMatrix,
    exportTestQuestions,
    uploadToStorage
  };
};


