/* eslint-disable @next/next/no-img-element */
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bold,
  ExternalLink,
  Heading2,
  ImagePlus,
  Italic,
  Link2,
  List,
  Loader2,
  Plus,
  Save,
  Send,
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

export default function OpsBlogManager() {
  const [articles, setArticles] = useState<BlogArticle[]>([]);
  const [editor, setEditor] = useState<EditorArticle | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);
  const [imageAlt, setImageAlt] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

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

  function startNewArticle() {
    setEditor({ ...EMPTY_ARTICLE });
    setSlugTouched(false);
    setImageAlt("");
    setMessage(null);
    setError(null);
  }

  function selectArticle(article: BlogArticle) {
    setEditor(article);
    setSlugTouched(true);
    setImageAlt("");
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

  function insertMarkdown(before: string, after = "", placeholder = "text") {
    if (!editor) return;
    const textarea = bodyRef.current;
    const start = textarea?.selectionStart ?? editor.bodyMarkdown.length;
    const end = textarea?.selectionEnd ?? start;
    const selected = editor.bodyMarkdown.slice(start, end) || placeholder;
    const next = `${editor.bodyMarkdown.slice(0, start)}${before}${selected}${after}${editor.bodyMarkdown.slice(end)}`;
    update("bodyMarkdown", next);

    requestAnimationFrame(() => {
      textarea?.focus();
      const caret = start + before.length + selected.length + after.length;
      textarea?.setSelectionRange(caret, caret);
    });
  }

  function insertRawMarkdown(markdown: string) {
    if (!editor) return;
    const textarea = bodyRef.current;
    const start = textarea?.selectionStart ?? editor.bodyMarkdown.length;
    const end = textarea?.selectionEnd ?? start;
    const next = `${editor.bodyMarkdown.slice(0, start)}${markdown}${editor.bodyMarkdown.slice(end)}`;
    update("bodyMarkdown", next);

    requestAnimationFrame(() => {
      textarea?.focus();
      const caret = start + markdown.length;
      textarea?.setSelectionRange(caret, caret);
    });
  }

  async function uploadImage(file: File, purpose: "hero" | "inline") {
    const alt = imageAlt.trim();
    if (!alt) {
      setError("Add image alt text before uploading.");
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
      } else {
        insertRawMarkdown(`![${alt}](${payload.url})`);
      }
      setImageAlt("");
      setMessage("Image uploaded.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to upload image");
    } finally {
      setUploading(false);
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
          <div className="text-xs font-bold uppercase tracking-[0.18em] text-orange-300">Marketing content</div>
          <h1 className="mt-2 text-3xl font-semibold tracking-[-0.035em]">Blog</h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[color:var(--theme-text-secondary)]">
            Write, preview, and publish ProFixIQ resources without a code deployment.
          </p>
        </div>
        <button type="button" onClick={startNewArticle} className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-400">
          <Plus className="h-4 w-4" /> New article
        </button>
      </div>

      {error ? <div role="alert" className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div> : null}
      {message ? <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">{message}</div> : null}

      <div className="grid gap-6 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Articles</h2>
            <span className="text-xs text-[color:var(--theme-text-muted)]">{articles.length}</span>
          </div>
          <div className="mt-4 space-y-2">
            {loading ? <div className="flex items-center gap-2 py-4 text-sm text-[color:var(--theme-text-muted)]"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div> : null}
            {!loading && articles.length === 0 ? <p className="py-4 text-sm text-[color:var(--theme-text-muted)]">No articles yet.</p> : null}
            {articles.map((article) => (
              <button key={article.id} type="button" onClick={() => selectArticle(article)} className={`w-full rounded-xl border p-3 text-left transition ${editor?.id === article.id ? "border-orange-500/50 bg-orange-500/10" : "border-[color:var(--theme-border-soft)] hover:bg-[color:var(--theme-surface-subtle)]"}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-[0.14em] text-orange-300">{article.status}</span>
                  <span className="text-[10px] text-[color:var(--theme-text-muted)]">{dateLabel(article.updatedAt)}</span>
                </div>
                <div className="mt-2 line-clamp-2 text-sm font-semibold">{article.title}</div>
              </button>
            ))}
          </div>
        </aside>

        {editor ? (
          <div className="space-y-5">
            <div className="grid gap-5 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] p-5 lg:grid-cols-2">
              <label className="lg:col-span-2"><span className="text-xs font-semibold text-[color:var(--theme-text-secondary)]">Title</span><input value={editor.title} onChange={(event) => updateTitle(event.target.value)} className="mt-2 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2.5 text-sm" placeholder="Why I Built ProFixIQ" /></label>
              <label><span className="text-xs font-semibold text-[color:var(--theme-text-secondary)]">URL slug</span><input value={editor.slug} disabled={slugLocked} onChange={(event) => { setSlugTouched(true); update("slug", slugifyBlogTitle(event.target.value)); }} className="mt-2 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2.5 text-sm disabled:cursor-not-allowed disabled:opacity-60" />{slugLocked ? <span className="mt-1 block text-[11px] text-[color:var(--theme-text-muted)]">Unpublish before changing a live URL.</span> : null}</label>
              <label><span className="text-xs font-semibold text-[color:var(--theme-text-secondary)]">Category</span><input value={editor.category} onChange={(event) => update("category", event.target.value)} className="mt-2 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2.5 text-sm" /></label>
              <label className="lg:col-span-2"><span className="text-xs font-semibold text-[color:var(--theme-text-secondary)]">Excerpt</span><textarea value={editor.excerpt} onChange={(event) => update("excerpt", event.target.value)} rows={3} className="mt-2 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2.5 text-sm" placeholder="Short summary used on resource cards and as the fallback search description." /></label>
              <label><span className="text-xs font-semibold text-[color:var(--theme-text-secondary)]">Author</span><input value={editor.authorName} onChange={(event) => update("authorName", event.target.value)} className="mt-2 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2.5 text-sm" /></label>
              <label><span className="text-xs font-semibold text-[color:var(--theme-text-secondary)]">Author title</span><input value={editor.authorTitle} onChange={(event) => update("authorTitle", event.target.value)} className="mt-2 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2.5 text-sm" /></label>
              <label><span className="text-xs font-semibold text-[color:var(--theme-text-secondary)]">SEO title</span><input value={editor.seoTitle} onChange={(event) => update("seoTitle", event.target.value)} className="mt-2 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2.5 text-sm" placeholder="Optional — article title is used by default" /></label>
              <label><span className="text-xs font-semibold text-[color:var(--theme-text-secondary)]">SEO description</span><input value={editor.seoDescription} onChange={(event) => update("seoDescription", event.target.value)} className="mt-2 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2.5 text-sm" placeholder="Optional — excerpt is used by default" /></label>
              <label className="flex items-center gap-3 lg:col-span-2"><input type="checkbox" checked={editor.featured} onChange={(event) => update("featured", event.target.checked)} className="h-4 w-4 rounded" /><span className="text-sm font-semibold">Feature this article ahead of newer resources</span></label>
            </div>

            <div className="rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] p-5">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-end">
                <label className="min-w-0 flex-1"><span className="text-xs font-semibold text-[color:var(--theme-text-secondary)]">Image alt text</span><input value={imageAlt} onChange={(event) => setImageAlt(event.target.value)} className="mt-2 w-full rounded-xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-inset)] px-3 py-2.5 text-sm" placeholder="Describe what the screenshot shows" /></label>
                <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] px-4 py-2.5 text-sm font-bold hover:bg-[color:var(--theme-surface-subtle)]">
                  <ImagePlus className="h-4 w-4" /> {uploading ? "Uploading…" : "Upload hero image"}
                  <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={uploading} className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadImage(file, "hero"); event.currentTarget.value = ""; }} />
                </label>
                <label className="inline-flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] px-4 py-2.5 text-sm font-bold hover:bg-[color:var(--theme-surface-subtle)]">
                  <ImagePlus className="h-4 w-4" /> Add image to article
                  <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={uploading} className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadImage(file, "inline"); event.currentTarget.value = ""; }} />
                </label>
              </div>
              {editor.heroImageUrl ? <div className="mt-4 flex items-start gap-4"><img src={editor.heroImageUrl} alt={editor.heroImageAlt ?? ""} className="h-24 w-40 rounded-lg border border-[color:var(--theme-border-soft)] object-cover" /><div className="text-xs text-[color:var(--theme-text-muted)]"><div>Hero image</div><button type="button" className="mt-2 font-bold text-red-300" onClick={() => { update("heroImageUrl", null); update("heroImageAlt", null); }}>Remove from article</button></div></div> : null}
            </div>

            <div className="overflow-hidden rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)]">
              <div className="flex flex-wrap items-center gap-1 border-b border-[color:var(--theme-border-soft)] p-3">
                <button type="button" aria-label="Heading" onClick={() => insertMarkdown("## ", "", "Heading")} className="rounded-lg p-2 hover:bg-[color:var(--theme-surface-subtle)]"><Heading2 className="h-4 w-4" /></button>
                <button type="button" aria-label="Bold" onClick={() => insertMarkdown("**", "**")} className="rounded-lg p-2 hover:bg-[color:var(--theme-surface-subtle)]"><Bold className="h-4 w-4" /></button>
                <button type="button" aria-label="Italic" onClick={() => insertMarkdown("_", "_")} className="rounded-lg p-2 hover:bg-[color:var(--theme-surface-subtle)]"><Italic className="h-4 w-4" /></button>
                <button type="button" aria-label="List" onClick={() => insertMarkdown("- ", "", "List item")} className="rounded-lg p-2 hover:bg-[color:var(--theme-surface-subtle)]"><List className="h-4 w-4" /></button>
                <button type="button" aria-label="Link" onClick={() => insertMarkdown("[", "](https://)", "link text")} className="rounded-lg p-2 hover:bg-[color:var(--theme-surface-subtle)]"><Link2 className="h-4 w-4" /></button>
                <span className="ml-2 text-xs text-[color:var(--theme-text-muted)]">Markdown</span>
              </div>
              <div className="grid min-h-[560px] lg:grid-cols-2">
                <textarea ref={bodyRef} value={editor.bodyMarkdown} onChange={(event) => update("bodyMarkdown", event.target.value)} className="min-h-[560px] resize-y border-0 bg-[color:var(--theme-surface-inset)] p-5 font-mono text-sm leading-6 outline-none lg:border-r lg:border-[color:var(--theme-border-soft)]" placeholder="Paste or write the article here…" />
                <div className="min-h-[560px] overflow-auto p-6">
                  <div className="mb-5 text-xs font-bold uppercase tracking-[0.14em] text-[color:var(--theme-text-muted)]">Live preview</div>
                  <div className="prose prose-invert max-w-none prose-a:text-orange-300 prose-img:rounded-xl">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{editor.bodyMarkdown || "Nothing to preview yet."}</ReactMarkdown>
                  </div>
                </div>
              </div>
            </div>

            <div className="sticky bottom-4 z-20 flex flex-col gap-3 rounded-2xl border border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)]/95 p-4 shadow-2xl backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
              <div className="text-xs text-[color:var(--theme-text-muted)]">{storedArticle ? `Current status: ${storedArticle.status}` : "New article — not saved yet"}</div>
              <div className="flex flex-wrap gap-2">
                {storedArticle?.status === "published" ? <Link href={`/resources/${storedArticle.slug}`} target="_blank" className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] px-4 py-2.5 text-sm font-bold"><ExternalLink className="h-4 w-4" /> Open live</Link> : null}
                <button type="button" disabled={saving || uploading} onClick={() => void saveArticle("draft")} className="inline-flex items-center gap-2 rounded-xl border border-[color:var(--theme-border-soft)] px-4 py-2.5 text-sm font-bold disabled:opacity-50"><Save className="h-4 w-4" /> {storedArticle?.status === "published" ? "Unpublish & save draft" : "Save draft"}</button>
                <button type="button" disabled={saving || uploading} onClick={() => void saveArticle("published")} className="inline-flex items-center gap-2 rounded-xl bg-orange-500 px-4 py-2.5 text-sm font-bold text-white disabled:opacity-50"><Send className="h-4 w-4" /> Publish</button>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid min-h-[420px] place-items-center rounded-2xl border border-dashed border-[color:var(--theme-border-soft)] bg-[color:var(--theme-surface-overlay)] p-8 text-center">
            <div><h2 className="text-xl font-semibold">Create or select an article</h2><p className="mt-2 text-sm text-[color:var(--theme-text-muted)]">The editor will open here.</p></div>
          </div>
        )}
      </div>
    </div>
  );
}
