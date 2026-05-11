import { Link, NavLink } from 'react-router-dom';
import type { ReactNode } from 'react';

const sections = [
  { to: '/docs', label: 'Index', end: true },
  { to: '/docs/app-overview', label: '1. App overview' },
  { to: '/docs/physics-stack', label: '2. Physics stack' },
  { to: '/docs/runtime-loop', label: '3. Runtime loop' },
  { to: '/docs/llm-pipeline', label: '4. LLM pipeline' },
  { to: '/docs/refactor-roadmap', label: '5. Refactor roadmap' },
  { to: '/docs/vector-arrows', label: '6. Vector arrows' },
  { to: '/docs/recordings-and-cameras', label: '7. Recordings & cameras' },
];

interface DocsLayoutProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
}

function DocsLayout({ title, subtitle, children }: DocsLayoutProps) {
  return (
    <div className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-8">
      <aside className="lg:sticky lg:top-24 lg:self-start">
        <div className="text-xs uppercase tracking-wider text-gray-500 mb-3">System docs</div>
        <nav className="flex flex-col gap-1">
          {sections.map((s) => (
            <NavLink
              key={s.to}
              to={s.to}
              end={s.end}
              className={({ isActive }) =>
                `px-3 py-2 rounded text-sm transition-colors ${
                  isActive
                    ? 'bg-primary text-white font-medium'
                    : 'text-gray-700 hover:bg-gray-200'
                }`
              }
            >
              {s.label}
            </NavLink>
          ))}
        </nav>
        <Link
          to="/"
          className="block mt-6 text-xs text-gray-500 hover:text-primary transition-colors"
        >
          ← Back to app
        </Link>
      </aside>
      <main className="min-w-0">
        <header className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
          {subtitle && <p className="mt-2 text-gray-600">{subtitle}</p>}
        </header>
        <div className="prose prose-sm sm:prose-base max-w-none text-gray-800 [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold [&_p]:my-3 [&_ul]:my-3 [&_ul]:pl-6 [&_ul]:list-disc [&_li]:my-1 [&_code]:bg-gray-100 [&_code]:px-1.5 [&_code]:py-0.5 [&_code]:rounded [&_code]:text-sm [&_a]:text-primary [&_a:hover]:underline">
          {children}
        </div>
      </main>
    </div>
  );
}

export default DocsLayout;
