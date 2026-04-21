/**
 * Site-admin config: which AI providers are available in this deployment.
 *
 * - `ENABLED_PROVIDERS` controls which options appear in the AiProviderSwitcher
 *   and which providers a request is allowed to hit. A request naming a
 *   disabled provider transparently falls back to `DEFAULT_PROVIDER`.
 * - `DEFAULT_PROVIDER` is used when no provider is specified and when the
 *   requested provider is disabled. Must be present in `ENABLED_PROVIDERS`.
 * - `PROVIDER_MODELS` is the model each provider should use. Add new providers
 *   here when you add them in `modal_functions/providers/`.
 *
 * To disable a provider site-wide, remove it from `ENABLED_PROVIDERS`. These
 * are imported at build time, so changes require a redeploy.
 */

export type AiProviderKind = 'openai' | 'skolegpt';

export const ENABLED_PROVIDERS: readonly AiProviderKind[] = [
  'openai',
  // 'skolegpt',
] as const;

export const DEFAULT_PROVIDER: AiProviderKind = 'openai';

export const PROVIDER_MODELS: Record<AiProviderKind, string> = {
  openai: 'gpt-5-mini',
  skolegpt: 'skolegpt-v3',
};

export const PROVIDER_LABELS: Record<AiProviderKind, string> = {
  openai: 'OpenAI',
  skolegpt: 'SkoleGPT',
};

export function isProviderEnabled(kind: AiProviderKind): boolean {
  return ENABLED_PROVIDERS.includes(kind);
}

/** Resolve a possibly-disabled provider choice to one that's actually enabled. */
export function resolveProvider(requested: AiProviderKind | undefined): AiProviderKind {
  if (requested && isProviderEnabled(requested)) return requested;
  return DEFAULT_PROVIDER;
}

export function getModelForProvider(provider: AiProviderKind): string {
  return PROVIDER_MODELS[provider];
}
