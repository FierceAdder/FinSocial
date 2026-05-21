import { useMemo } from 'react';
import { buildLandingDeckSlides } from '../pages/landingDeckSlides.jsx';

/**
 * Scrollable landing sections for small viewports (reuses deck slide content).
 * @param {{
 *   isAuthenticated: boolean,
 *   openFaq: number | null,
 *   setOpenFaq: (v: number | null) => void,
 *   Reveal: import('react').ComponentType<{
 *     id?: string,
 *     className?: string,
 *     delay?: number,
 *     children: import('react').ReactNode,
 *   }>,
 * }} props
 */
export default function LandingMobileSections({
  isAuthenticated,
  openFaq,
  setOpenFaq,
  Reveal,
}) {
  const slides = useMemo(
    () => buildLandingDeckSlides({ isAuthenticated, openFaq, setOpenFaq }),
    [isAuthenticated, openFaq, setOpenFaq],
  );

  return (
    <div className="landing-mobile">
      {slides.map((slide, index) => (
        <Reveal
          key={slide.id}
          id={slide.id}
          className={`landing-mobile-section landing-mobile-section--${slide.id}`}
          delay={Math.min(index * 40, 160)}
        >
          <header className="landing-mobile-section__head">
            <p className="landing-kicker mono">{slide.kicker}</p>
            <h2 className="landing-section-title">{slide.title}</h2>
            {slide.hint ? (
              <p className="landing-section-sub">{slide.hint}</p>
            ) : null}
          </header>
          <div className={`landing-mobile-section__body landing-mobile-section__body--${slide.id}`}>
            {slide.children}
          </div>
        </Reveal>
      ))}
    </div>
  );
}
