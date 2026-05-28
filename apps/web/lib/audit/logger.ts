import { log } from '@/lib/logging/logger';

export enum AuditEventType {
  // Authentication events
  LOGIN = 'LOGIN',
  LOGOUT = 'LOGOUT',
  LOGIN_FAILED = 'LOGIN_FAILED',
  PASSWORD_CHANGE = 'PASSWORD_CHANGE',
  PASSWORD_RESET = 'PASSWORD_RESET',
  MFA_ENABLE = 'MFA_ENABLE',
  MFA_DISABLE = 'MFA_DISABLE',
  SESSION_CREATED = 'SESSION_CREATED',
  SESSION_EXPIRED = 'SESSION_EXPIRED',

  // Authorization events
  PERMISSION_GRANTED = 'PERMISSION_GRANTED',
  PERMISSION_REVOKED = 'PERMISSION_REVOKED',
  ROLE_ASSIGNED = 'ROLE_ASSIGNED',
  ROLE_REMOVED = 'ROLE_REMOVED',
  ACCESS_DENIED = 'ACCESS_DENIED',

  // Data events
  DATA_CREATED = 'DATA_CREATED',
  DATA_UPDATED = 'DATA_UPDATED',
  DATA_DELETED = 'DATA_DELETED',
  DATA_ACCESSED = 'DATA_ACCESSED',
  DATA_EXPORTED = 'DATA_EXPORTED',

  // Configuration events
  CONFIG_CHANGED = 'CONFIG_CHANGED',
  API_KEY_CREATED = 'API_KEY_CREATED',
  API_KEY_REVOKED = 'API_KEY_REVOKED',
  WEBHOOK_REGISTERED = 'WEBHOOK_REGISTERED',
  WEBHOOK_FAILED = 'WEBHOOK_FAILED',

  // Security events
  VULNERABILITY_FOUND = 'VULNERABILITY_FOUND',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
  BRUTE_FORCE_ATTEMPT = 'BRUTE_FORCE_ATTEMPT',
  IP_BLOCKED = 'IP_BLOCKED',

  // System events
  DEPLOYMENT = 'DEPLOYMENT',
  DATABASE_MIGRATION = 'DATABASE_MIGRATION',
  BACKUP_CREATED = 'BACKUP_CREATED',
  ERROR_OCCURRED = 'ERROR_OCCURRED',
}

export interface AuditLogEntry {
  id?: string;
  timestamp: number;
  eventType: AuditEventType;
  userId?: string;
  ipAddress: string;
  userAgent?: string;
  resourceType?: string;
  resourceId?: string;
  action: string;
  details?: Record<string, unknown>;
  result: 'SUCCESS' | 'FAILURE';
  errorMessage?: string;
}

// In-memory audit log (in production, use database)
class AuditLogger {
  private logs: AuditLogEntry[] = [];
  private maxLogs: number = 10000; // Max in-memory logs

  /**
   * Log an audit event
   */
  logEvent(entry: Omit<AuditLogEntry, 'timestamp' | 'id'>): void {
    const auditEntry: AuditLogEntry = {
      id: this.generateId(),
      timestamp: Date.now(),
      ...entry,
    };

    this.logs.push(auditEntry);

    // Trim old logs if exceeding max
    if (this.logs.length > this.maxLogs) {
      this.logs = this.logs.slice(-this.maxLogs);
    }

    // Also log to application logger
    log.info(`Audit: ${entry.eventType}`, {
      eventType: entry.eventType,
      userId: entry.userId,
      ipAddress: entry.ipAddress,
      resourceType: entry.resourceType,
      result: entry.result,
      ...(entry.errorMessage && { error: entry.errorMessage }),
    });
  }

  /**
   * Get audit logs with filtering
   */
  getLogs(filter?: {
    eventType?: AuditEventType;
    userId?: string;
    resourceType?: string;
    startDate?: number;
    endDate?: number;
    limit?: number;
  }): AuditLogEntry[] {
    let filtered = [...this.logs];

    if (filter?.eventType) {
      filtered = filtered.filter((log) => log.eventType === filter.eventType);
    }

    if (filter?.userId) {
      filtered = filtered.filter((log) => log.userId === filter.userId);
    }

    if (filter?.resourceType) {
      filtered = filtered.filter((log) => log.resourceType === filter.resourceType);
    }

    if (filter?.startDate) {
      filtered = filtered.filter((log) => log.timestamp >= filter.startDate!);
    }

    if (filter?.endDate) {
      filtered = filtered.filter((log) => log.timestamp <= filter.endDate!);
    }

    // Return in reverse chronological order
    filtered.reverse();

    if (filter?.limit) {
      return filtered.slice(0, filter.limit);
    }

    return filtered;
  }

  /**
   * Clear audit logs
   */
  clear(): void {
    this.logs = [];
  }

  /**
   * Get audit log statistics
   */
  getStats(): Record<string, number> {
    const stats: Record<string, number> = {};

    for (const log of this.logs) {
      stats[log.eventType] = (stats[log.eventType] || 0) + 1;
    }

    return stats;
  }

  private generateId(): string {
    return `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Singleton instance
const auditLogger = new AuditLogger();

/**
 * Log authentication event
 */
export function logAuthEvent(
  eventType: AuditEventType,
  userId: string | undefined,
  ipAddress: string,
  result: 'SUCCESS' | 'FAILURE',
  errorMessage?: string
): void {
  auditLogger.logEvent({
    eventType,
    userId,
    ipAddress,
    action: `User ${result === 'SUCCESS' ? 'successfully' : 'failed to'} ${eventType.toLowerCase()}`,
    result,
    errorMessage,
  });
}

/**
 * Log data access event
 */
export function logDataEvent(
  eventType: AuditEventType,
  userId: string,
  ipAddress: string,
  resourceType: string,
  resourceId: string,
  details?: Record<string, unknown>
): void {
  auditLogger.logEvent({
    eventType,
    userId,
    ipAddress,
    resourceType,
    resourceId,
    action: `${eventType} on ${resourceType} ${resourceId}`,
    details,
    result: 'SUCCESS',
  });
}

/**
 * Log security event
 */
export function logSecurityEvent(
  eventType: AuditEventType,
  ipAddress: string,
  action: string,
  details?: Record<string, unknown>
): void {
  auditLogger.logEvent({
    eventType,
    ipAddress,
    action,
    details,
    result: 'FAILURE',
  });
}

/**
 * Get audit logs
 */
export function getAuditLogs(filter?: Parameters<typeof auditLogger.getLogs>[0]): AuditLogEntry[] {
  return auditLogger.getLogs(filter);
}

/**
 * Get audit statistics
 */
export function getAuditStats(): Record<string, number> {
  return auditLogger.getStats();
}

export { auditLogger };
