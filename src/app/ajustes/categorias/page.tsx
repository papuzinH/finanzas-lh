import { createClient } from '@/utils/supabase/server';
import { ScreenHeader } from '@/components/shared/screen-header';
import { CreateCategoryDialog } from '@/components/categories/create-category-dialog';
import { CategoriesWithStats } from '@/app/categorias/_components/categories-with-stats';

export default async function AjustesCategoriasPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const { data: categories } = await supabase
    .from('categories')
    .select('*')
    .eq('user_id', user?.id)
    .order('name', { ascending: true });

  return (
    <div className="min-h-screen bg-bg text-text font-sans selection:bg-accent/30 pb-24">
      <ScreenHeader
        kicker="Ajustes"
        title="Mis Categorías"
        right={<CreateCategoryDialog />}
      />

      <main className="mx-auto max-w-[1440px] px-4 md:px-6 py-6 md:py-8">
        <p className="text-sm text-muted mb-6">
          Administra las etiquetas para tus gastos. Las descripciones ayudan a la IA a clasificar automáticamente.
        </p>
        <CategoriesWithStats categories={categories ?? []} />
      </main>
    </div>
  );
}
