'use client'

import { useState } from 'react'
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card"
import { Send, CheckCircle2, RefreshCw, Copy, Check, Smartphone, ShieldCheck } from "lucide-react"
import { useRouter } from 'next/navigation'
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

interface OnboardingClientProps {
  userId: string
}

export function OnboardingClient({ userId }: OnboardingClientProps) {
  const router = useRouter()
  const [isChecking, setIsChecking] = useState(false)
  const [copied, setCopied] = useState(false)

  const handleCheckStatus = async () => {
    setIsChecking(true)
    // Aquí simplemente recargamos la página para que el middleware o la lógica de servidor
    // verifique si ya tiene telegram_chat_id y redirija si es necesario.
    router.refresh()
    
    // Simulamos un pequeño delay para UX
    setTimeout(() => {
      setIsChecking(false)
    }, 1500)
  }

  const copyToClipboard = () => {
    navigator.clipboard.writeText(`/start ${userId}`)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="w-full max-w-md space-y-8"
    >
        <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold tracking-tighter text-white sm:text-4xl">
                Bienvenido a Chanchito
            </h1>
            <p className="text-slate-400">
                Tu asistente financiero personal
            </p>
        </div>

        <Card className="border-slate-800 bg-slate-900/50 backdrop-blur-sm shadow-2xl">
            <CardHeader className="text-center pb-2">
                <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-indigo-500/10 ring-1 ring-indigo-500/20">
                    <Send className="h-10 w-10 text-indigo-400" />
                </div>
                <CardTitle className="text-xl font-semibold text-white">
                    Vincula tu cuenta
                </CardTitle>
                <CardDescription className="text-slate-400">
                    Conecta con Telegram para gestionar tus finanzas
                </CardDescription>
            </CardHeader>
            
            <CardContent className="space-y-6 pt-6">
                {/* Steps */}
                <div className="grid gap-4">
                    <div className="flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                        <div className="mt-0.5 rounded-full bg-blue-500/10 p-1.5">
                            <Smartphone className="h-4 w-4 text-blue-400" />
                        </div>
                        <div className="text-sm">
                            <p className="font-medium text-slate-200">Paso 1: Abre Telegram</p>
                            <p className="text-slate-400 text-xs">Inicia el bot oficial de Chanchito</p>
                        </div>
                    </div>
                    
                    <div className="flex items-start gap-3 rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                        <div className="mt-0.5 rounded-full bg-emerald-500/10 p-1.5">
                            <ShieldCheck className="h-4 w-4 text-emerald-400" />
                        </div>
                        <div className="text-sm">
                            <p className="font-medium text-slate-200">Paso 2: Autenticación</p>
                            <p className="text-slate-400 text-xs">El bot vinculará tu cuenta automáticamente</p>
                        </div>
                    </div>
                </div>

                <Button 
                    asChild 
                    className="w-full bg-[#229ED9] hover:bg-[#1f8ebf] h-12 text-base font-medium shadow-lg shadow-blue-500/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
                >
                    <a 
                        className='w-full flex items-center justify-center'
                        href={`https://t.me/${process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME}?start=${userId}`} 
                        target="_blank" 
                        rel="noopener noreferrer"
                    >
                        <Send className="mr-2 h-5 w-5" />
                        Abrir Telegram
                    </a>
                </Button>

                <div className="relative">
                    <div className="absolute inset-0 flex items-center">
                        <span className="w-full border-t border-slate-800" />
                    </div>
                    <div className="relative flex justify-center text-xs uppercase">
                        <span className="bg-slate-900 px-2 text-slate-500">O manualmente</span>
                    </div>
                </div>

                <div className="space-y-2">
                    <p className="text-xs text-center text-slate-500">
                        Envía este comando al bot si el enlace no funciona:
                    </p>
                    <button 
                        onClick={copyToClipboard}
                        className="group relative flex w-full items-center justify-between rounded-lg border border-slate-800 bg-slate-950 px-4 py-3 font-mono text-sm text-slate-300 transition-all hover:border-slate-700 hover:bg-slate-900 active:scale-[0.98] cursor-pointer outline-none focus:ring-2 focus:ring-indigo-500/20"
                        type="button"
                    >
                        <span className="truncate mr-2">/start {userId}</span>
                        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-900 border border-slate-800 text-slate-500 transition-colors group-hover:border-slate-700 group-hover:text-white">
                            {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                        </div>
                    </button>
                </div>
            </CardContent>
            
            <CardFooter>
                <Button 
                    variant="ghost" 
                    className="w-full text-slate-400 hover:text-white hover:bg-slate-800/50 active:scale-[0.98]"
                    onClick={handleCheckStatus}
                    disabled={isChecking}
                >
                    {isChecking ? (
                        <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <CheckCircle2 className="mr-2 h-4 w-4" />
                    )}
                    Ya he completado el proceso
                </Button>
            </CardFooter>
        </Card>
    </motion.div>
  )
}
