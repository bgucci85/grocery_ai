import OpenAI from "openai";
import { ProductCard } from "../utils/selectors";
import { LogSink } from "../utils/log";

export interface AgentSelection {
  selectedIndex: number;
  quantity: number;
  reasoning: string;
  confidence: number;
}

/**
 * Use LLM agent to intelligently select the best product from search results
 * The agent understands semantic equivalence, quantity matching, and can suggest substitutions
 */
export async function selectProductWithAgent(
  query: string,
  products: ProductCard[],
  log: LogSink,
  desiredQuantity?: number
): Promise<AgentSelection | null> {
  
  if (!process.env.OPENAI_API_KEY) {
    log.warn("OpenAI API key not found, cannot use agent");
    return null;
  }

  if (products.length === 0) {
    log.warn("No products to analyze");
    return null;
  }

  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    // Build product list for the agent
    const productList = products
      .map((p, i) => `${i}. ${p.title}${p.price ? ` - ${p.price}` : ''}`)
      .join('\n');

    const quantityNote = desiredQuantity && desiredQuantity > 1 
      ? `\n**IMPORTANT: User wants ${desiredQuantity} of these items!**\n` 
      : '';

    const prompt = `You are an expert grocery shopping assistant for Lithuanian grocery stores (Barbora, Rimi).

**User's Query:** "${query}"${quantityNote}

**Available Products:**
${productList}

**Your Task:**
Analyze these products and select the BEST match for the user's query. Use your understanding of:

1. **Semantic Equivalence**
   - "apelsinai" = "dideli apelsinai" = "oranžiniai apelsinai" = "oranges"
   - "kiaušiniai" = "kiaušiniai M" = "eggs"
   - Size/type variations are the SAME product (large, small, organic, etc.)

2. **Quantity Intelligence**
   ${desiredQuantity ? `- User wants ${desiredQuantity} units of this product (already specified)
   - For single items (eggs, bread): return quantity: ${desiredQuantity}
   - For weight-based items: if quantity matches exactly, use ${desiredQuantity}` : `- Extract desired quantity from query (e.g., "2kg", "10 vnt", "1L")
   - If user wants 2kg and product is 1kg → return quantity: 2
   - If user wants 10 eggs and product is 10-pack → return quantity: 1`}
   - Calculate the right number of units needed

3. **Out of Stock & Substitutions**
   - If exact match appears out of stock, choose similar alternative
   - Prefer same brand/quality tier when substituting
   - Larger size is usually better than smaller (user can use extra)

4. **Common Sense**
   - Prefer reasonably priced options (not the most expensive)
   - Match the user's likely intent (they want to EAT the food)
   - If query is vague, pick the most popular/standard option

5. **Lithuanian Language**
   - Understand Lithuanian product names and quantities
   - "d." or "dienų" = days (for expiry)
   - "vnt" = units
   - "kg" = kilograms
   - "g" = grams

**Respond with JSON only:**
{
  "selectedIndex": <number 0-${products.length - 1}, or -1 if NO suitable product>,
  "quantity": <integer, how many units to add to cart>,
  "reasoning": "<explain your choice in 1-2 sentences>",
  "confidence": <float 0.0-1.0, how confident you are>
}

**Example:**
User wants "apelsinai 2kg", you see:
0. Dideli apelsinai, 1 kg - 2,29 €
1. Ekologiški apelsinai, 500 g - 3,69 €
2. Obuoliai JONAGOLD, 1 kg - 1,79 €

Response:
{
  "selectedIndex": 0,
  "quantity": 2,
  "reasoning": "User wants 2kg of oranges. Product 0 is 'Dideli apelsinai' (large oranges) at 1kg each. 'Dideli apelsinai' is just a size variant of 'apelsinai'. Need 2 units to fulfill 2kg. Product 2 is apples, not oranges.",
  "confidence": 0.95
}

Now analyze the products above and respond with JSON only.`;

    log.info(`[Agent] Analyzing ${products.length} products with GPT-4o...`);

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a helpful grocery shopping assistant. Respond only with valid JSON."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.1, // Low temperature for consistent decisions
      response_format: { type: "json_object" }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      log.error("[Agent] No response from AI");
      return null;
    }

    const result: AgentSelection = JSON.parse(content);

    // Validate response
    if (typeof result.selectedIndex !== 'number' || 
        typeof result.quantity !== 'number' ||
        typeof result.confidence !== 'number') {
      log.error("[Agent] Invalid response format from AI");
      return null;
    }

    // Check if agent found a match
    if (result.selectedIndex === -1) {
      log.warn(`[Agent] No suitable product found: ${result.reasoning}`);
      return null;
    }

    // Validate index
    if (result.selectedIndex < 0 || result.selectedIndex >= products.length) {
      log.error(`[Agent] Invalid product index: ${result.selectedIndex}`);
      return null;
    }

    // Validate quantity
    if (result.quantity < 1) {
      log.warn(`[Agent] Invalid quantity ${result.quantity}, setting to 1`);
      result.quantity = 1;
    }

    // Log agent's decision
    log.info(`[Agent] ✓ Selected: "${products[result.selectedIndex].title}"`);
    log.info(`[Agent] Quantity: ${result.quantity} unit(s)`);
    log.info(`[Agent] Reasoning: ${result.reasoning}`);
    log.info(`[Agent] Confidence: ${(result.confidence * 100).toFixed(0)}%`);

    return result;

  } catch (error) {
    log.error(`[Agent] Error: ${error}`);
    return null;
  }
}

/**
 * Enhanced agent that can also see a screenshot (for future use)
 */
export async function selectProductWithVision(
  query: string,
  products: ProductCard[],
  screenshot: string, // base64 encoded
  log: LogSink
): Promise<AgentSelection | null> {
  
  if (!process.env.OPENAI_API_KEY) {
    log.warn("OpenAI API key not found, cannot use vision agent");
    return null;
  }

  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    const productList = products
      .map((p, i) => `${i}. ${p.title}${p.price ? ` - ${p.price}` : ''}`)
      .join('\n');

    log.info(`[Vision Agent] Analyzing screenshot with GPT-4o Vision...`);

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `You are a grocery shopping assistant. User wants: "${query}"

Here's a screenshot of the grocery store search results. I've extracted these products:
${productList}

Look at the screenshot and select the best product. Consider:
- Visual product images
- Availability badges (out of stock, etc.)
- Any text or labels on screen
- Product positioning and prominence

Respond with JSON:
{
  "selectedIndex": <number or -1>,
  "quantity": <integer>,
  "reasoning": "<explain based on what you see>",
  "confidence": <0.0-1.0>
}`
            },
            {
              type: "image_url",
              image_url: {
                url: `data:image/png;base64,${screenshot}`
              }
            }
          ]
        }
      ],
      temperature: 0.1,
      response_format: { type: "json_object" }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      log.error("[Vision Agent] No response from AI");
      return null;
    }

    const result: AgentSelection = JSON.parse(content);

    if (result.selectedIndex === -1) {
      log.warn(`[Vision Agent] No suitable product: ${result.reasoning}`);
      return null;
    }

    log.info(`[Vision Agent] ✓ Selected: "${products[result.selectedIndex].title}"`);
    log.info(`[Vision Agent] Reasoning: ${result.reasoning}`);
    log.info(`[Vision Agent] Confidence: ${(result.confidence * 100).toFixed(0)}%`);

    return result;

  } catch (error) {
    log.error(`[Vision Agent] Error: ${error}`);
    return null;
  }
}

