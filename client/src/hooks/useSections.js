import { useEffect, useState } from 'react'

export function useSections() {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    let cancelled = false

    async function run() {
      try {
        const res = await fetch('/api/monday/sections')
        let json = null
        try {
          json = await res.json()
        } catch {
          json = null
        }
        if (cancelled) return

        if (!res.ok) {
          const message =
            (json && typeof json.error === 'string' && json.error) ||
            (json && typeof json.message === 'string' && json.message) ||
            `Request failed (${res.status})`
          setError(message)
          setData(null)
          return
        }

        setData(json)
        setError(null)
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e))
          setData(null)
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    run()
    return () => {
      cancelled = true
    }
  }, [])

  return { data, loading, error }
}
