import express from "express";
import cors from "cors";
import axios from "axios";
import { XMLParser } from "fast-xml-parser";

const app = express();
const PORT = 2000;

app.use(cors());

// Helper: Parse date safely
function formatDate(dateString) {
  if (!dateString) return null;
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return null;

  return {
    year: date.getFullYear(),
    month: date.toLocaleString("en-US", { month: "long" }),
    day: date.getDate().toString().padStart(2, "0"),
  };
}

// Fetch & parse Google RSS
async function fetchNews(query) {
  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(
    query
  )}&hl=bn&gl=BD&ceid=BD:bn`;

  const res = await axios.get(rssUrl);
  const parser = new XMLParser();
  const data = parser.parse(res.data);
  const items = data?.rss?.channel?.item || [];

  const flatList = [];
  const grouped = {};

  for (const item of items) {
    const dateInfo = formatDate(item.pubDate);
    if (!dateInfo) continue;

    const { year, month, day } = dateInfo;

    const newsItem = {
      title: item.title,
      link: item.link,
      pubDate: item.pubDate,
      year,
      month,
      day,
    };
    flatList.push(newsItem);

    // group by year > month > day
    if (!grouped[year]) grouped[year] = {};
    if (!grouped[year][month]) grouped[year][month] = {};
    if (!grouped[year][month][day]) grouped[year][month][day] = [];
    grouped[year][month][day].push(newsItem);
  }

  console.log(`✅ Parsed ${flatList.length} items`);
  return { grouped, flatList };
}

app.get("/api/news", async (req, res) => {
  const query = req.query.query || "নির্বাচন";
  try {
    const { grouped, flatList } = await fetchNews(query);
    res.json({ query, groupedNews: grouped, flatNews: flatList });
  } catch (err) {
    console.error("❌ Error fetching news:", err.message);
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
