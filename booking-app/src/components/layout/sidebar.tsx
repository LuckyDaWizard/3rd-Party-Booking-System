"use client"

import { useState, useEffect, useRef } from "react"
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
  ScrollText,
  Shield,
  BookOpen,
  Headset,
  ChevronsLeft,
  ChevronsRight,
  ChevronDown,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { useSidebar } from "@/lib/sidebar-store"
import { useAuth, type UserRole } from "@/lib/auth-store"
import { useActiveClientBranding } from "@/lib/use-active-client-branding"

interface NavChild {
  label: string
  href: string
}

interface NavItem {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  children?: NavChild[]
  /** Which roles can see this item. If omitted, all roles can see it. */
  roles?: UserRole[]
}

const navItems: NavItem[] = [
  { label: "Home", href: "/home", icon: Home },
  { label: "Create a Booking", href: "/create-booking", icon: CalendarPlus },
  { label: "Patient History", href: "/patient-history", icon: ClipboardList },
  { label: "Client Management", href: "/client-management", icon: UserCircle, roles: ["system_admin"] },
  { label: "Unit Management", href: "/unit-management", icon: Building2, roles: ["system_admin", "unit_manager"] },
  { label: "User Management", href: "/user-management", icon: Users, roles: ["system_admin", "unit_manager"] },
  { label: "Audit Log", href: "/audit-log", icon: ScrollText, roles: ["system_admin"] },
  { label: "Security", href: "/security", icon: Shield, roles: ["system_admin"] },
  { label: "Reports", href: "/reports", icon: BookOpen, roles: ["system_admin"] },
]

interface SidebarProps {
  /**
   * "desktop" — fixed left rail with collapse toggle (default, lg: and up).
   * "drawer"  — full-width slide-over content for mobile (no collapse toggle,
   *             no fixed positioning, the parent Sheet handles those).
   */
  mode?: "desktop" | "drawer"
}

export function Sidebar({ mode = "desktop" }: SidebarProps = {}) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { collapsed: rawCollapsed, toggle, closeMobile } = useSidebar()
  const { user } = useAuth()
  const branding = useActiveClientBranding()

  // Drawer mode is always "expanded" — the slide-over panel doesn't collapse,
  // it's either open or closed. Force collapsed=false in drawer mode so the
  // existing rendering logic doesn't try to show the icon-only popout pattern.
  const collapsed = mode === "drawer" ? false : rawCollapsed
  const isDrawer = mode === "drawer"

  // Filter nav items by user role
  const visibleNavItems = navItems.filter(
    (item) => !item.roles || (user && item.roles.includes(user.role))
  )
  const [openDropdown, setOpenDropdown] = useState<string | null>(null)
  const sidebarRef = useRef<HTMLElement>(null)

  // Open the user's default mail client pre-filled with context for support.
  // Uses mailto: for zero-backend simplicity — works as long as the user has
  // a mail client or browser-level mailto handler (Gmail, Outlook Web, etc).
  function handleContactSupport() {
    const name = user ? `${user.firstNames} ${user.surname}`.trim() : "Unknown user"
    const role = user?.role ?? "unknown role"
    const email = user?.email ?? "no email on file"
    const currentUrl = typeof window !== "undefined" ? window.location.href : ""

    const subject = `CareFirst Support - ${name} (${role})`
    const body = [
      "Hi Support,",
      "",
      `Name: ${name}`,
      `Role: ${role}`,
      `Email: ${email}`,
      `Page: ${currentUrl}`,
      "",
      "Please describe your issue:",
      "",
      "",
    ].join("\n")

    const href = `mailto:lehlohonolom@firstcare.solutions?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
    window.location.href = href
  }

  // Close dropdown when pathname changes to a non-matching page
  const prevPathnameRef = useRef(pathname)
  useEffect(() => {
    if (prevPathnameRef.current !== pathname) {
      prevPathnameRef.current = pathname
      if (openDropdown && !pathname.startsWith(openDropdown)) {
        setOpenDropdown(null)
      }
    }
  }, [pathname, openDropdown])

  // Close collapsed popout when clicking outside the sidebar
  useEffect(() => {
    if (!collapsed || !openDropdown) return
    function handleClickOutside(e: MouseEvent) {
      if (sidebarRef.current && !sidebarRef.current.contains(e.target as Node)) {
        setOpenDropdown(null)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [collapsed, openDropdown])

  // Build full current URL path + search for child active matching
  const currentSearch = searchParams.toString()
  const currentFullPath = currentSearch ? `${pathname}?${currentSearch}` : pathname

  return (
    <aside
      ref={sidebarRef}
      data-testid="sidebar"
      className={cn(
        "flex flex-col border-r border-border bg-white",
        isDrawer
          ? // Drawer mode: fill the parent Sheet panel, no fixed positioning.
            "h-full w-full"
          : // Desktop mode: fixed left rail with width transitions.
            "fixed left-0 top-0 z-30 h-screen transition-all duration-300",
        !isDrawer && (collapsed ? "w-[72px]" : "w-60")
      )}
    >
      {/* Collapse toggle — desktop only. Drawer mode uses the Sheet's close button. */}
      {!isDrawer && (
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
      )}

      {/* Logo area
          Resolution chain (defaults always end at the CareFirst image):
            collapsed → client favicon → client logo → CareFirst favicon
            expanded  → client logo → CareFirst wide logo
          We render a plain <img> for client-uploaded images because their
          dimensions vary and the URLs come from Supabase Storage, not from
          /public; <Image> requires either declared dimensions or a remote
          patterns config and we want this to "just work" for any uploaded
          image. The CareFirst defaults stay on next/image for optimisation. */}
      <Link
        href="/home"
        onClick={isDrawer ? closeMobile : undefined}
        className={cn(
          "flex items-center py-4",
          collapsed ? "justify-center px-2" : "px-5"
        )}
        data-testid="sidebar-logo"
      >
        {(() => {
          const altText = branding.clientName ?? "CareFirst"
          if (collapsed) {
            const clientSrc = branding.faviconUrl ?? branding.logoUrl
            if (clientSrc) {
              return (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={clientSrc}
                  alt={altText}
                  className="size-9 object-contain"
                />
              )
            }
            return (
              <Image
                src="/favicon.png"
                alt="CareFirst"
                width={36}
                height={36}
                priority
                className="size-9 object-contain"
              />
            )
          }
          if (branding.logoUrl) {
            return (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={branding.logoUrl}
                alt={altText}
                className="h-12 w-full max-w-[180px] object-contain object-left"
              />
            )
          }
          return (
            <Image
              src="/carefirst-logo.png"
              alt="CareFirst"
              width={200}
              height={36}
              priority
              className="h-auto w-[200px]"
            />
          )
        })()}
      </Link>

      {/* Navigation */}
      <nav
        data-testid="sidebar-nav"
        className="flex flex-1 flex-col gap-1 px-3"
        aria-label="Main navigation"
      >
        {visibleNavItems.map((item) => {
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
                        ? "bg-[var(--client-primary-10)] text-[var(--client-primary)]"
                        : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                    )}
                    title={item.label}
                  >
                    <item.icon
                      className={cn(
                        "size-5 shrink-0",
                        isActive ? "text-[var(--client-primary)]" : "text-gray-400"
                      )}
                    />
                  </button>
                  {isDropdownOpen && (
                    <div className="absolute left-full top-0 z-50 ml-2 w-40 overflow-hidden rounded-xl border border-gray-200 bg-white p-2 shadow-lg">
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
                                  ? "text-[var(--client-primary)] font-medium bg-[var(--client-primary-10)]"
                                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                              )}
                            >
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
                      ? "bg-[var(--client-primary-10)] text-[var(--client-primary)]"
                      : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
                  )}
                >
                  <span className="flex items-center gap-3">
                    <item.icon
                      className={cn(
                        "size-5 shrink-0",
                        isActive ? "text-[var(--client-primary)]" : "text-gray-400"
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
                          onClick={isDrawer ? closeMobile : undefined}
                          className={cn(
                            "rounded-lg px-3 py-2 text-sm transition-colors",
                            isChildActive
                              ? "text-[var(--client-primary)] font-medium"
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
              onClick={isDrawer ? closeMobile : undefined}
              className={cn(
                "flex items-center rounded-lg text-sm font-medium transition-colors",
                collapsed
                  ? "justify-center px-2 py-2.5"
                  : "gap-3 px-3 py-2.5",
                isActive
                  ? "bg-[var(--client-primary-10)] text-[var(--client-primary)]"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              )}
              aria-current={isActive ? "page" : undefined}
              title={collapsed ? item.label : undefined}
            >
              <item.icon
                className={cn(
                  "size-5 shrink-0",
                  isActive ? "text-[var(--client-primary)]" : "text-gray-400"
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
          onClick={handleContactSupport}
          title={collapsed ? "Contact Support" : undefined}
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
