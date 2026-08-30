import { describe, it, expect } from 'vitest';
import {
  toFriendlyErrorMessage,
  formatFriendlyErrorForChat,
  parseFriendlyErrorFromMessage
} from './friendlyError';

describe('toFriendlyErrorMessage', () => {
  it('handles OpenRouter data-policy and guardrail restrictions with extracted URL', () => {
    const raw = 'OpenAI-compatible stream failed: 404 - {"message":"No endpoints available matching your guardrail restrictions and data policy. Configure your preferences at https://openrouter.ai/settings/preferences","code":404} (model: "google/gemini-2.0-flash-exp:free", baseUrl: "https://openrouter.ai/api/v1")';
    const result = toFriendlyErrorMessage(raw);

    expect(result.summary).toBe('No provider endpoints match your data policy or privacy settings on OpenRouter.');
    expect(result.action).toBeDefined();
    expect(result.action?.label).toBe('OpenRouter Privacy Settings');
    expect(result.action?.url).toBe('https://openrouter.ai/settings/preferences');
  });

  it('handles OpenRouter data-policy error without embedded URL by falling back to default settings URL', () => {
    const raw = 'OpenAI-compatible request failed: 404 - {"error":"No endpoints available matching your data policy"}';
    const result = toFriendlyErrorMessage(raw);

    expect(result.summary).toBe('No provider endpoints match your data policy or privacy settings on OpenRouter.');
    expect(result.action).toBeDefined();
    expect(result.action?.url).toBe('https://openrouter.ai/settings/preferences');
  });

  it('handles generic 429 and rate limit errors across providers', () => {
    const cases = [
      'Anthropic request failed: 429 rate_limit_exceeded',
      'Google stream failed: 429 Too Many Requests',
      'OpenAI-compatible request failed: 429 - {"error":{"message":"You exceeded your current quota, please check your plan and billing details."}}',
      'ResourceExhausted: Quota exceeded for aiplatform.googleapis.com'
    ];

    for (const raw of cases) {
      const result = toFriendlyErrorMessage(raw);
      expect(result.summary).toBe('Rate limit exceeded — please wait a moment before trying again or check your account quota.');
      expect(result.action).toBeUndefined();
    }
  });

  it('handles generic 401 and authentication errors across providers', () => {
    const cases = [
      'Anthropic request failed: 401 - {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}',
      'Google stream failed: 401 Unauthorized - API key not valid',
      'OpenAI-compatible request failed: 401 - {"error":{"message":"Incorrect API key provided"}}',
      '403 Forbidden - PermissionDenied'
    ];

    for (const raw of cases) {
      const result = toFriendlyErrorMessage(raw);
      expect(result.summary).toBe('Invalid or unauthorized API key — please check your credentials in Settings.');
      expect(result.action).toBeUndefined();
    }
  });

  it('handles generic 404 and model not found errors', () => {
    const cases = [
      'Google request failed: 404 NOT_FOUND - models/gemini-pro-unknown is not found for API version v1beta',
      'Anthropic stream failed: 404 - model_not_found',
      'OpenAI-compatible request failed: 404 - The model "gpt-missing" does not exist'
    ];

    for (const raw of cases) {
      const result = toFriendlyErrorMessage(raw);
      expect(result.summary).toBe('Model not found or unavailable — please verify the model ID in Settings.');
      expect(result.action).toBeUndefined();
    }
  });

  it('handles unmatched errors by returning a generic fallback summary', () => {
    const raw = 'TypeError: Failed to fetch due to abnormal socket termination (ECONNRESET)';
    const result = toFriendlyErrorMessage(raw);

    expect(result.summary).toBe('Something went wrong talking to the model provider');
    expect(result.action).toBeUndefined();
  });

  it('handles empty or blank error messages gracefully', () => {
    const result = toFriendlyErrorMessage('');
    expect(result.summary).toBe('Something went wrong talking to the model provider');
  });
});

describe('formatFriendlyErrorForChat & parseFriendlyErrorFromMessage', () => {
  it('formats friendly error with action and raw details tag', () => {
    const raw = 'OpenAI-compatible stream failed: 404 - {"message":"No endpoints available matching your guardrail restrictions and data policy. Configure your preferences at https://openrouter.ai/settings/preferences"}';
    const formatted = formatFriendlyErrorForChat(raw);

    expect(formatted).toContain('⚠️ **No provider endpoints match your data policy or privacy settings on OpenRouter.**');
    expect(formatted).toContain('[OpenRouter Privacy Settings](https://openrouter.ai/settings/preferences)');
    expect(formatted).toContain('<!-- RAW_ERROR_START -->');
    expect(formatted).toContain(raw);
    expect(formatted).toContain('<!-- RAW_ERROR_END -->');

    const parsed = parseFriendlyErrorFromMessage(formatted);
    expect(parsed.isError).toBe(true);
    expect(parsed.summary).toBe('No provider endpoints match your data policy or privacy settings on OpenRouter.');
    expect(parsed.action?.label).toBe('OpenRouter Privacy Settings');
    expect(parsed.action?.url).toBe('https://openrouter.ai/settings/preferences');
    expect(parsed.rawError).toBe(raw);
  });

  it('correctly parses legacy error messages', () => {
    const legacy = '⚠️ Request failed: Anthropic request failed: 429 rate_limit_exceeded';
    const parsed = parseFriendlyErrorFromMessage(legacy);

    expect(parsed.isError).toBe(true);
    expect(parsed.summary).toBe('Rate limit exceeded — please wait a moment before trying again or check your account quota.');
    expect(parsed.rawError).toBe('Anthropic request failed: 429 rate_limit_exceeded');
  });

  it('returns isError false for regular non-error chat messages', () => {
    const parsed = parseFriendlyErrorFromMessage('Hello! How can I help you build this project today?');
    expect(parsed.isError).toBe(false);
  });
});
