import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { supabase } from '@/integrations/supabase/client';

export interface PDFExportOptions {
  filename: string;
  orientation?: 'portrait' | 'landscape';
  format?: 'a4' | 'letter';
  scale?: number;
  quality?: number;
}

export interface ExportResult {
  blob: Blob;
  url: string;
  storageUrl?: string;
}

/**
 * Export HTML element to PDF
 */
export async function exportToPDF(
  elementId: string, 
  options: PDFExportOptions
): Promise<ExportResult> {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error(`Element with ID "${elementId}" not found`);
  }

  try {
    const jpegQuality = options.quality ?? 0.75;
    const pdf = new jsPDF({
      orientation: options.orientation || 'portrait',
      unit: 'mm',
      format: options.format || 'a4'
    });

    const pdfWidth = pdf.internal.pageSize.getWidth();
    const pdfHeight = pdf.internal.pageSize.getHeight();
    const imgWidth = pdfWidth;
    const sections = Array.from(element.querySelectorAll<HTMLElement>('[data-pdf-section]'));
    const sectionsToCapture = sections.length > 0 ? sections : [element];
    let hasContent = false;

    for (const section of sectionsToCapture) {
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
      const imgHeight = (canvas.height * imgWidth) / canvas.width;

      if (isAnswerKey) {
        if (hasContent) pdf.addPage();
        const fitScale = Math.min(1, pdfHeight / imgHeight);
        const renderW = imgWidth * fitScale;
        const renderH = imgHeight * fitScale;
        pdf.addImage(canvas.toDataURL('image/jpeg', jpegQuality), 'JPEG', (pdfWidth - renderW) / 2, (pdfHeight - renderH) / 2, renderW, renderH, undefined, 'FAST');
        hasContent = true;
        continue;
      }

      if (imgHeight <= pdfHeight) {
        if (hasContent) pdf.addPage();
        pdf.addImage(canvas.toDataURL('image/jpeg', jpegQuality), 'JPEG', 0, 0, imgWidth, imgHeight, undefined, 'FAST');
        hasContent = true;
      } else {
        const ratio = canvas.width / imgWidth;
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
            pdf.addImage(sc.toDataURL('image/jpeg', jpegQuality), 'JPEG', 0, 0, imgWidth, sliceH, undefined, 'FAST');
          }
          hasContent = true;
          srcY += srcSliceH;
          remaining -= pdfHeight;
        }
      }
    }

    // Generate blob
    const blob = pdf.output('blob');
    const url = URL.createObjectURL(blob);

    return { blob, url };
  } catch (error) {
    console.error('PDF export error:', error);
    throw new Error('Failed to generate PDF');
  }
}

/**
 * Upload PDF to Supabase Storage with owner-based path
 */
export async function uploadPDFToStorage(
  blob: Blob, 
  path: string
): Promise<string> {
  try {
    // Get current user for owner-based storage path
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      throw new Error('User must be authenticated to upload files');
    }

    // Prepend user ID to path for owner-based RLS
    const securePath = `${user.id}/${path}`;

    const { data, error } = await supabase.storage
      .from('exports')
      .upload(securePath, blob, {
        upsert: true,
        contentType: 'application/pdf'
      });

    if (error) throw error;

    // Use signed URL instead of public URL for secure access
    const { data: signedUrlData, error: signedUrlError } = await supabase.storage
      .from('exports')
      .createSignedUrl(securePath, 3600); // 1 hour expiry

    if (signedUrlError) throw signedUrlError;

    return signedUrlData.signedUrl;
  } catch (error) {
    console.error('Storage upload error:', error);
    throw new Error('Failed to upload PDF to storage');
  }
}

/**
 * Export test version to PDF with optional storage upload
 */
export async function exportTestVersion(
  testId: string,
  versionLabel: string,
  uploadToStorage: boolean = false
): Promise<ExportResult> {
  const elementId = `test-version-${versionLabel}`;
  const filename = `test_${testId}_version_${versionLabel}.pdf`;

  const { blob, url } = await exportToPDF(elementId, {
    filename,
    orientation: 'portrait',
    format: 'a4'
  });

  let storageUrl: string | undefined;
  
  if (uploadToStorage) {
    const storagePath = `tests/${testId}/${filename}`;
    storageUrl = await uploadPDFToStorage(blob, storagePath);
    
    // Track export in database
    try {
      await supabase
        .from('test_exports')
        .insert({
          test_version_id: testId,
          export_type: 'pdf',
          file_name: filename,
          exported_by: 'teacher'
        });
    } catch (error) {
      console.warn('Failed to track export in database:', error);
    }
  }

  return { blob, url, storageUrl };
}

/**
 * Export answer key to PDF
 */
export async function exportAnswerKey(
  testId: string,
  versionLabel: string,
  uploadToStorage: boolean = false
): Promise<ExportResult> {
  const elementId = `answer-key-${versionLabel}`;
  const filename = `answer_key_${testId}_version_${versionLabel}.pdf`;

  const { blob, url } = await exportToPDF(elementId, {
    filename,
    orientation: 'portrait',
    format: 'a4'
  });

  let storageUrl: string | undefined;
  
  if (uploadToStorage) {
    const storagePath = `answer-keys/${testId}/${filename}`;
    storageUrl = await uploadPDFToStorage(blob, storagePath);
  }

  return { blob, url, storageUrl };
}

/**
 * Export TOS matrix to PDF
 */
export async function exportTOSMatrix(
  tosId: string,
  uploadToStorage: boolean = false
): Promise<ExportResult> {
  const elementId = 'tos-matrix-export';
  const filename = `tos_matrix_${tosId}.pdf`;

  const { blob, url } = await exportToPDF(elementId, {
    filename,
    orientation: 'landscape',
    format: 'a4'
  });

  let storageUrl: string | undefined;
  
  if (uploadToStorage) {
    const storagePath = `tos/${tosId}/${filename}`;
    storageUrl = await uploadPDFToStorage(blob, storagePath);
  }

  return { blob, url, storageUrl };
}

/**
 * Export rubric to PDF
 */
export async function exportRubric(
  rubricId: string,
  uploadToStorage: boolean = false
): Promise<ExportResult> {
  const elementId = `rubric-printout`;
  const filename = `rubric_${rubricId}.pdf`;

  const { blob, url } = await exportToPDF(elementId, {
    filename,
    orientation: 'portrait',
    format: 'a4'
  });

  let storageUrl: string | undefined;
  
  if (uploadToStorage) {
    const storagePath = `rubrics/${rubricId}/${filename}`;
    storageUrl = await uploadPDFToStorage(blob, storagePath);
  }

  return { blob, url, storageUrl };
}

/**
 * Batch export all test versions
 */
export async function exportAllTestVersions(
  testId: string,
  versions: string[],
  uploadToStorage: boolean = false
): Promise<Array<{ version: string } & ExportResult>> {
  const exports = [];

  for (const version of versions) {
    try {
      const result = await exportTestVersion(testId, version, uploadToStorage);
      exports.push({
        version,
        ...result
      });
    } catch (error) {
      console.error(`Failed to export version ${version}:`, error);
    }
  }

  return exports;
}

/**
 * Download file from blob
 */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Print HTML element
 */
export function printElement(elementId: string, title?: string) {
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

/**
 * Export multiple documents as ZIP
 */
export async function exportAsZip(
  documents: Array<{ name: string; blob: Blob }>,
  zipFilename: string
): Promise<Blob> {
  // This would require a ZIP library like JSZip
  // For now, we'll just return the first document
  if (documents.length > 0) {
    return documents[0].blob;
  }
  throw new Error('No documents to export');
}

/**
 * Generate test preview without full PDF
 */
export function generateTestPreview(elementId: string): Promise<string> {
  const element = document.getElementById(elementId);
  if (!element) {
    throw new Error(`Element with ID "${elementId}" not found`);
  }

  return html2canvas(element, {
    scale: 1,
    logging: false,
    useCORS: true,
    allowTaint: true,
    backgroundColor: '#ffffff'
  }).then(canvas => {
    return canvas.toDataURL('image/png', 0.8);
  });
}