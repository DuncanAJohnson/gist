export const en = {
  // Navigation
  'nav.appTitle': 'Generative Interactive Simulations for Teaching',
  'nav.libraryLink': 'Simulation Library',
  'nav.createButton': 'Create New Simulation',

  // Home page
  'home.heroPrompt': 'What physics concept do you want to simulate today?',
  'home.topThisWeek': 'Top Endorsed This Week',
  'home.browseAll': 'Browse all published simulations →',
  'home.loading': 'Loading...',
  'home.emptyTopWeek': 'No endorsed simulations yet this week. Create one and endorse it to get started!',
  'home.saveFailed': 'Failed to save simulation. Please try again.',

  // Library page
  'library.heading': 'Simulation Library',
  'library.sortLabel': 'Sort:',
  'library.sortMostEndorsed': 'Most Endorsed',
  'library.sortRecent': 'Recent',
  'library.windowLabel': 'Window:',
  'library.windowThisWeek': 'This Week',
  'library.windowAllTime': 'All Time',
  'library.loading': 'Loading simulations...',
  'library.empty': 'No published simulations yet.',

  // Create simulation modal
  'create.modalTitle': 'Create New Simulation',
  'create.modalSubtitle': 'Describe the physics simulation you would like to create',
  'create.toggleUseAi': 'Use AI instead',
  'create.toggleUseJson': 'Create from JSON',
  'create.emptyHeading': 'Create a Simulation',
  'create.emptyBody': "Describe the physics simulation you'd like to create.",
  'create.examplePromptsLabel': 'Example prompts:',
  'create.example1': '"Launch a rocket into space"',
  'create.example2': '"Have a pumpkin roll down a hill"',
  'create.example3': '"Show a collision between two objects"',
  'create.generating': 'Generating simulation…',
  'create.connecting': 'Connecting…',
  'create.finalizing': 'Finalizing…',
  'create.done': 'Done',
  'create.regeneratingFromScratch': 'Re-generating from scratch…',
  'create.jsonPlaceholder': 'Paste JSON simulation configuration here...',
  'create.jsonMissingFields': 'JSON must have "title" and "objects" fields',
  'create.invalidJson': 'Invalid JSON: {message}',
  'create.unknownError': 'Unknown error',
  'create.createSimulation': 'Create Simulation',
  'create.placeholderEdits': 'Describe your edits...',
  'create.placeholderSimulation': 'Describe your simulation...',
  'create.generate': 'Generate',
  'create.jsonDetected': '✓ JSON simulation detected!',
  'create.noJsonFound': 'The AI returned a response but no valid simulation JSON was found. Check the console for the raw output.',
  'create.aiCommunicationError': 'Sorry, there was an error communicating with the AI: {error}',
  'create.remixNotConfigured': 'Remix endpoint is not configured (VITE_SIMULATION_REMIX_URL).',
  'create.noChangesNeeded': "No changes needed — that edit didn't require any updates.",
  'create.errorPrefix': 'Error: {message}',

  // DynamicSimulation page
  'dynamic.loading': 'Loading simulation...',
  'dynamic.noSimulationHeading': 'No Simulation Loaded',
  'dynamic.noSimulationBody': 'No simulation configuration was provided. Please create a new simulation or upload a JSON file.',
  'dynamic.goHome': 'Go Home',

  // Simulation list item
  'list.untitled': 'Untitled Simulation',
  'list.noDescription': 'No description',
  'list.newSimulation': 'New Simulation',
  'list.remixedFrom': 'Remixed from Simulation {id}',
  'list.endorse': 'Endorse',
  'list.removeEndorsement': 'Remove endorsement',

  // Relative time
  'time.justNow': 'just now',
  'time.minAgo': '{n} min ago',
  'time.minsAgo': '{n} mins ago',
  'time.hrAgo': '{n} hr ago',
  'time.hrsAgo': '{n} hrs ago',
  'time.dayAgo': '{n} day ago',
  'time.daysAgo': '{n} days ago',
  'time.wkAgo': '{n} wk ago',
  'time.wksAgo': '{n} wks ago',
  'time.moAgo': '{n} mo ago',
  'time.mosAgo': '{n} mos ago',
  'time.yrAgo': '{n} yr ago',
  'time.yrsAgo': '{n} yrs ago',

  // Simulation header
  'header.publish': 'Publish',
  'header.published': 'Published ✓',
  'header.publishedTooltip': 'Only the publisher can unpublish this simulation',
  'header.giveFeedback': 'Give Feedback',
  'header.remix': 'Remix',
} as const;

export type TranslationKey = keyof typeof en;
