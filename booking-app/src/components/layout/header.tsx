"use client"

import Link from "next/link"
import { LogOut, Menu } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth-store"
import { useSidebar } from "@/lib/sidebar-store"

export interface HeaderProps {
  userName?: string
  companyName?: string
  avatarUrl?: string
}

export function Header({
  userName = "Name Surname",
  companyName = "Company",
  avatarUrl,
}: HeaderProps) {
  const { signOut, user } = useAuth()
  const { openMobile } = useSidebar()

  function handleLogout() {
    signOut()
  }

  const initials = userName
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .slice(0, 2)

  return (
    <header
      data-testid="header"
      className="sticky top-0 z-20 flex h-16 items-center justify-between border-b border-border bg-white px-4 sm:px-6"
    >
      {/* Hamburger — mobile/tablet only. Hidden at lg: and up because the
          desktop sidebar is visible there. */}
      <button
        type="button"
        data-testid="header-menu-button"
        onClick={openMobile}
        aria-label="Open navigation menu"
        className="flex size-10 items-center justify-center rounded-lg text-gray-600 transition-colors hover:bg-gray-100 lg:hidden"
      >
        <Menu className="size-5" />
      </button>

      <div className="ml-auto flex min-w-0 items-center gap-2 sm:gap-3">
        <Link
          href={user ? `/user-management/manage?id=${user.id}` : "#"}
          className="flex min-w-0 items-center gap-2 rounded-lg px-2 py-1.5 transition-colors hover:bg-gray-50 sm:gap-3 sm:px-3"
        >
          <Avatar data-testid="header-avatar" size="default" className="shrink-0">
            {avatarUrl ? (
              <AvatarImage src={avatarUrl} alt={userName} />
            ) : null}
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>

          <div className="flex min-w-0 flex-col">
            <span
              data-testid="header-user-name"
              className="truncate text-sm font-medium leading-tight text-gray-900"
            >
              {userName}
            </span>
            <span
              data-testid="header-company-name"
              className="truncate text-xs leading-tight text-gray-500"
            >
              {companyName}
            </span>
          </div>
        </Link>

        <Button
          data-testid="logout-btn"
          variant="ghost"
          size="icon"
          onClick={handleLogout}
          aria-label="Log out"
          className="ml-1 text-red-400 hover:bg-red-50 hover:text-red-500"
        >
          <LogOut className="size-5" />
        </Button>
      </div>
    </header>
  )
}
