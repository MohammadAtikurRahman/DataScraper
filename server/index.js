// server.js (CommonJS)
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const { scrapeOne } = require("./scraper");

const app = express();
const PORT = 2000;

app.use(cors());
app.use(bodyParser.json({ limit: "2mb" }));

// Health
app.get("/", (_req, res) => res.send("Scraper API up"));

// Scrape ONE: /api/scrape-one?url=...
app.get("/api/scrape-one", async (req, res) => {
  const url = req.query.url;
  if (!url) return res.status(400).json({ error: "Missing url query" });
  try {
    const result = await scrapeOne(url, path.join(process.cwd(), "data"));
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e.message, url });
  }
});

// Scrape many (sequential): POST { urls: [] }
app.post("/api/scrape-batch", async (req, res) => {
  const urls = Array.isArray(req.body.urls) ? req.body.urls : [];
  if (!urls.length) return res.status(400).json({ error: "No urls provided" });

  const saved = [];
  const errors = [];

  for (const url of urls) {
    try {
      const out = await scrapeOne(url, path.join(process.cwd(), "data"));
      saved.push({
        url,
        title: out.meta.title,
        words: out.meta.words,
        outPath: out.outPath,
      });
      // gentle delay to be nice
      await new Promise((r) => setTimeout(r, 400));
    } catch (e) {
      errors.push({ url, error: e.message });
    }
  }

  res.json({
    requested: urls.length,
    saved: saved.length,
    failed: errors.length,
    files: saved,
    errors,
    outDir: path.join(process.cwd(), "data"),
    generatedAt: new Date().toISOString(),
  });
});

app.listen(PORT, () =>
  console.log(`✅ Scraper API running at http://localhost:${PORT}`)
);
