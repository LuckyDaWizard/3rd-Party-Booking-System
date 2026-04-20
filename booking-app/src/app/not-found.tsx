import Link from "next/link"
import { Button } from "@/components/ui/button"
import { SearchX } from "lucide-react"

// =============================================================================
// 404 / Not Found
//
// Rendered for any route that Next.js can't match. Keeps the brand tone and
// provides a home link + support mailto so a user who landed here by
// mistyping or following a stale link has a clear next step.
// =============================================================================

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white px-4">
      <div className="flex w-full max-w-md flex-col items-center gap-6 text-center">
        <SearchX className="size-16 text-gray-400" strokeWidth={1.5} />

        <h1 className="text-2xl font-extrabold text-gray-900 sm:text-3xl">
          Page not found
        </h1>

        <p className="text-base text-gray-500">
          The page you were looking for doesn&apos;t exist — it may have been
          moved or the link you followed is out of date.
        </p>

        <div className="flex w-full flex-col gap-3">
          <Link href="/home">
            <Button className="h-12 w-full rounded-xl bg-gray-900 text-base font-semibold text-white hover:bg-gray-800">
              Back to home
            </Button>
          </Link>
          <a
            href="mailto:lehlohonolom@firstcare.solutions?subject=CareFirst%20Booking%20-%20Broken%20link"
            className="text-sm font-medium text-[#3ea3db] hover:underline"
          >
            Report a broken link
          </a>
        </div>
      </div>
    </div>
  )
}
