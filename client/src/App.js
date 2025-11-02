import { useEffect, useState } from "react";

function App() {
  const [news, setNews] = useState([]);
  const [filteredNews, setFilteredNews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newsCount, setNewsCount] = useState(0);

  const [yearFilter, setYearFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Fetch data from backend
  const fetchNews = (query) => {
    if (!query.trim()) return;
    setLoading(true);

    fetch(`http://localhost:2000/api/news?query=${encodeURIComponent(query)}`)
      .then((res) => res.json())
      .then((data) => {
        const parsed = (data.items || []).map((item) => {
          const date = item.pubDate ? new Date(item.pubDate) : null;
          const source =
            item.title?.split(" - ").pop()?.trim() ||
            new URL(item.link).hostname.replace("www.", "") ||
            "Unknown Source";
          return {
            ...item,
            year: date ? date.getFullYear() : null,
            month: date ? date.toLocaleString("en-US", { month: "long" }) : null,
            day: date ? date.getDate().toString().padStart(2, "0") : null,
            source,
          };
        });

        setNews(parsed);
        setFilteredNews(parsed);
        setNewsCount(data.count || parsed.length);
        setLoading(false);
        setCurrentPage(1);
      })
      .catch((err) => {
        console.error("❌ Error fetching news:", err);
        setLoading(false);
      });
  };

  useEffect(() => {
    if (searchQuery.trim()) fetchNews(searchQuery);
  }, []);

  // Filter logic
  useEffect(() => {
    let filtered = [...news];
    if (yearFilter) filtered = filtered.filter((n) => n.year === parseInt(yearFilter));
    if (monthFilter) filtered = filtered.filter((n) => n.month === monthFilter);
    if (dateFilter) filtered = filtered.filter((n) => n.day === dateFilter);
    if (sourceFilter) filtered = filtered.filter((n) => n.source === sourceFilter);
    setFilteredNews(filtered);
    setCurrentPage(1);
  }, [yearFilter, monthFilter, dateFilter, sourceFilter, news]);

  // Dropdown options
  const years = [...new Set(news.map((n) => n.year))].filter(Boolean).sort((a, b) => b - a);
  const months = [...new Set(news.map((n) => n.month))].filter(Boolean);
  const dates = [...new Set(news.map((n) => n.day))].filter(Boolean);
  const sources = [...new Set(news.map((n) => n.source))].filter(Boolean).sort();

  // Publisher frequency map
  const sourceCount = news.reduce((acc, n) => {
    acc[n.source] = (acc[n.source] || 0) + 1;
    return acc;
  }, {});

  // Pagination
  const totalPages = Math.ceil(filteredNews.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedNews = filteredNews.slice(startIndex, startIndex + itemsPerPage);

  const handlePrev = () => setCurrentPage((p) => Math.max(p - 1, 1));
  const handleNext = () => setCurrentPage((p) => Math.min(p + 1, totalPages));

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) fetchNews(searchQuery);
  };

  return (
    <div className="font-sans bg-gradient-to-b from-gray-50 to-gray-100 min-h-screen py-10">
      <div className="max-w-6xl mx-auto bg-white shadow-2xl rounded-2xl p-8 border border-gray-200">
        <h2 className="text-3xl font-bold mb-2 text-center text-blue-700 tracking-tight">
          📰 Data Scraper
        </h2>
        <p className="text-center text-gray-600 mb-6">
          Total unique:{" "}
          <span className="font-semibold text-blue-600">{newsCount}</span> articles
        </p>

        {/* Search */}
        <form onSubmit={handleSearch} className="flex justify-center items-center gap-3 mb-8">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search any topic (e.g. নির্বাচন, Bangladesh, AI, Climate)..."
            className="w-2/3 md:w-1/2 border border-gray-300 rounded-lg px-4 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
          />
          <button
            type="submit"
            className="bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 transition font-medium"
          >
            Search
          </button>
        </form>

        {/* Filters */}
        <div className="flex flex-wrap justify-center gap-4 mb-8">
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

          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value)}
            className="border border-gray-300 rounded-lg p-2 text-gray-700"
          >
            <option value="">News Source</option>
            {sources.map((s) => (
              <option key={s} value={s}>
                {s} ({sourceCount[s]}x)
              </option>
            ))}
          </select>

          <button
            onClick={() => {
              setYearFilter("");
              setMonthFilter("");
              setDateFilter("");
              setSourceFilter("");
              setFilteredNews(news);
              setCurrentPage(1);
            }}
            className="bg-red-500 text-white px-4 py-2 rounded-lg hover:bg-red-600 transition font-medium"
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
          <>
            <ul className="divide-y divide-gray-200">
              {paginatedNews.map((item, i) => (
                <li
                  key={i}
                  className="py-4 flex justify-between items-start hover:bg-gray-50 transition-all rounded-lg px-2"
                >
                  <div className="flex-1 pr-2">
                    <a
                      href={item.link}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-700 font-medium hover:underline text-lg"
                    >
                      {startIndex + i + 1}. {item.title}
                    </a>
                    <div className="text-sm text-gray-500 mt-1">
                      {item.day && item.month && item.year
                        ? `${item.day} ${item.month}, ${item.year}`
                        : ""}
                    </div>
                  </div>

                  <div className="text-sm text-gray-600 italic whitespace-nowrap ml-2 text-right">
                    <div className="font-semibold text-gray-700">{item.source}</div>
                    <div className="text-xs text-gray-400">
                      ({sourceCount[item.source] || 1}× published)
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            {/* Pagination */}
            <div className="flex justify-center items-center gap-3 mt-8">
              <button
                onClick={handlePrev}
                disabled={currentPage === 1}
                className={`px-4 py-2 rounded-lg font-medium ${
                  currentPage === 1
                    ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                    : "bg-blue-500 text-white hover:bg-blue-600"
                }`}
              >
                ← Prev
              </button>

              <span className="text-gray-600 font-medium">
                Page {currentPage} of {totalPages} — Showing {paginatedNews.length} of{" "}
                {filteredNews.length}
              </span>

              <button
                onClick={handleNext}
                disabled={currentPage === totalPages}
                className={`px-4 py-2 rounded-lg font-medium ${
                  currentPage === totalPages
                    ? "bg-gray-200 text-gray-400 cursor-not-allowed"
                    : "bg-blue-500 text-white hover:bg-blue-600"
                }`}
              >
                Next →
              </button>
            </div>
          </>
        )}
      </div>

      <footer className="text-center text-sm text-gray-500 mt-8">
        © {new Date().getFullYear()} Data Scraper | React + Tailwind
      </footer>
    </div>
  );
}

export default App;
