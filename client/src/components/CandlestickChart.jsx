import { useMemo, useRef, useEffect, useState } from 'react';

/** Bucket OHLC rows so each candle has at least minSlotPx horizontal space. */
function resampleCandlesForWidth(candles, innerW, minSlotPx = 4) {
  const maxBars = Math.max(Math.floor(innerW / minSlotPx), 48);
  if (candles.length <= maxBars) return candles;
  const out = [];
  for (let g = 0; g < maxBars; g++) {
    const start = Math.floor((g * candles.length) / maxBars);
    const end = Math.floor(((g + 1) * candles.length) / maxBars);
    const slice = candles.slice(start, Math.max(end, start + 1));
    const first = slice[0];
    const last = slice[slice.length - 1];
    out.push({
      ...last,
      open: first.open,
      close: last.close,
      high: Math.max(...slice.map((c) => c.high)),
      low: Math.min(...slice.map((c) => c.low)),
      date: last.date,
    });
  }
  return out;
}

/** OHLC candles: date (label string), open, high, low, close */
export default function CandlestickChart({
  data = [],
  height = 280,
  markDate = null,
  markIndex = -1,
  markLabel = 'Trade',
  maxXLabels = 8,
  chartKey = '',
  compact = false,
}) {
  const wrapRef = useRef(null);
  const [width, setWidth] = useState(640);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const measure = () => setWidth(Math.max(el.offsetWidth || 640, 200));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const candles = useMemo(
    () =>
      (Array.isArray(data) ? data : []).filter(
        (d) => d && Number.isFinite(d.high) && Number.isFinite(d.low) && Number.isFinite(d.open) && Number.isFinite(d.close),
      ),
    [data],
  );

  const [hoverIdx, setHoverIdx] = useState(null);

  const layout = useMemo(() => {
    if (!candles.length) return null;
    const pl = compact ? 4 : 12;
    const pr = compact ? 4 : 8;
    const pt = compact ? 6 : 12;
    const pb = compact ? 20 : 36;
    const innerW = Math.max(width - pl - pr, 80);
    const innerH = height - pt - pb;
    const minSlotPx = compact ? 5 : 3.5;
    const displayCandles = resampleCandlesForWidth(candles, innerW, minSlotPx);
    let min = Infinity;
    let max = -Infinity;
    displayCandles.forEach((c) => {
      min = Math.min(min, c.low);
      max = Math.max(max, c.high);
    });
    const span = max - min;
    const pad = span > 0 ? span * 0.06 : Math.abs(min) * 0.02 || 1;
    const yMin = min - pad;
    const yMax = max + pad;
    const n = displayCandles.length;
    const slot = innerW / n;
    const bw = Math.min(Math.max(slot * 0.68, 2), Math.min(14, slot * 0.82));
    const flushCandles = compact && n > 1;
    const candleStep = flushCandles ? (innerW - bw) / (n - 1) : slot;
    const candleCenterX = (i) =>
      (flushCandles ? pl + bw / 2 + i * candleStep : pl + (i + 0.5) * slot);
    const toY = (v) => pt + innerH - ((Number(v) - yMin) / (yMax - yMin || 1)) * innerH;
    const markIx =
      markIndex >= 0 && markIndex < candles.length
        ? Math.min(Math.floor((markIndex / candles.length) * n), n - 1)
        : markDate
          ? displayCandles.findIndex((c) => c.date === markDate)
          : -1;

    const labelStep = Math.max(1, Math.ceil(n / Math.max(4, Math.min(maxXLabels, Math.floor(innerW / 52)))));
    const xLabelIndices = [];
    for (let i = 0; i < n; i += labelStep) xLabelIndices.push(i);
    if (n > 1 && (!xLabelIndices.length || xLabelIndices[xLabelIndices.length - 1] !== n - 1)) {
      if (xLabelIndices[xLabelIndices.length - 1] !== n - 1) xLabelIndices.push(n - 1);
    }

    return {
      yMin,
      yMax,
      pl,
      pr,
      pt,
      pb,
      innerW,
      innerH,
      slot,
      bw,
      flushCandles,
      candleStep,
      candleCenterX,
      toY,
      n,
      markIx,
      xLabelIndices,
      displayCandles,
    };
  }, [candles, width, height, markDate, markIndex, maxXLabels, compact]);

  const onMove = (e) => {
    if (!layout) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    let ix;
    if (layout.flushCandles && layout.n > 1) {
      ix = Math.round((x - layout.pl - layout.bw / 2) / layout.candleStep);
    } else {
      ix = Math.floor((x - layout.pl) / layout.slot);
    }
    if (ix >= 0 && ix < layout.n) setHoverIdx(ix);
    else setHoverIdx(null);
  };

  const tipIdx = hoverIdx;

  if (!layout || !candles.length) {
    return (
      <div
        style={{
          height,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text3)',
          fontSize: '0.85rem',
        }}
      >
        No OHLC history to chart
      </div>
    );
  }

  const { pl, pt, innerH, innerW, slot, bw, candleCenterX, toY, markIx, xLabelIndices, displayCandles } = layout;
  const axisColor = 'var(--text3, #888)';
  const fontPx = Math.min(10, Math.max(8, slot * 0.35));

  return (
    <div ref={wrapRef} style={{ width: '100%', height, position: 'relative' }}>
      <svg key={chartKey || data.length} width={width} height={height} style={{ display: 'block' }} onMouseMove={onMove} onMouseLeave={() => setHoverIdx(null)}>
        <line x1={pl} y1={pt + innerH} x2={pl + innerW} y2={pt + innerH} stroke={axisColor} strokeWidth={1} opacity={0.85} />

        {[0.25, 0.5, 0.75].map((t) => {
          const gy = pt + innerH * (1 - t);
          return (
            <line key={t} x1={pl} x2={pl + innerW} y1={gy} y2={gy} stroke="var(--border)" strokeDasharray="4 6" opacity={0.6} />
          );
        })}

        {xLabelIndices.map((i) => {
          const x = candleCenterX(i);
          const label = displayCandles[i]?.date || '';
          return (
            <text
              key={`xlab-${i}`}
              x={Math.min(pl + innerW - 2, Math.max(pl + 2, x))}
              y={height - 6}
              textAnchor={i === 0 ? 'start' : i === displayCandles.length - 1 ? 'end' : 'middle'}
              fill={axisColor}
              fontSize={fontPx}
              style={{ pointerEvents: 'none' }}
            >
              {label}
            </text>
          );
        })}

        {displayCandles.map((c, i) => {
          const cx = candleCenterX(i);
          const yHigh = toY(c.high);
          const yLow = toY(c.low);
          const yOpen = toY(c.open);
          const yClose = toY(c.close);
          const top = Math.min(yOpen, yClose);
          const bot = Math.max(yOpen, yClose);
          const bull = c.close >= c.open;
          const col = bull ? '#16a34a' : '#dc2626';
          const bodyH = Math.max(bot - top, 1.5);
          return (
            <g key={`${i}-${c.date}`}>
              <line x1={cx} x2={cx} y1={yHigh} y2={yLow} stroke={col} strokeWidth={1.25} />
              <rect
                x={cx - bw / 2}
                y={top}
                width={bw}
                height={bodyH}
                fill={bull ? 'rgba(22,163,74,0.25)' : 'rgba(220,38,38,0.3)'}
                stroke={col}
                strokeWidth={1.25}
                rx={1}
              />
            </g>
          );
        })}

        {markIx >= 0 && (
          <g>
            <line
              x1={candleCenterX(markIx)}
              x2={candleCenterX(markIx)}
              y1={pt}
              y2={pt + innerH}
              stroke="#dc2626"
              strokeWidth={1}
              strokeDasharray="5 5"
              opacity={0.9}
            />
            <text x={candleCenterX(markIx) + 4} y={pt + 14} fill="#dc2626" fontSize={10} fontWeight={600}>
              {markLabel}
            </text>
          </g>
        )}
      </svg>
      {tipIdx != null && displayCandles[tipIdx] && (
        <div
          style={{
            position: 'absolute',
            left: Math.min(Math.max(candleCenterX(tipIdx) - 70, 4), width - 148),
            top: 6,
            background: 'var(--card, #fff)',
            border: '1px solid var(--border)',
            borderRadius: 8,
            padding: '6px 10px',
            fontSize: 11,
            pointerEvents: 'none',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            zIndex: 2,
          }}
        >
          <div style={{ fontWeight: 700, marginBottom: 4 }}>{displayCandles[tipIdx].date}</div>
          <div className="mono">O {displayCandles[tipIdx].open?.toFixed(2)} H {displayCandles[tipIdx].high?.toFixed(2)}</div>
          <div className="mono">L {displayCandles[tipIdx].low?.toFixed(2)} C {displayCandles[tipIdx].close?.toFixed(2)}</div>
        </div>
      )}
    </div>
  );
}
