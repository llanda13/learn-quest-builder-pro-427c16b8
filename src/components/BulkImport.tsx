import React, { useState, useCallback, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import Papa from 'papaparse';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Upload, FileText, CircleCheck as CheckCircle, CircleAlert as AlertCircle, X, Download, Brain, Sparkles, Eye, Save, Pencil } from 'lucide-react';
import { toast } from 'sonner';
import { Questions } from '@/services/db/questions';
import { classifyQuestions } from '@/services/edgeFunctions';
import { classifyBloom, detectKnowledgeDimension, inferDifficulty } from '@/services/ai/classify';
import { useTaxonomyClassification } from '@/hooks/useTaxonomyClassification';
import { resolveSubjectMetadata } from '@/services/ai/subjectMetadataResolver';
import { normalizeCategory, normalizeSpecialization } from '@/utils/acronymNormalizer';
import { useAcademicHierarchy } from '@/hooks/useAcademicHierarchy';

// Persistent draft keys — survive tab switches, refreshes, and brief disconnects
// so admins never lose a half-verified bulk import.
const BI_KEYS = {
  preview: 'bulk-import.preview-data',
  verification: 'bulk-import.verification-data',
  step: 'bulk-import.step',
  category: 'bulk-import.selected-category',
  specialization: 'bulk-import.selected-specialization',
} as const;

const readJSON = <T,>(key: string, fallback: T): T => {
  if (typeof window === 'undefined') return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch { return fallback; }
};
const writeJSON = (key: string, value: unknown) => {
  try { window.localStorage.setItem(key, JSON.stringify(value)); } catch { /* noop */ }
};
const clearDraftKeys = () => {
  try { Object.values(BI_KEYS).forEach(k => window.localStorage.removeItem(k)); } catch { /* noop */ }
};

interface BulkImportProps {
  onClose: () => void;
  onImportComplete: () => void;
}

interface ParsedQuestion {
  topic: string;
  question_text: string;
  question_type: 'mcq' | 'true_false' | 'essay' | 'short_answer';
  choices?: Record<string, string>;
  correct_answer?: string;
  bloom_level?: string;
  difficulty?: string;
  knowledge_dimension?: string;
  created_by: 'teacher' | 'admin' | 'ai';
  approved: boolean;
  needs_review: boolean;
  ai_confidence_score?: number;
  quality_score?: number;
  readability_score?: number;
  classification_confidence?: number;
  validation_status?: string;
  subject?: string;
  grade_level?: string;
  term?: string;
  tags?: string[];
  category?: string;
  specialization?: string;
  subject_code?: string;
  subject_description?: string;
}

interface ImportStats {
  total: number;
  processed: number;
  approved: number;
  needsReview: number;
  byBloom: Record<string, number>;
  byDifficulty: Record<string, number>;
  byTopic: Record<string, number>;
}

type ImportStep = 'upload' | 'preview' | 'verification' | 'processing' | 'results';

export default function BulkImport({
  onClose,
  onImportComplete,
}: BulkImportProps) {
  const [file, setFile] = useState<File | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentStep, setCurrentStep] = useState('');
  const [results, setResults] = useState<ImportStats | null>(null);
  const [errors, setErrors] = useState<string[]>([]);
  const [previewData, setPreviewData] = useState<any[]>(() => readJSON<any[]>(BI_KEYS.preview, []));
  const [showPreview, setShowPreview] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<string>(() => readJSON<string>(BI_KEYS.category, ''));
  const [selectedSpecialization, setSelectedSpecialization] = useState<string>(() => readJSON<string>(BI_KEYS.specialization, ''));
  const [classificationResults, setClassificationResults] = useState<any[]>([]);
  const [showClassificationDetails, setShowClassificationDetails] = useState(false);
  
  // New: verification step state
  const [importStep, setImportStep] = useState<ImportStep>(() => readJSON<ImportStep>(BI_KEYS.step, 'upload'));
  const [verificationData, setVerificationData] = useState<ParsedQuestion[]>(() => readJSON<ParsedQuestion[]>(BI_KEYS.verification, []));
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  // Lock to prevent duplicate submissions and to disable Save after a successful import
  const [hasImported, setHasImported] = useState(false);
  const importLockRef = React.useRef(false);

  // Full reset to initial state (clears file, preview, verification, classification, errors, drafts)
  const resetAll = useCallback(() => {
    setFile(null);
    setPreviewData([]);
    setShowPreview(false);
    setVerificationData([]);
    setClassificationResults([]);
    setShowClassificationDetails(false);
    setResults(null);
    setErrors([]);
    setProgress(0);
    setCurrentStep('');
    setEditingIndex(null);
    setImportStep('upload');
    setHasImported(false);
    importLockRef.current = false;
    clearDraftKeys();
  }, []);

  // Existing topics from Question Bank for auto-assignment
  const [existingTopics, setExistingTopics] = useState<string[]>([]);

  // ─── DB-driven academic hierarchy (single source of truth used by Question Bank filters) ───
  const hierarchy = useAcademicHierarchy();

  /**
   * Resolve raw / AI-suggested classification values to the EXACT strings stored
   * in the academic_categories / academic_specializations / academic_subjects tables
   * — which is what the Question Bank filters compare against.
   *
   * Strategy (in priority order):
   *   1. Description match (case-insensitive, trimmed) → most reliable
   *   2. Code match within the candidate category/specialization
   *   3. Normalized category/specialization name match
   *   4. Fuzzy contains match on description
   * Returns `matched: false` when no DB row could be inferred so the UI can flag it.
   */
  const resolveFromDb = useCallback((input: {
    category?: string;
    specialization?: string;
    subject_code?: string;
    subject_description?: string;
  }): { category: string; specialization: string; subject_code: string; subject_description: string; matched: boolean } => {
    const cats = hierarchy.categories;
    const specs = hierarchy.allSpecializations;
    const subs = hierarchy.allSubjects;
    if (!cats.length || !subs.length) {
      return {
        category: input.category || '',
        specialization: input.specialization || '',
        subject_code: input.subject_code || '',
        subject_description: input.subject_description || '',
        matched: false,
      };
    }

    const norm = (v?: string) => (v || '').toLowerCase().trim();
    const inDesc = norm(input.subject_description);
    const inCode = norm(input.subject_code);
    const inCat = norm(normalizeCategory(input.category) || input.category);
    const inSpec = norm(normalizeSpecialization(input.specialization) || input.specialization);

    // 1) Exact description match
    if (inDesc) {
      const sub = subs.find(s => norm(s.description) === inDesc);
      if (sub) {
        const spec = specs.find(s => s.id === sub.specialization_id);
        const cat = spec ? cats.find(c => c.id === spec.category_id) : undefined;
        if (spec && cat) return { category: cat.name, specialization: spec.name, subject_code: sub.code, subject_description: sub.description, matched: true };
      }
    }

    // 2) Code match (optionally constrained by category/specialization name)
    if (inCode) {
      const candidates = subs.filter(s => norm(s.code) === inCode);
      let best = candidates[0];
      if (candidates.length > 1 && (inSpec || inCat)) {
        best = candidates.find(s => {
          const spec = specs.find(sp => sp.id === s.specialization_id);
          const cat = spec ? cats.find(c => c.id === spec.category_id) : undefined;
          return (!inSpec || norm(spec?.name) === inSpec) && (!inCat || norm(cat?.name) === inCat);
        }) || best;
      }
      if (best) {
        const spec = specs.find(s => s.id === best.specialization_id);
        const cat = spec ? cats.find(c => c.id === spec.category_id) : undefined;
        if (spec && cat) return { category: cat.name, specialization: spec.name, subject_code: best.code, subject_description: best.description, matched: true };
      }
    }

    // 3) Fuzzy description (contains)
    if (inDesc) {
      const sub = subs.find(s => {
        const d = norm(s.description);
        return d && (d.includes(inDesc) || inDesc.includes(d));
      });
      if (sub) {
        const spec = specs.find(s => s.id === sub.specialization_id);
        const cat = spec ? cats.find(c => c.id === spec.category_id) : undefined;
        if (spec && cat) return { category: cat.name, specialization: spec.name, subject_code: sub.code, subject_description: sub.description, matched: true };
      }
    }

    // 4) Best-effort: snap category & specialization to a known DB name (no subject)
    const cat = cats.find(c => norm(c.name) === inCat);
    const spec = specs.find(s => norm(s.name) === inSpec && (!cat || s.category_id === cat.id));
    return {
      category: cat?.name || '',
      specialization: spec?.name || '',
      subject_code: '',
      subject_description: '',
      matched: false,
    };
  }, [hierarchy.categories, hierarchy.allSpecializations, hierarchy.allSubjects]);

  // ─── Autosave draft state (debounced) ───
  useEffect(() => { const t = setTimeout(() => writeJSON(BI_KEYS.preview, previewData), 300); return () => clearTimeout(t); }, [previewData]);
  useEffect(() => { const t = setTimeout(() => writeJSON(BI_KEYS.verification, verificationData), 300); return () => clearTimeout(t); }, [verificationData]);
  useEffect(() => { writeJSON(BI_KEYS.step, importStep); }, [importStep]);
  useEffect(() => { writeJSON(BI_KEYS.category, selectedCategory); }, [selectedCategory]);
  useEffect(() => { writeJSON(BI_KEYS.specialization, selectedSpecialization); }, [selectedSpecialization]);

  const { batchClassify, buildTaxonomyMatrix } = useTaxonomyClassification({
    useMLClassifier: true,
    storeResults: true,
    checkSimilarity: true
  });

  // Fetch existing topics from Question Bank on mount
  useEffect(() => {
    const fetchTopics = async () => {
      try {
        const { data, error } = await supabase
          .from('questions')
          .select('topic')
          .eq('deleted', false)
          .not('topic', 'is', null);
        if (!error && data) {
          const uniqueTopics = [...new Set(data.map(q => q.topic).filter(Boolean))];
          setExistingTopics(uniqueTopics);
          console.log(`Loaded ${uniqueTopics.length} existing topics for auto-assignment`);
        }
      } catch (e) {
        console.warn('Failed to fetch existing topics:', e);
      }
    };
    fetchTopics();
  }, []);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (!file) return;

    const isCSV = file.type === 'text/csv' || file.name.endsWith('.csv');
    const isPDF = file.type === 'application/pdf' || file.name.endsWith('.pdf');

    if (isCSV) {
      setFile(file);
      setErrors([]);
      previewCSV(file);
    } else if (isPDF) {
      setFile(file);
      setErrors([]);
      previewPDF(file);
    } else {
      toast.error('Please upload a CSV or PDF file');
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'text/csv': ['.csv'],
      'application/vnd.ms-excel': ['.csv'],
      'application/pdf': ['.pdf'],
    },
    multiple: false,
    maxSize: 50 * 1024 * 1024,
  });

  const previewCSV = (file: File) => {
    Papa.parse(file, {
      header: true,
      preview: 5,
      complete: (results) => {
        setPreviewData(results.data);
        setShowPreview(true);
        setImportStep('preview');
      },
      error: (error) => {
        toast.error(`CSV parsing error: ${error.message}`);
      },
    });
  };

  /**
   * Metadata keywords that indicate a line is descriptive info, not a question.
   * These patterns are checked against numbered lines to filter out false positives.
   */
  const METADATA_KEYWORDS = [
    'question bank', 'category:', 'specialization:', 'subject code:', 'subject description:',
    'cognitive level:', 'points value:', 'correct answer:', 'topic:', 'course:',
    'major specialization', 'minor specialization', 'introduction to', 'table of specification',
    'instruction:', 'directions:', 'note:', 'department:', 'college:', 'university:',
    'school year:', 'semester:', 'exam period:', 'time limit:', 'total items:',
    'prepared by:', 'checked by:', 'approved by:', 'date:', 'section:',
  ];

  /** Check if text is metadata/header rather than an actual question */
  const isMetadataLine = (text: string): boolean => {
    const lower = text.toLowerCase().trim();
    // Check against known metadata keywords
    if (METADATA_KEYWORDS.some(kw => lower.includes(kw))) return true;
    // Lines that are just labels with colons and no question mark are likely metadata
    if (lower.includes(':') && !lower.includes('?') && lower.split(':').length >= 2) {
      const beforeColon = lower.split(':')[0].trim();
      // If the part before the colon is a short label (< 4 words), it's metadata
      if (beforeColon.split(/\s+/).length <= 4) return true;
    }
    // Very short text without question structure
    if (lower.length < 15 && !lower.includes('?')) return true;
    return false;
  };

  /** Extract global metadata from non-question text in the PDF */
  const extractPDFMetadata = (text: string): Record<string, string> => {
    const metadata: Record<string, string> = {};
    const patterns: Record<string, RegExp> = {
      category: /category\s*:\s*(.+?)(?:\n|$)/i,
      specialization: /specialization\s*:\s*(.+?)(?:\n|$)/i,
      subject_code: /subject\s*code\s*:\s*(.+?)(?:\n|$)/i,
      subject_description: /subject\s*description\s*:\s*(.+?)(?:\n|$)/i,
      cognitive_level: /cognitive\s*level\s*:\s*(.+?)(?:\n|$)/i,
      topic: /topic\s*:\s*(.+?)(?:\n|$)/i,
      course: /course\s*:\s*(.+?)(?:\n|$)/i,
    };
    for (const [key, regex] of Object.entries(patterns)) {
      const match = text.match(regex);
      if (match) metadata[key] = match[1].trim();
    }
    // Also try to extract subject from "IT101: Introduction to Computing" pattern
    const subjectMatch = text.match(/([A-Z]{2,}\d{3,})\s*[:\-–]\s*(.+?)(?:\n|category|specialization)/i);
    if (subjectMatch) {
      metadata.subject_code = metadata.subject_code || subjectMatch[1].trim();
      metadata.subject_description = metadata.subject_description || subjectMatch[2].trim();
    }
    return metadata;
  };

  /** Validate that a correct answer is within A-D range for MCQ */
  const validateCorrectAnswer = (answer: string, choices: Record<string, string>): string => {
    const cleaned = answer.trim().toUpperCase();
    const validLetters = Object.keys(choices);
    if (validLetters.includes(cleaned)) return cleaned;
    // Don't default to 'A' — return empty to flag for review
    return '';
  };

  /** Extract raw text from PDF using pdfjs */
  const extractPDFText = async (file: File): Promise<string> => {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument(arrayBuffer).promise;
    
    let fullText = '';
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(' ');
      fullText += pageText + '\n';
    }
    return fullText;
  };

  /** AI-assisted PDF parsing: sends raw text to edge function for intelligent extraction */
  const aiParsePDF = async (rawText: string): Promise<{ questions: any[]; metadata: Record<string, string> }> => {
    try {
      const { data, error } = await supabase.functions.invoke('parse-pdf-questions', {
        body: {
          raw_text: rawText,
          existing_topics: existingTopics,
          metadata: extractPDFMetadata(rawText),
        },
      });

      if (error) throw error;
      if (!data || !data.questions) throw new Error('No structured output from AI parser');

      console.log(`AI parser returned ${data.questions.length} questions`);
      return {
        questions: data.questions,
        metadata: data.detected_metadata || {},
      };
    } catch (err) {
      console.warn('AI PDF parsing failed, falling back to regex:', err);
      throw err;
    }
  };

  /** Regex-based fallback PDF parser for when AI is unavailable */
  const regexParsePDF = (fullText: string): any[] => {
    const globalMeta = extractPDFMetadata(fullText);
    const questions: any[] = [];

    const questionBlockRegex = /(?:^|\n)\s*(?:Q\.?\s*)?(\d+)\s*[.)]\s+/gi;
    const matches: { index: number; num: string }[] = [];
    let match: RegExpExecArray | null;
    while ((match = questionBlockRegex.exec(fullText)) !== null) {
      matches.push({ index: match.index, num: match[1] });
    }

    const blocks: { num: string; text: string }[] = [];
    for (let i = 0; i < matches.length; i++) {
      const start = matches[i].index;
      const end = i + 1 < matches.length ? matches[i + 1].index : fullText.length;
      const blockText = fullText.substring(start, end).trim();
      const cleaned = blockText.replace(/^\s*(?:Q\.?\s*)?\d+\s*[.)]\s+/i, '').trim();
      blocks.push({ num: matches[i].num, text: cleaned });
    }

    for (const block of blocks) {
      if (isMetadataLine(block.text.split('\n')[0] || block.text)) continue;

      let correctAnswer = '';
      const answerMatch = block.text.match(/(?:Answer|Correct\s*Answer)\s*:\s*([A-Fa-f])/i);
      if (answerMatch) correctAnswer = answerMatch[1].toUpperCase();

      const cleanedBlock = block.text
        .replace(/•\s*Cognitive\s*Level.*$/gim, '')
        .replace(/•\s*Difficulty\s*Level.*$/gim, '')
        .replace(/•\s*Points?\s*Value.*$/gim, '')
        .replace(/(?:Answer|Correct\s*Answer)\s*:\s*[A-Fa-f]\b/gi, '')
        .trim();

      const questionText = cleanedBlock.split(/(?:^|\n)\s*[A-F][.)]\s/m)[0]
        .replace(/\n/g, ' ').trim();

      if (!questionText || questionText.length < 5) continue;

      const choices: Record<string, string> = {};
      const choiceRegex = /(?:^|\n)\s*([A-F])\s*[.)]\s+(.+?)(?=(?:\n\s*[A-F]\s*[.)])|$)/gs;
      let choiceMatch: RegExpExecArray | null;
      while ((choiceMatch = choiceRegex.exec(cleanedBlock)) !== null) {
        const letter = choiceMatch[1].toUpperCase();
        let choiceText = choiceMatch[2].trim().replace(/\n/g, ' ');
        if (choiceText.includes('*') || choiceText.includes('✓')) {
          if (!correctAnswer) correctAnswer = letter;
          choiceText = choiceText.replace(/[*✓]/g, '').trim();
        }
        choices[letter] = choiceText;
      }

      if (Object.keys(choices).length === 0) {
        const inlineRegex = /([A-D])\s*[.)]\s*([^A-D]+?)(?=\s+[A-D]\s*[.)]|$)/g;
        let inlineMatch: RegExpExecArray | null;
        while ((inlineMatch = inlineRegex.exec(cleanedBlock)) !== null) {
          choices[inlineMatch[1].toUpperCase()] = inlineMatch[2].trim();
        }
      }

      const choiceCount = Object.keys(choices).length;
      let questionType: string = 'mcq';
      if (choiceCount === 0) {
        questionType = questionText.length > 100 ? 'essay' : 'short_answer';
      }

      const validatedAnswer = choiceCount > 0 ? validateCorrectAnswer(correctAnswer, choices) : '';

      questions.push({
        Question: questionText,
        Type: questionType,
        ...(choiceCount > 0 ? choices : {}),
        Correct: validatedAnswer,
        Topic: globalMeta.topic || '',
        Category: globalMeta.category || '',
        Specialization: globalMeta.specialization || '',
        SubjectCode: globalMeta.subject_code || '',
        SubjectDescription: globalMeta.subject_description || '',
      });
    }

    return questions;
  };

  /** Main PDF extraction: AI-first with regex fallback */
  const extractQuestionsFromPDF = async (file: File): Promise<any[]> => {
    try {
      const rawText = await extractPDFText(file);
      
      // Try AI-assisted parsing first
      try {
        setCurrentStep('AI is analyzing PDF structure...');
        const { questions: aiQuestions, metadata } = await aiParsePDF(rawText);
        
        if (aiQuestions.length > 0) {
          // Convert AI output to standard format
          return aiQuestions.map((q: any) => ({
            Question: q.question_text,
            Type: q.question_type || 'mcq',
            ...(q.choices || {}),
            Correct: q.correct_answer || '',
            Topic: q.topic || '',
            Bloom: q.bloom_level || '',
            Difficulty: q.difficulty || '',
            Category: metadata.category || '',
            Specialization: metadata.specialization || '',
            SubjectCode: metadata.subject_code || '',
            SubjectDescription: metadata.subject_description || '',
          }));
        }
      } catch (aiErr) {
        console.warn('AI parsing failed, using regex fallback:', aiErr);
        toast.info('AI parsing unavailable, using pattern-based extraction');
      }

      // Fallback to regex
      setCurrentStep('Extracting questions using pattern matching...');
      const regexQuestions = regexParsePDF(rawText);
      
      if (regexQuestions.length === 0) {
        // Last resort: paragraph-based
        const globalMeta = extractPDFMetadata(rawText);
        const paragraphs = rawText.split(/\n\s*\n/).filter(p => {
          const trimmed = p.trim();
          return trimmed.length > 10 && !isMetadataLine(trimmed);
        });
        return paragraphs.map(para => ({
          Question: para.trim().substring(0, 500),
          Type: 'short_answer',
          Correct: '',
          Topic: globalMeta.topic || '',
          Category: globalMeta.category || '',
          Specialization: globalMeta.specialization || '',
          SubjectCode: globalMeta.subject_code || '',
          SubjectDescription: globalMeta.subject_description || '',
        }));
      }

      return regexQuestions;
    } catch (error) {
      console.error('PDF parsing error:', error);
      throw new Error('Failed to parse PDF content');
    }
  };
  const previewPDF = async (file: File) => {
    try {
      setCurrentStep('Extracting text from PDF...');
      const questions = await extractQuestionsFromPDF(file);
      setPreviewData(questions.slice(0, 5));
      setShowPreview(true);
      setImportStep('preview');
      toast.success(`Extracted ${questions.length} questions from PDF`);
    } catch (error) {
      toast.error(`PDF parsing error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  /** Validate AFTER normalization - only check truly essential fields */
  const validateNormalized = (q: Partial<ParsedQuestion>, index: number): string[] => {
    const errors: string[] = [];
    if (!q.question_text || q.question_text.trim().length < 5) {
      errors.push(`Row ${index + 1}: Missing or too short question text`);
    }
    if (q.question_type === 'mcq') {
      const choiceCount = q.choices ? Object.keys(q.choices).length : 0;
      if (choiceCount < 2) {
        errors.push(`Row ${index + 1}: MCQ needs at least 2 answer choices`);
      }
    }
    return errors;
  };


  const stripQuestionPrefix = (text: string): string => {
    return String(text || '')
      // Leading labels (Q1., Q1), (Q1), Question 1:, 1.)
      .replace(/^\s*(?:\(\s*)?(?:(?:q(?:uestion)?\.?\s*)?\d+)(?:\s*[.)\-:]\s*)?(?:\)\s*)?/i, '')
      .replace(/^\s*(?:item\s*)?\d+\s*[.)\-:]\s*/i, '')
      // Inline/Trailing labels ((Q1), Q1., Question 1)
      .replace(/\(\s*q(?:uestion)?\.?\s*\d+\s*\)/gi, ' ')
      .replace(/\bq(?:uestion)?\.?\s*\d+\s*[.)]?\s*$/i, '')
      .trim();
  };

  const normalizeRow = (row: any): Partial<ParsedQuestion> => {
    const rawText = row.Question || row.question_text || row['Question Text'] || row.question || '';
    const questionText = stripQuestionPrefix(rawText);
    const topic = row.Topic || row.topic || '';
    const type = (row.Type || row.type || row.question_type || '').toLowerCase();

    let question_type: ParsedQuestion['question_type'] = 'mcq';
    if (type.includes('true') || type.includes('false') || type === 'tf') {
      question_type = 'true_false';
    } else if (type.includes('essay')) {
      question_type = 'essay';
    } else if (type.includes('short') || type.includes('fill')) {
      question_type = 'short_answer';
    }

    let choices: Record<string, string> | undefined;
    if (question_type === 'mcq') {
      choices = {};
      ['A', 'B', 'C', 'D', 'E', 'F'].forEach((letter) => {
        const choice = row[letter] || row[`Choice ${letter}`] || row[`choice_${letter.toLowerCase()}`] || row[letter.toLowerCase()];
        if (choice && String(choice).trim()) {
          choices![letter] = String(choice).trim();
        }
      });
      // If no choices found, auto-detect type
      if (Object.keys(choices).length === 0) {
        question_type = questionText.length > 100 ? 'essay' : 'short_answer';
        choices = undefined;
      }
    }

    // Read metadata columns from CSV - all optional
    const csvCategory = normalizeCategory(row.Category || row.category || '');
    const csvSpecialization = normalizeSpecialization(row.Specialization || row.specialization || '');
    const csvSubjectCode = row.SubjectCode || row.subject_code || row['Subject Code'] || '';
    const csvSubjectDescription = row.SubjectDescription || row.subject_description || row['Subject Description'] || '';

    // Topic defaults: use subject description, then 'General'
    const finalTopic = topic.trim() || csvSubjectDescription.trim() || 'General';

    return {
      topic: finalTopic,
      question_text: questionText.trim(),
      question_type,
      choices,
      correct_answer: (() => {
        const raw = row.Correct || row.correct_answer || row['Correct Answer'] || row.Answer || row.answer || '';
        if (!raw) return '';
        // Strictly validate correct answer is within A-D for MCQ
        if (question_type === 'mcq' && choices) {
          const upper = String(raw).trim().toUpperCase();
          return Object.keys(choices).includes(upper) ? upper : '';
        }
        return String(raw).trim();
      })(),
      bloom_level: row.Bloom || row.bloom_level || row['Bloom Level'] || row['Bloom'],
      difficulty: row.Difficulty || row.difficulty,
      knowledge_dimension: row.KnowledgeDimension || row.knowledge_dimension || row['Knowledge Dimension'],
      subject: row.Subject || row.subject || undefined,
      grade_level: row['Grade Level'] || row.grade_level || undefined,
      term: row.Term || row.term || undefined,
      tags: row.Tags ? (Array.isArray(row.Tags) ? row.Tags : String(row.Tags).split(',').map((t: string) => t.trim())) : undefined,
      category: csvCategory.trim() || undefined,
      specialization: csvSpecialization.trim() || undefined,
      subject_code: csvSubjectCode.trim() || undefined,
      subject_description: csvSubjectDescription.trim() || undefined,
    };
  };

  /**
   * Token-based semantic deduplication using Jaccard similarity.
   * Compares all question pairs and removes near-duplicates above the threshold.
   */
  /** Normalize text for comparison: remove Q-labels, lowercase, strip punctuation, collapse whitespace */
  const normalizeForComparison = (text: string): string => {
    return stripQuestionPrefix(text)
      .replace(/\bq(?:uestion)?\.?\s*\d+\b/gi, ' ')
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const deduplicateQuestions = (questions: ParsedQuestion[], threshold: number): ParsedQuestion[] => {
    const tokenize = (text: string): string[] => {
      return normalizeForComparison(text)
        .split(/\s+/)
        .filter(w => w.length > 2);
    };

    const buildTermFrequency = (tokens: string[]): Map<string, number> => {
      const tf = new Map<string, number>();
      tokens.forEach(token => {
        tf.set(token, (tf.get(token) || 0) + 1);
      });
      return tf;
    };

    const cosineSimilarity = (a: Map<string, number>, b: Map<string, number>): number => {
      let dot = 0;
      let normA = 0;
      let normB = 0;

      for (const [token, countA] of a.entries()) {
        normA += countA * countA;
        const countB = b.get(token) || 0;
        dot += countA * countB;
      }

      for (const countB of b.values()) {
        normB += countB * countB;
      }

      if (normA === 0 || normB === 0) return 0;
      return dot / (Math.sqrt(normA) * Math.sqrt(normB));
    };

    // Pre-compute normalized texts and tokens
    const normalized = questions.map(q => normalizeForComparison(q.question_text));
    const termFrequencies = questions.map(q => buildTermFrequency(tokenize(q.question_text)));
    const keep: boolean[] = new Array(questions.length).fill(true);

    const completenessScore = (q: ParsedQuestion): number => {
      return [q.correct_answer, q.bloom_level, q.difficulty,
        q.choices && Object.keys(q.choices).length > 0,
        q.category, q.specialization, q.subject_code
      ].filter(Boolean).length;
    };

    for (let i = 0; i < questions.length; i++) {
      if (!keep[i]) continue;
      for (let j = i + 1; j < questions.length; j++) {
        if (!keep[j]) continue;

        // Layer 1: Exact match on normalized text
        const isExact = normalized[i] === normalized[j];
        // Layer 2: cosine similarity on normalized token frequencies
        const sim = isExact ? 1.0 : cosineSimilarity(termFrequencies[i], termFrequencies[j]);

        if (isExact || sim >= threshold) {
          // Keep the one with more complete metadata
          if (completenessScore(questions[j]) > completenessScore(questions[i])) {
            keep[i] = false;
            break;
          } else {
            keep[j] = false;
          }
        }
      }
    }

    const result = questions.filter((_, i) => keep[i]);
    console.log(`Deduplication: ${questions.length} → ${result.length} (removed ${questions.length - result.length})`);
    return result;
  };

  /** Step 1: Parse, classify, resolve metadata, then show verification */
  const analyzeAndClassify = async () => {
    if (!file) return;

    setIsProcessing(true);
    setProgress(0);
    setErrors([]);

    try {
      let rawData: any[];

      if (file.name.endsWith('.pdf')) {
        setCurrentStep('Extracting text from PDF...');
        rawData = await extractQuestionsFromPDF(file);
        setProgress(20);
      } else {
        setCurrentStep('Parsing CSV file...');
        const parseResult = await new Promise<Papa.ParseResult<any>>((resolve, reject) => {
          Papa.parse(file, { header: true, skipEmptyLines: true, complete: resolve, error: reject });
        });
        rawData = parseResult.data;
        setProgress(20);
      }

      setCurrentStep('Normalizing data...');
      const validationWarnings: string[] = [];

      const normalizedData: ParsedQuestion[] = rawData.map((row) => {
        const normalized = normalizeRow(row);
        return {
          ...normalized,
          question_text: stripQuestionPrefix(normalized.question_text || ''),
          created_by: 'teacher',
          approved: false,
          needs_review: true,
        } as ParsedQuestion;
      });

      if (normalizedData.length === 0) {
        setErrors(['No valid questions found in the file. Each row needs at least question text (5+ characters).']);
        setIsProcessing(false);
        return;
      }

      // ===== DEDUPLICATION STEP =====
      setProgress(35);
      setCurrentStep('Detecting duplicate questions...');
      const deduplicatedBeforeValidation = deduplicateQuestions(normalizedData, 0.90);
      const removedDupes = normalizedData.length - deduplicatedBeforeValidation.length;

      // ===== VALIDATION STEP (after dedup) =====
      setProgress(50);
      setCurrentStep('Validating deduplicated questions...');
      const deduplicatedData: ParsedQuestion[] = [];
      let skippedCount = 0;

      deduplicatedBeforeValidation.forEach((row, index) => {
        const rowErrors = validateNormalized(row, index);
        if (rowErrors.length > 0) {
          validationWarnings.push(...rowErrors);
          skippedCount++;
          return;
        }
        deduplicatedData.push({
          ...row,
          question_text: stripQuestionPrefix(row.question_text),
        });
      });

      if (deduplicatedData.length === 0) {
        setErrors(['No valid questions remained after deduplication and validation.']);
        setIsProcessing(false);
        return;
      }

      if (removedDupes > 0) {
        validationWarnings.push(`${removedDupes} duplicate question(s) removed based on semantic similarity (≥90% match).`);
        toast.info(`Removed ${removedDupes} duplicate questions`);
      }

      if (skippedCount > 0) {
        validationWarnings.unshift(`${skippedCount} rows skipped due to missing/invalid data. ${deduplicatedData.length} valid questions will be processed.`);
      }

      setErrors(validationWarnings);

      setProgress(65);
      setCurrentStep('Classifying questions with AI...');

      // AI classification
      try {
        const classificationInput = deduplicatedData.map(q => ({
          text: q.question_text,
          type: q.question_type,
          topic: q.topic
        }));

        const classifications = await classifyQuestions(classificationInput);
        deduplicatedData.forEach((question, index) => {
          const classification = classifications[index];
          if (classification) {
            question.bloom_level = question.bloom_level || classification.bloom_level;
            question.difficulty = question.difficulty || classification.difficulty;
            question.knowledge_dimension = question.knowledge_dimension || classification.knowledge_dimension;
            question.ai_confidence_score = classification.confidence;
            question.needs_review = classification.needs_review;
            if (classification.confidence >= 0.85) {
              question.approved = true;
              question.needs_review = false;
            }
          }
        });
        setClassificationResults(classifications);
        toast.success('AI classification completed');
      } catch (aiError) {
        console.warn('AI classification unavailable, using rule-based:', aiError);
        toast.info('Using rule-based classification (AI unavailable)');
        deduplicatedData.forEach((question) => {
          if (!question.bloom_level) question.bloom_level = classifyBloom(question.question_text);
          if (!question.knowledge_dimension) question.knowledge_dimension = detectKnowledgeDimension(question.question_text, question.question_type);
          if (!question.difficulty) question.difficulty = inferDifficulty(question.bloom_level as any, question.question_text, question.question_type);
          question.ai_confidence_score = 0.6;
          question.needs_review = true;
        });
      }

      // ===== AUTO TOPIC ASSIGNMENT =====
      setProgress(72);
      setCurrentStep('Assigning topics from Question Bank...');

      if (existingTopics.length > 0) {
        const topicTokensMap = existingTopics.map(t => ({
          topic: t,
          tokens: new Set(t.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 2)),
        }));

        deduplicatedData.forEach((q) => {
          // Skip if topic is already meaningfully assigned (not 'General' or empty)
          if (q.topic && q.topic !== 'General' && q.topic !== selectedTopic) return;

          const qTokens = q.question_text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(w => w.length > 2);
          const qSet = new Set(qTokens);

          let bestTopic = '';
          let bestScore = 0;

          for (const { topic, tokens } of topicTokensMap) {
            if (tokens.size === 0) continue;
            // Jaccard-like overlap
            let overlap = 0;
            for (const token of tokens) {
              if (qSet.has(token)) overlap++;
            }
            const score = overlap / Math.max(tokens.size, 1);
            if (score > bestScore && score >= 0.3) {
              bestScore = score;
              bestTopic = topic;
            }
          }

          if (bestTopic) {
            q.topic = bestTopic;
          }
        });
        
        const assignedCount = deduplicatedData.filter(q => q.topic !== 'General' && q.topic !== selectedTopic).length;
        if (assignedCount > 0) {
          toast.info(`Auto-assigned topics to ${assignedCount} questions from Question Bank`);
        }
      }

      setProgress(78);
      setCurrentStep('Resolving subject metadata...');

      // Resolve metadata for each question — first try the static config (legacy
      // resolver covers fuzzy keyword inference), then SNAP every value to the
      // exact strings from the academic_* tables that the Question Bank filter
      // dropdowns are built from. Without this snap, "GE / Science / 102" would
      // be saved while the filter expects e.g. "GE / Science / GE 03".
      deduplicatedData.forEach((q) => {
        const inferred = resolveSubjectMetadata({
          subject: q.subject,
          topic: q.topic,
          subject_code: q.subject_code,
          subject_description: q.subject_description,
          category: q.category,
          specialization: q.specialization,
        });
        const dbResolved = resolveFromDb({
          category: inferred.category,
          specialization: inferred.specialization,
          subject_code: inferred.subject_code,
          subject_description: inferred.subject_description,
        });
        // Prefer DB values when matched; otherwise keep best-effort inference so
        // the admin can correct it in the Verify step.
        q.category = dbResolved.matched ? dbResolved.category : (dbResolved.category || inferred.category);
        q.specialization = dbResolved.matched ? dbResolved.specialization : (dbResolved.specialization || inferred.specialization);
        q.subject_code = dbResolved.matched ? dbResolved.subject_code : '';
        q.subject_description = dbResolved.matched ? dbResolved.subject_description : (inferred.subject_description || '');
      });

      setProgress(100);
      setCurrentStep('Analysis complete');
      setVerificationData(deduplicatedData);
      setImportStep('verification');
      toast.success(`Analyzed ${deduplicatedData.length} unique questions${removedDupes > 0 ? ` (${removedDupes} duplicates removed)` : ''}. Please verify before saving.`);
    } catch (error) {
      console.error('Analysis error:', error);
      toast.error(`Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setErrors([error instanceof Error ? error.message : 'Unknown error occurred']);
    } finally {
      setIsProcessing(false);
    }
  };

  /** Step 2: After admin verifies, save to database */
  const saveVerifiedQuestions = async () => {
    // Idempotency / duplicate-submit guard
    if (importLockRef.current || hasImported || isProcessing) {
      toast.info('Import already in progress or completed.');
      return;
    }
    importLockRef.current = true;
    setIsProcessing(true);
    setProgress(0);
    setCurrentStep('Saving to database...');
    setImportStep('processing');

    try {
      const validKnowledgeDimensions = ['factual', 'conceptual', 'procedural', 'metacognitive'];
      const normalizeKD = (val: string | undefined): string => {
        const n = (val || 'conceptual').toLowerCase().trim();
        return validKnowledgeDimensions.includes(n) ? n : 'conceptual';
      };

      const normalizeDifficulty = (val: string | undefined): string => {
        const n = (val || 'average').toLowerCase().trim();
        const difficultyMap: Record<string, string> = {
          'easy': 'easy',
          'simple': 'easy',
          'basic': 'easy',
          'average': 'average',
          'medium': 'average',
          'moderate': 'average',
          'difficult': 'difficult',
          'hard': 'difficult',
          'complex': 'difficult',
          'advanced': 'difficult',
        };
        return difficultyMap[n] || 'average';
      };

      const cleanedVerificationData = verificationData.map(q => ({
        ...q,
        question_text: stripQuestionPrefix(q.question_text || ''),
      }));

      const deduplicatedForSave = deduplicateQuestions(cleanedVerificationData, 0.90);
      const saveDupesRemoved = verificationData.length - deduplicatedForSave.length;
      if (saveDupesRemoved > 0) {
        toast.info(`Removed ${saveDupesRemoved} duplicate questions before final save`);
      }

      const questionsWithDefaults = deduplicatedForSave.map(q => ({
        topic: q.topic || q.subject_description || 'General',
        question_text: stripQuestionPrefix(q.question_text || ''),
        question_type: (q.question_type as 'mcq' | 'true_false' | 'essay' | 'short_answer') || 'mcq',
        choices: q.choices || {},
        correct_answer: q.correct_answer || '',
        bloom_level: (q.bloom_level || 'understanding').toLowerCase(),
        difficulty: normalizeDifficulty(q.difficulty),
        knowledge_dimension: normalizeKD(q.knowledge_dimension),
        created_by: 'teacher' as const,
        approved: false,
        ai_confidence_score: q.ai_confidence_score || 0.5,
        needs_review: (q.needs_review !== false),
        category: q.category || '',
        specialization: q.specialization || '',
        subject_code: q.subject_code || '',
        subject_description: q.subject_description || '',
      }));

      setProgress(40);

      try {
        await buildTaxonomyMatrix(questionsWithDefaults);
      } catch (matrixError) {
        console.warn('Failed to build taxonomy matrix:', matrixError);
      }

      setProgress(60);
      await Questions.bulkInsert(questionsWithDefaults);
      setProgress(100);
      setCurrentStep('Import completed!');

      const stats: ImportStats = {
        total: deduplicatedForSave.length,
        processed: deduplicatedForSave.length,
        approved: deduplicatedForSave.filter(q => q.approved).length,
        needsReview: deduplicatedForSave.filter(q => q.needs_review).length,
        byBloom: {},
        byDifficulty: {},
        byTopic: {},
      };
      deduplicatedForSave.forEach((q) => {
        stats.byBloom[q.bloom_level!] = (stats.byBloom[q.bloom_level!] || 0) + 1;
        stats.byDifficulty[q.difficulty!] = (stats.byDifficulty[q.difficulty!] || 0) + 1;
        stats.byTopic[q.topic] = (stats.byTopic[q.topic] || 0) + 1;
      });

      setResults(stats);
      setImportStep('results');
      setHasImported(true);
      toast.success(`Successfully imported ${deduplicatedForSave.length} question${deduplicatedForSave.length === 1 ? '' : 's'} to the Question Bank!`);
      clearDraftKeys();
      // Clear file/preview/verification so the module can't be re-submitted with stale data
      setFile(null);
      setPreviewData([]);
      setVerificationData([]);
      setClassificationResults([]);
      onImportComplete();
    } catch (error) {
      console.error('Import error:', error);
      toast.error(`Import failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
      setErrors([error instanceof Error ? error.message : 'Unknown error occurred']);
      setImportStep('verification');
      // Release the lock so the user can retry after a failure
      importLockRef.current = false;
    } finally {
      setIsProcessing(false);
    }
  };

  const updateVerificationField = (index: number, field: keyof ParsedQuestion, value: string) => {
    setVerificationData(prev => {
      const updated = [...prev];
      (updated[index] as any)[field] = value;

      // When category changes, reset specialization/subject
      if (field === 'category') {
        updated[index].specialization = '';
        updated[index].subject_code = '';
        updated[index].subject_description = '';
      }
      // When specialization changes, reset subject
      if (field === 'specialization') {
        updated[index].subject_code = '';
        updated[index].subject_description = '';
      }
      // When subject_code changes, auto-fill description from the DB-driven hierarchy
      // (the same source the Question Bank filters read from), so the saved values
      // are guaranteed to match what filters can find.
      if (field === 'subject_code' && updated[index].category && updated[index].specialization) {
        const cat = hierarchy.categories.find(c => c.name === updated[index].category);
        const spec = cat
          ? hierarchy.getSpecializations(cat.id).find(s => s.name === updated[index].specialization)
          : undefined;
        const subj = spec ? hierarchy.getSubjects(spec.id).find(s => s.code === value) : undefined;
        if (subj) {
          updated[index].subject_description = subj.description;
        }
      }
      return updated;
    });
  };

  const downloadTemplate = () => {
    const template = [
      {
        Topic: 'Requirements Engineering',
        Question: 'Define what a functional requirement is in software development.',
        Type: 'mcq',
        A: 'A requirement that specifies what the system should do',
        B: 'A requirement that specifies how the system should perform',
        C: 'A requirement that specifies system constraints',
        D: 'A requirement that specifies user interface design',
        Correct: 'A',
        Bloom: 'remembering',
        Difficulty: 'easy',
        KnowledgeDimension: 'factual',
        Category: 'Major',
        Specialization: 'IT',
        SubjectCode: '101',
        SubjectDescription: 'Introduction to Computing',
      },
      {
        Topic: 'Data Modeling',
        Question: 'Explain the difference between conceptual and logical data models.',
        Type: 'essay',
        A: '',
        B: '',
        C: '',
        D: '',
        Correct: 'Conceptual models show high-level entities and relationships, while logical models include detailed attributes and constraints.',
        Bloom: 'understanding',
        Difficulty: 'average',
        KnowledgeDimension: 'conceptual',
        Category: 'Major',
        Specialization: 'IS',
        SubjectCode: '102',
        SubjectDescription: 'Systems Analysis and Design',
      },
    ];

    const csv = Papa.unparse(template);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'question_import_template.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('Template downloaded successfully!');
  };

  // DB-driven categories — same source the Question Bank filter dropdowns use.
  const categories = hierarchy.categories.map(c => c.name);

  // Count of rows whose classification did NOT resolve to a known DB row.
  // When > 0 we block the final save so admins must fix them, guaranteeing
  // every imported question is reachable by the Question Bank filters.
  const unresolvedCount = verificationData.filter(q => {
    if (!q.category || !q.specialization || !q.subject_code) return true;
    const cat = hierarchy.categories.find(c => c.name === q.category);
    if (!cat) return true;
    const spec = hierarchy.getSpecializations(cat.id).find(s => s.name === q.specialization);
    if (!spec) return true;
    return !hierarchy.getSubjects(spec.id).some(s => s.code === q.subject_code);
  }).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Bulk Import Questions</h2>
          <p className="text-muted-foreground">
            Import questions from CSV with AI-powered classification
          </p>
        </div>
        <Button variant="outline" onClick={onClose}>
          <X className="h-4 w-4 mr-2" />
          Close
        </Button>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-sm">
        {(['upload', 'preview', 'verification', 'results'] as const).map((step, i) => (
          <React.Fragment key={step}>
            {i > 0 && <span className="text-muted-foreground">→</span>}
            <Badge variant={importStep === step ? 'default' : 'outline'} className="capitalize">
              {step === 'verification' ? 'Verify & Edit' : step}
            </Badge>
          </React.Fragment>
        ))}
      </div>

      {/* Template Download */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            CSV Template
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground mb-2">
            Download our CSV template to ensure your data is formatted correctly. The template includes columns for <strong>Category</strong>, <strong>Specialization</strong>, <strong>Subject Code</strong>, and <strong>Subject Description</strong>. <strong>Topic</strong> is optional and will default to Subject Description if not provided.
          </p>
          <Button onClick={downloadTemplate} variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Download Template
          </Button>
        </CardContent>
      </Card>

      {/* File Upload */}
      {(importStep === 'upload' || importStep === 'preview') && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5" />
              Upload CSV File
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                isDragActive ? 'border-primary bg-primary/5' : 'border-muted-foreground/25 hover:border-primary/50'
              }`}
            >
              <input {...getInputProps()} />
              <FileText className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              {isDragActive ? (
                <p className="text-lg">Drop the CSV file here...</p>
              ) : (
                <div>
                  <p className="text-lg mb-2">Drag & drop a CSV or PDF file here, or click to select</p>
                  <p className="text-sm text-muted-foreground">Supports .csv and .pdf files up to 50MB</p>
                </div>
              )}
            </div>

            {file && (
              <div className="mt-4 p-4 bg-muted rounded-lg">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  <span className="font-medium">{file.name}</span>
                  <Badge variant="secondary">{(file.size / 1024).toFixed(1)} KB</Badge>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Data Preview */}
      {showPreview && previewData.length > 0 && importStep === 'preview' && (
        <Card>
          <CardHeader>
            <CardTitle>Data Preview</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    {Object.keys(previewData[0]).map((key) => (
                      <th key={key} className="text-left p-2 font-medium">{key}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewData.map((row, index) => (
                    <tr key={index} className="border-b">
                      {Object.values(row).map((value: any, cellIndex) => (
                        <td key={cellIndex} className="p-2 max-w-xs truncate">{String(value)}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Showing first 5 rows. Click "Analyze & Classify" to process all questions.
            </p>
          </CardContent>
        </Card>
      )}

      {/* Topic Selection for PDF */}
      {file && file.name.endsWith('.pdf') && importStep === 'preview' && (
        <Card>
          <CardHeader>
            <CardTitle>Topic Assignment</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <label className="text-sm font-medium">Default Topic for All Questions</label>
              <input
                type="text"
                value={selectedTopic}
                onChange={(e) => setSelectedTopic(e.target.value)}
                className="w-full px-3 py-2 border rounded-md bg-background"
                placeholder="Enter topic name"
              />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Warnings/Errors - shown as warning when import continues, destructive when blocked */}
      {errors.length > 0 && (
        <Alert variant={importStep === 'upload' ? 'destructive' : 'default'}>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <div className="space-y-1">
              <p className="font-medium">{importStep === 'upload' ? 'Import blocked:' : 'Import warnings (skipped rows):'}</p>
              <ul className="list-disc list-inside space-y-1">
                {errors.slice(0, 10).map((error, index) => (
                  <li key={index} className="text-sm">{error}</li>
                ))}
              </ul>
              {errors.length > 10 && <p className="text-sm">... and {errors.length - 10} more warnings</p>}
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Processing */}
      {isProcessing && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Brain className="h-5 w-5 animate-pulse" />
              {importStep === 'processing' ? 'Saving Questions' : 'Analyzing & Classifying'}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span>{currentStep}</span>
                <span>{progress}%</span>
              </div>
              <Progress value={progress} className="w-full" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* ===== VERIFICATION STEP ===== */}
      {importStep === 'verification' && verificationData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Eye className="h-5 w-5" />
              Verify Classification ({verificationData.length} questions)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">
              Review the auto-resolved metadata below. Click any row to edit Category, Specialization, Subject Code, or Subject Description before saving.
            </p>
            {unresolvedCount > 0 && (
              <Alert variant="destructive" className="mb-4">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  {unresolvedCount} question{unresolvedCount === 1 ? '' : 's'} could not be matched to a Category / Specialization / Subject in the Question Bank.
                  Fix them below — otherwise they will be saved with values the filters cannot find.
                </AlertDescription>
              </Alert>
            )}
            <div className="overflow-x-auto border rounded-lg">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50">
                    <th className="text-left p-2 font-medium w-8">#</th>
                    <th className="text-left p-2 font-medium min-w-[200px]">Question</th>
                    <th className="text-left p-2 font-medium">Topic</th>
                    <th className="text-left p-2 font-medium">Bloom</th>
                    <th className="text-left p-2 font-medium">Difficulty</th>
                    <th className="text-left p-2 font-medium">Category</th>
                    <th className="text-left p-2 font-medium">Specialization</th>
                    <th className="text-left p-2 font-medium">Subject Code</th>
                    <th className="text-left p-2 font-medium min-w-[180px]">Subject Description</th>
                    <th className="text-left p-2 font-medium w-10"></th>
                  </tr>
                </thead>
                <tbody>
                  {verificationData.map((q, idx) => {
                    const isEditing = editingIndex === idx;
                    // DB-driven cascading options — same source as Question Bank filters.
                    const catRow = hierarchy.categories.find(c => c.name === q.category);
                    const availableSpecs = catRow ? hierarchy.getSpecializations(catRow.id).map(s => s.name) : [];
                    const specRow = catRow
                      ? hierarchy.getSpecializations(catRow.id).find(s => s.name === q.specialization)
                      : undefined;
                    const availableSubjects = specRow
                      ? hierarchy.getSubjects(specRow.id).map(s => ({ code: s.code, description: s.description }))
                      : [];
                    const rowUnresolved =
                      !catRow ||
                      !specRow ||
                      !availableSubjects.some(s => s.code === q.subject_code);

                    return (
                      <tr key={idx} className={`border-b ${isEditing ? 'bg-primary/5' : rowUnresolved ? 'bg-destructive/5 hover:bg-destructive/10' : 'hover:bg-muted/30'}`}>
                        <td className="p-2 text-muted-foreground">
                          {idx + 1}
                          {rowUnresolved && (
                            <AlertCircle className="inline h-3.5 w-3.5 ml-1 text-destructive" />
                          )}
                        </td>
                        <td className="p-2 max-w-[250px] truncate" title={q.question_text}>{q.question_text}</td>
                        <td className="p-2">{q.topic}</td>
                        <td className="p-2 capitalize">{q.bloom_level}</td>
                        <td className="p-2 capitalize">{q.difficulty}</td>
                        <td className="p-2">
                          {isEditing ? (
                            <Select value={q.category || ''} onValueChange={(v) => updateVerificationField(idx, 'category', v)}>
                              <SelectTrigger className="h-8 w-[100px]"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Badge variant={catRow ? 'outline' : 'destructive'}>{q.category || '—'}</Badge>
                          )}
                        </td>
                        <td className="p-2">
                          {isEditing ? (
                            <Select value={q.specialization || ''} onValueChange={(v) => updateVerificationField(idx, 'specialization', v)}>
                              <SelectTrigger className="h-8 w-[100px]"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {availableSpecs.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          ) : (
                            <Badge variant={specRow ? 'outline' : 'destructive'}>{q.specialization || '—'}</Badge>
                          )}
                        </td>
                        <td className="p-2">
                          {isEditing ? (
                            <Select value={q.subject_code || ''} onValueChange={(v) => updateVerificationField(idx, 'subject_code', v)}>
                              <SelectTrigger className="h-8 w-[100px]"><SelectValue /></SelectTrigger>
                              <SelectContent>
                                {availableSubjects.map(s => <SelectItem key={s.code} value={s.code}>{s.code} - {s.description}</SelectItem>)}
                              </SelectContent>
                            </Select>
                          ) : (
                            <span className={rowUnresolved && !availableSubjects.some(s => s.code === q.subject_code) ? 'text-destructive font-medium' : ''}>
                              {q.subject_code || '—'}
                            </span>
                          )}
                        </td>
                        <td className="p-2 max-w-[180px] truncate" title={q.subject_description}>
                          {q.subject_description || '—'}
                        </td>
                        <td className="p-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => setEditingIndex(isEditing ? null : idx)}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {results && importStep === 'results' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle className="h-5 w-5 text-green-500" />
                Import Results
              </div>
              <Button onClick={() => setShowClassificationDetails(!showClassificationDetails)} variant="outline" size="sm">
                {showClassificationDetails ? 'Hide' : 'Show'} Classification Details
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">{results.total}</div>
                <div className="text-sm text-muted-foreground">Total Imported</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-green-500">{results.approved}</div>
                <div className="text-sm text-muted-foreground">Auto-Approved</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-yellow-500">{results.needsReview}</div>
                <div className="text-sm text-muted-foreground">Need Review</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-500">{Object.keys(results.byTopic).length}</div>
                <div className="text-sm text-muted-foreground">Topics</div>
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div>
                <h4 className="font-medium mb-2">By Bloom Level</h4>
                <div className="space-y-1">
                  {Object.entries(results.byBloom).map(([level, count]) => (
                    <div key={level} className="flex justify-between text-sm">
                      <span className="capitalize">{level}</span>
                      <Badge variant="secondary">{count}</Badge>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="font-medium mb-2">By Difficulty</h4>
                <div className="space-y-1">
                  {Object.entries(results.byDifficulty).map(([difficulty, count]) => (
                    <div key={difficulty} className="flex justify-between text-sm">
                      <span className="capitalize">{difficulty}</span>
                      <Badge variant="secondary">{count}</Badge>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="font-medium mb-2">By Topic</h4>
                <div className="space-y-1 max-h-32 overflow-y-auto">
                  {Object.entries(results.byTopic).map(([topic, count]) => (
                    <div key={topic} className="flex justify-between text-sm">
                      <span className="truncate">{topic}</span>
                      <Badge variant="secondary">{count}</Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>

          {showClassificationDetails && classificationResults.length > 0 && (
            <CardContent className="border-t">
              <div className="space-y-4">
                <h4 className="font-semibold">AI Classification Analysis</h4>
                <div className="text-sm space-y-2">
                  <p><strong>Average Confidence:</strong> {(classificationResults.reduce((sum, c) => sum + c.confidence, 0) / classificationResults.length * 100).toFixed(1)}%</p>
                  <p><strong>Questions Needing Review:</strong> {classificationResults.filter(c => c.needs_review).length}</p>
                </div>
              </div>
            </CardContent>
          )}
        </Card>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2">
        {importStep === 'preview' && file && !isProcessing && (
          <Button onClick={analyzeAndClassify} className="flex-1">
            <Sparkles className="h-4 w-4 mr-2" />
            Analyze & Classify
          </Button>
        )}

        {importStep === 'verification' && !isProcessing && (
          <>
            <Button variant="outline" onClick={() => { setImportStep('preview'); setVerificationData([]); }}>
              Back
            </Button>
            <Button
              onClick={saveVerifiedQuestions}
              className="flex-1"
              disabled={unresolvedCount > 0 || hasImported || isProcessing}
              title={
                hasImported
                  ? 'Questions already imported. Reset to start a new import.'
                  : unresolvedCount > 0
                    ? `Fix ${unresolvedCount} unresolved row(s) before saving`
                    : undefined
              }
            >
              <Save className="h-4 w-4 mr-2" />
              {hasImported
                ? 'Already imported'
                : unresolvedCount > 0
                  ? `Fix ${unresolvedCount} unresolved row${unresolvedCount === 1 ? '' : 's'} to save`
                  : `Save ${verificationData.length} Questions to Question Bank`}
            </Button>
          </>
        )}

        {importStep === 'results' && (
          <>
            <Button variant="outline" onClick={resetAll} className="flex-1">
              <Upload className="h-4 w-4 mr-2" />
              Import More
            </Button>
            <Button onClick={() => { resetAll(); onClose(); }} className="flex-1">
              <CheckCircle className="h-4 w-4 mr-2" />
              Go to Question Bank
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
