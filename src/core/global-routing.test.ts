import { describe, expect, it, vi } from 'vitest';
import {
  advancePriorityOnRetry,
  isPriorityFallbackError,
  nextFallbackRoute,
  type Route,
  type Routes,
} from './global-routing.ts';

const route = (id: string, reference: string): Route => {
  const [providerID, modelID] = reference.split('/');
  return {
    id,
    alias: 'Writer',
    model: { providerID, id: modelID },
    options: {},
  } as Route;
};

const routes: Routes = new Map([
  ['Writer', [route('Primary', 'openai/primary'), route('Backup', 'anthropic/backup'), route('Last', 'google/last')]],
]);

describe('priority model fallback', () => {
  it('recognizes quota, usage-limit, and rate-limit failures', () => {
    expect(isPriorityFallbackError({ type: 'QuotaExceeded', message: 'Go usage limit exceeded' })).toBe(true);
    expect(isPriorityFallbackError({ type: 'APIError', message: 'HTTP 429 too many requests' })).toBe(true);
    expect(isPriorityFallbackError({ type: 'APIError', message: 'model not found' })).toBe(false);
  });

  it('advances from the model that failed and does not wrap after the last priority', () => {
    const pins = new Map<string, Route>([['session', route('Primary', 'openai/primary')]]);
    expect(nextFallbackRoute('session', 'Writer', route('Primary', 'openai/primary').model, routes, pins)?.id).toBe(
      'Backup',
    );
    expect(nextFallbackRoute('session', 'Writer', route('Last', 'google/last').model, routes, pins)).toBeUndefined();
  });

  it('uses the session pin when the failed model has a different variant', () => {
    const pinned = route('Primary', 'openai/primary');
    pinned.model = { ...pinned.model, variant: 'reasoning' } as Route['model'];
    const pins = new Map<string, Route>([['session', pinned]]);

    expect(nextFallbackRoute('session', 'Writer', route('Primary', 'openai/primary').model, routes, pins)?.id).toBe(
      'Backup',
    );
  });

  it('can locate the failed route from its model when the session has no pin', () => {
    expect(
      nextFallbackRoute('new-session', 'Writer', route('Backup', 'anthropic/backup').model, routes, new Map())?.id,
    ).toBe('Last');
  });

  it('switches to the next priority before retrying the same session turn', async () => {
    const pins = new Map<string, Route>([['session', route('Primary', 'openai/primary')]]);
    const event = {
      sessionID: 'session',
      agent: 'Writer',
      model: route('Primary', 'openai/primary').model,
      error: { type: 'provider.quota', message: 'Go usage limit exceeded', status: 429 },
      decision: { retry: false },
    };
    const switchModel = vi.fn(async () => undefined);

    const fallback = await advancePriorityOnRetry(event, routes, pins, switchModel);

    expect(fallback?.id).toBe('Backup');
    expect(switchModel).toHaveBeenCalledWith('session', fallback?.model);
    expect(pins.get('session')?.id).toBe('Backup');
    expect(event.decision).toEqual({ retry: true, delay: 0 });
  });

  it('does not switch for other errors or after exhausting the priority chain', async () => {
    const event = {
      sessionID: 'session',
      agent: 'Writer',
      model: route('Primary', 'openai/primary').model,
      error: { type: 'APIError', message: 'model not found' },
      decision: { retry: false },
    };
    const switchModel = vi.fn(async () => undefined);
    const pins = new Map<string, Route>([['session', route('Last', 'google/last')]]);

    expect(await advancePriorityOnRetry(event, routes, pins, switchModel)).toBeUndefined();
    event.error = { type: 'QuotaExceeded', message: 'usage limit exceeded' };
    event.model = route('Last', 'google/last').model;
    expect(await advancePriorityOnRetry(event, routes, pins, switchModel)).toBeUndefined();
    expect(switchModel).not.toHaveBeenCalled();
  });
});
