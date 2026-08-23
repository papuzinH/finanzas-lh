/** El pie: firma y fuentes. El link al caso del portfolio se suma cuando exista. */
export function Pie() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-[1100px] flex-wrap items-center justify-between gap-3 px-6 py-8 text-[12.5px] text-faint">
        <p>
          Hecho por{' '}
          <a href="https://lhstudio.com.ar" className="font-bold text-muted hover:text-text" rel="noopener">
            LH Studio
          </a>
        </p>
        <a href="https://github.com/papuzinH/finanzas-lh" className="hover:text-text" rel="noopener">
          github.com/papuzinH/finanzas-lh
        </a>
      </div>
    </footer>
  )
}
