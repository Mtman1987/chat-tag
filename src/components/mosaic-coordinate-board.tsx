'use client';

import { Fragment } from 'react';

export type CoordinateArtwork = {
  width: number; height: number; target: string[]; painted: string[];
  activeBoard: number; viewMode: 'board' | 'all'; palette?: Record<string, string>;
};
const COLORS: Record<string, string> = { R:'#ef4444',B:'#3b82f6',G:'#22c55e',Y:'#eab308',P:'#a855f7',O:'#f97316',PK:'#ec4899',W:'#f8fafc',K:'#111827',C:'#06b6d4' };

export function MosaicCoordinateBoard({ art, availableHeight }: { art: CoordinateArtwork; availableHeight: number | null }) {
  const overview = art.width > 20;
  const boards = overview ? [1, 2, 3, 4] : [art.activeBoard];
  const rows = Math.min(25, art.height), columns = Math.min(20, art.width);
  const labelWidth = 28, labelHeight = 24;
  const perBoardHeight = availableHeight === null ? null : Math.max(150, overview ? (availableHeight - 44) / 2 : availableHeight);
  const boardWidth = perBoardHeight === null ? null : labelWidth + (perBoardHeight - labelHeight) * columns / rows;
  const palette = art.palette || COLORS;
  return <div className={`grid w-full min-w-0 gap-3 ${overview ? 'grid-cols-2' : 'grid-cols-1'}`} style={{ maxWidth: boardWidth === null ? undefined : overview ? boardWidth * 2 + 12 : boardWidth }}>
    {boards.map(board => <div key={board} className="min-w-0">
      {overview ? <div className="mb-1 text-center text-xs font-bold text-cyan-100">Board {board}</div> : null}
      <div role="grid" aria-label={`Mosaic board ${board}, columns A to T, rows 1 to ${rows}`} aria-colcount={columns + 1} aria-rowcount={rows + 1} data-testid="mosaic-controller-grid" className="grid w-full min-w-0 border border-cyan-200/30 bg-slate-950" style={{
        aspectRatio: `${boardWidth || 428} / ${perBoardHeight || 524}`,
        gridTemplateColumns: `${labelWidth}px repeat(${columns}, minmax(0, 1fr))`,
        gridTemplateRows: `${labelHeight}px repeat(${rows}, minmax(0, 1fr))`,
      }}>
        <span aria-hidden="true" className="bg-slate-800" />
        {Array.from({length: columns}, (_, column) => <span key={`column-${column}`} role="columnheader" className="grid min-w-0 place-items-center border-b border-cyan-300/30 bg-slate-800 text-[clamp(8px,1.1vw,12px)] font-black text-cyan-100">{String.fromCharCode(65 + column)}</span>)}
        {Array.from({length: rows}, (_, row) => <Fragment key={row}>
          <span role="rowheader" className="grid min-h-0 place-items-center border-r border-cyan-300/30 bg-slate-800 text-[clamp(8px,1.1vw,12px)] font-black text-cyan-100">{row + 1}</span>
          {Array.from({length: columns}, (_, column) => {
            const x = overview ? ((board - 1) % 2) * 20 + column : column;
            const y = overview ? Math.floor((board - 1) / 2) * 25 + row : row;
            const index = y * art.width + x;
            const target = art.target[index], painted = art.painted[index];
            const coordinate = `${String.fromCharCode(65 + column)}${row + 1}`;
            const label = `Board ${board} · ${coordinate} · ${painted ? `painted ${painted}` : `needs ${target}`} · spmt ${coordinate}${target}`;
            return <span key={column} role="gridcell" aria-label={label} title={label} className="grid min-h-0 min-w-0 place-items-center overflow-hidden border border-slate-700/30 text-[clamp(6px,.85vw,11px)] font-black" style={{background: painted ? palette[painted] || COLORS[painted] : '#020617', color: target === 'K' ? '#94a3b8' : palette[target] || COLORS[target]}}>{!painted ? target : ''}</span>;
          })}
        </Fragment>)}
      </div>
    </div>)}
  </div>;
}
