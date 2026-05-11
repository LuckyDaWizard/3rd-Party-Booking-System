"use client"

import { useEffect, useState } from "react"

/**
 * Floating "back to top" button that appears once the user has scrolled
 * a meaningful distance, and smooth-scrolls to the top when clicked.
 *
 * Mounted from the /reports layout so it works on both the index and every
 * report detail page without each page having to opt in.
 */
export function ScrollToTop({ threshold = 400 }: { threshold?: number }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    function onScroll() {
      setVisible(window.scrollY > threshold)
    }
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [threshold])

  function scrollToTop() {
    window.scrollTo({ top: 0, behavior: "smooth" })
  }

  return (
    <button
      type="button"
      onClick={scrollToTop}
      aria-label="Scroll to top"
      className={`scroll-to-top ${visible ? "visible" : ""}`}
    >
      <span aria-hidden="true">↑</span>
    </button>
  )
}
