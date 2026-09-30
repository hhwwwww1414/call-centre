'use client';

import type { CallOutcome } from '@prisma/client';
import * as React from 'react';
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { EmptyState } from '@/components/ui/misc';
import type { SeriesPoint } from '@/lib/client/types';
import { ru } from '@/lib/i18n/ru';
import { isoDayLabel, WEEKDAY_LABELS } from '@/lib/time';

/**
 * Графики читают те же CSS-переменные, что и остальной интерфейс, поэтому
 * при смене темы не остаются «светлыми пятнами» (ТЗ 1).
 */
const axisStyle = { fill: 'var(--text-muted)', fontSize: 11 };

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string }[];
  label?: string | number;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="text-2xs shadow-overlay rounded-md border border-[var(--border)] bg-[var(--popover)] px-2.5 py-2">
      {label !== undefined ? (
        <p className="mb-1 font-medium text-[var(--foreground)]">{label}</p>
      ) : null}
      {payload.map((entry) => (
        <p key={entry.name} className="flex items-center gap-1.5 text-[var(--text-secondary)]">
          <span
            className="size-2 rounded-full"
            style={{ backgroundColor: entry.color }}
            aria-hidden
          />
          {entry.name}: <span className="numeric font-medium">{entry.value}</span>
        </p>
      ))}
    </div>
  );
}

export function CallsBySeriesChart({
  series,
  granularity,
}: {
  series: SeriesPoint[];
  granularity: 'hour' | 'day';
}) {
  const data = React.useMemo(
    () =>
      series.map((point) => ({
        ...point,
        label: granularity === 'hour' ? `${point.bucket}:00` : isoDayLabel(point.bucket),
      })),
    [series, granularity],
  );

  const isEmpty = data.every((point) => point.inbound === 0 && point.outbound === 0);
  if (isEmpty) {
    return <EmptyState title={ru.dashboard.emptyCalls} hint={ru.dashboard.emptyCallsHint} />;
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -22 }}>
        <XAxis
          dataKey="label"
          tick={axisStyle}
          axisLine={{ stroke: 'var(--border)' }}
          tickLine={false}
          interval="preserveStartEnd"
          minTickGap={12}
        />
        <YAxis
          tick={axisStyle}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
          width={40}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--accent)' }} />
        <Legend
          verticalAlign="top"
          align="right"
          height={28}
          formatter={(value) => (
            <span className="text-2xs text-[var(--text-secondary)]">{value}</span>
          )}
        />
        <Bar
          dataKey="inbound"
          name={ru.dashboard.inbound}
          stackId="calls"
          fill="var(--chart-1)"
          radius={[0, 0, 0, 0]}
          maxBarSize={28}
        />
        <Bar
          dataKey="outbound"
          name={ru.dashboard.outbound}
          stackId="calls"
          fill="var(--chart-2)"
          radius={[3, 3, 0, 0]}
          maxBarSize={28}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

const OUTCOME_COLORS: Record<CallOutcome, string> = {
  DEAL: 'var(--chart-1)',
  INTERESTED: 'var(--chart-2)',
  CALLBACK: 'var(--chart-3)',
  REFUSED: 'var(--chart-4)',
  WRONG_NUMBER: 'var(--chart-6)',
  SPAM: 'var(--chart-5)',
  VOICEMAIL: 'var(--text-muted)',
  HUNG_UP: 'var(--border-strong)',
  NEW: 'var(--chart-7)',
};

export function OutcomePieChart({ data }: { data: { outcome: CallOutcome; count: number }[] }) {
  const chartData = React.useMemo(
    () =>
      data
        .filter((entry) => entry.count > 0)
        .map((entry) => ({
          name: ru.callOutcome[entry.outcome],
          value: entry.count,
          color: OUTCOME_COLORS[entry.outcome],
        }))
        .sort((a, b) => b.value - a.value),
    [data],
  );

  if (chartData.length === 0) {
    return <EmptyState title={ru.dashboard.emptyCalls} hint={ru.dashboard.emptyCallsHint} />;
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <PieChart>
        <Pie
          data={chartData}
          dataKey="value"
          nameKey="name"
          innerRadius={52}
          outerRadius={80}
          paddingAngle={2}
          stroke="var(--card)"
          strokeWidth={2}
        >
          {chartData.map((entry) => (
            <Cell key={entry.name} fill={entry.color} />
          ))}
        </Pie>
        <Tooltip content={<ChartTooltip />} />
        <Legend
          verticalAlign="bottom"
          height={48}
          formatter={(value) => (
            <span className="text-2xs text-[var(--text-secondary)]">{value}</span>
          )}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function HourLoadChart({
  hours,
}: {
  hours: { hour: number; total: number; missed: number; missedShare: number }[];
}) {
  const data = hours.map((row) => ({ ...row, label: `${String(row.hour).padStart(2, '0')}:00` }));
  if (data.every((row) => row.total === 0)) {
    return <EmptyState title={ru.analytics.empty} hint={ru.analytics.emptyHint} />;
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -22 }}>
        <XAxis
          dataKey="label"
          tick={axisStyle}
          axisLine={{ stroke: 'var(--border)' }}
          tickLine={false}
          interval={1}
        />
        <YAxis
          tick={axisStyle}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
          width={40}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--accent)' }} />
        <Legend
          verticalAlign="top"
          align="right"
          height={28}
          formatter={(value) => (
            <span className="text-2xs text-[var(--text-secondary)]">{value}</span>
          )}
        />
        <Bar
          dataKey="total"
          name={ru.common.total}
          fill="var(--chart-1)"
          radius={[3, 3, 0, 0]}
          maxBarSize={22}
        />
        <Bar
          dataKey="missed"
          name={ru.dashboard.kpiMissed}
          fill="var(--chart-4)"
          radius={[3, 3, 0, 0]}
          maxBarSize={22}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function WeekdayLoadChart({ weekdays }: { weekdays: { weekday: number; total: number }[] }) {
  // Неделя начинается с понедельника — так привычнее читать нагрузку
  const order = [1, 2, 3, 4, 5, 6, 0];
  const map = new Map(weekdays.map((row) => [row.weekday, row.total]));
  const data = order.map((weekday) => ({
    label: WEEKDAY_LABELS[weekday] ?? '',
    total: map.get(weekday) ?? 0,
  }));

  if (data.every((row) => row.total === 0)) {
    return <EmptyState title={ru.analytics.empty} hint={ru.analytics.emptyHint} />;
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -22 }}>
        <XAxis
          dataKey="label"
          tick={axisStyle}
          axisLine={{ stroke: 'var(--border)' }}
          tickLine={false}
        />
        <YAxis
          tick={axisStyle}
          axisLine={false}
          tickLine={false}
          allowDecimals={false}
          width={40}
        />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--accent)' }} />
        <Bar
          dataKey="total"
          name={ru.common.total}
          fill="var(--chart-1)"
          radius={[4, 4, 0, 0]}
          maxBarSize={44}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function MissedShareChart({
  hours,
}: {
  hours: { hour: number; total: number; missedShare: number }[];
}) {
  const data = hours
    .filter((row) => row.total > 0)
    .map((row) => ({ label: `${String(row.hour).padStart(2, '0')}:00`, share: row.missedShare }));

  if (data.length === 0) {
    return <EmptyState title={ru.analytics.empty} hint={ru.analytics.emptyHint} />;
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
        <XAxis
          dataKey="label"
          tick={axisStyle}
          axisLine={{ stroke: 'var(--border)' }}
          tickLine={false}
          interval={1}
        />
        <YAxis tick={axisStyle} axisLine={false} tickLine={false} width={44} unit="%" />
        <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--accent)' }} />
        <Bar
          dataKey="share"
          name={ru.dashboard.kpiMissedShare}
          fill="var(--chart-4)"
          radius={[3, 3, 0, 0]}
          maxBarSize={22}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
