'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ReloadIcon } from '@radix-ui/react-icons';

export function MenuUpdateButton() {
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  async function handleUpdate() {
    try {
      setIsLoading(true);
      const response = await fetch('/api/menu');

      if (!response.ok) {
        throw new Error('Failed to update menu');
      }

      router.refresh();
    } catch (error) {
      console.error('Error updating menu:', error);
      alert('메뉴 업데이트에 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <Button variant='outline' onClick={handleUpdate} disabled={isLoading}>
      {isLoading && <ReloadIcon className='mr-2 h-4 w-4 animate-spin' />}
      메뉴 업데이트
    </Button>
  );
}
