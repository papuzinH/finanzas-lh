import { createClient } from '@/utils/supabase/server'
import { PageHeader } from '@/components/shared/page-header'
import { Card, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { CreateCategoryDialog } from '@/components/categories/create-category-dialog'

export default async function CategoriesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: categories } = await supabase
    .from('categories')
    .select('*')
    .eq('user_id', user?.id)
    .order('name', { ascending: true })

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <PageHeader 
          title="Mis Categorías" 
          description="Administra las etiquetas para tus gastos. Las descripciones ayudan a la IA." 
        />
        {/* Aquí va tu componente mágico */}
        <CreateCategoryDialog />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {categories?.map((cat) => (
          <Card key={cat.id} className="flex flex-row items-center gap-4 p-4 hover:shadow-md transition-shadow">
            <div className="text-4xl select-none">{cat.emoji}</div>
            <div className="flex-1">
              <CardTitle className="text-lg">{cat.name}</CardTitle>
              <CardDescription className="line-clamp-2 mt-1">
                {cat.description || "Sin descripción"}
              </CardDescription>
            </div>
            {/* Aquí podrías agregar botón de editar/borrar en el futuro */}
          </Card>
        ))}
        
        {categories?.length === 0 && (
          <div className="col-span-full text-center py-10 text-muted-foreground">
            No tienes categorías creadas. ¡Crea la primera! 🚀
          </div>
        )}
      </div>
    </div>
  )
}