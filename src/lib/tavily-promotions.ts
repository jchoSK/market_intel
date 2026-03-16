"use server";

import { tavily } from "@tavily/core";
import OpenAI from "openai";

const TAVILY_API_KEY = process.env.TAVILY_API_KEY;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

export interface TavilyPromotionsResult {
  promotions: string[];
  websiteStatus: string;
  dataVerificationDate: string;
}


function stripToRootDomain(url: string): string {
  try {
    const parsed = new URL(url);
    // Keep only the origin (protocol + host, preserves subdomains)
    // Strips both query parameters and page paths
    return parsed.origin + "/";
  } catch {
    return url; // Return original if parsing fails
  }
}

export async function fetchPromotionsWithTavily(
  websiteUrl: string,
  businessName: string
): Promise<TavilyPromotionsResult> {
  const todayISO = new Date().toISOString().split("T")[0];

  // Clean the URL: strip query params and paths, keep only root domain (preserves subdomains)
  const cleanedWebsiteUrl = stripToRootDomain(websiteUrl);

  if (!TAVILY_API_KEY) {
    console.warn("[Tavily] API key not configured");
    return {
      promotions: [],
      websiteStatus: "Tavily API key not configured",
      dataVerificationDate: todayISO,
    };
  }

  try {
    const client = tavily({ apiKey: TAVILY_API_KEY });

    console.log(`[Tavily] Crawling ${cleanedWebsiteUrl} for call outs...`);

    const result = await client.crawl(cleanedWebsiteUrl, {
      // Navigation: Wide but shallow
      maxDepth: 2,
      maxBreadth: 25,
      limit: 40,

      // Extraction: Cost-effective
      extractDepth: "basic",
      format: "markdown",
      allowExternal: false,

      // Exclude low-value pages
      excludePaths: [
        "/privacy.*",
        "/terms.*",
        "/legal-notice.*",
        "/login.*",
        "/account.*",
        "/wp-admin.*",
        "/careers.*",
      ],

      // Instructions: Max 400 chars per Tavily API limit
      instructions: "Extract ALL: offers, deals, discounts, coupons, financing, free anything, no fees, pricing info, warranties, guarantees, awards, certifications, credentials, licenses, availability, response time, years in business, family/locally owned, and any unique selling points or claims."
    });

    console.log(`[Tavily] Crawl completed for ${businessName}, found ${result.results?.length || 0} pages`);

    // Collect all raw content from crawled pages
    const allRawContent: string[] = [];

    if (result && result.results && Array.isArray(result.results)) {
      for (const item of result.results) {
        if (item.rawContent) {
          // Clean up the content - remove noise and extract meaningful text
          const cleanedContent = item.rawContent
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
            allRawContent.push(cleanedContent);
          }
        }
      }
    }

    // Combine all content and truncate to avoid token limits
    const combinedContent = allRawContent.join('\n\n').slice(0, 15000);

    console.log(`[Tavily] Extracted ${combinedContent.length} chars of content for ${businessName}`);

    // Use OpenAI to extract and clean promotions from raw content
    const cleanedPromotions = await cleanPromotionsWithOpenAI(combinedContent, businessName);

    console.log(`[Tavily] Final ${cleanedPromotions.length} call outs for ${businessName}`);

    return {
      promotions: cleanedPromotions,
      websiteStatus: "Successfully crawled",
      dataVerificationDate: todayISO,
    };
  } catch (error: any) {
    console.error(`[Tavily] Error crawling ${cleanedWebsiteUrl}:`, error);
    return {
      promotions: [],
      websiteStatus: `Crawl failed: ${error.message || "Unknown error"}`,
      dataVerificationDate: todayISO,
    };
  }
}

// Use OpenAI to extract and summarize promotions from raw website content
async function cleanPromotionsWithOpenAI(
  rawContent: string,
  businessName: string
): Promise<string[]> {
  if (!OPENAI_API_KEY) {
    console.warn("[OpenAI] API key not configured, skipping extraction");
    return [];
  }

  if (!rawContent || rawContent.length === 0) {
    return [];
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
      return [];
    }

    // Parse the JSON response
    try {
      // Handle potential markdown code blocks
      let jsonContent = content;
      if (content.startsWith("```")) {
        jsonContent = content.replace(/```json?\n?/g, "").replace(/```/g, "").trim();
      }

      const parsed = JSON.parse(jsonContent);

      // Handle new format: {promotions: [], highlights: []}
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const promotions = Array.isArray(parsed.promotions) ? parsed.promotions : [];
        const highlights = Array.isArray(parsed.highlights) ? parsed.highlights : [];

        // Combine: promotions first, then highlights
        const combined = [...promotions, ...highlights];
        console.log(`[OpenAI] Extracted ${promotions.length} promotions + ${highlights.length} highlights for ${businessName}`);
        return combined;
      }

      // Fallback: handle old format (plain array) for backwards compatibility
      if (Array.isArray(parsed)) {
        console.log(`[OpenAI] Extracted ${parsed.length} items (legacy format) for ${businessName}`);
        return parsed;
      }
    } catch (parseError) {
      console.warn("[OpenAI] Failed to parse response as JSON:", content);
    }

    return [];
  } catch (error: any) {
    console.error("[OpenAI] Error extracting call outs:", error.message);
    return [];
  }
}
