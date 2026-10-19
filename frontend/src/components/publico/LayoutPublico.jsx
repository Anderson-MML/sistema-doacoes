import { Link, Outlet } from 'react-router-dom';
import { AvisoModoSimulado } from '../AvisoModoSimulado.jsx';

export function LayoutPublico() {
  return (
    <div className="flex min-h-screen flex-col">
      <a href="#conteudo" className="pular-link">Pular para o conteúdo</a>
      <AvisoModoSimulado />
      <header className="border-b border-linha bg-papel">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4">
          <Link to="/" className="flex items-center gap-3 rounded-md no-underline">
            <MarcaLar />
            <span className="leading-tight">
              <span className="block text-xl font-bold">Lar Ternura</span>
              <span className="block text-sm text-tinta-suave">Doações</span>
            </span>
          </Link>
        </div>
      </header>

      <main id="conteudo" tabIndex={-1} className="flex-1 outline-none">
        <Outlet />
      </main>

      <footer className="mt-12 border-t border-linha bg-nevoa">
        <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-6 text-sm text-tinta-suave sm:flex-row sm:justify-between">
          <p>Associação Lar Ternura, Zona Oeste de São Paulo</p>
          <Link to="/admin" className="font-bold text-lar underline underline-offset-2">Área da equipe</Link>
        </div>
      </footer>
    </div>
  );
}

/** Marca simples: casa com coração. Decorativa (o nome já está em texto ao lado). */
function MarcaLar() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" aria-hidden="true" focusable="false">
      <rect width="40" height="40" rx="10" fill="var(--color-lar)" />
      <path d="M8 19 20 9l12 10v12a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1Z" fill="#fff" />
      <path d="M20 29s-6-3.6-6-7.4A3.2 3.2 0 0 1 20 20a3.2 3.2 0 0 1 6 1.6C26 25.4 20 29 20 29Z" fill="var(--color-alta)" />
    </svg>
  );
}
