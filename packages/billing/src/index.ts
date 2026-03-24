export interface UsageQuota {
  monthlyLimit: number;
  monthlyUsed: number;
}

export function canInvoke(quota: UsageQuota): boolean {
  return quota.monthlyUsed < quota.monthlyLimit;
}
