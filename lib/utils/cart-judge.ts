import OpenAI from "openai";
import { AddedItem, FailedItem, CartItem } from "../runner";
import { CartItem as ScrapedCartItem } from "./cart-scraper";
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
  actualCartItems: ScrapedCartItem[],
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
    
    const actualCartList = actualCartItems.map((item, index) => {
      return `${index + 1}. "${item.productName}" - ${item.quantity} ${item.unit}${item.price ? ` (${item.price})` : ''}`;
    }).join('\n');
    
    const prompt = `You are a grocery shopping cart verification assistant. Compare what was requested with what's ACTUALLY in the cart (not just what was reported).

ORIGINAL SHOPPING LIST:
${originalList}

WHAT DRIVERS REPORTED THEY ADDED:
${addedList || '(None)'}

ACTUAL CART CONTENTS (scraped from website):
${actualCartList || '(None)'}

ITEMS THAT FAILED TO ADD:
${failedList || '(None)'}

IMPORTANT: Compare the ACTUAL CART CONTENTS with the original requests. If drivers reported adding 0.5kg but the cart only has 0.25kg, note this discrepancy!

For each item in the original list, provide:
1. A match score (0-100) based on ACTUAL cart contents vs request
2. Status: "success", "warning", or "failed"
3. Notes about ANY issues including:
   - Quantity mismatches between reported and actual
   - Wrong product or wrong size
   - Substitutions
   - Anything that doesn't match the original request

Return your analysis as a JSON object with an "items" array:
{
  "items": [
    {
      "originalRequest": "the original request from the list",
      "status": "success" | "warning" | "failed",
      "productAdded": "what's ACTUALLY in cart (from actual cart contents)",
      "quantityRequested": number,
      "quantityAdded": number (ACTUAL quantity from cart, not reported),
      "matchScore": 0-100 (based on actual cart vs request),
      "notes": ["list ALL issues: quantity mismatches, wrong products, etc."]
    }
  ]
}

Guidelines:
- matchScore should be 95-100 for exact or near-perfect matches
- matchScore should be 70-94 for acceptable matches with minor differences (e.g., different brand, minor qty difference like 7kg vs 8kg)
- matchScore should be 50-69 for questionable matches (wrong size, significant qty mismatch like 0.25kg vs 0.5kg)
- matchScore should be 0-49 for poor matches or failures
- Status "success" = matchScore >= 95 (only near-perfect matches)
- Status "warning" = matchScore 50-94 (acceptable but not perfect, includes any quantity mismatches)
- Status "failed" = item not added or matchScore < 50
- ALWAYS note when reported quantity differs from actual cart quantity!`;

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

