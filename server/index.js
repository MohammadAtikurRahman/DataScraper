import express from "express";
import cors from "cors";
import axios from "axios";
import { XMLParser } from "fast-xml-parser";
import fs from "fs";
import path from "path";
import slugify from "slugify";
import { fileURLToPath } from "url";
import { extract } from "@extractus/article-extractor";
import { htmlToText } from "html-to-text";

// ---------- basic setup & dirs
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "data");
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

const app = express();
app.use(cors());
const PORT = 2000;

// ---------- helpers
function formatDate(dateString) {
  if (!dateString) return null;
  const d = new Date(dateString);
  if (isNaN(d.getTime())) return null;
  return {
    year: d.getFullYear(),
    month: d.toLocaleString("en-US", { month: "long" }),
    day: d.getDate().toString().padStart(2, "0"),
    iso: d.toISOString(),
  };
}

// Pull first anchor href from RSS <description> (publisher's real URL)
function pickPublisherUrlFromDescription(desc) {
  if (!desc || typeof desc !== "string") return null;
  const m = desc.match(/<a[^>]+href="([^"]+)"/i);
  return m?.[1] || null;
}

async function fetchRssItems(query) {
  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(
    query
  )}&hl=bn&gl=BD&ceid=BD:bn`;

  try {
    const res = await axios.get(rssUrl, { timeout: 15000 });
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "@_",
      // keep description HTML
      processEntities: true
    });
    const data = parser.parse(res.data);
    const items = data?.rss?.channel?.item || [];

    const parsed = items
      .map((it) => {
        const di = formatDate(it.pubDate);
        if (!di) return null;

        const publisherUrl =
          pickPublisherUrlFromDescription(it.description) || it.link;

        return {
          title: it.title,
          link: it.link,                 // Google News link
          publisherUrl,                  // REAL article URL (we'll use this)
          pubDate: it.pubDate,
          year: di.year,
          month: di.month,
          day: di.day,
          isoDate: di.iso,
          source: it?.source?.["#text"] || null,
        };
      })
      .filter(Boolean);

    return parsed;
  } catch (e) {
    console.error(`RSS failed for "${query}":`, e.message);
    return [];
  }
}

async function fetchAllYears(baseQuery) {
  // 2025 -> 2001
  const YEARS = Array.from({ length: 25 }, (_, i) => 2025 - i);
  let all = [];
  for (const y of YEARS) {
    console.log(`🗓️ RSS: ${baseQuery} ${y}`);
    const chunk = await fetchRssItems(`${baseQuery} ${y}`);
    all = all.concat(chunk);
    await new Promise((r) => setTimeout(r, 800)); // be polite
  }

  // dedupe by publisherUrl (fallback link/title)
  const seen = new Set();
  const unique = [];
  for (const it of all) {
    const key = it.publisherUrl || it.link || it.title;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(it);
    }
  }
  unique.sort((a, b) => new Date(b.isoDate) - new Date(a.isoDate));
  console.log(`✅ Total unique: ${unique.length}`);
  return unique;
}

function saveToDisk(query, payload) {
  const slug = slugify(query, { lower: true, strict: true });
  const file = path.join(DATA_DIR, `${slug}.json`);
  fs.writeFileSync(file, JSON.stringify(payload, null, 2), "utf-8");
  return { slug, file };
}

async function expandArticle(url) {
  if (!url) throw new Error("No publisher URL");

  // Fetch raw HTML with a realistic UA
  const resp = await axios.get(url, {
    timeout: 20000,
    maxRedirects: 5,
    responseType: "text",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9"
    }
  });

  const html = resp.data;

  // Try structured article extraction (title, author, publish, text, top image)
  let rich = null;
  try {
    // Pass both URL & HTML (improves accuracy)
    rich = await extract({ url, html });
  } catch {
    // ignore; fallback will cover
  }

  // Fallback: make large plain text for sites the extractor can't parse well
  const textFallback = htmlToText(html, {
    wordwrap: 120,
    selectors: [
      { selector: "script", format: "skip" },
      { selector: "style", format: "skip" },
      { selector: "nav", format: "skip" },
      { selector: "footer", format: "skip" },
      { selector: "header", format: "skip" }
    ]
  });

  return {
    rich, // { title, content (HTML), textContent, author, published, image, url, source }
    plainText: rich?.textContent || textFallback?.slice(0, 250000) || null
  };
}

// ---------- API

// GET /api/news?query=...&expand=1&limit=200
app.get("/api/news", async (req, res) => {
  const query = req.query.query?.trim();
  const expand = req.query.expand === "1";
  const limit = Math.max(1, Math.min(parseInt(req.query.limit || "200", 10) || 200, 1000));

  if (!query) {
    return res.status(400).json({
      error: "Please provide '?query='",
      example: "/api/news?query=শেখ হাসিনা&expand=1&limit=200"
    });
  }

  try {
    const items = await fetchAllYears(query);
    const limited = items.slice(0, limit);

    let enriched = limited;
    if (expand) {
      console.log(`🧠 Expanding ${limited.length} articles...`);
      const out = [];
      for (const it of limited) {
        try {
          const art = await expandArticle(it.publisherUrl);
          const len = (art?.rich?.textContent || art?.plainText || "").length;
          console.log(`   → ${len.toString().padStart(5, " ")} chars | ${it.publisherUrl}`);
          out.push({ ...it, extracted: art });
        } catch (e) {
          console.log(`   x extract failed: ${e.message} | ${it.publisherUrl}`);
          out.push({ ...it, extracted: { error: e.message } });
        }
        // polite delay between sites
        await new Promise((r) => setTimeout(r, 180));
      }
      enriched = out;
    }

    const payload = {
      query,
      count: items.length,     // total across years
      returned: enriched.length,
      items: enriched,
      savedAt: new Date().toISOString()
    };

    const saved = saveToDisk(query, payload);
    res.json({ ...payload, savedTo: saved.file, slug: saved.slug });
  } catch (e) {
    console.error("/api/news error:", e.message);
    res.status(500).json({ error: e.message });
  }
});

// list saved files
app.get("/api/saved", (req, res) => {
  const files = fs.readdirSync(DATA_DIR)
    .filter((f) => f.endsWith(".json"))
    .map((f) => {
      const p = path.join(DATA_DIR, f);
      return {
        file: f,
        slug: f.replace(/\.json$/, ""),
        path: p,
        mtime: fs.statSync(p).mtime
      };
    })
    .sort((a, b) => b.mtime - a.mtime);

  res.json({ dir: DATA_DIR, count: files.length, files });
});

// download a saved file by query
// GET /api/export?query=শেখ হাসিনা
app.get("/api/export", (req, res) => {
  const q = req.query.query?.trim();
  if (!q) return res.status(400).json({ error: "Missing query" });

  const slug = slugify(q, { lower: true, strict: true });
  const file = path.join(DATA_DIR, `${slug}.json`);
  if (!fs.existsSync(file)) return res.status(404).json({ error: "Not found" });
  res.download(file, `${slug}.json`);
});

// server: on-demand single article extraction
// GET /api/article?url=<publisherUrl or article url>
app.get("/api/article", async (req, res) => {
  const url = (req.query.url || "").trim();
  if (!url) return res.status(400).json({ error: "Missing url" });

  try {
    // call your existing internal extractor function here:
    // const data = await extractArticle(url);
    // Fake shape shown below; adapt to your extractor’s return
    const data = await extractArticle(url); // { rich: "<html...>", plainText: "..." }

    return res.json({ url, extracted: data || { rich: null, plainText: null } });
  } catch (e) {
    console.error("article error:", e.message);
    return res.status(500).json({ error: e.message });
  }
});

// ---------- start
app.listen(PORT, () => {
  console.log(`🚀 http://localhost:${PORT}`);
  console.log(`📁 Data dir: ${DATA_DIR}`);
});
