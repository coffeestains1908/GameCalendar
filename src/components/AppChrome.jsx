import { useEffect, useRef, useState } from 'react';
import { Gamepad2 } from 'lucide-react';

import githubIcon from '../assets/icons/GitHub_Invertocat_White.svg';

const appVersion = import.meta.env.VITE_APP_VERSION;

export function StarWarpBackground() {
  const canvasRef = useRef(null);
  const warpDurationMin = 5000
  const warpDuratioMax = 10_000

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const context = canvas.getContext('2d');
    if (!context) return undefined;

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const center = { x: window.innerWidth / 2, y: window.innerHeight * 0.42 };
    const stars = [];
    let width = 0;
    let height = 0;
    let maxRadius = 0;
    let animationFrame = 0;
    let lastTime = performance.now();
    let hyperspaceStart = 0;
    let hyperspaceEnd = 0;
    let hyperspaceEndTimeout = 0;
    const hyperspaceFlashDuration = 720;
    const pivotVoidRadius = 34;
    const pivotVoidHyperspaceExpansion = 22;
    const pivotVoidFeather = 42;

    const randomBetween = (min, max) => min + Math.random() * (max - min);
    const easeInOut = (value) => value * value * (3 - 2 * value);

    const startHyperspace = () => {
      const now = performance.now();
      hyperspaceStart = now;
      hyperspaceEnd = hyperspaceStart + randomBetween(warpDurationMin, warpDuratioMax);
      window.dispatchEvent(new CustomEvent("hyperspace-warp-start", { detail: { duration: hyperspaceEnd - hyperspaceStart } }));
      window.clearTimeout(hyperspaceEndTimeout);
      hyperspaceEndTimeout = window.setTimeout(() => {
        window.dispatchEvent(new CustomEvent("hyperspace-warp-end"));
      }, hyperspaceEnd - hyperspaceStart);
    };

    const getHyperspaceAmount = (time) => {
      if (reducedMotion || time < hyperspaceStart || time > hyperspaceEnd) return 0;
      const duration = hyperspaceEnd - hyperspaceStart;
      const progress = (time - hyperspaceStart) / duration;
      const edge = Math.min(progress / 0.18, (1 - progress) / 0.18, 1);
      return easeInOut(Math.max(0, edge));
    };

    const getHyperspaceFlashAmount = (time) => {
      if (reducedMotion) return 0;
      const preFlashEnd = hyperspaceStart + hyperspaceFlashDuration;
      const postFlashStart = hyperspaceEnd - hyperspaceFlashDuration;
      if (time >= hyperspaceStart && time <= preFlashEnd) {
        const progress = (time - hyperspaceStart) / hyperspaceFlashDuration;
        return Math.sin((1 - progress) * Math.PI * 0.5) * 0.14;
      }
      if (time >= postFlashStart && time <= hyperspaceEnd) {
        const progress = (time - postFlashStart) / hyperspaceFlashDuration;
        return Math.sin(progress * Math.PI * 0.5) * 0.1;
      }
      return 0;
    };

    const resetStar = (star, fresh = false) => {
      star.angle = randomBetween(0, Math.PI * 2);
      star.distance = fresh ? randomBetween(12, maxRadius) : randomBetween(6, 42);
      star.speed = randomBetween(38, 105);
      star.size = randomBetween(0.65, 1.55);
      star.interval = randomBetween(2.4, 7.2);
      star.offset = randomBetween(0, star.interval);
      star.tint = Math.random() > 0.62 ? '181, 220, 255' : '244, 247, 251';
    };

    const resize = () => {
      const ratio = Math.min(window.devicePixelRatio || 1, 2);
      width = window.innerWidth;
      height = window.innerHeight;
      maxRadius = Math.hypot(width, height);
      center.x = width / 2;
      center.y = height * 0.42;
      canvas.width = Math.floor(width * ratio);
      canvas.height = Math.floor(height * ratio);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      if (stars.length === 0) {
        const count = Math.min(190, Math.max(105, Math.floor((width * height) / 6200)));
        for (let index = 0; index < count; index += 1) {
          const star = {};
          resetStar(star, true);
          stars.push(star);
        }
      }
    };

    const drawStar = (star, elapsedSeconds, deltaSeconds, hyperspaceAmount) => {
      if (!reducedMotion) {
        const warpSpeed = 1 + hyperspaceAmount * 8;
        star.distance += star.speed * deltaSeconds * warpSpeed * (1 + star.distance / maxRadius);
      }

      const x = center.x + Math.cos(star.angle) * star.distance;
      const y = center.y + Math.sin(star.angle) * star.distance;
      if (x < -90 || x > width + 90 || y < -90 || y > height + 90) {
        resetStar(star);
        return;
      }

      const cycle = (elapsedSeconds + star.offset) % star.interval;
      const burst = cycle < 0.34 ? 1 - cycle / 0.34 : 0;
      const depth = Math.min(1, star.distance / maxRadius);
      const opacity = Math.min(1, 0.3 + depth * 0.56 + hyperspaceAmount * 0.2);
      const size = star.size + depth * 1.4 + hyperspaceAmount * 0.4;

      if ((burst > 0.02 || hyperspaceAmount > 0.02) && !reducedMotion) {
        const lineLength = 20 + depth * 72 + burst * 68 + hyperspaceAmount * (130 + depth * 260);
        const tailX = x - Math.cos(star.angle) * lineLength;
        const tailY = y - Math.sin(star.angle) * lineLength;
        const gradient = context.createLinearGradient(tailX, tailY, x, y);
        gradient.addColorStop(0, `rgba(${star.tint}, ${0.2 + burst * 0.54})`);
        gradient.addColorStop(0.34, `rgba(${star.tint}, ${0.1 + burst * 0.28})`);
        gradient.addColorStop(1, `rgba(${star.tint}, 0)`);
        context.strokeStyle = gradient;
        context.lineWidth = 0.7 + burst * 1.25 + hyperspaceAmount * 1.7;
        context.beginPath();
        context.moveTo(tailX, tailY);
        context.lineTo(x, y);
        context.stroke();
      }

      context.fillStyle = `rgba(${star.tint}, ${opacity})`;
      context.beginPath();
      context.arc(x, y, size, 0, Math.PI * 2);
      context.fill();
    };

    const drawPivotVoid = (hyperspaceAmount) => {
      const radius = pivotVoidRadius + hyperspaceAmount * pivotVoidHyperspaceExpansion;
      const featheredRadius = radius + pivotVoidFeather;
      const gradient = context.createRadialGradient(
        center.x,
        center.y,
        radius * 0.2,
        center.x,
        center.y,
        featheredRadius,
      );
      gradient.addColorStop(0, 'rgba(5, 7, 11, 0.96)');
      gradient.addColorStop(0.48, 'rgba(5, 7, 11, 0.82)');
      gradient.addColorStop(1, 'rgba(5, 7, 11, 0)');

      context.fillStyle = gradient;
      context.beginPath();
      context.arc(center.x, center.y, featheredRadius, 0, Math.PI * 2);
      context.fill();
    };

    const render = (time) => {
      const deltaSeconds = Math.min((time - lastTime) / 1000, 0.05);
      const elapsedSeconds = time / 1000;
      lastTime = time;

      const hyperspaceAmount = getHyperspaceAmount(time);
      const hyperspaceFlashAmount = getHyperspaceFlashAmount(time);
      context.clearRect(0, 0, width, height);
      context.globalCompositeOperation = 'screen';
      stars.forEach((star) => drawStar(star, elapsedSeconds, deltaSeconds, hyperspaceAmount));
      context.globalCompositeOperation = 'source-over';
      drawPivotVoid(hyperspaceAmount);
      if (hyperspaceFlashAmount > 0) {
        context.fillStyle = "rgba(181, 220, 255, " + hyperspaceFlashAmount + ")";
        context.fillRect(0, 0, width, height);
      }

      animationFrame = window.requestAnimationFrame(render);
    };

    resize();
    window.addEventListener('resize', resize);
    const hyperspaceInterval = reducedMotion ? 0 : window.setInterval(startHyperspace, 50_000);
    animationFrame = window.requestAnimationFrame(render);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      if (hyperspaceInterval) window.clearInterval(hyperspaceInterval);
      window.clearTimeout(hyperspaceEndTimeout);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return <canvas className="star-warp-canvas" ref={canvasRef} aria-hidden="true" />;
}

export function WarpChargeIndicator() {
  const [chargePercent, setChargePercent] = useState(0);
  const [warping, setWarping] = useState(false);

  useEffect(() => {
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    let chargeStartedAt = performance.now();
    const warpingRef = { current: false };
    let animationFrame = 0;
    let chargeInterval = 0;

    const updateCharge = () => {
      if (warpingRef.current) {
        setChargePercent(100);
        if (!reducedMotion) animationFrame = window.requestAnimationFrame(updateCharge);
        return;
      }
      const elapsed = performance.now() - chargeStartedAt;
      setChargePercent(Math.min(100, (elapsed / 50_000) * 100));
      if (!reducedMotion) animationFrame = window.requestAnimationFrame(updateCharge);
    };

    const updateReducedCharge = () => {
      const elapsed = performance.now() - chargeStartedAt;
      setChargePercent(Math.min(100, (elapsed / 50_000) * 100));
    };

    const onWarpStart = () => {
      warpingRef.current = true;
      setWarping(true);
      setChargePercent(100);
    };

    const onWarpEnd = () => {
      chargeStartedAt = performance.now();
      warpingRef.current = false;
      setWarping(false);
      setChargePercent(0);
    };

    window.addEventListener("hyperspace-warp-start", onWarpStart);
    window.addEventListener("hyperspace-warp-end", onWarpEnd);

    if (reducedMotion) {
      updateReducedCharge();
      chargeInterval = window.setInterval(updateReducedCharge, 1000);
    } else {
      animationFrame = window.requestAnimationFrame(updateCharge);
    }

    return () => {
      window.removeEventListener("hyperspace-warp-start", onWarpStart);
      window.removeEventListener("hyperspace-warp-end", onWarpEnd);
      window.cancelAnimationFrame(animationFrame);
      window.clearInterval(chargeInterval);
    };
  }, []);

  const chargeCount = 10
  const chargedSegments = warping ? chargeCount : Math.min(chargeCount, Math.floor(chargePercent / (100 / chargeCount)));

  return (
    <aside className={warping ? "warp-charge is-warping" : "warp-charge"} aria-label="Faster Than Light warp charge">
      <span className="warp-charge-label">FTL Warp</span>
      <div className="warp-charge-segments" aria-hidden="true">
        {Array.from({ length: chargeCount }, (_, index) => (
          <span className={index < chargedSegments ? "warp-charge-segment is-filled" : "warp-charge-segment"} key={index} />
        ))}
      </div>
    </aside>
  );
}

export function CreditFooter() {
  return (
    <footer className="public-footer">
      <a className="footer-source-link" href="https://github.com/coffeestains1908/GameCalendar" target="_blank" rel="noreferrer">
        <strong>v{appVersion}</strong>
        <span className="footer-source-label">
          <span aria-hidden="true">|</span>
          <span>This project is open sourced</span>
        </span>
        <img src={githubIcon} alt="" />
      </a>
    </footer>
  );
}

export function SetupMissing() {
  return (
    <main className="setup-shell">
      <section className="setup-panel">
        <Gamepad2 size={36} />
        <h1>Firebase setup needed</h1>
        <p>
          Create a <code>.env</code> file from <code>.env.example</code> and fill in the Firebase
          web app values before running the calendar.
        </p>
      </section>
    </main>
  );
}

export function FormError({ title, detail, actionUrl, actionLabel }) {
  return (
    <div className="form-error">
      <strong>{title}</strong>
      <p>{detail}</p>
      {actionUrl && (
        <a href={actionUrl} target="_blank" rel="noreferrer">
          {actionLabel}
        </a>
      )}
    </div>
  );
}

export function StatePanel({ icon, title, detail, actionUrl, actionLabel }) {
  return (
    <section className="state-panel">
      {icon}
      <h2>{title}</h2>
      {detail && <p>{detail}</p>}
      {actionUrl && (
        <a className="state-action" href={actionUrl} target="_blank" rel="noreferrer">
          {actionLabel}
        </a>
      )}
    </section>
  );
}
