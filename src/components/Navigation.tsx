import { Link } from 'react-router-dom';
import { useCreateSimulation } from '../contexts/CreateSimulationContext';
import { useLanguage } from '../contexts/LanguageContext';

function Navigation() {
  const { openModal } = useCreateSimulation();
  const { lang, switchLang, t } = useLanguage();

  return (
    <nav className="bg-primary shadow-md sticky top-0 z-[100]">
      <div className="max-w-7xl mx-auto px-8 py-4 flex justify-between items-center">
        <Link
          to="/"
          className="text-2xl font-bold text-white no-underline transition-opacity duration-200 hover:opacity-90"
        >
          {t('nav.appTitle')}
        </Link>
        <div className="flex gap-6 items-center">
          <Link
            to="/library"
            className="text-white no-underline font-medium transition-colors duration-200 px-4 py-2 rounded hover:bg-white/10"
          >
            {t('nav.libraryLink')}
          </Link>
          <button
            onClick={openModal}
            className="text-white no-underline font-medium transition-colors duration-200 px-4 py-2 rounded hover:bg-white/10"
          >
            {t('nav.createButton')}
          </button>
          <div className="flex items-center border border-white/30 rounded overflow-hidden">
            <button
              onClick={() => switchLang('da')}
              className={`px-2 py-1 text-sm font-medium transition-colors ${
                lang === 'da'
                  ? 'bg-white/20 text-white'
                  : 'text-white/70 hover:text-white hover:bg-white/10'
              }`}
            >
              DA
            </button>
            <button
              onClick={() => switchLang('en')}
              className={`px-2 py-1 text-sm font-medium transition-colors ${
                lang === 'en'
                  ? 'bg-white/20 text-white'
                  : 'text-white/70 hover:text-white hover:bg-white/10'
              }`}
            >
              EN
            </button>
          </div>
        </div>
      </div>
    </nav>
  );
}

export default Navigation;
