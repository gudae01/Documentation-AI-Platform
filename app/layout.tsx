import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'MEDIFLOW 파킨슨병 임상 문서',
  description: '파킨슨병 사전 문진 및 입원 결과 보고서 시스템',
  referrer: 'no-referrer',
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
