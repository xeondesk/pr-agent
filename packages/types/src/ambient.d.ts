declare module "@aws-sdk/client-secrets-manager" {
  export class SecretsManagerClient {
    constructor(config: Record<string, unknown>);
    send(command: GetSecretValueCommand | PutSecretValueCommand): Promise<Record<string, unknown>>;
  }

  export class GetSecretValueCommand {
    constructor(input: { SecretId: string });
  }

  export class PutSecretValueCommand {
    constructor(input: { SecretId: string; SecretString: string });
  }
}

declare module "@google-cloud/storage" {
  export class Storage {
    constructor(config?: Record<string, unknown>);
    bucket(name: string): Bucket;
  }

  export interface Bucket {
    file(name: string): File;
  }

  export interface File {
    download(): Promise<[Buffer]>;
    save(data: string): Promise<void>;
  }
}
