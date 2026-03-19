"use client"

import { useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname, useSearchParams } from "next/navigation"
import {
  Home,
  CalendarPlus,
  ClipboardList,
  UserCircle,
  Building2,
  Users,
  Headset,
  ChevronsLeft,
  ChevronsRight,
  ChevronDown,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useSidebar } from "@/lib/sidebar-store"

interface NavChild {
  label: string
  href: string
}

interface NavItem {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  children?: NavChild[]
}

const navItems: NavItem[] = [
  { label: "Home", href: "/home", icon: Home },
  { label: "Create a Booking", href: "/create-booking", icon: CalendarPlus },
  {
    label: "Patient History",
    href: "/patient-history",
    icon: ClipboardList,
    children: [
      { label: "All Patients", href: "/patient-history" },
      { label: "In Progress", href: "/patient-history?tab=in-progress" },
      { label: "Completed", href: "/patient-history?tab=completed" },
    ],
  },
  { label: "Client Management", href: "/client-management", icon: UserCircle },
  { label: "Unit Management", href: "/unit-management", icon: Building2 },
  { label: "User Management", href: "/user-management", icon: Users },
]

export function Sidebar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { collapsed, toggle } = useSidebar()
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)

  // Build full current URL path + search for child active matching
  const currentSearch = searchParams.toString()
  const currentFullPath = currentSearch ? `${pathname}?${currentSearch}` : pathname

  return (
    <aside
      data-testid="sidebar"
      className={cn(
        "fixed left-0 top-0 z-30 flex h-screen flex-col border-r border-border bg-white transition-all duration-300",
        collapsed ? "w-[72px]" : "w-60"
      )}
    >
      {/* Collapse toggle */}
      <button
        type="button"
        data-testid="sidebar-toggle"
        onClick={toggle}
        className={cn(
          "mt-3 mb-0 flex items-center rounded-lg px-3 py-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600",
          collapsed ? "mx-3 justify-center" : "ml-auto mr-3 w-fit"
        )}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? (
          <ChevronsRight className="size-4" />
        ) : (
          <ChevronsLeft className="size-4" />
        )}
      </button>

      {/* Logo area */}
      <div
        className={cn(
          "flex items-center py-4",
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

          const hasChildren = item.children && item.children.length > 0
          const isDropdownOpen = openDropdown === item.href

          if (hasChildren) {
            // Collapsed: popout menu to the right
            if (collapsed) {
              return (
                <div key={item.href} className="relative">
                  <button
                    type="button"
                    data-testid={`nav-link-${item.href.replace(/\//g, "").replace(/-/g, "-") || "home"}`}
                    onClick={() =>
                      setOpenDropdown(isDropdownOpen ? null : item.href)
                    }
                    className={cn(
                      "flex w-full items-center justify-center rounded-lg px-2 py-2.5 transition-colors",
                      isActive
                        ? "bg-[#3ea3db]/10 text-[#3ea3db]"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    )}
                    title={item.label}
                  >
                    <item.icon
                      className={cn(
                        "size-5 shrink-0",
                        isActive ? "text-[#3ea3db]" : "text-gray-400"
                      )}
                    />
                  </button>
                  {isDropdownOpen && (
                    <div className="absolute left-full top-0 z-50 ml-2 w-48 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
                      <div className="px-3 py-2 text-xs font-semibold text-gray-400 uppercase tracking-wider">
                        {item.label}
                      </div>
                      <div className="flex flex-col gap-0.5 px-2 pb-2">
                        {item.children!.map((child) => {
                          const isChildActive = child.href.includes("?")
                            ? currentFullPath === child.href
                            : currentFullPath === child.href
                          return (
                            <Link
                              key={child.href}
                              href={child.href}
                              onClick={() => setOpenDropdown(null)}
                              className={cn(
                                "flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors",
                                isChildActive
                                  ? "text-[#3ea3db] font-medium bg-[#3ea3db]/10"
                                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                              )}
                            >
                              <span className={cn(
                                "flex size-4 shrink-0 items-center justify-center rounded-full border-2",
                                isChildActive
                                  ? "border-[#3ea3db]"
                                  : "border-gray-300"
                              )}>
                                {isChildActive && (
                                  <span className="size-2 rounded-full bg-[#3ea3db]" />
                                )}
                              </span>
                              {child.label}
                            </Link>
                          )
                        })}
                      </div>
                    </div>
                  )}
                </div>
              )
            }

            // Expanded: inline dropdown
            return (
              <div key={item.href} className="flex flex-col">
                <button
                  type="button"
                  data-testid={`nav-link-${item.href.replace(/\//g, "").replace(/-/g, "-") || "home"}`}
                  onClick={() =>
                    setOpenDropdown(isDropdownOpen ? null : item.href)
                  }
                  className={cn(
                    "flex items-center justify-between rounded-lg text-sm font-medium transition-colors gap-3 px-3 py-2.5",
                    isActive
                      ? "bg-[#3ea3db]/10 text-[#3ea3db]"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  )}
                >
                  <span className="flex items-center gap-3">
                    <item.icon
                      className={cn(
                        "size-5 shrink-0",
                        isActive ? "text-[#3ea3db]" : "text-gray-400"
                      )}
                    />
                    {item.label}
                  </span>
                  <ChevronDown
                    className={cn(
                      "size-4 shrink-0 text-gray-400 transition-transform",
                      isDropdownOpen ? "rotate-180" : ""
                    )}
                  />
                </button>
                {isDropdownOpen && (
                  <div className="ml-8 mt-1 flex flex-col gap-0.5">
                    {item.children!.map((child) => {
                      const childHasQuery = child.href.includes("?")
                      const isChildActive = childHasQuery
                        ? currentFullPath === child.href
                        : currentFullPath === child.href
                      return (
                        <Link
                          key={child.href}
                          href={child.href}
                          className={cn(
                            "rounded-lg px-3 py-2 text-sm transition-colors",
                            isChildActive
                              ? "text-[#3ea3db] font-medium"
                              : "text-gray-500 hover:bg-gray-50 hover:text-gray-900"
                          )}
                        >
                          {child.label}
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          }

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
            <Headset className="size-4" />
          ) : (
            <>
              Contact Support
              <Headset className="size-4" />
            </>
          )}
        </Button>
      </div>
    </aside>
  )
}
