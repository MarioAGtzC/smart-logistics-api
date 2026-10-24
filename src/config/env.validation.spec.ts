import { validate } from './env.validation';

describe('validate (env)', () => {
  const valid = {
    DATABASE_URL: 'postgres://app:app@localhost:5432/logistics',
    REDIS_URL: 'redis://localhost:6379',
  };

  it('accepts a valid config and defaults PORT to 3000', () => {
    expect(validate(valid).PORT).toBe(3000);
  });

  it('converts PORT from string to number', () => {
    expect(validate({ ...valid, PORT: '8080' }).PORT).toBe(8080);
  });

  it('rejects a missing DATABASE_URL', () => {
    expect(() => validate({ REDIS_URL: valid.REDIS_URL })).toThrow(
      /DATABASE_URL/,
    );
  });

  it('rejects a DATABASE_URL with the wrong protocol', () => {
    expect(() =>
      validate({ ...valid, DATABASE_URL: 'mysql://localhost/db' }),
    ).toThrow(/DATABASE_URL/);
  });

  it('rejects an out-of-range PORT', () => {
    expect(() => validate({ ...valid, PORT: '70000' })).toThrow(/PORT/);
  });

  it('defaults BODY_LIMIT to 2mb', () => {
    expect(validate(valid).BODY_LIMIT).toBe('2mb');
  });

  it.each(['500kb', '5mb', '10MB'])('accepts BODY_LIMIT %s', (limit) => {
    expect(validate({ ...valid, BODY_LIMIT: limit }).BODY_LIMIT).toBe(limit);
  });

  it.each(['lots', '5', '5gb', 'mb'])('rejects BODY_LIMIT %s', (limit) => {
    expect(() => validate({ ...valid, BODY_LIMIT: limit })).toThrow(
      /BODY_LIMIT/,
    );
  });

  it('defaults JOB_RETENTION_SECONDS to 86400 (24 h)', () => {
    expect(validate(valid).JOB_RETENTION_SECONDS).toBe(86400);
  });

  it.each(['0', '-5', 'day'])('rejects JOB_RETENTION_SECONDS %s', (value) => {
    expect(() => validate({ ...valid, JOB_RETENTION_SECONDS: value })).toThrow(
      /JOB_RETENTION_SECONDS/,
    );
  });
});
