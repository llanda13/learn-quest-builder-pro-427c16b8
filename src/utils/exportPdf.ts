import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import { supabase } from '@/integrations/supabase/client';

export interface PDFExportOptions {
  filename: string;
  orientation?: 'portrait' | 'landscape';
  format?: 'a4' | 'letter';
  scale?: number;
  quality?: number;
  uploadToStorage?: boolean;
  storageBucket?: string;
}

export interface ExportResult {
  blob: Blob;
  downloadUrl: string;
  storageUrl?: string;
  storagePath?: string;
}

export class PDFExporter {
  private static async captureElement(elementId: string, options: PDFExportOptions): Promise<HTMLCanvasElement> {
    const element = document.getElementById(elementId);
    if (!element) {
      throw new Error(`Element with ID "${elementId}" not found`);
    }

    // Ensure element is visible for capture
    const originalDisplay = element.style.display;
    element.style.display = 'block';

    try {
      const canvas = await html2canvas(element, {
        scale: options.scale || 1.5,
        useCORS: true,
        allowTaint: true,
        logging: false,
        backgroundColor: '#ffffff',
        width: element.scrollWidth,
        height: element.scrollHeight,
        onclone: (clonedDoc) => {
          // Ensure all styles are applied to cloned document
          const clonedElement = clonedDoc.getElementById(elementId);
          if (clonedElement) {
            clonedElement.style.display = 'block';
            clonedElement.style.visibility = 'visible';
          }
        }
      });

      return canvas;
    } finally {
      // Restore original display
      element.style.display = originalDisplay;
    }
  }

  private static createPDF(canvas: HTMLCanvasElement, options: PDFExportOptions): jsPDF {
    const pdf = new jsPDF({
      orientation: options.orientation || 'portrait',
      unit: 'mm',
      format: options.format || 'a4'
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pdfWidth;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;

    const jpegQuality = options.quality ?? 0.75;

    if (imgHeight <= pdfHeight) {
      pdf.addImage(canvas.toDataURL('image/jpeg', jpegQuality), 'JPEG', 0, 0, imgWidth, imgHeight, undefined, 'FAST');
    } else {
      const ratio = canvas.width / imgWidth;
      let remaining = imgHeight;
      let srcY = 0;
      let first = true;
      while (remaining > 0) {
        if (!first) pdf.addPage();
        first = false;
        const sliceH = Math.min(remaining, pdfHeight);
        const srcSliceH = sliceH * ratio;
        const sc = document.createElement('canvas');
        sc.width = canvas.width;
        sc.height = srcSliceH;
        const ctx = sc.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, sc.width, sc.height);
          ctx.drawImage(canvas, 0, srcY, canvas.width, srcSliceH, 0, 0, canvas.width, srcSliceH);
          pdf.addImage(sc.toDataURL('image/jpeg', jpegQuality), 'JPEG', 0, 0, imgWidth, sliceH, undefined, 'FAST');
        }
        srcY += srcSliceH;
        remaining -= pdfHeight;
      }
    }

    return pdf;
  }

  private static async uploadToStorage(
    blob: Blob, 
    filename: string, 
    bucket: string = 'exports'
  ): Promise<{ url: string; path: string }> {
    // Get the current user to enforce owner-based path isolation
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    
    if (userError || !user) {
      throw new Error('Authentication required for file upload');
    }

    const timestamp = new Date().toISOString().slice(0, 10);
    // Path MUST start with user_id to comply with RLS policies on exports bucket
    const path = `${user.id}/${timestamp}/${filename}`;

    const { error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(path, blob, {
        upsert: false, // Prevent accidental overwrites
        contentType: 'application/pdf'
      });

    if (uploadError) {
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    // Use signed URL for private bucket access instead of public URL
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from(bucket)
      .createSignedUrl(path, 3600); // 1 hour expiry

    if (signedUrlError || !signedUrlData) {
      throw new Error(`Failed to generate signed URL: ${signedUrlError?.message}`);
    }

    return {
      url: signedUrlData.signedUrl,
      path
    };
  }

  static async exportToPDF(elementId: string, options: PDFExportOptions): Promise<ExportResult> {
    try {
      const element = document.getElementById(elementId);
      if (!element) {
        throw new Error(`Element with ID "${elementId}" not found`);
      }

      const sectionElements = Array.from(element.querySelectorAll<HTMLElement>('[data-pdf-section]'));
      let pdf: jsPDF;

      if (sectionElements.length === 0) {
        const canvas = await this.captureElement(elementId, options);
        pdf = this.createPDF(canvas, options);
      } else {
        const originalDisplay = element.style.display;
        element.style.display = 'block';

        pdf = new jsPDF({
          orientation: options.orientation || 'portrait',
          unit: 'mm',
          format: options.format || 'a4'
        });

        const pdfWidth = pdf.internal.pageSize.getWidth();
        const pdfHeight = pdf.internal.pageSize.getHeight();
        const jpegQuality = options.quality ?? 0.75;
        let hasContent = false;

        try {
          for (const section of sectionElements) {
            const isAnswerKey = section.dataset.pdfSection === 'answer-key' || section.classList.contains('answer-key-section');
            const captureWidth = Math.ceil(section.scrollWidth || section.offsetWidth);
            const captureHeight = Math.ceil(isAnswerKey ? section.offsetHeight : section.scrollHeight);
            const canvas = await html2canvas(section, {
              scale: options.scale || 1.5,
              useCORS: true,
              allowTaint: true,
              logging: false,
              backgroundColor: '#ffffff',
              width: captureWidth,
              height: captureHeight
            });
            const imgHeight = (canvas.height * pdfWidth) / canvas.width;

            if (isAnswerKey) {
              if (hasContent) pdf.addPage();
              const fitScale = Math.min(1, pdfHeight / imgHeight);
              const renderW = pdfWidth * fitScale;
              const renderH = imgHeight * fitScale;
              pdf.addImage(canvas.toDataURL('image/jpeg', jpegQuality), 'JPEG', (pdfWidth - renderW) / 2, (pdfHeight - renderH) / 2, renderW, renderH, undefined, 'FAST');
              hasContent = true;
              continue;
            }

            if (imgHeight <= pdfHeight) {
              if (hasContent) pdf.addPage();
              pdf.addImage(canvas.toDataURL('image/jpeg', jpegQuality), 'JPEG', 0, 0, pdfWidth, imgHeight, undefined, 'FAST');
              hasContent = true;
            } else {
              const ratio = canvas.width / pdfWidth;
              let remaining = imgHeight;
              let srcY = 0;
              while (remaining > 0) {
                if (hasContent || srcY > 0) pdf.addPage();
                const sliceH = Math.min(remaining, pdfHeight);
                const srcSliceH = sliceH * ratio;
                const sc = document.createElement('canvas');
                sc.width = canvas.width;
                sc.height = srcSliceH;
                const ctx = sc.getContext('2d');
                if (ctx) {
                  ctx.fillStyle = '#ffffff';
                  ctx.fillRect(0, 0, sc.width, sc.height);
                  ctx.drawImage(canvas, 0, srcY, canvas.width, srcSliceH, 0, 0, canvas.width, srcSliceH);
                  pdf.addImage(sc.toDataURL('image/jpeg', jpegQuality), 'JPEG', 0, 0, pdfWidth, sliceH, undefined, 'FAST');
                }
                hasContent = true;
                srcY += srcSliceH;
                remaining -= pdfHeight;
              }
            }
          }
        } finally {
          element.style.display = originalDisplay;
        }
      }
      
      // Generate blob
      const blob = pdf.output('blob');
      const downloadUrl = URL.createObjectURL(blob);

      let storageUrl: string | undefined;
      let storagePath: string | undefined;

      // Upload to storage if requested
      if (options.uploadToStorage) {
        const { url, path } = await this.uploadToStorage(
          blob, 
          options.filename, 
          options.storageBucket
        );
        storageUrl = url;
        storagePath = path;
      }

      return {
        blob,
        downloadUrl,
        storageUrl,
        storagePath
      };
    } catch (error) {
      console.error('PDF export error:', error);
      throw new Error(`PDF export failed: ${error.message}`);
    }
  }

  // Convenience methods for specific document types
  static async exportTOSMatrix(
    tosId: string, 
    uploadToStorage: boolean = true
  ): Promise<ExportResult> {
    return this.exportToPDF('tos-matrix-export', {
      filename: `tos_matrix_${tosId}`,
      orientation: 'landscape',
      format: 'a4',
      uploadToStorage,
      storageBucket: 'exports'
    });
  }

  static async exportTestVersion(
    testId: string,
    versionLabel: string,
    uploadToStorage: boolean = true
  ): Promise<ExportResult> {
    return this.exportToPDF(`test-version-${versionLabel}`, {
      filename: `test_${testId}_version_${versionLabel}`,
      orientation: 'portrait',
      format: 'a4',
      uploadToStorage,
      storageBucket: 'exports'
    });
  }

  static async exportAnswerKey(
    testId: string,
    versionLabel: string,
    uploadToStorage: boolean = true
  ): Promise<ExportResult> {
    return this.exportToPDF(`answer-key-${versionLabel}`, {
      filename: `answer_key_${testId}_version_${versionLabel}`,
      orientation: 'portrait',
      format: 'a4',
      uploadToStorage,
      storageBucket: 'exports'
    });
  }

  static async exportRubric(
    rubricId: string,
    uploadToStorage: boolean = true
  ): Promise<ExportResult> {
    return this.exportToPDF('rubric-printout', {
      filename: `rubric_${rubricId}`,
      orientation: 'portrait',
      format: 'a4',
      uploadToStorage,
      storageBucket: 'exports'
    });
  }

  // Download blob directly to user's device
  static downloadBlob(blob: Blob, filename: string): void {
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename.endsWith('.pdf') ? filename : `${filename}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  // Print element directly
  static printElement(elementId: string, title?: string): void {
    const element = document.getElementById(elementId);
    if (!element) {
      throw new Error(`Element with ID "${elementId}" not found`);
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      throw new Error('Failed to open print window');
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>${title || 'Print'}</title>
          <style>
            body { 
              font-family: Arial, sans-serif; 
              margin: 20px; 
              line-height: 1.6; 
              color: #000;
              background: #fff;
            }
            .question { 
              margin-bottom: 20px; 
              page-break-inside: avoid; 
            }
            .choices { 
              margin-left: 20px; 
            }
            .choice { 
              margin-bottom: 5px; 
            }
            .header { 
              text-align: center; 
              border-bottom: 2px solid #000; 
              padding-bottom: 10px; 
              margin-bottom: 20px; 
            }
            table {
              border-collapse: collapse;
              width: 100%;
            }
            th, td {
              border: 1px solid #000;
              padding: 8px;
              text-align: left;
            }
            th {
              background-color: #f0f0f0;
            }
            @media print { 
              .no-print { display: none; }
              body { margin: 0; }
              .page-break { page-break-before: always; }
            }
          </style>
        </head>
        <body>
          ${element.innerHTML}
        </body>
      </html>
    `);
    
    printWindow.document.close();
    printWindow.print();
    printWindow.close();
  }

  // Batch export multiple documents
  static async exportBatch(
    exports: Array<{ elementId: string; filename: string; options?: Partial<PDFExportOptions> }>
  ): Promise<ExportResult[]> {
    const results: ExportResult[] = [];
    
    for (const exportItem of exports) {
      try {
        const result = await this.exportToPDF(exportItem.elementId, {
          filename: exportItem.filename,
          uploadToStorage: true,
          ...exportItem.options
        });
        results.push(result);
      } catch (error) {
        console.error(`Failed to export ${exportItem.filename}:`, error);
      }
    }
    
    return results;
  }
}