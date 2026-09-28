import { BottomNav } from '@/components/layout/bottom-nav';
import { Header, MobileSearch } from '@/components/layout/header';
import { Sidebar } from '@/components/layout/sidebar';
import { RealtimeProvider } from '@/components/providers/realtime-provider';
import { requireUserPage } from '@/lib/auth/rbac';

/** Оболочка защищённой части: сайдбар, шапка, нижняя навигация (ТЗ 5.1). */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUserPage();

  return (
    <RealtimeProvider soundEnabled={user.soundNotifications}>
      <div className="flex h-dvh overflow-hidden bg-[var(--page)]">
        <Sidebar user={user} />

        <div className="flex min-w-0 flex-1 flex-col">
          <Header user={user} />
          <MobileSearch />

          <main
            id="main"
            className="workspace flex-1 overflow-y-auto px-4 pt-5 pb-[calc(6rem+env(safe-area-inset-bottom))] md:pb-7 lg:px-7 lg:pt-6"
          >
            {children}
          </main>
        </div>

        <BottomNav />
      </div>
    </RealtimeProvider>
  );
}
