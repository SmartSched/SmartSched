// A small ring of dots that pops out from a point and fades: the quiet celebration for clearing a group.
// Plain DOM so it can fire from anywhere and outlive the element that was clicked (that row may be gone).
let lastPoint: { x: number; y: number } | null = null;

// Where the last checkbox was pressed, so the burst can come from there.
export function rememberPoint(x: number, y: number) {
  lastPoint = { x, y };
}

const COLORS = ['var(--ss-accent400)', '#fbbf24', '#f472b6', 'var(--ss-accent600)', '#34d399'];

export function burst(point = lastPoint) {
  if (!point || typeof document === 'undefined') return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const layer = document.createElement('div');
  layer.setAttribute('aria-hidden', 'true');
  Object.assign(layer.style, { position: 'fixed', left: `${point.x}px`, top: `${point.y}px`, pointerEvents: 'none', zIndex: '1500' });
  const count = 10;
  for (let i = 0; i < count; i++) {
    const dot = document.createElement('span');
    const angle = (i / count) * Math.PI * 2 + Math.random() * 0.3;
    const distance = 22 + Math.random() * 14;
    const size = 5 + Math.random() * 3;
    Object.assign(dot.style, {
      position: 'absolute',
      left: `${-size / 2}px`,
      top: `${-size / 2}px`,
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: i % 3 === 0 ? '2px' : '50%',
      background: COLORS[i % COLORS.length],
    });
    dot.animate(
      [
        { transform: 'translate(0, 0) scale(0.4)', opacity: 1 },
        { transform: `translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance}px) scale(1)`, opacity: 1, offset: 0.6 },
        { transform: `translate(${Math.cos(angle) * distance * 1.2}px, ${Math.sin(angle) * distance * 1.2 + 6}px) scale(0.6)`, opacity: 0 },
      ],
      { duration: 650, easing: 'cubic-bezier(.2,.8,.3,1)', fill: 'forwards' },
    );
    layer.appendChild(dot);
  }
  document.body.appendChild(layer);
  window.setTimeout(() => layer.remove(), 700);
}
