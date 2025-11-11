# 🛡️ Cloudflare Bypass Strategies

## 🎯 Current Implementation (Hybrid Approach)

We use a **pragmatic hybrid strategy** that combines:
1. **Playwright-extra with stealth plugin** - Properly masks all automation markers
2. **Automatic challenge detection** when Cloudflare appears
3. **Seamless manual solving** - you solve the CAPTCHA once, we handle the rest

### ⭐ Key Upgrade: Stealth Plugin

Based on the [Browserless blog post](https://www.browserless.io/blog/bypass-cloudflare-with-playwright), we now use `playwright-extra` with `puppeteer-extra-plugin-stealth` instead of manual overrides. 

**Why this matters:** Your regular Chrome browser doesn't trigger Cloudflare because it lacks automation markers. Standard Playwright has detectable signatures even with manual patches. The stealth plugin properly masks these at a low level:

- `navigator.webdriver` (Cloudflare's #1 detection method)
- Chrome runtime objects and APIs
- WebGL and canvas fingerprints
- Plugin and permission APIs  
- Headless-specific behaviors
- 50+ other automation markers

**Result:** The browser fingerprint now matches real Chrome much more closely.

### How It Works

When you run the app:
1. Browser opens with stealth configuration
2. If Cloudflare challenge appears → **Logs pause and notify you**
3. You solve the CAPTCHA manually (takes 5 seconds)
4. Automation resumes automatically
5. Session is saved - no CAPTCHA on future runs!

---

## Anti-Detection Layers

We've implemented multiple layers of anti-detection to bypass Cloudflare's bot protection:

### 1. Stealth Plugin (Primary Defense) ⭐
- **Using `playwright-extra` + `puppeteer-extra-plugin-stealth`**
  - Automatically patches 50+ automation markers
  - Masks `navigator.webdriver` properly
  - Fixes WebGL, canvas, and plugin fingerprints
  - Handles permissions API realistically
  - More reliable than manual overrides

### 2. Browser Configuration
- **Using Real Chrome**: Changed from Chromium to Chrome (`channel: 'chrome'`)
  - Cloudflare trusts Chrome more than Chromium
  - Requires Chrome installed at `/Applications/Google Chrome.app`
  
- **Realistic User Agent**: 
  ```
  Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 
  (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36
  ```

- **Locale & Timezone**: 
  - `locale: 'en-US'`
  - `timezoneId: 'Europe/Vilnius'` (matches Barbora/Rimi location)

- **Randomized Viewport**: `1280-1480 x 720-920` (randomized to avoid fingerprint consistency)

### 3. Launch Arguments (Anti-Detection)
```javascript
args: [
  '--disable-blink-features=AutomationControlled',  // Critical: removes automation flag
  '--disable-features=IsolateOrigins,site-per-process',
  '--disable-site-isolation-trials',
  '--disable-dev-shm-usage',
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--window-size=1920,1080',
  '--start-maximized'
],
ignoreDefaultArgs: ['--enable-automation']  // Removes automation flag
```

### 4. Human-Like Behavior
- Random mouse movements on page load
- Random delays (500-1500ms)
- Persistent browser context (saves cookies/sessions)
- Randomized viewport dimensions on each launch

### 5. Automatic Challenge Detection ⭐
The app now automatically detects when Cloudflare appears and:
- **Pauses automation** with clear warning in logs
- **Prompts you** to solve the CAPTCHA manually
- **Waits up to 60 seconds** for you to complete it
- **Automatically resumes** once challenge is solved
- **Saves the session** so you won't see it again

**Detected challenges:**
- "Verify you are human" pages
- Cloudflare security checks
- CAPTCHA challenges
- Ray ID error pages

## Testing The Fix

### **Step 1: Clear old sessions**
```bash
rm -rf /Users/bernard/Documents/CursorAI/groceries_ai/.userdata
```

### **Step 2: Run the app** 
Go to http://localhost:3000 and start your grocery list

### **Step 3: Watch the logs**

**Scenario A - No Challenge (Best Case)** ✅
```
[barbora] Navigating to home page...
[barbora] Already logged in (session restored)
```
The app goes straight to shopping - no CAPTCHA!

**Scenario B - Challenge Detected (Expected)** ⚠️
```
⚠️  [barbora] Cloudflare challenge detected!
📋 [barbora] Please solve the CAPTCHA manually in the browser window
⏳ [barbora] Waiting up to 60 seconds for you to complete the challenge...
```

**What to do:**
1. Look at the browser window (should be visible)
2. Click the Cloudflare checkbox
3. Complete any additional challenges
4. Wait for the log to show:
   ```
   ✅ [barbora] Cloudflare challenge solved! Continuing...
   ```
5. Automation resumes automatically!

### **Step 4: Verify Session Saved**
Run the app again - you should NOT see the challenge anymore! The session is saved in `.userdata/`.

## If Still Blocked

### Option 1: Manual Pre-Login
1. Clear `.userdata` folder
2. Run the app
3. Manually navigate to barbora.lt in the opened browser
4. Log in manually and browse around for 30-60 seconds (builds trust)
5. Close browser
6. Run app again - session should be saved

### Option 2: Use Proxy/VPN
Cloudflare may be blocking your IP. Try:
- VPN to Lithuania (matches site location)
- Residential proxy service

### Option 3: Increase Random Delays
Edit `lib/runner.ts` line 305:
```typescript
await page.waitForTimeout(2000 + Math.random() * 3000); // 2-5 second delay
```

### Option 4: Add Cookie from Real Browser
1. Log into barbora.lt in your regular Chrome
2. Open DevTools → Application → Cookies
3. Copy the session cookie
4. Inject it programmatically:
   ```typescript
   await page.context().addCookies([{
     name: 'session_cookie_name',
     value: 'your_cookie_value',
     domain: '.barbora.lt',
     path: '/'
   }]);
   ```

### Option 5: Request Rate Limiting
If Cloudflare thinks you're scraping too fast:
- Add longer delays between items (currently 500ms)
- Randomize delays: `Math.random() * 2000 + 1000` (1-3 seconds)

### Option 6: Try Firefox Instead
Firefox is sometimes less detected:
```typescript
import { firefox } from 'playwright';
// Change chromium to firefox
```

## Why This Happens

Cloudflare uses multiple detection methods:
1. **navigator.webdriver** check (we fixed)
2. **Automation flags** in Chrome args (we fixed)
3. **Missing browser features** (we mocked them)
4. **Behavioral analysis**: Too fast, too predictable (we added randomness)
5. **TLS fingerprinting**: Chrome vs Chromium differences (we switched to Chrome)
6. **IP reputation**: Your IP may be flagged (use VPN if needed)

## Success Indicators

You've bypassed Cloudflare if:
- ✅ Site loads without challenge
- ✅ Challenge appears once, you solve it, then it never comes back
- ✅ Items add to cart successfully
- ✅ No repeated challenges on subsequent runs

## Nuclear Option: Disable Cloudflare Check (Not Recommended)

Some users report success with:
```typescript
await page.route('**/*.js', route => {
  if (route.request().url().includes('cloudflare')) {
    route.abort();
  } else {
    route.continue();
  }
});
```

⚠️ **Warning**: This may break site functionality!

## Current Status

After implementing all measures above:
- ✅ Using real Chrome instead of Chromium
- ✅ All automation markers masked
- ✅ Realistic browser fingerprint
- ✅ Human-like behavior (delays, mouse movements)
- ✅ Persistent context (saves sessions)

**Try it now and let me know the result!** 🚀

