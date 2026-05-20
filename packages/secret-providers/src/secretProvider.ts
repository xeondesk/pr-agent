export abstract class SecretProvider {
  abstract getSecret(secretName: string): Promise<string>;
  abstract storeSecret(secretName: string, secretValue: string): Promise<void>;
}
