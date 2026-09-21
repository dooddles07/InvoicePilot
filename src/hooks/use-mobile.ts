import * as React from "react"

// Raised from 768: at tablet width a 16rem sidebar leaves too little room for
// dense financial tables, so tablets get the drawer + bottom-nav layout.
const MOBILE_BREAKPOINT = 1024

function subscribe(onChange: () => void) {
  const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
  mql.addEventListener("change", onChange)
  return () => mql.removeEventListener("change", onChange)
}

export function useIsMobile() {
  return React.useSyncExternalStore(
    subscribe,
    () => window.innerWidth < MOBILE_BREAKPOINT,
    () => false,
  )
}
