import fs from 'fs/promises';

// Simple sample end-to-end generator that enforces the Generation Plan (TOS)
// This runs locally without Supabase and demonstrates the exact TOS->Plan->TQ flow.

function normalizeQuestionType(type) {
  if (!type) return 'mcq';
  const t = String(type).toLowerCase().replace(/[^a-z0-9]+/g, '_');
  if (['mcq', 'multiple_choice', 'multiple-choice', 'multiple choice'].includes(t)) return 'mcq';
  if (['true_false', 'true-false', 'true false', 'truefalse', 'true/false'].includes(t)) return 'true_false';
  if (['fill_blank', 'fill-in-the-blank', 'fill blank', 'fill_in_blank'].includes(t)) return 'fill_blank';
  if (['essay', 'long_answer', 'constructed_response'].includes(t)) return 'essay';
  return t;
}

function buildGenerationPlanFromTOSCriteria(tosCriteria) {
  const slots = [];
  const seen = new Set();
  for (const c of tosCriteria) {
    if (!Array.isArray(c.item_numbers) || c.item_numbers.length === 0) {
      throw new Error('TOS must provide explicit item_numbers in this demo');
    }
    const sorted = [...c.item_numbers].sort((a,b)=>a-b);
    for (const n of sorted) {
      if (n < 1) throw new Error('Item numbers must start at 1');
      if (seen.has(n)) throw new Error('Duplicate item number: '+n);
      seen.add(n);
      slots.push({
        item_number: n,
        topic: c.topic,
        bloom_level: c.bloom_level,
        difficulty: c.difficulty,
        knowledge_dimension: c.knowledge_dimension,
        question_type: normalizeQuestionType(c.question_type)
      });
    }
  }
  slots.sort((a,b)=>a.item_number-b.item_number);
  // ensure contiguous
  if (slots.length>0) {
    const max = slots[slots.length-1].item_number;
    const missing = [];
    for (let i=1;i<=max;i++) if (!seen.has(i)) missing.push(i);
    if (missing.length) throw new Error('Missing items: '+missing.join(','));
  }
  return slots;
}

function generateFallbackForSlot(slot) {
  const id = `ai-${slot.item_number}-${Date.now()}`;
  const text = `(${slot.topic}) [${slot.bloom_level} - ${slot.difficulty}] Generate content for item ${slot.item_number}.`;
  const choices = { A: 'Option A', B: 'Option B', C: 'Option C', D: 'Option D' };
  return {
    id,
    question_text: text,
    question_type: slot.question_type || 'mcq',
    choices,
    correct_answer: 'A',
    created_by: 'ai'
  };
}

function validatePlan(plan, questions) {
  const errors = [];
  if (questions.length !== plan.length) errors.push(`Expected ${plan.length} questions, got ${questions.length}`);
  const planTopicCounts = new Map();
  const planBloomCounts = new Map();
  for (const s of plan) {
    planTopicCounts.set(s.topic, (planTopicCounts.get(s.topic)||0)+1);
    planBloomCounts.set(s.bloom_level, (planBloomCounts.get(s.bloom_level)||0)+1);
  }
  const actualTopicCounts = new Map();
  const actualBloomCounts = new Map();
  for (const s of plan) {
    const q = questions[s.item_number-1];
    if (!q) { errors.push(`Missing question for slot ${s.item_number}`); continue; }
    if (q.question_number !== s.item_number) errors.push(`question_number mismatch for slot ${s.item_number}`);
    if (q.topic !== s.topic) errors.push(`topic mismatch for slot ${s.item_number}`);
    if (q.bloom_level !== s.bloom_level) errors.push(`bloom_level mismatch for slot ${s.item_number}`);
    if (q.difficulty !== s.difficulty) errors.push(`difficulty mismatch for slot ${s.item_number}`);
    actualTopicCounts.set(q.topic, (actualTopicCounts.get(q.topic)||0)+1);
    actualBloomCounts.set(q.bloom_level, (actualBloomCounts.get(q.bloom_level)||0)+1);
  }
  for (const [t,c] of planTopicCounts) if (actualTopicCounts.get(t)!==c) errors.push(`Topic distribution mismatch ${t}: expected ${c}, got ${actualTopicCounts.get(t)||0}`);
  for (const [b,c] of planBloomCounts) if (actualBloomCounts.get(b)!==c) errors.push(`Bloom distribution mismatch ${b}: expected ${c}, got ${actualBloomCounts.get(b)||0}`);
  return errors;
}

(async function main(){
  try {
    // Sample TOS criteria with explicit item_numbers
    const tos = [
      { topic: 'RA 1425 Rizal Law', bloom_level: 'Applying', difficulty: 'average', count: 2, item_numbers: [3,4], question_type: 'mcq' },
      { topic: 'Philippine Literature', bloom_level: 'Remembering', difficulty: 'easy', count: 2, item_numbers: [1,2], question_type: 'mcq' },
      { topic: 'Constitution', bloom_level: 'Analyzing', difficulty: 'difficult', count: 2, item_numbers: [5,6], question_type: 'essay' }
    ];

    console.log('Building generation plan from TOS...');
    const plan = buildGenerationPlanFromTOSCriteria(tos);
    console.log('Plan slots:', plan.map(s=>`${s.item_number}:${s.topic}:${s.bloom_level}:${s.difficulty}:${s.question_type}`).join(' | '));

    const requiredTotal = plan.length;
    const selectedQuestions = new Array(requiredTotal);
    const answerKey = new Array(requiredTotal);

    for (const slot of plan) {
      // Try DB (none) -> fallback (we generate fallback)
      const chosen = generateFallbackForSlot(slot);
      const idx = slot.item_number - 1;
      selectedQuestions[idx] = {
        ...chosen,
        topic: slot.topic,
        bloom_level: slot.bloom_level,
        difficulty: slot.difficulty,
        question_type: slot.question_type,
        question_number: slot.item_number
      };
      answerKey[idx] = {
        question_number: slot.item_number,
        question_id: chosen.id,
        correct_answer: chosen.correct_answer,
        points: slot.question_type === 'essay' ? 5 : 1
      };
    }

    // Validate
    const errors = validatePlan(plan, selectedQuestions);
    if (errors.length > 0) {
      console.error('Validation failed:', errors);
      process.exit(2);
    }

    const saved = {
      id: `local-sample-${Date.now()}`,
      title: 'Sample Generated Test (Demo)',
      items: selectedQuestions,
      answer_key: answerKey,
      generated_at: new Date().toISOString()
    };

    const outPath = './tmp/generated_test_sample.json';
    await fs.mkdir('./tmp', { recursive: true });
    await fs.writeFile(outPath, JSON.stringify(saved, null, 2), 'utf8');

    console.log(`Success: generated test saved to ${outPath}`);
    console.log('Sample persisted test id:', saved.id);
    console.log('Sanity check - first item:', saved.items[0]);
  } catch (err) {
    console.error('E2E demo failed:', err);
    process.exit(1);
  }
})();
