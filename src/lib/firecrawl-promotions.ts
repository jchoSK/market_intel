"use server";

import OpenAI from "openai";

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const FIRECRAWL_API_URL = "https://api.firecrawl.dev/v2";

// ============================================================================
// FIRECRAWL PLAN LIMITS - Update these when changing plans
// ============================================================================
// Plan            | Concurrency | /crawl Rate Limit
// ----------------|-------------|------------------
// Free            |      2      |    1/min
// Hobby           |      5      |   15/min
// Standard        |     50      |   50/min
// Growth          |    100      |  250/min
// Scale/Enterprise|    150+     |  custom
// ============================================================================
const MAX_CONCURRENT_CRAWLS = 40;  // Max simultaneous crawl jobs (Standard plan, buffered from 50)
const RATE_LIMIT_PER_MINUTE = 40;  // Max crawl requests per minute (Standard plan, buffered from 50)
// ============================================================================

// Concurrency and rate limiter state
let activeCrawls = 0;
const crawlQueue: Array<() => void> = [];
const requestTimestamps: number[] = [];
// Mutex to ensure atomic check-and-reserve for concurrency/rate limits
let limiterLock: Promise<void> = Promise.resolve();

async function withCrawlConcurrencyLimit<T>(
  fn: () => Promise<T>,
  signal?: AbortSignal,
  onLog?: (message: string) => void
): Promise<T> {
  const log = (msg: string) => {
    console.log(msg);
    onLog?.(msg);
  };

  if (signal?.aborted) {
    throw new Error("Aborted");
  }

  // Use mutex to ensure atomic check-and-reserve for both concurrency and rate limits
  // This prevents race conditions where multiple requests pass checks simultaneously
  while (true) {
    // Wait for any pending limiter operations to complete
    await limiterLock;

    // Acquire the lock for our check-and-reserve
    let releaseLock: () => void;
    limiterLock = new Promise((resolve) => { releaseLock = resolve; });

    try {
      if (signal?.aborted) {
        throw new Error("Aborted");
      }

      // Check concurrency limit
      if (activeCrawls >= MAX_CONCURRENT_CRAWLS) {
        log(`[Firecrawl] Concurrency limit reached (${activeCrawls}/${MAX_CONCURRENT_CRAWLS}), waiting in queue...`);
        releaseLock!(); // Release lock while waiting

        await new Promise<void>((resolve, reject) => {
          const wrappedResolve = () => resolve();
          crawlQueue.push(wrappedResolve);

          if (signal) {
            signal.addEventListener('abort', () => {
              const idx = crawlQueue.indexOf(wrappedResolve);
              if (idx !== -1) {
                crawlQueue.splice(idx, 1);
              }
              reject(new Error("Aborted"));
            }, { once: true });
          }
        });
        log(`[Firecrawl] Released from concurrency queue, retrying...`);
        continue; // Re-check limits after being released
      }

      // Check rate limit
      const now = Date.now();
      const oneMinuteAgo = now - 60000;
      while (requestTimestamps.length > 0 && requestTimestamps[0] < oneMinuteAgo) {
        requestTimestamps.shift();
      }

      if (requestTimestamps.length >= RATE_LIMIT_PER_MINUTE) {
        const oldestTimestamp = requestTimestamps[0];
        const waitTime = oldestTimestamp + 60000 - now + 1000;
        log(`[Firecrawl] Rate limit reached (${requestTimestamps.length}/${RATE_LIMIT_PER_MINUTE} req/min), waiting ${Math.ceil(waitTime / 1000)}s...`);
        releaseLock!(); // Release lock while waiting

        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(resolve, waitTime);
          if (signal) {
            signal.addEventListener('abort', () => {
              clearTimeout(timeout);
              reject(new Error("Aborted"));
            }, { once: true });
          }
        });
        continue; // Re-check limits after waiting
      }

      // Both limits OK - reserve slots atomically
      activeCrawls++;
      requestTimestamps.push(Date.now());
      log(`[Firecrawl] Acquired slot (active: ${activeCrawls}/${MAX_CONCURRENT_CRAWLS}, rate: ${requestTimestamps.length}/${RATE_LIMIT_PER_MINUTE} req/min)`);
      break; // Exit the loop, we have our slot
    } finally {
      releaseLock!();
    }
  }

  try {
    return await fn();
  } finally {
    activeCrawls--;
    log(`[Firecrawl] Crawl finished (active: ${activeCrawls}/${MAX_CONCURRENT_CRAWLS}, queue: ${crawlQueue.length})`);
    // Release next waiting crawl if any
    const next = crawlQueue.shift();
    if (next) next();
  }
}

export interface PromotionsResult {
  promotions: string[];
  websiteStatus: string;
  dataVerificationDate: string;
  crawlJobId?: string;  // Firecrawl job ID for debugging
}

function stripToRootDomain(url: string): string {
  try {
    const parsed = new URL(url);
    return parsed.origin + "/";
  } catch {
    return url;
  }
}

// Extract monetary values and percentages from a string
function extractAmounts(str: string): string[] {
  const patterns = [
    /\$[\d,]+(?:\.\d{2})?/g,      // $50, $100, $1,000.00
    /\d+(?:\.\d+)?%/g,             // 10%, 15.5%
    /\d+(?:\.\d+)?\s*percent/gi,   // 10 percent
  ];

  const amounts: string[] = [];
  for (const pattern of patterns) {
    const matches = str.match(pattern);
    if (matches) {
      amounts.push(...matches.map(m => m.toLowerCase()));
    }
  }
  return amounts;
}

// Check if two strings have different monetary/percentage values
function hasDifferentAmounts(str1: string, str2: string): boolean {
  const amounts1 = extractAmounts(str1);
  const amounts2 = extractAmounts(str2);

  if (amounts1.length === 0 || amounts2.length === 0) return false;

  const set1 = new Set(amounts1);
  const set2 = new Set(amounts2);

  if (set1.size !== set2.size) return true;
  for (const amount of set1) {
    if (!set2.has(amount)) return true;
  }

  return false;
}

// Calculate Jaccard similarity between two strings based on word overlap
function calculateSimilarity(str1: string, str2: string): number {
  const words1 = new Set(
    str1.toLowerCase().split(/\s+/).filter(w => w.length > 2)
  );
  const words2 = new Set(
    str2.toLowerCase().split(/\s+/).filter(w => w.length > 2)
  );

  if (words1.size === 0 || words2.size === 0) return 0;

  const intersection = [...words1].filter(w => words2.has(w)).length;
  const union = new Set([...words1, ...words2]).size;

  return intersection / union;
}

// Check if a string is a substring of another
function isSubstringMatch(str1: string, str2: string): boolean {
  const norm1 = str1.toLowerCase().trim();
  const norm2 = str2.toLowerCase().trim();
  return norm1.includes(norm2) || norm2.includes(norm1);
}

// Deduplicate strings using fuzzy matching
function deduplicateStrings(items: string[]): string[] {
  const result: string[] = [];
  const SIMILARITY_THRESHOLD = 0.7;

  for (const item of items) {
    const trimmed = item.trim();
    if (trimmed.length === 0) continue;

    const isDuplicate = result.some(existing => {
      if (existing.toLowerCase() === trimmed.toLowerCase()) return true;
      if (hasDifferentAmounts(existing, trimmed)) return false;
      if (isSubstringMatch(existing, trimmed)) return true;
      if (calculateSimilarity(existing, trimmed) >= SIMILARITY_THRESHOLD) return true;
      return false;
    });

    if (!isDuplicate) {
      result.push(trimmed);
    }
  }

  return result;
}

// Start a crawl job and return the job ID (crawl only, no LLM extraction)
async function startCrawlJob(
  url: string,
  signal?: AbortSignal,
  onLog?: (message: string) => void
): Promise<string> {
  const log = (msg: string) => {
    console.log(msg);
    onLog?.(msg);
  };

  log(`[Firecrawl] Sending POST to ${FIRECRAWL_API_URL}/crawl for ${url}`);
  const response = await fetch(`${FIRECRAWL_API_URL}/crawl`, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${FIRECRAWL_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      url,
      limit: 8,
      includePaths: [
        "^/?$",              // Homepage
        ".*coupon.*",
        ".*special.*",
        ".*offer.*",
        ".*promot.*",        // promotion, promotions
        ".*discount.*",
        ".*deal.*",
        ".*pric.*",          // price, pricing
        ".*financ.*",        // finance, financing
        ".*rebate.*",
        ".*savings.*",
        ".*warranty.*",
        ".*guarantee.*",
      ],
      excludePaths: [
        "privacy.*",
        "terms.*",
        "legal-notice.*",
        "login.*",
        "account.*",
        "wp-admin.*",
        "careers.*",
      ],
      scrapeOptions: {
        formats: ["markdown"],  // Just get markdown content, no LLM extraction
        onlyMainContent: true,
      },
    }),
    signal,
  });

  if (!response.ok) {
    const errorText = await response.text();
    log(`[Firecrawl] API error ${response.status}: ${errorText}`);
    throw new Error(`Failed to start crawl: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  log(`[Firecrawl] API response for ${url}: success=${data.success}, id=${data.id || 'none'}`);
  if (!data.success || !data.id) {
    throw new Error(`Crawl start failed: ${JSON.stringify(data)}`);
  }

  return data.id;
}

// Poll for crawl completion
interface CrawlResult {
  status: string;
  data: Array<{
    markdown?: string;
    metadata?: {
      sourceURL?: string;
    };
  }>;
}

async function pollCrawlStatus(
  jobId: string,
  websiteUrl: string,
  businessName: string,
  maxWaitMs: number = 300000,
  onLog?: (message: string) => void,
  signal?: AbortSignal
): Promise<CrawlResult> {
  const startTime = Date.now();
  const pollInterval = 2000; // 2 seconds
  let lastLoggedStatus = "";

  const log = (msg: string) => {
    console.log(msg);
    onLog?.(msg);
  };

  while (Date.now() - startTime < maxWaitMs) {
    if (signal?.aborted) {
      throw new Error("Aborted");
    }

    const response = await fetch(`${FIRECRAWL_API_URL}/crawl/${jobId}`, {
      headers: {
        "Authorization": `Bearer ${FIRECRAWL_API_KEY}`,
      },
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to get crawl status: ${response.status} ${errorText}`);
    }

    const data = await response.json();

    // Log status changes and progress
    const statusMsg = `status=${data.status}, pages=${data.data?.length || 0}, total=${data.total || '?'}, completed=${data.completed || '?'}, creditsUsed=${data.creditsUsed || '?'}`;
    if (statusMsg !== lastLoggedStatus) {
      log(`[Firecrawl] [${businessName}] (${websiteUrl}) Poll ${jobId.slice(0, 8)}: ${statusMsg}`);
      lastLoggedStatus = statusMsg;
    }

    if (data.status === "completed") {
      log(`[Firecrawl] [${businessName}] (${websiteUrl}) Crawl completed. Credits used: ${data.creditsUsed || 'unknown'}, Pages: ${data.data?.length || 0}`);
      return data;
    } else if (data.status === "failed") {
      throw new Error(`Crawl failed for ${businessName} (${websiteUrl}): ${data.error || "Unknown error"}`);
    }

    // Wait before polling again with abort support
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(resolve, pollInterval);
      if (signal) {
        signal.addEventListener('abort', () => {
          clearTimeout(timeout);
          reject(new Error("Aborted"));
        }, { once: true });
      }
    });
  }

  throw new Error("Crawl timed out");
}

// Use OpenAI to extract promotions and highlights from crawled content
async function extractWithOpenAI(
  rawContent: string,
  businessName: string
): Promise<{ promotions: string[]; highlights: string[] }> {
  if (!OPENAI_API_KEY) {
    console.warn("[OpenAI] API key not configured, skipping extraction");
    return { promotions: [], highlights: [] };
  }

  if (!rawContent || rawContent.length === 0) {
    return { promotions: [], highlights: [] };
  }

  try {
    const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

    const systemMessage = `You are a precise extraction engine for business website information.

Your job is to extract promotions AND business highlights from website text and return them in JSON.

CRITICAL OUTPUT RULES
- Always respond with VALID JSON ONLY.
- The JSON MUST be an object with two arrays: {"promotions": [...], "highlights": [...]}
- Do NOT include any explanations, comments, or surrounding text.
- Do NOT wrap the JSON in markdown code fences.
- The response must be directly parseable by a JSON parser.
- Before responding, mentally double-check the JSON is valid.

If nothing found, return: {"promotions": [], "highlights": []}`;

    const prompt = `You are analyzing website content from the business "${businessName}" (home services or legal vertical).

<task>
Extract TWO categories of information:
1. PROMOTIONS: Discounts, special offers, free services, financial incentives
2. HIGHLIGHTS: Warranties, guarantees, fee structures, awards, credentials, certifications, callouts

Return them as a JSON object with "promotions" array first, then "highlights" array.
</task>

<promotions_include>
- Free services: free estimates, free quotes, free inspections, free consultations, free case evaluations, free tune-ups
- Percentage discounts (e.g., "10% off", "Save 20%")
- Dollar-off discounts (e.g., "$50 off", "$100 off")
- Senior, military, veteran, first responder, student, or new customer discounts
- "No fee unless you win", contingency-fee offers (legal)
- Financing, payment plans, 0% interest, rebates
- Seasonal specials, limited-time offers
- Waived fees or no fees (e.g., "No service call fee", "No trip charge", "No service fees", "No hidden fees")
- Bundled deals (e.g., "Tune-up + inspection for $99")
- Included extras (e.g., "Every repair includes a free tune-up")
</promotions_include>

<highlights_include>
- Warranties and guarantees (e.g., "5 year warranty", "Lifetime warranty", "Satisfaction guaranteed", "100% money-back guarantee")
- Fee/pricing structures (e.g., "Flat fee pricing", "Upfront pricing", "No hidden fees", "Transparent pricing", "No surprises")
- Service pricing - ANY specific prices or price ranges mentioned for services (e.g., "AC tune-up: $89", "Furnace repair starting at $150", "Diagnostic fee: $49", "Service call: $79", "Hourly rate: $95/hr", "Emergency service: $199", "Installation from $2,500")
- Awards and recognition - ANY awards mentioned (e.g., "Best of 2024", "Gold Winner", "Consumer Choice Award", "Top Rated", "60+ Awards Winner", newspaper/publication awards, local awards, industry awards)
- Credentials and certifications (e.g., "Licensed & Insured", "EPA Certified", "BBB A+ Rating", "NATE Certified")
- Service availability (e.g., "24/7 emergency service", "24/7 availability", "Same day service", "Quick response")
- Business stats/callouts (e.g., "Family owned since 1985", "Locally-owned & Operated", "25+ years experience")
</highlights_include>

<what_to_exclude>
- General service descriptions (e.g., "We handle personal injury cases", "We install furnaces")
- Generic quality claims (e.g., "Affordable pricing", "High-quality service", "Experienced, certified technicians")
- Navigation, footer, header text
- Blog/FAQ content without concrete offers or claims
- Generic calls to action without incentive
- Review counts, ratings, or review statistics (e.g., "10,000+ 5-star reviews", "92.9% 5-star rating", "2823 five-star reviews", "Rating snapshot") - we get this data elsewhere
- Headers/titles that mention coupons or deals but don't list actual specifics (e.g., "Exclusive heating and cooling coupons available", "Current HVAC deals and special offers") - only include if actual coupon codes, dollar amounts, or percentages are specified
- Vague guarantee statements without concrete details (e.g., "We Value Your Home Guarantee", "We Value Your Safety Guarantee", "We Value Your Time Guarantee", "We Value Your Satisfaction Guarantee") - only include guarantees with specific commitments
- License numbers (e.g., "License #36081TACLA57826E")
- Individual employee bios or credentials (e.g., "Division led by Tony Shepherd who holds an Associate of Applied Science") - only include company-level awards and recognition, not individual staff info
</what_to_exclude>

<formatting_rules>
- Each item must be a short, clear statement UNDER 50 WORDS
- Remove duplicates - keep the clearest version
- Do NOT invent or infer information not explicitly stated
- Each string should stand alone without context
</formatting_rules>

<context>
Website content:
${rawContent}
</context>

<output>
Return ONLY a JSON object:
{"promotions": ["...", "..."], "highlights": ["...", "..."]}

Example:
{"promotions": ["Free initial consultation", "10% senior discount"], "highlights": ["5 year warranty on all repairs", "BBB A+ Rating", "Flat fee pricing"]}
</output>`;

    const response = await openai.chat.completions.create({
      model: "gpt-5-mini",
      messages: [
        {
          role: "developer",
          content: systemMessage,
        },
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const content = response.choices[0]?.message?.content?.trim();
    if (!content) {
      console.warn("[OpenAI] Empty response");
      return { promotions: [], highlights: [] };
    }

    // Parse the JSON response
    try {
      // Handle potential markdown code blocks
      let jsonContent = content;
      if (content.startsWith("```")) {
        jsonContent = content.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
      }

      const parsed = JSON.parse(jsonContent);

      // Handle expected format: {promotions: [], highlights: []}
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const promotions = Array.isArray(parsed.promotions) ? parsed.promotions : [];
        const highlights = Array.isArray(parsed.highlights) ? parsed.highlights : [];
        console.log(`[OpenAI] Extracted ${promotions.length} promotions + ${highlights.length} highlights for ${businessName}`);
        return { promotions, highlights };
      }

      // Fallback: handle old format (plain array) for backwards compatibility
      if (Array.isArray(parsed)) {
        console.log(`[OpenAI] Extracted ${parsed.length} items (legacy format) for ${businessName}`);
        return { promotions: parsed, highlights: [] };
      }
    } catch (parseError) {
      console.warn("[OpenAI] Failed to parse response as JSON:", content);
    }

    return { promotions: [], highlights: [] };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("[OpenAI] Error extracting call outs:", errorMessage);
    return { promotions: [], highlights: [] };
  }
}

export async function fetchPromotionsWithFirecrawl(
  websiteUrl: string,
  businessName: string,
  onLog?: (message: string) => void,
  signal?: AbortSignal
): Promise<PromotionsResult> {
  const todayISO = new Date().toISOString().split("T")[0];
  const cleanedWebsiteUrl = stripToRootDomain(websiteUrl);

  if (signal?.aborted) {
    return {
      promotions: [],
      websiteStatus: "Crawl aborted",
      dataVerificationDate: todayISO,
    };
  }

  if (!FIRECRAWL_API_KEY) {
    console.warn("[Firecrawl] API key not configured");
    return {
      promotions: [],
      websiteStatus: "Firecrawl API key not configured",
      dataVerificationDate: todayISO,
    };
  }

  let crawlJobId: string | undefined;

  // Helper to log to both console and client
  const log = (msg: string) => {
    console.log(msg);
    onLog?.(msg);
  };

  try {
    log(`[Firecrawl] Queuing crawl for ${businessName} at ${cleanedWebsiteUrl}...`);

    // Use concurrency limiter to avoid hitting Firecrawl's rate limits
    const result = await withCrawlConcurrencyLimit(async () => {
      // Start the crawl job
      let jobId: string;
      try {
        jobId = await startCrawlJob(cleanedWebsiteUrl, signal, onLog);
      } catch (startError: unknown) {
        const errorMsg = startError instanceof Error ? startError.message : "Unknown error";
        log(`[Firecrawl] Failed to start crawl for ${businessName}: ${errorMsg}`);
        throw startError;
      }
      crawlJobId = jobId;  // Capture for return value
      log(`[Firecrawl] Crawl job started for ${businessName}, job ID: ${jobId}`);

      // Poll for completion
      return await pollCrawlStatus(jobId, cleanedWebsiteUrl, businessName, 300000, onLog, signal);
    }, signal, onLog);
    const pageCount = result.data?.length || 0;
    log(`[Firecrawl] Crawl completed for ${businessName} (job: ${crawlJobId}), found ${pageCount} pages`);

    // Collect all markdown content from crawled pages
    const allContent: string[] = [];

    if (result.data && Array.isArray(result.data)) {
      for (const page of result.data) {
        if (page.markdown) {
          // Clean up the content
          const cleanedContent = page.markdown
            // Remove markdown image syntax ![alt](url)
            .replace(/!\[.*?\]\(.*?\)/g, '')
            // Convert markdown links [text](url) to just text
            .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
            // Remove raw URLs
            .replace(/https?:\/\/[^\s)]+/g, '')
            // Remove data URIs
            .replace(/data:[^,]+,[^\s)]+/g, '')
            // Split into lines
            .split(/[\n\r]+/)
            .map((line: string) => line.trim())
            // Filter by length
            .filter((line: string) => line.length >= 15 && line.length <= 500)
            // Remove duplicate lines
            .filter((line: string, index: number, arr: string[]) => arr.indexOf(line) === index)
            .join('\n');

          if (cleanedContent) {
            allContent.push(cleanedContent);
          }
        }
      }
    }

    // Combine all content and truncate to avoid token limits
    const combinedContent = allContent.join('\n\n').slice(0, 15000);
    log(`[Firecrawl] Collected ${combinedContent.length} chars of content for ${businessName} (job: ${crawlJobId})`);

    // Use OpenAI to extract promotions and highlights
    const extracted = await extractWithOpenAI(combinedContent, businessName);

    // Deduplicate across all pages
    const uniquePromotions = deduplicateStrings(extracted.promotions);
    const uniqueHighlights = deduplicateStrings(extracted.highlights);

    // Combine: promotions first, then highlights
    const combined = [...uniquePromotions, ...uniqueHighlights];

    log(
      `[Firecrawl] Final result for ${businessName} (job: ${crawlJobId}): ${uniquePromotions.length} promotions + ${uniqueHighlights.length} highlights`
    );

    return {
      promotions: combined,
      websiteStatus: "Successfully crawled",
      dataVerificationDate: todayISO,
      crawlJobId,
    };
  } catch (error: unknown) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    // Handle abort gracefully
    if (errorMessage === "Aborted" || signal?.aborted) {
      log(`[Firecrawl] Crawl aborted for ${businessName} (job: ${crawlJobId || 'none'})`);
      return {
        promotions: [],
        websiteStatus: "Crawl aborted",
        dataVerificationDate: todayISO,
        crawlJobId,
      };
    }

    log(`[Firecrawl] Error crawling ${cleanedWebsiteUrl} (job: ${crawlJobId || 'none'}): ${errorMessage}`);
    return {
      promotions: [],
      websiteStatus: `Crawl failed: ${errorMessage}`,
      dataVerificationDate: todayISO,
      crawlJobId,
    };
  }
}

// Keep the old function name as an alias for backwards compatibility
export const fetchPromotionsWithTavily = fetchPromotionsWithFirecrawl;

// Also export the result type with the old name for backwards compatibility
export type TavilyPromotionsResult = PromotionsResult;
