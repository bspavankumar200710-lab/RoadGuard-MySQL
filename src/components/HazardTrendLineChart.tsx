import React, { useMemo, useState } from 'react';
import { RoadHazardRecord } from '../types/detection';
import { TrendingUp, AlertCircle, ArrowUpRight, ArrowDownRight, Minus, Calendar } from 'lucide-react';

interface HazardTrendLineChartProps {
  detections: RoadHazardRecord[];
  className?: string;
}

interface DayData {
  date: Date;
  dateKey: string;
  dayLabel: string;
  dateDisplay: string;
  total: number;
  potholes: number;
  speeds: number;
  other: number;
}

export const HazardTrendLineChart: React.FC<HazardTrendLineChartProps> = ({
  detections,
  className = '',
}) => {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [activeMetric, setActiveMetric] = useState<'total' | 'potholes' | 'speeds'>('total');

  // Compute daily trend for the last 7 days (today and preceding 6 days)
  const daysData = useMemo<DayData[]>(() => {
    const list: DayData[] = [];
    const now = new Date();

    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      d.setHours(0, 0, 0, 0);

      const dayLabel = i === 0 ? 'Today' : d.toLocaleDateString('en-US', { weekday: 'short' });
      const dateDisplay = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const dateKey = `${year}-${month}-${day}`;

      list.push({
        date: d,
        dateKey,
        dayLabel,
        dateDisplay,
        total: 0,
        potholes: 0,
        speeds: 0,
        other: 0,
      });
    }

    // Populate counts from detections
    for (const record of detections) {
      if (!record.timestamp) continue;
      const recDate = new Date(record.timestamp);
      if (isNaN(recDate.getTime())) continue;

      const y = recDate.getFullYear();
      const m = String(recDate.getMonth() + 1).padStart(2, '0');
      const day = String(recDate.getDate()).padStart(2, '0');
      const key = `${y}-${m}-${day}`;

      const matchedDay = list.find((item) => item.dateKey === key);
      if (matchedDay) {
        matchedDay.total += 1;
        if (record.type === 'pothole') {
          matchedDay.potholes += 1;
        } else if (record.type === 'vehicle_speed') {
          matchedDay.speeds += 1;
        } else {
          matchedDay.other += 1;
        }
      }
    }

    return list;
  }, [detections]);

  // Metric value helper
  const getVal = (d: DayData) => {
    if (activeMetric === 'potholes') return d.potholes;
    if (activeMetric === 'speeds') return d.speeds;
    return d.total;
  };

  const values = daysData.map(getVal);
  const totalInPeriod = values.reduce((acc, curr) => acc + curr, 0);
  const todayCount = values[values.length - 1] || 0;
  const yesterdayCount = values[values.length - 2] || 0;
  const diffFromYesterday = todayCount - yesterdayCount;

  // SVG Chart Geometry
  const width = 500;
  const height = 140;
  const paddingX = 30;
  const paddingTop = 20;
  const paddingBottom = 26;
  const innerWidth = width - paddingX * 2;
  const innerHeight = height - paddingTop - paddingBottom;

  const maxVal = Math.max(3, ...values);
  // round maxVal up slightly for aesthetic chart breathing room
  const yAxisMax = Math.ceil(maxVal * 1.15);

  const points = daysData.map((d, index) => {
    const x = paddingX + (index / (daysData.length - 1)) * innerWidth;
    const val = getVal(d);
    const y = paddingTop + innerHeight - (val / yAxisMax) * innerHeight;
    return { x, y, val, d, index };
  });

  // Construct SVG Path using smooth bezier curves or clean lines
  const pathD = useMemo(() => {
    if (points.length === 0) return '';
    return points.reduce((acc, curr, idx, arr) => {
      if (idx === 0) return `M ${curr.x} ${curr.y}`;
      // Calculate smooth cubic bezier control points
      const prev = arr[idx - 1];
      const cpX1 = prev.x + (curr.x - prev.x) / 2;
      const cpY1 = prev.y;
      const cpX2 = prev.x + (curr.x - prev.x) / 2;
      const cpY2 = curr.y;
      return `${acc} C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${curr.x} ${curr.y}`;
    }, '');
  }, [points]);

  // Construct filled gradient area
  const areaD = useMemo(() => {
    if (points.length === 0) return '';
    const first = points[0];
    const last = points[points.length - 1];
    const bottomY = paddingTop + innerHeight;
    return `${pathD} L ${last.x} ${bottomY} L ${first.x} ${bottomY} Z`;
  }, [pathD, points, innerHeight, paddingTop]);

  const activeColor =
    activeMetric === 'potholes'
      ? { stroke: '#f43f5e', fill: '#f43f5e', text: 'text-rose-600', bg: 'bg-rose-50', gradient: 'roseGrad' }
      : activeMetric === 'speeds'
      ? { stroke: '#0284c7', fill: '#0284c7', text: 'text-sky-600', bg: 'bg-sky-50', gradient: 'skyGrad' }
      : { stroke: '#6366f1', fill: '#6366f1', text: 'text-indigo-600', bg: 'bg-indigo-50', gradient: 'indigoGrad' };

  return (
    <div className={`bg-white rounded-2xl p-4 shadow-sm border border-slate-200/90 ${className}`}>
      {/* Header and Filter Tabs */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
        <div>
          <div className="flex items-center gap-2">
            <div className={`p-1.5 rounded-lg ${activeColor.bg} ${activeColor.text}`}>
              <TrendingUp className="w-4 h-4" />
            </div>
            <h3 className="text-sm font-bold text-slate-900 tracking-tight">
              7-Day Detection Trend
            </h3>
            <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full flex items-center gap-1">
              <Calendar className="w-3 h-3 text-slate-400" /> Past 7 Days
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Total of <span className="font-bold text-slate-800">{totalInPeriod}</span> {activeMetric === 'potholes' ? 'potholes' : activeMetric === 'speeds' ? 'speed radar detections' : 'hazards'} registered
          </p>
        </div>

        {/* Metric Selector Tabs */}
        <div className="grid grid-cols-3 sm:flex items-center gap-1 bg-slate-100 p-1 rounded-xl w-full sm:w-auto">
          <button
            onClick={() => {
              setActiveMetric('total');
              setHoveredIndex(null);
            }}
            className={`px-2 sm:px-2.5 py-1 text-[10px] sm:text-[11px] font-bold rounded-lg transition-all text-center ${
              activeMetric === 'total'
                ? 'bg-white text-indigo-700 shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Hazards
          </button>
          <button
            onClick={() => {
              setActiveMetric('potholes');
              setHoveredIndex(null);
            }}
            className={`px-2 sm:px-2.5 py-1 text-[10px] sm:text-[11px] font-bold rounded-lg transition-all text-center ${
              activeMetric === 'potholes'
                ? 'bg-rose-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            🕳️ Potholes
          </button>
          <button
            onClick={() => {
              setActiveMetric('speeds');
              setHoveredIndex(null);
            }}
            className={`px-2 sm:px-2.5 py-1 text-[10px] sm:text-[11px] font-bold rounded-lg transition-all text-center ${
              activeMetric === 'speeds'
                ? 'bg-sky-600 text-white shadow-sm'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            🏎️ Speeds
          </button>
        </div>
      </div>

      {/* Stats Summary Badge Row */}
      <div className="flex flex-wrap sm:flex-nowrap items-center gap-2.5 sm:gap-4 py-1.5 px-3 bg-slate-50 rounded-xl mb-3 border border-slate-100 text-xs">
        <div>
          <span className="text-[10px] text-slate-400 font-medium block">7-Day Total</span>
          <span className="font-extrabold text-slate-900 text-sm">{totalInPeriod}</span>
        </div>
        <div className="h-6 w-px bg-slate-200" />
        <div>
          <span className="text-[10px] text-slate-400 font-medium block">Today</span>
          <span className="font-extrabold text-slate-900 text-sm">{todayCount}</span>
        </div>
        <div className="h-6 w-px bg-slate-200" />
        <div>
          <span className="text-[10px] text-slate-400 font-medium block">vs Yesterday</span>
          <div className="flex items-center gap-0.5 font-bold text-[11px]">
            {diffFromYesterday > 0 ? (
              <span className="text-rose-600 flex items-center">
                <ArrowUpRight className="w-3.5 h-3.5" /> +{diffFromYesterday}
              </span>
            ) : diffFromYesterday < 0 ? (
              <span className="text-emerald-600 flex items-center">
                <ArrowDownRight className="w-3.5 h-3.5" /> {diffFromYesterday}
              </span>
            ) : (
              <span className="text-slate-500 flex items-center">
                <Minus className="w-3 h-3" /> Same
              </span>
            )}
          </div>
        </div>
        {hoveredIndex !== null && (
          <div className="ml-auto text-right animate-in fade-in duration-150">
            <span className="text-[10px] text-indigo-600 font-bold block">
              {daysData[hoveredIndex].dateDisplay} ({daysData[hoveredIndex].dayLabel})
            </span>
            <span className="font-mono font-bold text-slate-900 text-xs">
              {getVal(daysData[hoveredIndex])} {activeMetric === 'potholes' ? 'potholes' : activeMetric === 'speeds' ? 'speeds' : 'hazards'}
            </span>
          </div>
        )}
      </div>

      {/* SVG Interactive Line Chart Canvas */}
      <div className="relative w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-auto overflow-visible select-none"
        >
          <defs>
            {/* Gradients */}
            <linearGradient id="indigoGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#6366f1" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#6366f1" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="roseGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f43f5e" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#f43f5e" stopOpacity="0.0" />
            </linearGradient>
            <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#0284c7" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#0284c7" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Background horizontal guideline grids */}
          {[0, 0.5, 1].map((ratio, i) => {
            const y = paddingTop + innerHeight * ratio;
            const gridVal = Math.round(yAxisMax * (1 - ratio));
            return (
              <g key={i}>
                <line
                  x1={paddingX}
                  y1={y}
                  x2={width - paddingX}
                  y2={y}
                  stroke="#f1f5f9"
                  strokeWidth="1.5"
                  strokeDasharray={ratio === 1 ? 'none' : '3 3'}
                />
                <text
                  x={paddingX - 6}
                  y={y + 3}
                  textAnchor="end"
                  fontSize="9"
                  fill="#94a3b8"
                  fontFamily="monospace"
                >
                  {gridVal}
                </text>
              </g>
            );
          })}

          {/* Area fill under the trend line */}
          <path d={areaD} fill={`url(#${activeColor.gradient})`} />

          {/* Trend Line Path */}
          <path
            d={pathD}
            fill="none"
            stroke={activeColor.stroke}
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Active Data Points and Tooltips */}
          {points.map((pt) => {
            const isHovered = hoveredIndex === pt.index;
            const isToday = pt.index === points.length - 1;

            return (
              <g
                key={pt.index}
                className="cursor-pointer transition-all"
                onMouseEnter={() => setHoveredIndex(pt.index)}
                onMouseLeave={() => setHoveredIndex(null)}
                onClick={() => setHoveredIndex(pt.index)}
              >
                {/* Vertical hover guide bar */}
                {isHovered && (
                  <line
                    x1={pt.x}
                    y1={paddingTop}
                    x2={pt.x}
                    y2={paddingTop + innerHeight}
                    stroke={activeColor.stroke}
                    strokeWidth="1.5"
                    strokeDasharray="2 2"
                    opacity="0.6"
                  />
                )}

                {/* Outer halo circle on hover */}
                {isHovered && (
                  <circle
                    cx={pt.x}
                    cy={pt.y}
                    r="9"
                    fill={activeColor.stroke}
                    opacity="0.2"
                  />
                )}

                {/* Main point marker */}
                <circle
                  cx={pt.x}
                  cy={pt.y}
                  r={isHovered ? '5' : isToday ? '4.5' : '3.5'}
                  fill="#ffffff"
                  stroke={activeColor.stroke}
                  strokeWidth={isHovered ? '3' : '2.5'}
                  className="transition-transform duration-150"
                />

                {/* Floating Value Pill for hovered or non-zero peaks */}
                {(isHovered || (pt.val > 0 && points.length <= 7)) && (
                  <g>
                    <rect
                      x={pt.x - 12}
                      y={pt.y - 20}
                      width="24"
                      height="15"
                      rx="4"
                      fill={isHovered ? '#0f172a' : '#ffffff'}
                      stroke={isHovered ? '#0f172a' : '#cbd5e1'}
                      strokeWidth="1"
                    />
                    <text
                      x={pt.x}
                      y={pt.y - 9}
                      textAnchor="middle"
                      fontSize="9"
                      fontWeight="bold"
                      fill={isHovered ? '#ffffff' : '#334155'}
                      fontFamily="monospace"
                    >
                      {pt.val}
                    </text>
                  </g>
                )}

                {/* X-axis Day Label */}
                <text
                  x={pt.x}
                  y={height - 8}
                  textAnchor="middle"
                  fontSize="10"
                  fontWeight={isToday || isHovered ? 'bold' : 'normal'}
                  fill={isToday ? '#0f172a' : isHovered ? activeColor.stroke : '#64748b'}
                >
                  {pt.d.dayLabel}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {/* Footer Note */}
      <div className="flex items-center justify-between text-[10px] text-slate-400 pt-2 border-t border-slate-100">
        <span>Data aggregated in real-time from DetectionService cache & cloud database</span>
        <span className="font-mono text-slate-500">Peak: {Math.max(...values)} in a day</span>
      </div>
    </div>
  );
};
