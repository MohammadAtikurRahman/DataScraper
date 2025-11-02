import express from "express";
import cors from "cors";
import axios from "axios";
import { XMLParser } from "fast-xml-parser";

const app = express();
const PORT = 2000;

app.use(cors());

// --- Helper: Format date safely ---
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

// --- Fetch news for a single query (e.g., “নির্বাচন 2023”) ---
async function fetchNews(query) {
  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(
    query
  )}&hl=bn&gl=BD&ceid=BD:bn`;

  try {
    const res = await axios.get(rssUrl, { timeout: 10000 });
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
    console.error(`❌ Failed to fetch for "${query}":`, err.message);
    return [];
  }
}

// --- Fetch for all years (2001–2025) ---
async function fetchAllYears(baseQuery) {
  const YEARS = Array.from({ length: 25 }, (_, i) => 2025 - i); // 2025 → 2001
  let allResults = [];

  for (const year of YEARS) {
    console.log(`🗓️ Fetching: ${baseQuery} ${year}`);
    const results = await fetchNews(`${baseQuery} ${year}`);
    allResults = [...allResults, ...results];

    // small delay to avoid throttling
    await new Promise((r) => setTimeout(r, 1200));
  }

  // Remove duplicates by link/title
  const unique = [];
  const seen = new Set();
  for (const item of allResults) {
    const key = item.link || item.title;
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(item);
    }
  }

  // Sort descending by date
  unique.sort((a, b) => new Date(b.isoDate) - new Date(a.isoDate));

  console.log(`✅ Total unique: ${unique.length} news articles`);
  return unique;
}

// --- Main API endpoint ---
app.get("/api/news", async (req, res) => {
  const query = req.query.query || "নির্বাচন";
  console.log(`🔍 Aggregating Google News for: ${query}`);

  try {
    const items = await fetchAllYears(query);
    res.json({
      query,
      count: items.length,
      items,
      lastUpdated: new Date().toISOString(),
    });
  } catch (err) {
    console.error("❌ API error:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
