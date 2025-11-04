// index.js (ESM) — ONE FILE solution: RSS fetcher + redirect resolver + full-text scraper + saver

import express from "express";
import cors from "cors";
import axios from "axios";
import { XMLParser } from "fast-xml-parser";
import https from "https";
import followRedirects from "follow-redirects";
import pLimit from "p-limit";
import * as cheerio from "cheerio";
import slugify from "slugify";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const { https: followHttps } = followRedirects;

// ---------- constants ----------
const PORT = 2000;
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36";
const ACCEPT =
  "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
const YEARS = Array.from({ length: 25 }, (_, i) => 2025 - i); // 2025→2001

// ---------- setup ----------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());

// ---------- utils ----------
const clean = (s) => (s ? s.replace(/\s+/g, " ").trim() : "");
const ensureDir = (p) => { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); };
const safeFileName = (str, fb = "article") =>
  (slugify(str || "", { lower: true, strict: true, trim: true }) ||
    slugify(fb, { lower: true, strict: true }))
    .replace(/^\.+/, "")
    .slice(0, 120);

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

// ---------- redirect resolver (Google News link → publisher link) ----------
async function resolveFinalUrl(gnUrl) {
  try {
    const final = await new Promise((resolve, reject) => {
      followHttps
        .get(gnUrl, { headers: { "User-Agent": UA } }, (resp) => {
          resolve(resp.responseUrl || gnUrl);
        })
        .on("error", reject);
    });
    return final;
  } catch {
    // fallback via axios if follow-redirects fails
    try {
      const resp = await axios.get(gnUrl, {
        maxRedirects: 5,
        validateStatus: (s) => s < 400,
        headers: { "User-Agent": UA },
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      });
      return resp.request?.res?.responseUrl || gnUrl;
    } catch {
      return gnUrl;
    }
  }
}

// ---------- full-text scraper ----------
const BODY_SELECTORS = [
  "article .entry-content",
  "article .post-content",
  ".single-post .entry-content",
  ".td-post-content",
  ".tdb-block-inner .tdb-block-content",
  ".post-content",
  "article",
  ".content-area",
  ".main-content",
];

async function scrapeFullText(url, { save = true, outDir = path.join(__dirname, "data") } = {}) {
  const resp = await axios.get(url, {
    timeout: 30000,
    headers: { "User-Agent": UA, Accept: ACCEPT, "Accept-Language": "en-US,en;q=0.9" },
  });
  const html = resp.data;
  const $ = cheerio.load(html);

  const title =
    clean($("meta[property='og:title']").attr("content")) ||
    clean($("h1.entry-title").text()) ||
    clean($("h1").first().text()) ||
    null;

  const author =
    clean($("meta[name='author']").attr("content")) ||
    clean($("[class*='author'] a").first().text()) ||
    clean($("[class*='author']").first().text()) ||
    null;

  const publishedAt =
    clean($("meta[property='article:published_time']").attr("content")) ||
    clean($("time[datetime]").attr("datetime")) ||
    clean($("time").first().text()) ||
    null;

  // choose content container
  let $body = null;
  for (const sel of BODY_SELECTORS) {
    if ($(sel).length) { $body = $(sel).first(); break; }
  }
  if (!$body || $body.length === 0) $body = $("article").first();
  if (!$body || $body.length === 0) $body = $("body");

  // pull headings + paragraphs
  const blocks = [];
  $body.find("h2, h3").each((_, el) => { const t = clean($(el).text()); if (t) blocks.push(t); });
  $body.find("p").each((_, el) => { const t = clean($(el).text()); if (t) blocks.push(t); });
  if (blocks.length === 0) {
    $("p").each((_, el) => { const t = clean($(el).text()); if (t) blocks.push(t); });
  }

  const text = blocks.join("\n\n");
  const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;

  const result = {
    url,
    title,
    author,
    publishedAt,
    wordCount,
    paragraphs: blocks,
    text,
  };

  if (save) {
    ensureDir(outDir);
    const lastSeg = new URL(url).pathname.split("/").filter(Boolean).pop();
    const stem = safeFileName(title, lastSeg || "article");
    const outPath = path.join(outDir, `${stem}.json`);
    fs.writeFileSync(outPath, JSON.stringify(result, null, 2), "utf-8");
    return { ...result, outPath };
  }
  return result;
}

// ---------- RSS fetch ----------
async function fetchNews(query) {
  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(
    query
  )}&hl=bn&gl=BD&ceid=BD:bn`;

  try {
    const res = await axios.get(rssUrl, { timeout: 15000, headers: { "User-Agent": UA } });
    const parser = new XMLParser({ ignoreAttributes: false, attributeNamePrefix: "" });
    const data = parser.parse(res.data);
    const items = data?.rss?.channel?.item || [];
    return items
      .map((item) => {
        const d = formatDate(item.pubDate);
        if (!d) return null;
        let source = null;
        if (Array.isArray(item.source)) {
          source = item.source[0]?.["#text"] || item.source[0];
        } else if (item.source) {
          source = item.source?.["#text"] || item.source;
        }
        return {
          title: item.title,
          link: item.link,
          source,
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

async function fetchAllYears(baseQuery) {
  let results = [];
  for (const y of YEARS) {
    console.log(`🗓️ Fetching: ${baseQuery} ${y}`);
    const r = await fetchNews(`${baseQuery} ${y}`);
    results = results.concat(r);
    // small delay to be polite
    await new Promise((r) => setTimeout(r, 800));
  }
  // de-dupe
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

// ---------- endpoints ----------

// 1) RSS only
app.get("/api/news", async (req, res) => {
  const query = req.query.query?.trim();
  if (!query) return res.status(400).json({ error: "Missing query" });
  const data = await fetchAllYears(query);
  res.json({ query, count: data.length, items: data });
});

// 2) Scrape ONE final (publisher) URL
app.get("/api/fulltext", async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: "Missing url" });
  try {
    const out = await scrapeFullText(url, { save: true, outDir: path.join(__dirname, "data") });
    res.json(out);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 3) Full pipeline: query → RSS → resolve → scrape ALL (limited by concurrency)
//    Usage: /api/news/full?query=শেখ হাসিনা&limit=150&concurrency=6
app.get("/api/news/full", async (req, res) => {
  const query = req.query.query?.trim();
  const limit = parseInt(req.query.limit || "0", 10);
  const concurrency = parseInt(req.query.concurrency || "5", 10);
  if (!query) return res.status(400).json({ error: "Missing query" });

  const items = await fetchAllYears(query);
  const picked = limit > 0 ? items.slice(0, limit) : items;

  const outDir = path.join(__dirname, "data");
  ensureDir(outDir);

  const limitRun = pLimit(concurrency);

  const jobs = picked.map((it, idx) =>
    limitRun(async () => {
      try {
        const finalUrl = await resolveFinalUrl(it.link);
        const scraped = await scrapeFullText(finalUrl, { save: true, outDir });
        return {
          ok: true,
          i: idx + 1,
          item: it,
          finalUrl,
          outPath: scraped.outPath,
          title: scraped.title,
          wordCount: scraped.wordCount,
        };
      } catch (e) {
        return { ok: false, i: idx + 1, item: it, error: e.message };
      }
    })
  );

  const results = await Promise.all(jobs);

  const manifest = {
    query,
    requested: picked.length,
    saved: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok).length,
    generatedAt: new Date().toISOString(),
    files: results
      .filter((r) => r.ok)
      .map((r) => ({
        title: r.title || r.item.title,
        finalUrl: r.finalUrl,
        pubDate: r.item.pubDate,
        source: r.item.source,
        outPath: path.relative(__dirname, r.outPath),
        words: r.wordCount,
      })),
    errors: results.filter((r) => !r.ok).map((r) => ({
      title: r.item.title,
      link: r.item.link,
      msg: r.error,
    })),
  };

  fs.writeFileSync(path.join(outDir, "manifest.json"), JSON.stringify(manifest, null, 2), "utf-8");
  res.json(manifest);
});

// (optional) minimal HTML proxy—kept for completeness
app.get("/api/proxy", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send("Missing 'url' parameter");
  try {
    const finalUrl = await new Promise((resolve, reject) => {
      followHttps.get(targetUrl, (resp) => resolve(resp.responseUrl || targetUrl)).on("error", reject);
    });
    const finalResp = await axios.get(finalUrl, {
      responseType: "text",
      headers: { "User-Agent": UA, Accept: ACCEPT },
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    });
    let html = finalResp.data
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
      .replace(/<meta[^>]+http-equiv=["']?Content-Security-Policy["']?[^>]*>/gi, "");
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("X-Frame-Options", "ALLOWALL");
    res.setHeader("Content-Security-Policy", "frame-ancestors *");
    res.send(html);
  } catch (err) {
    res.status(500).send(`<pre>${err.message}</pre>`);
  }
});

// ---------- start ----------
app.listen(PORT, () => console.log(`🚀 http://localhost:${PORT}`));
