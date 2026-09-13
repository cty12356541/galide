// React 19: JSX namespace is no longer global; re-export for backward compat
declare global {
  namespace JSX {
    type Element = import('react').JSX.Element
    type ElementClass = import('react').JSX.ElementClass
    type IntrinsicElements = import('react').JSX.IntrinsicElements
  }
}

export {}
