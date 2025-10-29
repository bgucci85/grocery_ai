# 🛒 Groceries Autocart (Barbora + Rimi)

A local-first web app that automatically adds grocery items to your cart on **barbora.lt** and **rimi.lt** using Playwright browser automation.

## 🎯 Features

- **Two-site support**: Barbora.lt and Rimi.lt
- **Simple & JSON input modes**: Paste line-by-line from Excel/Sheets, or use structured JSON
- **🤖 Dual LLM System**: 
  - **List Parser (GPT-4o)**: Intelligently parses your raw list into structured items
  - **Product Selector (GPT-4o)**: Understands semantics, reasons about quantities, handles substitutions
- **"arba" (or) alternatives**: List multiple options per item, AI tries them in order until one succeeds
- **Transparent reasoning**: Both AI agents explain every decision
- **Semantic understanding**: Knows "apelsinai" = "dideli apelsinai" = "oranges"
- **Quantity intelligence**: Automatically calculates units needed (want 2kg, found 1kg → add 2)
- **Persistent sessions**: Login once, sessions saved via browser profiles
- **Live streaming logs**: Real-time feedback with agent reasoning
- **Multi-strategy search**: Automatically tries variations if first search fails
- **Headful/headless modes**: Watch the automation or run in background
- **Auto-navigate to cart**: Opens cart page for review after adding items
- **Browser stays open**: In headful mode, review and checkout at your leisure
- **Fallback detection**: Multiple strategies to find products even with complex DOM

## 📋 Prerequisites

- **Node.js** 18+ 
- **npm** or **yarn**
- For OpenAI features (optional): OpenAI API key

## 🚀 Quick Start

### 1. Install dependencies

```bash
npm install
```

This will automatically install Playwright and Chromium via the `postinstall` script.

If you need to manually install Playwright:

```bash
npm i -D playwright
npx playwright install chromium
```

### 2. (Optional) Configure OpenAI

If you want to use OpenAI for better product matching:

```bash
echo "OPENAI_API_KEY=sk-..." > .env.local
```

### 3. Run the development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## 📖 How to Use

### First Run (Login)

1. Paste your items in **Simple Mode** (default) - separate text areas for Barbora and Rimi
2. Click **"Add to carts"** (AI Agent and Headful mode are always enabled)
3. Browser windows will open for each site
4. **Manually log in** to Barbora/Rimi when prompted (90 seconds to login)
5. Watch the AI agent work - it will show reasoning in the logs
6. **Browser stays open** - Review your cart and checkout manually
7. Close the browser window when done

**Sessions are saved!** Subsequent runs won't require login.

### Subsequent Runs

1. Paste your items (Simple or JSON mode)
2. Click **"Add to carts"**
3. Watch the AI agent's reasoning in live logs
4. If using "arba" alternatives, see which option succeeded
5. Browser opens and adds items automatically
6. Review cart in browser, then checkout manually
7. Close browser when done

**Note:** The app runs in headful mode with AI agent always enabled for best results!

## 📝 Input Formats

### Simple Mode (Recommended) 🤖

The easiest way to add items - perfect for pasting from Excel/Google Sheets. Uses **GPT-4o to intelligently parse** your list!

**Barbora Items:**
```
* 2 vnt apelsinai
* 10 vnt kiausiniai arba https://barbora.lt/produktai/laisvai-laikomu-vistu-kiausiniai-10-vnt
* pienas 1L
* 1500-2200 g mėsos užkandžiai
```

**Rimi Items:**
```
2 vnt duona arba ruginė duona
bananai 1kg
```

#### Simple Mode Features:

- **🤖 LLM-powered parsing** - GPT-4o understands your list format
- **One item per line** - paste directly from spreadsheets (bullet points auto-removed)
- **Flexible quantity format** - `2 vnt`, `1500-2200 g`, `3 kg`, etc.
- **"arba" alternatives** - list multiple options, AI tries them in order:
  - `product arba URL arba another product`
  - Stops at first success
  - Perfect for out-of-stock scenarios
- **URLs supported** - paste full product links anywhere
- **Mixed formats** - combine all the above!
- **Preserves quantity across alternatives** - "2 vnt item arba URL" means 2 of whichever succeeds

#### Simple Mode Examples:

```
2 vnt apelsinai
10 vnt kiausiniai arba https://barbora.lt/produktai/kiausiniai-10vnt
duona arba ruginė duona arba https://barbora.lt/produktai/juoda-duona
https://barbora.lt/produktai/pienas-1l
500 g sūris arba hard cheese arba https://barbora.lt/produktai/suris-500g
```

### JSON Mode (Advanced)

For structured input with full control:

```json
[
  {
    "site": "barbora",
    "url": "https://www.barbora.lt/produktas/pienas-1L",
    "qty": 2
  },
  {
    "site": "rimi",
    "query": "bananai 1kg"
  },
  {
    "site": "barbora",
    "query": "kiausiniai 10 vnt",
    "qty": 1
  }
]
```

### Field Reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `site` | `"barbora"` \| `"rimi"` | ✅ Yes | Target grocery site |
| `url` | `string` | One of `url` or `query` | Direct product URL |
| `query` | `string` | One of `url` or `query` | Search query (e.g., "apelsinai 2kg") |
| `qty` | `number` | No (default: 1) | Quantity to add |

## 🧰 Tech Stack

- **Next.js 14** (App Router) with TypeScript
- **Playwright** for browser automation
- **Tailwind CSS** for styling
- **OpenAI SDK** (optional, for product matching)
- **string-similarity** for fuzzy matching

## 📂 Project Structure

```
groceries_ai/
├── app/
│   ├── api/run/route.ts      # Streaming API endpoint
│   ├── page.tsx               # Main UI
│   ├── layout.tsx             # Root layout
│   └── globals.css            # Global styles
├── lib/
│   ├── runner.ts              # Orchestration logic
│   ├── drivers/
│   │   ├── barbora.ts         # Barbora.lt driver
│   │   └── rimi.ts            # Rimi.lt driver
│   └── utils/
│       ├── log.ts             # Logging utilities
│       ├── selectors.ts       # DOM helpers
│       └── ai.ts              # OpenAI integration
├── .userdata/                 # Persistent browser profiles (created at runtime)
│   ├── barbora/
│   └── rimi/
├── package.json
├── tsconfig.json
└── README.md
```

## ⚙️ Configuration

### Environment Variables

Create a `.env.local` file (optional):

```bash
# Optional: Only needed for OpenAI product matching
OPENAI_API_KEY=sk-...
```

### Persistent Browser Profiles

Browser sessions are saved in `./.userdata/<site>/`:

- `./.userdata/barbora/` - Barbora.lt session
- `./.userdata/rimi/` - Rimi.lt session

**First run**: You'll need to log in manually (if headful mode is enabled).  
**Subsequent runs**: Sessions are automatically restored.

To reset sessions, delete the `.userdata` directory:

```bash
rm -rf .userdata
```

## 🤖 Dual LLM System - TRUE INTELLIGENCE!

The app uses **two GPT-4o agents** working together for maximum intelligence and accuracy:

### 1. List Parser Agent (Simple Mode Only)

When you paste items in **Simple Mode**, the first agent parses your raw text:

**Input:**
```
* 2 vnt duonelės skrudinti FAZER STREET FOOD, 330 g
* 2 vnt duonelės TOSTE arba https://barbora.lt/... arba https://barbora.lt/...
* 1500-2200 g prekės iš skilties "mėsos užkandžiai ir dešrelės"
```

**What the Parser Does:**
- ✅ Extracts quantity from any format (`2 vnt`, `1500-2200 g`, etc.)
- ✅ Identifies "arba" alternatives and splits them correctly
- ✅ Distinguishes between URLs and search queries
- ✅ Removes bullet points and cleans formatting
- ✅ **Preserves quantity across all alternatives** (crucial!)

**Output (Structured):**
```json
[
  { "description": "duonelės FAZER", "quantity": 2, "alternatives": [
    { "type": "query", "value": "duonelės skrudinti FAZER STREET FOOD, 330 g" }
  ]},
  { "description": "duonelės TOSTE", "quantity": 2, "alternatives": [
    { "type": "query", "value": "duonelės Viso grūdo duonelės TOSTE, 220 g" },
    { "type": "url", "value": "https://barbora.lt/..." },
    { "type": "url", "value": "https://barbora.lt/..." }
  ]}
]
```

💡 **Why This Matters**: The parser ensures that `2 vnt` applies to ALL alternatives, so whether the first, second, or third option succeeds, you get 2 units!

### 2. Product Selector Agent (Always Enabled)

A **full GPT-4o agent** makes all product selection decisions:

### What Makes This Different
This is **NOT** pattern matching or scoring algorithms. It's a **true LLM agent** that:

✅ **Understands semantic equivalence**: "apelsinai" = "dideli apelsinai" = "large oranges"  
✅ **Reasons about quantities**: Want 2kg, found 1kg? → Automatically adds 2 units  
✅ **Handles substitutions**: Regular product out of stock? Picks best alternative  
✅ **Explains decisions**: Shows transparent reasoning for every choice  
✅ **Uses common sense**: Knows Lithuanian, understands food, makes human-level decisions  

### Real Example
```
Query: "apelsinai 2kg"
Found: "Dideli apelsinai, 1 kg", "Ekologiški apelsinai, 500g", "Obuoliai"

🤖 Agent Analysis:
[Agent] ✓ Selected: "Dideli apelsinai, 1 kg"
[Agent] Quantity: 2 units
[Agent] Reasoning: "User wants 2kg of oranges. Product is 'Dideli apelsinai' 
        (large oranges) at 1kg each. 'Dideli' is just a size variant of 
        'apelsinai' - same fruit, just larger size. Need 2 units for 2kg. 
        The 500g option would need 4 units. Apples don't match."
[Agent] Confidence: 95%
✅ Adds 2x 1kg oranges to cart
```

**Cost**: ~$0.005 per query item (~half a cent!)  
**See `AI_AGENT_FEATURES.md` for full details!**

## 🐛 Troubleshooting

### Playwright Installation Issues

```bash
# Manually install Chromium
npx playwright install chromium

# Or install all browsers
npx playwright install
```

### "Cannot find module" Errors

```bash
# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### Login Issues

- Enable **headful mode** on first run
- Make sure popup blockers aren't interfering
- Try manually navigating to the site first
- Delete `.userdata` and retry

### Product Not Found

- Check query spelling (case-insensitive)
- Try more specific queries (e.g., "2kg" instead of "large")
- Enable OpenAI assist for better matching
- Verify the product exists on the site

### Quantity Not Working

Some products don't support quantity controls in the UI. The app will:
1. Try to find `+` increment buttons
2. Log a warning if quantity controls aren't found
3. Add only 1 item and continue

## 🔒 Security & Compliance

- **Local use only**: Not intended for production deployment
- **No credential storage**: Relies on browser session persistence
- **Respects ToS**: Use responsibly and within site terms of service
- **No database**: No personal data stored outside browser profiles

## 🚫 Deployment Limitations

**This app cannot run on serverless platforms like Vercel** because:
- Playwright requires a persistent filesystem for browser profiles
- Serverless functions have read-only filesystems
- Browser automation needs long-running processes

### Recommended Hosting:

- **Local machine** (primary use case)
- **VPS** (DigitalOcean, Linode, etc.)
- **Container platforms** (Railway, Fly.io, Render)

## 📜 License

MIT License - Personal use. Not affiliated with Barbora or Rimi.

## 🙏 Credits

Built with:
- [Next.js](https://nextjs.org/)
- [Playwright](https://playwright.dev/)
- [OpenAI](https://openai.com/)
- [Tailwind CSS](https://tailwindcss.com/)

---

**Made for personal grocery automation** 🥕🍞🥛

