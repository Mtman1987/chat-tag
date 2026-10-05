'use client';
import { Fragment } from 'react';
export type CoordinateArtwork = {
  width: number; height: number; target: string[]; painted: string[];
  activeBoard: number; viewMode: 'board' | 'all'; palette?: Record<string, string>;
};
const COLORS: Record<string, string> = { R:'#ef4444',B:'#3b82f6',G:'#22c55e',Y:'#eab308',P:'#a855f7',O:'#f97316',PK:'#ec4899',W:'#f8fafc',K:'#111827',C:'#06b6d4' };
export function MosaicCoordinateBoard({ art, availableHeight, cellSize = null, onCell, disabled = false }: {
  art: CoordinateArtwork; availableHeight: number | null; cellSize?: number | null;
  onCell?: (coordinate: string, board: number) => void; disabled?: boolean;
}) {
  const overview = art.width > 20;
  const boards = overview ? [1, 2, 3, 4] : [art.activeBoard];
  const rows = Math.min(25, art.height), columns = Math.min(20, art.width);
  const labelWidth = 34, labelHeight = 30;
  const fittedHeight = availableHeight === null ? 700 : Math.max(200, overview ? (availableHeight - 44) / 2 : availableHeight);
  const fittedWidth = labelWidth + (fittedHeight - labelHeight) * columns / rows;
  const palette = art.palette || COLORS;
  return <div tabIndex={0} aria-label="Scrollable Mosaic board" className="mx-auto w-full min-w-0 overflow-auto rounded-lg border border-cyan-200/20" style={{ maxWidth: (labelWidth + columns * (cellSize || (fittedHeight - labelHeight) / rows)) * (overview ? 2 : 1) + (overview ? 12 : 0), maxHeight: cellSize ? availableHeight || 700 : undefined, scrollbarGutter: cellSize ? 'stable' : undefined }}>
    <div className={`grid gap-3 ${overview ? 'grid-cols-2' : 'grid-cols-1'}`} style={{ width: cellSize ? (labelWidth + columns * cellSize) * (overview ? 2 : 1) + (overview ? 12 : 0) : '100%', maxWidth: cellSize ? undefined : fittedWidth * (overview ? 2 : 1) + (overview ? 12 : 0) }}>
      {boards.map(board => <div key={board} className="min-w-0">
        {overview ? <div className="mb-1 text-center text-sm font-bold text-cyan-100">Board {board}</div> : null}
        <div role="grid" aria-label={`Mosaic board ${board}, columns A to T, rows 1 to ${rows}`} aria-colcount={columns + 1} aria-rowcount={rows + 1} data-testid="mosaic-controller-grid" className="grid bg-slate-950" style={{
          aspectRatio: cellSize ? undefined : `${fittedWidth} / ${fittedHeight}`,
          gridTemplateColumns: `${labelWidth}px repeat(${columns}, ${cellSize ? `${cellSize}px` : 'minmax(0, 1fr)'})`,
          gridTemplateRows: `${labelHeight}px repeat(${rows}, ${cellSize ? `${cellSize}px` : 'minmax(0, 1fr)'})`,
          fontSize: cellSize ? Math.max(13, Math.round(cellSize * .46)) : 'clamp(11px,1.1vw,16px)',
        }}>
          <span aria-hidden="true" className="sticky left-0 top-0 z-20 bg-slate-800" />
          {Array.from({length: columns}, (_, column) => <span key={`column-${column}`} role="columnheader" className="sticky top-0 z-10 grid min-w-0 place-items-center border-b border-cyan-300/30 bg-slate-800 font-black text-cyan-100">{String.fromCharCode(65 + column)}</span>)}
          {Array.from({length: rows}, (_, row) => <Fragment key={row}>
            <span role="rowheader" className="sticky left-0 z-10 grid min-h-0 place-items-center border-r border-cyan-300/30 bg-slate-800 font-black text-cyan-100">{row + 1}</span>
            {Array.from({length: columns}, (_, column) => {
              const x = overview ? ((board - 1) % 2) * 20 + column : column;
              const y = overview ? Math.floor((board - 1) / 2) * 25 + row : row;
              const index = y * art.width + x;
              const target = art.target[index], painted = art.painted[index];
              const coordinate = `${String.fromCharCode(65 + column)}${row + 1}`;
              const label = `Board ${board} · ${coordinate} · ${painted ? `painted ${painted}` : `needs ${target}`} · spmt ${coordinate}${target}`;
              const props = { 'aria-label': label, title: label, className: 'grid min-h-0 min-w-0 place-items-center overflow-hidden border border-slate-700/50 font-black', style: { background: painted ? palette[painted] || COLORS[painted] : '#020617', color: target === 'K' ? '#94a3b8' : palette[target] || COLORS[target] } };
              return onCell ? <button key={column} type="button" role="gridcell" {...props} disabled={disabled || overview} onClick={() => onCell(coordinate, board)}>{!painted ? target : ''}</button>
                : <span key={column} role="gridcell" {...props}>{!painted ? target : ''}</span>;
            })}
          </Fragment>)}
        </div>
      </div>)}
    </div>
  </div>;
}
