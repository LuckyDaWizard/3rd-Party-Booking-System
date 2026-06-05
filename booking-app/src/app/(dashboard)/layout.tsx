"use client"

import { useEffect } from "react"
import dynamic from "next/dynamic"
import { useRouter, usePathname } from "next/navigation"
import { Sidebar } from "@/components/layout/sidebar"
import { Header } from "@/components/layout/header"
import { SessionIdleMonitor } from "@/components/session-idle-monitor"

// Mobile-drawer chunk. The Sheet primitives + base-ui dialog portal code
// add ~15-25 kB to the bundle even though desktop visitors (lg: and up)
// never open it. Loading on-demand via next/dynamic keeps that chunk out
// of the initial bundle on desktop. ssr:false because Sheet hydrates a
// portal — there's nothing useful to render on the server.
const MobileDrawer = dynamic(
  () => import("@/components/layout/mobile-drawer").then((m) => m.MobileDrawer),
  { ssr: false }
)
import { ClientStoreProvider } from "@/lib/client-store"
import { UnitStoreProvider } from "@/lib/unit-store"
import { UserStoreProvider } from "@/lib/user-store"
import { BookingStoreProvider, useBookingStore } from "@/lib/booking-store"
import { SidebarProvider, useSidebar } from "@/lib/sidebar-store"
import { useAuth } from "@/lib/auth-store"
import { useActiveClientBranding } from "@/lib/use-active-client-branding"
import { Banner } from "@/components/ui/banner"

// ---------------------------------------------------------------------------
// Route access by role
// ---------------------------------------------------------------------------

const ADMIN_ONLY_ROUTES = ["/client-management", "/audit-log", "/security", "/coupons"]
const MANAGER_AND_ADMIN_ROUTES = ["/unit-management", "/user-management"]

function useRouteGuard() {
  const { user, loading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()

  useEffect(() => {
    if (loading) return

    // Not signed in — redirect to sign-in
    if (!user) {
      router.push("/sign-in")
      return
    }

    // Check admin-only routes
    if (ADMIN_ONLY_ROUTES.some((r) => pathname.startsWith(r))) {
      if (user.role !== "system_admin") {
        router.push("/home")
        return
      }
    }

    // Check manager + admin routes
    if (MANAGER_AND_ADMIN_ROUTES.some((r) => pathname.startsWith(r))) {
      if (user.role !== "system_admin" && user.role !== "unit_manager") {
        router.push("/home")
        return
      }
    }
  }, [user, loading, pathname, router])

  return { user, loading }
}

// ---------------------------------------------------------------------------
// Booking-error toast — listens to the booking store's lastError state and
// renders a dismissible Banner at the bottom-right of the viewport (audit
// #11). Replaces the prior behaviour of swallowing save failures into a
// console.error nobody sees.
// ---------------------------------------------------------------------------

function BookingErrorToast() {
  const { lastError, clearLastError } = useBookingStore()
  if (!lastError) return null
  return (
    <div className="pointer-events-none fixed bottom-6 right-6 z-50 w-[min(90vw,32rem)]">
      <div className="pointer-events-auto shadow-lg">
        <Banner
          kind="danger"
          title="Something went wrong"
          description={lastError}
          onDismiss={clearLastError}
          testId="booking-error-toast"
        />
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Dashboard content
// ---------------------------------------------------------------------------

function DashboardContent({ children }: { children: React.ReactNode }) {
  const { collapsed, mobileOpen, setMobileOpen } = useSidebar()
  const { user, loading } = useRouteGuard()
  const branding = useActiveClientBranding()

  // Inline-style override for the per-client accent. Setting --client-primary
  // on the dashboard wrapper means everything beneath inherits this client's
  // accent through the var() chain in globals.css. Routes outside this
  // layout (sign-in, forgot-PIN, error pages) don't get the override and
  // keep rendering the system default. Phase 2 only sets the variable;
  // Phase 3 (separate refactor) is what actually reads it via the Tailwind
  // arbitrary-value classes.
  const themeStyle = {
    "--client-primary": branding.accent,
  } as React.CSSProperties

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <svg className="size-10 animate-spin" viewBox="0 0 40 40" fill="none">
          <circle cx="20" cy="20" r="15" stroke="#d1d5db" strokeWidth="5" strokeLinecap="round" />
          <circle cx="20" cy="20" r="15" stroke="var(--client-primary)" strokeWidth="5" strokeLinecap="round" strokeDasharray="94.25" strokeDashoffset="70" />
        </svg>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen" style={themeStyle}>
      {/* Desktop sidebar — hidden below lg: */}
      <div className="hidden lg:block">
        <Sidebar />
      </div>

      {/* Mobile slide-over drawer — hidden at lg: and up. Mounted only
          once the user actually opens it (mobileOpen flips true), so
          desktop visitors never download the Sheet / base-ui chunks. */}
      {mobileOpen && (
        <MobileDrawer open={mobileOpen} onOpenChange={setMobileOpen} />
      )}

      {/* Main content area — offset by sidebar width only at lg: and up.
          Below lg: there is no fixed sidebar so no left padding is needed. */}
      <div
        className={`flex flex-1 flex-col transition-all duration-300 ${
          collapsed ? "lg:pl-[72px]" : "lg:pl-60"
        }`}
      >
        <Header
          userName={`${user.firstNames} ${user.surname}`}
          // Resolution order for the sub-name line:
          //   1. Active unit's parent client (via useActiveClientBranding) —
          //      the most relevant label when an admin has picked a unit.
          //   2. User's primary clientName — for unit_managers / users
          //      who only ever belong to one client.
          //   3. "CareFirst" — fallback for system_admins with no active
          //      unit yet, or any edge case where neither of the above
          //      resolves.
          companyName={branding.clientName ?? user.clientName ?? "CareFirst"}
          avatarUrl={user.avatarUrl ?? undefined}
        />

        <main
          data-testid="main-content"
          className="flex flex-1 flex-col overflow-y-auto bg-[#f4f4f4] p-4 sm:p-6"
        >
          {children}
        </main>
      </div>

      {/* Idle-timeout monitor — only mounts for authenticated users (it
          checks useAuth().user internally) and is scoped to dashboard
          routes by virtue of living in this layout. Unauthenticated
          routes (/sign-in, /forgot-pin, /reset-pin) don't need it. */}
      <SessionIdleMonitor />

      {/* Booking save/load failure toast (audit #11). */}
      <BookingErrorToast />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <SidebarProvider>
      <ClientStoreProvider>
        <UnitStoreProvider>
          <UserStoreProvider>
            <BookingStoreProvider>
              <DashboardContent>{children}</DashboardContent>
            </BookingStoreProvider>
          </UserStoreProvider>
        </UnitStoreProvider>
      </ClientStoreProvider>
    </SidebarProvider>
  )
}
