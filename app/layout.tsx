import type { Metadata, Viewport } from 'next';
import { Plus_Jakarta_Sans, Geist_Mono } from 'next/font/google';
import './globals.css';

// Plus Jakarta Sans was designed by Tokotype in Jakarta. It's a variable font,
// so every weight from 200 to 800 is available without listing them.
const jakarta = Plus_Jakarta_Sans({
  variable: '--font-jakarta',
  subsets: ['latin'],
  display: 'swap',
});

// Used for code and config snippets inside answers.
const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'ITOC AI',
    template: '%s | ITOC AI',
  },
  description:
    "AI assistant for IT officers in Indonesia's capital market. Ask about POJK, IDX rules, and SRO guidelines.",
  applicationName: 'ITOC AI',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#ffffff', // updated to the dark surface color when dark mode is on
  // On phones, shrink the page when the keyboard opens so the input stays visible.
  interactiveWidget: 'resizes-content',
};

// Runs before first paint: applies the saved theme, or the system preference if the
// user hasn't chosen one, so the page never flashes the wrong colors.
// Keep the storage key and colors in sync with app/theme-toggle.tsx.
const themeScript = `(function(){try{var t=localStorage.getItem("itoc-theme");if(t!=="light"&&t!=="dark"){t=window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"}document.documentElement.setAttribute("data-theme",t);if(t==="dark"){var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content","#0c1b29")}}catch(e){}})()`;

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html
      lang="en"
      data-theme="light"
      suppressHydrationWarning
      className={`${jakarta.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="h-full bg-surface text-ink font-sans">{children}</body>
    </html>
  );
}
