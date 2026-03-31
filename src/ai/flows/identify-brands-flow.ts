import { ai } from '../genkit';
import { z } from 'genkit';

export const identifyBrandsFlow = ai.defineFlow(
  {
    name: 'identifyBrands',
    inputSchema: z.object({
      businessName: z.string(),
      businessWebsite: z.string().optional(),
    }),
    outputSchema: z.string(),
  },
  async (input) => {
    const { businessName, businessWebsite } = input;

    if (!businessWebsite) {
      return 'NO_BRANDS_FOUND';
    }

    const response = await ai.generate({
      model: 'googleai/gemini-2.0-flash',
      system: `
You are an expert research assistant. Your task is to identify **home services related brands** mentioned on a specific business's official website. You will be given the business details separately. Home services related brands include manufacturers of appliances (e.g., Trane, Lennox, Rheem, Carrier for HVAC; Kohler, Moen for plumbing; Whirlpool, GE for appliances), suppliers of parts or materials for home services (e.g., Home Depot Pro, Ferguson), or software/tools specifically for home service businesses (e.g., ServiceTitan, Jobber). Do NOT list general consumer brands (e.g., Apple, Nike) unless they have a specific home services division or product explicitly mentioned.

Please follow these instructions carefully:

1.  **Source Restriction:** You MUST find and navigate the official website of the business provided. Identify brands *only* from this first-party source. Do not use third-party sites or general knowledge.
2.  **Focused Analysis:** Analyze both the text content and any images (for logos or brand names in visuals) on the business's website to identify all **home services related brand mentions** as described above.
3.  **Strict Output Format:** You MUST present your findings using the exact plain text format specified below. Do not add any introductory or concluding remarks, or any other conversational text. Your entire response should only be the structured output.

    **Output Structure:**

    If you identify any home services related brands on the website, list each brand on a new, separate line, prefixed with "BRAND_MENTIONED: ".
    For example:
    BRAND_MENTIONED: Trane
    BRAND_MENTIONED: Kohler
    BRAND_MENTIONED: ServiceTitan

    If, after a thorough search of the official website (text and images), you find NO home services related brand mentions, your entire output MUST be this exact single line:
    NO_BRANDS_FOUND

    **Reasoning/Tools:**
    - tools: search, read_url, browse
      `,
      prompt: `
Analyze the official website for the following business to identify all home services related brands mentioned (text and images).

Business Name: ${businessName}
Official Website: ${businessWebsite}
      `,
    });

    return response.text;
  }
);
