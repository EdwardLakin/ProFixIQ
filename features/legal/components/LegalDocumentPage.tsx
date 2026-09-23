import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export default function LegalDocumentPage({ content }: { content: string }) {
  return (
    <div className="min-h-screen bg-[color:var(--marketing-ink,#0D172A)] text-white">
      <div className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
        <Link
          href="/legal"
          className="text-sm text-slate-400 transition hover:text-white"
        >
          &larr; All legal documents
        </Link>

        <article className="prose prose-invert prose-slate mt-8 max-w-none prose-headings:font-semibold prose-a:text-[color:var(--marketing-copper,#c2703d)] prose-table:text-sm">
          <ReactMarkdown
            remarkPlugins={[remarkGfm]}
            components={{
              table: ({ children }) => (
                <div className="overflow-x-auto">
                  <table>{children}</table>
                </div>
              ),
            }}
          >
            {content}
          </ReactMarkdown>
        </article>
      </div>
    </div>
  );
}
