import { Sidebar } from "@/components/layout/sidebar"
import { Header } from "@/components/layout/header"

export default function DashboardLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <div className="flex min-h-screen">
      <Sidebar />

      {/* Main content area offset by sidebar width */}
      <div className="flex flex-1 flex-col pl-60">
        <Header />

        <main
          data-testid="main-content"
          className="flex flex-1 flex-col overflow-y-auto bg-gray-100 p-6"
        >
          {children}
        </main>
      </div>
    </div>
  )
}
