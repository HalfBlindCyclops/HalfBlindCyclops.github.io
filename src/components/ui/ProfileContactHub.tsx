"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import {
  PROFILE_DISPLAY_NAME,
  PROFILE_IMAGE_SRC,
  PROFILE_TAGLINE,
  profileHubRows,
  type ProfileContactIcon,
  type ProfileHubInteractiveRow,
  type ProfileHubRow,
} from "@/data/profileHub";

function Icon({ type, className }: { type: ProfileContactIcon; className?: string }) {
  const cn = className ?? "h-4 w-4 shrink-0 text-slate-200";
  switch (type) {
    case "school":
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
          <path d="M22 10v6M2 10l10-5 10 5-10 5-10-5z" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M6 12v5c0 1 2 3 6 3s6-2 6-3v-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "map":
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
          <path d="M12 21s-6-4.35-6-10a6 6 0 1112 0c0 5.65-6 10-6 10z" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="12" cy="11" r="2.25" />
        </svg>
      );
    case "mail":
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
          <rect x="3" y="5" width="18" height="14" rx="2" />
          <path d="M3 7l9 6 9-6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    case "phone":
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
          <path
            d="M6.5 4h3l1.5 4-2 1.5a12 12 0 006.5 6.5l1.5-2 4 1.5v3a1 1 0 01-1 1A17 17 0 016.5 5a1 1 0 011-1z"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      );
    case "link":
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
          <path d="M10 13a5 5 0 010-7l1-1a5 5 0 017 7l-1 1M14 11a5 5 0 010 7l-1 1a5 5 0 01-7-7l1-1" strokeLinecap="round" />
        </svg>
      );
    case "file":
      return (
        <svg className={cn} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" aria-hidden>
          <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" strokeLinecap="round" strokeLinejoin="round" />
          <path d="M14 2v6h6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      );
    default:
      return null;
  }
}

function StaticRow({ row }: { row: Extract<ProfileHubRow, { variant: "static" }> }) {
  return (
    <div className="flex items-start gap-2.5 py-2 pl-1 pr-2 text-left text-sm text-slate-200">
      <Icon type={row.icon} className="mt-0.5 h-4 w-4 shrink-0 text-slate-300" />
      <div className="min-w-0 flex-1">
        <p className="leading-snug text-slate-100">{row.listLabel}</p>
        {row.detail ? <p className="mt-0.5 text-xs leading-snug text-slate-500">{row.detail}</p> : null}
      </div>
    </div>
  );
}

function resolveCopyValue(contact: ProfileHubInteractiveRow): string {
  if (contact.id === "resume" && typeof window !== "undefined") {
    return `${window.location.origin}${contact.openHref ?? ""}`;
  }
  return contact.copyValue;
}

const MENU_MIN_WIDTH_PX = 200;

function InteractiveRow({
  contact,
  open,
  onToggle,
  onClose,
  copiedAction,
  setCopiedAction,
  scrollContainerRef,
}: {
  contact: ProfileHubInteractiveRow;
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  copiedAction: string | null;
  setCopiedAction: (v: string | null) => void;
  scrollContainerRef: RefObject<HTMLDivElement | null>;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [portalReady, setPortalReady] = useState(false);

  useEffect(() => {
    setPortalReady(true);
  }, []);

  const updateMenuPosition = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const w = MENU_MIN_WIDTH_PX;
    const left = Math.min(
      Math.max(8, rect.right - w),
      Math.max(8, window.innerWidth - w - 8),
    );
    setMenuPos({ top: rect.bottom + 4, left });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setMenuPos(null);
      return;
    }
    updateMenuPosition();
  }, [open, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    const scrollEl = scrollContainerRef.current;
    const onScrollOrResize = () => updateMenuPosition();
    window.addEventListener("resize", onScrollOrResize);
    window.addEventListener("scroll", onScrollOrResize, true);
    scrollEl?.addEventListener("scroll", onScrollOrResize, { passive: true });
    return () => {
      window.removeEventListener("resize", onScrollOrResize);
      window.removeEventListener("scroll", onScrollOrResize, true);
      scrollEl?.removeEventListener("scroll", onScrollOrResize);
    };
  }, [open, scrollContainerRef, updateMenuPosition]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (buttonRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const copy = useCallback(async () => {
    const text = resolveCopyValue(contact);
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedAction(`${contact.id}-copy`);
      window.setTimeout(() => setCopiedAction(null), 2000);
      onClose();
    } catch {
      /* ignore */
    }
  }, [contact, onClose, setCopiedAction]);

  const hasMailto = Boolean(contact.mailtoHref);
  const hasTel = Boolean(contact.telHref);
  const hasOpen = Boolean(contact.openHref);

  const menuContent =
    open && portalReady && menuPos && typeof document !== "undefined"
      ? createPortal(
          <AnimatePresence>
            <motion.div
              key={contact.id}
              ref={menuRef}
              role="menu"
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.15 }}
              style={{
                position: "fixed",
                top: menuPos.top,
                left: menuPos.left,
                zIndex: 200,
                minWidth: MENU_MIN_WIDTH_PX,
              }}
              className="rounded-xl border border-white/20 bg-slate-950/95 py-1.5 shadow-xl shadow-black/40 backdrop-blur-md"
            >
              <div className="border-b border-white/10 px-3 pb-2 pt-1">
                <p className="text-[10px] uppercase tracking-wider text-slate-500">Choose an action</p>
                <p className="truncate text-xs text-slate-300">{contact.listLabel}</p>
              </div>
              <div className="flex flex-col gap-0.5 px-1.5 pt-1.5">
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => void copy()}
                  className="rounded-lg px-3 py-2 text-left text-xs text-slate-100 transition hover:bg-white/10"
                >
                  {copiedAction === `${contact.id}-copy` ? "Copied!" : "Copy to clipboard"}
                </button>
                {hasMailto ? (
                  <a
                    role="menuitem"
                    href={contact.mailtoHref}
                    className="rounded-lg px-3 py-2 text-left text-xs text-cyan-100 transition hover:bg-cyan-500/15"
                  >
                    Open in email app
                  </a>
                ) : null}
                {hasTel ? (
                  <a
                    role="menuitem"
                    href={contact.telHref}
                    className="rounded-lg px-3 py-2 text-left text-xs text-cyan-100 transition hover:bg-cyan-500/15"
                  >
                    Call
                  </a>
                ) : null}
                {hasOpen ? (
                  <a
                    role="menuitem"
                    href={contact.openHref}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="rounded-lg px-3 py-2 text-left text-xs text-cyan-100 transition hover:bg-cyan-500/15"
                    onClick={onClose}
                  >
                    Open in new tab
                  </a>
                ) : null}
              </div>
            </motion.div>
          </AnimatePresence>,
          document.body,
        )
      : null;

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        aria-haspopup="true"
        className="flex w-full items-center gap-2.5 rounded-lg border border-transparent py-2 pl-1 pr-2 text-left text-sm text-slate-200 transition hover:border-white/15 hover:bg-white/5"
      >
        <Icon type={contact.icon} />
        <span className="min-w-0 flex-1 truncate">{contact.listLabel}</span>
        <span className="text-[10px] text-slate-500" aria-hidden>
          ···
        </span>
      </button>
      {menuContent}
    </div>
  );
}

export function ProfileContactHub() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [copiedAction, setCopiedAction] = useState<string | null>(null);
  const [photoFailed, setPhotoFailed] = useState(false);
  const showPhoto = Boolean(PROFILE_IMAGE_SRC) && !photoFailed;
  const cardScrollRef = useRef<HTMLDivElement>(null);

  return (
    <header className="pointer-events-auto absolute left-4 top-4 z-50 max-w-[min(92vw,18rem)] text-left md:left-8 md:top-8 md:max-w-[19rem]">
      <div
        ref={cardScrollRef}
        className="max-h-[min(72dvh,calc(100dvh-5.5rem))] overflow-y-auto overflow-x-hidden overscroll-contain rounded-2xl border border-white/15 bg-slate-950/70 p-4 shadow-lg shadow-black/30 backdrop-blur-xl"
      >
        <div className="flex gap-3">
          <div className="relative flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/20 bg-gradient-to-br from-cyan-900/50 to-slate-900">
            {showPhoto ? (
              // eslint-disable-next-line @next/next/no-img-element -- optional user asset in /public
              <img
                src={PROFILE_IMAGE_SRC!}
                alt={PROFILE_DISPLAY_NAME}
                className="absolute inset-0 h-full w-full object-cover"
                onError={() => setPhotoFailed(true)}
              />
            ) : (
              <span
                className="text-sm font-semibold tracking-tight text-cyan-100/90"
                style={{ fontFamily: "var(--font-orbitron), sans-serif" }}
                aria-hidden
              >
                SW
              </span>
            )}
          </div>
          <div className="min-w-0 flex-1 pt-0.5">
            <h1
              className="text-xl font-bold leading-tight tracking-wide text-white md:text-2xl"
              style={{ fontFamily: "var(--font-orbitron), sans-serif" }}
            >
              {PROFILE_DISPLAY_NAME}
            </h1>
            <p className="mt-1 text-xs leading-snug text-slate-400 md:text-[13px]">{PROFILE_TAGLINE}</p>
          </div>
        </div>

        <nav className="mt-4 border-t border-white/10 pt-3" aria-label="Profile and contact">
          <ul className="space-y-0.5">
            {profileHubRows.map((row) => (
              <li key={row.id}>
                {row.variant === "static" ? (
                  <StaticRow row={row} />
                ) : (
                  <InteractiveRow
                    contact={row}
                    open={openId === row.id}
                    onToggle={() => setOpenId((id) => (id === row.id ? null : row.id))}
                    onClose={() => setOpenId(null)}
                    copiedAction={copiedAction}
                    setCopiedAction={setCopiedAction}
                    scrollContainerRef={cardScrollRef}
                  />
                )}
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </header>
  );
}
