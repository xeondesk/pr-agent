import type { CapabilityPermissions, DEFAULT_PERMISSIONS } from "@pr-agent/capability-types";

type PermissionKey = keyof typeof DEFAULT_PERMISSIONS;

export class PermissionChecker {
  private granted: Readonly<CapabilityPermissions>;

  constructor(granted: CapabilityPermissions) {
    this.granted = Object.freeze({ ...granted });
  }

  check(permission: PermissionKey): void {
    if (!this.granted[permission]) {
      throw new Error(`Permission "${permission}" is not granted`);
    }
  }

  checkAll(permissions: PermissionKey[]): void {
    for (const perm of permissions) {
      this.check(perm);
    }
  }

  has(permission: PermissionKey): boolean {
    return this.granted[permission] === true;
  }

  toJSON(): Readonly<CapabilityPermissions> {
    return this.granted;
  }
}

export function mergePermissions(
  base: CapabilityPermissions,
  requested: CapabilityPermissions,
): CapabilityPermissions {
  return {
    ai: base.ai && requested.ai,
    network: base.network && requested.network,
    filesystem: base.filesystem && requested.filesystem,
    git: base.git && requested.git,
    memory: base.memory && requested.memory,
  };
}

export function restrictPermissions(
  base: CapabilityPermissions,
  restrictions: Partial<CapabilityPermissions>,
): CapabilityPermissions {
  return {
    ai: base.ai && (restrictions.ai ?? true),
    network: base.network && (restrictions.network ?? true),
    filesystem: base.filesystem && (restrictions.filesystem ?? true),
    git: base.git && (restrictions.git ?? true),
    memory: base.memory && (restrictions.memory ?? true),
  };
}
