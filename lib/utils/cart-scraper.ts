import { Page } from "playwright";
import { LogSink } from "./log";

export interface CartItem {
  productName: string;
  quantity: number;
  unit: "units" | "kg" | "g" | "l" | "ml";
  price?: string;
}

/**
 * Scrape cart contents from Barbora's right-side cart panel
 */
export async function scrapeBarboraCart(page: Page, log?: LogSink): Promise<CartItem[]> {
  try {
    if (log) log.info("[Cart Scraper] Reading cart contents from sidebar...");
    
    // Wait for cart to be visible
    await page.waitForSelector('.b-cart--scrollable-blocks-wrap--cart-content', { timeout: 5000 });
    
    // Find all cart items
    const cartItems = await page.locator('[data-testid^="cart-item-"]').all();
    
    if (log) log.info(`[Cart Scraper] Found ${cartItems.length} items in cart`);
    
    const items: CartItem[] = [];
    
    for (let i = 0; i < cartItems.length; i++) {
      const item = cartItems[i];
      
      try {
        // Get product name
        const nameEl = item.locator('.b-cart--item-title a').first();
        const productName = (await nameEl.textContent())?.trim() || 'Unknown';
        
        // Get quantity text like "Quantity in the cart 1 units" or "0.5 kg"
        const quantityEl = item.locator('.b-product-count-in-cart strong').first();
        const quantityText = (await quantityEl.textContent())?.trim() || '1 units';
        
        // Parse quantity and unit
        const { quantity, unit } = parseQuantityText(quantityText);
        
        // Get price (optional)
        const priceEl = item.locator('.b-next-cart-item--price').first();
        const price = (await priceEl.textContent())?.trim();
        
        items.push({
          productName,
          quantity,
          unit,
          price
        });
        
        if (log) {
          log.info(`[Cart Scraper] Item ${i + 1}: "${productName}" - ${quantity} ${unit}${price ? ` (${price})` : ''}`);
        }
      } catch (error) {
        if (log) log.warn(`[Cart Scraper] Failed to parse item ${i + 1}: ${error}`);
      }
    }
    
    return items;
  } catch (error) {
    if (log) log.error(`[Cart Scraper] Error scraping cart: ${error}`);
    return [];
  }
}

/**
 * Parse quantity text like "1 units", "0.5 kg", "500 g"
 */
function parseQuantityText(text: string): { quantity: number; unit: "units" | "kg" | "g" | "l" | "ml" } {
  // Default
  let quantity = 1;
  let unit: "units" | "kg" | "g" | "l" | "ml" = "units";
  
  // Try to match patterns like "1 units", "0.5 kg", "500 g"
  const match = text.match(/([0-9.]+)\s*(units?|kg|g|l|ml)/i);
  
  if (match) {
    quantity = parseFloat(match[1]);
    const unitStr = match[2].toLowerCase();
    
    if (unitStr === 'kg') unit = 'kg';
    else if (unitStr === 'g') unit = 'g';
    else if (unitStr === 'l') unit = 'l';
    else if (unitStr === 'ml') unit = 'ml';
    else unit = 'units';
  }
  
  return { quantity, unit };
}

/**
 * Scrape cart contents from Rimi (placeholder for now)
 */
export async function scrapeRimiCart(page: Page, log?: LogSink): Promise<CartItem[]> {
  // TODO: Implement Rimi cart scraping when we know their cart structure
  if (log) log.warn("[Cart Scraper] Rimi cart scraping not implemented yet");
  return [];
}

