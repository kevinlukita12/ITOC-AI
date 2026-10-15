'use client';

// Keep in sync with the inline script in app/layout.tsx.
const THEME_STORAGE_KEY = 'itoc-theme';

const THEME_COLORS = { light: '#ffffff', dark: '#0c1b29' } as const;

/**
 * Switches between light and dark mode.
 *
 * Both labels are rendered and CSS shows the right one based on <html data-theme>,
 * which the inline script in layout.tsx sets before first paint. That way the
 * label is correct immediately, with no flash and no hydration mismatch.
 */
export default function ThemeToggle() {
  const toggle = () => {
    const root = document.documentElement;
    const next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[next]);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      // Storage can be blocked (private mode); the switch still works for this visit.
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      className="flex items-center gap-1.5 text-sm font-semibold text-brand px-2.5 sm:px-3 py-2 rounded-lg border border-line hover:bg-wash transition-colors"
    >
      {/* Shown in light mode */}
      <span className="flex items-center gap-1.5 dark:hidden">
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" aria-hidden="true">
          <path
            fillRule="evenodd"
            d="M7.455 2.004a.75.75 0 0 1 .26.77 7 7 0 0 0 9.958 7.967.75.75 0 0 1 1.067.853A8.5 8.5 0 1 1 6.647 1.921a.75.75 0 0 1 .808.083Z"
            clipRule="evenodd"
          />
        </svg>
        <span className="sr-only sm:not-sr-only whitespace-nowrap">Switch to Dark Mode</span>
      </span>

      {/* Shown in dark mode */}
      <span className="hidden dark:flex items-center gap-1.5">
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" aria-hidden="true">
          <path d="M10 2a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 2ZM10 15a.75.75 0 0 1 .75.75v1.5a.75.75 0 0 1-1.5 0v-1.5A.75.75 0 0 1 10 15ZM10 7a3 3 0 1 0 0 6 3 3 0 0 0 0-6ZM15.657 5.404a.75.75 0 1 0-1.06-1.06l-1.061 1.06a.75.75 0 0 0 1.06 1.06l1.06-1.06ZM6.464 14.596a.75.75 0 1 0-1.06-1.06l-1.06 1.06a.75.75 0 0 0 1.06 1.06l1.06-1.06ZM18 10a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 18 10ZM5 10a.75.75 0 0 1-.75.75h-1.5a.75.75 0 0 1 0-1.5h1.5A.75.75 0 0 1 5 10ZM14.596 15.657a.75.75 0 0 0 1.06-1.06l-1.06-1.061a.75.75 0 1 0-1.06 1.06l1.06 1.06ZM5.404 6.464a.75.75 0 0 0 1.06-1.06l-1.06-1.06a.75.75 0 1 0-1.061 1.06l1.06 1.06Z" />
        </svg>
        <span className="sr-only sm:not-sr-only whitespace-nowrap">Switch to Light Mode</span>
      </span>
    </button>
  );
}
