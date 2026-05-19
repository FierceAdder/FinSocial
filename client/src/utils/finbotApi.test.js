import { describe, it, expect } from 'vitest';
import { parseFinbotPayload, finbotConnectError, unexpectedFinbotResponse } from './finbotApi';

describe('parseFinbotPayload', () => {
  it('reads reply and source', () => {
    expect(parseFinbotPayload({ reply: 'Hello', source: 'gemini' })).toEqual({
      reply: 'Hello',
      source: 'gemini',
    });
  });

  it('reads error field', () => {
    expect(parseFinbotPayload({ error: 'Unauthorized' })).toEqual({
      reply: 'Unauthorized',
      source: 'error',
    });
  });

  it('parses JSON string bodies', () => {
    expect(parseFinbotPayload('{"reply":"ok","source":"fallback"}')).toEqual({
      reply: 'ok',
      source: 'fallback',
    });
  });
});

describe('finbotConnectError', () => {
  it('uses response reply when present', () => {
    const err = { response: { status: 503, data: { reply: 'Service down', source: 'error' } } };
    expect(finbotConnectError(err).reply).toBe('Service down');
  });

  it('handles network errors', () => {
    expect(finbotConnectError({ code: 'ERR_NETWORK' }).reply).toMatch(/could not reach the core API/i);
  });

  it('does not treat null as a network error', () => {
    expect(finbotConnectError(null).reply).toMatch(/responded but without a FinBot reply/i);
  });
});

describe('unexpectedFinbotResponse', () => {
  it('returns a distinct message', () => {
    expect(unexpectedFinbotResponse().reply).toMatch(/without a FinBot reply/i);
  });
});
