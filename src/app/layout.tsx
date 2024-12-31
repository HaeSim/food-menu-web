import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { BottomNavigation } from '@/components/bottom-navigation';
import { Analytics } from '@vercel/analytics/react';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: '뇸뇸 식단표',
  description: '구내식당 주간 메뉴',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang='ko' suppressHydrationWarning>
      <body className={inter.className}>
        <div className='min-h-screen bg-background'>
          <div className='max-w-lg mx-auto pb-16'>{children}</div>
          <div className='max-w-lg mx-auto'>
            <BottomNavigation />
          </div>
        </div>
        <Analytics />
      </body>
    </html>
  );
}
