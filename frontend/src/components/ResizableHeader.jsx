import { useRef } from 'react';

/**
 * Cellule d'en-tête de tableau redimensionnable.
 * Poignée à droite : drag pour ajuster la largeur de la colonne.
 */
export default function ResizableHeader({
  col,
  sortKey,
  sortDir,
  onSort,
  onResize,
  children
}) {
  const thRef = useRef(null);
  const startX = useRef(0);
  const startW = useRef(0);

  const isSortable = !['__actions', '__conformite', '__select'].includes(col.key);
  const arrow = sortKey === col.key ? (sortDir === 'asc' ? ' ▲' : ' ▼') : '';

  function startResize(e) {
    e.preventDefault();
    e.stopPropagation();
    startX.current = e.clientX;
    startW.current = thRef.current?.offsetWidth || col.width;
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    function onMove(ev) {
      const dx = ev.clientX - startX.current;
      onResize(col.key, startW.current + dx);
    }
    function onUp() {
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    }
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }

  return (
    <th
      ref={thRef}
      style={{ width: col.width, minWidth: col.width, maxWidth: col.width, position: 'relative' }}
      className={`${isSortable ? 'cursor-pointer select-none hover:bg-iip-amber' : ''}`}
      onClick={() => isSortable && onSort(col.key)}
      title={isSortable ? 'Cliquer pour trier · Glisser le bord pour redimensionner' : col.tooltip}
    >
      {children}{arrow}
      {/* Poignée de redimensionnement */}
      <span
        onMouseDown={startResize}
        onClick={e => e.stopPropagation()}
        className="absolute top-0 right-0 h-full w-1.5 cursor-col-resize hover:bg-iip-mauve/40"
        style={{ zIndex: 5 }}
        title="Glisser pour redimensionner"
      />
    </th>
  );
}
