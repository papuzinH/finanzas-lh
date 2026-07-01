/* ============================================================
   Chanchito · UI Kit · Patrones (listas, navegación, chat, vacíos)
   ============================================================ */

function StatefulNav() {
  const [a, setA] = React.useState('inicio');
  return (
    <div className="relative w-full max-w-[340px] h-[88px] rounded-2xl bg-[var(--bg)] border-[1.5px] border-[var(--border)] overflow-hidden">
      <BottomNav active={a} onNav={setA} />
    </div>
  );
}

function StatefulSub({ s }) {
  const [on, setOn] = React.useState(s.active);
  return <SubItem s={{ ...s, active: on }} onToggle={() => setOn(o => !o)} />;
}

function KitListas() {
  const gasto = MOVS[0], ingreso = MOVS.find(m => m.amount > 0), enUsd = MOVS.find(m => m.usd);
  return (
    <KitSection id="listas" n="14" title="Items de lista" desc="Filas reutilizables para cada dominio: transacción, suscripción, plan de cuotas, meta, presupuesto y activo. Todas comparten el patrón ícono + título + meta + valor.">
      <div className="grid lg:grid-cols-2 gap-4">
        <Spec label="Movimiento · gasto / ingreso / USD"
          api={[['m', '{desc,cat,method,amount,usd?,fx?,day}']]}
          specs={[['Patrón', 'ícono+título+meta+valor'], ['Ícono cat', '42px'], ['Monto', 'tabular-nums'], ['USD', 'FX tag debajo']]}
          responsive="Fila full-width. Título y meta truncan con ellipsis; el monto nunca se corta (shrink-0).">
          <Card className="overflow-hidden">
            <MovItem m={gasto} />
            <div className="border-t border-[var(--border)]"><MovItem m={ingreso} /></div>
            <div className="border-t border-[var(--border)]"><MovItem m={enUsd} /></div>
          </Card>
        </Spec>
        <Spec label="Suscripción · activa / pausada">
          <Card className="overflow-hidden">
            <StatefulSub s={SUBS[0]} />
            <div className="border-t border-[var(--border)]"><StatefulSub s={SUBS[6]} /></div>
          </Card>
        </Spec>
        <Spec label="Plan de cuotas" api={[['p', '{desc,total,count,paid,monthly,next}']]} specs={[['Progreso', 'paid/count'], ['Muestra', 'mensual + restante']]}><InstallmentCard p={INSTALLMENTS[0]} /></Spec>
        <Spec label="Meta de ahorro" api={[['g', '{name,icon,target,current,currency,date}']]} specs={[['Moneda', 'ARS o USD'], ['Estado', 'check al 100%']]}><GoalCard g={GOALS[0]} /></Spec>
        <Spec label="Presupuesto por categoría">
          <Card className="overflow-hidden">
            <BudgetRow b={BUDGETS[0]} />
            <div className="border-t border-[var(--border)]"><BudgetRow b={BUDGETS.find(b => b.spent >= b.budget)} /></div>
          </Card>
        </Spec>
        <Spec label="Activo de inversión" api={[['a', '{ticker,name,type,qty,avg,price,currency}'], ['cur', "'ARS'|'USD'"]]} specs={[['P&L', 'color según signo'], ['Valor', 'convertido a cur']]}>
          <Card className="overflow-hidden">
            <AssetRow a={INVEST[0]} cur="ARS" />
            <div className="border-t border-[var(--border)]"><AssetRow a={INVEST[5]} cur="USD" /></div>
          </Card>
        </Spec>
        <Spec label="Insight card · carrusel" className="lg:col-span-2">
          <div className="bg-[var(--bg)] -mx-5 px-5 py-3"><Insights layout="carousel" /></div>
        </Spec>
      </div>
    </KitSection>
  );
}

function KitNavegacion() {
  return (
    <KitSection id="navegacion" n="15" title="Navegación" desc="Bottom-nav de 5 destinos con pastilla de acento en el activo, header de pantalla con kicker y selector de mes.">
      <div className="grid sm:grid-cols-2 gap-4">
        <Spec label="Bottom navigation"
          api={[['active', 'screen id'], ['onNav', 'fn(id)']]}
          specs={[['Destinos', '5'], ['Activo', 'pill accent'], ['Alto', '~72px + safe-area'], ['Touch', '≥ 44px']]}
          responsive="Fija al fondo del viewport. Cada destino reparte ancho por igual; el label baja a 9.5px pero el hit-area se mantiene."><StatefulNav /></Spec>
        <Spec label="Selector de mes" api={[['month', 'string']]} specs={[['Flechas', '32px'], ['Touch', '≥ 44px']]}><MonthSwitcher month="Junio 2026" /></Spec>
        <Spec label="Header de pantalla" className="sm:col-span-2"
          api={[['title', 's'], ['kicker', 's?'], ['sub', 's?'], ['right', 'node?']]}
          specs={[['Título', 'poster 28px'], ['Kicker', 'label 10px'], ['Padding', 'px-5 pt-2']]}
          responsive="El slot right colapsa debajo del título si no entra. Kicker + título + sub forman la jerarquía de cada pantalla.">
          <div className="bg-[var(--bg)] -mx-5 -my-5 py-4">
            <ScreenHeader title="Movimientos" kicker="Tus mangos" sub="Todo lo que entra y sale"
              right={<MonthSwitcher month="Junio 2026" />} />
          </div>
        </Spec>
      </div>
    </KitSection>
  );
}

function KitChat() {
  return (
    <KitSection id="chat" n="16" title="Chat con IA" desc="El diferencial del producto. Burbujas propias (acento) y de Chanchito (surface), indicador de tipeo, y tarjeta de confirmación de gasto registrado por lenguaje natural.">
      <div className="grid sm:grid-cols-2 gap-4">
        <Spec label="Cabecera del chat" pad="p-0">
          <div className="flex items-center gap-3 bg-navy px-4 py-3 text-cream-light">
            <div className="grid place-items-center w-10 h-10 rounded-full bg-[var(--accent)] border-[1.5px] border-cream-light"><Chanchito size={26} fill="#1C2A47" stroke="#F4EDDC" face="#F4EDDC" /></div>
            <div className="flex-1 leading-tight"><p className="font-poster text-[16px]">Chanchito IA</p><p className="font-sans text-[11px] text-celeste flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />en línea · Gemini</p></div>
            <span className="grid place-items-center w-9 h-9 rounded-full bg-cream-light/12 text-cream-light"><Ic name="x" size={18} /></span>
          </div>
        </Spec>
        <Spec label="Indicador de tipeo">
          <Typing />
        </Spec>
        <Spec label="Hilo de conversación" className="sm:col-span-2"
          api={[['Bubble', 'from="me"|"bot"'], ['ExpenseCard', 'confirmación de gasto'], ['Typing', 'indicador']]}
          specs={[['Burbuja', 'max-w 80%'], ['Propia', 'bg accent, br-md'], ['Bot', 'surface, bl-md'], ['Anim', '.pop entrada']]}
          responsive="Panel fullscreen en mobile (cubre la pantalla). Las burbujas se alinean a su lado y el ancho máximo es 80% del canvas.">
          <div className="space-y-2.5 hatch -mx-5 -my-5 px-5 py-5">
            <Bubble from="me">Che, gasté 3 lucas en el chino 🛒</Bubble>
            <Bubble from="bot">¡Anotado! 📝 Lo metí en <b>Supermercado</b>.</Bubble>
            <ExpenseCard />
            <Bubble from="bot">Vas piola 💪 Te quedan <b>$37.700</b> pa’ el súper.</Bubble>
          </div>
        </Spec>
      </div>
    </KitSection>
  );
}

function KitVacios() {
  return (
    <KitSection id="vacios" n="17" title="Estados vacíos" desc="Cuando no hay datos, el chanchito-sello sostiene el mensaje con un tono cercano.">
      <div className="grid sm:grid-cols-2 gap-4">
        <Spec label="Sin resultados">
          <div className="py-8 text-center">
            <ChanchitoSeal size={56} disc="var(--accent)" />
            <p className="font-sans text-[13px] text-[var(--muted)] mt-3">No hay movimientos con esos filtros.</p>
            <Btn variant="soft" size="sm" className="mt-3">Limpiar filtros</Btn>
          </div>
        </Spec>
        <Spec label="Primer uso">
          <div className="py-8 text-center">
            <div className="inline-block floaty"><Chanchito size={56} /></div>
            <p className="font-poster text-[var(--text)] text-[16px] mt-2">Todavía no cargaste nada</p>
            <p className="font-sans text-[12.5px] text-[var(--muted)] mt-1 max-w-[240px] mx-auto">Mandale un audio o un mensaje a Chanchito y empezá a ver tu plata clara.</p>
            <Btn variant="accent" size="sm" className="mt-3"><Ic name="sparkle" size={14} />Probar el chat</Btn>
          </div>
        </Spec>
      </div>
    </KitSection>
  );
}

Object.assign(window, { KitListas, KitNavegacion, KitChat, KitVacios, StatefulNav, StatefulSub });
