import { useMemo } from "react";
import { ISODocumentHeader } from "@/components/print/ISODocumentHeader";

interface TestItem {
  question_text?: string;
  question?: string;
  question_type?: string;
  type?: string;
  choices?: Record<string, string> | string[];
  options?: string[];
  correct_answer?: string | number;
  correctAnswer?: string | number;
  points?: number;
  difficulty?: string;
  bloom_level?: string;
  topic?: string;
}

interface ExamPrintTemplateProps {
  test: {
    title?: string;
    subject?: string;
    course?: string;
    year_section?: string;
    exam_period?: string;
    school_year?: string;
    semester?: string;
    time_limit?: number;
    instructions?: string;
    items?: TestItem[];
    prepared_by?: string;
  };
  showAnswerKey?: boolean;
}

interface GroupedQuestions {
  mcq: TestItem[];
  trueFalse: TestItem[];
  fillBlank: TestItem[];
  essay: TestItem[];
}

function groupAllQuestionTypes(items: TestItem[]): GroupedQuestions {
  const mcq: TestItem[] = [];
  const trueFalse: TestItem[] = [];
  const fillBlank: TestItem[] = [];
  const essay: TestItem[] = [];

  for (const item of items) {
    const type = (item.question_type || item.type || '').toLowerCase();
    if (type === 'mcq' || type === 'multiple-choice' || type === 'multiple_choice') {
      mcq.push(item);
    } else if (type === 'true_false' || type === 'true-false' || type === 'truefalse') {
      trueFalse.push(item);
    } else if (type === 'short_answer' || type === 'fill-blank' || type === 'fill_blank' || type === 'identification') {
      fillBlank.push(item);
    } else if (type === 'essay') {
      essay.push(item);
    }
  }

  return { mcq, trueFalse, fillBlank, essay };
}

export function ExamPrintTemplate({ test, showAnswerKey = false }: ExamPrintTemplateProps) {
  const items: TestItem[] = useMemo(() => Array.isArray(test.items) ? test.items : [], [test.items]);
  const groupedQuestions = useMemo(() => groupAllQuestionTypes(items), [items]);

  const totalPoints = items.reduce((sum, item) => sum + (item.points || 1), 0);

  // Calculate section numbering
  let testNumber = 1;
  const sections: { label: string; title: string; instruction: string; items: TestItem[]; type: string }[] = [];

  if (groupedQuestions.mcq.length > 0) {
    sections.push({
      label: `TEST ${toRoman(testNumber)}. MULTIPLE CHOICE`,
      title: 'MULTIPLE CHOICE',
      instruction: 'Direction: Read and understand each statement and select the best letter to the correct number',
      items: groupedQuestions.mcq,
      type: 'mcq',
    });
    testNumber++;
  }

  if (groupedQuestions.trueFalse.length > 0) {
    sections.push({
      label: `TEST ${toRoman(testNumber)}. TRUE OR FALSE`,
      title: 'TRUE OR FALSE',
      instruction: 'Direction: Read and understand each statement and write TRUE if the statement is correct, and write FALSE if the statement is wrong.',
      items: groupedQuestions.trueFalse,
      type: 'true_false',
    });
    testNumber++;
  }

  if (groupedQuestions.fillBlank.length > 0) {
    sections.push({
      label: `TEST ${toRoman(testNumber)}. FILL IN THE BLANK`,
      title: 'FILL IN THE BLANK',
      instruction: 'Direction: Read and understand each statement and provide the correct word/s in the blank space in every statement.',
      items: groupedQuestions.fillBlank,
      type: 'fill_blank',
    });
    testNumber++;
  }

  if (groupedQuestions.essay.length > 0) {
    sections.push({
      label: `TEST ${toRoman(testNumber)}. ESSAY`,
      title: 'ESSAY',
      instruction: 'Direction: Answer the following questions in complete sentences. Provide clear and concise explanations.',
      items: groupedQuestions.essay,
      type: 'essay',
    });
    testNumber++;
  }

  // Calculate total pages (estimate)
  const totalPages = Math.max(1, Math.ceil(items.length / 15));

  return (
    <div className="print-exam-only" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
      <section className="questionnaire-section" data-pdf-section="questions">
        {/* HEADER BLOCK — kept atomic for stable pagination */}
        <div data-pdf-block="header" style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
        <ISODocumentHeader
          docNo="F-DOI-018"
          effectiveDate="08/25/2017"
          revNo="0"
          pageInfo={`1 of ${totalPages}`}
        />

      {/* Title in bordered box */}
      <div style={{
        textAlign: 'center',
        fontWeight: 'bold',
        fontSize: '16pt',
        border: '2px solid #000',
        padding: '6px 0',
        margin: '8pt 0 10pt 0',
        letterSpacing: '1px',
      }}>
        TEST QUESTIONNAIRE
      </div>

      {/* Exam Period */}
      <div style={{ textAlign: 'center', fontSize: '12pt', marginBottom: '4pt' }}>
        {test.exam_period || 'Midterm'} Examination
      </div>

      {/* Academic Year */}
      <div style={{ textAlign: 'center', fontSize: '11pt', marginBottom: '4pt' }}>
        Academic Year: {test.school_year || '____ – ____'}{test.semester ? `: ${test.semester}` : ''}
      </div>

      {/* Subject */}
      <div style={{ textAlign: 'center', fontSize: '12pt', fontWeight: 'bold', fontStyle: 'italic', marginBottom: '10pt' }}>
        {test.subject || test.title || ''}
      </div>

      {/* Student Info Fields - matching reference exactly */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '4pt 24pt', marginBottom: '6pt', fontSize: '11pt' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4pt' }}>
          <span>Name:</span>
          <span style={{ flex: 1, borderBottom: '1px solid #000' }}>&nbsp;</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4pt' }}>
          <span>Score:</span>
          <span style={{ flex: 1, borderBottom: '1px solid #000' }}>&nbsp;</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4pt' }}>
          <span>Course/Year/Sec.:</span>
          <span style={{ flex: 1, borderBottom: '1px solid #000' }}>&nbsp;</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '4pt' }}>
          <span>Instructor:</span>
          <span style={{ flex: 1, borderBottom: '1px solid #000' }}>&nbsp;</span>
        </div>
      </div>

      {/* Horizontal rule */}
      <hr style={{ border: 'none', borderTop: '2px solid #000', margin: '10pt 0' }} />

      {/* General Instructions */}
      <div style={{ marginBottom: '10pt' }}>
        <h3 style={{ fontSize: '12pt', fontWeight: 'bold', marginBottom: '4pt' }}>General Instructions:</h3>
        <p style={{ fontSize: '10pt', textAlign: 'justify', fontStyle: 'italic', lineHeight: '1.5' }}>
          {test.instructions || "Make sure your mobile phone is switched off and place it at the front together with any bags, books, and etc. If you have a question or need more papers, raise your hand and ask the proctor. Keep your eyes on your own paper. Remember, copying is cheating! Stop writing immediately when the proctor says it is the end of the exam. You must remain silent until after you have exited the room."}
        </p>
      </div>

      {/* Additional instruction */}
      <p style={{ fontSize: '10pt', textAlign: 'justify', marginBottom: '12pt' }}>
        Read and analyze each of the following questions carefully. Write the <strong>CAPITAL LETTER</strong> of your choice on the space provided. <u>NOTE</u>: Do not use sticky tape or any kind of eraser fluid to change your answers. <em>MODIFIED/ERASURES IN ANSWERS ARE CONSIDERED WRONG.</em>
      </p>
      </div>
      {/* /HEADER BLOCK */}

      {/* Question Sections */}
      {sections.map((section, sIdx) => {
        const startNum = sections.slice(0, sIdx).reduce((sum, s) => sum + s.items.length, 0) + 1;
        return (
          <div key={sIdx} className="exam-section" style={{ marginTop: sIdx > 0 ? '14pt' : '0' }}>
            {/* Section Header — atomic block */}
            <div data-pdf-block={`section-header-${sIdx}`} style={{ marginBottom: '6pt', breakInside: 'avoid', pageBreakInside: 'avoid' }}>
              <p style={{ fontSize: '11pt', fontWeight: 'bold', textDecoration: 'underline', marginBottom: '2pt' }}>
                {section.label}:
              </p>
              <p style={{ fontSize: '10pt', fontStyle: 'italic', marginBottom: '6pt' }}>
                {section.instruction}
              </p>
            </div>

            {/* Questions — each one is its own atomic block */}
            {section.items.map((item, qIdx) => {
              const num = startNum + qIdx;
              return (
                <div key={qIdx} data-pdf-block={`q-${sIdx}-${qIdx}`} style={{ breakInside: 'avoid', pageBreakInside: 'avoid' }}>
                  <ISOQuestion
                    item={item}
                    number={num}
                    type={section.type}
                    showAnswer={showAnswerKey}
                  />
                </div>
              );
            })}
          </div>
        );
      })}

        {/* Prepared by */}
        <div data-pdf-block="prepared-by" style={{ marginTop: '30pt', fontSize: '11pt', breakInside: 'avoid', pageBreakInside: 'avoid' }}>
          <div>Prepared by:</div>
          <div style={{ marginTop: '20pt', fontWeight: 'bold', textTransform: 'uppercase' }}>
            {test.prepared_by || '________________________'}
          </div>
          <div style={{ fontSize: '10pt', fontStyle: 'italic' }}>Subject Instructor</div>
        </div>
      </section>

      {/* Answer Key (on new page) */}
      {showAnswerKey && (
        <section className="answer-key-section" data-pdf-section="answer-key" style={{ pageBreakBefore: 'always', breakBefore: 'page', minHeight: '235mm', maxHeight: '235mm', overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <h2 style={{ fontSize: '14pt', fontWeight: 'bold', textAlign: 'center', marginBottom: '18pt', borderBottom: '2pt solid #000', paddingBottom: '12pt' }}>
            ANSWER KEY
          </h2>
          <div style={{ marginTop: '20pt', display: 'flex', justifyContent: 'center' }}>
            <ol style={{ fontSize: '10.5pt', listStyleType: 'decimal', listStylePosition: 'inside', columnCount: items.length > 40 ? 3 : 2, columnGap: '32pt', minWidth: '60%', maxHeight: '190mm', overflow: 'hidden' }}>
              {sections.flatMap((section) => section.items).map((item, idx) => {
                const answer = item.correct_answer ?? item.correctAnswer ?? '—';
                return (
                  <li key={idx} style={{ padding: '2pt 0', breakInside: 'avoid' }}>
                    <span style={{ fontWeight: 'bold' }}>{String(answer)}</span>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>
      )}
    </div>
  );
}

function ISOQuestion({ item, number, type, showAnswer }: { item: TestItem; number: number; type: string; showAnswer: boolean }) {
  const questionText = item.question_text || item.question || '';
  const correctAnswer = item.correct_answer ?? item.correctAnswer;

  const getMCQOptions = (): { key: string; text: string }[] => {
    const choices = item.choices || item.options;
    if (!choices) return [];
    if (typeof choices === 'object' && !Array.isArray(choices)) {
      return ['A', 'B', 'C', 'D'].filter(key => (choices as Record<string, string>)[key]).map(key => ({ key, text: (choices as Record<string, string>)[key] }));
    }
    if (Array.isArray(choices)) {
      return choices.map((text, idx) => ({ key: String.fromCharCode(65 + idx), text: String(text) }));
    }
    return [];
  };

  if (type === 'mcq') {
    const options = getMCQOptions();
    return (
      <div className="exam-question" style={{ marginBottom: '8pt', pageBreakInside: 'avoid' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '2pt' }}>
          <span style={{ fontWeight: 'bold', minWidth: '20pt' }}>{number}.</span>
          <span style={{ textAlign: 'justify', flex: 1 }}>{questionText}</span>
        </div>
        {options.length > 0 && (
          <div style={{ marginLeft: '28pt', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 16pt' }}>
            {options.map((opt) => (
              <div key={opt.key} style={{ display: 'flex', gap: '4pt', fontSize: '10pt' }}>
                <span>{opt.key.toLowerCase()}.</span>
                <span>{opt.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  if (type === 'true_false') {
    return (
      <div className="exam-question" style={{ marginBottom: '4pt', display: 'flex', alignItems: 'flex-start', gap: '4pt' }}>
        <span style={{ fontWeight: 'bold', minWidth: '20pt' }}>{number}.</span>
        <span style={{ display: 'inline-block', width: '60pt', borderBottom: '1px solid #000', marginRight: '6pt' }}>
          &nbsp;
        </span>
        <span style={{ textAlign: 'justify', flex: 1 }}>{questionText}</span>
      </div>
    );
  }

  if (type === 'fill_blank') {
    return (
      <div className="exam-question" style={{ marginBottom: '4pt', display: 'flex', alignItems: 'flex-start', gap: '4pt' }}>
        <span style={{ fontWeight: 'bold', minWidth: '20pt' }}>{number}.</span>
        <span style={{ textAlign: 'justify', flex: 1 }}>{questionText}</span>
      </div>
    );
  }

  // Essay
  return (
    <div className="exam-question" style={{ marginBottom: '12pt', pageBreakInside: 'avoid' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '4pt', marginBottom: '6pt' }}>
        <span style={{ fontWeight: 'bold', minWidth: '20pt' }}>{number}.</span>
        <span style={{ textAlign: 'justify', flex: 1 }}>{questionText}</span>
        <span style={{ fontSize: '9pt', whiteSpace: 'nowrap' }}>({item.points || 1} {(item.points || 1) === 1 ? 'point' : 'points'})</span>
      </div>
      {(
        <div style={{ marginLeft: '20pt' }}>
          {Array.from({ length: Math.max(5, (item.points || 1) * 2) }).map((_, i) => (
            <div key={i} style={{ borderBottom: '1pt solid #999', height: '20pt' }}></div>
          ))}
        </div>
      )}
    </div>
  );
}

function toRoman(num: number): string {
  const map: [number, string][] = [[10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
  let result = '';
  for (const [value, symbol] of map) {
    while (num >= value) {
      result += symbol;
      num -= value;
    }
  }
  return result;
}
