interface SectionHeaderProps {
  children: React.ReactNode;
  className?: string;
}

export function SectionHeader({ children, className = "" }: SectionHeaderProps) {
  return (
    <h3 className={`text-xs text-text-dim uppercase tracking-widest font-semibold mb-4 ${className}`.trim()}>
      {children}
    </h3>
  );
}
