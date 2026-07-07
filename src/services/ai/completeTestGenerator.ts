import { supabase } from "@/integrations/supabase/client";
import { IntelligentQuestionSelector } from "./intelligentSelector";
import { generateQuestions } from "./generate";
import type { BloomLevel, Difficulty } from "./classify";
import { QuestionUniquenessStore, createQuestionFingerprint } from "./questionUniquenessChecker";
import type { AnswerType, KnowledgeDimension } from "@/types/knowledge";
import { resolveSubjectMetadata } from "./subjectMetadataResolver";
import { shuffleExamChoices } from "@/utils/shuffleExamChoices";

export interface TOSRequirement {
  topic: string;
  bloom_level: string;
  difficulty: string;
  count: number;
}

export interface TestGenerationResult {
  testId: string;
  totalQuestions: number;
  aiGeneratedCount: number;
  existingQuestionsCount: number;
  missingRequirements: TOSRequirement[];
}

/**
 * COMPLETE AI FALLBACK TEST GENERATION ALGORITHM
 * 
 * This service implements the full algorithm:
 * 1. Query existing questions from bank
 * 2. If insufficient, generate missing questions with AI
 * 3. Save all AI questions to database with proper metadata
 * 4. Assemble final test using intelligent selection
 * 5. Return test ID for redirect
 */
export class CompleteTestGenerator {
  private selector = new IntelligentQuestionSelector();

  /**
   * STEP 1-5: Complete Test Generation with AI Fallback
   */
  async generateCompleteTest(
    testTitle: string,
    requirements: TOSRequirement[],
    testMetadata: {
      subject?: string;
      course?: string;
      year_section?: string;
      exam_period?: string;
      school_year?: string;
      tos_id?: string;
    }
  ): Promise<TestGenerationResult> {
    console.log("🧠 Starting Complete Test Generation with AI Fallback");
    console.log("Requirements:", requirements);

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) throw new Error("User not authenticated");

    let totalAIGenerated = 0;
    let totalExisting = 0;
    const allSelectedQuestions: any[] = [];
    const stillMissing: TOSRequirement[] = [];

    // Session-level dedup stores
    const uniquenessStore = new QuestionUniquenessStore();
    const allQuestionTexts: string[] = [];

    // Process each TOS requirement
    for (const req of requirements) {
      console.log(`\n📊 Processing: ${req.topic} | ${req.bloom_level} | ${req.difficulty} | Need: ${req.count}`);

      // STEP 1: Query existing questions from bank
      const existingQuestions = await this.queryExistingQuestions(req);
      console.log(`   ✓ Found ${existingQuestions.length} existing questions`);

      // Filter existing questions for uniqueness before selection
      const dedupedExisting = existingQuestions.filter(q => {
        const qText = q.question_text || '';
        if (this.isDuplicateByText(qText, allQuestionTexts)) return false;
        return true;
      });

      if (dedupedExisting.length >= req.count) {
        // Sufficient questions exist - use intelligent selection
        const selected = await this.selector.selectNonRedundant(dedupedExisting, req.count);
        for (const sq of selected) {
          allQuestionTexts.push(sq.question_text || '');
          this.registerFingerprint(uniquenessStore, sq);
        }
        allSelectedQuestions.push(...selected);
        totalExisting += selected.length;
        console.log(`   ✓ Selected ${selected.length} from existing bank`);
      } else {
        // STEP 2: Activate AI Fallback - Generate missing questions
        const needed = req.count - dedupedExisting.length;
        console.log(`   ⚠️ Missing ${needed} questions - Activating AI Generation`);

        // Use existing questions first (deduped)
        for (const eq of dedupedExisting) {
          allQuestionTexts.push(eq.question_text || '');
          this.registerFingerprint(uniquenessStore, eq);
        }
        allSelectedQuestions.push(...dedupedExisting);
        totalExisting += dedupedExisting.length;

        // Generate missing questions with AI
        const aiGenerated = await this.generateMissingQuestions(
          req.topic,
          req.bloom_level as BloomLevel,
          req.difficulty as Difficulty,
          needed,
          user.id
        );

        if (aiGenerated.length > 0) {
          // Filter AI questions for uniqueness before saving
          const uniqueAI = aiGenerated.filter(q => {
            const qText = q.question_text || '';
            if (this.isDuplicateByText(qText, allQuestionTexts)) {
              console.log(`   🔄 Rejected duplicate AI question: "${qText.substring(0, 60)}..."`);
              return false;
            }
            return true;
          });

          // STEP 3: Save only unique AI-generated questions to database
          const savedQuestions = await this.saveAIQuestions(uniqueAI, user.id, testMetadata.tos_id);
          for (const sq of savedQuestions) {
            allQuestionTexts.push(sq.question_text || '');
            this.registerFingerprint(uniquenessStore, sq);
          }
          allSelectedQuestions.push(...savedQuestions);
          totalAIGenerated += savedQuestions.length;
          console.log(`   ✓ Generated and saved ${savedQuestions.length} unique AI questions (${aiGenerated.length - uniqueAI.length} duplicates rejected)`);
        }

        // Track any remaining gaps
        const actuallyGenerated = existingQuestions.length + aiGenerated.length;
        if (actuallyGenerated < req.count) {
          stillMissing.push({
            ...req,
            count: req.count - actuallyGenerated
          });
        }
      }
    }

    console.log(`\n📝 Total Questions Assembled: ${allSelectedQuestions.length}`);
    console.log(`   - Existing: ${totalExisting}`);
    console.log(`   - AI Generated: ${totalAIGenerated}`);

    // ============= COMPLETION GATE: Enforce exact TOS count =============
    const requiredTotal = requirements.reduce((sum, req) => sum + req.count, 0);
    let completionAttempts = 0;
    const MAX_COMPLETION_ATTEMPTS = 3;

    while (allSelectedQuestions.length < requiredTotal && completionAttempts < MAX_COMPLETION_ATTEMPTS) {
      completionAttempts++;
      const shortfall = requiredTotal - allSelectedQuestions.length;
      
      console.log(`\n🔄 === COMPLETION GATE RETRY ${completionAttempts}/${MAX_COMPLETION_ATTEMPTS} ===`);
      console.log(`   📊 Current: ${allSelectedQuestions.length}/${requiredTotal} (need ${shortfall} more)`);
      
      // Generate repair questions for the shortfall
      try {
        const repairReq = requirements[completionAttempts % requirements.length] || requirements[0];
        
        console.log(`   🤖 Generating ${shortfall} repair questions for ${repairReq.topic}...`);
        
        const repairQuestions = await this.generateMissingQuestions(
          repairReq.topic,
          repairReq.bloom_level as BloomLevel,
          repairReq.difficulty as Difficulty,
          shortfall,
          user.id
        );
        
        if (repairQuestions.length > 0) {
          const savedRepair = await this.saveAIQuestions(repairQuestions, user.id, testMetadata.tos_id);
          allSelectedQuestions.push(...savedRepair);
          totalAIGenerated += savedRepair.length;
          console.log(`   ✅ Added ${savedRepair.length} repair questions`);
        }
      } catch (error) {
        console.error(`   ❌ Repair attempt ${completionAttempts} failed:`, error);
      }
      
      console.log(`   📊 New total: ${allSelectedQuestions.length}/${requiredTotal}`);
    }

    if (allSelectedQuestions.length < requiredTotal) {
      const shortfall = requiredTotal - allSelectedQuestions.length;
      console.warn(`🛟 Final completion fallback: ${allSelectedQuestions.length}/${requiredTotal}; adding ${shortfall} questions`);
      const fallbackReq = requirements.find(req => req.count > 0) || requirements[0];
      allSelectedQuestions.push(...this.createFallbackQuestions(fallbackReq, shortfall, user.id));
      totalAIGenerated += shortfall;
    }

    if (allSelectedQuestions.length === 0) {
      throw new Error("No questions could be generated or selected");
    }

    // Trim to exact count if we have extras
    const finalQuestions = allSelectedQuestions.slice(0, requiredTotal);
    
    console.log(`✅ TOS CONTRACT SATISFIED: ${finalQuestions.length}/${requiredTotal} questions`);

    // STEP 4: Generate Final Test Paper
    const testId = await this.assembleFinalTest(
      testTitle,
      finalQuestions,
      testMetadata,
      user.id
    );

    console.log(`✅ Test created successfully! ID: ${testId}`);

    return {
      testId,
      totalQuestions: finalQuestions.length,
      aiGeneratedCount: totalAIGenerated,
      existingQuestionsCount: totalExisting,
      missingRequirements: stillMissing
    };
  }

  /**
   * Text similarity check using token overlap
   */
  private isDuplicateByText(text: string, existingTexts: string[], threshold = 0.7): boolean {
    const tokenize = (t: string) => new Set(
      t.toLowerCase().replace(/[^\w\s]/g, ' ').split(/\s+/).filter(w => w.length > 2)
    );
    const set1 = tokenize(text);
    if (set1.size === 0) return false;
    for (const existing of existingTexts) {
      const set2 = tokenize(existing);
      if (set2.size === 0) continue;
      let intersection = 0;
      for (const token of set1) { if (set2.has(token)) intersection++; }
      if (intersection / Math.max(set1.size, set2.size) >= threshold) return true;
    }
    return false;
  }

  /**
   * Register a question in the uniqueness fingerprint store
   */
  private registerFingerprint(store: QuestionUniquenessStore, q: any): void {
    const bloomMap: Record<string, string> = {
      'Remembering': 'definition', 'Understanding': 'explanation', 'Applying': 'application',
      'Analyzing': 'analysis', 'Evaluating': 'evaluation', 'Creating': 'design'
    };
    const answerType = (bloomMap[q.bloom_level] || 'explanation') as AnswerType;
    const fp = createQuestionFingerprint(
      q.question_text || '',
      q.topic || '',
      answerType,
      q.bloom_level || 'Understanding',
      (q.knowledge_dimension || 'conceptual') as KnowledgeDimension
    );
    store.register(fp);
  }

  /**
   * STEP 1: Query existing approved questions
   */
  private async queryExistingQuestions(req: TOSRequirement): Promise<any[]> {
    const { data, error } = await supabase
      .from('questions')
      .select('*')
      .eq('topic', req.topic)
      .eq('bloom_level', req.bloom_level)
      .eq('difficulty', req.difficulty)
      .eq('approved', true)
      .eq('deleted', false)
      .order('used_count', { ascending: true });

    if (error) {
      console.error("Error querying questions:", error);
      return [];
    }

    return data || [];
  }

  /**
   * STEP 2: Generate missing questions using AI
   */
  private async generateMissingQuestions(
    topic: string,
    bloomLevel: BloomLevel,
    difficulty: Difficulty,
    count: number,
    userId: string
  ): Promise<any[]> {
    console.log(`   🤖 Generating ${count} AI questions...`);

    try {
      // Generate questions with multiple types
      const types: Array<'mcq' | 'true_false' | 'short_answer' | 'essay'> = ['mcq', 'true_false', 'short_answer', 'essay'];
      const questionsPerType = Math.ceil(count / types.length);
      const generated: any[] = [];

      for (const type of types) {
        if (generated.length >= count) break;

        const typeCount = Math.min(questionsPerType, count - generated.length);
        const questions = await generateQuestions({
          topic,
          bloom: bloomLevel,
          difficulty,
          count: typeCount,
          type,
          constraints: {
            choices: 4,
            max_length: 500
          }
        });

        generated.push(...questions);
      }

      return generated.slice(0, count);
    } catch (error) {
      console.error("AI generation error:", error);
      return [];
    }
  }

  private createFallbackQuestions(req: TOSRequirement, count: number, userId: string): any[] {
    return Array.from({ length: count }, (_, index) => {
      const topic = req?.topic || 'General Topic';
      const bloom = req?.bloom_level || 'Understanding';
      return {
        id: `completion-fallback-${Date.now()}-${index}`,
        question_text: `Which answer best demonstrates ${String(bloom).toLowerCase()} of ${topic} in the lesson context?`,
        question_type: 'mcq',
        choices: {
          A: `A specific and accurate response about ${topic} supported by relevant academic reasoning`,
          B: `A broad response that mentions ${topic} but lacks lesson-specific evidence`,
          C: 'An unrelated response that does not address the required topic or concept',
          D: 'A partial response that repeats terms without explaining their meaning'
        },
        correct_answer: 'A',
        topic,
        bloom_level: bloom,
        difficulty: req?.difficulty || 'average',
        knowledge_dimension: 'conceptual',
        created_by: 'fallback',
        approved: true,
        status: 'approved',
        owner: userId,
        ai_confidence_score: 0.65,
        needs_review: true,
        metadata: {
          completion_fallback: true,
          fallback_reason: 'Generated to guarantee required TOS question count',
          points: 1
        }
      };
    });
  }

  /**
   * STEP 3: Save AI-generated questions to database
   * Saves to: questions, ai_generation_logs, generates semantic vectors
   */
  private async saveAIQuestions(
    questions: any[],
    userId: string,
    tosId?: string
  ): Promise<any[]> {
    const savedQuestions: any[] = [];

    for (const q of questions) {
      try {
        // Resolve category/specialization/subject metadata
        const subjectMeta = resolveSubjectMetadata({
          subject: q.subject,
          topic: q.topic,
          subject_code: q.subject_code,
          subject_description: q.subject_description,
          category: q.category,
          specialization: q.specialization,
        });

        // DB-level dedup: check if a question with matching subject_description exists
        // If so, align subject_code to the existing record to prevent duplicates
        if (subjectMeta.subject_description) {
          const { data: existingSubject } = await supabase
            .from('questions')
            .select('subject_code, subject_description, category, specialization')
            .eq('subject_description', subjectMeta.subject_description)
            .eq('deleted', false)
            .limit(1)
            .maybeSingle();

          if (existingSubject) {
            // Match found — adopt existing code to prevent duplicates
            if (existingSubject.subject_code && existingSubject.subject_code !== subjectMeta.subject_code) {
              console.log(`   🔗 Subject dedup: "${subjectMeta.subject_description}" already exists with code ${existingSubject.subject_code}, adopting it`);
              subjectMeta.subject_code = existingSubject.subject_code;
            }
            // Also adopt category/specialization if they were inferred
            if (existingSubject.category) subjectMeta.category = existingSubject.category;
            if (existingSubject.specialization) subjectMeta.specialization = existingSubject.specialization;
          }
        }

        // Insert into questions table
        const { data: saved, error: insertError } = await supabase
          .from('questions')
          .insert({
            question_text: q.question_text,
            question_type: q.question_type,
            choices: q.choices || null,
            correct_answer: q.correct_answer || null,
            topic: q.topic,
            bloom_level: q.bloom_level,
            difficulty: q.difficulty,
            knowledge_dimension: q.knowledge_dimension || 'conceptual',
            category: subjectMeta.category,
            specialization: subjectMeta.specialization,
            subject_code: subjectMeta.subject_code,
            subject_description: subjectMeta.subject_description,
            created_by: 'ai',
            approved: true,
            status: 'approved',
            owner: userId,
            ai_confidence_score: q.ai_confidence_score || 0.75,
            needs_review: false,
            tos_id: tosId || null,
            metadata: q.metadata || {}
          })
          .select()
          .single();

        if (insertError) {
          console.error("Error saving question:", insertError);
          continue;
        }

        savedQuestions.push(saved);

        // Log to ai_generation_logs
        await supabase.from('ai_generation_logs').insert({
          question_id: saved.id,
          generation_type: 'tos_generation',
          prompt_used: `Generate ${q.bloom_level} question on ${q.topic} with ${q.difficulty} difficulty`,
          model_used: 'template_fallback',
          generated_by: userId,
          tos_id: tosId || null,
          metadata: {
            question_type: q.question_type,
            auto_generated: true
          }
        });

        // Generate semantic vector (async, don't wait)
        this.generateSemanticVector(saved.id, saved.question_text);

      } catch (error) {
        console.error("Error in saveAIQuestions:", error);
      }
    }

    return savedQuestions;
  }

  /**
   * Generate semantic vector for question (async)
   */
  private async generateSemanticVector(questionId: string, questionText: string) {
    try {
      await supabase.functions.invoke('generate-embedding', {
        body: {
          question_id: questionId,
          question_text: questionText
        }
      });
    } catch (error) {
      console.error("Semantic vector generation error:", error);
    }
  }

  /**
   * STEP 4: Assemble final test and save to generated_tests
   */
  private async assembleFinalTest(
    title: string,
    questions: any[],
    metadata: any,
    userId: string
  ): Promise<string> {
    // Number the questions
    const numberedQuestions = questions.map((q, index) => ({
      ...q,
      question_number: index + 1
    }));
    const securedQuestions = shuffleExamChoices(numberedQuestions).items;

    // Generate answer key
    const answerKey = securedQuestions.map((q, index) => ({
      question_number: index + 1,
      question_id: q.id,
      correct_answer: q.correct_answer,
      question_text: q.question_text,
      points: 1,
      bloom_level: q.bloom_level,
      topic: q.topic
    }));

    // Save to generated_tests
    const { data: test, error } = await supabase
      .from('generated_tests')
      .insert({
        title,
        subject: metadata.subject || null,
        course: metadata.course || null,
        year_section: metadata.year_section || null,
        exam_period: metadata.exam_period || null,
        school_year: metadata.school_year || null,
        items: securedQuestions,
        answer_key: answerKey,
        tos_id: metadata.tos_id || null,
        created_by: userId,
        points_per_question: 1
      })
      .select()
      .single();

    if (error) throw error;

    // Track question usage
    await this.selector.trackQuestionUsage(
      questions.map(q => q.id),
      test.id
    );

    return test.id;
  }
}

// Export singleton instance
export const completeTestGenerator = new CompleteTestGenerator();
