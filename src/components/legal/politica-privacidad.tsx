import type { ReactNode } from 'react'
import Link from 'next/link'
import { Chancho } from '@/components/brand/chancho'
import { MAIL_CONTACTO } from '@/lib/contacto'

/**
 * La política de privacidad, escrita para que se entienda y verificada contra
 * lo que la app hace de verdad (terceros, cookies, borrado). Si cambia un
 * proveedor o una promesa, cambia esto y la fecha — y el test
 * (`__tests__/politica-privacidad.test.tsx`) vigila que ningún tercero
 * desaparezca del texto en silencio.
 */
const CONTACTO = MAIL_CONTACTO
const ACTUALIZADA = '26 de agosto de 2026'

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="grid gap-3">
      <h2 className="font-display text-[22px] leading-[1.1] text-text">{titulo}</h2>
      <div className="grid gap-3 text-[15px] leading-[1.6] text-muted">{children}</div>
    </section>
  )
}

function Lista({ children }: { children: ReactNode }) {
  return <ul className="grid list-disc gap-2 pl-5">{children}</ul>
}

export function PoliticaPrivacidad() {
  return (
    <article className="mx-auto grid max-w-[640px] gap-10 px-5 pb-20 pt-10 md:px-6">
      <header className="grid gap-4">
        <Link href="/" className="inline-flex items-center gap-2 text-[13.5px] text-muted hover:text-text">
          <Chancho className="w-7 text-text" title="Chanchito" />
          Volver a Chanchito
        </Link>
        <h1 className="font-display text-[36px] leading-[1.02] text-text md:text-[44px]">Privacidad</h1>
        <p className="text-[15.5px] leading-[1.6] text-muted">
          Chanchito es una app de finanzas personales hecha por LH Studio. Esta página cuenta, sin
          vueltas, qué datos guarda, para qué los usa, con quién los comparte y cómo los borrás.
          Está escrita para que se entienda, no para cubrirnos.
        </p>
        <p className="text-[12.5px] text-faint">Última actualización: {ACTUALIZADA}</p>
      </header>

      <Seccion titulo="Quién es responsable">
        <p>
          LH Studio (Lautaro Hudson), Argentina. Para cualquier consulta sobre tus datos escribí a{' '}
          <a href={`mailto:${CONTACTO}`} className="font-bold text-text underline-offset-2 hover:underline">
            {CONTACTO}
          </a>
          .
        </p>
      </Seccion>

      <Seccion titulo="Qué datos guardamos">
        <Lista>
          <li>
            <b className="text-text">Los de tu cuenta de Google</b> al entrar: nombre, mail y foto de
            perfil. Es la única forma de ingresar; no pedimos contraseña.
          </li>
          <li>
            <b className="text-text">Lo que cargás en la app</b>: movimientos, medios de pago y sus
            saldos, cuotas, mensualidades, metas, presupuestos, inversiones y transferencias entre tus
            cuentas. Son datos financieros y los tratamos como tales.
          </li>
          <li>
            <b className="text-text">Lo que le escribís al asistente</b> (el chat), para poder responderte.
          </li>
          <li>
            <b className="text-text">La voz no se guarda</b>: si dictás un gasto, la transcripción la hace
            tu navegador (el reconocimiento de voz de Chrome o Safari) y a la app le llega solo el texto.
          </li>
        </Lista>
      </Seccion>

      <Seccion titulo="Para qué los usamos">
        <p>
          Para una sola cosa: mostrarte tus números —cuánto tenés disponible, qué vence, cómo va cada
          meta—. No hay publicidad, no vendemos ni cedemos datos a nadie, y no usamos herramientas de
          analytics ni de seguimiento de terceros.
        </p>
      </Seccion>

      <Seccion titulo="Con quién se comparten">
        <p>Con los proveedores sin los que la app no funciona, y con nadie más:</p>
        <Lista>
          <li>
            <b className="text-text">Supabase</b>: la base de datos y el sistema de acceso. Tus datos se
            guardan en sus servidores de San Pablo, Brasil, y solo tu usuario puede leerlos — cada fila
            está protegida a nivel de base de datos.
          </li>
          <li>
            <b className="text-text">Vercel</b>: donde corre la app.
          </li>
          <li>
            <b className="text-text">RackNerd</b>: el servidor que administramos nosotros y donde
            guardamos las copias de respaldo diarias de la base (más abajo contamos cómo funcionan).
          </li>
          <li>
            <b className="text-text">Google</b>: para el ingreso con tu cuenta y para el asistente. El
            asistente usa el modelo Gemini: cuando le escribís, Google procesa tu mensaje y los datos de
            tu cuenta que hacen falta para responderte (categorías, medios de pago y los movimientos que
            la consulta necesite), según los términos de su API de Gemini. Si no usás el chat, nada tuyo
            pasa por Gemini.
          </li>
          <li>
            <b className="text-text">Fuentes de cotizaciones</b> (dolarapi, CoinGecko, Yahoo Finance,
            InvertirOnline, ArgentinaDatos): les pedimos precios y tipos de cambio. Reciben el nombre del
            activo a cotizar, nunca tus datos.
          </li>
        </Lista>
      </Seccion>

      <Seccion titulo="Cookies y almacenamiento local">
        <p>
          Usamos una cookie de sesión para que no tengas que entrar cada vez, y guardamos en tu
          dispositivo dos preferencias: el tema (día o noche) y si ya viste el recorrido inicial. No hay
          cookies de publicidad ni de seguimiento.
        </p>
      </Seccion>

      <Seccion titulo="Cuánto tiempo y cómo los borrás">
        <p>
          Guardamos tus datos mientras tengas la cuenta. Para borrarla, andá a{' '}
          <b className="text-text">Ajustes → Perfil → Borrar la cuenta</b>: se eliminan de inmediato
          todos tus datos y tu acceso, sin período de espera. No hay vuelta atrás, así que si querés
          conservar algo, anotalo antes.
        </p>
        <p>
          Al borrar la cuenta desaparecen los datos de nuestra base en el acto. En las copias de
          respaldo pueden quedar hasta que rotan: como máximo, <b className="text-text">14 días</b>{' '}
          después del borrado no queda nada tuyo en ninguna copia. Lo que ya procesó un proveedor (por
          ejemplo, un mensaje enviado a Gemini) se rige por sus propias políticas de retención.
        </p>
      </Seccion>

      <Seccion titulo="Tus derechos">
        <p>
          Podés ver, corregir y borrar tus datos desde la app en cualquier momento, y pedirnos por mail
          cualquier cosa que no puedas hacer solo. Tenés los derechos de acceso, rectificación y
          supresión que reconoce la Ley 25.326 de Protección de Datos Personales; la Agencia de Acceso a
          la Información Pública (AAIP) es el órgano de control y podés acudir a ella si considerás que
          no cumplimos.
        </p>
      </Seccion>

      <Seccion titulo="Condiciones de uso">
        <p>
          Chanchito es una <b className="text-text">beta gratuita</b> para uso personal. La hacemos con
          cuidado, pero no garantizamos que esté siempre disponible ni libre de errores.
        </p>
        <p>
          <b className="text-text">No es asesoramiento financiero.</b> Lo que muestra sale de lo que vos
          cargás y de cotizaciones de terceros, que pueden estar desactualizadas o fallar. Las decisiones
          sobre tu plata son tuyas.
        </p>
        <p>
          <b className="text-text">Hacemos una copia de respaldo automática por día.</b> Se guarda en
          un servidor que administramos nosotros (alquilado a RackNerd) y conservamos las últimas 14.
          Si algo se rompe, podemos volver como mucho al día anterior: lo que hayas cargado en las
          últimas 24 horas se puede perder.
        </p>
        <p>Podés dejar de usarla cuando quieras borrando la cuenta.</p>
      </Seccion>

      <Seccion titulo="Cambios">
        <p>
          Si cambia algo de lo que dice esta página, actualizamos la fecha de arriba. Si el cambio es
          importante —qué guardamos o con quién lo compartimos—, te lo avisamos en la app.
        </p>
      </Seccion>
    </article>
  )
}
