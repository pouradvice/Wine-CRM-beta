// src/components/ui/BarChart.tsx
// SVG bar chart for weekly visit trends. No external dependencies.
'use client';

import styles from './BarChart.module.css';
import type { SalespersonWeeklyTrend } from '@/types';

interface BarChartProps {
  data: SalespersonWeeklyTrend[];
  label?: string;
}

const WIDTH = 600;
const HEIGHT = 120;
const BAR_AREA_HEIGHT = 90;
const PADDING_X = 8;

export default function BarChart({ data, label }: BarChartProps) {
  if (!data.length) return null;

  const maxVal = Math.max(...data.map((d) => d.visits), 1);
  const barWidth = (WIDTH - PADDING_X * 2) / data.length;
  const gap = barWidth * 0.2;

  return (
    <figure className={styles.figure}>
      {label && <figcaption className={styles.caption}>{label}</figcaption>}
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className={styles.svg}
        aria-label={label ?? 'Weekly visit trend'}
        role="img"
      >
        {data.map((d, i) => {
          const barH = Math.max(2, Math.round((d.visits / maxVal) * BAR_AREA_HEIGHT));
          const x = PADDING_X + i * barWidth + gap / 2;
          const w = barWidth - gap;
          const y = BAR_AREA_HEIGHT - barH;
          const isLast = i === data.length - 1;
          // Label: just MM/DD
          const dateParts = d.week.split('-');
          const shortLabel = dateParts.length === 3
            ? `${dateParts[1]}/${dateParts[2]}`
            : d.week;

          return (
            <g key={d.week} className={styles.bar}>
              <title>{`Week of ${d.week}: ${d.visits} visit${d.visits !== 1 ? 's' : ''}`}</title>
              <rect
                x={x}
                y={y}
                width={w}
                height={barH}
                rx={2}
                className={isLast ? styles.rectCurrent : styles.rect}
              />
              {/* X-axis label every 4 bars to avoid crowding */}
              {i % 4 === 0 && (
                <text
                  x={x + w / 2}
                  y={HEIGHT - 2}
                  textAnchor="middle"
                  className={styles.label}
                >
                  {shortLabel}
                </text>
              )}
            </g>
          );
        })}
        {/* Baseline */}
        <line
          x1={PADDING_X}
          y1={BAR_AREA_HEIGHT}
          x2={WIDTH - PADDING_X}
          y2={BAR_AREA_HEIGHT}
          className={styles.baseline}
        />
      </svg>
    </figure>
  );
}
