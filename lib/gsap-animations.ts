import gsap from "gsap";

/**
 * Animates headline text words/characters with a staggered upward reveal and motion blur effect
 */
export const animateHeadlineReveal = (containerSelector: string) => {
  const elements = document.querySelectorAll(`${containerSelector} .reveal-item`);
  if (!elements || elements.length === 0) return;

  gsap.fromTo(
    elements,
    {
      opacity: 0,
      y: 40,
      filter: "blur(8px)",
      scale: 0.96,
    },
    {
      opacity: 1,
      y: 0,
      filter: "blur(0px)",
      scale: 1,
      duration: 1,
      stagger: 0.12,
      ease: "power3.out",
    }
  );
};

/**
 * Sweeping biometric laser line loop animation
 */
export const animateLaserScan = (lineElement: HTMLElement | null) => {
  if (!lineElement) return null;

  const tl = gsap.timeline({ repeat: -1, yoyo: true });
  tl.fromTo(
    lineElement,
    { top: "5%", opacity: 0.6 },
    {
      top: "90%",
      opacity: 1,
      duration: 1.8,
      ease: "power2.inOut",
    }
  );
  return tl;
};

/**
 * Staggered entrance for scanned user details & bank card
 */
export const animateDetailsReveal = (containerElement: HTMLElement | null) => {
  if (!containerElement) return;

  const items = containerElement.querySelectorAll(".detail-row");
  gsap.fromTo(
    items,
    {
      opacity: 0,
      x: -30,
      scale: 0.95,
    },
    {
      opacity: 1,
      x: 0,
      scale: 1,
      duration: 0.6,
      stagger: 0.1,
      ease: "back.out(1.4)",
    }
  );
};

/**
 * Animated checkmark SVG path draw-in for receipt screen
 */
export const animateCheckmarkDraw = (pathElement: SVGPathElement | null) => {
  if (!pathElement) return;

  const length = pathElement.getTotalLength();
  gsap.set(pathElement, {
    strokeDasharray: length,
    strokeDashoffset: length,
    opacity: 1,
  });

  gsap.to(pathElement, {
    strokeDashoffset: 0,
    duration: 0.9,
    delay: 0.2,
    ease: "power2.out",
  });
};

/**
 * Magnetic button hover effect that pulls button toward mouse cursor
 */
export const setupMagneticHover = (buttonElement: HTMLElement | null) => {
  if (!buttonElement) return () => {};

  const handleMouseMove = (e: MouseEvent) => {
    const rect = buttonElement.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    const deltaX = (e.clientX - centerX) * 0.35;
    const deltaY = (e.clientY - centerY) * 0.35;

    gsap.to(buttonElement, {
      x: deltaX,
      y: deltaY,
      duration: 0.3,
      ease: "power2.out",
    });
  };

  const handleMouseLeave = () => {
    gsap.to(buttonElement, {
      x: 0,
      y: 0,
      duration: 0.6,
      ease: "elastic.out(1, 0.4)",
    });
  };

  buttonElement.addEventListener("mousemove", handleMouseMove);
  buttonElement.addEventListener("mouseleave", handleMouseLeave);

  return () => {
    buttonElement.removeEventListener("mousemove", handleMouseMove);
    buttonElement.removeEventListener("mouseleave", handleMouseLeave);
  };
};

/**
 * Failure state shake & red glow pulse animation
 */
export const animateScanFailure = (targetElement: HTMLElement | null) => {
  if (!targetElement) return;

  const tl = gsap.timeline();
  tl.to(targetElement, {
    x: -12,
    duration: 0.08,
    repeat: 5,
    yoyo: true,
    ease: "power1.inOut",
  }).to(targetElement, {
    x: 0,
    duration: 0.1,
  });
};
