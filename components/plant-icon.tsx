/** Simple original SVG icons per plant category. */
const PATHS: Record<string, React.ReactNode> = {
  palm: (
    <>
      <path d="M24 44V22" strokeWidth="3" />
      <path d="M24 22c-4-6-11-8-17-6 6 0 11 3 17 6zM24 22c4-6 11-8 17-6-6 0-11 3-17 6zM24 22c-2-7-1-13 3-17-1 6-2 11-3 17zM24 22c-6-2-12 1-15 6 4-3 9-5 15-6zM24 22c6-2 12 1 15 6-4-3-9-5-15-6z" fill="currentColor" stroke="none" />
    </>
  ),
  large_tree: (
    <>
      <path d="M24 44V28" strokeWidth="3" />
      <circle cx="24" cy="18" r="13" fill="currentColor" opacity="0.85" stroke="none" />
      <circle cx="15" cy="24" r="7" fill="currentColor" stroke="none" />
      <circle cx="33" cy="24" r="7" fill="currentColor" stroke="none" />
    </>
  ),
  small_tree: (
    <>
      <path d="M24 44V30" strokeWidth="3" />
      <ellipse cx="24" cy="21" rx="10" ry="12" fill="currentColor" stroke="none" />
    </>
  ),
  shrub: (
    <>
      <path d="M6 40c0-8 6-13 11-13 1-6 6-9 11-8 5 0 9 4 9 9 4 0 6 5 5 12z" fill="currentColor" stroke="none" />
      <path d="M4 42h40" />
    </>
  ),
  wildflower: (
    <>
      <path d="M24 44V24M24 34c-4-1-7-4-8-8 4 1 7 4 8 8z" />
      <g fill="currentColor" stroke="none">
        <circle cx="24" cy="10" r="5" />
        <circle cx="31" cy="16" r="5" />
        <circle cx="17" cy="16" r="5" />
        <circle cx="20" cy="23" r="5" />
        <circle cx="28" cy="23" r="5" />
      </g>
      <circle cx="24" cy="17" r="3.5" fill="var(--sand)" stroke="none" />
    </>
  ),
  grass: <path d="M24 44c0-14-2-24-6-34M24 44c0-12 3-22 9-30M24 44c-2-10-7-18-14-22M24 44c2-9 7-16 15-19M24 44V8" />,
  vine: (
    <>
      <path d="M10 44c0-10 14-8 14-18S10 18 12 8" />
      <g fill="currentColor" stroke="none">
        <ellipse cx="18" cy="34" rx="4" ry="2.5" transform="rotate(-30 18 34)" />
        <ellipse cx="26" cy="22" rx="4" ry="2.5" transform="rotate(30 26 22)" />
        <ellipse cx="15" cy="15" rx="4" ry="2.5" transform="rotate(-30 15 15)" />
      </g>
      <circle cx="30" cy="12" r="4" fill="var(--coral)" stroke="none" />
    </>
  ),
  fern: (
    <>
      <path d="M24 44C22 30 16 18 8 8M24 44c2-14 8-26 16-36" />
      <path d="M14 18l-6 2M17 24l-7 3M20 31l-6 4M34 18l6 2M31 24l7 3M28 31l6 4M11 13l-4 0M37 13l4 0" />
    </>
  ),
  aquatic: (
    <>
      <path d="M24 34V12M24 18l-6-6M24 22l6-7" />
      <ellipse cx="24" cy="10" rx="4" ry="6" fill="var(--sky)" stroke="none" />
      <path d="M4 38c4-3 8-3 12 0s8 3 12 0 8-3 12 0" stroke="var(--sky)" />
      <path d="M8 44c4-3 8-3 12 0s8 3 12 0" stroke="var(--sky)" />
    </>
  ),
  vegetable: (
    <>
      <path d="M24 44V20M24 30l-7-6M24 26l7-6" />
      <path d="M14 22c0-6 4-9 10-9-1 6-4 9-10 9zM34 18c0-6-4-9-10-9 1 6 4 9 10 9z" fill="currentColor" stroke="none" />
      <circle cx="16" cy="34" r="5" fill="var(--coral)" stroke="none" />
      <circle cx="31" cy="36" r="4" fill="var(--coral)" stroke="none" />
      <path d="M6 44h36" />
    </>
  ),
  herb: (
    <>
      <path d="M24 44V12M24 36l-8-4M24 28l8-4M24 20l-7-4" />
      <g fill="currentColor" stroke="none">
        <ellipse cx="15" cy="31" rx="5" ry="3" />
        <ellipse cx="33" cy="23" rx="5" ry="3" />
        <ellipse cx="16" cy="15" rx="4.5" ry="2.8" />
        <ellipse cx="24" cy="9" rx="3" ry="4" />
      </g>
      <path d="M14 44h20l-2-6H16z" fill="var(--sand)" />
    </>
  ),
};

export function PlantIcon({ category, className = "size-10", title }: { category: string; className?: string; title?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"
      className={`text-leaf ${className}`} role="img" aria-label={title ?? `${category.replace("_", " ")} icon`}>
      {PATHS[category] ?? PATHS.shrub}
    </svg>
  );
}
