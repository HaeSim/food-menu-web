import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import type { MenuRecord } from '@/lib/types';
import { format } from 'date-fns';

async function getMenusByWeek() {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

  const { data, error } = await supabase
    .from('food_menu_records')
    .select('*')
    .order('upload_date', { ascending: false });

  if (error) throw error;
  return data as MenuRecord[];
}

export default async function CalendarPage() {
  const menus = await getMenusByWeek();

  return (
    <main className='container mx-auto py-10 px-4'>
      <h1 className='text-3xl font-bold mb-8'>주간 메뉴</h1>
      <div className='space-y-4'>
        {menus.map((menu) => (
          <div
            key={menu.id}
            className='p-4 rounded-lg border bg-card text-card-foreground'
          >
            <h2 className='font-medium'>
              {format(new Date(menu.upload_date), 'yyyy년 MM월 dd일')}
            </h2>
          </div>
        ))}
      </div>
    </main>
  );
}
