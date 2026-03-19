"use client"

import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import {
  Home,
  CalendarPlus,
  ClipboardList,
  UserCircle,
  Building2,
  Users,
  Plus,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useSidebar } from "@/lib/sidebar-store"

interface NavItem {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

const navItems: NavItem[] = [
  { label: "Home", href: "/home", icon: Home },
  { label: "Create a Booking", href: "/create-booking", icon: CalendarPlus },
  { label: "Patient History", href: "/patient-history", icon: ClipboardList },
  { label: "Client Management", href: "/client-management", icon: UserCircle },
  { label: "Unit Management", href: "/unit-management", icon: Building2 },
  { label: "User Management", href: "/user-management", icon: Users },
]

export function Sidebar() {
  const pathname = usePathname()
  const { collapsed, toggle } = useSidebar()

  return (
    <aside
      data-testid="sidebar"
      className={cn(
        "fixed left-0 top-0 z-30 flex h-screen flex-col border-r border-border bg-white transition-all duration-300",
        collapsed ? "w-[72px]" : "w-60"
      )}
    >
      {/* Logo area */}
      <div
        className={cn(
          "flex items-center py-6",
          collapsed ? "justify-center px-2" : "px-5"
        )}
        data-testid="sidebar-logo"
      >
        {collapsed ? (
          <Image
            src="/favicon.png"
            alt="CareFirst"
            width={36}
            height={36}
            priority
            className="size-9 object-contain"
          />
        ) : (
          <Image
            src="/carefirst-logo.png"
            alt="CareFirst"
            width={200}
            height={36}
            priority
            className="h-auto w-[200px]"
          />
        )}
      </div>

      {/* Collapse toggle */}
      <button
        type="button"
        data-testid="sidebar-toggle"
        onClick={toggle}
        className={cn(
          "mx-3 mb-2 flex items-center rounded-lg px-3 py-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600",
          collapsed ? "justify-center" : "justify-end"
        )}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? (
          <ChevronsRight className="size-4" />
        ) : (
          <ChevronsLeft className="size-4" />
        )}
      </button>

      {/* Navigation */}
      <nav
        data-testid="sidebar-nav"
        className="flex flex-1 flex-col gap-1 px-3"
        aria-label="Main navigation"
      >
        {navItems.map((item) => {
          const isActive =
            item.href === "/home"
              ? pathname === "/home"
              : pathname.startsWith(item.href)

          return (
            <Link
              key={item.href}
              href={item.href}
              data-testid={`nav-link-${item.href.replace(/\//g, "").replace(/-/g, "-") || "home"}`}
              className={cn(
                "flex items-center rounded-lg text-sm font-medium transition-colors",
                collapsed
                  ? "justify-center px-2 py-2.5"
                  : "gap-3 px-3 py-2.5",
                isActive
                  ? "bg-[#3ea3db]/10 text-[#3ea3db]"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              )}
              aria-current={isActive ? "page" : undefined}
              title={collapsed ? item.label : undefined}
            >
              <item.icon
                className={cn(
                  "size-5 shrink-0",
                  isActive ? "text-[#3ea3db]" : "text-gray-400"
                )}
              />
              {!collapsed && item.label}
            </Link>
          )
        })}
      </nav>

      {/* Contact Support button */}
      <div className={cn("pb-6", collapsed ? "px-2" : "px-4")}>
        <Button
          data-testid="contact-support-btn"
          className={cn(
            "w-full justify-center rounded-xl bg-gray-900 text-sm font-medium text-white hover:bg-gray-800",
            collapsed ? "px-2 py-4" : "gap-2 py-6"
          )}
          size="lg"
        >
          {collapsed ? (
            <Plus className="size-4" />
          ) : (
            <>
              Contact Support
              <Plus className="size-4" />
            </>
          )}
        </Button>
      </div>
    </aside>
  )
}
