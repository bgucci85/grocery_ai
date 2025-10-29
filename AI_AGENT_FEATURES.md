# 🤖 LLM Agent Features (GPT-4o Powered)

The app now uses a **full LLM agent** (GPT-4o) that intelligently understands your grocery queries and makes human-level decisions about product selection!

## What's New

### 🧠 True LLM Agent (Not Just Pattern Matching!)

When you enable **"Use OpenAI assist"**, the app uses **GPT-4o as an intelligent agent** that:

1. **Understands semantic equivalence** - Knows "apelsinai" = "dideli apelsinai" = "large oranges"
2. **Reasons about quantities** - Automatically calculates: want 2kg, found 1kg → add 2 units
3. **Handles substitutions** - Regular product out of stock? Picks the best alternative
4. **Explains its decisions** - Shows transparent reasoning for every choice
5. **Uses common sense** - Understands food, Lithuanian language, and shopping context

### Example: "apelsinai 2kg"

**Without AI:**
- Searches for "apelsinai"
- Finds: "Dideli apelsinai, 1 kg"
- String similarity doesn't understand "dideli" = size variant
- Might pick wrong product ❌

**With LLM Agent (GPT-4o):**
```
[INFO] 🤖 Using LLM Agent for intelligent selection...
[INFO] [Agent] Analyzing 4 products with GPT-4o...
[INFO] [Agent] ✓ Selected: "Dideli apelsinai, 1-2 d., 1 kg"
[INFO] [Agent] Quantity: 2 unit(s)
[INFO] [Agent] Reasoning: User wants 2kg of oranges. Product 0 is 'Dideli apelsinai' (large oranges) at 1kg each. 'Dideli' is just a size variant of 'apelsinai' - they're the same fruit. Need 2 units to fulfill 2kg requirement. Other products are either too small or different items.
[INFO] [Agent] Confidence: 95%
[INFO] ✓ Set quantity to 2
```
✅ **Perfect match with reasoning!**

## How The Agent Works

### Architecture

```
1. Search for products → Extract 4-20 product cards
2. Send to GPT-4o Agent with full context
3. Agent analyzes ALL products at once
4. Returns: { selectedIndex, quantity, reasoning, confidence }
5. Execute agent's decision
```

### Step 1: Product Extraction

```
[INFO] Trying search: "apelsinai"
[INFO] Found 4 products using selector: button:has-text("Į krepšelį")
```

### Step 2: Agent Analysis

The agent receives:
- **User query**: "apelsinai 2kg"
- **Product list**: All titles + prices
- **Instructions**: Understand semantic equivalence, quantities, substitutions

```
[INFO] 🤖 Using LLM Agent for intelligent selection...
[INFO] [Agent] Analyzing 4 products with GPT-4o...
```

### Step 3: Intelligent Decision

Agent uses **true reasoning** (not pattern matching):

```json
{
  "selectedIndex": 0,
  "quantity": 2,
  "reasoning": "User wants 2kg of oranges. Product 0 is 'Dideli apelsinai' (large oranges) at 1kg each. 'Dideli apelsinai' is just a size variant of 'apelsinai' - they're the same fruit, just larger size. Need 2 units to fulfill 2kg requirement. Product 1 is 500g (would need 4 units). Products 2-3 are apples, not oranges.",
  "confidence": 0.95
}
```

### Step 4: Transparent Execution

```
[INFO] [Agent] ✓ Selected: "Dideli apelsinai, 1-2 d., 1 kg"
[INFO] [Agent] Quantity: 2 unit(s)
[INFO] [Agent] Reasoning: (full explanation shown above)
[INFO] [Agent] Confidence: 95%
[INFO] ✓ Added "apelsinai 2kg" → 1 item to cart
[INFO] ✓ Set quantity to 2
```

## Examples

### Example 1: Quantity Parsing

**Query:** `"pienas 1L"`

**AI Understands:**
- Product: milk (pienas)
- Quantity: 1 liter
- Searches: "pienas", "milk", "pienas 1L"
- Prefers products with "1L", "1 L", "1 litras" in title

### Example 2: Multi-word Products

**Query:** `"juoda duona"`

**AI Understands:**
- Product: black bread (full phrase)
- No specific quantity
- Searches: "juoda duona", "black bread", "ruginė duona"

### Example 3: English + Lithuanian

**Query:** `"bananas 1kg"`

**AI Understands:**
- Works in both languages
- Generates variations: "bananas", "bananai", "bananas 1kg"

## Agent Capabilities

### 1. Semantic Understanding

The agent **truly understands** product equivalence:

| User Query | Agent Understands | Example Products Matched |
|------------|-------------------|--------------------------|
| "apelsinai" | = dideli apelsinai = oranžiniai apelsinai = oranges | "Dideli apelsinai", "Apelsinai Ispanija", "Oranges" |
| "kiaušiniai" | = kiaušiniai M = kiaušiniai L = eggs | "Kiaušiniai M 10 vnt", "Fresh eggs" |
| "pienas" | = pienas 2.5% = milk = whole milk | "Pienas 2.5%, 1L", "Milk 1 liter" |

### 2. Quantity Intelligence

Agent **automatically calculates** required units:

| User Wants | Product Found | Agent Decision |
|------------|---------------|----------------|
| "2kg" | "1 kg" | Add 2 units |
| "10 vnt" | "10 vnt" | Add 1 unit |
| "2L" | "1L" | Add 2 units |
| "500g" | "250g" | Add 2 units |

### 3. Out-of-Stock Handling

Agent **suggests alternatives** naturally:

```
Query: "apelsinai"
Products: 
  0. Apelsinai [OUT OF STOCK]
  1. Dideli apelsinai, 1 kg - 2,29 €
  2. Ekologiški apelsinai, 500 g - 3,69 €

Agent reasoning: "Regular oranges appear out of stock. Product 1 'Dideli apelsinai' is the best substitute - same fruit, just larger size, reasonably priced. Product 2 is organic which is more expensive and smaller."

Result: Selects #1
```

### 4. Common Sense Reasoning

The agent uses **world knowledge**:
- ✅ Knows Lithuanian food terms
- ✅ Understands "dideli" = large, "ekologiški" = organic
- ✅ Prefers reasonable prices (not always cheapest/most expensive)
- ✅ Recognizes "d." = days (expiry info)
- ✅ Understands packaging (bottles, bags, cartons)

## When to Use OpenAI Assist

### ✅ Enable for:
- **Complex queries** with quantities: "apelsinai 2kg", "pienas 2.5% 1L"
- **Ambiguous products**: generic terms that might have many variations
- **Multi-word products**: "juoda duona", "grietinė 20%"
- **First-time use**: to learn what works
- **Critical shopping**: when accuracy matters

### ❌ Disable for:
- **Direct URLs**: AI not needed, you already know the product
- **Simple queries**: single-word products like "duona"
- **Speed priority**: saves ~1-2 seconds per item
- **No API key**: falls back to string similarity

## Cost & Performance

### OpenAI API Usage (GPT-4o):

**Per item with query search:**
- 1 agent call: ~500-800 tokens (product list + reasoning)
- GPT-4o input: $0.0025 per 1K tokens
- GPT-4o output: $0.010 per 1K tokens  
- **Cost per item: ~$0.003-0.008** (about half a cent!)

**Per item with direct URL:**
- No agent needed, just navigates and clicks
- **Cost: $0** ✅

### Real Cost Examples:

**10-item grocery list (5 queries + 5 URLs):**
- 5 items @ $0.005 = $0.025
- 5 items @ $0 = $0
- **Total: ~$0.02-0.03** (2-3 cents!)

**100-item bulk order:**
- **~$0.20-0.30** (20-30 cents)

### Performance:

- **Agent decision time**: ~2-3 seconds per query
- **Total time saved**: Hours of manual shopping!
- **Accuracy**: Near-human level with transparent reasoning

## Configuration

### Enable in UI:
1. Check **"Use OpenAI assist"** checkbox
2. Make sure `OPENAI_API_KEY` is set in `.env.local`

### Verify It's Working:

Look for these log messages:
```
[INFO] [barbora] Parsing query with AI...
[INFO] [barbora] Parsed: product="apelsinai", qty="2kg"
[INFO] [barbora] Trying search: "apelsinai"
[INFO] [barbora] Scoring products with AI assistance...
```

## Fallback Behavior

If OpenAI is unavailable or disabled:
- Uses original query as search term
- Selects products by string similarity only
- Still works, just less intelligent

## Future Enhancements

Potential future AI capabilities:

1. **Vision-based selection** - Use GPT-4 Vision to look at product images
2. **Price optimization** - Select best value for money
3. **Substitution suggestions** - "Product unavailable, try X instead"
4. **Batch optimization** - Combine items from same category
5. **Cart review** - AI validates entire cart before checkout

## Troubleshooting

### Issue: "Parsing query with AI..." but no results

**Check:**
- Is `OPENAI_API_KEY` valid?
- Check browser console for API errors
- Try without AI first to verify search works

### Issue: Wrong product selected

**Solutions:**
- Be more specific in query: "apelsinai Ispanija 2kg"
- Use direct URL instead of query
- Check logs to see scoring - might need tuning

### Issue: Too slow

**Solutions:**
- Disable AI for simple items
- Use URLs instead of queries where possible
- Mix: AI for complex queries, no AI for simple ones

---

**The AI agent makes grocery shopping smarter, more flexible, and more forgiving of search variations!** 🛒🤖✨

