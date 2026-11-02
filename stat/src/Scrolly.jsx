import { useEffect, useRef, useState } from 'react';

// Sticky visual + text steps. children(activeIndex) renders the visual.
export default function Scrolly({ steps, children }) {
  const [active, setActive] = useState(0);
  const refs = useRef([]);

  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((e) => {
          if (e.isIntersecting) setActive(Number(e.target.dataset.i));
        }),
      { rootMargin: '-65% 0px -30% 0px' }
    );
    refs.current.forEach((el) => el && io.observe(el));
    return () => io.disconnect();
  }, [steps.length]);

  return (
    <section className="scrolly">
      <div className="scrolly-visual">{children(active)}</div>
      <div className="scrolly-steps">
        {steps.map((text, i) => (
          <p
            key={i}
            data-i={i}
            ref={(el) => (refs.current[i] = el)}
            className={`step ${i === active ? 'on' : ''}`}
          >
            {text}
          </p>
        ))}
      </div>
    </section>
  );
}