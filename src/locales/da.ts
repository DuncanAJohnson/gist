import { en } from './en';

export const da: typeof en = {
  // Navigation
  'nav.appTitle': 'Generative Interaktive Simuleringer til Undervisning',
  'nav.libraryLink': 'Simuleringsbibliotek',
  'nav.createButton': 'Opret Ny Simulering',

  // Home page
  'home.heroPrompt': 'Hvilket fysisk begreb vil du simulere i dag?',
  'home.topThisWeek': 'Mest Anbefalede Denne Uge',
  'home.browseAll': 'Gennemse alle publicerede simuleringer →',
  'home.loading': 'Indlæser...',
  'home.emptyTopWeek': 'Ingen anbefalede simuleringer endnu denne uge. Opret en og anbefal den for at komme i gang!',
  'home.saveFailed': 'Kunne ikke gemme simuleringen. Prøv venligst igen.',

  // Library page
  'library.heading': 'Simuleringsbibliotek',
  'library.sortLabel': 'Sortér:',
  'library.sortMostEndorsed': 'Mest Anbefalede',
  'library.sortRecent': 'Nyeste',
  'library.windowLabel': 'Periode:',
  'library.windowThisWeek': 'Denne Uge',
  'library.windowAllTime': 'Hele Tiden',
  'library.loading': 'Indlæser simuleringer...',
  'library.empty': 'Ingen publicerede simuleringer endnu.',

  // Create simulation modal
  'create.modalTitle': 'Opret Ny Simulering',
  'create.modalSubtitle': 'Beskriv den fysiksimulering du gerne vil oprette',
  'create.toggleUseAi': 'Brug AI i stedet',
  'create.toggleUseJson': 'Opret fra JSON',
  'create.emptyHeading': 'Opret en Simulering',
  'create.emptyBody': 'Beskriv den fysiksimulering du gerne vil oprette.',
  'create.examplePromptsLabel': 'Eksempler på prompts:',
  'create.example1': '"Affyr en raket ud i rummet"',
  'create.example2': '"Få et græskar til at rulle ned ad en bakke"',
  'create.example3': '"Vis et sammenstød mellem to objekter"',
  'create.generating': 'Genererer simulering…',
  'create.connecting': 'Forbinder…',
  'create.finalizing': 'Færdiggør…',
  'create.done': 'Færdig',
  'create.regeneratingFromScratch': 'Genererer forfra…',
  'create.jsonPlaceholder': 'Indsæt JSON-simuleringskonfiguration her...',
  'create.jsonMissingFields': 'JSON skal have felterne "title" og "objects"',
  'create.invalidJson': 'Ugyldig JSON: {message}',
  'create.unknownError': 'Ukendt fejl',
  'create.createSimulation': 'Opret Simulering',
  'create.placeholderEdits': 'Beskriv dine ændringer...',
  'create.placeholderSimulation': 'Beskriv din simulering...',
  'create.generate': 'Generér',
  'create.jsonDetected': '✓ JSON-simulering opdaget!',
  'create.noJsonFound': 'AI\'en returnerede et svar, men ingen gyldig simulerings-JSON blev fundet. Tjek konsollen for det rå output.',
  'create.aiCommunicationError': 'Beklager, der opstod en fejl i kommunikationen med AI\'en: {error}',
  'create.remixNotConfigured': 'Remix-endepunktet er ikke konfigureret (VITE_SIMULATION_REMIX_URL).',
  'create.noChangesNeeded': 'Ingen ændringer nødvendige — den redigering krævede ingen opdateringer.',
  'create.errorPrefix': 'Fejl: {message}',

  // DynamicSimulation page
  'dynamic.loading': 'Indlæser simulering...',
  'dynamic.noSimulationHeading': 'Ingen Simulering Indlæst',
  'dynamic.noSimulationBody': 'Ingen simuleringskonfiguration blev angivet. Opret venligst en ny simulering eller upload en JSON-fil.',
  'dynamic.goHome': 'Gå til Forsiden',

  // Simulation list item
  'list.untitled': 'Unavngivet Simulering',
  'list.noDescription': 'Ingen beskrivelse',
  'list.newSimulation': 'Ny Simulering',
  'list.remixedFrom': 'Remixet fra Simulering {id}',
  'list.endorse': 'Anbefal',
  'list.removeEndorsement': 'Fjern anbefaling',

  // Relative time
  'time.justNow': 'lige nu',
  'time.minAgo': '{n} min siden',
  'time.minsAgo': '{n} min siden',
  'time.hrAgo': '{n} time siden',
  'time.hrsAgo': '{n} timer siden',
  'time.dayAgo': '{n} dag siden',
  'time.daysAgo': '{n} dage siden',
  'time.wkAgo': '{n} uge siden',
  'time.wksAgo': '{n} uger siden',
  'time.moAgo': '{n} måned siden',
  'time.mosAgo': '{n} måneder siden',
  'time.yrAgo': '{n} år siden',
  'time.yrsAgo': '{n} år siden',

  // Simulation header
  'header.publish': 'Publicér',
  'header.published': 'Publiceret ✓',
  'header.publishedTooltip': 'Kun udgiveren kan afpublicere denne simulering',
  'header.giveFeedback': 'Giv Feedback',
  'header.remix': 'Remix',
};
