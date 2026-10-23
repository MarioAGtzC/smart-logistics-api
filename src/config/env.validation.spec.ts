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
});
