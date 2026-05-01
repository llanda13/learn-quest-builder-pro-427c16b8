import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface TestItem {
  id?: string | number;
  question?: string;
  question_text?: string;
  type?: string;
  question_type?: string;
  options?: string[];
  choices?: Record<string, string> | string[];
  correctAnswer?: string | number;
  correct_answer?: string | number;
  points?: number;
  difficulty?: string;
  bloom_level?: string;
  topic?: string;
  section_id?: string;
  section_label?: string;
  section_title?: string;
  question_number?: number;
}

interface ExamSection {
  id: string;
  label: string;
  title: string;
  questionType: string;
  startNumber: number;
  endNumber: number;
  pointsPerQuestion: number;
  instruction: string;
}

interface ExamPrintViewProps {
  test: {
    title?: string;
    subject?: string;
    course?: string;
    year_section?: string;
    exam_period?: string;
    school_year?: string;
    instructions?: string;
    time_limit?: number;
    items?: TestItem[];
    version_label?: string;
    format_sections?: ExamSection[];
  };
  showAnswerKey?: boolean;
}

export function ExamPrintView({ test, showAnswerKey = true }: ExamPrintViewProps) {
  const [institution, setInstitution] = useState<string>('');

  useEffect(() => {
    const fetchInstitution = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const { data } = await supabase
          .from('profiles')
          .select('college')
          .eq('id', user.id)
          .single();
        if (data?.college) {
          setInstitution(data.college);
        }
      }
    };
    fetchInstitution();
  }, []);

  const items: TestItem[] = Array.isArray(test.items) ? test.items : [];

  // Check if items have section info (multi-section format)
  const hasMultipleSections = items.some(q => q.section_id || q.section_label);

  // Group questions by section if multi-section format
  const sectionedQuestions = hasMultipleSections
    ? groupBySection(items)
    : groupByType(items);

  const getQuestionText = (item: TestItem): string => {
    return item.question_text || item.question || '';
  };

  const getCorrectAnswer = (item: TestItem): string | number | undefined => {
    return item.correct_answer ?? item.correctAnswer;
  };

  const getMCQOptions = (item: TestItem): { key: string; text: string }[] => {
    const choices = item.choices || item.options;
    if (!choices) return [];
    
    if (typeof choices === 'object' && !Array.isArray(choices)) {
      return ['A', 'B', 'C', 'D']
        .filter(key => choices[key])
        .map(key => ({ key, text: choices[key] as string }));
    }
    
    if (Array.isArray(choices)) {
      return choices.map((text, idx) => ({
        key: String.fromCharCode(65 + idx),
        text: String(text)
      }));
    }
    
    return [];
  };

  // Calculate total points
  const totalPoints = items.reduce((sum, item) => sum + (item.points || 1), 0);

  // Build answer key
  const answerKeyData = buildAnswerKey(sectionedQuestions);

  return (
    <div className="print-exam-only">
      {/* Exam Header */}
      <div className="exam-header">
        {institution && <div className="institution-name">{institution}</div>}
        <div className="exam-title">{test.title || 'Examination'}</div>
        <div className="exam-meta">
          {test.subject && <span>{test.subject}</span>}
          {test.course && <span>{test.course}</span>}
          {test.exam_period && <span>{test.exam_period}</span>}
          {test.school_year && <span>S.Y. {test.school_year}</span>}
          {test.version_label && <span>Version {test.version_label}</span>}
        </div>
      </div>

      {/* Student Info Section */}
      <div className="student-info-section">
        <div className="student-info-field">
          <span className="field-label">Name:</span>
          <span className="field-line"></span>
        </div>
        <div className="student-info-field">
          <span className="field-label">Date:</span>
          <span className="field-line"></span>
        </div>
        <div className="student-info-field">
          <span className="field-label">Section:</span>
          <span className="field-line"></span>
        </div>
        <div className="student-info-field">
          <span className="field-label">Score:</span>
          <span className="field-line"></span>
          <span style={{ marginLeft: '4pt' }}>/ {totalPoints}</span>
        </div>
      </div>

      {/* Exam Summary */}
      <div className="exam-summary">
        <span>Total Questions: {items.length}</span>
        <span>Total Points: {totalPoints}</span>
        {test.time_limit && <span>Time Limit: {test.time_limit} minutes</span>}
      </div>

      {/* General Instructions */}
      {test.instructions && (
        <div className="general-instructions">
          <h3>Instructions</h3>
          <p>{test.instructions}</p>
        </div>
      )}

      {/* Questions by Section */}
      {sectionedQuestions.map((section) => (
        <div key={section.id} className="exam-section">
          <div className="section-header">
            <h2>
              {section.label}: {section.title}
              <span className="section-points">
                ({section.questions.length} items{section.pointsPerQuestion > 1 ? `, ${section.pointsPerQuestion} pts each` : ''})
              </span>
            </h2>
            <p className="section-instruction">{section.instruction}</p>
          </div>
          
          {section.questions.map((item, qIdx) => {
            const qText = getQuestionText(item);
            const options = getMCQOptions(item);
            const questionNum = item.question_number || section.startNumber;
            const questionType = normalizeQuestionType(item.question_type || item.type || section.questionType);
            
            // For essay questions, format as range based on points
            const getEssayNumberRange = () => {
              if (questionType === 'essay' && section.questionType === 'essay') {
                const points = item.points || 1;
                if (points > 1) {
                  let rangeStart = section.startNumber;
                  for (let i = 0; i < qIdx; i++) {
                    rangeStart += (section.questions[i].points || 1);
                  }
                  const rangeEnd = rangeStart + points - 1;
                  return `${rangeStart}–${rangeEnd}`;
                }
              }
              return `${questionNum}`;
            };
            
            const displayNumber = questionType === 'essay' ? getEssayNumberRange() : `${questionNum}`;
            
            return (
              <div key={item.id} className="exam-question">
                <p>
                  <span className="question-number">{displayNumber}.</span>
                  <span className="question-text">{qText}</span>
                </p>
                
                {questionType === 'mcq' && options.length > 0 && (
                  <div className="mcq-options">
                    {options.map((opt) => (
                      <div key={opt.key} className="mcq-option">
                        <span className="option-letter">{opt.key}.</span>
                        <span className="option-text">{opt.text}</span>
                      </div>
                    ))}
                  </div>
                )}
                
                {questionType === 'true_false' && (
                  <div className="mcq-options">
                    <div className="mcq-option">
                      <span className="option-letter">___</span>
                      <span className="option-text">True / False</span>
                    </div>
                  </div>
                )}
                
                {(questionType === 'fill_blank' || questionType === 'short_answer') && (
                  <div style={{ marginLeft: '20pt', marginTop: '4pt' }}>
                    <span>Answer: </span>
                    <span className="short-answer-line"></span>
                  </div>
                )}
                
                {questionType === 'essay' && (
                  <div className="essay-answer-space">
                    {[...Array(8)].map((_, i) => (
                      <div key={i} className="essay-lines"></div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {/* Answer Key */}
      {showAnswerKey && (
        <div className="answer-key-section">
          <h2>Answer Key</h2>
          <p style={{ textAlign: 'center', marginBottom: '12pt', fontSize: '10pt' }}>
            {test.title} {test.version_label && `- Version ${test.version_label}`}
          </p>
          
          {sectionedQuestions.map((section) => (
            <div key={section.id} className="answer-key-subsection">
              <h4 style={{ fontSize: '10pt', marginBottom: '6pt', fontWeight: 'bold' }}>
                {section.label}: {section.title}
              </h4>
              <div className="answer-key-grid">
                {answerKeyData
                  .filter(item => item.section === section.id)
                  .map((item, idx) => (
                    <div key={`${section.id}-${idx}`} className="answer-key-item">
                      <span className="key-number">{item.displayNum}.</span>
                      <span className="key-answer">{item.answer}</span>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Group items that have section_id/section_label (format-aware generation)
function groupBySection(items: TestItem[]): SectionGroup[] {
  const sectionMap = new Map<string, SectionGroup>();
  
  let questionNum = 1;
  items.forEach(item => {
    const sectionId = item.section_id || 'A';
    const sectionLabel = item.section_label || 'Section A';
    const sectionTitle = item.section_title || 'Questions';
    
    if (!sectionMap.has(sectionId)) {
      sectionMap.set(sectionId, {
        id: sectionId,
        label: sectionLabel,
        title: sectionTitle,
        questionType: item.question_type || item.type || 'mcq',
        startNumber: questionNum,
        endNumber: questionNum,
        pointsPerQuestion: item.points || 1,
        instruction: getSectionInstruction(item.question_type || item.type || 'mcq'),
        questions: []
      });
    }
    
    const section = sectionMap.get(sectionId)!;
    section.questions.push({ ...item, question_number: questionNum });
    section.endNumber = questionNum;
    questionNum++;
  });
  
  return Array.from(sectionMap.values());
}

// Group items by question type (legacy format)
function groupByType(items: TestItem[]): SectionGroup[] {
  const grouped = {
    mcq: [] as TestItem[],
    true_false: [] as TestItem[],
    short_answer: [] as TestItem[],
    essay: [] as TestItem[],
    other: [] as TestItem[]
  };

  items.forEach(q => {
    const type = normalizeQuestionType(q.question_type || q.type || '');
    if (type === 'mcq') grouped.mcq.push(q);
    else if (type === 'true_false') grouped.true_false.push(q);
    else if (type === 'fill_blank' || type === 'short_answer') grouped.short_answer.push(q);
    else if (type === 'essay') grouped.essay.push(q);
    else grouped.other.push(q);
  });

  const sections: SectionGroup[] = [];
  let questionNum = 1;
  const sectionLabels = ['A', 'B', 'C', 'D', 'E'];
  let sectionIdx = 0;

  const addSection = (
    questions: TestItem[], 
    title: string, 
    type: string, 
    instruction: string,
    points: number = 1
  ) => {
    if (questions.length === 0) return;
    
    const numberedQuestions = questions.map((q, idx) => ({
      ...q,
      question_number: questionNum + idx
    }));
    
    sections.push({
      id: sectionLabels[sectionIdx],
      label: `Section ${sectionLabels[sectionIdx]}`,
      title,
      questionType: type,
      startNumber: questionNum,
      endNumber: questionNum + questions.length - 1,
      pointsPerQuestion: points,
      instruction,
      questions: numberedQuestions
    });
    
    questionNum += questions.length;
    sectionIdx++;
  };

  addSection(grouped.mcq, 'Multiple Choice', 'mcq', 'Choose the letter of the best answer.');
  addSection(grouped.true_false, 'True or False', 'true_false', 'Write TRUE if the statement is correct, FALSE if incorrect.');
  addSection(grouped.short_answer, 'Identification / Fill in the Blank', 'short_answer', 'Write the correct answer on the blank provided.');
  addSection(grouped.essay, 'Essay', 'essay', 'Answer the following questions in complete sentences.', 5);
  addSection(grouped.other, 'Other', 'other', 'Answer the following questions.');

  return sections;
}

function normalizeQuestionType(type: string): string {
  const t = (type || '').toLowerCase().replace(/-/g, '_');
  if (t === 'multiple_choice' || t === 'mcq') return 'mcq';
  if (t === 'true_false' || t === 'truefalse') return 'true_false';
  if (t === 'fill_blank' || t === 'fill_in_blank' || t === 'identification') return 'fill_blank';
  if (t === 'short_answer') return 'short_answer';
  if (t === 'essay') return 'essay';
  return t || 'mcq';
}

function getSectionInstruction(type: string): string {
  const normalized = normalizeQuestionType(type);
  const instructions: Record<string, string> = {
    mcq: 'Choose the letter of the best answer.',
    true_false: 'Write TRUE if the statement is correct, FALSE if incorrect.',
    fill_blank: 'Write the correct answer on the blank provided.',
    short_answer: 'Write the correct answer on the blank provided.',
    essay: 'Answer the following questions in complete sentences.'
  };
  return instructions[normalized] || 'Answer the following questions.';
}

interface SectionGroup {
  id: string;
  label: string;
  title: string;
  questionType: string;
  startNumber: number;
  endNumber: number;
  pointsPerQuestion: number;
  instruction: string;
  questions: TestItem[];
}

function buildAnswerKey(sections: SectionGroup[]): { num: number; displayNum: string; answer: string; section: string; type: string }[] {
  const answerKey: { num: number; displayNum: string; answer: string; section: string; type: string }[] = [];
  
  sections.forEach(section => {
    const questionType = normalizeQuestionType(section.questionType);
    
    section.questions.forEach((question, qIdx) => {
      const correctAnswer = question.correct_answer ?? question.correctAnswer;
      const qType = normalizeQuestionType(question.question_type || question.type || section.questionType);
      
      let answer = '';
      if (qType === 'mcq') {
        if (typeof correctAnswer === 'number') {
          answer = String.fromCharCode(65 + correctAnswer);
        } else if (typeof correctAnswer === 'string' && /^[A-Da-d]$/.test(correctAnswer)) {
          answer = correctAnswer.toUpperCase();
        } else {
          answer = String(correctAnswer || '').substring(0, 20);
        }
      } else if (qType === 'true_false') {
        answer = String(correctAnswer || '').toLowerCase() === 'true' ? 'True' : 'False';
      } else if (correctAnswer) {
        answer = String(correctAnswer).substring(0, 30) + (String(correctAnswer).length > 30 ? '...' : '');
      } else {
        answer = 'See rubric';
      }
      
      // Calculate display number - use range for essays based on points
      let displayNum = String(question.question_number || 0);
      if (qType === 'essay' && section.questionType === 'essay') {
        const points = question.points || 1;
        if (points > 1) {
          let rangeStart = section.startNumber;
          for (let i = 0; i < qIdx; i++) {
            rangeStart += (section.questions[i].points || 1);
          }
          const rangeEnd = rangeStart + points - 1;
          displayNum = `${rangeStart}–${rangeEnd}`;
        }
      }
      
      answerKey.push({
        num: question.question_number || 0,
        displayNum,
        answer,
        section: section.id,
        type: qType
      });
    });
  });
  
  return answerKey;
}
