"use client"

import { useEffect } from "react"
import { useRouter, usePathname } from "next/navigation"
import { Sidebar } from "@/components/layout/sidebar"
import { Header } from "@/components/layout/header"
import { ClientStoreProvider } from "@/lib/client-store"
import { UnitStoreProvider } from "@/lib/unit-store"
import { UserStoreProvider } from "@/lib/user-store"
import { BookingStoreProvider } from "@/lib/booking-store"
import { SidebarProvider, useSidebar } from "@/lib/sidebar-store"
import { useAuth } from "@/lib/auth-store"

// ---------------------------------------------------------------------------
// Route access by role
// ---------------------------------------------------------------------------

const ADMIN_ONLY_ROUTES = ["/client-management"]
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
// Dashboard content
// ---------------------------------------------------------------------------

function DashboardContent({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar()
  const { user, loading } = useRouteGuard()

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <svg className="size-10 animate-spin" viewBox="0 0 40 40" fill="none">
          <circle cx="20" cy="20" r="15" stroke="#d1d5db" strokeWidth="5" strokeLinecap="round" />
          <circle cx="20" cy="20" r="15" stroke="#3ea3db" strokeWidth="5" strokeLinecap="round" strokeDasharray="94.25" strokeDashoffset="70" />
        </svg>
      </div>
    )
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar />

      {/* Main content area offset by sidebar width */}
      <div
        className={`flex flex-1 flex-col transition-all duration-300 ${
          collapsed ? "pl-[72px]" : "pl-60"
        }`}
      >
        <Header
          userName={`${user.firstNames} ${user.surname}`}
          companyName={user.clientName ?? "CareFirst"}
          avatarUrl={user.avatarUrl ?? undefined}
        />

        <main
          data-testid="main-content"
          className="flex flex-1 flex-col overflow-y-auto bg-[#f4f4f4] p-6"
        >
          {children}
        </main>
      </div>
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
