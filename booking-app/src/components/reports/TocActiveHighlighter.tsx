"use client"

import { useEffect } from "react"

/**
 * Wires up the same TOC-highlight behaviour the static walkthrough docs use:
 * an IntersectionObserver watches each `section.doc-section`, and when one is
 * in the middle band of the viewport we add `active` to its matching TOC
 * anchor.
 *
 * Runs once on mount; cleans up on unmount.
 */
export function TocActiveHighlighter() {
  useEffect(() => {
    const sections = document.querySelectorAll(
      ".reports-root section.doc-section"
    )
    if (!sections.length) return

    const links = new Map<string, HTMLAnchorElement>()
    document.querySelectorAll<HTMLAnchorElement>(".reports-root .toc a").forEach((a) => {
      const href = a.getAttribute("href")
      if (href?.startsWith("#")) {
        links.set(href.slice(1), a)
      }
    })

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const link = links.get(entry.target.id)
          if (!link) return
          if (entry.isIntersecting) {
            links.forEach((l) => l.classList.remove("active"))
            link.classList.add("active")
          }
        })
      },
      { rootMargin: "-20% 0px -70% 0px", threshold: 0 }
    )

    sections.forEach((s) => observer.observe(s))
    return () => observer.disconnect()
  }, [])

  return null
}
