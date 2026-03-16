import {genkit} from 'genkit';
import {googleAI} from '@genkit-ai/googleai';
// import {openai} from '@genkit-ai/openai'; // Removed import

export const ai = genkit({
  plugins: [
    googleAI(),
    // openai({apiKey: process.env.OPENAI_API_KEY}), // Removed OpenAI plugin
  ],
  model: 'googleai/gemini-2.0-flash', // Default model
});
