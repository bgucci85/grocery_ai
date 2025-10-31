import { chromium, BrowserContext } from "playwright";
import * as path from "path";
import * as fs from "fs";
import { LogSink } from "./utils/log";
import * as barbora from "./drivers/barbora";
import * as rimi from "./drivers/rimi";
import { judgeCart, displayJudgment } from "./utils/cart-judge";

export type Site = "barbora" | "rimi";

export interface CartItem {
  site: Site;
  url?: string;
  query?: string;
  qty?: number;
  alternatives?: Array<{ type: "url" | "query"; value: string }>;
}

export interface RunOptions {
  items: CartItem[];
  headful?: boolean;
  useOpenAI?: boolean;
}

export interface FailedItem {
  query?: string;
  url?: string;
  reason: 'out_of_stock' | 'not_found' | 'error';
  details?: string;
  site: Site;
}

export interface AddedItem {
  originalRequest: string;  // What the user asked for
  productAdded: string;      // What was actually added to cart
  quantityRequested: number; // Quantity requested
  quantityAdded: number;     // Quantity added
  site: Site;
}

export interface AddResult {
  productName: string;
  quantityAdded: number;
}

interface SiteDriver {
  ensureLoggedIn: (page: any, log: LogSink) => Promise<void>;
  addByUrl: (page: any, url: string, qty: number, log: LogSink) => Promise<AddResult>;
  addByQuery: (
    page: any,
    query: string,
    qty: number,
    options: { useOpenAI?: boolean },
    log: LogSink
  ) => Promise<AddResult>;
}

const DRIVERS: Record<Site, SiteDriver> = {
  barbora,
  rimi,
};

/**
 * Main orchestration logic
 */
export interface RunJobResult {
  judgments: any[] | null;
  originalItems: CartItem[];
  addedItems: AddedItem[];
  failedItems: FailedItem[];
}

export async function runJob(options: RunOptions, log: LogSink): Promise<RunJobResult> {
  log.info("🚀 Starting Groceries Autocart...");
  
  // Validate input
  if (!options.items || options.items.length === 0) {
    log.error("No items provided");
    return {
      judgments: null,
      originalItems: [],
      addedItems: [],
      failedItems: []
    };
  }

  // Group items by site
  const itemsBySite = new Map<Site, CartItem[]>();
  for (const item of options.items) {
    if (!item.site || !DRIVERS[item.site]) {
      log.warn(`Invalid site: ${item.site}, skipping item`);
      continue;
    }
    
    if (!item.url && !item.query && (!item.alternatives || item.alternatives.length === 0)) {
      log.warn(`Item missing url, query, and alternatives, skipping`);
      continue;
    }
    
    if (!itemsBySite.has(item.site)) {
      itemsBySite.set(item.site, []);
    }
    itemsBySite.get(item.site)!.push(item);
  }

  log.info(`Processing ${options.items.length} items across ${itemsBySite.size} site(s)`);

  // Track failed and added items across all sites
  const allFailedItems: FailedItem[] = [];
  const allAddedItems: AddedItem[] = [];

  // Process each site
  for (const [site, items] of Array.from(itemsBySite.entries())) {
    const { failedItems, addedItems } = await processSite(site, items, options, log);
    allFailedItems.push(...failedItems);
    allAddedItems.push(...addedItems);
  }

  // Report summary
  if (allFailedItems.length > 0) {
    log.warn(`\n⚠️  ${allFailedItems.length} item(s) could not be added:\n`);
    
    const outOfStock = allFailedItems.filter(i => i.reason === 'out_of_stock');
    const notFound = allFailedItems.filter(i => i.reason === 'not_found');
    const errors = allFailedItems.filter(i => i.reason === 'error');
    
    if (outOfStock.length > 0) {
      log.warn(`\n📦 OUT OF STOCK (${outOfStock.length}):`);
      outOfStock.forEach(item => {
        const identifier = item.query || item.url || 'Unknown';
        log.warn(`   • ${identifier} (${item.site})`);
      });
    }
    
    if (notFound.length > 0) {
      log.warn(`\n🔍 NOT FOUND (${notFound.length}):`);
      notFound.forEach(item => {
        const identifier = item.query || item.url || 'Unknown';
        log.warn(`   • ${identifier} (${item.site})`);
      });
    }
    
    if (errors.length > 0) {
      log.warn(`\n❌ ERRORS (${errors.length}):`);
      errors.forEach(item => {
        const identifier = item.query || item.url || 'Unknown';
        log.warn(`   • ${identifier} (${item.site}): ${item.details}`);
      });
    }
  }

  // Run cart verification if OpenAI is enabled
  let judgments = null;
  if (options.useOpenAI && process.env.OPENAI_API_KEY) {
    judgments = await judgeCart(options.items, allAddedItems, allFailedItems, log);
    // Don't display in logs anymore - will be shown in UI
    // displayJudgment(judgments, log);
  }

  if (options.headful) {
    log.done("\n✅ Ready for checkout! Browser windows left open for you to review.");
  } else {
    log.done("\n✅ Ready for checkout");
  }

  // Return judgment data for UI display
  return {
    judgments,
    originalItems: options.items,
    addedItems: allAddedItems,
    failedItems: allFailedItems
  };
}

/**
 * Process all items for a specific site
 */
async function processSite(
  site: Site,
  items: CartItem[],
  options: RunOptions,
  log: LogSink
): Promise<{ failedItems: FailedItem[]; addedItems: AddedItem[] }> {
  let context: BrowserContext | null = null;
  const failedItems: FailedItem[] = [];
  const addedItems: AddedItem[] = [];

  try {
    log.info(`\n📦 Processing ${items.length} item(s) for ${site}...`);

    // Create user data directory if it doesn't exist
    const userDataDir = path.join(process.cwd(), ".userdata", site);
    if (!fs.existsSync(userDataDir)) {
      fs.mkdirSync(userDataDir, { recursive: true });
    }

    // Launch persistent context
    log.info(`Launching browser for ${site}...`);
    context = await chromium.launchPersistentContext(userDataDir, {
      headless: !options.headful,
      viewport: { width: 1280, height: 720 },
      acceptDownloads: false,
      channel: undefined, // Use regular chromium
    });

    const page = await context.newPage();
    const driver = DRIVERS[site];

    // Ensure logged in
    await driver.ensureLoggedIn(page, log);

    // Process each item
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const qty = item.qty || 1;

      log.info(`\n[${i + 1}/${items.length}] Processing item... (qty=${qty})`);

      // Handle items with alternatives (arba)
      if (item.alternatives && item.alternatives.length > 0) {
        log.info(`📋 Found ${item.alternatives.length} alternatives (using "arba"), will try in order with qty=${qty}...`);
        
        let success = false;
        let lastError: any = null;
        
        for (let altIndex = 0; altIndex < item.alternatives.length; altIndex++) {
          const alt = item.alternatives[altIndex];
          const preview = alt.type === 'url' ? alt.value.substring(0, 60) + '...' : alt.value;
          log.info(`🔄 Trying alternative ${altIndex + 1}/${item.alternatives.length}: ${preview}`);
          
          try {
            let result: AddResult | undefined = undefined;
            if (alt.type === "url") {
              result = await driver.addByUrl(page, alt.value, qty, log);
              success = true;
              log.info(`✅ Successfully added alternative ${altIndex + 1}!`);
            } else {
              result = await driver.addByQuery(
                page,
                alt.value,
                qty,
                { useOpenAI: options.useOpenAI },
                log
              );
              success = true;
              log.info(`✅ Successfully added alternative ${altIndex + 1}!`);
            }
            
            // Track successful addition
            if (result) {
              const firstAlt = item.alternatives![0];
              addedItems.push({
                originalRequest: firstAlt.type === 'query' ? firstAlt.value : firstAlt.value,
                productAdded: result.productName,
                quantityRequested: qty,
                quantityAdded: result.quantityAdded,
                site
              });
            }
            break; // Stop trying alternatives once one succeeds
          } catch (error) {
            lastError = error;
            log.warn(`⚠️  Alternative ${altIndex + 1} failed: ${error}`);
            if (altIndex < item.alternatives.length - 1) {
              log.info(`⏭️  Trying next alternative...`);
            }
          }
        }
        
        if (!success) {
          log.error(`❌ All ${item.alternatives.length} alternatives failed`);
          // Record the failure with the first alternative's identifier
          const firstAlt = item.alternatives[0];
          const errorStr = String(lastError || '');
          const errorLower = errorStr.toLowerCase();
          failedItems.push({
            query: firstAlt.type === 'query' ? firstAlt.value : undefined,
            url: firstAlt.type === 'url' ? firstAlt.value : undefined,
            reason: errorLower.includes('out_of_stock') ? 'out_of_stock' : 
                    errorLower.includes('not_found') || errorLower.includes('not found') ? 'not_found' : 'error',
            details: errorStr,
            site
          });
        }
      } else {
        // Single item (no alternatives)
        try {
          let result: AddResult | undefined = undefined;
          if (item.url) {
            result = await driver.addByUrl(page, item.url, qty, log);
          } else if (item.query) {
            result = await driver.addByQuery(
              page,
              item.query,
              qty,
              { useOpenAI: options.useOpenAI },
              log
            );
          }
          
          // Track successful addition
          if (result) {
            addedItems.push({
              originalRequest: item.query || item.url || 'Unknown',
              productAdded: result.productName,
              quantityRequested: qty,
              quantityAdded: result.quantityAdded,
              site
            });
          }
        } catch (error) {
          const errorStr = String(error || '');
          const errorLower = errorStr.toLowerCase();
          failedItems.push({
            query: item.query,
            url: item.url,
            reason: errorLower.includes('out_of_stock') ? 'out_of_stock' : 
                    errorLower.includes('not_found') || errorLower.includes('not found') ? 'not_found' : 'error',
            details: errorStr,
            site
          });
        }
      }

      // Small delay between items
      await page.waitForTimeout(500);
    }

    log.info(`\n✓ Completed ${site}`);
    
    // Navigate to cart so user can review
    try {
      const cartUrls: Record<Site, string> = {
        barbora: "https://www.barbora.lt/cart",
        rimi: "https://www.rimi.lt/e-parduotuve/cart",
      };
      
      log.info(`[${site}] Opening cart for review...`);
      await page.goto(cartUrls[site], { waitUntil: "domcontentloaded" });
      await page.waitForTimeout(2000);
    } catch (error) {
      log.warn(`[${site}] Could not navigate to cart, but items were added`);
    }

    // Keep browser open in headful mode
    if (options.headful) {
      log.info(`\n🛒 [${site}] Browser window left open for you to review and checkout`);
      log.info(`[${site}] Close the browser window when you're done`);
      // Don't close context - let user close it manually
    } else {
      // In headless mode, close automatically
      if (context) {
        await context.close();
      }
    }
  } catch (error) {
    log.error(`Error processing ${site}: ${error}`);
    // Close on error
    if (context) {
      await context.close();
    }
  }
  
  return { failedItems, addedItems };
}

