// App.jsx
import { useEffect, useMemo, useState } from "react";

const API_BASE = "http://localhost:2000";

export default function App() {
  const [query, setQuery] = useState("শেখ হাসিনা");
  const [limit, setLimit] = useState(100);
  const [concurrency, setConcurrency] = useState(6);

  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewItems, setPreviewItems] = useState([]);
  const [previewCount, setPreviewCount] = useState(0);

  const [scrapeLoading, setScrapeLoading] = useState(false);
  const [manifest, setManifest] = useState(null);
  const [error, setError] = useState("");

  // compute simple source frequency for preview
  const sourceCount = useMemo(() => {
    const map = {};
    for (const it of previewItems) {
      const key = (it.source || "Unknown").trim();
      map[key] = (map[key] || 0) + 1;
    }
    return map;
  }, [previewItems]);

  async function previewSearch(e) {
    e?.preventDefault?.();
    setError("");
    setManifest(null);
    setPreviewLoading(true);
    try {
      const r = await fetch(
        `${API_BASE}/api/news?query=${encodeURIComponent(query)}`
      );
      if (!r.ok) throw new Error(`Preview failed: ${r.status}`);
      const data = await r.json();
      setPreviewItems(data.items || []);
      setPreviewCount(data.count || 0);
    } catch (err) {
      setError(err.message || "Preview failed");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function runFullScrape() {
    setError("");
    setManifest(null);
    setScrapeLoading(true);
    try {
      const url = new URL(`${API_BASE}/api/news/full`);
      url.searchParams.set("query", query);
      if (Number(limit) > 0) url.searchParams.set("limit", String(limit));
      url.searchParams.set("concurrency", String(concurrency));

      const r = await fetch(url.toString(), { method: "GET" });
      if (!r.ok) throw new Error(`Scrape failed: ${r.status}`);
      const data = await r.json();
      setManifest(data);
    } catch (err) {
      setError(err.message || "Scrape failed");
    } finally {
      setScrapeLoading(false);
    }
  }

  useEffect(() => {
    // optional: kick off a preview on mount
    previewSearch();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <header className="bg-white border-b">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <h1 className="text-2xl md:text-3xl font-bold">
            📰 Full News Scraper — Client
          </h1>
          <p className="text-sm text-gray-500">
            Preview Google News → then run full scrape (resolve + extract full text).
          </p>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-8">
        {/* Controls */}
        <section className="bg-white rounded-xl border p-4 md:p-6 shadow-sm">
          <form
            onSubmit={previewSearch}
            className="flex flex-col md:flex-row gap-3 md:items-end"
          >
            <div className="flex-1">
              <label className="block text-sm font-medium mb-1">Query</label>
              <input
                className="w-full border rounded-lg px-3 py-2"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="e.g. নির্বাচন, Bangladesh, AI..."
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Limit</label>
              <input
                type="number"
                min={0}
                className="w-28 border rounded-lg px-3 py-2"
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                title="0 = no limit"
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">
                Concurrency
              </label>
              <input
                type="number"
                min={1}
                max={12}
                className="w-28 border rounded-lg px-3 py-2"
                value={concurrency}
                onChange={(e) => setConcurrency(Number(e.target.value))}
              />
            </div>

            <div className="flex gap-2">
              <button
                type="submit"
                disabled={previewLoading}
                className={`px-4 py-2 rounded-lg font-medium ${
                  previewLoading
                    ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                    : "bg-blue-600 text-white hover:bg-blue-700"
                }`}
              >
                {previewLoading ? "Loading…" : "Preview (RSS)"}
              </button>

              <button
                type="button"
                disabled={scrapeLoading || !previewItems.length}
                onClick={runFullScrape}
                className={`px-4 py-2 rounded-lg font-medium ${
                  scrapeLoading || !previewItems.length
                    ? "bg-gray-200 text-gray-500 cursor-not-allowed"
                    : "bg-emerald-600 text-white hover:bg-emerald-700"
                }`}
                title={
                  !previewItems.length
                    ? "Run a preview first (or you can still run scrape without preview via the server)"
                    : "Run full scrape"
                }
              >
                {scrapeLoading ? "Scraping…" : "Run Full Scrape"}
              </button>
            </div>
          </form>

          {error ? (
            <p className="mt-3 text-sm text-red-600">⚠️ {error}</p>
          ) : null}
        </section>

        {/* Preview summary */}
        <section className="bg-white rounded-xl border p-4 md:p-6 shadow-sm">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <h2 className="text-lg font-semibold">Preview Results</h2>
            <p className="text-sm text-gray-500">
              Found <span className="font-semibold">{previewCount}</span> items
              (showing {previewItems.length})
            </p>
          </div>

          {!previewItems.length ? (
            <p className="text-sm text-gray-500 mt-2">
              No preview yet. Enter a query and click <b>Preview (RSS)</b>.
            </p>
          ) : (
            <>
              {/* quick source chips */}
              <div className="mt-3 flex flex-wrap gap-2">
                {Object.entries(sourceCount)
                  .sort((a, b) => b[1] - a[1])
                  .slice(0, 12)
                  .map(([src, n]) => (
                    <span
                      key={src}
                      className="text-xs bg-gray-100 border rounded-full px-2 py-1"
                      title={`${n} articles`}
                    >
                      {src} • {n}
                    </span>
                  ))}
              </div>

              {/* list */}
              <ul className="mt-4 divide-y">
                {previewItems.slice(0, 50).map((it, idx) => (
                  <li key={`${it.link}-${idx}`} className="py-3">
                    <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
                      <div className="min-w-0">
                        <a
                          href={it.link}
                          target="_blank"
                          rel="noreferrer"
                          className="text-blue-700 hover:underline font-medium"
                          title="Google News redirect link"
                        >
                          {idx + 1}. {it.title}
                        </a>
                        <div className="text-xs text-gray-500 mt-1">
                          {it.day && it.month && it.year
                            ? `${it.day} ${it.month}, ${it.year}`
                            : ""}
                        </div>
                      </div>
                      <div className="text-xs md:text-right text-gray-600 shrink-0">
                        <div className="font-semibold">
                          {it.source || "Unknown"}
                        </div>
                        <div className="text-gray-400">
                          ({sourceCount[it.source || "Unknown"] || 1}×)
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>

              {previewItems.length > 50 && (
                <p className="text-xs text-gray-500 mt-2">
                  Showing first 50 items in UI. Full list still available via
                  API.
                </p>
              )}
            </>
          )}
        </section>

        {/* Manifest (results from /api/news/full) */}
        <section className="bg-white rounded-xl border p-4 md:p-6 shadow-sm">
          <h2 className="text-lg font-semibold">Scrape Manifest</h2>
          {!manifest ? (
            <p className="text-sm text-gray-500 mt-2">
              Run <b>Full Scrape</b> to get saved files & stats.
            </p>
          ) : (
            <>
              <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <div className="p-3 rounded-lg border bg-gray-50">
                  <div className="text-gray-500">Requested</div>
                  <div className="text-lg font-semibold">{manifest.requested}</div>
                </div>
                <div className="p-3 rounded-lg border bg-gray-50">
                  <div className="text-gray-500">Saved</div>
                  <div className="text-lg font-semibold">{manifest.saved}</div>
                </div>
                <div className="p-3 rounded-lg border bg-gray-50">
                  <div className="text-gray-500">Failed</div>
                  <div className="text-lg font-semibold">{manifest.failed}</div>
                </div>
                <div className="p-3 rounded-lg border bg-gray-50">
                  <div className="text-gray-500">Generated</div>
                  <div className="text-xs">
                    {new Date(manifest.generatedAt).toLocaleString()}
                  </div>
                </div>
              </div>

              {manifest.errors?.length ? (
                <details className="mt-4">
                  <summary className="cursor-pointer text-sm text-red-600">
                    {manifest.errors.length} errors
                  </summary>
                  <ul className="mt-2 space-y-2 text-sm">
                    {manifest.errors.slice(0, 20).map((e, i) => (
                      <li key={i} className="p-2 bg-red-50 border rounded">
                        <div className="font-medium">{e.title}</div>
                        <div className="text-gray-600 break-all">{e.link}</div>
                        <div className="text-red-700 mt-1">{e.msg}</div>
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}

              <h3 className="mt-6 font-semibold">Saved Files</h3>
              {!manifest.files?.length ? (
                <p className="text-sm text-gray-500 mt-1">No files saved.</p>
              ) : (
                <ul className="mt-2 divide-y">
                  {manifest.files.slice(0, 100).map((f, i) => (
                    <li key={i} className="py-3">
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium">{f.title}</div>
                          <div className="text-xs text-gray-500 mt-1">
                            {f.pubDate ? new Date(f.pubDate).toLocaleString() : ""}
                            {f.source ? ` • ${f.source}` : ""}
                            {typeof f.words === "number" ? ` • ${f.words} words` : ""}
                          </div>
                          <div className="text-xs text-gray-500 break-all">
                            Saved: <code>{f.outPath}</code>
                          </div>
                        </div>
                        <a
                          href={f.finalUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-xs px-3 py-1.5 border rounded-lg hover:bg-gray-50"
                        >
                          Open Source
                        </a>
                      </div>
                    </li>
                  ))}
                </ul>
              )}

              {manifest.files?.length > 100 && (
                <p className="text-xs text-gray-500 mt-2">
                  Showing first 100 saved items.
                </p>
              )}
            </>
          )}
        </section>
      </main>

      <footer className="py-8 text-center text-xs text-gray-400">
        © {new Date().getFullYear()} Full News Scraper
      </footer>
    </div>
  );
}
