import { Page, Locator } from "playwright";

/**
 * Accept cookie banners if present
 */
export async function acceptCookiesIfAny(
  page: Page,
  labels: string[] = ["Sutinku", "Priimti", "Accept", "Sutikti"]
): Promise<void> {
  try {
    // Wait a moment for cookie banner to appear
    await page.waitForTimeout(1000);

    for (const label of labels) {
      const button = page.getByRole("button", { name: new RegExp(label, "i") });
      const count = await button.count();
      
      if (count > 0 && await button.first().isVisible()) {
        await button.first().click({ timeout: 2000 });
        await page.waitForTimeout(500);
        return;
      }
    }
  } catch (error) {
    // No cookie banner or already accepted - continue
  }
}

/**
 * Find the first visible element from a list of selectors
 */
export async function findFirst(
  page: Page,
  selectors: string[]
): Promise<Locator | null> {
  for (const selector of selectors) {
    try {
      const locator = page.locator(selector).first();
      if (await locator.isVisible({ timeout: 1000 })) {
        return locator;
      }
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Find the first visible element within a parent locator
 */
export async function findFirstWithin(
  root: Locator,
  selectors: string[]
): Promise<Locator | null> {
  for (const selector of selectors) {
    try {
      const locator = root.locator(selector).first();
      if (await locator.isVisible({ timeout: 1000 })) {
        return locator;
      }
    } catch {
      continue;
    }
  }
  return null;
}

/**
 * Click add to cart button with various text variations
 */
export async function clickAddToCart(
  page: Page,
  altTexts: string[] = ["Į krepšelį", "Pridėti", "Add to cart", "Add", "Į krepšelį"]
): Promise<boolean> {
  for (const text of altTexts) {
    try {
      // Try button by role
      const button = page.getByRole("button", { name: new RegExp(text, "i") });
      const count = await button.count();
      
      if (count > 0) {
        const first = button.first();
        if (await first.isVisible({ timeout: 1000 })) {
          await first.click({ timeout: 2000 });
          await page.waitForTimeout(500);
          return true;
        }
      }
    } catch {
      continue;
    }
  }
  
  // Try common selectors as fallback
  const fallbackSelectors = [
    'button[class*="add"]',
    'button[class*="cart"]',
    'button[data-testid*="add"]',
    '.add-to-cart',
    '.btn-add-to-cart'
  ];
  
  for (const selector of fallbackSelectors) {
    try {
      const button = page.locator(selector).first();
      if (await button.isVisible({ timeout: 1000 })) {
        await button.click({ timeout: 2000 });
        await page.waitForTimeout(500);
        return true;
      }
    } catch {
      continue;
    }
  }
  
  return false;
}

export interface ProductCard {
  title: string;
  price?: string;
  element: Locator;
  clickAdd: () => Promise<void>;
}

/**
 * Collect product cards from a grid/list view
 */
export async function collectGridProducts(page: Page, log?: any): Promise<ProductCard[]> {
  const products: ProductCard[] = [];
  
  // Wait a bit for products to render
  await page.waitForTimeout(1000);
  
  // Common product card selectors (try most specific first)
  const cardSelectors = [
    // Barbora/Rimi specific (from actual HTML)
    'div[class*="group"][class*="relative"]',  // Modern Barbora/Rimi structure
    'article[class*="b-product"]',  // Barbora specific (older)
    'div[class*="b-product-tile"]', // Barbora specific (older)
    'div[class*="fic-product"]',    // Barbora/Rimi
    '[data-testid*="product-card"]',
    '[data-testid*="product-item"]',
    '[class*="product-card"]',
    '[class*="product-item"]',
    '[class*="ProductCard"]',
    '[data-testid*="product"]',
    'article[class*="product"]',
    '.product-tile',
    '.product',
    'li[class*="product"]',
    'div[class*="product"][class*="card"]',
  ];
  
  let cards: Locator | null = null;
  let usedSelector = "";
  
  for (const selector of cardSelectors) {
    const locator = page.locator(selector);
    const count = await locator.count();
    if (count > 0) {
      cards = locator;
      usedSelector = selector;
      if (log) {
        log.info(`Found ${count} products using selector: ${selector}`);
      }
      break;
    }
  }
  
  if (!cards) {
    // Fallback: try to find products by looking for "Add to cart" buttons
    if (log) {
      log.warn("No products found with standard selectors, trying fallback strategy...");
    }
    
    const addButtonSelectors = [
      'button:has-text("Į krepšelį")',
      'button:has-text("Pridėti")',
      'button:has-text("Add to cart")',
      'button[class*="add"]',
    ];
    
    let addButtons: Locator | null = null;
    
    for (const selector of addButtonSelectors) {
      const locator = page.locator(selector);
      const count = await locator.count();
      if (count > 0) {
        addButtons = locator;
        if (log) {
          log.info(`Found ${count} add-to-cart buttons using selector: ${selector}`);
        }
        break;
      }
    }
    
    if (!addButtons) {
      if (log) {
        log.error("Could not find any add-to-cart buttons on page");
        
        // Final debug attempt
        const allButtons = await page.locator('button').all();
        log.info(`Total buttons on page: ${allButtons.length}`);
        for (let i = 0; i < Math.min(allButtons.length, 5); i++) {
          const text = await allButtons[i].textContent();
          const classes = await allButtons[i].getAttribute('class');
          log.info(`  Button ${i}: text="${text?.trim()}", class="${classes}"`);
        }
      }
      return products;
    }
    
    // Extract products from add button parent containers
    const buttonCount = await addButtons.count();
    const maxButtons = Math.min(buttonCount, 20);
    
    for (let i = 0; i < maxButtons; i++) {
      try {
        const button = addButtons.nth(i);
        
        // Get the parent container (go up a few levels to find product container)
        const container = button.locator('xpath=ancestor::*[contains(@class, "product") or contains(@class, "item") or contains(@class, "card")][1]').first();
        
        // If can't find product container, use direct parent
        const productContainer = await container.count() > 0 ? container : button.locator('xpath=ancestor::div[3]').first();
        
        // Extract title
        let title = "";
        const titleSelectors = [
          'span[id*="fti-product-title"]',  // Barbora/Rimi specific!
          '[id*="product-title"]',
          'h2', 'h3', 'h4', 
          'a[class*="text-neutral"]',
          '[class*="title"]', 
          '[class*="name"]', 
          'a'
        ];
        
        for (const sel of titleSelectors) {
          const titleEl = productContainer.locator(sel).first();
          if (await titleEl.count() > 0) {
            title = await titleEl.textContent() || "";
            if (title.trim()) break;
          }
        }
        
        if (!title.trim()) continue;
        
        // Extract price
        let price = "";
        const priceSelectors = ['[class*="price"]', '[class*="Price"]'];
        
        for (const sel of priceSelectors) {
          const priceEl = productContainer.locator(sel).first();
          if (await priceEl.count() > 0) {
            price = await priceEl.textContent() || "";
            if (price.trim()) break;
          }
        }
        
        const clickAdd = async () => {
          await button.click();
          await page.waitForTimeout(500);
        };
        
        // Check for duplicates
        const isDuplicate = products.some(p => p.title === title.trim());
        if (!isDuplicate) {
          products.push({
            title: title.trim(),
            price: price.trim(),
            element: productContainer,
            clickAdd
          });
        }
      } catch (error) {
        // Skip problematic items
        continue;
      }
    }
    
    if (log && products.length > 0) {
      log.info(`Extracted ${products.length} unique products using fallback strategy`);
    }
    
    return products;
  }
  
  const count = await cards.count();
  const maxProducts = Math.min(count, 20); // Limit to first 20 products
  
  for (let i = 0; i < maxProducts; i++) {
    const card = cards.nth(i);
    
    try {
      // Get title from various possible elements
      let title = "";
      const titleSelectors = [
        'span[id*="fti-product-title"]',  // Barbora/Rimi specific!
        '[id*="product-title"]',
        'h2', 'h3', 'h4',
        'a[class*="text-neutral"]',  // Barbora/Rimi link style
        '[class*="title"]',
        '[class*="name"]',
        '[data-testid*="title"]',
        '[data-testid*="name"]',
        'a[href*="/produktai/"]',  // Barbora/Rimi product links
      ];
      
      for (const sel of titleSelectors) {
        const titleEl = card.locator(sel).first();
        if (await titleEl.count() > 0) {
          title = await titleEl.textContent() || "";
          if (title.trim()) break;
        }
      }
      
      if (!title.trim()) continue;
      
      // Get price
      let price = "";
      const priceSelectors = [
        '[class*="price"]',
        '[data-testid*="price"]',
        '.price'
      ];
      
      for (const sel of priceSelectors) {
        const priceEl = card.locator(sel).first();
        if (await priceEl.count() > 0) {
          price = await priceEl.textContent() || "";
          if (price.trim()) break;
        }
      }
      
      // Create click function
      const clickAdd = async () => {
        const buttonTexts = ["Į krepšelį", "Pridėti", "Add"];
        for (const text of buttonTexts) {
          const button = card.getByRole("button", { name: new RegExp(text, "i") });
          if (await button.count() > 0) {
            await button.first().click();
            await page.waitForTimeout(500);
            return;
          }
        }
        
        // Fallback: try any button in the card
        const anyButton = card.locator('button').first();
        if (await anyButton.count() > 0) {
          await anyButton.click();
          await page.waitForTimeout(500);
        }
      };
      
      // Check for duplicates before adding
      const isDuplicate = products.some(p => p.title === title.trim());
      if (isDuplicate) {
        continue; // Skip duplicate products
      }
      
      products.push({
        title: title.trim(),
        price: price.trim(),
        element: card,
        clickAdd
      });
    } catch (error) {
      // Skip problematic cards
      continue;
    }
  }
  
  if (log && products.length > 0) {
    log.info(`Collected ${products.length} unique products`);
  }
  
  return products;
}

/**
 * Attempt to increment quantity (for fixed-quantity items like eggs)
 */
export async function incrementQuantity(
  page: Page,
  targetQuantity: number
): Promise<boolean> {
  try {
    // First, try to find current quantity input/display
    const quantitySelectors = [
      'input[type="number"]',
      'input[aria-label*="quantity"]',
      'input[aria-label*="kiekis"]',
      '[data-testid*="quantity-input"]',
      'span[class*="quantity"]',
      'div[class*="quantity"] span',
    ];

    let currentQty = 1; // Default assumption - item was just added with qty 1
    
    // Try to read current quantity
    for (const selector of quantitySelectors) {
      try {
        const qtyElement = await page.locator(selector).first();
        if (await qtyElement.isVisible({ timeout: 1000 })) {
          const value = await qtyElement.inputValue().catch(() => null) 
            || await qtyElement.textContent().catch(() => null);
          if (value) {
            const parsed = parseInt(value.trim());
            if (!isNaN(parsed) && parsed > 0) {
              currentQty = parsed;
              console.log(`[incrementQuantity] Current quantity detected: ${currentQty}, target: ${targetQuantity}`);
              break;
            }
          }
        }
      } catch {}
    }

    // Calculate how many times to click +
    const clicksNeeded = targetQuantity - currentQty;
    
    if (clicksNeeded <= 0) {
      console.log(`[incrementQuantity] Already at or above target (current=${currentQty}, target=${targetQuantity})`);
      return true;
    }

    // Find increment button
    const incrementSelectors = [
      'button[aria-label*="didinti"]',
      'button[aria-label*="increase"]',
      'button[aria-label*="Increase"]',
      'button[class*="increment"]',
      'button[class*="plus"]',
      'button:has-text("+")',
      '[data-testid*="increment"]',
      '[data-testid*="plus"]',
    ];

    let incrementButton: Locator | null = null;
    for (const selector of incrementSelectors) {
      try {
        const button = page.locator(selector).first();
        if (await button.isVisible({ timeout: 1000 })) {
          incrementButton = button;
          break;
        }
      } catch {}
    }

    if (!incrementButton) {
      console.log(`[incrementQuantity] No increment button found`);
      return false;
    }

    // Click + button the required number of times
    console.log(`[incrementQuantity] Clicking + button ${clicksNeeded} times (from ${currentQty} to ${targetQuantity})...`);
    for (let i = 0; i < clicksNeeded; i++) {
      await incrementButton.click();
      await page.waitForTimeout(500); // Wait for UI to update
    }

    return true;
  } catch (error) {
    console.error(`[incrementQuantity] Error:`, error);
    return false;
  }
}

/**
 * Handle variable weight items (like produce on Barbora)
 * Clicks + until reaching target weight (with tolerance)
 */
export async function adjustVariableWeight(
  page: Page,
  targetKg: number,
  log?: any
): Promise<boolean> {
  if (targetKg <= 0) return true;

  // Wait for weight selector to appear (modal or expanded section)
  await page.waitForTimeout(1000);

  // Look for weight display and increment button
  const weightSelectors = [
    '[class*="weight"]',
    '[class*="kg"]',
    'input[type="number"]',
    '[class*="quantity"]',
    'span:has-text("kg")',
  ];

  const incrementSelectors = [
    'button:has-text("+")',
    'button[aria-label*="increase"]',
    'button[class*="increment"]',
    'button[class*="plus"]',
  ];

  // Find increment button
  let incrementButton = null;
  for (const selector of incrementSelectors) {
    const btn = page.locator(selector).first();
    if (await btn.isVisible({ timeout: 2000 }).catch(() => false)) {
      incrementButton = btn;
      if (log) log.info(`Found increment button: ${selector}`);
      break;
    }
  }

  if (!incrementButton) {
    if (log) log.warn("Could not find weight increment button");
    return false;
  }

  // Get current weight
  const getCurrentWeight = async (): Promise<number> => {
    for (const selector of weightSelectors) {
      try {
        const elements = await page.locator(selector).all();
        for (const el of elements) {
          const text = await el.textContent();
          if (text) {
            // Extract number from text like "1.3 kg" or "1.3kg" or "1,3 kg"
            const match = text.replace(',', '.').match(/(\d+\.?\d*)\s*kg/i);
            if (match) {
              return parseFloat(match[1]);
            }
          }
        }
      } catch {
        continue;
      }
    }
    return 0;
  };

  let currentWeight = await getCurrentWeight();
  if (log) log.info(`Current weight: ${currentWeight}kg, Target: ${targetKg}kg`);

  if (currentWeight === 0) {
    if (log) log.warn("Could not detect current weight");
    return false;
  }

  // Click + until we reach target (with 15% tolerance)
  const maxClicks = 50; // Safety limit
  let clicks = 0;

  while (currentWeight < targetKg * 0.85 && clicks < maxClicks) {
    await incrementButton.click();
    await page.waitForTimeout(500); // Wait for weight to update
    
    const newWeight = await getCurrentWeight();
    
    if (newWeight === currentWeight) {
      // Weight didn't change, might have reached max
      if (log) log.warn(`Weight stuck at ${currentWeight}kg`);
      break;
    }
    
    currentWeight = newWeight;
    clicks++;
    
    if (log && clicks % 3 === 0) {
      log.info(`Adjusted to ${currentWeight}kg (target: ${targetKg}kg)`);
    }
    
    // Check if we're close enough (within 15% tolerance)
    if (currentWeight >= targetKg * 0.85 && currentWeight <= targetKg * 1.15) {
      if (log) log.info(`✓ Reached ${currentWeight}kg (close enough to ${targetKg}kg)`);
      return true;
    }
  }

  const finalWeight = await getCurrentWeight();
  if (log) log.info(`Final weight: ${finalWeight}kg after ${clicks} clicks`);

  // Check if we got reasonably close (within 20% for final check)
  return finalWeight >= targetKg * 0.8 && finalWeight <= targetKg * 1.2;
}

