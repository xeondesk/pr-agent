import { Eligibility, IdentityProvider } from "./identityProvider.js";

export class DefaultIdentityProvider extends IdentityProvider {
  async verifyEligibility(
    _gitProvider: unknown,
    _gitProviderId: string,
    _prUrl: string,
  ): Promise<Eligibility> {
    return Eligibility.ELIGIBLE;
  }

  async incInvocationCount(
    _gitProvider: unknown,
    _gitProviderId: string,
  ): Promise<void> {
  }
}
