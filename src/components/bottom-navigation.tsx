'use client';

import { Home, Calendar, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { usePathname, useRouter } from 'next/navigation';

export function BottomNavigation() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <nav className='fixed bottom-0 inset-x-0 z-50 bg-background/80 backdrop-blur-sm border-t'>
      <div className='max-w-lg mx-auto px-4'>
        <div className='flex justify-between py-2'>
          <Button
            variant='ghost'
            size='lg'
            className={pathname === '/feed' ? 'text-primary' : ''}
            onClick={() => router.push('/feed')}
          >
            <Home className='h-5 w-5' />
            <span className='sr-only'>홈</span>
          </Button>
          <Button
            variant='ghost'
            size='lg'
            className={pathname === '/calendar' ? 'text-primary' : ''}
            onClick={() => router.push('/calendar')}
          >
            <Calendar className='h-5 w-5' />
            <span className='sr-only'>캘린더</span>
          </Button>
          <Button
            variant='ghost'
            size='lg'
            className={pathname === '/settings' ? 'text-primary' : ''}
            onClick={() => router.push('/settings')}
          >
            <Settings className='h-5 w-5' />
            <span className='sr-only'>설정</span>
          </Button>
        </div>
      </div>
    </nav>
  );
}
