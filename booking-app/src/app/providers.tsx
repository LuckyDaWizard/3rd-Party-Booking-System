"use client"

import { AuthProvider } from "@/lib/auth-store"

export function Providers({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>
}
