import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/TextLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()

interface TextItem {
  str: string
}

export interface Highlight {
  quote: string
  /** Primary highlight gets the marker color and is scrolled into view. */
  primary?: boolean
}

const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

/**
 * Finds each quote in the page's text (items joined by single spaces) and
 * returns, per text item, the character ranges to mark. Quotes can span
 * several items, e.g. a bank line drawn as date, description and amount.
 */
function computeMarks(items: TextItem[], highlights: Highlight[]) {
  // pdf.js emits whitespace-only spacer items between columns; skip them so
  // "07/03/2026 CASCADE ..." matches with single spaces.
  const starts: number[] = []
  let joined = ''
  items.forEach((it) => {
    const text = norm(it.str)
    if (!text) {
      starts.push(-1)
      return
    }
    if (joined) joined += ' '
    starts.push(joined.length)
    joined += text
  })
  const marks = new Map<number, { from: number; to: number; primary: boolean }[]>()
  for (const h of highlights) {
    const q = norm(h.quote)
    if (!q) continue
    const at = joined.indexOf(q)
    if (at < 0) continue
    const end = at + q.length
    items.forEach((it, i) => {
      const s = starts[i]
      if (s < 0) return
      const e = s + norm(it.str).length
      if (e <= at || s >= end) return
      const list = marks.get(i) ?? []
      list.push({ from: Math.max(0, at - s), to: Math.min(e, end) - s, primary: !!h.primary })
      marks.set(i, list)
    })
  }
  return marks
}

export function PdfViewer({
  url,
  page,
  highlights,
  onPageCount,
}: {
  url: string
  page: number
  highlights: Highlight[]
  onPageCount?: (n: number) => void
}) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(640)
  const [items, setItems] = useState<TextItem[]>([])
  const [error, setError] = useState(false)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(Math.min(820, Math.floor(entry.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  useEffect(() => {
    setItems([])
    setError(false)
  }, [url, page])

  const marks = useMemo(() => computeMarks(items, highlights), [items, highlights])

  const renderText = useCallback(
    ({ str, itemIndex }: { str: string; itemIndex: number }) => {
      const list = marks.get(itemIndex)
      const text = norm(str)
      if (!list) return escapeHtml(str)
      let out = ''
      let pos = 0
      for (const m of [...list].sort((a, b) => a.from - b.from)) {
        out += escapeHtml(text.slice(pos, m.from))
        out += `<mark class="proof${m.primary ? '' : ' secondary'}">${escapeHtml(text.slice(m.from, m.to))}</mark>`
        pos = m.to
      }
      return out + escapeHtml(text.slice(pos))
    },
    [marks],
  )

  // Scroll the primary highlight into view once the text layer is painted.
  useEffect(() => {
    if (!marks.size) return
    const t = setTimeout(() => {
      const el = wrapRef.current?.querySelector('mark.proof:not(.secondary)') ?? wrapRef.current?.querySelector('mark.proof')
      el?.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }, 120)
    return () => clearTimeout(t)
  }, [marks])

  return (
    <div ref={wrapRef} className="w-full">
      {error ? (
        <div className="rounded-xl bg-white p-10 text-center text-muted">This document couldn’t be loaded.</div>
      ) : (
        <Document
          file={url}
          onLoadSuccess={(d) => onPageCount?.(d.numPages)}
          onLoadError={() => setError(true)}
          loading={<div className="h-[600px] animate-pulse rounded-xl bg-white" />}
        >
          <div className="mx-auto overflow-hidden rounded-md bg-white shadow-[0_1px_2px_rgba(24,36,31,.06),0_14px_36px_rgba(24,36,31,.09)]" style={{ width }}>
            <Page
              pageNumber={page}
              width={width}
              renderAnnotationLayer={false}
              customTextRenderer={renderText}
              onGetTextSuccess={(tc) => {
                const next = tc.items.filter((i): i is TextItem & typeof i => 'str' in i)
                // Only update when the text actually changed, or the text layer re-renders forever.
                setItems((prev) =>
                  prev.length === next.length && prev.every((p, i) => p.str === next[i].str) ? prev : next,
                )
              }}
              loading={<div className="h-[600px]" />}
            />
          </div>
        </Document>
      )}
    </div>
  )
}
