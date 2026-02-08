import { createClient } from '@/utils/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import { CreateCategoryDialog } from '@/components/categories/create-category-dialog'
import { Tag } from 'lucide-react'

export default async function CategoriesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: categories } = await supabase
    .from('categories')
    .select('*')
    .eq('user_id', user?.id)
    .order('name', { ascending: true })

  return (
    <div className="min-h-screen bg-slate-950 text-slate-50 font-sans selection:bg-emerald-500/30 pb-24">
      <PageHeader
        title="Mis Categorías"
        icon={<Tag className="h-5 w-5" />}
        containerClassName="max-w-[1440px]"
      >
        <CreateCategoryDialog />
      </PageHeader>

      <main className="mx-auto max-w-[1440px] px-6 py-8">
        <p className="text-sm text-slate-400 mb-6">
          Administra las etiquetas para tus gastos. Las descripciones ayudan a la IA a clasificar automáticamente.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {categories?.map((cat) => (
            <div
              key={cat.id}
              className="group relative flex flex-col justify-between rounded-xl border border-slate-800 bg-slate-900/40 p-4 transition-all hover:bg-slate-900 hover:border-slate-700"
            >
              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-slate-800 bg-slate-800 text-lg group-hover:text-white transition-colors select-none">
                  {cat.emoji}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="font-medium text-sm text-slate-200 group-hover:text-white transition-colors truncate">
                    {cat.name}
                  </h3>
                  <p className="text-xs text-slate-500 line-clamp-2 mt-1">
                    {cat.description || "Sin descripción"}
                  </p>
                </div>
              </div>
            </div>
          ))}

          {categories?.length === 0 && (
            <div className="col-span-full flex flex-col items-center justify-center py-16 rounded-xl border border-dashed border-slate-800 bg-slate-900/30 text-slate-500">
              <Tag className="h-8 w-8 mb-3 opacity-50" />
              <p>No tienes categorías creadas.</p>
              <p className="text-xs mt-1">Crea la primera para empezar a organizar tus gastos.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}