export { SecretProvider } from "./secretProvider.js";
export { AWSSecretsManagerProvider } from "./awsSecretsManagerProvider.js";
export { GoogleCloudStorageSecretProvider } from "./googleCloudStorageSecretProvider.js";

import { getSettings } from "@pr-agent/types";
import { SecretProvider } from "./secretProvider.js";

export async function getSecretProvider(): Promise<SecretProvider | null> {
  const settings = getSettings() as any;
  const providerId = settings?.config?.secret_provider;

  if (!providerId) {
    return null;
  }

  if (providerId === "google_cloud_storage") {
    try {
      const { GoogleCloudStorageSecretProvider } = await import("./googleCloudStorageSecretProvider.js");
      return new GoogleCloudStorageSecretProvider();
    } catch (e) {
      throw new Error(
        `Failed to initialize google_cloud_storage secret provider ${providerId}: ${e}`,
      );
    }
  } else if (providerId === "aws_secrets_manager") {
    try {
      const { AWSSecretsManagerProvider } = await import("./awsSecretsManagerProvider.js");
      return new AWSSecretsManagerProvider();
    } catch (e) {
      throw new Error(
        `Failed to initialize aws_secrets_manager secret provider ${providerId}: ${e}`,
      );
    }
  } else {
    throw new Error("Unknown SECRET_PROVIDER");
  }
}
