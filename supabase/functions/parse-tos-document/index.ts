const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function extractJsonFromResponse(response: string): unknown {
  let cleaned = response
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();

  const jsonStart = cleaned.search(/[\{\[]/);
  const jsonEnd = cleaned.lastIndexOf(jsonStart !== -1 && cleaned[jsonStart] === '[' ? ']' : '}');

  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error("No JSON object found in response");
  }

  cleaned = cleaned.substring(jsonStart, jsonEnd + 1);

  try {
    return JSON.parse(cleaned);
  } catch {
    cleaned = cleaned
      .replace(/,\s*}/g, "}")
      .replace(/,\s*]/g, "]")
      .replace(/[\x00-\x1F\x7F]/g, "");
    return JSON.parse(cleaned);
  }
}

/**
 * Extract raw text from a DOCX file by parsing the word/document.xml inside the ZIP.
 */
async function extractDocxText(uint8Array: Uint8Array): Promise<string> {
  // DOCX is a ZIP archive. We need to find word/document.xml
  // Use the Web Streams API / DecompressionStream if available, 
  // or manually parse the ZIP structure

  // Simple ZIP parser to find word/document.xml
  const data = uint8Array;
  const entries: { name: string; compressedData: Uint8Array; compressionMethod: number }[] = [];

  // Find End of Central Directory
  let eocdOffset = -1;
  for (let i = data.length - 22; i >= 0; i--) {
    if (data[i] === 0x50 && data[i + 1] === 0x4B && data[i + 2] === 0x05 && data[i + 3] === 0x06) {
      eocdOffset = i;
      break;
    }
  }

  if (eocdOffset === -1) {
    throw new Error("Not a valid ZIP/DOCX file");
  }

  // Read central directory offset
  const cdOffset = data[eocdOffset + 16] | (data[eocdOffset + 17] << 8) |
    (data[eocdOffset + 18] << 16) | (data[eocdOffset + 19] << 24);
  const cdEntries = data[eocdOffset + 10] | (data[eocdOffset + 11] << 8);

  let offset = cdOffset;
  for (let i = 0; i < cdEntries; i++) {
    if (offset + 46 > data.length) break;

    const compressionMethod = data[offset + 10] | (data[offset + 11] << 8);
    const compressedSize = data[offset + 20] | (data[offset + 21] << 8) |
      (data[offset + 22] << 16) | (data[offset + 23] << 24);
    const nameLen = data[offset + 28] | (data[offset + 29] << 8);
    const extraLen = data[offset + 30] | (data[offset + 31] << 8);
    const commentLen = data[offset + 32] | (data[offset + 33] << 8);
    const localHeaderOffset = data[offset + 42] | (data[offset + 43] << 8) |
      (data[offset + 44] << 16) | (data[offset + 45] << 24);

    const nameBytes = data.slice(offset + 46, offset + 46 + nameLen);
    const name = new TextDecoder().decode(nameBytes);

    if (name === "word/document.xml" || name === "word/document2.xml") {
      // Read from local file header
      const lh = localHeaderOffset;
      const lhNameLen = data[lh + 26] | (data[lh + 27] << 8);
      const lhExtraLen = data[lh + 28] | (data[lh + 29] << 8);
      const dataStart = lh + 30 + lhNameLen + lhExtraLen;
      const compressedData = data.slice(dataStart, dataStart + compressedSize);

      entries.push({ name, compressedData, compressionMethod });
    }

    offset += 46 + nameLen + extraLen + commentLen;
  }

  if (entries.length === 0) {
    throw new Error("No word/document.xml found in DOCX");
  }

  // Decompress
  const entry = entries[0];
  let xmlBytes: Uint8Array;

  if (entry.compressionMethod === 0) {
    // Stored (no compression)
    xmlBytes = entry.compressedData;
  } else if (entry.compressionMethod === 8) {
    // Deflate - use DecompressionStream
    const ds = new DecompressionStream("deflate-raw");
    const writer = ds.writable.getWriter();
    const reader = ds.readable.getReader();
    
    writer.write(entry.compressedData);
    writer.close();
    
    const chunks: Uint8Array[] = [];
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
    }
    
    const totalLength = chunks.reduce((sum, c) => sum + c.length, 0);
    xmlBytes = new Uint8Array(totalLength);
    let pos = 0;
    for (const chunk of chunks) {
      xmlBytes.set(chunk, pos);
      pos += chunk.length;
    }
  } else {
    throw new Error(`Unsupported compression method: ${entry.compressionMethod}`);
  }

  const xmlText = new TextDecoder().decode(xmlBytes);

  // Extract text content from XML by stripping tags, preserving paragraph breaks
  const text = xmlText
    .replace(/<w:p[^>]*\/>/g, "\n") // self-closing paragraphs
    .replace(/<\/w:p>/g, "\n")       // paragraph ends
    .replace(/<w:tab\/>/g, "\t")     // tabs
    .replace(/<w:br[^>]*\/>/g, "\n") // line breaks
    .replace(/<[^>]+>/g, "")         // all remaining tags
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\n{3,}/g, "\n\n")      // collapse excessive newlines
    .trim();

  return text;
}

const systemPrompt = `You are a precise document parser for Table of Specifications (TOS) used in Philippine higher education.

IMPORTANT RULES:
1. Extract data EXACTLY as it appears in the document - do NOT guess, infer, or hallucinate values.
2. Copy text verbatim - do not rephrase topic names or descriptions.
3. For numbers (hours, items), use the EXACT values from the document.
4. If a field is not present in the document, return an empty string (text) or 0 (numbers).
5. Pay careful attention to the table structure: each row typically has a TOPIC, NO. OF HOURS, PERCENTAGE, then 6 cognitive domain columns (Remembering, Understanding, Applying, Analyzing, Evaluating, Creating), then ITEM PLACEMENT and TOTAL.
6. Each cognitive domain cell may contain a count and item numbers in parentheses - extract the COUNT (the number before the parentheses).
7. Output raw numbers without thousands separators or formatting.

Return ONLY valid JSON with this exact structure:
{
  "subject_no": "string - exact subject number/code as written (e.g., ITELEC 102, IS 9)",
  "course": "string - the degree program (e.g., BSIT, BSIS)",
  "description": "string - exact subject description/title",
  "college": "string - the college name if present",
  "year_section": "string - year and section exactly as written",
  "exam_period": "string - examination period exactly as written (e.g., Midterm, Final Examination)",
  "school_year": "string - school year if present",
  "total_items": number,
  "prepared_by": "string - full name of preparer",
  "checked_by": "string - full name of checker/reviewer",
  "noted_by": "string - full name of noter/approver (usually the Dean)",
  "topics": [
    {
      "topic": "string - exact topic/competency text from the document",
      "hours": number,
      "remembering": number,
      "understanding": number,
      "applying": number,
      "analyzing": number,
      "evaluating": number,
      "creating": number,
      "total": number
    }
  ]
}`;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return new Response(JSON.stringify({ error: "No file provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fileName = file.name.toLowerCase();
    if (!fileName.endsWith(".pdf") && !fileName.endsWith(".docx") && !fileName.endsWith(".doc")) {
      return new Response(JSON.stringify({ error: "Only PDF and DOCX files are supported" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const arrayBuffer = await file.arrayBuffer();
    const uint8Array = new Uint8Array(arrayBuffer);

    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) {
      return new Response(JSON.stringify({ error: "AI service not configured" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let messages: any[];
    const isDocx = fileName.endsWith(".docx") || fileName.endsWith(".doc");

    if (isDocx) {
      // For DOCX: extract actual text first, then send text to AI
      let extractedText = "";
      try {
        extractedText = await extractDocxText(uint8Array);
        console.log("DOCX text extracted, length:", extractedText.length);
        console.log("First 500 chars:", extractedText.substring(0, 500));
      } catch (e) {
        console.error("DOCX text extraction failed:", e);
        // Fallback: send as base64
        let base64Content = "";
        const chunkSize = 8192;
        for (let i = 0; i < uint8Array.length; i += chunkSize) {
          const chunk = uint8Array.slice(i, i + chunkSize);
          base64Content += String.fromCharCode(...chunk);
        }
        base64Content = btoa(base64Content);
        extractedText = `[Base64 encoded DOCX - extraction failed]: ${base64Content.substring(0, 50000)}`;
      }

      // Quality check: if extracted text is too short, it might be a scanned document
      if (extractedText.length < 50) {
        console.warn("Extracted text very short, might be image-based DOCX");
      }

      messages = [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: `Extract the TOS data from this document text. Return only the JSON object.\n\n--- DOCUMENT TEXT START ---\n${extractedText}\n--- DOCUMENT TEXT END ---`,
        },
      ];
    } else {
      // PDF: send as base64 image for vision model
      let base64Content = "";
      const chunkSize = 8192;
      for (let i = 0; i < uint8Array.length; i += chunkSize) {
        const chunk = uint8Array.slice(i, i + chunkSize);
        base64Content += String.fromCharCode(...chunk);
      }
      base64Content = btoa(base64Content);

      messages = [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: "Extract the TOS data from this PDF document. Read the table carefully and extract EXACT values. Return only the JSON object.",
            },
            {
              type: "image_url",
              image_url: {
                url: `data:application/pdf;base64,${base64Content}`,
              },
            },
          ],
        },
      ];
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${lovableApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages,
        temperature: 0.0,
        max_tokens: 4000,
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error("AI API error:", errorText);

      let errorMessage = "AI parsing failed. Please try again.";
      if (aiResponse.status === 402) {
        errorMessage = "Lovable AI credits are required. Please add funds to your workspace usage.";
      } else if (aiResponse.status === 429) {
        errorMessage = "Lovable AI is rate limited right now. Please try again in a moment.";
      }

      return new Response(JSON.stringify({ error: errorMessage, details: errorText }), {
        status: aiResponse.status >= 400 && aiResponse.status < 600 ? aiResponse.status : 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const finishReason = aiData.choices?.[0]?.finish_reason;
    const content = aiData.choices?.[0]?.message?.content;

    if (!content) {
      return new Response(JSON.stringify({ error: "No response from AI parser" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Detect truncated response
    if (finishReason === "length") {
      console.warn("AI response was truncated (finish_reason=length)");
    }

    let parsedTOS: any;
    try {
      parsedTOS = extractJsonFromResponse(content);
    } catch {
      console.error("Failed to parse AI response:", content);
      return new Response(JSON.stringify({ error: "Failed to parse AI response. The document format may not be recognized." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build result with validation
    const topics = Array.isArray(parsedTOS.topics)
      ? parsedTOS.topics.map((t: any) => ({
          topic: String(t.topic || t.name || "").trim(),
          hours: Number(t.hours) || 0,
          remembering: Number(t.remembering) || 0,
          understanding: Number(t.understanding) || 0,
          applying: Number(t.applying) || 0,
          analyzing: Number(t.analyzing) || 0,
          evaluating: Number(t.evaluating) || 0,
          creating: Number(t.creating) || 0,
          total: Number(t.total) || 0,
        })).filter((t: any) => t.topic.length > 0)
      : [];

    // Cross-validate: check if per-topic totals match sum of bloom levels
    for (const t of topics) {
      const bloomSum = t.remembering + t.understanding + t.applying + t.analyzing + t.evaluating + t.creating;
      if (t.total > 0 && bloomSum > 0 && Math.abs(bloomSum - t.total) > 1) {
        console.warn(`Topic "${t.topic}": bloom sum ${bloomSum} != total ${t.total}`);
        // Trust the individual bloom values, recalculate total
        t.total = bloomSum;
      }
      if (t.total === 0 && bloomSum > 0) {
        t.total = bloomSum;
      }
    }

    // Validate total_items against sum of topic totals
    const topicTotalSum = topics.reduce((sum: number, t: any) => sum + t.total, 0);
    let totalItems = Number(parsedTOS.total_items) || 0;
    if (topicTotalSum > 0 && totalItems > 0 && Math.abs(topicTotalSum - totalItems) > 2) {
      console.warn(`total_items mismatch: declared=${totalItems}, calculated=${topicTotalSum}`);
    }
    if (totalItems === 0 && topicTotalSum > 0) {
      totalItems = topicTotalSum;
    }
    if (totalItems === 0) {
      totalItems = 50; // fallback
    }

    const result = {
      subject_no: String(parsedTOS.subject_no || "").trim(),
      course: String(parsedTOS.course || "").trim(),
      description: String(parsedTOS.description || "").trim(),
      college: String(parsedTOS.college || "").trim(),
      year_section: String(parsedTOS.year_section || "").trim(),
      exam_period: String(parsedTOS.exam_period || "").trim(),
      school_year: String(parsedTOS.school_year || "").trim(),
      total_items: totalItems,
      prepared_by: String(parsedTOS.prepared_by || "").trim(),
      checked_by: String(parsedTOS.checked_by || "").trim(),
      noted_by: String(parsedTOS.noted_by || "").trim(),
      topics,
      _warnings: [] as string[],
    };

    // Generate warnings for missing/suspicious data
    if (!result.subject_no) result._warnings.push("Subject number not found");
    if (!result.course) result._warnings.push("Course not found");
    if (!result.description) result._warnings.push("Description not found");
    if (result.topics.length === 0) {
      result.topics = [{ topic: "General", hours: 3, remembering: 0, understanding: 0, applying: 0, analyzing: 0, evaluating: 0, creating: 0, total: 0 }];
      result._warnings.push("No topics could be extracted");
    }
    if (result.topics.some((t: any) => t.hours === 0)) {
      result._warnings.push("Some topics have 0 hours - please verify");
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Parse TOS error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Failed to parse document" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
