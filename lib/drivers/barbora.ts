import { Page } from "playwright";
import { compareTwoStrings } from "string-similarity";
import {
  acceptCookiesIfAny,
  clickAddToCart,
  collectGridProducts,
  incrementQuantity,
  adjustVariableWeight,
  ProductCard,
} from "../utils/selectors";
import { pickBestWithAI } from "../utils/ai";
import { LogSink } from "../utils/log";
import { parseGroceryQuery, scoreProduct, canFulfillQuantity } from "../utils/query-parser";
import { selectProductWithAgent } from "../agents/product-selector";
import { AddResult } from "../runner";

const BASE_URL = "https://www.barbora.lt";

/**
 * Calculate how many units of a product are needed to fulfill desired quantity
 * E.g., want "2kg", product is "1kg" → return 2
 */
function calculateQuantityMultiplier(desiredQuantity: string, productTitle: string): number {
  const desiredMatch = desiredQuantity.match(/(\d+(?:\.\d+)?)\s*(kg|g|l|ml|vnt|pack)/i);
  if (!desiredMatch) return 1;
  
  const desiredAmount = parseFloat(desiredMatch[1]);
  const desiredUnit = desiredMatch[2].toLowerCase();
  
  const productMatch = productTitle.match(/(\d+(?:\.\d+)?)\s*(kg|g|l|ml|vnt|pack)/i);
  if (!productMatch) return 1;
  
  const productAmount = parseFloat(productMatch[1]);
  const productUnit = productMatch[2].toLowerCase();
  
  // Units must match (basic check)
  if (desiredUnit !== productUnit) {
    // Handle kg/g conversion
    if (desiredUnit === 'kg' && productUnit === 'g') {
      return Math.ceil((desiredAmount * 1000) / productAmount);
    }
    if (desiredUnit === 'g' && productUnit === 'kg') {
      return Math.ceil(desiredAmount / (productAmount * 1000));
    }
    return 1;
  }
  
  // Calculate multiplier
  if (desiredAmount > productAmount) {
    const multiplier = desiredAmount / productAmount;
    return Math.ceil(multiplier); // Round up to ensure we get enough
  }
  
  return 1;
}

export async function ensureLoggedIn(page: Page, log: LogSink): Promise<void> {
  log.info("[barbora] Navigating to home page...");
  await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
  
  // Accept cookies if banner appears
  await acceptCookiesIfAny(page, ["Sutinku", "Priimti", "Accept", "Sutikti"]);
  
  // Wait a moment for page to settle
  await page.waitForTimeout(2000);
  
  // Check if we need to log in (look for login button/link)
  const loginSelectors = [
    'a:has-text("Prisijungti")',
    'button:has-text("Prisijungti")',
    'a:has-text("Login")',
  ];
  
  let needsLogin = false;
  for (const selector of loginSelectors) {
    const count = await page.locator(selector).count();
    if (count > 0) {
      needsLogin = true;
      break;
    }
  }
  
  if (needsLogin) {
    log.warn("[barbora] Please log in manually in the browser window. Session will be saved.");
    log.warn("[barbora] Waiting 90 seconds for manual login...");
    await page.waitForTimeout(90000);
  } else {
    log.info("[barbora] Already logged in (session restored)");
  }
}

export async function addByUrl(
  page: Page,
  url: string,
  qty: number,
  log: LogSink
): Promise<AddResult> {
  try {
    log.info(`[barbora] Adding product from URL: ${url}`);
    
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 }).catch(() => 
      page.goto(url, { waitUntil: "domcontentloaded" })
    );
    await page.waitForTimeout(2000);
    
    // Try to get product name from the page
    let productName = url;  // Default to URL
    try {
      const titleSelectors = [
        'h1',
        '[class*="product-title"]',
        '[class*="product-name"]',
        'span[id*="product-title"]',
      ];
      for (const selector of titleSelectors) {
        const titleEl = page.locator(selector).first();
        if (await titleEl.count() > 0) {
          const text = await titleEl.textContent();
          if (text && text.trim()) {
            productName = text.trim();
            break;
          }
        }
      }
    } catch {
      // If we can't get the name, just use the URL
    }
    
    // Try multiple strategies to find and click add to cart
    let added = false;
    
    // Strategy 1: Look for specific Barbora button classes
    const barboraSelectors = [
      'button[data-cnstrc-btn="add_to_cart"]',  // Most reliable - excludes wishlist button!
      'button[class*="b-product-action-add"]',
      'button[class*="product-add"]',
      'button[class*="add-to-cart"]:not([data-cnstrc-btn="add_to_wishlist"])',
      'button[data-testid="add-to-cart"]',
      'button:has-text("Add to cart")',
      'button:has-text("Į krepšelį")',
      'button:has-text("Pridėti į krepšelį")',
    ];
    
    for (const selector of barboraSelectors) {
      try {
        const btn = page.locator(selector).first();
        if (await btn.count() > 0 && await btn.isVisible({ timeout: 2000 })) {
          await btn.click();
          added = true;
          log.info(`[barbora] Found button with selector: ${selector}`);
          break;
        }
      } catch {
        continue;
      }
    }
    
    // Strategy 2: Generic fallback
    if (!added) {
      added = await clickAddToCart(page);
    }
    
    if (!added) {
      // Check if product is unavailable/out of stock
      const unavailableSelectors = [
        'button:has-text("Sorry, this product is currently unavailable")',
        'button:has-text("unavailable")',
        'div:has-text("Out of stock")',
        'div:has-text("Nėra sandėlyje")',
        '[class*="unavailable"]',
      ];
      
      let isUnavailable = false;
      for (const selector of unavailableSelectors) {
        if (await page.locator(selector).count() > 0) {
          isUnavailable = true;
          break;
        }
      }
      
      if (isUnavailable) {
        log.warn(`[barbora] ⚠️  Product is OUT OF STOCK: ${url}`);
        throw new Error(`OUT_OF_STOCK: ${url}`);
      }
      
      // Log all buttons on the page for debugging
      const buttons = await page.locator('button').all();
      log.warn(`[barbora] Found ${buttons.length} buttons on page`);
      for (let i = 0; i < Math.min(buttons.length, 5); i++) {
        const text = await buttons[i].textContent();
        log.info(`[barbora] Button ${i}: "${text?.trim()}"`);
      }
      log.warn(`[barbora] Could not find add-to-cart button for ${url}`);
      throw new Error(`Could not find add-to-cart button for ${url}`);
    }
    
    log.info(`[barbora] ✓ Added 1 item to cart`);
    
    // Handle quantity > 1
    if (qty > 1) {
      log.info(`[barbora] Setting quantity to ${qty} units...`);
      const incremented = await incrementQuantity(page, qty);
      if (incremented) {
        log.info(`[barbora] ✓ Set quantity to ${qty}`);
      } else {
        log.warn(`[barbora] Could not set quantity; may have only 1`);
      }
    }
    
    await page.waitForTimeout(1000);
    
    return {
      productName,
      quantityAdded: qty
    };
  } catch (error) {
    log.error(`[barbora] Error adding product from URL: ${error}`);
    throw error; // Re-throw so caller knows it failed
  }
}

export async function addByQuery(
  page: Page,
  query: string,
  qty: number,
  options: { useOpenAI?: boolean },
  log: LogSink
): Promise<AddResult> {
  try {
    log.info(`[barbora] Searching for: "${query}"`);
    
    // Go to home page
    await page.goto(BASE_URL, { waitUntil: "networkidle", timeout: 30000 }).catch(() =>
      page.goto(BASE_URL, { waitUntil: "domcontentloaded" })
    );
    await page.waitForTimeout(2000);
    
    // Find search input with more variations
    const searchSelectors = [
      'input[placeholder*="ieško" i]',
      'input[placeholder*="ieška" i]',
      'input[placeholder*="Ieško" i]',
      'input[type="search"]',
      'input[name="search"]',
      'input[name="q"]',
      'input[class*="search"]',
      'input[class*="Search"]',
      '[data-testid*="search"] input',
      'header input[type="text"]',
      'nav input[type="text"]',
      '.search input',
      '#search',
      'input[aria-label*="search" i]',
      'input[aria-label*="ieška" i]',
    ];
    
    let searchInput = null;
    for (const selector of searchSelectors) {
      try {
        const input = page.locator(selector).first();
        if (await input.count() > 0) {
          const visible = await input.isVisible({ timeout: 1000 });
          if (visible) {
            searchInput = input;
            log.info(`[barbora] Found search input with selector: ${selector}`);
            break;
          }
        }
      } catch {
        continue;
      }
    }
    
    if (!searchInput) {
      // Log all input elements for debugging
      const inputs = await page.locator('input').all();
      log.warn(`[barbora] Found ${inputs.length} input elements on page`);
      for (let i = 0; i < Math.min(inputs.length, 10); i++) {
        const type = await inputs[i].getAttribute('type');
        const placeholder = await inputs[i].getAttribute('placeholder');
        const name = await inputs[i].getAttribute('name');
        log.info(`[barbora] Input ${i}: type="${type}", placeholder="${placeholder}", name="${name}"`);
      }
      log.error(`[barbora] Could not find search input`);
      throw new Error('Could not find search input');
    }
    
    // Parse query intelligently if OpenAI is available
    let parsedQuery = null;
    let searchTerm = query;
    
    if (options.useOpenAI) {
      log.info(`[barbora] Parsing query with AI...`);
      parsedQuery = await parseGroceryQuery(query);
      log.info(`[barbora] Parsed: product="${parsedQuery.productName}", qty="${parsedQuery.desiredQuantity || 'any'}"`);
      
      // Start with just the product name (better search results)
      searchTerm = parsedQuery.productName;
    }
    
    // Try multiple search variations
    const searchVariations = parsedQuery?.searchVariations || [query];
    let products: ProductCard[] = [];
    
    for (let i = 0; i < searchVariations.length && products.length === 0; i++) {
      const term = searchVariations[i];
      log.info(`[barbora] Trying search: "${term}"`);
      
      // Perform search
      await searchInput.fill(term);
      await searchInput.press("Enter");
      await page.waitForLoadState("domcontentloaded");
      await page.waitForTimeout(2000);
      
      // Collect products
      products = await collectGridProducts(page, log);
      
      if (products.length > 0) {
        log.info(`[barbora] Found ${products.length} products with "${term}"`);
        break;
      } else if (i < searchVariations.length - 1) {
        log.warn(`[barbora] No products with "${term}", trying next variation...`);
        // Go back to home to search again
        await page.goto(BASE_URL, { waitUntil: "domcontentloaded" });
        await page.waitForTimeout(1000);
        
        // Re-find search input
        for (const selector of searchSelectors) {
          try {
            const input = page.locator(selector).first();
            if (await input.count() > 0 && await input.isVisible({ timeout: 1000 })) {
              searchInput = input;
              break;
            }
          } catch {
            continue;
          }
        }
      }
    }
    
    if (products.length === 0) {
      log.error(`[barbora] ❌ No products found for query: "${query}" after trying all variations`);
      throw new Error(`NOT_FOUND: No products found for "${query}"`);
    }
    
    // Use LLM Agent for intelligent product selection
    let bestIndex = 0;
    let actualQty = qty;
    
    if (options.useOpenAI) {
      log.info(`[barbora] 🤖 AI AGENT ENABLED - Using GPT-4o for intelligent selection...`);
      
      const agentResult = await selectProductWithAgent(query, products, log, qty);
      
      if (agentResult) {
        bestIndex = agentResult.selectedIndex;
        actualQty = agentResult.quantity;
      } else {
        // Agent couldn't find a suitable product - don't fall back, throw error
        log.error(`[barbora] ❌ AI Agent could not find a suitable match for "${query}"`);
        throw new Error(`NOT_FOUND: No suitable product found for "${query}"`);
      }
    } else {
      // Use string similarity only (no AI)
      log.warn(`[barbora] ⚠️  AI AGENT DISABLED - Using basic string matching (enable "Use OpenAI assist" for better results)`);
      let bestScore = 0;
      for (let i = 0; i < products.length; i++) {
        const score = compareTwoStrings(
          query.toLowerCase(),
          products[i].title.toLowerCase()
        );
        if (score > bestScore) {
          bestScore = score;
          bestIndex = i;
        }
      }
      log.info(`[barbora] Selected by string similarity: ${products[bestIndex].title}`);
    }
    
    const selected = products[bestIndex];
    log.info(`[barbora] 🎯 About to add: "${selected.title}"`);
    
    // Check if product is available
    if (selected.isAvailable === false) {
      log.warn(`[barbora] ⚠️  Product "${selected.title}" is OUT OF STOCK or unavailable`);
      throw new Error(`OUT_OF_STOCK: ${selected.title}`);
    }
    
    // Add to cart - ONLY this specific product
    await selected.clickAdd();
    log.info(`[barbora] ✓ Clicked add for "${selected.title}"`);
    await page.waitForTimeout(1500); // Wait for cart modal/selector to appear
    
    // Handle quantity/weight adjustment
    if (actualQty > 1) {
      // Check if this is a weighted item (contains "kg" in query or title)
      const isWeightedItem = 
        query.toLowerCase().includes('kg') || 
        selected.title.toLowerCase().includes('kg');
      
      if (isWeightedItem) {
        log.info(`[barbora] Detected weighted item, adjusting to ${actualQty}kg...`);
        const adjusted = await adjustVariableWeight(page, actualQty, log);
        if (!adjusted) {
          log.warn(`[barbora] Could not adjust weight precisely, but item is in cart`);
        }
      } else {
        log.info(`[barbora] Setting quantity to ${actualQty} units...`);
        const incremented = await incrementQuantity(page, actualQty);
        if (incremented) {
          log.info(`[barbora] ✓ Set quantity to ${actualQty}`);
        } else {
          log.warn(`[barbora] Could not set quantity; may have only 1`);
        }
      }
    }
    
    // Confirm/close modal if needed
    await page.waitForTimeout(1000);
    
    // Try to find and click confirm/add button IN A MODAL (not on the main page)
    const confirmSelectors = [
      'div[class*="modal"] button:has-text("Pridėti")',
      'div[class*="dialog"] button:has-text("Pridėti")',
      '[role="dialog"] button:has-text("Pridėti")',
      'div[class*="modal"] button:has-text("Į krepšelį")',
      'div[class*="modal"] button:has-text("Patvirtinti")',
    ];
    
    let confirmed = false;
    for (const selector of confirmSelectors) {
      try {
        const btn = page.locator(selector).first();
        if (await btn.isVisible({ timeout: 1000 })) {
          await btn.click();
          log.info(`[barbora] ✅ Confirmed addition to cart`);
          confirmed = true;
          break;
        }
      } catch {
        continue;
      }
    }
    
    if (!confirmed) {
      log.info(`[barbora] No confirmation button found (item might already be in cart)`);
    }
    
    await page.waitForTimeout(500);
    
    // Close any remaining modals by pressing Escape
    await page.keyboard.press('Escape');
    await page.waitForTimeout(300);
    
    log.info(`[barbora] ✅ Finished adding "${query}"`);
    
    // IMPORTANT: Return immediately to prevent any further clicks
    return {
      productName: selected.title,
      quantityAdded: actualQty
    };
  } catch (error) {
    log.error(`[barbora] Error searching for "${query}": ${error}`);
    throw error; // Re-throw so caller knows it failed
  }
}

