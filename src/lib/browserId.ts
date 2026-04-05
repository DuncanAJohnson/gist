const BROWSER_ID_KEY = 'gist_browser_id';

/**
 * Returns a persistent browser identifier stored in localStorage.
 * Used to throttle endorsements to one-per-browser-per-simulation
 * without requiring user accounts.
 */
export function getBrowserId(): string {
  let id = localStorage.getItem(BROWSER_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(BROWSER_ID_KEY, id);
  }
  return id;
}
