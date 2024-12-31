import Image from 'next/image';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { MenuRecord } from '@/lib/types';

interface DataCardProps {
  menu: MenuRecord;
}

export function DataCard({ menu }: DataCardProps) {
  return (
    <Card className='overflow-hidden'>
      <CardHeader className='p-4'>
        <CardTitle className='text-base font-medium'>
          {format(new Date(menu.upload_date), 'yyyy년 MM월 dd일')}
        </CardTitle>
      </CardHeader>
      <CardContent className='p-0'>
        <div className='relative aspect-[4/3]'>
          <Image
            src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/food-menus/${menu.storage_path}`}
            alt={`Menu for ${menu.upload_date}`}
            fill
            className='object-cover'
            sizes='(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw'
            priority
          />
        </div>
      </CardContent>
    </Card>
  );
}
