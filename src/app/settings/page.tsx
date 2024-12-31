import { MenuUpdateButton } from '@/components/menu-update-button';

export default function SettingsPage() {
  return (
    <main className='container mx-auto py-10 px-4'>
      <h1 className='text-3xl font-bold mb-8'>설정</h1>
      <div className='space-y-6'>
        <div>
          <h2 className='text-xl font-semibold mb-4'>메뉴 관리</h2>
          <MenuUpdateButton />
        </div>
      </div>
    </main>
  );
}
