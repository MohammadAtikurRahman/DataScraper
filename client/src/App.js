import { useEffect, useState } from "react";

function App() {
  const [news, setNews] = useState([]);
  const [filteredNews, setFilteredNews] = useState([]);
  const [loading, setLoading] = useState(true);
  const [yearFilter, setYearFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");

  // Fetch from backend
  useEffect(() => {
    fetch("http://localhost:2000/api/news")
      .then((res) => res.json())
      .then((data) => {
        console.log("📦 Data received:", data);

        // Convert each item to include year, month, and day
        const parsed = (data.items || []).map((item) => {
          const date = item.pubDate ? new Date(item.pubDate) : null;
          return {
            ...item,
            year: date ? date.getFullYear() : null,
            month: date ? date.toLocaleString("en-US", { month: "long" }) : null,
            day: date ? date.getDate().toString().padStart(2, "0") : null,
          };
        });

        setNews(parsed);
        setFilteredNews(parsed);
        setLoading(false);
      })
      .catch((err) => {
        console.error("❌ Error fetching news:", err);
        setLoading(false);
      });
  }, []);

  // Apply filters
  useEffect(() => {
    let filtered = [...news];
    if (yearFilter) filtered = filtered.filter((n) => n.year === parseInt(yearFilter));
    if (monthFilter) filtered = filtered.filter((n) => n.month === monthFilter);
    if (dateFilter) filtered = filtered.filter((n) => n.day === dateFilter);
    setFilteredNews(filtered);
  }, [yearFilter, monthFilter, dateFilter, news]);

  // Extract filter options
  const years = [...new Set(news.map((n) => n.year))].filter(Boolean).sort((a, b) => b - a);
  const months = [...new Set(news.map((n) => n.month))].filter(Boolean);
  const dates = [...new Set(news.map((n) => n.day))].filter(Boolean);

  return (
    <div className="font-sans bg-gray-100 min-h-screen py-10">
      <div className="max-w-5xl mx-auto bg-white shadow-lg rounded-2xl p-6">
        <h2 className="text-2xl font-bold mb-6 text-center text-blue-700">
          📰 “নির্বাচন” related news
        </h2>

        {/* Filters */}
        <div className="flex flex-wrap justify-center gap-4 mb-6">
          <select
            value={yearFilter}
            onChange={(e) => setYearFilter(e.target.value)}
            className="border border-gray-300 rounded-lg p-2 text-gray-700"
          >
            <option value="">Year</option>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>

          <select
            value={monthFilter}
            onChange={(e) => setMonthFilter(e.target.value)}
            className="border border-gray-300 rounded-lg p-2 text-gray-700"
          >
            <option value="">Month</option>
            {months.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>

          <select
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="border border-gray-300 rounded-lg p-2 text-gray-700"
          >
            <option value="">Date</option>
            {dates.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>

          <button
            onClick={() => {
              setYearFilter("");
              setMonthFilter("");
              setDateFilter("");
              setFilteredNews(news);
            }}
            className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition"
          >
            Reset
          </button>
        </div>

        {/* News List */}
        {loading ? (
          <p className="text-center text-gray-500">⏳ Loading news...</p>
        ) : filteredNews.length === 0 ? (
          <p className="text-center text-gray-500">No news found.</p>
        ) : (
          <ul className="divide-y divide-gray-200">
            {filteredNews.map((item, i) => (
              <li key={i} className="py-3">
                <a
                  href={item.link}
                  target="_blank"
                  rel="noreferrer"
                  className="text-blue-600 font-medium hover:underline"
                >
                  {i + 1}. {item.title}
                </a>
                <div className="text-sm text-gray-500">
                  {item.day && item.month && item.year
                    ? `${item.day} ${item.month}, ${item.year}`
                    : ""}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <footer className="text-center text-sm text-gray-500 mt-6">
        © {new Date().getFullYear()} Election Project | React + Tailwind
      </footer>
    </div>
  );
}

export default App;
