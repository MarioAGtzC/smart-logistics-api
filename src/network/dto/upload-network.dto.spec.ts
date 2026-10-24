import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { UploadNetworkDto } from './upload-network.dto';

// Same options as the global ValidationPipe in main.ts.
const errorsFor = async (body: unknown) => {
  const dto = plainToInstance(UploadNetworkDto, body);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return JSON.stringify(errors);
};

const edge = (overrides: Record<string, unknown> = {}) => ({
  from: 'A',
  to: 'B',
  cost: 10,
  ...overrides,
});

describe('UploadNetworkDto', () => {
  it('accepts the README graph', async () => {
    const body = {
      edges: [
        {
          from: 'A',
          to: 'B',
          cost: 10,
          maxWeight: 10000,
          noHazardous: false,
          trafficMultiplier: 1.0,
        },
        {
          from: 'A',
          to: 'C',
          cost: 15,
          maxWeight: 5000,
          noHazardous: true,
          trafficMultiplier: 1.5,
        },
      ],
    };
    expect(await errorsFor(body)).toBe('[]');
  });

  it('accepts an edge with only from, to and cost, and cost 0', async () => {
    expect(await errorsFor({ edges: [edge({ cost: 0 })] })).toBe('[]');
  });

  it.each([
    ['a negative cost', { edges: [edge({ cost: -1 })] }, 'cost'],
    ['a non-numeric cost', { edges: [edge({ cost: '10' })] }, 'cost'],
    ['an empty edges list', { edges: [] }, 'edges'],
    ['a missing edges list', {}, 'edges'],
    ['a missing from', { edges: [{ to: 'B', cost: 1 }] }, 'from'],
    ['an empty to', { edges: [edge({ to: '' })] }, 'to'],
    [
      'a NUL character in from (Postgres text rejects it)',
      { edges: [edge({ from: 'A\u0000' })] },
      'from',
    ],
    ['a NUL character in to', { edges: [edge({ to: '\u0000' })] }, 'to'],
    ['an extra field on the body', { edges: [edge()], name: 'x' }, 'name'],
    ['an extra field on an edge', { edges: [edge({ speed: 3 })] }, 'speed'],
    ['maxWeight 0', { edges: [edge({ maxWeight: 0 })] }, 'maxWeight'],
    [
      'trafficMultiplier 0',
      { edges: [edge({ trafficMultiplier: 0 })] },
      'trafficMultiplier',
    ],
    [
      'a string noHazardous',
      { edges: [edge({ noHazardous: 'yes' })] },
      'noHazardous',
    ],
  ])('rejects %s', async (_, body, property) => {
    expect(await errorsFor(body)).toContain(`"property":"${property}"`);
  });

  it('accepts 10 000 edges and rejects 10 001', async () => {
    const many = (n: number) => ({
      edges: Array.from({ length: n }, (_, i) => edge({ to: `N${i}` })),
    });
    expect(await errorsFor(many(10000))).toBe('[]');
    expect(await errorsFor(many(10001))).toContain('"property":"edges"');
  });
});
