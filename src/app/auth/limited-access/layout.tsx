import type { ReactNode } from 'react';

const limitedAccessBackground =
  'radial-gradient(900px 420px at 10% 0%, rgba(30, 215, 96, 0.14) 0%, rgba(18, 20, 23, 0) 55%), radial-gradient(700px 360px at 90% 10%, rgba(29, 185, 84, 0.10) 0%, rgba(18, 20, 23, 0) 60%), var(--mantine-color-dark-9)';

export default function LimitedAccessLayout({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <div
      style={{
        minHeight: '100dvh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'clamp(16px, 4vw, 40px)',
        background: limitedAccessBackground,
        color: 'var(--mantine-color-dark-0)',
      }}
    >
      <div style={{ width: 'min(720px, 100%)' }}>{children}</div>
    </div>
  );
}
