// When to greet a visitor with the how-to window. Pure so it can be tested with `node --test`.

/** Query parameters that mean the address describes a particular view (see urlState.ts). */
const VIEW_PARAMS = ['between', 'and', 'votes', 'zoom', 'src', 'sel', 'tr', 'cmp', 'q', 'qm']

/** True when the address already asks for a specific view, i.e. someone shared a link. */
export function carriesView(search: string): boolean {
  const params = new URLSearchParams(search)
  return VIEW_PARAMS.some((p) => params.has(p))
}

/**
 * Show the welcome window to a first-time visitor who opened the plain site. Someone who followed a shared link came for
 * that content, so it is not put in front of them (the Help button is still there).
 */
export function shouldShowWelcome(search: string, seen: boolean): boolean {
  return !seen && !carriesView(search)
}
