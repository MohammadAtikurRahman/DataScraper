import React from "react";

function ArticleDetails({ article, onClose }) {
  if (!article) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl p-6 w-11/12 md:w-3/4 lg:w-1/2 max-h-[90vh] overflow-y-auto relative">
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 bg-red-500 text-white px-3 py-1 rounded-md hover:bg-red-600"
        >
          ✕
        </button>

        {/* Title */}
        <h2 className="text-2xl font-bold text-blue-700 mb-4">
          {article.title}
        </h2>

        {/* Date */}
        <p className="text-sm text-gray-500 mb-4">
          Fetched at:{" "}
          <span className="font-medium">{new Date(article.fetchedAt).toLocaleString()}</span>
        </p>

        {/* Content */}
        <div className="text-gray-700 leading-relaxed whitespace-pre-line mb-4">
          {article.content}
        </div>

        {/* Original Link */}
        <a
          href={article.url}
          target="_blank"
          rel="noreferrer"
          className="inline-block mt-2 text-blue-600 hover:underline font-medium"
        >
          🔗 View Original Source
        </a>
      </div>
    </div>
  );
}

export default ArticleDetails;
