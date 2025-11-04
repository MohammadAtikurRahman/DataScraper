import { useEffect, useMemo, useState } from "react";

const API = "http://localhost:2000";

export default function App() {
  const [news, setNews] = useState([]);
  const [filteredNews, setFilteredNews] = useState([]);
  const [loading, setLoading] = useState(false);
  const [newsCount, setNewsCount] = useState(0);
  const [returnedCount, setReturnedCount] = useState(0);

  // filters / query
  const [yearFilter, setYearFilter] = useState("");
  const [monthFilter, setMonthFilter] = useState("");
  const [dateFilter, setDateFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  // pagination
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // preview article state
  const [selected, setSelected] = useState(null);        // the clicked list item
  const [previewHtml, setPreviewHtml] = useState(null);  // extracted.rich.content
  const [previewText, setPreviewText] = useState(null);  // extracted.plainText
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState("");

  // derived source counts
  const sourceCount = useMemo(() => {
    return news.reduce((acc, n) => {
      const src =
        n.source ||
        (n.publisherUrl ? new URL(n.publisherUrl).hostname.replace(/^www\./, "") : "Unknown");
      acc[src] = (acc[src] || 0) + 1;
      return acc;
    }, {});
  }, [news]);

  // Fetch list
  const fetchNews = async (query) => {
    if (!query?.trim()) return;
    setLoading(true);
    setSelected(null);
    setPreviewHtml(null);
    setPreviewText(null);
    setPreviewError("");

    try {
      const res = await fetch(`${API}/api/news?query=${encodeURIComponent(query)}`);
      const data = await res.json();

      const parsed = (data.items || []).map((item) => {
        const date = item.isoDate ? new Date(item.isoDate) : (item.pubDate ? new Date(item.pubDate) : null);
        const src =
          item.source ||
          (item.publisherUrl ? new URL(item.publisherUrl).hostname.replace(/^www\./, "") : "Unknown");
        return {
          ...item,
          year: date ? date.getFullYear() : null,
          month: date ? date.toLocaleString("en-US", { month: "long" }) : null,
          day: date ? String(date.getDate()).padStart(2, "0") : null,
          source: src,
        };
      });

      setNews(parsed);
      setFilteredNews(parsed);
      setNewsCount(data.count || parsed.length);
      setReturnedCount(data.returned || parsed.length);
      setCurrentPage(1);
    } catch (e) {
      console.error("list error:", e);
    } finally {
      setLoading(false);
    }
  };

  // Filters
  useEffect(() => {
    let arr = [...news];
    if (yearFilter) arr = arr.filter((n) => n.year === parseInt(yearFilter));
    if (monthFilter) arr = arr.filter((n) => n.month === monthFilter);
    if (dateFilter) arr = arr.filter((n) => n.day === dateFilter);
    if (sourceFilter) arr = arr.filter((n) => n.source === sourceFilter);
    setFilteredNews(arr);
    setCurrentPage(1);
  }, [yearFilter, monthFilter, dateFilter, sourceFilter, news]);

  // dropdown options
  const years = useMemo(
    () => [...new Set(news.map((n) => n.year))].filter(Boolean).sort((a, b) => b - a),
    [news]
  );
  const months = useMemo(() => [...new Set(news.map((n) => n.month))].filter(Boolean), [news]);
  const dates = useMemo(() => [...new Set(news.map((n) => n.day))].filter(Boolean), [news]);
  const sources = useMemo(
    () => [...new Set(news.map((n) => n.source))].filter(Boolean).sort(),
    [news]
  );

  // pagination data
  const totalPages = Math.ceil(filteredNews.length / itemsPerPage) || 1;
  const startIndex = (currentPage - 1) * itemsPerPage;
  const paginatedNews = filteredNews.slice(startIndex, startIndex + itemsPerPage);

  const handlePrev = () => setCurrentPage((p) => Math.max(p - 1, 1));
  const handleNext = () => setCurrentPage((p) => Math.min(p + 1, totalPages));

  const handleSearch = (e) => {
    e.preventDefault();
    if (searchQuery.trim()) fetchNews(searchQuery);
  };

  // on headline click -> fetch full article
  const handleOpenArticle = async (item) => {
    setSelected(item);
    setPreviewHtml(null);
    setPreviewText(null);
    setPreviewError("");
    setPreviewLoading(true);

    // choose best URL to extract
    const url = item.publisherUrl || item.link;
    try {
      const res = await fetch(`${API}/api/article?url=${encodeURIComponent(url)}`);
      const data = await res.json();
      if (data?.extracted?.rich) {
        // if extractor returns { rich: "<article html ...>" }
        setPreviewHtml(data.extracted.rich);
      } else if (data?.extracted?.plainText) {
        setPreviewText(data.extracted.plainText);
      } else {
        setPreviewError("No full text could be extracted for this article.");
      }
    } catch (e) {
      setPreviewError(e.message || "Failed to load article.");
    } finally {
      setPreviewLoading(false);
      // scroll to the preview box area
      window.scrollTo({ top: 160, behavior: "smooth" });
    }
  };

  return (
    <div className="font-sans bg-gradient-to-b from-gray-50 to-gray-100 min-h-screen py-10">
      <div className="max-w-6xl mx-auto bg-white shadow-2xl rounded-2xl p-8 border border-gray-200">
        <h2 className="text-3xl font-bold mb-2 text-center text-blue-700 tracking-tight">
          📰 Full Article News Scraper (React)
        </h2>
        <p className="text-center text-gray-600 mb-6">
          Total across years: <span className="font-semibold text-blue-600">{newsCount}</span> • Showing:{" "}
          <span className="font-semibold text-blue-600">{returnedCount}</span>
        </p>

        {/* Search */}
        <form onSubmit={handleSearch} className="flex flex-col md:flex-row justify-center items-center gap-3 mb-6">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search any topic (e.g. নির্বাচন, Bangladesh, AI, Climate)..."
            className="w-full md:w-1/2 border border-gray-300 rounded-lg px-4 py-2 shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-400 transition"
          />
          <button
            type="submit"
            className="bg-blue-600 text-white px-5 py-2 rounded-lg hover:bg-blue-700 transition font-medium"
          >
            Search
          </button>
        </form>

        {/* Preview Box under search */}
        {selected && (
          <div className="mb-8 border border-gray-200 rounded-xl overflow-hidden shadow">
            <div className="flex justify-between items-center px-4 py-3 bg-gray-50">
              <div>
                <div className="text-lg font-semibold text-gray-800">{selected.title}</div>
                <div className="text-xs text-gray-500 mt-1">
                  <span className="font-medium">{selected.source}</span>
                  {selected.publisherUrl && (
                    <>
                      {" "}
                      •{" "}
                      <a
                        href={selected.publisherUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-blue-600 hover:underline"
                      >
                        Open original ↗
                      </a>
                    </>
                  )}
                </div>
              </div>
              <button
                className="text-sm bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded"
                onClick={() => {
                  setSelected(null);
                  setPreviewHtml(null);
                  setPreviewText(null);
                  setPreviewError("");
                }}
              >
                ✖ Close
              </button>
            </div>

            <div className="px-5 py-5">
              {previewLoading && <div className="text-gray-500">Loading article…</div>}
              {!previewLoading && previewError && (
                <div className="text-red-600 text-sm">{previewError}</div>
              )}
              {!previewLoading && !previewError && previewHtml && (
                <div
                  className="prose max-w-none"
                  dangerouslySetInnerHTML={{ __html: previewHtml }}
                />
              )}
              {!previewLoading && !previewError && !previewHtml && previewText && (
                <pre className="whitespace-pre-wrap text-sm leading-6">{previewText}</pre>
              )}
              {!previewLoading && !previewError && !previewHtml && !previewText && (
                <div className="text-gray-500 text-sm">No content.</div>
              )}
            </div>
          </div>
        )}

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

        {/* List */}
        {loading ? (
          <p className="text-center text-gray-500">⏳ Loading…</p>
        ) : filteredNews.length === 0 ? (
          <p className="text-center text-gray-500">No news found.</p>
        ) : (
          <>
            <ul className="divide-y divide-gray-200">
              {paginatedNews.map((item, i) => (
                <li
                  key={`${item.publisherUrl || item.link}-${i}`}
                  className="py-4 flex justify-between items-start hover:bg-gray-50 transition-all rounded-lg px-2 cursor-pointer"
                  onClick={() => handleOpenArticle(item)}
                >
                  <div className="flex-1 pr-2">
                    <div className="text-blue-700 font-medium text-lg hover:underline">
                      {startIndex + i + 1}. {item.title}
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                      {item.day && item.month && item.year
                        ? `${item.day} ${item.month}, ${item.year}`
                        : ""}
                    </div>
                  </div>

                  <div className="text-sm text-gray-600 italic whitespace-nowrap ml-2 text-right">
                    <div className="font-semibold text-gray-700">{item.source}</div>
                    <div className="text-xs text-gray-400">
                      {new URL(item.publisherUrl || item.link).hostname.replace(/^www\./, "")}
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
