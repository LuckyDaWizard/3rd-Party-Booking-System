"use client"

import Link from "next/link"
import { LogOut } from "lucide-react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { useAuth } from "@/lib/auth-store"

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
      className="sticky top-0 z-20 flex h-16 items-center justify-end border-b border-border bg-white px-6"
    >
      <div className="flex items-center gap-3">
        <Link
          href={user ? `/user-management/manage?id=${user.id}` : "#"}
          className="flex items-center gap-3 rounded-lg px-2 py-1 transition-colors hover:bg-gray-50"
        >
          <Avatar data-testid="header-avatar" size="default">
            {avatarUrl ? (
              <AvatarImage src={avatarUrl} alt={userName} />
            ) : null}
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>

          <div className="flex flex-col">
            <span
              data-testid="header-user-name"
              className="text-sm font-medium leading-tight text-gray-900"
            >
              {userName}
            </span>
            <span
              data-testid="header-company-name"
              className="text-xs leading-tight text-gray-500"
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
