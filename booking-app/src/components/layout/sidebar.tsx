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
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

interface NavItem {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
}

const navItems: NavItem[] = [
  { label: "Home", href: "/", icon: Home },
  { label: "Create a Booking", href: "/create-booking", icon: CalendarPlus },
  { label: "Patient History", href: "/patient-history", icon: ClipboardList },
  { label: "Client Management", href: "/client-management", icon: UserCircle },
  { label: "Unit Management", href: "/unit-management", icon: Building2 },
  { label: "User Management", href: "/user-management", icon: Users },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside
      data-testid="sidebar"
      className="fixed left-0 top-0 z-30 flex h-screen w-60 flex-col border-r border-border bg-white"
    >
      {/* Logo area */}
      <div className="flex items-center px-5 py-6" data-testid="sidebar-logo">
        <Image
          src="/carefirst-logo.png"
          alt="CareFirst"
          width={200}
          height={36}
          priority
          className="h-auto w-[200px]"
        />
      </div>

      {/* Navigation */}
      <nav
        data-testid="sidebar-nav"
        className="flex flex-1 flex-col gap-1 px-3"
        aria-label="Main navigation"
      >
        {navItems.map((item) => {
          const isActive =
            item.href === "/"
              ? pathname === "/"
              : pathname.startsWith(item.href)

          return (
            <Link
              key={item.href}
              href={item.href}
              data-testid={`nav-link-${item.href.replace(/\//g, "").replace(/-/g, "-") || "home"}`}
              className={cn(
                "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                isActive
                  ? "bg-[#3ea3db]/10 text-[#3ea3db]"
                  : "text-gray-600 hover:bg-gray-50 hover:text-gray-900"
              )}
              aria-current={isActive ? "page" : undefined}
            >
              <item.icon
                className={cn(
                  "size-5 shrink-0",
                  isActive ? "text-[#3ea3db]" : "text-gray-400"
                )}
              />
              {item.label}
            </Link>
          )
        })}
      </nav>

      {/* Contact Support button */}
      <div className="px-4 pb-6">
        <Button
          data-testid="contact-support-btn"
          className="w-full justify-center gap-2 rounded-xl bg-gray-900 py-6 text-sm font-medium text-white hover:bg-gray-800"
          size="lg"
        >
          Contact Support
          <Plus className="size-4" />
        </Button>
      </div>
    </aside>
  )
}
