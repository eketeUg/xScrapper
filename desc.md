What It Should Do:

1. Scrape Twitter/X Influencers

Only include accounts that meet these filters:
• 👤 50,000+ followers
• 🔵 Blue check (verified)
• 🧠 Niche: Crypto / Forex / Stocks
• 🌐 Bio or tweets contain t.me/... link
• 🗣️ Bio or tweet is in:
• Turkish (tr)
• Persian (fa)
• Brazilian Portuguese (pt)
• English (en)

⸻

2. Detect & Classify Telegram Handles
   • Extract all t.me/... links
   • Check each Telegram handle’s status:
   • ✅ Available = free to register now
   • ⚠️ Abandoned/hijacked = doesn’t match influencer but still active
   • ❌ In use by influencer = still actively maintained

⸻

3. Log & Store All Handles

For each Telegram link, save:
• Twitter username + URL
• Followers
• Language
• Verified status
• Link source (bio or tweet)
• Telegram handle
• Status (available, hijacked, in-use)
• Hijack Score (see below)
• Timestamp of last check

⸻

4. Rank Hijack Opportunities

Each handle should be scored from 0–100 based on:
Factor
Weight
Follower count
High
Verified (blue check)
Medium
Link in bio vs tweet
High
Niche keyword match (crypto/forex/stocks)
High
Language (TR/FA/PT/EN)
Medium
Account activity (tweeted recently)
High
Handle status (available > hijacked > in-use)

Ongoing Monitoring + Telegram Alerts
• Recheck stored handles every 12 hours
• Trigger Telegram bot alerts when:
• A previously unavailable handle becomes available
• A handle appears abandoned or mismatched
• A verified influencer is leaking traffic to a hijackable handle

“A verified influencer is leaking traffic to a hijackable handle”

This happens when:

✅ What’s Going On:

1.  A verified Twitter/X influencer (blue check) has a Telegram link (e.g. t.me/traderelite) in their bio or tweet.
2.  But that Telegram handle is no longer controlled by the influencer:
    • They abandoned it.
    • They changed to a new group but forgot to update the link.
    • It was hacked or hijacked.
3.  So, people clicking that link are being redirected to a different group — not the original one the influencer intended.

This means:
• Their audience is still clicking the old link.
• The influencer is unknowingly sending traffic (views, followers) to someone else’s Telegram.

That’s what we call “leaking traffic” — like a pipe still flowing into the wrong bucket.
