import { Link } from 'react-router-dom';
import DocsLayout from './DocsLayout';

const diagrams = [
  {
    to: '/docs/app-overview',
    title: '1. App overview',
    blurb: 'How the GIST web app fits together: browser, React frontend, physics adapter layer, schema, Modal/LLM backend, Supabase. Where each refactor doc applies.',
  },
  {
    to: '/docs/physics-stack',
    title: '2. Physics stack',
    blurb: 'The PhysicsAdapter interface, two engine adapters (Planck / Rapier), and which refactors touch which layer. Cross-engine quirks are called out at the points of impact.',
  },
  {
    to: '/docs/runtime-loop',
    title: '3. Runtime loop',
    blurb: "BaseSimulation's three modes: live, precompute, replay. Where onUpdate sits in each. Why drag is set as damping and applied force is delivered as impulse.",
  },
  {
    to: '/docs/llm-pipeline',
    title: '4. LLM pipeline',
    blurb: 'The five-stage sim_pipeline (skeleton → fills → assemble), the remix variant with a routing classifier, and how the Zod schema flows into the prompt.',
  },
  {
    to: '/docs/refactor-roadmap',
    title: '5. Refactor roadmap',
    blurb: 'A docs map: each .md file as a node with edges showing dependencies, related-to links, and which slice of the codebase it touches.',
  },
  {
    to: '/docs/vector-arrows',
    title: '6. Vector arrows',
    blurb: 'Standardize the vector-arrow renderable across velocity, acceleration, and the force family. Theme module + 7 arrow kinds + 8 SVG test scenes pulled from /public/renderables.',
  },
  {
    to: '/docs/recordings-and-cameras',
    title: '7. Recordings & cameras',
    blurb: 'Rich precompute + lean replay → sealed sim artifacts (saved experimental runs, comparison library) and reference-frame cameras (relative motion, inclined-plane decomposition, Newton\'s 3rd Law contact pairs).',
  },
  {
    to: '/docs/design-philosophy',
    title: '8. Design philosophy',
    blurb: 'Diorama-scoped physics — why GIST sims are teaching dioramas rather than physics oracles. The principle behind every coefficient, default, and schema choice. First worked example: the linear-in-A air-resistance scoping.',
  },
];

const docFiles = [
  { name: 'Notes_on_Air_Resistance_Refactor.md', summary: 'Speed-driven linear damping for mass-dependent quadratic drag (Planck/Rapier). Phase 1 lands a debug toggle; Phase 2 lands schema. Bundles the Rapier mass-setter fix.' },
  { name: 'Notes_on_Applied_Forces_Refactor.md', summary: 'PhET Forces-and-Motion analogue. Per-frame impulse = F·dt. New PhysicsBody.applyImpulse method. Includes opt-in static-friction demo mode (μs ≠ μk via per-frame setFriction switching).' },
  { name: 'Notes_on_Vector_Representation_Refactor.md', summary: 'Polar projections (.magnitude / .angle) as derived path suffixes. Held-angle / held-magnitude for zero-vector edge cases. No engine changes.' },
  { name: 'Physics_Chapters_with_Physics_Engines.md', summary: 'Engine affordances mapped to seven introductory-physics units. Cross-engine cheat sheet for which engine wins per use case.' },
  { name: 'GIST_Physics_System_Topics.md', summary: 'Living index of system-level physics concerns: legacy items, cross-engine inconsistencies, idempotency patterns, adapter feature gaps. Status-tracked.' },
  { name: 'GIST_Physics_Wishlist.md', summary: 'Forward-looking feature wishlist across 14 sections: authoring, timing/events, graph matching, expressions/multi-body controls, UI tiers (must-have / QoL / power user), engagement effects.' },
  { name: 'GIST_LLM_Context_and_Prompting.md', summary: 'How the LLM pipeline is wired today, three concrete prompt bugs found in code review, improvements across content / construction / pipeline / feedback loops.' },
];

function DocsIndex() {
  return (
    <DocsLayout
      title="GIST system docs"
      subtitle="Visual companion to the physics-system .md files. Designed to help locate each refactor in the codebase and see how the pieces fit together."
    >
      <h2>Diagrams</h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 not-prose">
        {diagrams.map((d) => (
          <Link
            key={d.to}
            to={d.to}
            className="block p-5 bg-white rounded-lg border border-gray-200 hover:border-primary hover:shadow-md transition-all"
          >
            <div className="font-semibold text-gray-900 mb-1">{d.title}</div>
            <div className="text-sm text-gray-600 leading-relaxed">{d.blurb}</div>
          </Link>
        ))}
      </div>

      <h2>Source documents</h2>
      <p>
        These diagrams summarize and cross-reference the seven companion <code>.md</code> files at
        the repo root. Each diagram page links back to the relevant docs.
      </p>
      <ul className="not-prose space-y-2">
        {docFiles.map((d) => (
          <li key={d.name} className="p-3 bg-gray-50 rounded border border-gray-200">
            <code className="text-sm font-medium text-gray-900">{d.name}</code>
            <div className="mt-1 text-sm text-gray-600">{d.summary}</div>
          </li>
        ))}
      </ul>

      <h2>How to read these</h2>
      <p>
        Each diagram page has a brief explainer, the diagram itself (rendered with{' '}
        <a href="https://mermaid.js.org/" target="_blank" rel="noreferrer">
          Mermaid
        </a>
        ), and a footer linking to the relevant <code>.md</code> files. Diagrams are text-source —
        edit the chart string in the corresponding <code>.tsx</code> page to update.
      </p>
    </DocsLayout>
  );
}

export default DocsIndex;
