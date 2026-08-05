import { ExolveTelephonyProvider } from '@/lib/telephony/providers/exolve';
import { MockTelephonyProvider } from '@/lib/telephony/providers/mock';
import type { TelephonyProvider } from '@/lib/telephony/types';

export type ProviderName = 'mock' | 'exolve';

/**
 * Переход с демо-режима на боевую телефонию — это смена одной переменной
 * окружения, а не переписывание кода (ТЗ 0.2).
 */
export function getProviderName(): ProviderName {
  const raw = (process.env.TELEPHONY_PROVIDER ?? 'mock').trim().toLowerCase();
  return raw === 'exolve' ? 'exolve' : 'mock';
}

const instances = new Map<ProviderName, TelephonyProvider>();

export function getTelephonyProvider(name: ProviderName = getProviderName()): TelephonyProvider {
  const existing = instances.get(name);
  if (existing) return existing;

  const provider: TelephonyProvider =
    name === 'exolve' ? new ExolveTelephonyProvider() : new MockTelephonyProvider();
  instances.set(name, provider);
  return provider;
}

export function isMockMode(): boolean {
  return getProviderName() === 'mock';
}

/** Адрес, который заказчик указывает в личном кабинете провайдера. */
export function webhookUrl(baseUrl: string, provider: ProviderName = getProviderName()): string {
  return `${baseUrl.replace(/\/+$/, '')}/api/webhooks/${provider}`;
}

export { MockTelephonyProvider, ExolveTelephonyProvider };
