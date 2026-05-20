export enum Eligibility {
  NOT_ELIGIBLE = 0,
  ELIGIBLE = 1,
  TRIAL = 2,
}

export abstract class IdentityProvider {
  abstract verifyEligibility(
    gitProvider: unknown,
    gitProviderId: string,
    prUrl: string,
  ): Promise<Eligibility>;

  abstract incInvocationCount(
    gitProvider: unknown,
    gitProviderId: string,
  ): Promise<void>;
}
