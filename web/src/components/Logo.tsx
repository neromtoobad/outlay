// The Syncly mark: an S built from three ledger rows, the middle one in green (the books, balanced).
export function Mark({ size = 28, light = false }: { size?: number; light?: boolean }) {
  const ink = light ? '#FFFFFF' : '#13271C', row = light ? '#A3E36A' : '#7CC243';
  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <rect x="7" y="10.5" width="9" height="14" fill={ink} />
      <rect x="32" y="24" width="9" height="13.5" fill={ink} />
      <rect x="7" y="6" width="34" height="9" rx="4.5" fill={ink} />
      <rect x="7" y="33" width="34" height="9" rx="4.5" fill={ink} />
      <rect x="7" y="19.5" width="34" height="9" rx="4.5" fill={row} />
    </svg>
  );
}

export default function Logo({ size = 28, light = false }: { size?: number; light?: boolean }) {
  return (
    <span className={`logo${light ? ' light' : ''}`}>
      <Mark size={size} light={light} />
      <span className="logo__word">Syncly</span>
    </span>
  );
}
