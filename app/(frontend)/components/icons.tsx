/** The magnifying glass, drawn once — the masthead, the drawer, and the
 *  search panel all show it at different sizes. */
export function SearchIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="M20.5 20.5 16.7 16.7" />
    </svg>
  )
}
