// index.js
import express from "express";
import axios from "axios";
import { XMLParser } from "fast-xml-parser";

const app = express();
const PORT = 2000;

// Function to fetch Google News RSS
async function fetchNews(query) {
  const rssUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(
    query
  )}&hl=bn&gl=BD&ceid=BD:bn`;

  const res = await axios.get(rssUrl);
  const parser = new XMLParser();
  const data = parser.parse(res.data);

  return data.rss.channel.item || [];
}

// Root route
app.get("/", async (req, res) => {
  const query = "নির্বাচন";
  console.log("🚀 Fetching RSS for:", query);

  try {
    const items = await fetchNews(query);
    console.log(`📰 Found ${items.length} news articles.`);

    let html = `
      <meta charset="UTF-8">
      <h2>📰 "${query}" সম্পর্কিত খবর</h2>
      <p>Total: ${items.length} Articles</p>
      <a href="/refresh">🔄 Refresh News</a>
      <hr/>
      <ul style="font-family: sans-serif; line-height: 1.5;">
    `;

    items.slice(0, 20).forEach((item, i) => {
      html += `
        <li style="margin-bottom: 15px;">
          <strong>${i + 1}. <a href="${item.link}" target="_blank">${item.title}</a></strong><br>
          <small>${item.pubDate || ""}</small>
        </li>
      `;
    });

    html += "</ul>";
    res.send(html);
  } catch (error) {
    res.status(500).send(`<h3>Error fetching news: ${error.message}</h3>`);
  }
});

// Manual refresh route
app.get("/refresh", async (req, res) => {
  res.redirect("/");
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
