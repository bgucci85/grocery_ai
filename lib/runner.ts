import { chromium, BrowserContext } from "playwright";
import * as path from "path";
import * as fs from "fs";
import { LogSink } from "./utils/log";
import * as barbora from "./drivers/barbora";
import * as rimi from "./drivers/rimi";

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

interface SiteDriver {
  ensureLoggedIn: (page: any, log: LogSink) => Promise<void>;
  addByUrl: (page: any, url: string, qty: number, log: LogSink) => Promise<void>;
  addByQuery: (
    page: any,
    query: string,
    qty: number,
    options: { useOpenAI?: boolean },
    log: LogSink
  ) => Promise<void>;
}

const DRIVERS: Record<Site, SiteDriver> = {
  barbora,
  rimi,
};

/**
 * Main orchestration logic
 */
export async function runJob(options: RunOptions, log: LogSink): Promise<void> {
  log.info("🚀 Starting Groceries Autocart...");
  
  // Validate input
  if (!options.items || options.items.length === 0) {
    log.error("No items provided");
    return;
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

  // Process each site
  for (const [site, items] of itemsBySite.entries()) {
    await processSite(site, items, options, log);
  }

  if (options.headful) {
    log.done("✅ Ready for checkout! Browser windows left open for you to review.");
  } else {
    log.done("✅ Ready for checkout");
  }
}

/**
 * Process all items for a specific site
 */
async function processSite(
  site: Site,
  items: CartItem[],
  options: RunOptions,
  log: LogSink
): Promise<void> {
  let context: BrowserContext | null = null;

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
        for (let altIndex = 0; altIndex < item.alternatives.length; altIndex++) {
          const alt = item.alternatives[altIndex];
          const preview = alt.type === 'url' ? alt.value.substring(0, 60) + '...' : alt.value;
          log.info(`🔄 Trying alternative ${altIndex + 1}/${item.alternatives.length}: ${preview}`);
          
          try {
            if (alt.type === "url") {
              await driver.addByUrl(page, alt.value, qty, log);
              success = true;
              log.info(`✅ Successfully added alternative ${altIndex + 1}!`);
              break; // Stop trying alternatives once one succeeds
            } else {
              await driver.addByQuery(
                page,
                alt.value,
                qty,
                { useOpenAI: options.useOpenAI },
                log
              );
              success = true;
              log.info(`✅ Successfully added alternative ${altIndex + 1}!`);
              break; // Stop trying alternatives once one succeeds
            }
          } catch (error) {
            log.warn(`⚠️  Alternative ${altIndex + 1} failed: ${error}`);
            if (altIndex < item.alternatives.length - 1) {
              log.info(`⏭️  Trying next alternative...`);
            }
          }
        }
        
        if (!success) {
          log.error(`❌ All ${item.alternatives.length} alternatives failed`);
        }
      } else {
        // Single item (no alternatives)
        if (item.url) {
          await driver.addByUrl(page, item.url, qty, log);
        } else if (item.query) {
          await driver.addByQuery(
            page,
            item.query,
            qty,
            { useOpenAI: options.useOpenAI },
            log
          );
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
}

