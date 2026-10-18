import { useSyncExternalStore } from 'react'

export const MOBILE_QUERY = '(max-width: 860px)'

export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (notify) => {
      const mql = matchMedia(query)
      mql.addEventListener('change', notify)
      return () => mql.removeEventListener('change', notify)
    },
    () => matchMedia(query).matches,
  )
}
