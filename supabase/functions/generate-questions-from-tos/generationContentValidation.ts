const TOPIC_ALIASES: Record<string, string[]> = {
  'input devices': [
    'input device',
    'keyboard',
    'mouse',
    'mice',
    'scanner',
    'microphone',
    'webcam',
    'touchpad',
    'touchscreen',
    'joystick',
    'barcode reader',
    'trackball',
    'stylus',
  ],
  'photosynthesis': [
    'photosynthesis',
    'chloroplast',
    'chlorophyll',
    'stomata',
    'carbon dioxide',
    'glucose',
  ],
  'database normalization': [
    'normalization',
    'functional dependency',
    'primary key',
    'relational schema',
    'data redundancy',
    'normal form',
  ],
  'network security': [
    'network security',
    'firewall',
    'encryption',
    'authentication',
    'access control',
    'intrusion',
    'malware',
  ],
};

const SCENARIO_CONTEXT =
  /\b(given|suppose|consider|during|when|after|before|while|based on|following|in a|in an|a|an|the)\b/i;
const SCENARIO_ENTITY =
  /\b(?:a|an|the|this|these|following)\s+(?:[a-z0-9'-]+\s+){0,2}(?:technician|student|user|patient|teacher|plant|company|network|database|workstation|device|machine|server|report|experiment|case|scenario|situation|task|project|assignment|worksheet|dataset|data|classroom|lab|table|record|trial|incident|request|row|firewall|keyboard|mouse|scanner|website|application|app|software|hardware|program|code|document|email|printer|router|cable|memory|disk|drive|battery|screen|file|folder|password|login|account|browser|window|menu|button|form|survey|checklist|budget|invoice|order|inventory|product|store|shop|office|factory|hospital|clinic|school|library|sensor|specimen|sample|organism|crop|seed|soil|leaf|cell|enzyme|transaction|customer|client|system|computer|laptop|monitor|hub|port|measurement|log|event|result|output|message|response|grade|score|chart|graph|diagram)\b/i;
const SITUATION_DETAIL =
  /\b(?:fails?|failed|stops?|stopped|reports?|records?|shows?|contains?|produces?|responds?|cannot|unable|not detected|not responding|remains?|overheats?|measur\w*|observes?|does not|doesn't|no\s+\w+|increases?|decreases?|rises?|drops?|falls?|repeats?|repeated|duplicates?|conflicts?|changes?)\b|\b\d+(?:\.\d+)?\s*(?:%|percent|rows?|records?|degrees?|seconds?|minutes?|volts?|watts?|bytes?|packets?|items?)\b/i;

const BLOOM_ACTIONS: Record<string, RegExp> = {
  remembering: /\b(define|list|name|identify|state|recall|recognize|label)\b/i,
  understanding: /\b(explain|describe|summarize|interpret|classify|paraphrase)\b/i,
  applying: /\b(apply|use|solve|demonstrate|implement|execute|calculate|compute|carry\s+out)\b/i,
  analyzing: /\b(differentiate|distinguish|compare|contrast|examine|analy[sz]e|deconstruct|attribute|organize|break\s+down)\b/i,
  evaluating: /\b(evaluate|justify|critique|assess|judge|defend|recommend|prioritize)\b/i,
  creating: /\b(create|design|develop|construct|propose|formulate|devise|plan|compose|generate|produce)\b/i,
};

const HIGHER_ORDER_LEVELS = new Set([
  'applying',
  'analyzing',
  'evaluating',
  'creating',
]);

function normalizeText(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function topicAliasMatches(topic: string, text: string): boolean {
  const aliases = TOPIC_ALIASES[topic];
  if (!aliases) return false;
  return aliases.some((alias) =>
    new RegExp(`\\b${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}s?\\b`, 'i').test(text)
  );
}

export function hasMeaningfulScenarioCue(text: string): boolean {
  return SCENARIO_CONTEXT.test(text) &&
    SCENARIO_ENTITY.test(text) &&
    SITUATION_DETAIL.test(text);
}

export function validateTopicRelevance(
  topic: string,
  questionText: string,
): { valid: boolean; reason?: string } {
  const normalizedTopic = normalizeText(topic);
  const normalizedText = normalizeText(questionText);
  if (!normalizedTopic) return { valid: true };

  if (topicAliasMatches(normalizedTopic, normalizedText)) return { valid: true };

  const stopWords = new Set([
    'the', 'and', 'for', 'with', 'from', 'into', 'that', 'this', 'course',
    'subject', 'general', 'about', 'using', 'introduction', 'fundamentals',
    'principles',
  ]);
  const keywords = normalizedTopic
    .split(/\s+/)
    .filter((word) => word.length >= 4 && !stopWords.has(word));
  const missing = keywords.filter((keyword) =>
    !new RegExp(`\\b${keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(normalizedText)
  );
  return missing.length === 0
    ? { valid: true }
    : { valid: false, reason: `Missing topic-specific terminology for "${topic}"` };
}

export function validateApplyingQuestion(text: string): { valid: boolean; reason?: string } {
  if (!hasMeaningfulScenarioCue(text)) {
    return {
      valid: false,
      reason: 'Applying items require a concrete practical situation or problem with contextual details',
    };
  }

  const applyingSignals =
    /\b(apply|use|solve|demonstrate|implement|execute|calculate|compute|carry\s+out|configure|select|adjust|troubleshoot|install|run|test|check|replace|restore|enable|choose|which\s+(?:step|action|command|method|setting|procedure|tool|formula|algorithm|connection|condition)\s+(?:should|would|must)|how\s+(?:would|should|can)\s+you\s+(?:use|apply|solve|implement|configure|select|adjust|troubleshoot))\b/i;
  const forbiddenStart =
    /^\s*(define|list|name|state|recall|recognize|identify|label|explain|describe|summarize|interpret|classify|paraphrase|compare|contrast|differentiate|distinguish|analy[sz]e|examine|deconstruct|evaluate|justify|critique|assess|judge|defend|prioritize|recommend|design|develop|construct|propose|create|formulate|devise|plan|compose)\b/i;
  if (forbiddenStart.test(text)) {
    return {
      valid: false,
      reason: 'Applying items must ask learners to use knowledge in the situation, not define or recall it',
    };
  }
  return applyingSignals.test(text)
    ? { valid: true }
    : { valid: false, reason: 'Applying items must require learners to use, solve, calculate, or implement in the situation' };
}

export function validateAnalyzingQuestion(text: string): { valid: boolean; reason?: string } {
  if (!hasMeaningfulScenarioCue(text)) {
    return {
      valid: false,
      reason: 'Analyzing items require a concrete case, dataset, or problem situation with relevant details',
    };
  }

  const analyzingSignals =
    /\b(differentiate|distinguish|compare|contrast|examine|analy[sz]e|deconstruct|attribute|organize|break\s+down|investigate|which\s+(?:finding|evidence|factor|component)\s+(?:best\s+)?(?:indicates|explains|contributes|accounts)|what\s+is\s+the\s+relationship|how\s+does\s+.+\s+differ|which\s+(?:part|component|factor)\s+contributes)\b/i;
  const forbiddenStart =
    /^\s*(define|list|name|state|recall|recognize|identify|label|explain|describe|summarize|interpret|classify|paraphrase|apply|use|solve|demonstrate|implement|execute|calculate|compute|evaluate|justify|critique|assess|judge|defend|prioritize|recommend|design|develop|construct|propose|create|formulate|devise|plan|compose)\b/i;
  if (forbiddenStart.test(text)) {
    return {
      valid: false,
      reason: 'Analyzing items must ask learners to examine relationships or differentiate evidence, not recall facts',
    };
  }
  return analyzingSignals.test(text)
    ? { valid: true }
    : { valid: false, reason: 'Analyzing items must require examining, differentiating, or analyzing information' };
}

export function validateQuestionContent(
  topic: string,
  text: string,
  bloom: string,
  questionType: string,
): { valid: boolean; category?: 'topic' | 'bloom'; reason?: string } {
  const topicValidation = validateTopicRelevance(topic, text);
  if (!topicValidation.valid) {
    return { valid: false, category: 'topic', reason: topicValidation.reason };
  }

  const level = bloom.trim().toLowerCase();
  if (
    questionType !== 'essay' &&
    HIGHER_ORDER_LEVELS.has(level) &&
    !hasMeaningfulScenarioCue(text)
  ) {
    return {
      valid: false,
      category: 'bloom',
      reason: `Higher-order Bloom (${level}) requires a meaningful scenario with relevant contextual details`,
    };
  }
  if (level === 'applying') {
    const result = validateApplyingQuestion(text);
    if (!result.valid) return { ...result, category: 'bloom' };
  }
  if (level === 'analyzing') {
    const result = validateAnalyzingQuestion(text);
    if (!result.valid) return { ...result, category: 'bloom' };
  }
  return { valid: true };
}

export function detectBloomFromText(text: string): { level: string; score: number } {
  const levels = Object.keys(BLOOM_ACTIONS);
  const matchingLevels = levels.filter((level) => BLOOM_ACTIONS[level].test(text));
  if (matchingLevels.length > 0) {
    const level = matchingLevels[matchingLevels.length - 1];
    return { level, score: 1 };
  }

  const lower = ` ${text.toLowerCase()} `;
  const recallQuestion = /\b(what is|who|when|where)\b/i.test(lower);
  return recallQuestion ? { level: 'remembering', score: 1 } : { level: 'understanding', score: 0 };
}

export function buildTopicBloomPrompt(topic: string, bloom: string): string {
  const level = bloom.toLowerCase();
  const topicInstruction = `TOPIC FIDELITY: The stem itself must name "${topic}" or a clearly specific component, process, or technical term belonging to that topic. Use the terminology naturally; do not rely on generic subject wording or answer choices to establish relevance.`;
  const bloomInstruction = level === 'analyzing'
    ? 'ANALYZING: Present a concrete, topic-relevant case, dataset, diagnostic result, or problem with observable details. Ask learners to inspect that evidence, compare or distinguish its parts, or explain a relationship or cause. The evidence must be necessary to answer; adding an action verb or a scenario cue alone is insufficient.'
    : level === 'applying'
      ? 'APPLYING: Present a realistic, topic-relevant task, situation, or problem with concrete conditions or evidence. Require learners to choose or perform an appropriate procedure or action in that situation. Do not ask them merely to define, identify, name, or recall.'
      : '';
  return [topicInstruction, bloomInstruction].filter(Boolean).join('\n');
}
