import { Suspense, useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { Canvas } from '@react-three/fiber';
import {
  Cpu,
  Zap,
  Shield,
  BarChart3,
  ArrowRight,
} from 'lucide-react';
import useStore from '../store';
import { APP_BASE } from '../constants/routes';
import LandingSceneContent from './LandingScene.jsx';
import { LandingScrollYRef } from './landingScrollContext.jsx';
import { LANDING_HEADER_SECTIONS } from './landingSections.js';
import { useLandingSectionSpy } from '../hooks/useLandingSectionSpy';
import { useLandingDeckScroll } from '../hooks/useLandingDeckScroll.js';
import { useMobileLanding } from '../hooks/useMobileLanding.js';
import LandingPresentationDeck from '../components/LandingPresentationDeck.jsx';
import LandingPanel from '../components/LandingPanel.jsx';
import LandingMobileSections from '../components/LandingMobileSections.jsx';
import { buildLandingDeckSlides } from './landingDeckSlides.jsx';
import { LANDING_PINNED_SECTIONS } from './landingSections.js';

const MARQUEE_ITEMS = [
  { text: 'NIFTY 50 ▲ simulated' },
  { text: 'Portfolio P&L live', className: 'positive' },
  { text: 'ML signals' },
  { text: 'News & AI briefs' },
  { text: 'Live tribes' },
  { text: 'Paper ₹10L' },
];

function MarqueeStripContent({ idPrefix = '' }) {
  return MARQUEE_ITEMS.map((item) => (
    <span key={`${idPrefix}${item.text}`} className={item.className}>
      {item.text}
      <span className="landing-marquee-sep" aria-hidden> · </span>
    </span>
  ));
}

/** Two copies in one row; CSS -50% = one copy width (animates after fonts load). */

function LandingMarquee() {
  const [animate, setAnimate] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const start = () => {
      if (!cancelled) setAnimate(true);
    };
    if (document.fonts?.ready) {
      document.fonts.ready.then(start).catch(start);
    } else {
      start();
    }
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="landing-marquee mono" aria-hidden>
      <div className="landing-marquee-track">
        <div
          className={`landing-marquee-strip${animate ? ' landing-marquee-strip--animate' : ''}`}
        >
          <div className="landing-marquee-copy">
            <MarqueeStripContent idPrefix="a-" />
          </div>
          <div className="landing-marquee-copy" aria-hidden>
            <MarqueeStripContent idPrefix="b-" />
          </div>
        </div>
      </div>
    </div>
  );
}

function SceneFallback() {
  return (
    <div
      style={{
        height: '100%',
        background: 'linear-gradient(160deg, #ffffff 0%, #fafbfc 50%, #f8f9fa 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#868e96',
        fontSize: '0.85rem',
      }}
    >
      Loading…
    </div>
  );
}

function Reveal({ children, className = '', delay = 0, id }) {
  const ref = useRef(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setOn(true);
        });
      },
      { rootMargin: '0px 0px -40px 0px', threshold: 0.08 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      id={id}
      ref={ref}
      className={`landing-reveal-wrap ${className}`}
      data-visible={on}
      style={{ transitionDelay: on ? `${delay}ms` : '0ms' }}
    >
      {children}
    </div>
  );
}

function AnimatedStat({ value, label, suffix = '', prefix = '' }) {
  const ref = useRef(null);
  const [n, setN] = useState(0);
  const [go, setGo] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) setGo(true);
    }, { threshold: 0.2 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!go) return;
    const duration = 1100;
    const start = performance.now();
    const step = (t) => {
      const k = Math.min(1, (t - start) / duration);
      const eased = 1 - (1 - k) ** 3;
      setN(Math.floor(value * eased));
      if (k < 1) requestAnimationFrame(step);
      else setN(value);
    };
    requestAnimationFrame(step);
  }, [go, value]);

  return (
    <div ref={ref} className="landing-stat-pill mono">
      <span className="landing-stat-value">
        {prefix}
        {n.toLocaleString('en-IN')}
        {suffix}
      </span>
      <span className="landing-stat-label">{label}</span>
    </div>
  );
}

export default function Landing() {
  const isAuthenticated = useStore((s) => s.isAuthenticated);
  const isMobileLanding = useMobileLanding();
  const [scrolledNav, setScrolledNav] = useState(false);
  const [deckActiveId, setDeckActiveId] = useState('hub');
  const [inDeck, setInDeck] = useState(false);

  const scrollSpySections = useMemo(
    () => (isMobileLanding
      ? [
        { id: 'hero' },
        { id: 'trust' },
        ...LANDING_PINNED_SECTIONS.map((s) => ({ id: s.id })),
      ]
      : [
        { id: 'hero' },
        { id: 'trust' },
        { id: 'explore' },
      ]),
    [isMobileLanding],
  );

  const scrollSpyId = useLandingSectionSpy(scrollSpySections);
  const activeSectionId = isMobileLanding
    ? scrollSpyId
    : (inDeck ? deckActiveId : scrollSpyId);
  const landingScrollYRef = useRef(0);

  const { scrollToSlideId } = useLandingDeckScroll(
    deckActiveId,
    setDeckActiveId,
    setInDeck,
    !isMobileLanding,
  );

  useEffect(() => {
    const prevRestoration = history.scrollRestoration;
    history.scrollRestoration = 'manual';

    document.body.dataset.page = 'landing';
    document.body.style.overflow = 'auto';
    document.documentElement.style.setProperty('--landing-parallax-y', '0px');
    document.documentElement.style.setProperty('--landing-parallax-x', '0px');
    document.documentElement.style.setProperty('--landing-parallax-scale', '1');
    return () => {
      history.scrollRestoration = prevRestoration;
      delete document.body.dataset.page;
      document.body.style.overflow = 'hidden';
      document.documentElement.style.removeProperty('--landing-parallax-y');
      document.documentElement.style.removeProperty('--landing-parallax-x');
      document.documentElement.style.removeProperty('--landing-parallax-scale');
    };
  }, []);

  const onScroll = useCallback(() => {
    const y = window.scrollY || 0;
    landingScrollYRef.current = y;
    setScrolledNav(y > 32);
    const doc = document.documentElement;
    const max = Math.max(1, doc.scrollHeight - window.innerHeight);
    const prog = max > 0 ? y / max : 0;
    doc.style.setProperty('--landing-parallax-y', `${y * -0.068}px`);
    doc.style.setProperty('--landing-parallax-x', `${Math.sin(prog * Math.PI) * 10}px`);
    doc.style.setProperty('--landing-parallax-scale', String(1 + prog * 0.045));
  }, []);

  useEffect(() => {
    window.addEventListener('scroll', onScroll, { passive: true });
    const id = requestAnimationFrame(() => {
      onScroll();
    });
    return () => {
      cancelAnimationFrame(id);
      window.removeEventListener('scroll', onScroll);
    };
  }, [onScroll]);

  const [openFaq, setOpenFaq] = useState(/** @type {number | null} */ (null));

  const deckSlides = useMemo(
    () => (isMobileLanding
      ? []
      : buildLandingDeckSlides({ isAuthenticated, openFaq, setOpenFaq })),
    [isAuthenticated, isMobileLanding, openFaq],
  );

  return (
    <LandingScrollYRef.Provider value={landingScrollYRef}>
    <div className={`landing-root${isMobileLanding ? ' landing-root--mobile' : ''}`}>
      <div className="landing-canvas-wrap" aria-hidden>
        <div className="landing-canvas-parallax-stack">
          <Suspense fallback={<SceneFallback />}>
            <Canvas
              dpr={[1, 2]}
              camera={{ position: [0.45, 0.35, 8.6], fov: 42, near: 0.1, far: 80 }}
              gl={{ alpha: false, antialias: true, powerPreference: 'high-performance' }}
            >
              <LandingSceneContent />
            </Canvas>
          </Suspense>
          <div className="landing-canvas-overlay" />
        </div>
      </div>

      <header className={`landing-header ${scrolledNav ? 'landing-header-scrolled' : ''}`}>
        <Link to="/" className="landing-logo-link">
          <svg viewBox="0 0 28 28" fill="none" width="28" height="28" aria-hidden>
            <rect width="28" height="28" rx="6" fill="#f8fafc" />
            <path d="M7 20V12l5-4v12M16 20V8l5-4v16" stroke="#0f172a" strokeWidth="2" strokeLinecap="round" />
          </svg>
          FinSocial
        </Link>

        <nav className="landing-nav-center mono" aria-label="Page sections">
          {LANDING_HEADER_SECTIONS.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              className={`landing-anchor${activeSectionId === section.id ? ' landing-anchor--active' : ''}`}
              aria-current={activeSectionId === section.id ? 'true' : undefined}
            >
              {section.headerLabel}
            </a>
          ))}
        </nav>

        <nav className="landing-nav">
          {isAuthenticated ? (
            <Link to={APP_BASE} className="btn btn-primary landing-cta-main">Open app</Link>
          ) : (
            <>
              <Link to="/auth" className="landing-link">Sign in</Link>
              <Link to="/auth" className="btn btn-primary landing-cta-main">Get started</Link>
            </>
          )}
        </nav>
      </header>

      <main className="landing-main">
        <section id="hero" className="landing-hero-stack landing-snap-hero">
          <div className="landing-hero-copy">
            <p className="landing-kicker mono">India · simulated investing · social edge</p>
            <h1 className="landing-headline">
              Trade together.
              {' '}
              <span className="landing-accent">Grow smarter.</span>
            </h1>
            <p className="landing-lead">
              A community-first paper-trading desk: tribe rooms, Q&amp;A, signals, news, and portfolios together.
              A live candlestick backdrop stays visible as you scroll, and the navigation stays at hand so context never slips away.
            </p>

            <div className="landing-hero-actions">
              {isAuthenticated ? (
                <Link to={APP_BASE} className="btn btn-primary landing-hero-primary">Continue to dashboard</Link>
              ) : (
                <Link to="/auth" className="btn btn-primary landing-hero-primary">Create free account</Link>
              )}
              <a className="landing-ghost-link" href="#hub">
                Explore features <ArrowRight size={14} aria-hidden />
              </a>
            </div>

            <LandingMarquee />

            <div className="landing-hero-metrics">
              <AnimatedStat value={1000000} prefix="₹" label="Starting paper balance" />
              <AnimatedStat value={560} suffix="+" label="Trading days of history (≈2y)" />
              <AnimatedStat value={5} suffix=" min" label="Typical signal refresh" />
              <AnimatedStat value={30} suffix=" min" label="Typical news refresh" />
            </div>
          </div>

          <p
            className={`landing-scroll-hint mono${scrolledNav ? ' landing-scroll-hint--hidden' : ''}`}
            aria-hidden={scrolledNav}
          >
            Scroll
            {' '}
            <span className="landing-scroll-bounce">↓</span>
          </p>
        </section>

        <section id="trust" className="landing-trust">
          <Reveal>
            <div>
              <p className="landing-trust-title mono">Built for clarity and momentum</p>
              <div className="landing-trust-pills">
                <span><Shield size={14} aria-hidden /> Secure sessions</span>
                <span><Cpu size={14} aria-hidden /> Reliable price pipeline</span>
                <span><Zap size={14} aria-hidden /> Live updates</span>
                <span><BarChart3 size={14} aria-hidden /> Charts from days to ~2 years</span>
              </div>
            </div>
          </Reveal>
        </section>


        {isMobileLanding ? (
          <LandingMobileSections
            isAuthenticated={isAuthenticated}
            openFaq={openFaq}
            setOpenFaq={setOpenFaq}
            Reveal={Reveal}
          />
        ) : (
          <LandingPanel id="explore" pinned className="landing-deck-panel">
            <LandingPresentationDeck
              slides={deckSlides}
              activeId={deckActiveId}
              onSelect={(id) => scrollToSlideId(id, 'smooth')}
            />
          </LandingPanel>
        )}

        <footer className="landing-footer mono">
          <div className="landing-footer-links">
            <Link to="/" className="landing-footer-link">Home</Link>
            <a href="#faq" className="landing-footer-link">FAQ</a>
            {isAuthenticated ? (
              <Link to={`${APP_BASE}/forum`} className="landing-footer-link">Forum →</Link>
            ) : (
              <Link to="/auth" className="landing-footer-link">Forum (sign in) →</Link>
            )}
          </div>
          <span>© {new Date().getFullYear()} FinSocial</span>
          <Link to="/auth" className="landing-footer-link">Sign in →</Link>
        </footer>
      </main>
    </div>
    </LandingScrollYRef.Provider>
  );
}
