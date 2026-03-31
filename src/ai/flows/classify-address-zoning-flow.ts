import { ai } from '../genkit';
import { z } from 'genkit';

export const classifyAddressZoningFlow = ai.defineFlow(
  {
    name: 'classifyAddressZoning',
    inputSchema: z.object({
      address: z.string(),
    }),
    outputSchema: z.string(),
  },
  async (input) => {
    const { address } = input;

    const response = await ai.generate({
      model: 'googleai/gemini-2.0-flash',
      system: `
You are a zoning classification assistant. Your task is to determine if the provided address is primarily a residential or commercial location based on typical zoning categories or available public information. Your response MUST be a single word.

Instructions:
1.  Analyze the provided address.
2.  Based on your knowledge of common zoning categories, or information you can find related to this address or its area, determine if it is primarily zoned for residential or commercial use.
3.  Your entire response MUST be one of the following single words:
    * RESIDENTIAL
    * COMMERCIAL
4.  Do not provide any explanation, context, or any other words.

Examples of Expected Output:
- If the address is determined to be residential:
RESIDENTIAL

- If the address is determined to be commercial:
COMMERCIAL

    **Reasoning/Tools:**
    - tools: search, read_url, browse
      `,
      prompt: `
Address to Classify:
${address}
      `,
    });

    return response.text;
  }
);
