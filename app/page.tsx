'use client';

import { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { useChat } from '@ai-sdk/react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import itocLogo from 'app/images/itoc-logo-white.png';
import ThemeToggle from './theme-toggle';
import type { AnswerTiming, ProgressUpdate, SourceRef } from '@/lib/rag/types';

const STARTER_QUESTIONS = [
  'Which POJK rules cover IT governance at securities companies?',
  'Summarize the infrastructure requirements in the Pedoman Remote Trading.',
  'What must a BOFIS provider prepare before getting IDX approval?',
  'What controls apply to Fasilitas Pesanan Langsung (DMA) for clients?',
];

/** The three heads from the ITOC logo, reused as the assistant's mark. */
function CommunityMark({ animated = false }: { animated?: boolean }) {
  const dot = 'w-2 h-2 rounded-full';
  const bounce = animated ? 'animate-bounce' : '';
  return (
    <div className="flex items-end gap-[3px]" aria-hidden="true">
      <span className={`${dot} bg-itoc-orange ${bounce}`} />
      <span className={`${dot} bg-itoc-blue ${bounce} [animation-delay:150ms]`} />
      <span className={`${dot} bg-itoc-orange ${bounce} [animation-delay:300ms]`} />
    </div>
  );
}

function AssistantAvatar({ animated = false }: { animated?: boolean }) {
  return (
    <div className="w-9 h-9 shrink-0 rounded-full bg-surface border border-line flex items-center justify-center">
      <CommunityMark animated={animated} />
    </div>
  );
}

/** Renders the model's Markdown (headings, lists, tables, code) with ITOC styling. */
function Answer({ text, streaming }: { text: string; streaming: boolean }) {
  return (
    <div className={`answer ${streaming ? 'is-streaming' : ''}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          table: ({ node, ...props }) => (
            <div className="table-wrap">
              <table {...props} />
            </div>
          ),
          // eslint-disable-next-line @typescript-eslint/no-unused-vars
          a: ({ node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard can be blocked on non-HTTPS origins; fail quietly.
    }
  };

  return (
    <button
      type="button"
      onClick={copy}
      className="inline-flex items-center gap-1.5 text-xs font-medium text-muted hover:text-brand px-2 py-1 -ml-2 rounded-md hover:bg-wash transition-colors"
    >
      {copied ? (
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5" aria-hidden="true">
          <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
        </svg>
      ) : (
        <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5" aria-hidden="true">
          <path d="M7 3.5A1.5 1.5 0 0 1 8.5 2h3.879a1.5 1.5 0 0 1 1.06.44l3.122 3.12A1.5 1.5 0 0 1 17 6.622V12.5a1.5 1.5 0 0 1-1.5 1.5h-1v-3.379a3 3 0 0 0-.879-2.121L10.5 5.379A3 3 0 0 0 8.379 4.5H7v-1Z" />
          <path d="M4.5 6A1.5 1.5 0 0 0 3 7.5v9A1.5 1.5 0 0 0 4.5 18h7a1.5 1.5 0 0 0 1.5-1.5v-5.879a1.5 1.5 0 0 0-.44-1.06L9.44 6.439A1.5 1.5 0 0 0 8.378 6H4.5Z" />
        </svg>
      )}
      <span aria-live="polite">{copied ? 'Copied' : 'Copy answer'}</span>
    </button>
  );
}

function pageLabel(s: SourceRef) {
  return s.pageStart === s.pageEnd ? `p. ${s.pageStart}` : `pp. ${s.pageStart}–${s.pageEnd}`;
}

/** The document excerpts the answer was based on, each opening the PDF at the right page. */
function Sources({ sources }: { sources: SourceRef[] }) {
  return (
    <div className="mt-4 rounded-xl border border-line px-4 py-3">
      <div className="text-xs font-semibold text-muted mb-2">Sources from the document library</div>
      <ol className="space-y-1.5">
        {sources.map((s) => (
          <li key={s.n} className="flex gap-2 text-[13px] leading-snug">
            <span className="shrink-0 font-semibold text-brand tabular-nums">[{s.n}]</span>
            <a
              href={`/api/documents/file?name=${encodeURIComponent(s.file)}#page=${s.pageStart}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-ink hover:text-brand hover:underline underline-offset-2"
            >
              {s.title}
              <span className="text-muted">
                {s.heading ? ` · ${s.heading}` : ''} · {pageLabel(s)}
              </span>
            </a>
          </li>
        ))}
      </ol>
    </div>
  );
}

type LibraryDoc = { title: string; file: string; pages: number };

/** Shows which regulations the assistant can read, so members know what it covers. */
function DocumentLibrary() {
  const [docs, setDocs] = useState<LibraryDoc[] | null>(null);

  useEffect(() => {
    fetch('/api/documents')
      .then((r) => r.json())
      .then((d: { documents: LibraryDoc[] }) => setDocs(d.documents))
      .catch(() => setDocs(null));
  }, []);

  if (docs === null) return null;

  if (docs.length === 0) {
    return (
      <p className="mt-6 text-sm text-muted max-w-[60ch] rounded-xl border border-dashed border-line px-4 py-3">
        No documents loaded yet. Put the regulation PDFs in the <code>DokumenPedoman</code> folder and
        run <code>npm run ingest</code>.
      </p>
    );
  }

  return (
    <details className="mt-6 max-w-[60ch] group">
      <summary className="cursor-pointer text-sm font-semibold text-brand select-none">
        {docs.length} {docs.length === 1 ? 'document' : 'documents'} in the library
      </summary>
      <ul className="mt-2 space-y-1 text-[13px] text-ink">
        {docs.map((d) => (
          <li key={d.file}>
            <a
              href={`/api/documents/file?name=${encodeURIComponent(d.file)}`}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-brand hover:underline underline-offset-2"
            >
              {d.title}
            </a>
            <span className="text-muted"> · {d.pages} pp.</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function getTiming(m: { metadata?: unknown }): AnswerTiming | undefined {
  return (m.metadata as { timing?: AnswerTiming } | undefined)?.timing;
}

function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}

/** Re-renders every second, for live elapsed-time displays. */
function useNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return now;
}

// How long earlier questions took until the first words appeared, kept in this browser
// so the progress bar can estimate how long the current one will take.
const WAIT_HISTORY_KEY = 'itoc-ai:first-word-ms';

function readWaitEstimate(): number | null {
  try {
    const list = JSON.parse(localStorage.getItem(WAIT_HISTORY_KEY) ?? '[]') as number[];
    if (!list.length) return null;
    const sorted = [...list].sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)]; // median: one slow first question won't skew it
  } catch {
    return null;
  }
}

function recordWait(ms: number): number | null {
  try {
    const list = JSON.parse(localStorage.getItem(WAIT_HISTORY_KEY) ?? '[]') as number[];
    localStorage.setItem(WAIT_HISTORY_KEY, JSON.stringify([...list, ms].slice(-5)));
  } catch {
    // storage unavailable: the estimate simply stays at its default
  }
  return readWaitEstimate();
}

const STAGES = ['searching', 'reading', 'writing'] as const;

/** Current time, for event handlers (not render) to stamp when a question was sent. */
function timestampNow(): number {
  return Date.now();
}

function StepIcon({ state }: { state: 'done' | 'active' | 'pending' }) {
  if (state === 'done') {
    return (
      <svg className="w-4 h-4 shrink-0 text-brand" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="7" fill="currentColor" opacity="0.15" />
        <path d="M5 8.2l2 2 4-4.4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (state === 'active') {
    return (
      <svg className="w-4 h-4 shrink-0 text-brand animate-spin" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity="0.2" />
        <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  return (
    <svg className="w-4 h-4 shrink-0 text-faint" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/**
 * Shown from the moment a question is sent until the first words of the answer appear,
 * which on a laptop without a GPU can take minutes. The steps say what the AI is doing,
 * the bar estimates how far along it is, and the shimmer shows it is still alive.
 */
function ProgressPanel({
  progress,
  startedAt,
  estimateMs,
}: {
  progress: ProgressUpdate;
  startedAt: number;
  estimateMs: number | null;
}) {
  const now = useNow();
  const elapsed = Math.max(0, now - startedAt);
  const est = Math.max(estimateMs ?? 60_000, 5_000);

  // Eases toward 92% and never reaches the end on its own: the bar only completes when
  // the answer actually starts, so it never claims to be done while the AI is still working.
  let pct = 92 * (1 - Math.exp((-2 * elapsed) / est));
  if (progress.stage === 'searching') pct = Math.min(pct, 10);
  pct = Math.max(pct, 3);

  const current = STAGES.indexOf(progress.stage);
  const stateOf = (i: number) => (i < current ? 'done' : i === current ? 'active' : 'pending');

  const readingLabel =
    progress.stage === 'reading' && progress.excerpts > 0
      ? `Reading ${progress.excerpts} relevant excerpt${progress.excerpts === 1 ? '' : 's'}`
      : 'Reading the relevant excerpts';

  const slow = elapsed > est * 1.5 && elapsed > 20_000;
  const hint = slow
    ? 'Taking longer than usual. Still working; you can stop anytime.'
    : estimateMs === null
      ? 'The first question can take a few minutes.'
      : `Usually about ${formatDuration(est)}`;

  return (
    <div className="flex gap-3 md:gap-4" role="status" aria-live="polite">
      <AssistantAvatar animated />
      <div className="flex-1 min-w-0 pt-1.5 max-w-md">
        <div className="text-sm font-bold text-brand mb-2">ITOC AI</div>
        <ol className="space-y-1.5 text-sm">
          <li className="flex items-center gap-2">
            <StepIcon state={stateOf(0)} />
            <span className={stateOf(0) === 'pending' ? 'text-faint' : 'text-ink'}>Searching the documents</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="mt-0.5">
              <StepIcon state={stateOf(1)} />
            </span>
            <span>
              <span className={stateOf(1) === 'pending' ? 'text-faint' : 'text-ink'}>{readingLabel}</span>
              {progress.stage === 'reading' && progress.loadingModel && (
                <span className="block text-xs text-muted mt-0.5">
                  Loading the AI model first. This takes longer on the first question.
                </span>
              )}
            </span>
          </li>
          <li className="flex items-center gap-2">
            <StepIcon state={stateOf(2)} />
            <span className={stateOf(2) === 'pending' ? 'text-faint' : 'text-ink'}>Writing the answer</span>
          </li>
        </ol>

        <div
          className="mt-3 h-1.5 rounded-full bg-wash overflow-hidden"
          role="progressbar"
          aria-label="Estimated progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(pct)}
        >
          <div
            className="progress-fill h-full rounded-full bg-itoc-blue transition-[width] duration-1000 ease-linear"
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-1.5 flex justify-between gap-3 text-xs text-muted">
          <span className="tabular-nums">{formatDuration(elapsed)}</span>
          <span className={`text-right ${slow ? 'text-ink' : ''}`}>{hint}</span>
        </div>
      </div>
    </div>
  );
}

/** Under an answer that is still being written: shows it isn't finished yet. */
function WritingIndicator({ startedAt }: { startedAt: number }) {
  const now = useNow();
  return (
    <div className="mt-2 flex items-center gap-2 text-xs text-muted" role="status">
      <span className="w-1.5 h-1.5 rounded-full bg-itoc-blue animate-pulse" aria-hidden="true" />
      Writing the answer… <span className="tabular-nums">{formatDuration(Math.max(0, now - startedAt))}</span>
    </div>
  );
}

function getSources(m: { metadata?: unknown }): SourceRef[] {
  const meta = m.metadata as { sources?: SourceRef[] } | undefined;
  return Array.isArray(meta?.sources) ? meta.sources : [];
}

function getText(m: { parts?: Array<{ type: string; text?: string }> }): string {
  return (
    m.parts
      ?.filter((part) => part.type === 'text')
      .map((part) => part.text ?? '')
      .join('') ||
    (m as unknown as { content?: string }).content ||
    ''
  );
}

export default function ITOCAIPage() {
  const [input, setInput] = useState('');
  const [progress, setProgress] = useState<ProgressUpdate>({ stage: 'searching' });
  const [waitStartedAt, setWaitStartedAt] = useState(0);
  const [waitEstimate, setWaitEstimate] = useState<number | null>(() =>
    typeof window === 'undefined' ? null : readWaitEstimate(),
  );

  const { messages, sendMessage, status, stop, setMessages, error, regenerate, clearError } =
    useChat({
      id: 'itoc-ai',
      // Live stages from the server ("searching", "reading", "writing").
      onData: (part) => {
        if (part.type === 'data-progress') setProgress(part.data as ProgressUpdate);
      },
      // Remember how long the first words took, to estimate the next wait.
      onFinish: ({ message }) => {
        const ms = getTiming(message)?.firstTokenMs;
        if (ms) setWaitEstimate(recordWait(ms));
      },
    });

  const beginWait = () => {
    setProgress({ stage: 'searching' });
    setWaitStartedAt(timestampNow());
  };

  const scrollRef = useRef<HTMLElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const stickToBottom = useRef(true);
  const [showJump, setShowJump] = useState(false);

  const isThinking = status === 'submitted' || status === 'streaming';
  const lastMessage = messages[messages.length - 1];
  // Still waiting for the first words: the request is out, or the answer has started but is empty.
  const waitingForWords =
    status === 'submitted' ||
    (status === 'streaming' && lastMessage?.role === 'assistant' && !getText(lastMessage));

  // Follow the answer as it streams, but only if the reader hasn't scrolled up to re-read.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !stickToBottom.current) return;
    el.scrollTo({ top: el.scrollHeight, behavior: status === 'streaming' ? 'auto' : 'smooth' });
  }, [messages, status]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    stickToBottom.current = nearBottom;
    setShowJump(!nearBottom && messages.length > 0);
  };

  const jumpToLatest = () => {
    stickToBottom.current = true;
    setShowJump(false);
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  };

  // Grow the input with its content, up to a limit.
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [input]);

  // Esc stops an answer in progress.
  useEffect(() => {
    if (!isThinking) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') stop();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isThinking, stop]);

  const send = (text: string) => {
    if (!text.trim() || isThinking) return;
    if (error) clearError();
    stickToBottom.current = true;
    beginWait();
    sendMessage({ role: 'user', parts: [{ type: 'text', text: text.trim() }] });
    setInput('');
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    send(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send(input);
    }
  };

  const startNewChat = () => {
    if (isThinking) stop();
    if (error) clearError();
    setMessages([]);
    setInput('');
    setShowJump(false);
    textareaRef.current?.focus();
  };

  return (
    <div className="flex flex-col h-dvh bg-surface overflow-hidden">
      {/* Header */}
      <header className="shrink-0 bg-surface">
        <div className="max-w-5xl mx-auto flex items-center justify-between gap-4 px-4 md:px-6 h-16">
          <button
            type="button"
            onClick={startNewChat}
            aria-label="ITOC AI home, start a new chat"
            className="flex items-center gap-4 min-w-0 rounded-md"
          >
            {/* The logo PNG has a solid white background, so in dark mode it sits on a white chip. */}
            <span className="shrink-0 dark:bg-white dark:rounded-md dark:px-1.5 dark:py-1">
              <Image
                src={itocLogo}
                alt="ITOC, IT Officer Community"
                priority
                className="h-8 md:h-9 dark:h-7 dark:md:h-8 w-auto"
              />
            </span>
            <span className="hidden sm:block h-6 w-px bg-line" aria-hidden="true" />
            <span className="hidden sm:block text-sm font-semibold text-brand whitespace-nowrap">
              AI Assistant
            </span>
          </button>

          <div className="flex items-center gap-2">
            <ThemeToggle />
            {messages.length > 0 && (
              <button
                type="button"
                onClick={startNewChat}
                className="flex items-center gap-1.5 text-sm font-semibold text-brand px-3 py-2 rounded-lg border border-line hover:bg-wash transition-colors"
              >
                <svg viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4" aria-hidden="true">
                  <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
                </svg>
                New chat
              </button>
            )}
          </div>
        </div>
        {/* Brand rule: mostly blue with an orange tail, echoing the logo */}
        <div className="flex h-[3px]" aria-hidden="true">
          <div className="flex-1 bg-itoc-blue" />
          <div className="w-24 md:w-40 bg-itoc-orange" />
        </div>
      </header>

      {/* Conversation */}
      <main ref={scrollRef} onScroll={handleScroll} className="scroll-area relative flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 md:px-6 py-8">
          {messages.length === 0 ? (
            <section className="pt-6 md:pt-14">
              <CommunityMark />
              <h1 className="mt-5 text-3xl md:text-[2.75rem] md:leading-[1.1] font-extrabold tracking-tight text-brand max-w-[18ch]">
                Ask about capital market regulations.
              </h1>
              <p className="mt-4 text-base text-muted max-w-[56ch] leading-relaxed">
                Questions on POJK, IDX rules, and SRO guidelines that apply to IT at securities
                companies, banks, and other capital market institutions in Indonesia. Answers are
                drawn from the regulation documents in the library, with sources you can open.
              </p>

              <DocumentLibrary />

              <div className="mt-10">
                <h2 className="text-sm font-semibold text-ink mb-3">Try one of these</h2>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {STARTER_QUESTIONS.map((q) => (
                    <li key={q}>
                      <button
                        type="button"
                        onClick={() => send(q)}
                        className="w-full h-full text-left text-sm leading-snug text-ink px-4 py-3.5 rounded-xl border border-line border-l-[3px] border-l-brand hover:border-l-itoc-orange hover:bg-wash transition-colors"
                      >
                        {q}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            </section>
          ) : (
            <div className="space-y-8">
              {messages.map((m) => {
                const text = getText(m);

                if (m.role === 'user') {
                  return (
                    <div key={m.id} className="flex justify-end">
                      <div className="max-w-[85%] bg-itoc-blue text-white px-4 py-3 rounded-2xl rounded-br-md text-[15px] leading-relaxed whitespace-pre-wrap break-words">
                        {text}
                      </div>
                    </div>
                  );
                }

                const isLive = status === 'streaming' && m.id === lastMessage?.id;
                if (!text) return null; // the progress panel below covers the wait

                return (
                  <article key={m.id} className="flex gap-3 md:gap-4" aria-busy={isLive}>
                    <AssistantAvatar />
                    <div className="flex-1 min-w-0 pt-1.5">
                      <div className="text-sm font-bold text-brand mb-1.5">ITOC AI</div>
                      <Answer text={text} streaming={isLive} />
                      {isLive && <WritingIndicator startedAt={waitStartedAt} />}
                      {text && getSources(m).length > 0 && <Sources sources={getSources(m)} />}
                      {!isLive && text && (
                        <div className="mt-3 flex items-center gap-3">
                          <CopyButton text={text} />
                          {getTiming(m) && (
                            <span
                              className="text-xs text-faint tabular-nums"
                              title={`First words after ${formatDuration(getTiming(m)!.firstTokenMs)}`}
                            >
                              Answered in {formatDuration(getTiming(m)!.totalMs)}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </article>
                );
              })}

              {/* Waiting for the first words: steps + estimated progress */}
              {waitingForWords && !error && (
                <ProgressPanel progress={progress} startedAt={waitStartedAt} estimateMs={waitEstimate} />
              )}

              {error && (
                <div
                  role="alert"
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-itoc-orange/30 bg-itoc-orange/5 px-4 py-3 text-sm text-ink"
                >
                  <span>
                    {error.message && error.message !== 'An error occurred.'
                      ? error.message
                      : "The answer couldn't be loaded. Check that Ollama is running, then try again."}
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      clearError();
                      stickToBottom.current = true;
                      beginWait();
                      regenerate();
                    }}
                    className="shrink-0 self-start sm:self-auto text-sm font-semibold text-white bg-itoc-blue hover:bg-itoc-blue-deep px-3 py-1.5 rounded-lg transition-colors"
                  >
                    Try again
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Shown when the reader scrolls up while the conversation continues */}
        {showJump && (
          <div className="sticky bottom-3 flex justify-center pointer-events-none">
            <button
              type="button"
              onClick={jumpToLatest}
              className="pointer-events-auto flex items-center gap-1.5 text-xs font-semibold text-brand bg-surface border border-line rounded-full px-3 py-1.5 shadow-[0_4px_14px_-6px_rgba(16,42,63,0.35)] hover:bg-wash transition-colors"
            >
              <svg viewBox="0 0 20 20" fill="currentColor" className="w-3.5 h-3.5" aria-hidden="true">
                <path fillRule="evenodd" d="M10 3a.75.75 0 0 1 .75.75v10.638l3.96-4.158a.75.75 0 1 1 1.08 1.04l-5.25 5.5a.75.75 0 0 1-1.08 0l-5.25-5.5a.75.75 0 1 1 1.08-1.04l3.96 4.158V3.75A.75.75 0 0 1 10 3Z" clipRule="evenodd" />
              </svg>
              Jump to latest
            </button>
          </div>
        )}
      </main>

      {/* Composer */}
      <footer className="shrink-0 bg-surface px-4 md:px-6 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="max-w-3xl mx-auto">
          <form
            onSubmit={handleSubmit}
            className="flex items-end gap-2 rounded-2xl border border-line bg-surface pl-4 pr-2 py-2 shadow-[0_4px_20px_-8px_rgba(1,104,179,0.25)] focus-within:border-brand transition-colors"
          >
            <label htmlFor="question" className="sr-only">
              Your question
            </label>
            <textarea
              id="question"
              ref={textareaRef}
              rows={1}
              autoFocus
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Ask about POJK, Remote Trading, BOFIS, DMA…"
              className="flex-1 resize-none bg-transparent text-[15px] leading-6 text-ink placeholder:text-faint focus:outline-none focus-visible:outline-none py-2 max-h-[200px]"
            />

            {isThinking ? (
              <button
                type="button"
                onClick={stop}
                aria-label="Stop answer"
                title="Stop (Esc)"
                className="shrink-0 w-10 h-10 rounded-xl bg-ink hover:bg-ink-soft text-white flex items-center justify-center transition-colors"
              >
                <span className="w-3 h-3 rounded-[3px] bg-surface" />
              </button>
            ) : (
              <button
                type="submit"
                disabled={!input.trim()}
                aria-label="Send question"
                className="shrink-0 w-10 h-10 rounded-xl bg-itoc-blue hover:bg-itoc-blue-deep disabled:bg-line disabled:text-faint text-white flex items-center justify-center transition-colors"
              >
                <svg viewBox="0 0 24 24" fill="currentColor" className="w-5 h-5" aria-hidden="true">
                  <path d="M3.478 2.404a.75.75 0 0 0-.926.941l2.432 7.905H13.5a.75.75 0 0 1 0 1.5H4.984l-2.432 7.905a.75.75 0 0 0 .926.94 60.519 60.519 0 0 0 18.445-8.986.75.75 0 0 0 0-1.218A60.517 60.517 0 0 0 3.478 2.404Z" />
                </svg>
              </button>
            )}
          </form>

          <div className="mt-2.5 flex justify-center sm:justify-between gap-4 text-xs text-muted">
            <span className="hidden sm:inline">
              <kbd className="font-sans font-semibold">Enter</kbd> to send,{' '}
              <kbd className="font-sans font-semibold">Shift + Enter</kbd> for a new line
            </span>
            <span>ITOC AI can make mistakes. Check answers against the official regulation text.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
