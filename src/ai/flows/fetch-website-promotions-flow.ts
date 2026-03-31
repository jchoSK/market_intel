import { ai } from '../genkit';
import { z } from 'genkit';

export const fetchWebsitePromotionsFlow = ai.defineFlow(
  {
    name: 'fetchWebsitePromotions',
    inputSchema: z.object({
      businessName: z.string(),
      businessWebsite: z.string().optional(),
    }),
    outputSchema: z.string(),
  },
  async (input) => {
    const { businessName, businessWebsite } = input;

    if (!businessWebsite) {
      return 'WEBSITE_STATUS: No website available\nNO_PROMOTIONS_FOUND';
    }

    const verificationDateString = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const response = await ai.generate({
      model: 'googleai/gemini-2.0-flash',
      system: `
You are an expert web researcher. Your primary task is to scrape the provided business website to find the most up-to-date promotions.

Please follow these instructions very carefully:

1.  **Website Access & Analysis:**
    *   Navigate to the provided Website URL. Carefully note any URL or location-specific subpages if they are relevant to finding promotions.
    *   Thoroughly analyze both text content and images on the website to identify all current promotions.
    *   Ensure you include all distinct promotions found.

2.  **Information Currency (Self-Verification):**
    *   Crucially, before providing any output, you MUST perform a self-verification step. Confirm that the promotions you are about to list are actively visible and valid on the business's website as of today, ${verificationDateString}.
    *   If you cannot verify the currency of a specific promotion for today's date, do not include it.

3.  **Strict Output Format:**
    *   You MUST present your findings using the exact plain text format specified below.
    *   Do not include any introductory remarks, apologies, or any conversational text outside of this defined structure. Your entire response must be the structured output.

    **Output Structure:**

    WEBSITE_STATUS: [Indicate status: Successfully Analyzed / No website available / Analysis failed - provide brief reason if failed / URL specific subpages noted: <details if any, or "None noted">]
    DATA_VERIFICATION_DATE: ${verificationDateString}

    PROMOTIONS_SECTION_START
    PROMOTION_ITEM: [Full description of promotion 1 found on the website]
    PROMOTION_ITEM: [Full description of promotion 2 found on the website]
    ... (List each distinct, verified promotion on a new line with the "PROMOTION_ITEM:" prefix)
    NO_PROMOTIONS_FOUND (Use this exact line if no promotions are found or verifiable for today's date)
    PROMOTIONS_SECTION_END

    **Reasoning/Tools:**
    - tools: search, read_url, browse
      `,
      prompt: `
Business Name: ${businessName}
Website URL: ${businessWebsite}
      `,
    });

    return response.text;
  }
);
