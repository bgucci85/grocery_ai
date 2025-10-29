import OpenAI from "openai";

export interface ProductCandidate {
  title: string;
  price?: string;
}

/**
 * Use OpenAI to pick the best matching product from candidates
 */
export async function pickBestWithAI(
  query: string,
  candidates: ProductCandidate[]
): Promise<number> {
  // Fallback: return 0 if no API key
  if (!process.env.OPENAI_API_KEY) {
    return 0;
  }

  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const candidatesList = candidates
      .map((c, idx) => `${idx}. ${c.title}${c.price ? ` - ${c.price}` : ""}`)
      .join("\n");

    const prompt = `You are helping select the best grocery product match for a Lithuanian/English query.

Query: "${query}"

Available products:
${candidatesList}

Select the best match considering:
- Product name similarity
- Correct weight/volume/quantity mentioned
- Common sense (e.g., "2kg" in query should match "2kg" or "2 kg" in product title)

Respond with ONLY the index number (0-${candidates.length - 1}). No explanation.`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that selects the best product match. Respond only with a number.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0,
      max_tokens: 10,
    });

    const result = response.choices[0]?.message?.content?.trim() || "0";
    const index = parseInt(result, 10);

    if (isNaN(index) || index < 0 || index >= candidates.length) {
      return 0;
    }

    return index;
  } catch (error) {
    console.error("OpenAI error:", error);
    return 0; // Fallback to first item
  }
}

