import { supabase } from "@/integrations/supabase/client";

// Type definitions
export interface TopicResult {
  topic: string;
  bloomLevel: string;
  required: number;
  available: number;
  gap: number;
  sufficiency: "pass" | "warning" | "fail";
}

export interface SubjectSummary {
  subjectCode: string;
  subjectDescription: string;
  totalRequired: number;
  totalAvailable: number;
  gap: number;
  sufficiency: "pass" | "warning" | "fail";
  topicCoverage: TopicCoverageItem[];
}

export interface TopicCoverageItem {
  topic: string;
  required: number;
  available: number;
  gap: number;
  hasTopic: boolean; // whether questions have topic tags
  untaggedCount: number; // questions matching subject but missing topic
  sufficiency: "pass" | "warning" | "fail";
}

export interface SufficiencyAnalysis {
  overallStatus: "pass" | "warning" | "fail";
  overallScore: number;
  totalRequired: number;
  totalAvailable: number;
  subjectSummary: SubjectSummary;
  results: TopicResult[]; // kept for backward compat
  recommendations: string[];
}

const normalize = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();

const normalizeBloom = (bloom: string) => {
  const b = bloom.toLowerCase().trim();
  if (b.includes("remember")) return "remembering";
  if (b.includes("understand")) return "understanding";
  if (b.includes("apply")) return "applying";
  if (b.includes("analy")) return "analyzing";
  if (b.includes("evaluat")) return "evaluating";
  if (b.includes("creat")) return "creating";
  return b;
};

export async function analyzeTOSSufficiency(tosMatrix: any): Promise<SufficiencyAnalysis> {
  // Extract subject code from TOS matrix
  const subjectCode = (tosMatrix.subject_no || tosMatrix.subjectNo || "").trim();
  const subjectDesc = (tosMatrix.description || "").trim();

  // Fetch all non-deleted questions
  const { data: questions, error } = await supabase
    .from("questions")
    .select("id, topic, bloom_level, approved, subject_code, subject_description, subject")
    .eq("deleted", false);

  if (error) {
    console.error("Error fetching questions:", error);
    throw new Error("Failed to analyze question bank sufficiency");
  }

  const allQuestions = questions || [];

  // --- STEP 1: Subject-based sufficiency (primary) ---
  // Match questions by subject_code OR subject_description
  const normalizedSubjectCode = normalize(subjectCode);
  const normalizedSubjectDesc = normalize(subjectDesc);

  const subjectQuestions = allQuestions.filter((q) => {
    const qCode = normalize(q.subject_code || "");
    const qDesc = normalize(q.subject_description || "");
    const qSubject = normalize(q.subject || "");

    // Match by code, description, or subject field
    if (normalizedSubjectCode && qCode && (qCode === normalizedSubjectCode || qCode.includes(normalizedSubjectCode) || normalizedSubjectCode.includes(qCode))) return true;
    if (normalizedSubjectDesc && qDesc && (qDesc.includes(normalizedSubjectDesc) || normalizedSubjectDesc.includes(qDesc))) return true;
    if (normalizedSubjectDesc && qSubject && (qSubject.includes(normalizedSubjectDesc) || normalizedSubjectDesc.includes(qSubject))) return true;
    return false;
  });

  // Group subject questions by bloom level
  const subjectBloomMap: Record<string, number> = {};
  subjectQuestions.forEach((q) => {
    const bloom = normalizeBloom(q.bloom_level || "");
    if (!bloom) return;
    subjectBloomMap[bloom] = (subjectBloomMap[bloom] || 0) + 1;
  });

  // Calculate total required from TOS
  const bloomLevels = ["remembering", "understanding", "applying", "analyzing", "evaluating", "creating"];
  let totalRequired = 0;
  let totalAvailable = 0;

  const results: TopicResult[] = [];

  // --- STEP 2: Topic-level validation (secondary) ---
  // Group subject questions by topic + bloom for secondary analysis
  const topicBloomMap: Record<string, Record<string, { total: number; untagged: number }>> = {};
  
  subjectQuestions.forEach((q) => {
    const topicKey = normalize(q.topic || "");
    const bloomKey = normalizeBloom(q.bloom_level || "");
    if (!bloomKey) return;

    const effectiveTopic = topicKey || "__untagged__";

    if (!topicBloomMap[effectiveTopic]) topicBloomMap[effectiveTopic] = {};
    if (!topicBloomMap[effectiveTopic][bloomKey]) topicBloomMap[effectiveTopic][bloomKey] = { total: 0, untagged: 0 };
    
    topicBloomMap[effectiveTopic][bloomKey].total += 1;
    if (!topicKey) {
      topicBloomMap[effectiveTopic][bloomKey].untagged += 1;
    }
  });

  // Count untagged questions per bloom
  const untaggedByBloom: Record<string, number> = {};
  if (topicBloomMap["__untagged__"]) {
    for (const [bloom, data] of Object.entries(topicBloomMap["__untagged__"])) {
      untaggedByBloom[bloom] = data.total;
    }
  }

  const topicCoverage: TopicCoverageItem[] = [];

  for (const topic of tosMatrix.topics || []) {
    const topicName = topic.topic_name || topic.topic || topic.name;
    if (!topicName) continue;

    const normalizedTopic = normalize(topicName);
    const matrixEntry = tosMatrix.matrix?.[topicName];

    let topicRequired = 0;
    let topicAvailable = 0;
    let topicUntagged = 0;

    for (const bloom of bloomLevels) {
      // Get required count from TOS matrix
      let required = 0;

      if (topic[`${bloom}_items`] != null) {
        required = Number(topic[`${bloom}_items`]) || 0;
      } else if (matrixEntry?.[bloom]?.count != null) {
        required = Number(matrixEntry[bloom].count) || 0;
      } else if (Array.isArray(tosMatrix.distribution?.[topicName]?.[bloom])) {
        required = tosMatrix.distribution[topicName][bloom].length;
      } else if (typeof tosMatrix.distribution?.[topicName]?.[bloom] === 'object' && tosMatrix.distribution?.[topicName]?.[bloom]?.count != null) {
        required = Number(tosMatrix.distribution[topicName][bloom].count) || 0;
      }

      if (required === 0) continue;

      totalRequired += required;
      topicRequired += required;

      // Find available questions - topic-level match (within subject-filtered set)
      let available = 0;

      // Exact match
      if (topicBloomMap[normalizedTopic]?.[bloom]) {
        available = topicBloomMap[normalizedTopic][bloom].total;
      } else {
        // Fuzzy match
        for (const [dbTopic, bloomData] of Object.entries(topicBloomMap)) {
          if (dbTopic === "__untagged__") continue;
          if (dbTopic.includes(normalizedTopic) || normalizedTopic.includes(dbTopic)) {
            available += bloomData[bloom]?.total || 0;
          }
        }
      }

      // Fallback: also count untagged questions at subject level for this bloom
      const untaggedForBloom = untaggedByBloom[bloom] || 0;

      // For subject-level counting, use all subject questions with this bloom
      const subjectAvailable = subjectBloomMap[bloom] || 0;

      // Use the HIGHER of topic-specific or subject-level availability
      // (subject-based is primary, topic is secondary validation)
      const effectiveAvailable = Math.max(available, 0);
      const subjectLevelAvailable = subjectAvailable;

      topicAvailable += Math.min(effectiveAvailable, required);
      topicUntagged += untaggedForBloom;

      totalAvailable += Math.min(subjectLevelAvailable, required);

      const gap = Math.max(0, required - subjectLevelAvailable);

      let sufficiency: "pass" | "warning" | "fail";
      if (subjectLevelAvailable >= required) {
        sufficiency = "pass";
      } else if (subjectLevelAvailable >= required * 0.7) {
        sufficiency = "warning";
      } else {
        sufficiency = "fail";
      }

      results.push({
        topic: topicName,
        bloomLevel: bloom.charAt(0).toUpperCase() + bloom.slice(1),
        required,
        available: subjectLevelAvailable,
        gap,
        sufficiency,
      });
    }

    // Topic coverage item
    const topicGap = Math.max(0, topicRequired - topicAvailable);
    let topicSuff: "pass" | "warning" | "fail";
    if (topicRequired === 0) topicSuff = "pass";
    else if (topicAvailable >= topicRequired) topicSuff = "pass";
    else if (topicAvailable >= topicRequired * 0.7) topicSuff = "warning";
    else topicSuff = "fail";

    topicCoverage.push({
      topic: topicName,
      required: topicRequired,
      available: topicAvailable,
      gap: topicGap,
      hasTopic: topicAvailable > 0 || topicBloomMap[normalizedTopic] !== undefined,
      untaggedCount: topicUntagged,
      sufficiency: topicSuff,
    });
  }

  // Deduplicate subject-level availability (don't double-count across bloom levels)
  // Recalculate properly: total available = questions in subject that match ANY required bloom
  const subjectTotalAvailable = subjectQuestions.length;
  const effectiveTotalAvailable = Math.min(subjectTotalAvailable, totalRequired);

  // Overall score
  const overallScore = totalRequired === 0 ? 100 : Math.min(100, (effectiveTotalAvailable / totalRequired) * 100);
  
  const totalGap = Math.max(0, totalRequired - effectiveTotalAvailable);

  let overallStatus: "pass" | "warning" | "fail";
  if (totalRequired === 0) overallStatus = "pass";
  else if (totalGap === 0) overallStatus = "pass";
  else if (overallScore >= 70) overallStatus = "warning";
  else overallStatus = "fail";

  // Subject summary
  const subjectGap = Math.max(0, totalRequired - effectiveTotalAvailable);
  const subjectSummary: SubjectSummary = {
    subjectCode: subjectCode,
    subjectDescription: subjectDesc,
    totalRequired,
    totalAvailable: effectiveTotalAvailable,
    gap: subjectGap,
    sufficiency: overallStatus,
    topicCoverage,
  };

  // Recommendations
  const recommendations: string[] = [];

  if (totalRequired === 0) {
    recommendations.push("Define TOS requirements to compute question gaps.");
  } else if (overallStatus === "pass") {
    recommendations.push(`✓ Subject "${subjectCode}" has sufficient questions (${effectiveTotalAvailable}/${totalRequired}).`);
  } else {
    recommendations.push(`Subject "${subjectCode}" has ${effectiveTotalAvailable} questions available out of ${totalRequired} required.`);
    if (subjectGap > 0) {
      recommendations.push(`AI will generate ${subjectGap} additional question(s) to complete the exam.`);
    }
  }

  // Topic-level warnings
  const incompleteTopic = topicCoverage.filter(t => t.sufficiency !== "pass" && t.required > 0);
  if (incompleteTopic.length > 0) {
    recommendations.push(`Topic Coverage Incomplete: ${incompleteTopic.map(t => t.topic).join(", ")} — consider generating or tagging questions for these topics.`);
  }

  const untaggedTotal = topicCoverage.reduce((sum, t) => sum + t.untaggedCount, 0);
  if (untaggedTotal > 0) {
    recommendations.push(`${untaggedTotal} question(s) under this subject lack topic tags and need classification.`);
  }

  return {
    overallStatus,
    overallScore,
    totalRequired,
    totalAvailable: effectiveTotalAvailable,
    subjectSummary,
    results,
    recommendations,
  };
}
