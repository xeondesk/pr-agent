import { createClient } from '@supabase/supabase-js';
import { gzip, gunzip } from 'zlib';
import { promisify } from 'util';
import crypto from 'crypto';

/**
 * Database Backup & Restore Utilities
 * Handles data backups, compression, encryption, and restoration
 */

const gzipAsync = promisify(gzip);
const gunzipAsync = promisify(gunzip);

export interface BackupMetadata {
  id: string;
  timestamp: string;
  size: number;
  compressedSize: number;
  tablesBackedUp: string[];
  encrypted: boolean;
  checksum: string;
  duration: number;
}

export interface RestoreOptions {
  dropExisting?: boolean;
  includeData?: boolean;
  includeMeta?: boolean;
  verbose?: boolean;
}

/**
 * Create a database backup
 */
export async function createBackup(
  userId: string,
  encryptionKey?: string
): Promise<{ data: Buffer; metadata: BackupMetadata } | null> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('[v0] Supabase not configured');
      return null;
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const startTime = Date.now();
    const backupId = crypto.randomUUID();
    const tablesBackedUp: string[] = [];
    const backupData: Record<string, any[]> = {};

    // Tables to backup
    const tables = [
      'user_profiles',
      'conversations',
      'conversation_messages',
      'webhook_configs',
      'webhook_events',
      'user_api_keys',
      'feedback',
      'audit_logs',
    ];

    // Backup each table filtered by user
    for (const table of tables) {
      try {
        const { data, error } = await supabase
          .from(table)
          .select('*')
          .eq('user_id', userId);

        if (!error && data) {
          backupData[table] = data;
          tablesBackedUp.push(table);
        }
      } catch (error) {
        console.error(`[v0] Error backing up table ${table}:`, error);
      }
    }

    // Serialize backup data
    let backupJson = JSON.stringify({
      id: backupId,
      timestamp: new Date().toISOString(),
      userId,
      data: backupData,
    });

    // Compress backup
    const compressed = await gzipAsync(backupJson);
    let finalData = compressed;

    // Optionally encrypt
    let encrypted = false;
    if (encryptionKey) {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(encryptionKey, 'hex'), iv);

      let encrypted_data = cipher.update(compressed);
      encrypted_data = Buffer.concat([encrypted_data, cipher.final()]);
      const authTag = cipher.getAuthTag();

      finalData = Buffer.concat([iv, authTag, encrypted_data]);
      encrypted = true;
    }

    // Calculate checksums
    const checksum = crypto.createHash('sha256').update(finalData).digest('hex');
    const duration = Date.now() - startTime;

    const metadata: BackupMetadata = {
      id: backupId,
      timestamp: new Date().toISOString(),
      size: Buffer.byteLength(backupJson),
      compressedSize: finalData.length,
      tablesBackedUp,
      encrypted,
      checksum,
      duration,
    };

    return { data: finalData, metadata };
  } catch (error) {
    console.error('[v0] Backup creation failed:', error);
    return null;
  }
}

/**
 * Restore from backup
 */
export async function restoreFromBackup(
  backupData: Buffer,
  userId: string,
  encryptionKey?: string,
  options: RestoreOptions = {}
): Promise<{ success: boolean; restored: number; error?: string }> {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      return { success: false, restored: 0, error: 'Supabase not configured' };
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    let decompressed: Buffer;

    // Decrypt if needed
    if (encryptionKey) {
      const iv = backupData.slice(0, 16);
      const authTag = backupData.slice(16, 32);
      const encrypted = backupData.slice(32);

      const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(encryptionKey, 'hex'), iv);
      decipher.setAuthTag(authTag);

      decompressed = Buffer.concat([
        decipher.update(encrypted),
        decipher.final(),
      ]);
    } else {
      decompressed = await gunzipAsync(backupData);
    }

    // Parse backup data
    const backupJson = decompressed.toString('utf-8');
    const backup = JSON.parse(backupJson);

    let restoredCount = 0;

    // Restore each table
    for (const [table, records] of Object.entries(backup.data)) {
      try {
        if (Array.isArray(records) && records.length > 0) {
          // Filter records to user if restoring
          const filteredRecords = (records as any[])
            .filter(r => !options.dropExisting || r.user_id === userId)
            .map(r => ({ ...r, user_id: userId }));

          if (filteredRecords.length > 0) {
            const { error } = await supabase
              .from(table)
              .upsert(filteredRecords);

            if (!error) {
              restoredCount += filteredRecords.length;
              if (options.verbose) {
                console.log(`[v0] Restored ${filteredRecords.length} records to ${table}`);
              }
            } else {
              console.error(`[v0] Error restoring table ${table}:`, error);
            }
          }
        }
      } catch (error) {
        console.error(`[v0] Error processing table ${table}:`, error);
      }
    }

    return { success: true, restored: restoredCount };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('[v0] Backup restore failed:', error);
    return { success: false, restored: 0, error: errorMessage };
  }
}

/**
 * Schedule automatic backups
 */
export function scheduleBackups(
  userId: string,
  intervalMs: number = 24 * 60 * 60 * 1000, // Daily by default
  encryptionKey?: string
): NodeJS.Timer {
  return setInterval(async () => {
    try {
      const backup = await createBackup(userId, encryptionKey);
      if (backup) {
        // Store backup metadata or upload to storage
        console.log(`[v0] Backup created: ${backup.metadata.id}`);
      }
    } catch (error) {
      console.error('[v0] Scheduled backup failed:', error);
    }
  }, intervalMs);
}

/**
 * Export backup data as downloadable file
 */
export function createBackupExport(backup: { data: Buffer; metadata: BackupMetadata }): {
  filename: string;
  data: Buffer;
  mimeType: string;
} {
  const timestamp = new Date(backup.metadata.timestamp).toISOString().split('T')[0];
  const filename = `backup-${timestamp}-${backup.metadata.id.slice(0, 8)}.bak`;

  return {
    filename,
    data: backup.data,
    mimeType: 'application/octet-stream',
  };
}

/**
 * Verify backup integrity
 */
export async function verifyBackupIntegrity(
  backupData: Buffer,
  expectedChecksum: string,
  encryptionKey?: string
): Promise<boolean> {
  try {
    // Calculate checksum of provided backup
    const checksum = crypto.createHash('sha256').update(backupData).digest('hex');
    return checksum === expectedChecksum;
  } catch (error) {
    console.error('[v0] Backup verification failed:', error);
    return false;
  }
}

/**
 * Get backup size info
 */
export function getBackupSizeInfo(metadata: BackupMetadata): {
  original: string;
  compressed: string;
  compressionRatio: string;
  estimatedMonthly: string;
} {
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  const compressionRatio = (
    ((1 - metadata.compressedSize / metadata.size) * 100)
  ).toFixed(2);

  const estimatedDaily = metadata.compressedSize;
  const estimatedMonthly = estimatedDaily * 30;

  return {
    original: formatBytes(metadata.size),
    compressed: formatBytes(metadata.compressedSize),
    compressionRatio: `${compressionRatio}%`,
    estimatedMonthly: formatBytes(estimatedMonthly),
  };
}
