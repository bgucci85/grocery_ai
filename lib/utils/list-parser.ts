import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY || "",
});

export interface ParsedItem {
  description: string;
  quantity: number;
  alternatives: Array<{ type: "url" | "query"; value: string }>;
}

/**
 * Use GPT-4o to parse a grocery list into structured items
 * Handles complex formats like:
 * - "2 vnt item arba URL arba another item"
 * - "* 1500-2200 g item"
 * - Mixed URLs and queries with "arba"
 */
export async function parseGroceryList(
  rawText: string
): Promise<ParsedItem[]> {
  if (!rawText.trim()) {
    console.log("[list-parser] Empty input, returning empty array");
    return [];
  }

  if (!process.env.OPENAI_API_KEY) {
    console.error("[list-parser] OPENAI_API_KEY not set!");
    throw new Error("OPENAI_API_KEY is required for list parsing");
  }

  const prompt = `You are a grocery list parser. Parse the following grocery list into structured items.

INPUT LIST:
${rawText}

RULES:
1. Each line is one item (may have multiple alternatives separated by "arba" which means "or")
2. Quantity is usually at the start: "2 vnt", "1500-2200 g", "3 kg", etc.
3. If no quantity specified, default to 1
4. For ranges like "1500-2200 g", extract the middle value (e.g., 1850g) and let the AI agent handle it
5. "arba" means "or" - these are alternatives to try in order
6. URLs starting with http are product links
7. Everything else is a search query/description
8. Remove bullet points (*, -, •)

OUTPUT FORMAT (JSON object with items array):
{
  "items": [
    {
      "description": "Brief description of what they want (for logging)",
      "quantity": 2,
      "alternatives": [
        { "type": "query", "value": "duonelės skrudinti FAZER STREET FOOD, 330 g" },
        { "type": "url", "value": "https://barbora.lt/..." },
        { "type": "query", "value": "another alternative" }
      ]
    }
  ]
}

IMPORTANT:
- The "quantity" field is how many units they want (regardless of alternatives)
- Each alternative should NOT include the quantity prefix (we've extracted it already)
- For ranges like "1500-2200 g", include that in the query description so the AI agent can reason about it

Parse the list now:`;

  try {
    console.log("[list-parser] Sending to GPT-4o:", rawText.substring(0, 100));
    
    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content:
            "You are a grocery list parser. Return valid JSON only, no markdown formatting. Always return an object with 'items' array.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0].message.content || "{}";
    console.log("[list-parser] GPT-4o response:", content.substring(0, 200));
    
    const result = JSON.parse(content);

    // Handle both { items: [...] } and direct array formats
    const items = Array.isArray(result) ? result : result.items || [];
    
    console.log(`[list-parser] Parsed ${items.length} items`);

    return items.map((item: any) => ({
      description: item.description || "Unknown item",
      quantity: item.quantity || 1,
      alternatives: item.alternatives || [],
    }));
  } catch (error) {
    console.error("Error parsing grocery list with AI:", error);
    throw new Error(`Failed to parse grocery list: ${error}`);
  }
}

