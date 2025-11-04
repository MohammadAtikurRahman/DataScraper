// scraper.js
// Reusable function that scrapes ONE article URL and saves full text to /data/*.json

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const cheerio = require("cheerio");
const slugify = require("slugify");

// ---------- helpers ----------
const clean = (s) => (s ? s.replace(/\s+/g, " ").trim() : "");

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function safeFileName(str, fallback = "article") {
  const a =
    slugify(str || "", { lower: true, strict: true, trim: true }) ||
    slugify(fallback, { lower: true, strict: true });
  return a.replace(/^\.+/, "").slice(0, 120);
}

// likely content containers
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

async function scrapeOne(TARGET_URL, outRoot = path.join(process.cwd(), "data")) {
  if (!TARGET_URL) throw new Error("No URL provided");

  // 1) download
  let html;
  try {
    const resp = await axios.get(TARGET_URL, {
      timeout: 30000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      // If some sites block without referrer:
      // headers: { Referer: new URL(TARGET_URL).origin, ... }
    });
    html = resp.data;
  } catch (err) {
    throw new Error(`Download failed: ${err.message}`);
  }

  // 2) parse
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

  // 3) locate content container
  let $body = null;
  for (const sel of BODY_SELECTORS) {
    if ($(sel).length) {
      $body = $(sel).first();
      break;
    }
  }
  if (!$body) $body = $("article").first(); // last fallback

  // 4) extract full text (subheadings + paragraphs)
  const blocks = [];

  $body.find("h2, h3").each((_, el) => {
    const t = clean($(el).text());
    if (t) blocks.push(t);
  });

  $body.find("p").each((_, el) => {
    const t = clean($(el).text());
    if (t) blocks.push(t);
  });

  // wide fallback
  if (blocks.length === 0) {
    $("p").each((_, el) => {
      const t = clean($(el).text());
      if (t) blocks.push(t);
    });
  }

  const text = blocks.join("\n\n");
  const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;

  // 5) save JSON
  const outDir = path.join(outRoot);
  ensureDir(outDir);

  const lastSeg = new URL(TARGET_URL).pathname.split("/").filter(Boolean).pop();
  const fileStem = safeFileName(title, lastSeg || "article");
  const outPath = path.join(outDir, `${fileStem}.json`);

  const payload = {
    url: TARGET_URL,
    title,
    author,
    publishedAt,
    wordCount,
    paragraphs: blocks,
    text,
  };

  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf-8");

  return {
    saved: true,
    outPath,
    meta: { title, author, publishedAt, words: wordCount },
    payload,
  };
}

module.exports = { scrapeOne };
