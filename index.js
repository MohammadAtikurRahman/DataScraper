// index.js
import express from 'express';
import fs from 'fs';
import { PlaywrightCrawler, Dataset } from 'crawlee';

const app = express();
const PORT = 3000;

// 🔍 Function to scrape Google News for “নির্বাচন”
async function scrapeElectionNews() {
  const query = 'নির্বাচন';
  const crawler = new PlaywrightCrawler({
    headless: true,
    launchContext: {
      launchOptions: {
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      },
    },

    async requestHandler({ page, request, enqueueLinks }) {
      // Add browser header to look real
      await page.setExtraHTTPHeaders({
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
      });

      if (request.url.includes('google.com/search')) {
        await page.waitForSelector('a h3', { timeout: 10000 }).catch(() => {});
        await enqueueLinks({
          globs: ['https://*', 'http://*'],
          selector: 'a',
        });
      } else {
        const title = await page.title();
        const text = await page.evaluate(() =>
          document.body.innerText.replace(/\s+/g, ' ').slice(0, 500)
        );
        await Dataset.pushData({ url: request.url, title, snippet: text });
      }
    },
  });

  // Run crawler for Bangla news search
  await crawler.run([
    {
      url: `https://www.google.com/search?q=${encodeURIComponent(query)}&tbm=nws&num=5&hl=bn`,
    },
  ]);

  const { items } = await Dataset.getData();
  fs.writeFileSync('data.json', JSON.stringify(items, null, 2));
  return items;
}

// 🏠 Home route — show results
app.get('/', (req, res) => {
  if (fs.existsSync('data.json')) {
    const data = JSON.parse(fs.readFileSync('data.json', 'utf8'));
    let html = `
      <h2>📰 নির্বাচন সম্পর্কিত খবর</h2>
      <a href="/scrape">🔄 Re-scrape Latest</a>
      <ul style="font-family:sans-serif;">
    `;
    data.forEach(item => {
      html += `
        <li style="margin-bottom:15px;">
          <a href="${item.url}" target="_blank" style="font-weight:bold;color:#007bff;">${item.title}</a>
          <p>${item.snippet}</p>
        </li>
      `;
    });
    html += '</ul>';
    res.send(html);
  } else {
    res.send('<h3>No data found. Visit <a href="/scrape">/scrape</a> to start scraping.</h3>');
  }
});

// 🧹 Scrape route
app.get('/scrape', async (req, res) => {
  res.write('<h3>Scraping... please wait ⏳ (about 20–30 seconds)</h3>');
  const data = await scrapeElectionNews();
  res.write('<h3>✅ Scraping complete! <a href="/">Go Home</a></h3>');
  res.end();
});

app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
