"use client"

import { Sidebar } from "@/components/layout/sidebar"
import { Header } from "@/components/layout/header"
import { ClientStoreProvider } from "@/lib/client-store"
import { SidebarProvider, useSidebar } from "@/lib/sidebar-store"

function DashboardContent({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar()

  return (
    <div className="flex min-h-screen">
      <Sidebar />

      {/* Main content area offset by sidebar width */}
      <div
        className={`flex flex-1 flex-col transition-all duration-300 ${
          collapsed ? "pl-[72px]" : "pl-60"
        }`}
      >
        <Header />

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

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <SidebarProvider>
      <ClientStoreProvider>
        <DashboardContent>{children}</DashboardContent>
      </ClientStoreProvider>
    </SidebarProvider>
  )
}
