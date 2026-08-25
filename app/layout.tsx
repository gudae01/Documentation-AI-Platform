import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MediFlow Clinical AI',
  description: '병원 내부 Clinical Documentation AI Platform',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
