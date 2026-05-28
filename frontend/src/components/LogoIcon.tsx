/**
 * LogoIcon – unified brand mark used across the platform.
 *
 * variant="dark"  – dark circle (#181925) + white >_  (default, standalone use)
 * variant="light" – white circle + dark >_            (use on dark backgrounds, e.g. Navbar)
 */
interface LogoIconProps {
  variant?: 'dark' | 'light';
  size?: number; // pixel size, default 32
}

export default function LogoIcon({ variant = 'dark', size = 32 }: LogoIconProps) {
  const isDark = variant === 'dark';
  const fontSize = Math.round(size * 0.34);

  return (
    <div
      style={{ width: size, height: size, fontSize }}
      className={[
        'rounded-full flex items-center justify-center',
        'font-mono font-bold select-none shrink-0',
        isDark
          ? 'bg-[#181925] text-white'
          : 'bg-white text-[#181925]',
      ].join(' ')}
    >
      <span style={{ letterSpacing: '-0.5px' }}>{'>_'}</span>
    </div>
  );
}
