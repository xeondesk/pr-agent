export { Eligibility, IdentityProvider } from "./identityProvider.js";
export { DefaultIdentityProvider } from "./defaultIdentityProvider.js";

import { getSettings } from "@pr-agent/types";
import { IdentityProvider } from "./identityProvider.js";
import { DefaultIdentityProvider } from "./defaultIdentityProvider.js";

const IDENTITY_PROVIDERS: Record<string, new () => IdentityProvider> = {
  default: DefaultIdentityProvider,
};

export function getIdentityProvider(): IdentityProvider {
  const settings = getSettings() as any;
  const providerId = settings?.config?.identity_provider ?? "default";

  const Provider = IDENTITY_PROVIDERS[providerId];
  if (!Provider) {
    throw new Error(`Unknown identity provider: ${providerId}`);
  }

  return new Provider();
}
