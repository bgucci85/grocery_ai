import OpenAI from "openai";

export interface ParsedQuery {
  productName: string;        // Core product name to search for
  desiredQuantity?: string;    // Original quantity string (e.g., "2kg", "10 vnt")
  searchVariations: string[];  // Multiple search terms to try
  quantityHints: string[];     // Patterns to look for in product titles
}

/**
 * Use AI to intelligently parse a grocery query into searchable parts
 */
export async function parseGroceryQuery(query: string): Promise<ParsedQuery> {
  // Default fallback - just use the query as-is
  const fallback: ParsedQuery = {
    productName: query,
    searchVariations: [query],
    quantityHints: [],
  };

  if (!process.env.OPENAI_API_KEY) {
    return fallback;
  }

  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const prompt = `You are a grocery shopping assistant for Lithuanian/English grocery stores (Barbora, Rimi).

Parse this grocery query: "${query}"

Extract:
1. Product name (just the item, without quantity/weight)
2. Desired quantity (if mentioned, e.g., "2kg", "10 vnt", "1L")
3. Alternative search terms (3-5 variations that might find this product)
4. Quantity patterns to look for in product titles (e.g., ["2kg", "2 kg", "2 kilogram"])

Respond ONLY with valid JSON, no markdown:
{
  "productName": "string",
  "desiredQuantity": "string or null",
  "searchVariations": ["string", "string", ...],
  "quantityHints": ["string", "string", ...]
}

Examples:
Query: "apelsinai 2kg"
Response: {"productName":"apelsinai","desiredQuantity":"2kg","searchVariations":["apelsinai","oranges","apelsinai 2kg"],"quantityHints":["2kg","2 kg","2kg"]}

Query: "kiausiniai 10 vnt"
Response: {"productName":"kiausiniai","desiredQuantity":"10 vnt","searchVariations":["kiausiniai","eggs","kiaušiniai 10"],"quantityHints":["10 vnt","10vnt","10 pack","10-pack"]}

Now parse: "${query}"`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that parses grocery queries. Respond only with JSON.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0,
      response_format: { type: "json_object" },
    });

    const result = response.choices[0]?.message?.content;
    if (!result) {
      return fallback;
    }

    const parsed = JSON.parse(result) as ParsedQuery;
    
    // Validate the response
    if (!parsed.productName || !Array.isArray(parsed.searchVariations)) {
      return fallback;
    }

    return parsed;
  } catch (error) {
    console.error("Error parsing query with AI:", error);
    return fallback;
  }
}

/**
 * Check if a product title matches the desired quantity
 */
export function matchesQuantity(
  productTitle: string,
  quantityHints: string[]
): boolean {
  if (!quantityHints || quantityHints.length === 0) {
    return true; // No quantity requirements
  }

  const titleLower = productTitle.toLowerCase();
  
  // Check if any quantity hint appears in the title
  for (const hint of quantityHints) {
    if (titleLower.includes(hint.toLowerCase())) {
      return true;
    }
  }

  return false;
}

/**
 * Score products based on how well they match the query
 */
export function scoreProduct(
  productTitle: string,
  parsedQuery: ParsedQuery,
  baseScore: number
): number {
  let score = baseScore;

  // Boost if quantity matches exactly
  if (parsedQuery.quantityHints && parsedQuery.quantityHints.length > 0) {
    if (matchesQuantity(productTitle, parsedQuery.quantityHints)) {
      score += 0.3; // Significant boost for exact quantity match
    } else if (parsedQuery.desiredQuantity) {
      // Check if it's a divisible quantity (e.g., want 2kg, found 1kg)
      const matches = canFulfillQuantity(productTitle, parsedQuery.desiredQuantity);
      if (matches) {
        score += 0.15; // Moderate boost for compatible quantity
      }
    }
  }

  // Boost if product name appears prominently
  const titleLower = productTitle.toLowerCase();
  const productNameLower = parsedQuery.productName.toLowerCase();
  
  if (titleLower.startsWith(productNameLower)) {
    score += 0.1; // Bonus for starting with product name
  }

  return Math.min(score, 1.0); // Cap at 1.0
}

/**
 * Check if product can fulfill the desired quantity
 * E.g., want "2kg", product is "1kg" → can buy 2 units
 */
export function canFulfillQuantity(productTitle: string, desiredQuantity: string): boolean {
  // Extract numbers from desired quantity and product title
  const desiredMatch = desiredQuantity.match(/(\d+(?:\.\d+)?)\s*(kg|g|l|ml|vnt|pack)/i);
  if (!desiredMatch) return false;
  
  const desiredAmount = parseFloat(desiredMatch[1]);
  const desiredUnit = desiredMatch[2].toLowerCase();
  
  // Look for quantity in product title
  const productMatch = productTitle.match(/(\d+(?:\.\d+)?)\s*(kg|g|l|ml|vnt|pack)/i);
  if (!productMatch) return false;
  
  const productAmount = parseFloat(productMatch[1]);
  const productUnit = productMatch[2].toLowerCase();
  
  // Units must match (or be compatible)
  if (desiredUnit !== productUnit) {
    // Check for kg/g conversion
    if ((desiredUnit === 'kg' && productUnit === 'g') || (desiredUnit === 'g' && productUnit === 'kg')) {
      // Compatible but different scale
      return true;
    }
    return false;
  }
  
  // Check if desired amount is a multiple of product amount
  if (desiredAmount >= productAmount && desiredAmount % productAmount === 0) {
    return true; // Can buy multiple units
  }
  
  // Check if they're close enough (within 10%)
  const ratio = desiredAmount / productAmount;
  if (ratio >= 0.9 && ratio <= 1.1) {
    return true;
  }
  
  return false;
}

