"use client"

import * as React from "react"
import Link from "next/link"
import { ArrowLeft, Shield, ShieldAlert, AlertTriangle, RefreshCw, Unlock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"

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

interface ApiResponse {
  data: AttemptSummary[]
  summary: {
    totalLocked: number
    totalFailures24h: number
    windowMinutes: number
    maxAttempts: number
  }
}

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

function maskPin(pin: string): string {
  if (pin.length <= 2) return "●".repeat(pin.length)
  return pin.slice(0, 1) + "●".repeat(pin.length - 2) + pin.slice(-1)
}

function getRowStyle(entry: AttemptSummary): string {
  if (entry.locked) return "border-l-4 border-red-500"
  if (entry.failuresInWindow >= 3) return "border-l-4 border-amber-400"
  return "border-l-4 border-transparent"
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function SecurityPage() {
  const [entries, setEntries] = React.useState<AttemptSummary[]>([])
  const [summary, setSummary] = React.useState<ApiResponse["summary"] | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [refreshing, setRefreshing] = React.useState(false)
  const [expandedPin, setExpandedPin] = React.useState<string | null>(null)
  const [unlockTarget, setUnlockTarget] = React.useState<AttemptSummary | null>(null)
  const [unlocking, setUnlocking] = React.useState(false)
  const [unlockError, setUnlockError] = React.useState("")

  // Load data
  const load = React.useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true)
    else setLoading(true)
    try {
      const res = await fetch("/api/admin/auth-attempts")
      if (!res.ok) throw new Error("Failed to load")
      const json: ApiResponse = await res.json()
      setEntries(json.data)
      setSummary(json.summary)
    } catch (err) {
      console.error("Failed to load auth attempts:", err)
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
        <h1 className="text-2xl font-bold text-gray-900 sm:text-3xl">
          Security
        </h1>
        <Button
          onClick={() => load(true)}
          disabled={refreshing}
          className="hidden justify-center gap-2 rounded-xl bg-[#3ea3db] px-6 py-5 text-sm font-medium text-white hover:bg-[#3ea3db]/90 disabled:opacity-50 sm:inline-flex"
          size="lg"
        >
          {refreshing ? (
            <>
              Refreshing...
              <svg className="ml-1 size-4 animate-spin" viewBox="0 0 40 40" fill="none">
                <circle cx="20" cy="20" r="15" stroke="#6b7280" strokeWidth="5" strokeLinecap="round" />
                <circle cx="20" cy="20" r="15" stroke="white" strokeWidth="5" strokeLinecap="round" strokeDasharray="94.25" strokeDashoffset="70" />
              </svg>
            </>
          ) : (
            <>
              Refresh
              <RefreshCw className="size-4" />
            </>
          )}
        </Button>
      </div>
      <p className="-mt-6 text-base text-gray-500">
        Monitor failed sign-in attempts and unlock blocked accounts
      </p>

      {/* Mobile-only refresh button */}
      <Button
        onClick={() => load(true)}
        disabled={refreshing}
        className="w-full justify-center gap-2 rounded-xl bg-[#3ea3db] px-6 py-5 text-sm font-medium text-white hover:bg-[#3ea3db]/90 disabled:opacity-50 sm:hidden"
        size="lg"
      >
        {refreshing ? "Refreshing..." : "Refresh"}
        <RefreshCw className="size-4" />
      </Button>

      {/* Summary cards */}
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

      {/* Attempts list */}
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
                {/* Top row: status + name + actions */}
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
                    <div className="text-base font-bold text-gray-900">
                      {displayName}
                    </div>
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

                {/* Stats row */}
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

                {/* Expanded history */}
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
