/** @covers src/config.ts */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { loadConfig } from './config.js';

describe('loadConfig', () => {
  const origEnv = { ...process.env };

  beforeEach(() => {
    // Reset to a valid baseline
    process.env.GHOST_URL = 'https://blog.example.com';
    process.env.GHOST_ADMIN_API_KEY = 'aaaaaaaaaaaaaaaaaaaaaa11:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
  });

  afterEach(() => {
    process.env = { ...origEnv };
  });

  // ── Missing env vars ──

  it('throws when GHOST_URL is missing', () => {
    delete process.env.GHOST_URL;
    expect(() => loadConfig()).toThrow('Missing required environment variables');
  });

  it('throws when GHOST_ADMIN_API_KEY is missing', () => {
    delete process.env.GHOST_ADMIN_API_KEY;
    expect(() => loadConfig()).toThrow('Missing required environment variables');
  });

  // ── HTTPS enforcement ──

  it('accepts HTTPS URL', () => {
    process.env.GHOST_URL = 'https://blog.example.com';
    const config = loadConfig();
    expect(config.ghostUrl).toBe('https://blog.example.com');
  });

  it('accepts HTTP localhost', () => {
    process.env.GHOST_URL = 'http://localhost:2368';
    const config = loadConfig();
    expect(config.ghostUrl).toBe('http://localhost:2368');
  });

  it('accepts HTTP 127.0.0.1', () => {
    process.env.GHOST_URL = 'http://127.0.0.1:2368';
    const config = loadConfig();
    expect(config.ghostUrl).toBe('http://127.0.0.1:2368');
  });

  it('rejects HTTP for non-localhost', () => {
    process.env.GHOST_URL = 'http://blog.example.com';
    expect(() => loadConfig()).toThrow('GHOST_URL must use HTTPS');
  });

  it('rejects HTTP for public IP', () => {
    process.env.GHOST_URL = 'http://203.0.113.50:2368';
    expect(() => loadConfig()).toThrow('GHOST_URL must use HTTPS');
  });

  // ── API key format ──

  it('accepts valid id:secret format', () => {
    process.env.GHOST_ADMIN_API_KEY = 'abcdef1234567890abcdef12:aabbccdd11223344aabbccdd11223344';
    const config = loadConfig();
    expect(config.ghostAdminApiKey).toBe(process.env.GHOST_ADMIN_API_KEY);
  });

  it('rejects key without colon separator', () => {
    process.env.GHOST_ADMIN_API_KEY = 'no-colon-here';
    expect(() => loadConfig()).toThrow('"id:secret" format');
  });

  it('rejects key with empty id', () => {
    process.env.GHOST_ADMIN_API_KEY = ':bbbbbbbbbbbb';
    expect(() => loadConfig()).toThrow('"id:secret" format');
  });

  it('rejects key with empty secret', () => {
    process.env.GHOST_ADMIN_API_KEY = 'aaaaaaaaaaaa:';
    expect(() => loadConfig()).toThrow('"id:secret" format');
  });

  it('rejects key with non-hex secret', () => {
    process.env.GHOST_ADMIN_API_KEY = 'aaaaaaaaaaaa:not-hex-value!';
    expect(() => loadConfig()).toThrow('hex-encoded');
  });

  it('rejects key with multiple colons', () => {
    process.env.GHOST_ADMIN_API_KEY = 'a:b:c';
    expect(() => loadConfig()).toThrow('"id:secret" format');
  });
});
