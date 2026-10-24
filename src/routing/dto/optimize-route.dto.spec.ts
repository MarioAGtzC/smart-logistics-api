import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { OptimizeRouteDto } from './optimize-route.dto';

// Same options as the global ValidationPipe in main.ts.
const errorsFor = async (body: unknown) => {
  const dto = plainToInstance(OptimizeRouteDto, body);
  const errors = await validate(dto, {
    whitelist: true,
    forbidNonWhitelisted: true,
  });
  return JSON.stringify(errors);
};

// Request body from the README.
const readmeRequest = {
  originNodeId: 'A',
  destinationNodeId: 'E',
  waypoints: ['C'],
  vehicleProfile: { type: 'truck', weight: 4000, hazardous: false },
  departureTime: '08:00',
};
const withChange = (change: Record<string, unknown>) => ({
  ...readmeRequest,
  ...change,
});
const without = (key: keyof typeof readmeRequest) => {
  const body: Record<string, unknown> = { ...readmeRequest };
  delete body[key];
  return body;
};

describe('OptimizeRouteDto', () => {
  it('accepts the README request body', async () => {
    expect(await errorsFor(readmeRequest)).toBe('[]');
  });

  it('accepts a request without waypoints or vehicleProfile', async () => {
    expect(
      await errorsFor({
        originNodeId: 'A',
        destinationNodeId: 'E',
        departureTime: '00:00',
      }),
    ).toBe('[]');
  });

  it('accepts weight 0 and 23:59', async () => {
    expect(
      await errorsFor(
        withChange({
          vehicleProfile: { type: 'van', weight: 0, hazardous: true },
          departureTime: '23:59',
        }),
      ),
    ).toBe('[]');
  });

  it.each([
    [
      'departureTime "25:00"',
      withChange({ departureTime: '25:00' }),
      'departureTime',
    ],
    [
      'departureTime "7:00"',
      withChange({ departureTime: '7:00' }),
      'departureTime',
    ],
    [
      'departureTime "08:60"',
      withChange({ departureTime: '08:60' }),
      'departureTime',
    ],
    ['a missing departureTime', without('departureTime'), 'departureTime'],
    ['a missing originNodeId', without('originNodeId'), 'originNodeId'],
    [
      'an empty destinationNodeId',
      withChange({ destinationNodeId: '' }),
      'destinationNodeId',
    ],
    [
      'a negative weight',
      withChange({
        vehicleProfile: { type: 'truck', weight: -1, hazardous: false },
      }),
      'weight',
    ],
    [
      'a string hazardous',
      withChange({
        vehicleProfile: { type: 'truck', weight: 1, hazardous: 'no' },
      }),
      'hazardous',
    ],
    [
      'a vehicleProfile without type',
      withChange({ vehicleProfile: { weight: 1, hazardous: false } }),
      'type',
    ],
    [
      'an extra field in vehicleProfile',
      withChange({
        vehicleProfile: { type: 't', weight: 1, hazardous: false, axles: 3 },
      }),
      'axles',
    ],
    [
      'waypoints that are not a list',
      withChange({ waypoints: 'C' }),
      'waypoints',
    ],
    ['a non-string waypoint', withChange({ waypoints: ['C', 7] }), 'waypoints'],
    ['an empty waypoint', withChange({ waypoints: [''] }), 'waypoints'],
    [
      'more than 100 waypoints',
      withChange({ waypoints: Array.from({ length: 101 }, () => 'C') }),
      'waypoints',
    ],
    [
      'an extra field on the body',
      withChange({ priority: 'high' }),
      'priority',
    ],
  ])('rejects %s', async (_, body, property) => {
    expect(await errorsFor(body)).toContain(`"property":"${property}"`);
  });
});
