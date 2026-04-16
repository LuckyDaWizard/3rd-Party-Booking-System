"use client"

import * as React from "react"
import Link from "next/link"
import {
  ArrowLeft,
  Shield,
  ShieldAlert,
  AlertTriangle,
  RefreshCw,
  Unlock,
  LogOut,
  Monitor,
  UserCircle,
  Activity,
  Plus,
  Trash2,
  History,
  Download,
  Search,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { useAuth } from "@/lib/auth-store"

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Attempt {
  id: string
  attemptedAt: string
  succeeded: boolean
  ipAddress: string | null
}

interface AttemptSummary {
  pin: string
  userExists: boolean
  firstNames: string | null
  surname: string | null
  email: string | null
  totalAttempts: number
  failuresInWindow: number
  locked: boolean
  minutesUntilUnlock: number | null
  lastAttemptAt: string
  lastIp: string | null
  recentAttempts: Attempt[]
}

interface AttemptsApiResponse {
  data: AttemptSummary[]
  summary: {
    totalLocked: number
    totalFailures24h: number
    windowMinutes: number
    maxAttempts: number
  }
}

type SessionStatus = "active" | "idle" | "ended"

interface SessionEntry {
  id: string
  userId: string | null
  userName: string | null
  userEmail: string | null
  userRole: string | null
  createdAt: string
  updatedAt: string
  userAgent: string | null
  ipAddress: string | null
  notAfter: string | null
  status: SessionStatus
}

interface SessionsApiResponse {
  data: SessionEntry[]
  summary: {
    active: number
    idle: number
    ended: number
    uniqueActiveUsers: number
  }
}

type Severity = "critical" | "warning"
type FlagType =
  | "password_spraying"
  | "unknown_pin_probed"
  | "cracked_password"
  | "rapid_probing"
  | "new_ip_signin"

interface SuspiciousFlag {
  id: string
  type: FlagType
  severity: Severity
  title: string
  description: string
  firstSeenAt: string
  lastSeenAt: string
  ipAddress: string | null
  affectedPins: string[]
  userName: string | null
  attemptCount: number
}

interface SuspiciousApiResponse {
  data: SuspiciousFlag[]
  summary: {
    critical: number
    warning: number
    total: number
  }
}

interface TrustedIp {
  id: string
  ipAddress: string
  label: string | null
  createdAt: string
  createdByName: string | null
}

interface SignInRow {
  id: string
  attemptedAt: string
  userName: string | null
  userEmail: string | null
  userRole: string | null
  ipAddress: string | null
}

interface SignInApiResponse {
  data: SignInRow[]
  total: number
  page: number
  pageSize: number
  summary: {
    last24h: number
    last7d: number
    uniqueUsers24h: number
  }
}

type SignInWindow = "24h" | "7d" | "30d" | "all"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString("en-ZA", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  })
}

function formatRelative(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime()
  const minutes = Math.floor(ms / 60000)
  if (minutes < 1) return "just now"
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

function maskPin(pin: string): string {
  if (pin.length <= 2) return "●".repeat(pin.length)
  return pin.slice(0, 1) + "●".repeat(pin.length - 2) + pin.slice(-1)
}

function getRowStyle(entry: AttemptSummary): string {
  if (entry.locked) return "border-l-4 border-red-500"
  if (entry.failuresInWindow >= 3) return "border-l-4 border-amber-400"
  return "border-l-4 border-transparent"
}

function summariseUserAgent(ua: string | null): string {
  if (!ua) return "Unknown device"
  if (/iphone|ipad/i.test(ua)) return "iOS"
  if (/android/i.test(ua)) return "Android"
  if (/windows/i.test(ua)) return "Windows"
  if (/mac os/i.test(ua)) return "macOS"
  if (/linux/i.test(ua)) return "Linux"
  return "Other"
}

function summariseBrowser(ua: string | null): string {
  if (!ua) return ""
  if (/edg\//i.test(ua)) return "Edge"
  if (/chrome\//i.test(ua) && !/edg\//i.test(ua)) return "Chrome"
  if (/firefox\//i.test(ua)) return "Firefox"
  if (/safari\//i.test(ua) && !/chrome\//i.test(ua)) return "Safari"
  return ""
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

type Tab = "attempts" | "sessions" | "suspicious" | "history"

export default function SecurityPage() {
  const [tab, setTab] = React.useState<Tab>("attempts")

  return (
    <div className="flex flex-col gap-8">
      {/* Top bar */}
      <div className="flex items-center justify-between rounded-xl bg-white px-6 py-4">
        <Link href="/home">
          <Button
            variant="outline"
            size="sm"
            className="rounded-lg border-black px-6 py-2 gap-3"
          >
            <ArrowLeft className="size-4" />
            Back
          </Button>
        </Link>
      </div>

      {/* Heading */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">Security</h1>
      </div>
      <p className="-mt-6 text-base text-gray-500">
        Monitor failed sign-in attempts, active sessions, and suspicious activity
      </p>

      {/* Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-gray-200">
        <button
          type="button"
          onClick={() => setTab("attempts")}
          className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
            tab === "attempts"
              ? "border-b-2 border-[#3ea3db] text-[#3ea3db] -mb-px"
              : "text-gray-500 hover:text-gray-900"
          }`}
        >
          <ShieldAlert className="size-4" />
          Failed Attempts
        </button>
        <button
          type="button"
          onClick={() => setTab("sessions")}
          className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
            tab === "sessions"
              ? "border-b-2 border-[#3ea3db] text-[#3ea3db] -mb-px"
              : "text-gray-500 hover:text-gray-900"
          }`}
        >
          <Monitor className="size-4" />
          Active Sessions
        </button>
        <button
          type="button"
          onClick={() => setTab("suspicious")}
          className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
            tab === "suspicious"
              ? "border-b-2 border-[#3ea3db] text-[#3ea3db] -mb-px"
              : "text-gray-500 hover:text-gray-900"
          }`}
        >
          <Activity className="size-4" />
          Suspicious Activity
        </button>
        <button
          type="button"
          onClick={() => setTab("history")}
          className={`inline-flex items-center gap-2 px-4 py-2 text-sm font-medium transition-colors ${
            tab === "history"
              ? "border-b-2 border-[#3ea3db] text-[#3ea3db] -mb-px"
              : "text-gray-500 hover:text-gray-900"
          }`}
        >
          <History className="size-4" />
          Sign-in History
        </button>
      </div>

      {tab === "attempts" && <FailedAttemptsTab />}
      {tab === "sessions" && <ActiveSessionsTab />}
      {tab === "suspicious" && <SuspiciousActivityTab />}
      {tab === "history" && <SignInHistoryTab />}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Failed Attempts Tab
// ---------------------------------------------------------------------------

function FailedAttemptsTab() {
  const [entries, setEntries] = React.useState<AttemptSummary[]>([])
  const [summary, setSummary] = React.useState<AttemptsApiResponse["summary"] | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [refreshing, setRefreshing] = React.useState(false)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [expandedPin, setExpandedPin] = React.useState<string | null>(null)
  const [unlockTarget, setUnlockTarget] = React.useState<AttemptSummary | null>(null)
  const [unlocking, setUnlocking] = React.useState(false)
  const [unlockError, setUnlockError] = React.useState("")

  const load = React.useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch("/api/admin/auth-attempts")
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }
      const json: AttemptsApiResponse = await res.json()
      setEntries(json.data)
      setSummary(json.summary)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error"
      console.error("Failed to load auth attempts:", msg)
      setLoadError(msg)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  async function handleUnlock() {
    if (!unlockTarget) return
    setUnlocking(true)
    setUnlockError("")
    try {
      const res = await fetch("/api/admin/auth-attempts/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ pin: unlockTarget.pin }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setUnlockError(data.error ?? "Failed to unlock")
        setUnlocking(false)
        return
      }
      setUnlockTarget(null)
      setUnlocking(false)
      await load(true)
    } catch {
      setUnlockError("Network error. Please try again.")
      setUnlocking(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Summary cards + refresh */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex-1">
          {/* placeholder for alignment */}
        </div>
        <Button
          onClick={() => load(true)}
          disabled={refreshing}
          className="inline-flex justify-center gap-2 rounded-xl bg-[#3ea3db] px-6 py-5 text-sm font-medium text-white hover:bg-[#3ea3db]/90 disabled:opacity-50"
          size="lg"
        >
          {refreshing ? "Refreshing..." : "Refresh"}
          <RefreshCw className="size-4" />
        </Button>
      </div>

      {loadError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <div className="font-semibold">Failed to load failed attempts</div>
          <div className="mt-1 text-xs">{loadError}</div>
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex items-center gap-4 rounded-xl bg-white p-5">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-red-50">
              <ShieldAlert className="size-6 text-red-500" />
            </div>
            <div className="min-w-0">
              <div className="text-2xl font-bold text-gray-900">{summary.totalLocked}</div>
              <div className="text-xs text-gray-500">Currently Locked</div>
            </div>
          </div>
          <div className="flex items-center gap-4 rounded-xl bg-white p-5">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-amber-50">
              <AlertTriangle className="size-6 text-amber-500" />
            </div>
            <div className="min-w-0">
              <div className="text-2xl font-bold text-gray-900">{summary.totalFailures24h}</div>
              <div className="text-xs text-gray-500">Failed Attempts (24h)</div>
            </div>
          </div>
          <div className="flex items-center gap-4 rounded-xl bg-white p-5">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-blue-50">
              <Shield className="size-6 text-blue-500" />
            </div>
            <div className="min-w-0">
              <div className="text-2xl font-bold text-gray-900">
                {summary.maxAttempts}/{summary.windowMinutes}m
              </div>
              <div className="text-xs text-gray-500">Lockout Threshold</div>
            </div>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-col gap-3">
        {loading && entries.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-3 rounded-xl bg-white">
            <svg className="size-10 animate-spin" viewBox="0 0 40 40" fill="none">
              <circle cx="20" cy="20" r="15" stroke="#d1d5db" strokeWidth="5" strokeLinecap="round" />
              <circle cx="20" cy="20" r="15" stroke="#3ea3db" strokeWidth="5" strokeLinecap="round" strokeDasharray="94.25" strokeDashoffset="70" />
            </svg>
            <span className="text-sm text-gray-400">Loading security data...</span>
          </div>
        ) : entries.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-xl bg-white">
            <Shield className="size-10 text-green-500" />
            <span className="text-base font-medium text-gray-900">All clear</span>
            <span className="text-sm text-gray-400">No failed sign-in attempts on record.</span>
          </div>
        ) : (
          entries.map((entry) => {
            const isExpanded = expandedPin === entry.pin
            const displayName = entry.userExists
              ? `${entry.firstNames ?? ""} ${entry.surname ?? ""}`.trim()
              : "Unknown PIN"

            return (
              <div
                key={entry.pin}
                className={`flex flex-col gap-3 rounded-xl bg-white p-4 sm:p-5 ${getRowStyle(entry)}`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      {entry.locked ? (
                        <Badge className="rounded-full border-transparent bg-red-100 px-3 py-1 text-xs font-medium text-red-700">
                          🔒 Locked ({entry.minutesUntilUnlock}m left)
                        </Badge>
                      ) : entry.failuresInWindow >= 3 ? (
                        <Badge className="rounded-full border-transparent bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
                          At Risk ({entry.failuresInWindow}/{summary?.maxAttempts ?? 5})
                        </Badge>
                      ) : (
                        <Badge className="rounded-full border-transparent bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                          Normal
                        </Badge>
                      )}
                      {!entry.userExists && (
                        <Badge className="rounded-full border-transparent bg-purple-100 px-3 py-1 text-xs font-medium text-purple-700">
                          ⚠️ Unknown PIN
                        </Badge>
                      )}
                    </div>
                    <div className="text-base font-bold text-gray-900">{displayName}</div>
                    {entry.email && (
                      <div className="truncate text-sm text-gray-500">{entry.email}</div>
                    )}
                    <div className="text-xs text-gray-400">
                      PIN: <span className="font-mono">{maskPin(entry.pin)}</span>
                      <span className="mx-2">·</span>
                      Last attempt: {formatDate(entry.lastAttemptAt)}
                      {entry.lastIp && (
                        <>
                          <span className="mx-2">·</span>
                          IP: {entry.lastIp}
                        </>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setExpandedPin(isExpanded ? null : entry.pin)}
                      className="rounded-lg border-gray-300 text-xs"
                    >
                      {isExpanded ? "Hide" : "Details"}
                    </Button>
                    {entry.locked && (
                      <Button
                        size="sm"
                        onClick={() => setUnlockTarget(entry)}
                        className="gap-1 rounded-lg bg-[#3ea3db] text-xs text-white hover:bg-[#3ea3db]/90"
                      >
                        <Unlock className="size-3" />
                        Unlock
                      </Button>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                  <div>
                    <span className="font-medium text-gray-900">{entry.failuresInWindow}</span>{" "}
                    failures in last {summary?.windowMinutes ?? 15}m
                  </div>
                  <div>
                    <span className="font-medium text-gray-900">{entry.totalAttempts}</span>{" "}
                    total recent attempts
                  </div>
                </div>

                {isExpanded && (
                  <div className="mt-2 rounded-lg bg-gray-50 p-4">
                    <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-gray-500">
                      Recent attempts
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      <table className="w-full text-sm">
                        <thead className="text-left text-xs text-gray-500">
                          <tr>
                            <th className="pb-2 pr-4 font-medium">Time</th>
                            <th className="pb-2 pr-4 font-medium">Result</th>
                            <th className="pb-2 font-medium">IP</th>
                          </tr>
                        </thead>
                        <tbody>
                          {entry.recentAttempts.map((a) => (
                            <tr key={a.id} className="border-t border-gray-200">
                              <td className="py-2 pr-4 text-gray-700">
                                {formatDate(a.attemptedAt)}
                              </td>
                              <td className="py-2 pr-4">
                                {a.succeeded ? (
                                  <span className="text-green-600">✓ Success</span>
                                ) : (
                                  <span className="text-red-500">✗ Failed</span>
                                )}
                              </td>
                              <td className="py-2 font-mono text-xs text-gray-500">
                                {a.ipAddress ?? "—"}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Unlock confirmation dialog */}
      <Dialog open={!!unlockTarget} onOpenChange={(open) => !open && !unlocking && setUnlockTarget(null)}>
        <DialogContent className="rounded-2xl p-6 sm:p-8">
          <DialogHeader className="flex flex-col items-center gap-2 text-center">
            <DialogTitle className="text-2xl font-bold text-gray-900">
              Unlock this account?
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-500">
              {unlockTarget?.userExists ? (
                <>
                  This will clear all failed sign-in attempts for{" "}
                  <strong>
                    {unlockTarget.firstNames} {unlockTarget.surname}
                  </strong>
                  , allowing them to sign in immediately.
                </>
              ) : (
                <>
                  This will clear failed sign-in attempts for an unknown PIN.
                  The PIN is not associated with any user.
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {unlockError && (
            <p className="text-center text-sm font-medium text-red-500">{unlockError}</p>
          )}

          <div className="flex flex-col items-center gap-3 pt-4">
            <Button
              onClick={handleUnlock}
              disabled={unlocking}
              className="h-11 w-full gap-2 rounded-xl bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50"
            >
              {unlocking ? (
                <>
                  Unlocking...
                  <svg className="size-4 animate-spin" viewBox="0 0 40 40" fill="none">
                    <circle cx="20" cy="20" r="15" stroke="#6b7280" strokeWidth="5" strokeLinecap="round" />
                    <circle cx="20" cy="20" r="15" stroke="white" strokeWidth="5" strokeLinecap="round" strokeDasharray="94.25" strokeDashoffset="70" />
                  </svg>
                </>
              ) : (
                <>
                  <Unlock className="size-4" />
                  Yes, unlock account
                </>
              )}
            </Button>

            <button
              type="button"
              onClick={() => setUnlockTarget(null)}
              disabled={unlocking}
              className="text-sm font-medium text-[#FF3A69] hover:text-[#FF3A69]/80 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Active Sessions Tab
// ---------------------------------------------------------------------------

function getStatusBadgeStyle(status: SessionStatus): string {
  switch (status) {
    case "active":
      return "bg-green-100 text-green-700"
    case "idle":
      return "bg-amber-100 text-amber-800"
    case "ended":
      return "bg-gray-200 text-gray-600"
  }
}

function getStatusLabel(status: SessionStatus): string {
  switch (status) {
    case "active":
      return "Active"
    case "idle":
      return "Idle"
    case "ended":
      return "Ended"
  }
}

function ActiveSessionsTab() {
  const { user: currentUser } = useAuth()
  const [sessions, setSessions] = React.useState<SessionEntry[]>([])
  const [summary, setSummary] = React.useState<SessionsApiResponse["summary"] | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [refreshing, setRefreshing] = React.useState(false)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [revokeTarget, setRevokeTarget] = React.useState<SessionEntry | null>(null)
  const [revoking, setRevoking] = React.useState(false)
  const [revokeError, setRevokeError] = React.useState("")
  const [showEnded, setShowEnded] = React.useState(false)

  const load = React.useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch("/api/admin/sessions")
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }
      const json: SessionsApiResponse = await res.json()
      setSessions(json.data)
      setSummary(json.summary)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error"
      console.error("Failed to load sessions:", msg)
      setLoadError(msg)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  React.useEffect(() => {
    load()
  }, [load])

  async function handleRevoke() {
    if (!revokeTarget) return
    setRevoking(true)
    setRevokeError("")
    try {
      const res = await fetch("/api/admin/sessions/revoke", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId: revokeTarget.id }),
      })
      const data = await res.json()
      if (!res.ok || !data.ok) {
        setRevokeError(data.error ?? "Failed to revoke session")
        setRevoking(false)
        return
      }
      setRevokeTarget(null)
      setRevoking(false)
      await load(true)
    } catch {
      setRevokeError("Network error. Please try again.")
      setRevoking(false)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Refresh button */}
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button
          onClick={() => load(true)}
          disabled={refreshing}
          className="inline-flex justify-center gap-2 rounded-xl bg-[#3ea3db] px-6 py-5 text-sm font-medium text-white hover:bg-[#3ea3db]/90 disabled:opacity-50"
          size="lg"
        >
          {refreshing ? "Refreshing..." : "Refresh"}
          <RefreshCw className="size-4" />
        </Button>
      </div>

      {loadError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <div className="font-semibold">Failed to load sessions</div>
          <div className="mt-1 text-xs">{loadError}</div>
        </div>
      )}

      {/* Summary cards: Active / Idle / Ended */}
      {summary && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex items-center gap-4 rounded-xl bg-white p-5">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-green-50">
              <Monitor className="size-6 text-green-500" />
            </div>
            <div className="min-w-0">
              <div className="text-2xl font-bold text-gray-900">{summary.active}</div>
              <div className="text-xs text-gray-500">Active (last 30 min)</div>
            </div>
          </div>
          <div className="flex items-center gap-4 rounded-xl bg-white p-5">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-amber-50">
              <UserCircle className="size-6 text-amber-500" />
            </div>
            <div className="min-w-0">
              <div className="text-2xl font-bold text-gray-900">{summary.idle}</div>
              <div className="text-xs text-gray-500">Idle (under 24h)</div>
            </div>
          </div>
          <div className="flex items-center gap-4 rounded-xl bg-white p-5">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-gray-100">
              <LogOut className="size-6 text-gray-500" />
            </div>
            <div className="min-w-0">
              <div className="text-2xl font-bold text-gray-900">{summary.ended}</div>
              <div className="text-xs text-gray-500">Ended</div>
            </div>
          </div>
        </div>
      )}

      {/* Show-ended toggle */}
      {summary && summary.ended > 0 && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowEnded((v) => !v)}
            className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
              showEnded
                ? "bg-[#3ea3db] text-white"
                : "bg-white text-gray-600 border border-gray-300 hover:bg-gray-50"
            }`}
          >
            {showEnded ? "Hide ended sessions" : `Show ended sessions (${summary.ended})`}
          </button>
        </div>
      )}

      {/* Session list */}
      <div className="flex min-w-0 flex-col gap-3">
        {(() => {
          const visibleSessions = showEnded
            ? sessions
            : sessions.filter((s) => s.status !== "ended")

          if (loading && sessions.length === 0) {
            return (
              <div className="flex h-40 flex-col items-center justify-center gap-3 rounded-xl bg-white">
                <svg className="size-10 animate-spin" viewBox="0 0 40 40" fill="none">
                  <circle cx="20" cy="20" r="15" stroke="#d1d5db" strokeWidth="5" strokeLinecap="round" />
                  <circle cx="20" cy="20" r="15" stroke="#3ea3db" strokeWidth="5" strokeLinecap="round" strokeDasharray="94.25" strokeDashoffset="70" />
                </svg>
                <span className="text-sm text-gray-400">Loading sessions...</span>
              </div>
            )
          }

          if (visibleSessions.length === 0) {
            return (
              <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-xl bg-white">
                <Monitor className="size-10 text-gray-400" />
                <span className="text-base font-medium text-gray-900">
                  {showEnded ? "No sessions" : "No active or idle sessions"}
                </span>
                <span className="text-sm text-gray-400">
                  {showEnded
                    ? "Nothing to show."
                    : "No one is currently signed in."}
                </span>
              </div>
            )
          }

          return visibleSessions.map((session) => {
            const isCurrentUser = currentUser?.id && session.userId === currentUser.id
            const isSelfByEmail =
              !!currentUser?.email &&
              !!session.userEmail &&
              currentUser.email === session.userEmail
            const isSelf = isCurrentUser || isSelfByEmail

            const displayName = session.userName || "Unknown user"
            const deviceLabel = summariseUserAgent(session.userAgent)
            const browserLabel = summariseBrowser(session.userAgent)
            const isEnded = session.status === "ended"

            return (
              <div
                key={session.id}
                className={`flex flex-col gap-3 rounded-xl bg-white p-4 sm:p-5 ${
                  isEnded ? "opacity-70" : ""
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge
                        className={`rounded-full border-transparent px-3 py-1 text-xs font-medium ${getStatusBadgeStyle(session.status)}`}
                      >
                        {getStatusLabel(session.status)}
                      </Badge>
                      {isSelf && (
                        <Badge className="rounded-full border-transparent bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">
                          This is you
                        </Badge>
                      )}
                      {session.userRole && (
                        <Badge className="rounded-full border-transparent bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                          {session.userRole.replace(/_/g, " ")}
                        </Badge>
                      )}
                    </div>
                    <div className="text-base font-bold text-gray-900">{displayName}</div>
                    {session.userEmail && (
                      <div className="truncate text-sm text-gray-500">{session.userEmail}</div>
                    )}
                    <div className="text-xs text-gray-400">
                      {deviceLabel}
                      {browserLabel && (
                        <>
                          <span className="mx-2">·</span>
                          {browserLabel}
                        </>
                      )}
                      <span className="mx-2">·</span>
                      IP: <span className="font-mono">{session.ipAddress ?? "—"}</span>
                    </div>
                  </div>

                  <div className="flex shrink-0 gap-2">
                    <Button
                      size="sm"
                      onClick={() => setRevokeTarget(session)}
                      className={
                        isEnded
                          ? "gap-1 rounded-lg bg-gray-600 text-xs text-white hover:bg-gray-700"
                          : "gap-1 rounded-lg bg-[#FF3A69] text-xs text-white hover:bg-[#FF3A69]/90"
                      }
                    >
                      <LogOut className="size-3" />
                      {isEnded ? "Remove" : "Sign Out"}
                    </Button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-4 text-xs text-gray-500">
                  <div>
                    <span className="font-medium text-gray-900">Signed in:</span>{" "}
                    {formatDate(session.createdAt)}
                  </div>
                  <div>
                    <span className="font-medium text-gray-900">Last active:</span>{" "}
                    {formatRelative(session.updatedAt)}
                  </div>
                </div>
              </div>
            )
          })
        })()}
      </div>

      {/* Revoke confirmation dialog */}
      <Dialog
        open={!!revokeTarget}
        onOpenChange={(open) => !open && !revoking && setRevokeTarget(null)}
      >
        <DialogContent className="rounded-2xl p-6 sm:p-8">
          <DialogHeader className="flex flex-col items-center gap-2 text-center">
            <DialogTitle className="text-2xl font-bold text-gray-900">
              {revokeTarget?.status === "ended" ? "Remove ended session?" : "Force sign-out?"}
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-500">
              {revokeTarget && (
                <>
                  {revokeTarget.status === "ended" ? (
                    <>
                      This will remove the record for{" "}
                      <strong>{revokeTarget.userName ?? "Unknown user"}</strong>
                      &apos;s ended session. The user is no longer signed in.
                    </>
                  ) : (
                    <>
                      This will revoke the session for{" "}
                      <strong>{revokeTarget.userName ?? "Unknown user"}</strong>
                      {revokeTarget.userEmail && (
                        <>
                          {" "}
                          ({revokeTarget.userEmail})
                        </>
                      )}
                      . They&apos;ll be signed out within ~60 minutes (when their access
                      token expires).
                    </>
                  )}
                  {currentUser?.email &&
                    revokeTarget.userEmail === currentUser.email &&
                    revokeTarget.status !== "ended" && (
                      <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-800">
                        ⚠️ This is your own session. You may be signed out shortly
                        after confirming.
                      </div>
                    )}
                </>
              )}
            </DialogDescription>
          </DialogHeader>

          {revokeError && (
            <p className="text-center text-sm font-medium text-red-500">{revokeError}</p>
          )}

          <div className="flex flex-col items-center gap-3 pt-4">
            <Button
              onClick={handleRevoke}
              disabled={revoking}
              className={
                revokeTarget?.status === "ended"
                  ? "h-11 w-full gap-2 rounded-xl bg-gray-700 text-white hover:bg-gray-800 disabled:opacity-50"
                  : "h-11 w-full gap-2 rounded-xl bg-[#FF3A69] text-white hover:bg-[#FF3A69]/90 disabled:opacity-50"
              }
            >
              {revoking ? (
                <>
                  {revokeTarget?.status === "ended" ? "Removing..." : "Revoking..."}
                  <svg className="size-4 animate-spin" viewBox="0 0 40 40" fill="none">
                    <circle cx="20" cy="20" r="15" stroke="#6b7280" strokeWidth="5" strokeLinecap="round" />
                    <circle cx="20" cy="20" r="15" stroke="white" strokeWidth="5" strokeLinecap="round" strokeDasharray="94.25" strokeDashoffset="70" />
                  </svg>
                </>
              ) : (
                <>
                  <LogOut className="size-4" />
                  {revokeTarget?.status === "ended" ? "Yes, remove record" : "Yes, revoke session"}
                </>
              )}
            </Button>

            <button
              type="button"
              onClick={() => setRevokeTarget(null)}
              disabled={revoking}
              className="text-sm font-medium text-gray-600 hover:text-gray-900 disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Suspicious Activity Tab
// ---------------------------------------------------------------------------

function getFlagStyle(severity: Severity): string {
  return severity === "critical"
    ? "border-l-4 border-red-500"
    : "border-l-4 border-amber-400"
}

function getSeverityBadge(severity: Severity): string {
  return severity === "critical"
    ? "bg-red-100 text-red-800"
    : "bg-amber-100 text-amber-800"
}

function SuspiciousActivityTab() {
  const [flags, setFlags] = React.useState<SuspiciousFlag[]>([])
  const [summary, setSummary] = React.useState<SuspiciousApiResponse["summary"] | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [refreshing, setRefreshing] = React.useState(false)
  const [loadError, setLoadError] = React.useState<string | null>(null)

  // Trusted IPs management
  const [trustedIps, setTrustedIps] = React.useState<TrustedIp[]>([])
  const [trustedLoading, setTrustedLoading] = React.useState(false)
  const [trustedLoadError, setTrustedLoadError] = React.useState<string | null>(null)
  const [newIp, setNewIp] = React.useState("")
  const [newLabel, setNewLabel] = React.useState("")
  const [addingIp, setAddingIp] = React.useState(false)
  const [addIpError, setAddIpError] = React.useState("")
  const [removingId, setRemovingId] = React.useState<string | null>(null)

  const loadFlags = React.useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    setLoadError(null)
    try {
      const res = await fetch("/api/admin/suspicious-activity")
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }
      const json: SuspiciousApiResponse = await res.json()
      setFlags(json.data)
      setSummary(json.summary)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error"
      console.error("Failed to load suspicious activity:", msg)
      setLoadError(msg)
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [])

  const loadTrustedIps = React.useCallback(async () => {
    setTrustedLoading(true)
    setTrustedLoadError(null)
    try {
      const res = await fetch("/api/admin/trusted-ips")
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }
      const json: { data: TrustedIp[] } = await res.json()
      setTrustedIps(json.data)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error"
      console.error("Failed to load trusted IPs:", msg)
      setTrustedLoadError(msg)
    } finally {
      setTrustedLoading(false)
    }
  }, [])

  React.useEffect(() => {
    loadFlags()
    loadTrustedIps()
  }, [loadFlags, loadTrustedIps])

  async function handleAddIp() {
    setAddingIp(true)
    setAddIpError("")
    try {
      const res = await fetch("/api/admin/trusted-ips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ipAddress: newIp.trim(),
          label: newLabel.trim() || undefined,
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setAddIpError(data.error ?? "Failed to add IP")
        setAddingIp(false)
        return
      }
      setNewIp("")
      setNewLabel("")
      setAddingIp(false)
      await Promise.all([loadTrustedIps(), loadFlags(true)])
    } catch {
      setAddIpError("Network error. Please try again.")
      setAddingIp(false)
    }
  }

  async function handleRemoveIp(id: string) {
    setRemovingId(id)
    try {
      const res = await fetch(`/api/admin/trusted-ips?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      })
      if (!res.ok) {
        console.error("Failed to remove IP")
        setRemovingId(null)
        return
      }
      setRemovingId(null)
      await Promise.all([loadTrustedIps(), loadFlags(true)])
    } catch {
      setRemovingId(null)
    }
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Refresh button */}
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button
          onClick={() => loadFlags(true)}
          disabled={refreshing}
          className="inline-flex justify-center gap-2 rounded-xl bg-[#3ea3db] px-6 py-5 text-sm font-medium text-white hover:bg-[#3ea3db]/90 disabled:opacity-50"
          size="lg"
        >
          {refreshing ? "Refreshing..." : "Refresh"}
          <RefreshCw className="size-4" />
        </Button>
      </div>

      {loadError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <div className="font-semibold">Failed to load suspicious activity</div>
          <div className="mt-1 text-xs">{loadError}</div>
        </div>
      )}

      {trustedLoadError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <div className="font-semibold">Failed to load trusted IPs</div>
          <div className="mt-1 text-xs">{trustedLoadError}</div>
        </div>
      )}

      {/* Summary */}
      {summary && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="flex items-center gap-4 rounded-xl bg-white p-5">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-red-50">
              <ShieldAlert className="size-6 text-red-500" />
            </div>
            <div className="min-w-0">
              <div className="text-2xl font-bold text-gray-900">{summary.critical}</div>
              <div className="text-xs text-gray-500">Critical alerts</div>
            </div>
          </div>
          <div className="flex items-center gap-4 rounded-xl bg-white p-5">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-amber-50">
              <AlertTriangle className="size-6 text-amber-500" />
            </div>
            <div className="min-w-0">
              <div className="text-2xl font-bold text-gray-900">{summary.warning}</div>
              <div className="text-xs text-gray-500">Warnings</div>
            </div>
          </div>
        </div>
      )}

      {/* Flags */}
      <div className="flex min-w-0 flex-col gap-3">
        {loading && flags.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-3 rounded-xl bg-white">
            <svg className="size-10 animate-spin" viewBox="0 0 40 40" fill="none">
              <circle cx="20" cy="20" r="15" stroke="#d1d5db" strokeWidth="5" strokeLinecap="round" />
              <circle cx="20" cy="20" r="15" stroke="#3ea3db" strokeWidth="5" strokeLinecap="round" strokeDasharray="94.25" strokeDashoffset="70" />
            </svg>
            <span className="text-sm text-gray-400">Analysing activity...</span>
          </div>
        ) : flags.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-xl bg-white">
            <Shield className="size-10 text-green-500" />
            <span className="text-base font-medium text-gray-900">No suspicious activity</span>
            <span className="text-sm text-gray-400">
              Nothing unusual detected in recent sign-in attempts.
            </span>
          </div>
        ) : (
          flags.map((flag) => (
            <div
              key={flag.id}
              className={`flex flex-col gap-2 rounded-xl bg-white p-4 sm:p-5 ${getFlagStyle(flag.severity)}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 flex-col gap-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      className={`rounded-full border-transparent px-3 py-1 text-xs font-medium ${getSeverityBadge(flag.severity)}`}
                    >
                      {flag.severity === "critical" ? "🚨 Critical" : "⚠️ Warning"}
                    </Badge>
                  </div>
                  <div className="text-base font-bold text-gray-900">{flag.title}</div>
                  <p className="text-sm text-gray-600">{flag.description}</p>
                  <div className="mt-1 flex flex-wrap gap-3 text-xs text-gray-400">
                    {flag.ipAddress && (
                      <span>
                        IP: <span className="font-mono">{flag.ipAddress}</span>
                      </span>
                    )}
                    {flag.userName && (
                      <span>User: {flag.userName}</span>
                    )}
                    {flag.affectedPins.length > 0 && (
                      <span>
                        PINs: <span className="font-mono">{flag.affectedPins.join(", ")}</span>
                      </span>
                    )}
                    <span>
                      Last seen: {formatRelative(flag.lastSeenAt)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Trusted IPs section */}
      <div className="mt-4 flex flex-col gap-3 rounded-xl bg-white p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-col gap-1">
            <h2 className="text-lg font-bold text-gray-900">Trusted IPs</h2>
            <p className="text-sm text-gray-500">
              IPs listed here are exempt from rapid-probing and password-spraying
              alerts. Add your dev machine or office network to silence false
              positives while testing. Cracked-password and unknown-PIN alerts
              still fire for all IPs.
            </p>
          </div>
        </div>

        {/* Add form */}
        <div className="flex flex-col gap-3 rounded-lg border border-gray-200 bg-gray-50 p-4 sm:flex-row sm:items-start">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-gray-700">
              IP Address
            </label>
            <Input
              type="text"
              value={newIp}
              onChange={(e) => setNewIp(e.target.value)}
              placeholder="e.g. 187.127.135.11"
              disabled={addingIp}
              className="bg-white"
            />
          </div>
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-gray-700">
              Label (optional)
            </label>
            <Input
              type="text"
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="e.g. Office network"
              disabled={addingIp}
              className="bg-white"
              maxLength={60}
            />
          </div>
          <div className="sm:pt-5">
            <Button
              onClick={handleAddIp}
              disabled={addingIp || !newIp.trim()}
              className="h-10 w-full gap-2 rounded-lg bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-50 sm:w-auto"
            >
              {addingIp ? "Adding..." : (<><Plus className="size-4" />Add</>)}
            </Button>
          </div>
        </div>

        {addIpError && (
          <p className="text-sm font-medium text-red-500">{addIpError}</p>
        )}

        {/* List */}
        {trustedLoading && trustedIps.length === 0 ? (
          <p className="text-sm text-gray-400">Loading trusted IPs...</p>
        ) : trustedIps.length === 0 ? (
          <p className="text-sm text-gray-400">No trusted IPs yet.</p>
        ) : (
          <div className="flex flex-col divide-y divide-gray-100">
            {trustedIps.map((ip) => (
              <div
                key={ip.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3"
              >
                <div className="flex min-w-0 flex-col gap-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-medium text-gray-900">
                      {ip.ipAddress}
                    </span>
                    {ip.label && (
                      <span className="text-sm text-gray-500">— {ip.label}</span>
                    )}
                  </div>
                  <div className="text-xs text-gray-400">
                    Added {formatRelative(ip.createdAt)}
                    {ip.createdByName && <> by {ip.createdByName}</>}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRemoveIp(ip.id)}
                  disabled={removingId === ip.id}
                  className="gap-1 rounded-lg border-red-200 text-xs text-red-600 hover:bg-red-50 disabled:opacity-50"
                >
                  <Trash2 className="size-3" />
                  {removingId === ip.id ? "Removing..." : "Remove"}
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sign-in History Tab
// ---------------------------------------------------------------------------

function SignInHistoryTab() {
  const [rows, setRows] = React.useState<SignInRow[]>([])
  const [summary, setSummary] = React.useState<SignInApiResponse["summary"] | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [loadError, setLoadError] = React.useState<string | null>(null)
  const [total, setTotal] = React.useState(0)
  const [page, setPage] = React.useState(1)
  const pageSize = 25

  const [windowFilter, setWindowFilter] = React.useState<SignInWindow>("7d")
  const [search, setSearch] = React.useState("")
  const [debouncedSearch, setDebouncedSearch] = React.useState("")
  const [exporting, setExporting] = React.useState(false)

  // Debounce search
  React.useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search)
      setPage(1)
    }, 300)
    return () => clearTimeout(t)
  }, [search])

  const load = React.useCallback(async () => {
    setLoading(true)
    setLoadError(null)
    try {
      const params = new URLSearchParams()
      params.set("page", String(page))
      params.set("pageSize", String(pageSize))
      params.set("window", windowFilter)
      if (debouncedSearch) params.set("search", debouncedSearch)

      const res = await fetch(`/api/admin/signin-history?${params}`)
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? `Request failed (${res.status})`)
      }
      const json: SignInApiResponse = await res.json()
      setRows(json.data)
      setSummary(json.summary)
      setTotal(json.total)
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error"
      console.error("Failed to load sign-in history:", msg)
      setLoadError(msg)
    } finally {
      setLoading(false)
    }
  }, [page, windowFilter, debouncedSearch])

  React.useEffect(() => {
    load()
  }, [load])

  async function handleExportCsv() {
    setExporting(true)
    try {
      const params = new URLSearchParams()
      params.set("page", "1")
      params.set("pageSize", "10000")
      params.set("window", windowFilter)
      if (debouncedSearch) params.set("search", debouncedSearch)

      const res = await fetch(`/api/admin/signin-history?${params}`)
      if (!res.ok) throw new Error("Failed to fetch")
      const json: SignInApiResponse = await res.json()

      const csvHeaders = ["Date", "User", "Role", "Email", "IP Address"]
      const csvRows = json.data.map((r) => [
        formatDate(r.attemptedAt),
        r.userName ?? "",
        r.userRole ? r.userRole.replace(/_/g, " ") : "",
        r.userEmail ?? "",
        r.ipAddress ?? "",
      ].map((cell) => `"${String(cell).replace(/"/g, '""')}"`))

      const csv = [csvHeaders.join(","), ...csvRows.map((r) => r.join(","))].join("\n")

      const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
      const url = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = url
      link.download = `signin-history-${windowFilter}-${new Date().toISOString().slice(0, 10)}.csv`
      link.click()
      URL.revokeObjectURL(url)
    } catch {
      // silent — button stops spinning
    } finally {
      setExporting(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / pageSize))

  const windowLabels: Record<SignInWindow, string> = {
    "24h": "Last 24h",
    "7d": "Last 7 days",
    "30d": "Last 30 days",
    all: "All time",
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Summary + Export */}
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button
          onClick={handleExportCsv}
          disabled={exporting || rows.length === 0}
          className="inline-flex justify-center gap-2 rounded-xl bg-[#3ea3db] px-6 py-5 text-sm font-medium text-white hover:bg-[#3ea3db]/90 disabled:opacity-50"
          size="lg"
        >
          {exporting ? (
            <>
              Exporting...
              <svg className="ml-1 size-4 animate-spin" viewBox="0 0 40 40" fill="none">
                <circle cx="20" cy="20" r="15" stroke="#d1d5db" strokeWidth="5" strokeLinecap="round" />
                <circle cx="20" cy="20" r="15" stroke="white" strokeWidth="5" strokeLinecap="round" strokeDasharray="94.25" strokeDashoffset="70" />
              </svg>
            </>
          ) : (
            <>
              Export CSV
              <Download className="ml-1 size-4" />
            </>
          )}
        </Button>
      </div>

      {loadError && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          <div className="font-semibold">Failed to load sign-in history</div>
          <div className="mt-1 text-xs">{loadError}</div>
        </div>
      )}

      {summary && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="flex items-center gap-4 rounded-xl bg-white p-5">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-blue-50">
              <History className="size-6 text-blue-500" />
            </div>
            <div className="min-w-0">
              <div className="text-2xl font-bold text-gray-900">{summary.last24h}</div>
              <div className="text-xs text-gray-500">Sign-ins (24h)</div>
            </div>
          </div>
          <div className="flex items-center gap-4 rounded-xl bg-white p-5">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-green-50">
              <UserCircle className="size-6 text-green-500" />
            </div>
            <div className="min-w-0">
              <div className="text-2xl font-bold text-gray-900">{summary.uniqueUsers24h}</div>
              <div className="text-xs text-gray-500">Unique users (24h)</div>
            </div>
          </div>
          <div className="flex items-center gap-4 rounded-xl bg-white p-5">
            <div className="flex size-12 shrink-0 items-center justify-center rounded-full bg-gray-100">
              <History className="size-6 text-gray-500" />
            </div>
            <div className="min-w-0">
              <div className="text-2xl font-bold text-gray-900">{summary.last7d}</div>
              <div className="text-xs text-gray-500">Sign-ins (7 days)</div>
            </div>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {(["24h", "7d", "30d", "all"] as SignInWindow[]).map((w) => (
            <button
              key={w}
              type="button"
              onClick={() => {
                setWindowFilter(w)
                setPage(1)
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                windowFilter === w
                  ? "bg-[#3ea3db] text-white"
                  : "text-gray-600 hover:bg-gray-200"
              }`}
            >
              {windowLabels[w]}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-gray-400" />
          <Input
            type="text"
            placeholder="Search by user name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="bg-white py-2 pl-8"
            aria-label="Search sign-in history"
          />
        </div>
      </div>

      {/* List */}
      <div className="flex min-w-0 flex-col gap-3">
        {loading && rows.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-3 rounded-xl bg-white">
            <svg className="size-10 animate-spin" viewBox="0 0 40 40" fill="none">
              <circle cx="20" cy="20" r="15" stroke="#d1d5db" strokeWidth="5" strokeLinecap="round" />
              <circle cx="20" cy="20" r="15" stroke="#3ea3db" strokeWidth="5" strokeLinecap="round" strokeDasharray="94.25" strokeDashoffset="70" />
            </svg>
            <span className="text-sm text-gray-400">Loading sign-in history...</span>
          </div>
        ) : rows.length === 0 ? (
          <div className="flex h-40 flex-col items-center justify-center gap-2 rounded-xl bg-white">
            <History className="size-10 text-gray-400" />
            <span className="text-base font-medium text-gray-900">No sign-ins in this period</span>
            <span className="text-sm text-gray-400">
              Try expanding the time window or clearing the search.
            </span>
          </div>
        ) : (
          rows.map((row) => (
            <div
              key={row.id}
              className="flex flex-wrap items-start justify-between gap-3 rounded-xl bg-white p-4 sm:p-5"
            >
              <div className="flex min-w-0 flex-col gap-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-base font-bold text-gray-900">
                    {row.userName ?? "Unknown user"}
                  </span>
                  {row.userRole && (
                    <Badge className="rounded-full border-transparent bg-gray-100 px-3 py-1 text-xs font-medium text-gray-600">
                      {row.userRole.replace(/_/g, " ")}
                    </Badge>
                  )}
                </div>
                {row.userEmail && (
                  <div className="truncate text-sm text-gray-500">{row.userEmail}</div>
                )}
                <div className="text-xs text-gray-400">
                  {formatDate(row.attemptedAt)}
                  {row.ipAddress && (
                    <>
                      <span className="mx-2">·</span>
                      IP: <span className="font-mono">{row.ipAddress}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Pagination */}
      {total > pageSize && (
        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
          <p className="text-sm text-gray-500">
            Showing {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => setPage(Math.max(1, page - 1))}
              disabled={page === 1}
              className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                page === 1
                  ? "border-gray-200 text-gray-300 cursor-not-allowed"
                  : "border-gray-300 text-gray-600 hover:bg-gray-100"
              }`}
            >
              Previous
            </button>
            <span className="text-sm text-gray-600">
              Page {page} of {totalPages}
            </span>
            <button
              type="button"
              onClick={() => setPage(Math.min(totalPages, page + 1))}
              disabled={page === totalPages}
              className={`inline-flex items-center rounded-lg border px-3 py-1.5 text-sm transition-colors ${
                page === totalPages
                  ? "border-gray-200 text-gray-300 cursor-not-allowed"
                  : "border-gray-300 text-gray-600 hover:bg-gray-100"
              }`}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
