import OpenAI from "openai";
import { AddedItem, FailedItem, CartItem } from "../runner";
import { LogSink } from "./log";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export interface JudgmentItem {
  originalRequest: string;
  status: 'success' | 'failed' | 'warning';
  productAdded?: string;
  quantityRequested: number;
  quantityAdded?: number;
  matchScore: number; // 0-100
  notes: string[];
}

export async function judgeCart(
  originalItems: CartItem[],
  addedItems: AddedItem[],
  failedItems: FailedItem[],
  log: LogSink
): Promise<JudgmentItem[]> {
  try {
    log.info('\n🔍 Running cart verification...');
    
    // Prepare data for the judge
    const originalList = originalItems.map((item, index) => {
      const request = item.query || item.url || item.alternatives?.map(a => a.value).join(' OR ') || 'Unknown';
      return `${index + 1}. ${request} (qty: ${item.qty || 1})`;
    }).join('\n');
    
    const addedList = addedItems.map((item, index) => {
      return `${index + 1}. "${item.productAdded}" - Qty: ${item.quantityAdded} (Requested: "${item.originalRequest}", Qty: ${item.quantityRequested})`;
    }).join('\n');
    
    const failedList = failedItems.map((item, index) => {
      const identifier = item.query || item.url || 'Unknown';
      return `${index + 1}. "${identifier}" - Reason: ${item.reason}`;
    }).join('\n');
    
    const prompt = `You are a grocery shopping cart verification assistant. Compare the original shopping list with what was actually added to the cart and what failed.

ORIGINAL SHOPPING LIST:
${originalList}

ITEMS SUCCESSFULLY ADDED TO CART:
${addedList || '(None)'}

ITEMS THAT FAILED TO ADD:
${failedList || '(None)'}

For each item in the original list, provide:
1. A match score (0-100) indicating how well the added product matches the request
2. Status: "success", "warning", or "failed"
3. Notes about any issues (wrong product, quantity mismatch, substitution, etc.)

Return your analysis as a JSON object with an "items" array:
{
  "items": [
    {
      "originalRequest": "the original request from the list",
      "status": "success" | "warning" | "failed",
      "productAdded": "what was actually added (or null if failed)",
      "quantityRequested": number,
      "quantityAdded": number (or null if failed),
      "matchScore": 0-100,
      "notes": ["list of observations/issues"]
    }
  ]
}

Guidelines:
- matchScore should be 95-100 for exact matches
- matchScore should be 70-94 for acceptable but not perfect matches (e.g., different brand)
- matchScore should be 50-69 for questionable matches (wrong size, possible substitution)
- matchScore should be 0-49 for poor matches or failures
- Status "success" = matchScore >= 70 and no major issues
- Status "warning" = matchScore 50-69 or quantity issues
- Status "failed" = item not added or matchScore < 50`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a precise grocery cart verification assistant. Always respond with valid JSON only."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.3,
      response_format: { type: "json_object" }
    });

    const content = response.choices[0].message.content;
    if (!content) {
      log.error(`[Judge] No response content from OpenAI`);
      throw new Error("No response from OpenAI");
    }

    log.info(`[Judge] Received response from OpenAI`);
    const parsed = JSON.parse(content);
    log.info(`[Judge] Parsed JSON successfully`);
    
    const judgments = parsed.items || parsed;
    
    if (!Array.isArray(judgments)) {
      log.error(`[Judge] Response is not an array. Keys: ${Object.keys(parsed).join(', ')}`);
      return [];
    }
    
    log.info(`[Judge] Generated ${judgments.length} judgments`);
    return judgments;
  } catch (error) {
    log.error(`[Judge] Error verifying cart: ${error}`);
    if (error instanceof Error) {
      log.error(`[Judge] Error stack: ${error.stack}`);
    }
    return [];
  }
}

export function displayJudgment(judgments: JudgmentItem[], log: LogSink): void {
  if (judgments.length === 0) {
    log.warn('[Judge] No judgments to display');
    return;
  }
  
  log.info('\n📊 CART VERIFICATION REPORT:\n');
  
  const successItems = judgments.filter(j => j.status === 'success');
  const warningItems = judgments.filter(j => j.status === 'warning');
  const failedItems = judgments.filter(j => j.status === 'failed');
  
  // Success items
  if (successItems.length > 0) {
    log.info(`✅ VERIFIED (${successItems.length}):`);
    successItems.forEach(item => {
      log.info(`   • ${item.originalRequest}`);
      log.info(`     Added: "${item.productAdded}" (${item.quantityAdded}x)`);
      log.info(`     Match: ${item.matchScore}%`);
      if (item.notes.length > 0) {
        item.notes.forEach(note => log.info(`     Note: ${note}`));
      }
      log.info('');
    });
  }
  
  // Warning items
  if (warningItems.length > 0) {
    log.warn(`⚠️  WARNINGS (${warningItems.length}):`);
    warningItems.forEach(item => {
      log.warn(`   • ${item.originalRequest}`);
      if (item.productAdded) {
        log.warn(`     Added: "${item.productAdded}" (${item.quantityAdded}x)`);
        log.warn(`     Match: ${item.matchScore}%`);
      }
      item.notes.forEach(note => log.warn(`     ⚠️  ${note}`));
      log.warn('');
    });
  }
  
  // Failed items
  if (failedItems.length > 0) {
    log.error(`❌ FAILED (${failedItems.length}):`);
    failedItems.forEach(item => {
      log.error(`   • ${item.originalRequest}`);
      log.error(`     Match: ${item.matchScore}%`);
      item.notes.forEach(note => log.error(`     ❌ ${note}`));
      log.error('');
    });
  }
  
  // Summary
  const avgScore = judgments.reduce((sum, j) => sum + j.matchScore, 0) / judgments.length;
  log.info(`📈 Overall Accuracy: ${avgScore.toFixed(1)}%\n`);
}

