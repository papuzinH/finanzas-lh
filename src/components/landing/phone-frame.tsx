import Image from 'next/image'
import { cn } from '@/lib/utils'

/**
 * El marco de teléfono de la landing. Las capturas son 780×1688 (390×844 @2x,
 * Fase 1); el marco las recorta con el radio y el borde del sistema. `children`
 * permite superponer elementos (el contador del hero) sobre la captura.
 */
export function PhoneFrame({
  captura,
  alt,
  className,
  priority = false,
  children,
}: {
  captura: string
  alt: string
  className?: string
  priority?: boolean
  children?: React.ReactNode
}) {
  return (
    <div
      className={cn(
        'relative overflow-hidden rounded-[2rem] border-[3px] border-text bg-surface shadow-card',
        className,
      )}
    >
      <Image src={captura} alt={alt} width={780} height={1688} priority={priority} className="block h-auto w-full" />
      {children}
    </div>
  )
}
