import { createClient } from '@/utils/supabase/server';
import { PageHeader } from '@/components/shared/page-header';
import { CreateCategoryDialog } from '@/components/categories/create-category-dialog';
import { CategoriesWithStats } from '@/app/categorias/_components/categories-with-stats';
import { Tag } from 'lucide-react';

export default async function AjustesCategoriasPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: categories } = await supabase
    .from('categories')
    .select('*')
    .eq('user_id', user?.id)
    .order('name', { ascending: true });

  return (
    <div className="min-h-screen bg-surface text-slate-50 font-sans selection:bg-emerald-500/30 pb-24">
      <PageHeader
        title="Mis Categorías"
        icon={<Tag className="h-5 w-5" />}
        containerClassName="max-w-[1440px]"
      >
        <CreateCategoryDialog />
      </PageHeader>

      <main className="mx-auto max-w-[1440px] px-4 md:px-6 py-6 md:py-8">
        <p className="text-sm text-slate-400 mb-6">
          Administra las etiquetas para tus gastos. Las descripciones ayudan a la IA a clasificar automáticamente.
        </p>
        <CategoriesWithStats categories={categories ?? []} />
      </main>
    </div>
  );
}
