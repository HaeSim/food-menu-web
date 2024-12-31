import { createClient } from '@supabase/supabase-js';
import { env } from '@/env.mjs';
import { DataCard } from '@/components/ui/data-card';
import type { MenuRecord } from '@/lib/types';

async function getMenus() {
  const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY);

  const { data, error } = await supabase
    .from('food_menu_records')
    .select('*')
    .order('upload_date', { ascending: false })
    .limit(10);

  if (error) throw error;
  return data as MenuRecord[];
}

export default async function FeedPage() {
  const menus = await getMenus();

  return (
    <main className='py-6 px-4'>
      <h1 className='text-2xl font-bold mb-6'>식단표</h1>
      <div className='space-y-4'>
        {menus.map((menu) => (
          <DataCard key={menu.id} menu={menu} />
        ))}
      </div>
    </main>
  );
}
