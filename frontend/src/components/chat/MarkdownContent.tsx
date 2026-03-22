import { memo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'

interface MarkdownContentProps {
  content: string
  /** Extra Tailwind classes on the wrapper */
  className?: string
}

/**
 * Shared markdown renderer for agent messages in the chat pane.
 *
 * Designed for the compact chat context (11–12px text) — uses custom
 * component overrides rather than @tailwindcss/typography so we have
 * full control over spacing and sizing within chat bubbles.
 */
export const MarkdownContent = memo(function MarkdownContent({ content, className = '' }: MarkdownContentProps) {
  return (
    <div className={`markdown-content wrap-break-word ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  )
})

const components: Components = {
  // ── Block elements ──────────────────────────────────────────────────

  h1: ({ children }) => (
    <h1 className="mb-1.5 mt-2 text-sm font-bold text-foreground first:mt-0">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="mb-1 mt-2 text-[13px] font-semibold text-foreground first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="mb-1 mt-1.5 text-xs font-semibold text-foreground first:mt-0">{children}</h3>
  ),
  h4: ({ children }) => (
    <h4 className="mb-0.5 mt-1.5 text-xs font-medium text-foreground first:mt-0">{children}</h4>
  ),
  h5: ({ children }) => (
    <h5 className="mb-0.5 mt-1 text-xs font-medium text-muted-foreground first:mt-0">{children}</h5>
  ),
  h6: ({ children }) => (
    <h6 className="mb-0.5 mt-1 text-xs font-medium text-muted-foreground first:mt-0">{children}</h6>
  ),

  p: ({ children }) => (
    <p className="mb-1.5 text-xs leading-relaxed last:mb-0">{children}</p>
  ),

  blockquote: ({ children }) => (
    <blockquote className="my-1.5 border-l-2 border-primary/40 pl-2 text-xs italic text-muted-foreground">
      {children}
    </blockquote>
  ),

  hr: () => <hr className="my-2 border-border/50" />,

  // ── Lists ───────────────────────────────────────────────────────────

  ul: ({ children }) => (
    <ul className="mb-1.5 ml-3 list-disc space-y-0.5 text-xs last:mb-0">{children}</ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-1.5 ml-3 list-decimal space-y-0.5 text-xs last:mb-0">{children}</ol>
  ),
  li: ({ children }) => (
    <li className="text-xs leading-relaxed [&>p]:mb-0">{children}</li>
  ),

  // ── Code ────────────────────────────────────────────────────────────

  code: ({ children, className }) => {
    // Fenced code blocks get a className like "language-js" from remark
    const isBlock = typeof className === 'string' && className.startsWith('language-')

    if (isBlock) {
      return (
        <code className="text-[11px]">{children}</code>
      )
    }

    // Inline code
    return (
      <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px] text-primary wrap-anywhere">
        {children}
      </code>
    )
  },

  pre: ({ children }) => (
    <pre className="my-1.5 overflow-x-auto rounded-md bg-muted/70 p-2 text-[11px] last:mb-0">
      {children}
    </pre>
  ),

  // ── Tables ──────────────────────────────────────────────────────────

  table: ({ children }) => (
    <div className="my-1.5 overflow-x-auto last:mb-0">
      <table className="min-w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  thead: ({ children }) => (
    <thead className="border-b border-border bg-muted/30">{children}</thead>
  ),
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => (
    <tr className="border-b border-border/30">{children}</tr>
  ),
  th: ({ children }) => (
    <th className="px-2 py-1 text-left text-[11px] font-semibold text-foreground">{children}</th>
  ),
  td: ({ children }) => (
    <td className="px-2 py-1 text-[11px] text-foreground">{children}</td>
  ),

  // ── Inline elements ─────────────────────────────────────────────────

  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-primary underline decoration-primary/40 underline-offset-2 hover:decoration-primary"
    >
      {children}
    </a>
  ),

  strong: ({ children }) => (
    <strong className="font-semibold text-foreground">{children}</strong>
  ),

  em: ({ children }) => <em className="italic">{children}</em>,

  del: ({ children }) => (
    <del className="text-muted-foreground line-through">{children}</del>
  ),

  // ── Task lists (GFM) ───────────────────────────────────────────────

  input: ({ checked, ...props }) => (
    <input
      type="checkbox"
      checked={checked}
      readOnly
      className="mr-1 align-middle accent-primary"
      {...props}
    />
  ),

  // ── Images ──────────────────────────────────────────────────────────

  img: ({ src, alt }) => (
    <img
      src={src}
      alt={alt ?? ''}
      className="my-1.5 max-h-48 max-w-full rounded-md"
    />
  ),
}
