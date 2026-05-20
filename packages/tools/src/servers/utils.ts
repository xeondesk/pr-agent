import crypto from 'crypto';

export class HttpError extends Error {
  statusCode: number;
  constructor(statusCode: number, message: string) {
    super(message);
    this.statusCode = statusCode;
  }
}

export function verifySignature(
  payloadBody: string | Buffer,
  secretToken: string,
  signatureHeader: string
): void {
  if (!signatureHeader) {
    throw new HttpError(403, 'x-hub-signature-256 header is missing!');
  }

  const hash = crypto
    .createHmac('sha256', secretToken)
    .update(
      typeof payloadBody === 'string' ? payloadBody : payloadBody.toString()
    )
    .digest('hex');

  const expectedSignature = `sha256=${hash}`;

  if (!crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(signatureHeader)
  )) {
    throw new HttpError(403, "Request signatures didn't match!");
  }
}

export class RateLimitExceeded extends Error {
  constructor(message?: string) {
    super(message || 'Git provider API rate limit has been exceeded.');
    this.name = 'RateLimitExceeded';
  }
}

interface KeyTimeEntry {
  time: number;
}

export class DefaultDictWithTimeout<V> {
  private map: Map<string, V> = new Map();
  private keyTimes: Map<string, number> = new Map();
  private ttl: number | null;
  private refreshInterval: number;
  private updateKeyTimeOnGet: boolean;
  private lastRefresh: number;
  private defaultFactory: (() => V) | null;

  constructor(
    defaultFactory: (() => V) | null = null,
    ttl: number | null = null,
    refreshInterval: number = 60,
    updateKeyTimeOnGet: boolean = true
  ) {
    this.defaultFactory = defaultFactory;
    this.ttl = ttl;
    this.refreshInterval = refreshInterval;
    this.updateKeyTimeOnGet = updateKeyTimeOnGet;
    this.lastRefresh = Date.now() - refreshInterval;
  }

  private now(): number {
    return Date.now() / 1000;
  }

  private refresh(): void {
    if (this.ttl === null) return;
    const requestTime = this.now();
    if (requestTime - this.lastRefresh <= this.refreshInterval) return;

    const toDelete: string[] = [];
    for (const [key, keyTime] of this.keyTimes) {
      if (requestTime - keyTime > this.ttl) {
        toDelete.push(key);
      }
    }
    for (const key of toDelete) {
      this.map.delete(key);
      this.keyTimes.delete(key);
    }
    this.lastRefresh = requestTime;
  }

  get(key: string): V {
    if (this.updateKeyTimeOnGet) {
      this.keyTimes.set(key, this.now());
    }
    this.refresh();

    if (!this.map.has(key) && this.defaultFactory) {
      this.map.set(key, this.defaultFactory());
      this.keyTimes.set(key, this.now());
    }

    return this.map.get(key) as V;
  }

  set(key: string, value: V): void {
    this.keyTimes.set(key, this.now());
    this.map.set(key, value);
  }

  delete(key: string): void {
    this.keyTimes.delete(key);
    this.map.delete(key);
  }

  has(key: string): boolean {
    return this.map.has(key);
  }

  get size(): number {
    return this.map.size;
  }

  keys(): IterableIterator<string> {
    return this.map.keys();
  }

  values(): IterableIterator<V> {
    return this.map.values();
  }

  entries(): IterableIterator<[string, V]> {
    return this.map.entries();
  }

  clear(): void {
    this.map.clear();
    this.keyTimes.clear();
  }
}
