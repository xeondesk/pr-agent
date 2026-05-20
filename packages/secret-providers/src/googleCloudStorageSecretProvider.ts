import { Storage } from "@google-cloud/storage";
import { getSettings, getLogger } from "@pr-agent/types";
import { SecretProvider } from "./secretProvider.js";

export class GoogleCloudStorageSecretProvider extends SecretProvider {
  private bucket: ReturnType<Storage["bucket"]>;

  constructor() {
    super();
    try {
      const settings = getSettings() as any;
      const serviceAccount = settings?.google_cloud_storage?.service_account;

      const storage = new Storage({
        credentials:
          typeof serviceAccount === "string"
            ? JSON.parse(serviceAccount)
            : serviceAccount,
      });

      this.bucket = storage.bucket(settings?.google_cloud_storage?.bucket_name);
    } catch (e) {
      getLogger().error(
        `Failed to initialize Google Cloud Storage Secret Provider: ${e}`,
      );
      throw e;
    }
  }

  async getSecret(secretName: string): Promise<string> {
    try {
      const blob = this.bucket.file(secretName);
      const [contents] = await blob.download();
      return contents.toString();
    } catch (e) {
      getLogger().warning(
        `Failed to get secret ${secretName} from Google Cloud Storage: ${e}`,
      );
      return "";
    }
  }

  async storeSecret(secretName: string, secretValue: string): Promise<void> {
    try {
      const blob = this.bucket.file(secretName);
      await blob.save(secretValue);
    } catch (e) {
      getLogger().error(
        `Failed to store secret ${secretName} in Google Cloud Storage: ${e}`,
      );
      throw e;
    }
  }
}
