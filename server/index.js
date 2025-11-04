import express from "express";
import cors from "cors";
import axios from "axios";
import { XMLParser } from "fast-xml-parser";
import https from "https";
import followRedirects from "follow-redirects";
const { https: followHttps } = followRedirects;

const app = express();
const PORT = 2000;

app.use(cors());


// --- helper: safely parse dates
function formatDate(dateString) {
  if (!dateString) return null;
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return null;
  return {
    year: date.getFullYear(),
    month: date.toLocaleString("en-US", { month: "long" }),
    day: date.getDate().toString().padStart(2, "0"),
    iso: date.toISOString(),
  };
}

// --- fetch RSS for given query
async function fetchNews(query) {
  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(
    query
  )}&hl=bn&gl=BD&ceid=BD:bn`;

  try {
    const res = await axios.get(rssUrl, { timeout: 10000 });
    const parser = new XMLParser();
    const data = parser.parse(res.data);
    const items = data?.rss?.channel?.item || [];
    return items
      .map((item) => {
        const d = formatDate(item.pubDate);
        if (!d) return null;
        return {
          title: item.title,
          link: item.link,
          pubDate: item.pubDate,
          year: d.year,
          month: d.month,
          day: d.day,
          isoDate: d.iso,
        };
      })
      .filter(Boolean);
  } catch (err) {
    console.error("❌ RSS error:", err.message);
    return [];
  }
}

// --- fetch across years
async function fetchAllYears(baseQuery) {
  const YEARS = Array.from({ length: 25 }, (_, i) => 2025 - i);
  let results = [];
  for (const y of YEARS) {
    console.log(`🗓️ Fetching: ${baseQuery} ${y}`);
    const r = await fetchNews(`${baseQuery} ${y}`);
    results = [...results, ...r];
    await new Promise((r) => setTimeout(r, 1000));
  }
  const seen = new Set();
  const unique = results.filter((i) => {
    const k = i.link;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  unique.sort((a, b) => new Date(b.isoDate) - new Date(a.isoDate));
  return unique;
}

// --- main /api/news
app.get("/api/news", async (req, res) => {
  const query = req.query.query?.trim();
  if (!query)
    return res.status(400).json({
      error: "Missing query param",
    });
  const data = await fetchAllYears(query);
  res.json({ query, count: data.length, items: data });
});

// --- 🚀 FIXED /api/proxy route
app.get("/api/proxy", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send("Missing 'url' parameter");

  try {
    console.log("🔗 Resolving redirect for:", targetUrl);

    // Step 1 — Follow redirect manually using follow-redirects
    const resolvedUrl = await new Promise((resolve, reject) => {
      followHttps.get(targetUrl, (resp) => {
        const finalUrl = resp.responseUrl || targetUrl;
        resolve(finalUrl);
      }).on("error", reject);
    });

    console.log("✅ Final article URL:", resolvedUrl);

    // Step 2 — Fetch actual page HTML
    const finalResp = await axios.get(resolvedUrl, {
      responseType: "text",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      },
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    });

    let html = finalResp.data;

    // Step 3 — remove scripts + CSP meta
    html = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(
        /<meta[^>]+http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi,
        ""
      );

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("X-Frame-Options", "ALLOWALL");
    res.setHeader("Content-Security-Policy", "frame-ancestors *");
    res.send(html);
  } catch (err) {
    console.error("❌ Proxy error:", err.message);
    res.status(500).send(`
      <div style="background:#111;color:#f55;padding:2rem;font-family:monospace;">
        <h3>⚠️ Proxy failed</h3>
        <p>${err.message}</p>
      </div>
    `);
  }
});

app.listen(PORT, () =>
  console.log(`🚀 Server running → http://localhost:${PORT}`)
);
