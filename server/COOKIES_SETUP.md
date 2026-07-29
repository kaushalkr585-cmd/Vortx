# VORTX — YouTube Cookies Setup Guide

This guide explains how to configure YouTube cookies for production deployment on Render.com (or any cloud platform).

## Why Cookies Are Required

YouTube detects server-side requests from datacenter IPs (like Render, Railway, Fly.io) and blocks them unless a valid authenticated browser session is provided via cookies. This is not a bug — it is YouTube's bot protection.

## Step 1 — Export Cookies from Your Browser

### Chrome / Brave / Edge

1. Install the extension: **"Get cookies.txt LOCALLY"** from the Chrome Web Store
   - URL: https://chromewebstore.google.com/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc
2. Make sure you are **signed in to YouTube** in your browser
3. Visit: https://www.youtube.com
4. Click the extension icon in your browser toolbar
5. Select **"Export"** → choose **"youtube.com"**
6. Save the downloaded file — it will look like this:

```
# Netscape HTTP Cookie File
# https://curl.haxx.se/rfc/cookie_spec.html
# This is a generated file! Do not edit.

.youtube.com  TRUE  /  TRUE  1234567890  SAPISID  AbCdEfGhIjKlMnOp...
.youtube.com  TRUE  /  TRUE  1234567890  __Secure-3PSID  g.a000_...
...
```

### Firefox

1. Install the extension: **"cookies.txt"** by Lennon Hill
2. Visit: https://www.youtube.com (make sure you're signed in)
3. Click the extension icon → **"Export for current tab"**

---

## Step 2 — Add to Render Environment Variables

1. Go to your Render service dashboard
2. Click **"Environment"** in the left sidebar
3. Click **"Add Environment Variable"**
4. Set:
   - **Key:** `YOUTUBE_COOKIES`
   - **Value:** Paste the **entire contents** of your cookies.txt file
5. Click **"Save Changes"**
6. Render will automatically restart your service

### Important Notes

- **The cookies contain your Google session tokens.** Treat them like a password. Never commit them to git.
- **Cookies expire.** YouTube session cookies typically last 6–12 months. If downloads start failing again, re-export and update the env var.
- **The `.gitignore` file already excludes `cookies.txt` and `server/cookies.txt`** so they will never be accidentally committed.

---

## Step 3 — Verify It's Working

After deploying, visit:

```
https://your-app.onrender.com/api/cookies/status
```

You should see:
```json
{
  "configured": true,
  "valid": true,
  "message": "Cookies are configured and appear valid."
}
```

And for full health:
```
https://your-app.onrender.com/api/health
```

---

## Local Development

For local development, the server automatically looks for `server/cookies.txt`.
You do not need to set any environment variables locally.

The file has already been created for you in `server/cookies.txt`.

---

## Cookie Refresh

If you see the error `BOT_DETECTED` or `Sign in to confirm you're not a bot`:

1. Sign out and back into YouTube in your browser
2. Re-export the cookies using the extension above
3. Update the `YOUTUBE_COOKIES` env var on Render with the new cookie contents
4. Restart the Render service

---

## Security

- `server/cookies.txt` is listed in `.gitignore` — it will NEVER be committed to git
- Cookies are only read server-side and never sent to the frontend
- The `/api/cookies/status` endpoint only returns whether cookies are configured — it never exposes cookie values
