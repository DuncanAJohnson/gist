import type { ReactNode } from 'react';

interface PanelProps {
  title?: string;
  children: ReactNode;
  className?: string;
}

function Panel({ title, children, className = '' }: PanelProps) {
  return (
    <div className={`bg-white rounded-lg p-6 shadow-md ${className}`}>
      {title && (
        <h3 className="m-0 mb-4 text-lg text-gray-800 border-b-2 border-primary pb-2">
          {title}
        </h3>
      )}
      <div className="flex flex-col gap-2">
        {children}
      </div>
    </div>
  );
}

export default Panel;

