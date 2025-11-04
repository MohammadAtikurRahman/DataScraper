// index.js (CommonJS)
// Scrape ONE TheWall.in page and save full text (no images) to data/<slug>.json

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const cheerio = require("cheerio");
const slugify = require("slugify");

const TARGET_URL =
  "https://www.thewall.in/bangladesh/date-of-hasinas-sentence-will-pronouns-on-november-13-awami-league-calls-for-lockdown-in-dhaka/tid/177928";

// ---------- helpers ----------
const clean = (s) => (s ? s.replace(/\s+/g, " ").trim() : "");

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function safeFileName(str, fallback = "article") {
  const a = slugify(str || "", { lower: true, strict: true, trim: true }) ||
            slugify(fallback, { lower: true, strict: true });
  return a.replace(/^\.+/, "").slice(0, 120);
}

// Try multiple likely containers for the article body
const BODY_SELECTORS = [
  "article .entry-content",
  "article .post-content",
  ".single-post .entry-content",
  ".td-post-content",
  ".tdb-block-inner .tdb-block-content",
  ".post-content",
  "article",
  ".content-area",
  ".main-content"
];

(async function run() {
  console.log("🔎 Fetching:", TARGET_URL);

  // 1) download
  let html;
  try {
    const resp = await axios.get(TARGET_URL, {
      timeout: 30000,
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    html = resp.data;
  } catch (err) {
    console.error("❌ Failed to download page:", err.message);
    process.exit(1);
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

  // 4) extract full text: paragraphs + important subheadings
  const blocks = [];
  // include subheadings (keep simple text only)
  $body.find("h2, h3").each((_, el) => {
    const t = clean($(el).text());
    if (t) blocks.push(t);
  });

  // include all paragraph text
  $body.find("p").each((_, el) => {
    const t = clean($(el).text());
    if (t) blocks.push(t);
  });

  // if nothing found inside container, do a wide fallback (rare)
  if (blocks.length === 0) {
    $("p").each((_, el) => {
      const t = clean($(el).text());
      if (t) blocks.push(t);
    });
  }

  const text = blocks.join("\n\n");
  const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0;

  // 5) save JSON
  const outDir = path.join(process.cwd(), "data");
  ensureDir(outDir);

  // build a safe filename from title; fallback to last URL segment
  const lastSeg = new URL(TARGET_URL).pathname.split("/").filter(Boolean).pop();
  const fileStem = safeFileName(title, lastSeg || "article");
  const outPath = path.join(outDir, `${fileStem}.json`);

  const payload = {
    url: TARGET_URL,
    title,
    author,
    publishedAt,
    wordCount,
    paragraphs: blocks,     // array of blocks
    text                    // full joined text
  };

  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2), "utf-8");

  console.log("✅ Saved:", outPath);
  console.log("📝 paragraphs:", blocks.length, "| words:", wordCount);
})();
