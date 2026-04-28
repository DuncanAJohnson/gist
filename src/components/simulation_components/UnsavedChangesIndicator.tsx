interface UnsavedChangesIndicatorProps {
  visible: boolean;
  saving: boolean;
  onSave: () => void;
}

function UnsavedChangesIndicator({ visible, saving, onSave }: UnsavedChangesIndicatorProps) {
  if (!visible) return null;
  return (
    <div className="fixed bottom-4 left-4 z-50 flex items-center gap-3 bg-white rounded-lg shadow-lg border border-slate-200 px-4 py-3">
      <span className="text-sm text-slate-700">You have unsaved changes</span>
      <button
        onClick={onSave}
        disabled={saving}
        className="px-3 py-1.5 bg-blue-600 text-white rounded-md text-sm font-medium hover:bg-blue-700 disabled:bg-blue-400 disabled:cursor-not-allowed transition-colors"
      >
        {saving ? 'Saving…' : 'Save now'}
      </button>
    </div>
  );
}

export default UnsavedChangesIndicator;
