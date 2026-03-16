'use server';
/**
 * @fileOverview A consolidated AI agent to research business details.
 *
 * - researchBusiness - A function that handles the research process.
 * - ResearchInput - The input type for the research function.
 * - ResearchOutput - The return type for the research function.
 */

import { ai } from '@/ai/genkit';
import { z } from 'genkit';

const ResearchInputSchema = z.object({
  businessName: z.string().describe('The name of the business to research.'),
  location: z.string().describe('The location of the business.'),
});
export type ResearchInput = z.infer<typeof ResearchInputSchema>;

const ResearchOutputSchema = z.object({
  owner: z.string().optional().describe('The name of the business owner or key executives.'),
  employeeCount: z.string().optional().describe('Estimated number of employees.'),
  revenue: z.string().optional().describe('Estimated annual revenue.'),
  brands: z.array(z.string()).optional().describe('List of major brands or products they carry/service.'),
  promotions: z.array(z.string()).optional().describe('Current promotions or special offers found on their website/online presence.'),
  isResidential: z.boolean().optional().describe('Whether the location appears to be a residential address.'),
  adsInfo: z.object({
    isRunningAds: z.boolean().nullable().describe('Whether they are currently running Google Ads.'),
    adType: z.string().nullable().describe('The type of ads or "Google Ads" if active.'),
  }).optional(),
});
export type ResearchOutput = z.infer<typeof ResearchOutputSchema>;

const prompt = ai.definePrompt({
  name: 'marketResearchPrompt',
  input: { schema: ResearchInputSchema },
  output: { schema: ResearchOutputSchema },
  prompt: `You are an expert market researcher for SearchKings. 
Your goal is to find detailed information about the following business:

Business Name: {{{businessName}}}
Location: {{{location}}}

Use your internal knowledge and search capabilities to identify:
1. The likely owner or key executives.
2. Estimated size (employees/revenue).
3. Brands they carry (e.g., for HVAC: Trane, Lennox, etc.).
4. Any active promotions they are advertising.
5. Whether their address is likely residential or a commercial storefront.
6. Whether they are actively running Google Ads.

Be as specific as possible. If unsure about a field, leave it out or mark as "Not Available".`,
});

export async function researchBusiness(input: ResearchInput): Promise<ResearchOutput> {
  try {
    const { output } = await prompt(input);
    return output!;
  } catch (error) {
    console.error(`[AI Research Error] for ${input.businessName}:`, error);
    return {
      owner: 'Not Available',
      employeeCount: 'Not Available',
      revenue: 'Not Available',
      brands: [],
      promotions: [],
      isResidential: undefined,
      adsInfo: { isRunningAds: null, adType: 'Research error' },
    };
  }
}
