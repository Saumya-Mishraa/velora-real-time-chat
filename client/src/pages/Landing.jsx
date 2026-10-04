import React, { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight, Zap, Phone, Video, Mic, MicOff, PhoneOff, Paperclip, Sparkles, CircleDashed,
  FileText, Check, CheckCheck, Image as ImageIcon, Lock, KeyRound, EyeOff, ShieldCheck, Play, Menu, X,
} from "lucide-react";

const ease = [0.22, 1, 0.36, 1];
const reveal = {
  hidden: { opacity: 0, y: 14 },
  show: (i = 0) => ({ opacity: 1, y: 0, transition: { delay: i * 0.07, duration: 0.5, ease } }),
};
const inView = { initial: "hidden", whileInView: "show", viewport: { once: true, amount: 0.2 } };

const NAV = [
  ["#realtime", "Messaging"],
  ["#calls", "Calls"],
  ["#moments", "Status & Moments"],
  ["#privacy", "Privacy"],
];

const Logo = () => (
  <Link to="/" className="flex items-center gap-2.5" aria-label="Velora home">
    <span className="w-8 h-8 rounded-lg bg-ember flex items-center justify-center font-display font-bold text-bg">V</span>
    <span className="font-display font-semibold text-lg tracking-tight">Velora</span>
  </Link>
);

/* Section label: a quiet running number + title, set on a hairline. */
const SectionLabel = ({ n, children }) => (
  <p className="flex items-center gap-3 text-xs sm:text-[13px] tracking-[0.12em] uppercase text-muted mb-5">
    <span className="text-ember tabular-nums">{n}</span>
    <span className="h-px w-8 bg-white/15" aria-hidden="true" />
    <span>{children}</span>
  </p>
);

const H2 = ({ children, className = "" }) => (
  <h2 className={`font-display text-[1.75rem] sm:text-4xl lg:text-[2.6rem] font-semibold leading-[1.12] tracking-tight ${className}`}>{children}</h2>
);

/* ---------- Product mock: a miniature of the real app ---------- */
const Bubble = ({ own, children, meta }) => (
  <div className={`flex ${own ? "justify-end" : "justify-start"}`}>
    <div className={`max-w-[85%] rounded-2xl px-3 py-2 text-[13px] leading-snug break-words ${own ? "bg-ember text-bg rounded-br-sm" : "bg-chat border border-white/5 rounded-bl-sm"}`}>
      {children}
      {meta && <div className={`flex items-center gap-1 justify-end mt-1 text-[10px] ${own ? "text-bg/70" : "text-muted"}`}>{meta}</div>}
    </div>
  </div>
);

const AppMock = () => (
  <motion.div
    initial={{ opacity: 0, y: 18 }}
    animate={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.7, ease, delay: 0.15 }}
    className="w-full max-w-[560px] mx-auto lg:mx-0 lg:ml-auto min-w-0"
  >
    <div className="rounded-xl border border-white/10 bg-sidebar overflow-hidden">
      <div className="grid grid-cols-[64px_minmax(0,1fr)] sm:grid-cols-[168px_minmax(0,1fr)]">
        <div className="border-r border-white/5 py-2 sm:py-3">
          <p className="hidden sm:block px-3 pb-2 text-[11px] uppercase tracking-wider text-muted">Chats</p>
          {[["Maya", "bg-ember", "Voice call · 4:12"], ["Dev Team", "bg-lavender", "Deploy looks good"], ["Arjun", "bg-online", "Draft: see you at"]].map(([n, c, p], i) => (
            <div key={n} className={`flex items-center justify-center sm:justify-start gap-2.5 px-2 sm:px-3 py-2 ${i === 0 ? "bg-white/[0.04]" : ""}`}>
              <span className={`w-8 h-8 rounded-full ${c} flex-shrink-0 flex items-center justify-center text-[11px] font-semibold text-bg`}>{n[0]}</span>
              <div className="min-w-0 hidden sm:block">
                <p className="text-xs font-medium truncate">{n}</p>
                <p className="text-[10px] text-muted truncate">{p}</p>
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-col min-w-0 bg-chat/50">
          <div className="flex items-center gap-2.5 px-3 sm:px-4 py-2.5 border-b border-white/5">
            <span className="w-7 h-7 rounded-full bg-ember flex items-center justify-center text-[11px] font-semibold text-bg flex-shrink-0">M</span>
            <div className="min-w-0 leading-tight">
              <p className="text-xs font-medium">Maya</p>
              <p className="text-[10px] text-online">Online</p>
            </div>
            <Phone size={14} className="ml-auto text-muted flex-shrink-0" />
            <Video size={14} className="text-muted flex-shrink-0" />
          </div>
          <div className="flex flex-col p-3 sm:p-4 gap-2.5 min-h-[290px]">
            <Bubble>Landed! The view from the top is unreal 🏔️</Bubble>
            <Bubble own meta={<>9:41 <CheckCheck size={11} /></>}>Add it to our Manali Moment ✨</Bubble>
            <div className="flex items-center gap-2.5 border border-white/10 rounded-lg px-3 py-2 w-fit max-w-full">
              <Sparkles size={15} className="text-ember flex-shrink-0" />
              <div className="min-w-0"><p className="text-xs font-medium truncate">Trip to Manali</p><p className="text-[10px] text-muted truncate">28 Photos · 4 Videos · 13 Memories</p></div>
            </div>
            <Bubble own>
              <span className="flex items-center gap-2"><Play size={12} fill="currentColor" /><span className="h-1 w-20 sm:w-24 rounded-full bg-bg/25 overflow-hidden"><span className="block h-full w-1/3 bg-bg/80" /></span><span className="text-[10px] opacity-80">0:14</span></span>
            </Bubble>
            <p className="mt-auto pl-1 text-[11px] text-muted">Maya is typing…</p>
          </div>
        </div>
      </div>
    </div>
  </motion.div>
);

/* ---------- Feature visuals (flat, same surfaces the app uses) ---------- */
const MessagingVisual = () => (
  <div className="rounded-xl border border-white/10 bg-sidebar p-4 sm:p-6 space-y-2.5">
    <Bubble>Are we still on for tonight?</Bubble>
    <Bubble own meta={<>8:02 <CheckCheck size={11} className="text-blue-200" /></>}>Always 🎉 Booked the table</Bubble>
    <div className="flex gap-1 pl-1"><span className="text-xs bg-chat border border-white/10 rounded-full px-2 py-0.5">❤️</span></div>
    <Bubble>Perfect. Sending the address…</Bubble>
    <div className="flex items-center gap-2 border-t border-white/5 pt-3 mt-1 text-sm text-muted min-w-0">
      <span className="text-ember font-medium flex-shrink-0">Draft</span><span className="truncate">see you at 8, bring the…</span>
    </div>
  </div>
);

const CallVisual = () => (
  <div className="relative rounded-xl border border-white/10 bg-sidebar overflow-hidden p-5 sm:p-6 min-h-[300px] sm:min-h-[340px] flex flex-col">
    <div className="absolute top-4 right-4 w-16 h-24 sm:w-20 sm:h-28 rounded-lg bg-chat border border-white/10 flex items-end p-2" aria-hidden="true">
      <span className="text-[10px] text-muted">You</span>
    </div>
    <div className="flex flex-col items-center text-center my-auto pt-6">
      <div className="w-24 h-24 rounded-full bg-ember text-bg font-display text-3xl font-semibold flex items-center justify-center mb-4">M</div>
      <p className="font-display text-xl font-semibold">Maya</p>
      <p className="text-sm text-muted tabular-nums">12:08</p>
    </div>
    <div className="flex justify-center gap-3 mt-6">
      {[MicOff, Video, Mic].map((I, i) => <span key={i} className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center"><I size={18} /></span>)}
      <span className="w-11 h-11 rounded-full bg-red-500 flex items-center justify-center"><PhoneOff size={18} /></span>
    </div>
  </div>
);

const FileVisual = () => (
  <div className="rounded-xl border border-white/10 bg-sidebar p-4 sm:p-6">
    <div className="grid grid-cols-3 gap-1.5 mb-3">
      {["bg-ember/30", "bg-lavender/30", "bg-online/25"].map((c, i) => (
        <div key={i} className={`aspect-[4/3] rounded-md ${c} flex items-center justify-center`}>{i === 1 ? <Play size={18} fill="currentColor" className="opacity-80" /> : <ImageIcon size={18} className="opacity-60" />}</div>
      ))}
    </div>
    <div className="divide-y divide-white/5 border-t border-white/5">
      {[["Itinerary.pdf", "PDF · 1.2 MB"], ["photos-day1.zip", "ZIP · 48 MB"]].map(([n, m]) => (
        <div key={n} className="flex items-center gap-3 py-3">
          <FileText size={18} className="text-muted flex-shrink-0" />
          <div className="min-w-0 flex-1"><p className="text-sm truncate">{n}</p><p className="text-xs text-muted">{m}</p></div>
        </div>
      ))}
    </div>
  </div>
);

const Feature = ({ n, label, title, body, points, visual, flip }) => (
  <div className={`grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] gap-10 lg:gap-20 items-center ${flip ? "lg:[&>*:first-child]:order-2" : ""}`}>
    <motion.div variants={reveal} {...inView} className="min-w-0">
      <SectionLabel n={n}>{label}</SectionLabel>
      <H2 className="mb-5">{title}</H2>
      <p className="text-muted text-base sm:text-lg leading-relaxed mb-7 max-w-lg">{body}</p>
      <ul className="max-w-lg border-t border-white/10">
        {points.map((p) => (
          <li key={p} className="flex items-start gap-3 py-3 border-b border-white/10 text-sm sm:text-[15px]">
            <Check size={16} strokeWidth={2.5} className="mt-0.5 text-ember flex-shrink-0" />
            <span className="min-w-0">{p}</span>
          </li>
        ))}
      </ul>
    </motion.div>
    <motion.div variants={reveal} custom={2} {...inView} className="min-w-0">{visual}</motion.div>
  </div>
);

const Landing = () => {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-bg text-ink overflow-x-hidden pt-[env(safe-area-inset-top,0px)]">
      <nav className="sticky top-0 z-30 bg-bg border-b border-white/5 pt-[env(safe-area-inset-top,0px)] -mt-[env(safe-area-inset-top,0px)]" aria-label="Main">
        <div className="flex items-center justify-between gap-3 px-5 sm:px-10 h-16 max-w-7xl mx-auto">
          <Logo />
          <div className="hidden md:flex items-center gap-8 text-sm text-muted">
            {NAV.map(([href, t]) => <a key={href} href={href} className="hover:text-ink transition-colors">{t}</a>)}
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <Link to="/login" className="hidden min-[380px]:block text-sm text-muted hover:text-ink transition-colors px-3 py-2.5">Log in</Link>
            <Link to="/register" className="text-sm bg-ember text-bg font-medium px-4 py-2.5 rounded-lg hover:brightness-110 transition whitespace-nowrap">Get started</Link>
            <button
              type="button"
              onClick={() => setMenuOpen((o) => !o)}
              className="md:hidden w-10 h-10 flex items-center justify-center rounded-lg text-muted hover:text-ink"
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
            >
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
        {menuOpen && (
          <div className="md:hidden border-t border-white/5 px-5 sm:px-10 py-2">
            {NAV.map(([href, t]) => (
              <a key={href} href={href} onClick={() => setMenuOpen(false)} className="block py-3 text-[15px] text-muted hover:text-ink border-b border-white/5 last:border-0">{t}</a>
            ))}
            <Link to="/login" className="min-[380px]:hidden block py-3 text-[15px] text-muted hover:text-ink">Log in</Link>
          </div>
        )}
      </nav>

      {/* Hero */}
      <header className="max-w-7xl mx-auto px-5 sm:px-10 pt-12 sm:pt-20 pb-16 sm:pb-24 grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-12 lg:gap-16 items-center">
        <div className="min-w-0">
          <motion.p variants={reveal} initial="hidden" animate="show" className="flex items-center gap-2 text-sm text-muted mb-6">
            <span className="w-1.5 h-1.5 rounded-full bg-online animate-breathe flex-shrink-0" /> Messages, calls and memories — in one place
          </motion.p>
          <motion.h1 variants={reveal} custom={1} initial="hidden" animate="show" className="font-display text-[2.6rem] leading-[1.04] sm:text-6xl lg:text-[4.5rem] font-semibold tracking-tight mb-6">
            Stay close,<br />
            <span className="text-ember">in real time.</span>
          </motion.h1>
          <motion.p variants={reveal} custom={2} initial="hidden" animate="show" className="text-muted text-base sm:text-lg leading-relaxed mb-8 max-w-lg">
            Velora brings instant messaging, crystal-clear voice and video calls, disappearing Status and shared Moments together — without the noise.
          </motion.p>
          <motion.div variants={reveal} custom={3} initial="hidden" animate="show" className="flex flex-col min-[420px]:flex-row min-[420px]:items-center gap-3">
            <Link to="/register" className="bg-ember text-bg font-medium px-6 py-3.5 rounded-lg hover:brightness-110 transition flex items-center justify-center gap-2">Create your account <ArrowRight size={16} /></Link>
            <Link to="/login" className="text-ink/90 hover:text-ink px-6 py-3.5 rounded-lg border border-white/10 hover:border-white/25 transition text-center">Log in</Link>
          </motion.div>
          <motion.ul variants={reveal} custom={4} initial="hidden" animate="show" className="flex flex-wrap gap-x-6 gap-y-2 mt-8 text-sm text-muted">
            {["Works in your browser", "No downloads", "Free to start"].map((t) => <li key={t} className="flex items-center gap-2"><Check size={14} className="text-online" /> {t}</li>)}
          </motion.ul>
        </div>
        <AppMock />
      </header>

      {/* Capabilities */}
      <section className="border-y border-white/5" aria-label="Highlights">
        <ul className="max-w-7xl mx-auto px-5 sm:px-10 grid grid-cols-2 md:grid-cols-4 text-sm">
          {[[Zap, "Instant delivery"], [Video, "HD video calls"], [Paperclip, "Share any file"], [Lock, "Private by design"]].map(([I, t], i) => (
            <li key={t} className={`flex items-center gap-3 text-muted py-5 md:px-6 md:first:pl-0 ${i % 2 === 1 ? "pl-4 border-l border-white/5" : ""} ${i === 2 ? "md:border-l md:border-white/5 md:pl-6" : ""} ${i < 2 ? "border-b border-white/5 md:border-b-0" : ""} ${i === 1 || i === 3 ? "md:border-l md:border-white/5" : ""}`}>
              <I size={18} className="text-ember flex-shrink-0" /><span className="min-w-0">{t}</span>
            </li>
          ))}
        </ul>
      </section>

      <main>
        <section id="realtime" className="max-w-7xl mx-auto px-5 sm:px-10 pt-20 sm:pt-28 scroll-mt-16">
          <Feature
            n="01"
            label="Real-time messaging"
            title="Everything updates the moment it happens."
            body="Messages, reactions, read receipts, typing and presence sync across every device instantly. Start typing on your phone, finish on your laptop — your draft is waiting."
            points={["See who's online and who's typing", "Edit, react, reply, pin and delete for everyone", "Voice messages recorded right in the chat", "Pick up exactly where you left off after a refresh"]}
            visual={<MessagingVisual />}
          />
        </section>

        <section id="calls" className="max-w-7xl mx-auto px-5 sm:px-10 pt-20 sm:pt-28 scroll-mt-16">
          <Feature
            flip
            n="02"
            label="Voice & video calling"
            title="Real calls, right in the browser."
            body="Peer-to-peer audio and video built on WebRTC. Minimize a call and keep chatting, flip cameras on your phone, and see every missed call in your history."
            points={["Mute, camera on/off and front/back camera switching", "Minimize the call and keep messaging", "Call history with missed-call indicators", "Reconnects automatically on a shaky network"]}
            visual={<CallVisual />}
          />
        </section>

        <section id="moments" className="max-w-7xl mx-auto px-5 sm:px-10 pt-20 sm:pt-28 scroll-mt-16">
          <motion.div variants={reveal} {...inView} className="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] gap-6 lg:gap-20 mb-10 sm:mb-14">
            <div>
              <SectionLabel n="03">Status & Moments</SectionLabel>
              <H2>For the quick updates and the ones worth keeping.</H2>
            </div>
            <p className="text-muted text-base sm:text-lg leading-relaxed lg:self-end max-w-lg">Share a Status that disappears in 24 hours, or build a Moment — a shared collection of photos, videos and memories with the people who were there.</p>
          </motion.div>

          <div className="grid md:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] gap-10 md:gap-8 lg:gap-14 items-start">
            <motion.div variants={reveal} {...inView} className="min-w-0">
              <div className="rounded-xl border border-white/10 bg-sidebar p-4 sm:p-5">
                <div className="flex items-center gap-3 mb-4">
                  {[["bg-ember", true], ["bg-lavender", true], ["bg-online", false], ["bg-amber", false]].map(([c, live], i) => (
                    <span key={i} className={`p-[2px] rounded-full ${live ? "bg-ember" : "bg-white/15"}`}>
                      <span className={`block w-10 h-10 rounded-full ${c} border-2 border-sidebar`} />
                    </span>
                  ))}
                </div>
                <div className="rounded-lg h-40 sm:h-44 bg-ember flex items-center justify-center p-5 text-center">
                  <p className="font-display text-xl font-medium text-bg">Best sunrise of the year ☀️</p>
                </div>
                <div className="flex items-center justify-between gap-3 mt-3 text-xs text-muted"><span>Disappears in 23h</span><span className="flex items-center gap-1"><CircleDashed size={12} /> Seen by 12</span></div>
              </div>
              <h3 className="font-display text-lg font-medium mt-5 mb-1">Status</h3>
              <p className="text-sm text-muted leading-relaxed max-w-sm">Text, photo or video. Choose who sees it, know who viewed it, and reply straight into the chat.</p>
            </motion.div>

            <motion.div variants={reveal} custom={2} {...inView} className="min-w-0">
              <div className="rounded-xl border border-white/10 bg-sidebar p-4 sm:p-5">
                <div className="flex items-baseline justify-between gap-3 mb-4">
                  <p className="font-display text-xl font-semibold truncate">Trip to Manali</p>
                  <p className="text-xs text-muted flex-shrink-0">28 · 4 · 13</p>
                </div>
                <div className="grid grid-cols-3 sm:grid-cols-4 grid-rows-[repeat(3,minmax(0,5.5rem))] sm:grid-rows-[repeat(2,minmax(0,6.5rem))] gap-1.5">
                  <div className="col-span-2 row-span-2 rounded-md bg-ember/35 flex items-end p-3"><span className="text-[11px] text-ink/80">Rohtang Pass</span></div>
                  <div className="rounded-md bg-lavender/30" />
                  <div className="rounded-md bg-online/25 flex items-center justify-center"><Play size={16} fill="currentColor" className="opacity-70" /></div>
                  <div className="rounded-md bg-amber/30" />
                  <div className="rounded-md bg-lavender/20 sm:col-span-1" />
                  <div className="hidden sm:block col-span-1 rounded-md bg-ember/20" />
                  <div className="hidden sm:block rounded-md bg-online/20" />
                </div>
                <p className="text-sm text-muted mt-4">28 Photos · 4 Videos · 13 Memories</p>
              </div>
              <h3 className="font-display text-lg font-medium mt-5 mb-1">Moments</h3>
              <p className="text-sm text-muted leading-relaxed max-w-md">A gallery you build together — captions, dates, written memories, shared with the chats you choose.</p>
            </motion.div>
          </div>
        </section>

        <section className="max-w-7xl mx-auto px-5 sm:px-10 pt-20 sm:pt-28">
          <Feature
            n="04"
            label="Media & files"
            title="Send what you actually need to send."
            body="Photos, videos, PDFs, ZIPs, documents — share normal files up to the server limit, then find them all later under Media, Files and Links."
            points={["Preview before you send, with captions", "Open or download with the original file name", "Everything organized in Chat Info"]}
            visual={<FileVisual />}
          />
        </section>

        <section id="privacy" className="max-w-7xl mx-auto px-5 sm:px-10 pt-20 sm:pt-28 scroll-mt-16">
          <motion.div variants={reveal} {...inView} className="border-t border-white/10 pt-10 sm:pt-14">
            <div className="grid lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] gap-6 lg:gap-20 mb-10 sm:mb-14">
              <div>
                <SectionLabel n="05">Privacy & security</SectionLabel>
                <H2>You decide who sees what.</H2>
              </div>
              <p className="text-muted text-base sm:text-lg leading-relaxed lg:self-end max-w-lg">Control who can see your photo and last seen, block anyone, and limit each Status to the people you pick.</p>
            </div>
            <div className="grid md:grid-cols-3 gap-x-10 gap-y-8">
              {[
                [ShieldCheck, "Protected accounts", "Hashed passwords, signed sessions and authenticated sockets and routes."],
                [EyeOff, "Granular privacy", "Last seen, profile photo and read receipts — each with its own audience."],
                [KeyRound, "Safe file handling", "Random file names, size limits, and executable types blocked server-side."],
              ].map(([I, t, b]) => (
                <div key={t} className="flex gap-4">
                  <I size={20} className="text-ember mt-0.5 flex-shrink-0" />
                  <div className="min-w-0">
                    <h3 className="font-display font-medium mb-1.5">{t}</h3>
                    <p className="text-sm text-muted leading-relaxed">{b}</p>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </section>

        <section className="max-w-7xl mx-auto px-5 sm:px-10 py-24 sm:py-36">
          <motion.div variants={reveal} {...inView} className="border-t border-white/10 pt-10 sm:pt-14 flex flex-col md:flex-row md:items-end md:justify-between gap-8">
            <div className="max-w-xl">
              <h2 className="font-display text-3xl sm:text-5xl font-semibold tracking-tight mb-4">Ready to talk?</h2>
              <p className="text-muted text-base sm:text-lg">Create your account and start your first conversation in seconds.</p>
            </div>
            <Link to="/register" className="inline-flex items-center justify-center gap-2 bg-ember text-bg font-medium px-7 py-3.5 rounded-lg hover:brightness-110 transition self-start md:self-auto">Get started <ArrowRight size={16} /></Link>
          </motion.div>
        </section>
      </main>

      <footer className="border-t border-white/5 py-8 px-5 sm:px-10 pb-[calc(2rem+env(safe-area-inset-bottom,0px))]">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 text-muted text-sm">
          <Logo />
          <p>© {new Date().getFullYear()} Velora. Built for real conversations.</p>
        </div>
      </footer>
    </div>
  );
};

export default Landing;
