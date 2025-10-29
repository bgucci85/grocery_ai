# 🚀 Quick Setup Guide

## Step-by-Step Installation

### 1. Install Dependencies

```bash
npm install
```

This command will:
- Install all Node.js dependencies
- Automatically install Playwright
- Download Chromium browser

### 2. (Optional) Add OpenAI API Key

Only needed if you want AI-powered product matching:

```bash
# Create .env.local file
touch .env.local

# Add your OpenAI key
echo "OPENAI_API_KEY=sk-your-key-here" >> .env.local
```

### 3. Start the Development Server

```bash
npm run dev
```

The app will be available at: **http://localhost:3000**

## First-Time Usage

### Login Flow (First Run Only)

1. Open http://localhost:3000
2. Paste your items JSON (or use the sample)
3. Click **"Add to carts"** (AI Agent + Headful mode are always enabled)
4. Browser windows will open
5. **Manually log into Barbora and/or Rimi** when the browser opens (90 seconds)
6. Watch the AI agent work and explain its decisions in the logs
7. **Browser stays open** showing your cart - Review and checkout manually
8. Close the browser window when you're done

### Sessions Are Saved!

After the first run:
- Your login sessions are saved in `./.userdata/`
- Future runs don't require manual login
- Browser always opens (headful mode) for you to review the cart
- AI agent is always enabled for intelligent product selection

## Testing

### Sample Test Data

```json
[
  {
    "site": "barbora",
    "query": "pienas 1L",
    "qty": 1
  },
  {
    "site": "rimi", 
    "query": "duona",
    "qty": 1
  }
]
```

### Recommended First Test

Start with just 1-2 items to verify everything works before adding your full grocery list.

## Common Issues

### Issue: "Playwright not installed"

**Solution:**
```bash
npx playwright install chromium
```

### Issue: Can't log in

**Solution:**
- Make sure "Headful mode" is checked
- Disable password managers that might interfere
- Try logging in manually first in a regular browser

### Issue: Product not found

**Solution:**
- Use more specific queries (e.g., "pienas 2.5% 1L" instead of just "milk")
- Try the direct product URL instead of a query
- Enable "Use OpenAI assist" for better matching

### Issue: Timeout errors

**Solution:**
- Check your internet connection
- The sites might be slow - the script has built-in waiting
- Try running with "Headful mode" to see what's happening

## Next Steps

Once setup is complete:
1. Prepare your grocery list in JSON format
2. Run with headful mode first to verify
3. Switch to headless for regular use
4. Check the live logs for any issues

## Need Help?

Check the main README.md for:
- Full JSON format reference
- Architecture details
- Troubleshooting guide
- Advanced configuration

---

**Ready to automate your grocery shopping!** 🛒✨

