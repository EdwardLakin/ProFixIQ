/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bold,
  ExternalLink,
  Eye,
  Heading2,
  ImagePlus,
  Italic,
  Link2,
  List,
  Loader2,
  Pencil,
  Plus,
  Save,
  Send,
  WandSparkles,
} from "lucide-react";
import {
  slugifyBlogTitle,
  type BlogArticle,
  type BlogArticleInput,
} from "@/features/marketing/blog/types";

type EditorArticle = BlogArticleInput & {
  createdAt?: string;
  updatedAt?: string;
  publishedAt?: string | null;
};

type OptimizedMetadata = {
  slug: string;
  category: string;
  excerpt: string;
  seoTitle: string;
  seoDescription: string;
};

type BodySelection = { start: number; end: number };
type EditorView = "write" | "preview";

const EMPTY_ARTICLE: EditorArticle = {
  title: "",
  slug: "",
  excerpt: "",
  bodyMarkdown: "",
  authorName: "Edward Lakin",
  authorTitle: "Founder, ProFixIQ",
  category: "Founder Notes",
  heroImageUrl: null,
  heroImageAlt: null,
  seoTitle: "",
  seoDescription: "",
  status: "draft",
  featured: false,
};

function dateLabel(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : new Intl.DateTimeFormat("en-CA", {
        month: "short",
        day: "numeric",
        year: "numeric",
      }).format(date);
}

function readingTime(markdown: string): number {
  const words = markdown.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 220));
}

function insertionLine(markdown: string, position: number): number {
  return markdown.slice(0, Math.max(0, position)).split("\n").length;
}

function ArticlePreview({ article }: { article: EditorArticle }) {
  return (
    <div className="pfq-marketing overflow-hidden rounded-2xl border border-[color:var(--marketing-border)] bg-white text-[color:var(--marketing-ink)] shadow-sm">
      <header className="border-b border-[color:var(--marketing-border)] px-6 py-10 sm:px-8">
        <div className="marketing-eyebrow">{article.category || "Category"}</div>
        <h1 className="mt-4 text-4xl font-semibold leading-[1.05] tracking-[-0.05em]">
          {article.title || "Article title"}
        </h1>
        <p className="mt-6 text-xl leading-8 text-[color:var(--marketing-muted)]">
          {article.excerpt || "Your article excerpt will appear here."}
        </p>
        <div className="mt-8 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-[color:var(--marketing-muted)]">
          <span className="font-bold text-[color:var(--marketing-ink)]">
            {article.authorName || "Author"}
          </span>
          {article.authorTitle ? (
            <>
              <span aria-hidden="true">•</span>
              <span>{article.authorTitle}</span>
            </>
          ) : null}
          <span aria-hidden="true">•</span>
          <span>{readingTime(article.bodyMarkdown)} min read</span>
        </div>
      </header>

      {article.heroImageUrl ? (
        <div className="px-6 pt-8 sm:px-8">
          <img
            src={article.heroImageUrl}
            alt={article.heroImageAlt ?? ""}
            className="w-full rounded-2xl border border-[color:var(--marketing-border)] object-cover shadow-sm"
          />
        </div>
      ) : null}

      <div className="px-6 py-10 sm:px-8">
        <div className="prose prose-slate max-w-none prose-headings:tracking-[-0.035em] prose-headings:text-[color:var(--marketing-ink)] prose-p:text-[color:var(--marketing-muted)] prose-p:leading-8 prose-a:text-[color:var(--marketing-copper-dark)] prose-strong:text-[color:var(--marketing-ink)] prose-img:rounded-2xl prose-img:border prose-img:border-[color:var(--marketing-border)]">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {article.bodyMarkdown || "Nothing to preview yet."}
          </ReactMarkdown>
        </div>
      </div>
    </div>
  );
}

export default function OpsBlogManager() {
  const [articles, setArticles] = useState<BlogArticle[]>([]);
  const [editor, setEditor] = useState<EditorArticle | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);
  const [heroImageAlt, setHeroImageAlt] = useState("");
  const [inlineImageAlt, setInlineImageAlt] = useState("");
  const [editorView, setEditorView] = useState<EditorView>("write");
  const [selectionLine, setSelectionLine] = useState(1);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const bodySelectionRef = useRef<BodySelection>({ start: 0, end: 0 });

  const storedArticle = useMemo(
    () => articles.find((article) => article.id === editor?.id) ?? null,
    [articles, editor?.id],
  );
  const slugLocked = storedArticle?.status === "published";

  const loadArticles = useCallback(async (selectId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/ops/blog/articles", { cache: "no-store" });
      const payload = (await response.json()) as {
        articles?: BlogArticle[];
        error?: string;
      };
      if (!response.ok) throw new Error(payload.error ?? "Unable to load articles");
      const nextArticles = payload.articles ?? [];
      setArticles(nextArticles);
      if (selectId) {
        const selected = nextArticles.find((article) => article.id === selectId);
        if (selected) setEditor(selected);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to load articles");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadArticles();
  }, [loadArticles]);

  function resetImageInputs(article?: EditorArticle | BlogArticle) {
    setHeroImageAlt(article?.heroImageAlt ?? "");
    setInlineImageAlt("");
    bodySelectionRef.current = { start: 0, end: 0 };
    setSelectionLine(1);
  }

  function startNewArticle() {
    setEditor({ ...EMPTY_ARTICLE });
    setSlugTouched(false);
    resetImageInputs();
    setEditorView("write");
    setMessage(null);
    setError(null);
  }

  function selectArticle(article: BlogArticle) {
    setEditor(article);
    setSlugTouched(true);
    resetImageInputs(article);
    setEditorView("write");
    setMessage(null);
    setError(null);
  }

  function update<K extends keyof EditorArticle>(key: K, value: EditorArticle[K]) {
    setEditor((current) => (current ? { ...current, [key]: value } : current));
  }

  function updateTitle(title: string) {
    setEditor((current) => {
      if (!current) return current;
      const next = { ...current, title };
      if (!current.id && !slugTouched) next.slug = slugifyBlogTitle(title);
      return next;
    });
  }

  function rememberBodySelection() {
    if (!editor) return;
    const textarea = bodyRef.current;
    if (!textarea) return;
    const next = { start: textarea.selectionStart, end: textarea.selectionEnd };
    bodySelectionRef.current = next;
    setSelectionLine(insertionLine(editor.bodyMarkdown, next.start));
  }

  function selectionForBody(): BodySelection {
    if (!editor) return { start: 0, end: 0 };
    const remembered = bodySelectionRef.current;
    return {
      start: Math.min(remembered.start, editor.bodyMarkdown.length),
      end: Math.min(remembered.end, editor.bodyMarkdown.length),
    };
  }

  function replaceBodySelection(before: string, after = "", placeholder = "text") {
    if (!editor) return;
    const { start, end } = selectionForBody();
    const selected = editor.bodyMarkdown.slice(start, end) || placeholder;
    const next = `${editor.bodyMarkdown.slice(0, start)}${before}${selected}${after}${editor.bodyMarkdown.slice(end)}`;
    const caret = start + before.length + selected.length + after.length;
    bodySelectionRef.current = { start: caret, end: caret };
    update("bodyMarkdown", next);
    setSelectionLine(insertionLine(next, caret));

    requestAnimationFrame(() => {
      bodyRef.current?.focus();
      bodyRef.current?.setSelectionRange(caret, caret);
    });
  }

  function insertRawMarkdown(markdown: string) {
    if (!editor) return;
    const { start, end } = selectionForBody();
    const next = `${editor.bodyMarkdown.slice(0, start)}${markdown}${editor.bodyMarkdown.slice(end)}`;
    const caret = start + markdown.length;
    bodySelectionRef.current = { start: caret, end: caret };
    update("bodyMarkdown", next);
    setSelectionLine(insertionLine(next, caret));

    requestAnimationFrame(() => {
      bodyRef.current?.focus();
      bodyRef.current?.setSelectionRange(caret, caret);
    });
  }

  async function uploadImage(file: File, purpose: "hero" | "inline") {
    if (!editor) return;
    const alt = (purpose === "hero" ? heroImageAlt : inlineImageAlt).trim();
    if (!alt) {
      setError(
        purpose === "hero"
          ? "Add hero image alt text before uploading."
          : "Add inline image alt text before uploading.",
      );
      return;
    }

    setUploading(true);
    setError(null);
    setMessage(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch("/api/ops/blog/media", {
        method: "POST",
        body: form,
      });
      const payload = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !payload.url) {
        throw new Error(payload.error ?? "Unable to upload image");
      }

      if (purpose === "hero") {
        setEditor((current) =>
          current
            ? { ...current, heroImageUrl: payload.url ?? null, heroImageAlt: alt }
            : current,
        );
        setMessage("Hero image uploaded. Open Preview to check it.");
      } else {
        const insertedAtLine = selectionLine;
        insertRawMarkdown(`\n\n![${alt}](${payload.url})\n\n`);
        setInlineImageAlt("");
        setMessage(`Image inserted at line ${insertedAtLine}. Open Preview to check placement.`);
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to upload image");
    } finally {
      setUploading(false);
    }
  }

  async function optimizeMetadata() {
    if (!editor) return;
    if (!editor.title.trim() || editor.bodyMarkdown.trim().length < 80) {
      setError("Add a title and more article content before using AI optimization.");
      return;
    }

    setOptimizing(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/ops/blog/optimize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: editor.title,
          bodyMarkdown: editor.bodyMarkdown,
        }),
      });
      const payload = (await response.json()) as {
        metadata?: OptimizedMetadata;
        error?: string;
      };
      if (!response.ok || !payload.metadata) {
        throw new Error(payload.error ?? "Unable to optimize article metadata");
      }

      setEditor((current) =>
        current
          ? {
              ...current,
              slug: slugLocked ? current.slug : payload.metadata?.slug ?? current.slug,
              category: payload.metadata?.category ?? current.category,
              excerpt: payload.metadata?.excerpt ?? current.excerpt,
              seoTitle: payload.metadata?.seoTitle ?? current.seoTitle,
              seoDescription:
                payload.metadata?.seoDescription ?? current.seoDescription,
            }
          : current,
      );
      if (!slugLocked) setSlugTouched(true);
      setMessage("AI suggestions applied. Review them before saving or publishing.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Unable to optimize article metadata",
      );
    } finally {
      setOptimizing(false);
    }
  }

  async function saveArticle(status: "draft" | "published") {
    if (!editor) return;
    const slug = editor.slug.trim() || slugifyBlogTitle(editor.title);
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/ops/blog/articles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...editor, slug, status }),
      });
      const payload = (await response.json()) as {
        article?: BlogArticle;
        error?: string;
      };
      if (!response.ok || !payload.article) {
        throw new Error(payload.error ?? "Unable to save article");
      }
      setEditor(payload.article);
      setSlugTouched(true);
      setHeroImageAlt(payload.article.heroImageAlt ?? "");
      setMessage(status === "published" ? "Article published." : "Draft saved.");
      await loadArticles(payload.article.id);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to save article");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-orange-300">
            Marketing content
          </div>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">Blog</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--theme-text-secondary)]">
            Write, preview, and publish ProFixIQ resources without a code deployment.
          </p>
        </div>
        <button
          type="button"
          onClick={startNewArticle}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-400"
        >
          <Plus className="h-4 w-4" /> New article
        </button>
      </div>

      {error ? (
        <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      ) : null}
      {message ? (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
          {message}
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Articles</h2>
            <span className="text-xs text-[color:var(--theme-text-muted)]">{articles.length}</span>
          </div>
          <div className="mt-4 space-y-2">
            {loading ? (
              <div className="flex items-center gap-2 py-4 text-sm text-[color:var(--theme-text-muted)]">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading…
              </div>
            ) : null}
            {!loading && articles.length === 0 ? (
              <p className="py-4 text-sm text-[color:var(--theme-text-muted)]">No articles yet.</p>
            ) : null}
            {articles.map((article) => (
              <button
                key={article.id}
                type="button"
                onClick={() => selectArticle(article)}
                className={`w-full rounded-xl border p-3 text-left transition ${
                  editor?.id === article.id
                    ? "border-orange-500/50 bg-orange-500/10"
                    : "border-[color:var(--theme-border-soft)] hover:bg-[color:var(--theme-surface-subtle)]"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-orange-300">
                    {article.status}
                  </span>
                  <span className="text-[10px] text-[color:var(--theme-text-muted)]">
                    {dateLabel(article.updatedAt)}
                  </span>
                </div>
                <div className="mt-2 line-clamp-2 text-sm font-semibold">{article.title}</div>
              </button>
            ))}
          </div>
        </aside>

        {editor ? (
          <div className="space-y-5">
            <div className="grid gap-5 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] p-5 lg:grid-cols-2">
              <label className="lg:col-span-2">
                <span className="text-xs font-semibold text-[color:var(--theme-text-secondary)]">Title</span>
                <input
                  value={editor.title}
                  onChange={(event) => updateTitle(event.target.value)}
                  className="mt-2 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2.5 text-sm"
                  placeholder="Why I Built ProFixIQ"
                />
              </label>
              <label>
                <span className="text-xs font-semibold text-[color:var(--theme-text-secondary)]">URL slug</span>
                <input
                  value={editor.slug}
                  disabled={slugLocked}
                  onChange={(event) => {
                    setSlugTouched(true);
                    update("slug", slugifyBlogTitle(event.target.value));
                  }}
                  className="mt-2 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60"
                />
                {slugLocked ? (
                  <span className="mt-1 block text-[11px] text-[color:var(--theme-text-muted)]">
                    Unpublish before changing a live URL.
                  </span>
                ) : null}
              </label>
              <label>
                <span className="text-xs font-semibold text-[color:var(--theme-text-secondary)]">Category</span>
                <input value={editor.category} onChange={(event) => update("category", event.target.value)} className="mt-2 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2.5 text-sm" />
              </label>
              <label className="lg:col-span-2">
                <span className="text-xs font-semibold text-[color:var(--theme-text-secondary)]">Excerpt</span>
                <textarea value={editor.excerpt} onChange={(event) => update("excerpt", event.target.value)} rows={3} className="mt-2 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2.5 text-sm" placeholder="Short summary used on resource cards and as the fallback search description." />
              </label>
              <label>
                <span className="text-xs font-semibold text-[color:var(--theme-text-secondary)]">Author</span>
                <input value={editor.authorName} onChange={(event) => update("authorName", event.target.value)} className="mt-2 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2.5 text-sm" />
              </label>
              <label>
                <span className="text-xs font-semibold text-[color:var(--theme-text-secondary)]">Author title</span>
                <input value={editor.authorTitle} onChange={(event) => update("authorTitle", event.target.value)} className="mt-2 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2.5 text-sm" />
              </label>
              <label>
                <span className="text-xs font-semibold text-[color:var(--theme-text-secondary)]">SEO title</span>
                <input value={editor.seoTitle} onChange={(event) => update("seoTitle", event.target.value)} className="mt-2 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2.5 text-sm" placeholder="Optional — article title is used by default" />
                <span className="mt-1 block text-[11px] text-[color:var(--theme-text-muted)]">{editor.seoTitle.length}/60 recommended</span>
              </label>
              <label>
                <span className="text-xs font-semibold text-[color:var(--theme-text-secondary)]">SEO description</span>
                <input value={editor.seoDescription} onChange={(event) => update("seoDescription", event.target.value)} className="mt-2 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2.5 text-sm" placeholder="Optional — excerpt is used by default" />
                <span className="mt-1 block text-[11px] text-[color:var(--theme-text-muted)]">{editor.seoDescription.length}/160 recommended</span>
              </label>
              <label className="flex items-center gap-3 lg:col-span-2">
                <input type="checkbox" checked={editor.featured} onChange={(event) => update("featured", event.target.checked)} className="h-4 w-4 rounded" />
                <span className="text-sm font-semibold">Feature this article ahead of newer resources</span>
              </label>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] p-5">
                <div className="text-sm font-semibold">Hero image</div>
                <p className="mt-1 text-xs leading-5 text-[color:var(--theme-text-muted)]">
                  Appears above the article body and on resource cards.
                </p>
                <label className="mt-4 block">
                  <span className="text-xs font-semibold text-[color:var(--theme-text-secondary)]">Hero image alt text</span>
                  <input value={heroImageAlt} onChange={(event) => setHeroImageAlt(event.target.value)} className="mt-2 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2.5 text-sm" placeholder="Describe what the hero image shows" />
                </label>
                <label className="mt-3 inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] px-4 py-2.5 text-sm font-bold hover:bg-[color:var(--theme-surface-subtle)]">
                  <ImagePlus className="h-4 w-4" /> {uploading ? "Uploading…" : "Upload hero image"}
                  <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={uploading} className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadImage(file, "hero"); event.currentTarget.value = ""; }} />
                </label>
                {editor.heroImageUrl ? (
                  <div className="mt-4 flex items-start gap-4">
                    <img src={editor.heroImageUrl} alt={editor.heroImageAlt ?? ""} className="h-24 w-40 rounded-lg border border-[color:var(--theme-border-soft)] object-cover" />
                    <div className="text-xs text-[color:var(--theme-text-muted)]">
                      <div>{editor.heroImageAlt}</div>
                      <button type="button" className="mt-2 font-bold text-red-300" onClick={() => { update("heroImageUrl", null); update("heroImageAlt", null); setHeroImageAlt(""); }}>
                        Remove from article
                      </button>
                    </div>
                  </div>
                ) : null}
              </div>

              <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] p-5">
                <div className="text-sm font-semibold">Inline image</div>
                <p className="mt-1 text-xs leading-5 text-[color:var(--theme-text-muted)]">
                  Tap the article where you want the image. The uploader remembers that cursor position even when Safari opens the file picker.
                </p>
                <div className="mt-3 rounded-lg border border-sky-500/25 bg-sky-500/10 px-3 py-2 text-xs text-sky-100">
                  Current insertion point: line {selectionLine}
                </div>
                <label className="mt-4 block">
                  <span className="text-xs font-semibold text-[color:var(--theme-text-secondary)]">Inline image alt text</span>
                  <input value={inlineImageAlt} onChange={(event) => setInlineImageAlt(event.target.value)} className="mt-2 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2.5 text-sm" placeholder="Describe this screenshot for accessibility" />
                </label>
                <label className="mt-3 inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] px-4 py-2.5 text-sm font-bold hover:bg-[color:var(--theme-surface-subtle)]">
                  <ImagePlus className="h-4 w-4" /> {uploading ? "Uploading…" : "Add image at cursor"}
                  <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={uploading} className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadImage(file, "inline"); event.currentTarget.value = ""; }} />
                </label>
              </div>
            </div>

            <div className="overflow-hidden rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)]">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--theme-border-soft)] p-3">
                <div className="flex flex-wrap items-center gap-1">
                  <button type="button" aria-label="Heading" onClick={() => replaceBodySelection("## ", "", "Heading")} className="rounded-lg p-2 hover:bg-[color:var(--theme-surface-subtle)]"><Heading2 className="h-4 w-4" /></button>
                  <button type="button" aria-label="Bold" onClick={() => replaceBodySelection("**", "**")} className="rounded-lg p-2 hover:bg-[color:var(--theme-surface-subtle)]"><Bold className="h-4 w-4" /></button>
                  <button type="button" aria-label="Italic" onClick={() => replaceBodySelection("_", "_")} className="rounded-lg p-2 hover:bg-[color:var(--theme-surface-subtle)]"><Italic className="h-4 w-4" /></button>
                  <button type="button" aria-label="List" onClick={() => replaceBodySelection("- ", "", "List item")} className="rounded-lg p-2 hover:bg-[color:var(--theme-surface-subtle)]"><List className="h-4 w-4" /></button>
                  <button type="button" aria-label="Link" onClick={() => replaceBodySelection("[", "](https://)", "link text")} className="rounded-lg p-2 hover:bg-[color:var(--theme-surface-subtle)]"><Link2 className="h-4 w-4" /></button>
                  <span className="ml-2 text-xs text-[color:var(--theme-text-muted)]">Markdown</span>
                </div>
                <div className="flex rounded-xl border border-[color:var(--theme-border-soft)] p-1">
                  <button type="button" onClick={() => setEditorView("write")} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold ${editorView === "write" ? "bg-[color:var(--theme-surface-subtle)] text-white" : "text-[color:var(--theme-text-muted)]"}`}>
                    <Pencil className="h-3.5 w-3.5" /> Write
                  </button>
                  <button type="button" onClick={() => setEditorView("preview")} className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs font-bold ${editorView === "preview" ? "bg-[color:var(--theme-surface-subtle)] text-white" : "text-[color:var(--theme-text-muted)]"}`}>
                    <Eye className="h-3.5 w-3.5" /> Preview
                  </button>
                </div>
              </div>

              {editorView === "write" ? (
                <div>
                  <div className="border-b border-[color:var(--theme-border-soft)] px-5 py-3 text-xs text-[color:var(--theme-text-muted)]">
                    Tap anywhere in the article to choose where the next inline image will be inserted. Current insertion point: line {selectionLine}.
                  </div>
                  <textarea
                    ref={bodyRef}
                    value={editor.bodyMarkdown}
                    onChange={(event) => {
                      update("bodyMarkdown", event.target.value);
                      requestAnimationFrame(rememberBodySelection);
                    }}
                    onSelect={rememberBodySelection}
                    onClick={rememberBodySelection}
                    onKeyUp={rememberBodySelection}
                    onBlur={rememberBodySelection}
                    className="min-h-[640px] w-full resize-y border-0 bg-[color:var(--theme-surface-inset)] p-5 font-mono text-sm leading-6 outline-none"
                    placeholder="Paste or write the article here…"
                  />
                </div>
              ) : (
                <div className="bg-slate-100 p-4 sm:p-6">
                  <div className="mb-3 text-xs font-bold uppercase tracking-[0.14em] text-slate-500">
                    Live article preview — updates from the unsaved editor
                  </div>
                  <ArticlePreview article={editor} />
                </div>
              )}
            </div>

            <div className="sticky bottom-4 z-20 flex flex-col gap-3 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)]/95 p-4 shadow-2xl backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-[color:var(--theme-text-muted)]">
                {storedArticle ? `Current status: ${storedArticle.status}` : "New article — not saved yet"}
              </div>
              <div className="flex flex-wrap gap-2">
                {storedArticle?.status === "published" ? (
                  <Link href={`/resources/${storedArticle.slug}`} target="_blank" className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] px-4 py-2.5 text-sm font-bold">
                    <ExternalLink className="h-4 w-4" /> Open live
                  </Link>
                ) : null}
                <button type="button" disabled={saving || uploading || optimizing || !editor.title.trim() || editor.bodyMarkdown.trim().length < 80} onClick={() => void optimizeMetadata()} className="inline-flex items-center gap-2 rounded-xl border border-orange-500/40 bg-orange-500/10 px-4 py-2.5 text-sm font-bold text-orange-200 disabled:opacity-50">
                  <WandSparkles className="h-4 w-4" /> {optimizing ? "Optimizing…" : "Optimize with AI"}
                </button>
                <button type="button" disabled={saving || uploading || optimizing} onClick={() => void saveArticle("draft")} className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] px-4 py-2.5 text-sm font-bold disabled:opacity-50">
                  <Save className="h-4 w-4" /> {storedArticle?.status === "published" ? "Unpublish & save draft" : "Save draft"}
                </button>
                <button type="button" disabled={saving || uploading || optimizing} onClick={() => void saveArticle("published")} className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50">
                  <Send className="h-4 w-4" /> Publish
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid min-h-[420px] place-items-center rounded-2xl border border-dashed border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] p-8 text-center">
            <div>
              <h2 className="text-xl font-semibold">Create or select an article</h2>
              <p className="mt-2 text-sm text-[color:var(--theme-text-muted)]">The editor will open here.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
