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
        // Temporarily show the print element for capture
        const originalDisplay = printElement.style.display;
        printElement.style.display = 'block';
        printElement.style.position = 'relative';
        printElement.style.background = 'white';
        printElement.style.width = '210mm';
        printElement.style.padding = '15mm';
        printElement.style.fontFamily = '"Times New Roman", Times, serif';

        const pdf = new jsPDF('p', 'mm', 'a4');
        const pdfW = pdf.internal.pageSize.getWidth();
        const pdfH = pdf.internal.pageSize.getHeight();
        const mx = 10, my = 8;
        const usableW = pdfW - mx * 2;
        const usableH = pdfH - my * 2;
        let hasContent = false;

        const exportSections = Array.from(printElement.querySelectorAll<HTMLElement>('[data-pdf-section]'));
        const sectionsToCapture = exportSections.length > 0 ? exportSections : [printElement];

        try {
        for (const section of sectionsToCapture) {
          const isAnswerKey = section.dataset.pdfSection === 'answer-key' || section.classList.contains('answer-key-section');
          const captureWidth = Math.ceil(section.scrollWidth || section.offsetWidth);
          const captureHeight = Math.ceil(isAnswerKey ? section.offsetHeight : section.scrollHeight);
          const canvas = await html2canvas(section, {
            scale: 1.5,
            useCORS: true,
            backgroundColor: '#ffffff',
            width: captureWidth,
            height: captureHeight,
          });

          if (isAnswerKey) {
            if (hasContent) pdf.addPage();
            const naturalH = (canvas.height * usableW) / canvas.width;
            const fitScale = Math.min(1, usableH / naturalH);
            const renderW = usableW * fitScale;
            const renderH = naturalH * fitScale;
            const x = mx + (usableW - renderW) / 2;
            const y = my + (usableH - renderH) / 2;
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.75), 'JPEG', x, y, renderW, renderH, undefined, 'FAST');
            hasContent = true;
            continue;
          }

          const imgH = (canvas.height * usableW) / canvas.width;

          if (imgH <= usableH) {
            if (hasContent) pdf.addPage();
            pdf.addImage(canvas.toDataURL('image/jpeg', 0.75), 'JPEG', mx, my, usableW, imgH, undefined, 'FAST');
            hasContent = true;
          } else {
            let remaining = imgH, srcY = 0;
            const ratio = canvas.width / usableW;
            while (remaining > 0) {
              if (hasContent || srcY > 0) pdf.addPage();
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
                pdf.addImage(sc.toDataURL('image/jpeg', 0.75), 'JPEG', mx, my, usableW, sliceH, undefined, 'FAST');
              }
              hasContent = true;
              srcY += srcSliceH;
              remaining -= usableH;
            }
          }
        }
        } finally {
          // Restore original display
          printElement.style.display = originalDisplay;
          printElement.style.position = '';
          printElement.style.width = '';
          printElement.style.padding = '';
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


