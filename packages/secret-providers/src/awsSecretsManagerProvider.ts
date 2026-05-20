import {
  SecretsManagerClient,
  GetSecretValueCommand,
  PutSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import { getSettings, getLogger } from "@pr-agent/types";
import { SecretProvider } from "./secretProvider.js";

export class AWSSecretsManagerProvider extends SecretProvider {
  private client: SecretsManagerClient;
  private secretArn: string;

  constructor() {
    super();
    try {
      const settings = getSettings() as any;
      const regionName =
        settings?.aws_secrets_manager?.region_name ??
        settings?.aws?.AWS_REGION_NAME;

      this.client = new SecretsManagerClient(
        regionName ? { region: regionName } : {},
      );

      this.secretArn = settings?.aws_secrets_manager?.secret_arn;
      if (!this.secretArn) {
        throw new Error("AWS Secrets Manager ARN is not configured");
      }
    } catch (e) {
      getLogger().error(
        `Failed to initialize AWS Secrets Manager Provider: ${e}`,
      );
      throw e;
    }
  }

  async getSecret(secretName: string): Promise<string> {
    try {
      const command = new GetSecretValueCommand({ SecretId: secretName });
      const response = (await this.client.send(command)) as Record<string, unknown>;
      return (response.SecretString as string) ?? "";
    } catch (e) {
      getLogger().warning(
        `Failed to get secret ${secretName} from AWS Secrets Manager: ${e}`,
      );
      return "";
    }
  }

  async getAllSecrets(): Promise<Record<string, unknown>> {
    try {
      const command = new GetSecretValueCommand({ SecretId: this.secretArn });
      const response: any = await this.client.send(command);
      if (response.SecretString) {
        return JSON.parse(response.SecretString) as Record<string, unknown>;
      }
      return {};
    } catch (e) {
      getLogger().error(
        `Failed to get secrets from AWS Secrets Manager ${this.secretArn}: ${e}`,
      );
      return {};
    }
  }

  async storeSecret(secretName: string, secretValue: string): Promise<void> {
    try {
      const command = new PutSecretValueCommand({
        SecretId: secretName,
        SecretString: secretValue,
      });
      await this.client.send(command);
    } catch (e) {
      getLogger().error(
        `Failed to store secret ${secretName} in AWS Secrets Manager: ${e}`,
      );
      throw e;
    }
  }
}
