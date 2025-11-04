import express from "express";
import cors from "cors";
import axios from "axios";
import { XMLParser } from "fast-xml-parser";
import fs from "fs";
import path from "path";
import slugify from "slugify";
import { fileURLToPath } from "url";

// ---- Setup paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "data");

// Ensure ./data exists
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const app = express();
const PORT = 2000;

app.use(cors());

// ---------- Helpers
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

function extractMetaAndText(html) {
  // Very lightweight extraction (no jsdom)
  // Title
  const titleMatch =
    html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<title[^>]*>([^<]+)<\/title>/i);
  const title =
    (titleMatch && titleMatch[1]) ? titleMatch[1].trim() : null;

  // Description
  const descMatch =
    html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i);
  const description =
    (descMatch && descMatch[1]) ? descMatch[1].trim() : null;

  // Very naive main text: strip tags and compress spaces
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Short preview
  const preview = text.slice(0, 1200);

  return { title, description, preview };
}

async function fetchNews(query) {
  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(
    query
  )}&hl=bn&gl=BD&ceid=BD:bn`;

  try {
    const res = await axios.get(rssUrl, { timeout: 12000 });
    const parser = new XMLParser();
    const data = parser.parse(res.data);
    const items = data?.rss?.channel?.item || [];

    const parsedItems = items
      .map((item) => {
        const dateInfo = formatDate(item.pubDate);
        if (!dateInfo) return null;
        return {
          title: item.title,
          link: item.link,
          pubDate: item.pubDate,
          year: dateInfo.year,
          month: dateInfo.month,
          day: dateInfo.day,
          isoDate: dateInfo.iso,
        };
      })
      .filter(Boolean);

    console.log(`📦 [${query}] → ${parsedItems.length} items`);
    return parsedItems;
  } catch (err) {
    console.error(`❌ Failed to fetch RSS for "${query}":`, err.message);
    return [];
  }
}

async function fetchAllYears(baseQuery) {
  // 2025 -> 2001 (25 years)
  const YEARS = Array.from({ length: 25 }, (_, i) => 2025 - i);
  let allResults = [];

  for (const year of YEARS) {
    console.log(`🗓️ Fetching: ${baseQuery} ${year}`);
    const results = await fetchNews(`${baseQuery} ${year}`);
    allResults = [...allResults, ...results];
    await new Promise((r) => setTimeout(r, 900)); // polite delay
  }

  // De-duplicate by link (fallback title)
  const unique = [];
  const seen = new Set();
  for (const item of allResults) {
    const key = item.link || item.title;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(item);
    }
  }

  unique.sort((a, b) => new Date(b.isoDate) - new Date(a.isoDate));
  console.log(`✅ Total unique: ${unique.length} news articles`);
  return unique;
}

function saveResultToDisk(baseQuery, payload) {
  const slug = slugify(baseQuery, { lower: true, strict: true });
  const outFile = path.join(DATA_DIR, `${slug}.json`);
  fs.writeFileSync(outFile, JSON.stringify(payload, null, 2), "utf-8");
  return { slug, file: outFile };
}

// ---------- Endpoints

// 1) Main: scrape & (optionally) expand each link with lightweight content
//    GET /api/news?query=...&expand=1&limit=200
app.get("/api/news", async (req, res) => {
  const query = req.query.query?.trim();
  const expand = req.query.expand === "1";
  const limit = Math.max(1, Math.min(parseInt(req.query.limit || "200", 10) || 200, 1000));

  if (!query) {
    return res.status(400).json({
      error: "Please provide a search term using '?query=' parameter.",
      example: "/api/news?query=AI&expand=1",
    });
  }

  try {
    const items = await fetchAllYears(query);
    const limited = items.slice(0, limit);

    let expanded = limited;
    if (expand) {
      console.log(`🧠 Expanding ${limited.length} pages...`);
      // Fetch each page HTML and extract basic info
      const results = [];
      for (const it of limited) {
        let extra = {};
        try {
          const resp = await axios.get(it.link, {
            maxRedirects: 5,
            timeout: 15000,
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
              Accept:
                "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
            },
          });
          extra = extractMetaAndText(resp.data);
        } catch (e) {
          extra = { error: "Fetch failed or blocked" };
        }
        results.push({ ...it, extracted: extra });
        await new Promise((r) => setTimeout(r, 200)); // polite throttle
      }
      expanded = results;
    }

    const payload = {
      query,
      count: items.length,
      returned: expanded.length,
      items: expanded,
      lastUpdated: new Date().toISOString(),
    };

    const saved = saveResultToDisk(query, payload);

    res.json({
      ...payload,
      savedTo: saved.file,
      slug: saved.slug,
    });
  } catch (err) {
    console.error("❌ /api/news error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

// 2) List saved files
app.get("/api/saved", (req, res) => {
  const files = fs
    .readdirSync(DATA_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => ({
      file: f,
      slug: f.replace(/\.json$/, ""),
      path: path.join(DATA_DIR, f),
      mtime: fs.statSync(path.join(DATA_DIR, f)).mtime,
    }))
    .sort((a, b) => b.mtime - a.mtime);

  res.json({ dir: DATA_DIR, count: files.length, files });
});

// 3) Download one saved file
//    GET /api/export?query=Sheikh Hasina
app.get("/api/export", (req, res) => {
  const q = req.query.query?.trim();
  if (!q) return res.status(400).json({ error: "Missing query" });

  const slug = slugify(q, { lower: true, strict: true });
  const file = path.join(DATA_DIR, `${slug}.json`);
  if (!fs.existsSync(file)) {
    return res.status(404).json({ error: "No saved file for this query yet" });
  }
  res.download(file, `${slug}.json`);
});

// 4) Simple proxy to show an article in an iframe (best effort)
app.get("/api/proxy", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send("Missing 'url' parameter");

  try {
    const proxied = await axios.get(targetUrl, {
      maxRedirects: 5,
      timeout: 15000,
      responseType: "text",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      },
    });

    // Remove CSP + scripts to improve embeddability
    let html = proxied.data
      .replace(/<meta[^>]+http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi, "")
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "");

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("X-Frame-Options", "ALLOWALL");
    res.setHeader("Content-Security-Policy", "frame-ancestors *");
    res.send(html);
  } catch (err) {
    res.status(500).send(`<pre>Proxy failed: ${err.message}</pre>`);
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`📁 Data folder: ${DATA_DIR}`);
});
