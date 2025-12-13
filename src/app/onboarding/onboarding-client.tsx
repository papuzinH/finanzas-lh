'use client'

import { useState } from 'react'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Send, CheckCircle2, RefreshCw } from "lucide-react"
import { useRouter } from 'next/navigation'

interface OnboardingClientProps {
  userId: string
}

export function OnboardingClient({ userId }: OnboardingClientProps) {
  const router = useRouter()
  const [isChecking, setIsChecking] = useState(false)

  const handleCheckStatus = async () => {
    setIsChecking(true)
    // Aquí simplemente recargamos la página para que el middleware o la lógica de servidor
    // verifique si ya tiene telegram_chat_id y redirija si es necesario.
    // O podríamos hacer una llamada a una API route que verifique.
    // Por simplicidad, recargamos.
    router.refresh()
    
    // Simulamos un pequeño delay para UX
    setTimeout(() => {
      setIsChecking(false)
    }, 1000)
  }

  return (
    <Card className="w-full max-w-md border-slate-800 bg-slate-900 text-slate-50">
      <CardHeader className="text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-indigo-500/10">
          <Send className="h-6 w-6 text-indigo-500" />
        </div>
        <CardTitle className="text-2xl font-bold">Conecta tu Telegram</CardTitle>
        <CardDescription className="text-slate-400">
          Para usar Chanchito, necesitas vincular tu cuenta de Telegram.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="space-y-4 text-center">
          <p className="text-sm text-slate-300">
            Haz clic en el botón para abrir Telegram y presiona <strong>&quot;Iniciar&quot;</strong> (Start) para vincular tu cuenta automáticamente.
          </p>
          <Button asChild className="w-full bg-[#229ED9] hover:bg-[#1f8ebf] h-12 text-lg">
            <a 
              href={`https://t.me/${process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME}?start=${userId}`} 
              target="_blank" 
              rel="noopener noreferrer"
            >
              <Send className="mr-2 h-5 w-5" />
              Conectar Telegram
            </a>
          </Button>
        </div>

        <div className="text-center">
          <p className="text-xs text-slate-500 mb-2">
            Si el botón no funciona, envía este comando manualmente al bot:
          </p>
          <div className="rounded-lg border border-slate-800 bg-slate-950 p-2 font-mono text-xs text-slate-400 select-all">
            /start {userId}
          </div>
        </div>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-slate-800" />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className="bg-slate-900 px-2 text-slate-400">Una vez completado</span>
          </div>
        </div>

        <Button 
          variant="outline" 
          className="w-full border-slate-800 text-slate-300 hover:bg-slate-800 hover:text-white"
          onClick={handleCheckStatus}
          disabled={isChecking}
        >
          {isChecking ? (
            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
          ) : (
            <CheckCircle2 className="mr-2 h-4 w-4" />
          )}
          Ya envié el código
        </Button>
      </CardContent>
    </Card>
  )
}
