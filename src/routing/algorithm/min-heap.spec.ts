import { MinHeap } from './min-heap';

describe('MinHeap', () => {
  const drain = <T>(heap: MinHeap<T>): T[] => {
    const out: T[] = [];
    for (let item = heap.pop(); item !== undefined; item = heap.pop()) {
      out.push(item);
    }
    return out;
  };

  it('pops items in ascending priority regardless of insertion order', () => {
    const heap = new MinHeap<string>();
    [5, 1, 9, 3, 7, 2, 8].forEach((p) => heap.push(`n${p}`, p));

    expect(drain(heap)).toEqual(['n1', 'n2', 'n3', 'n5', 'n7', 'n8', 'n9']);
  });

  it('matches a sort on 1000 random priorities', () => {
    const heap = new MinHeap<number>();
    const priorities = Array.from({ length: 1000 }, () =>
      Math.floor(Math.random() * 100),
    );
    priorities.forEach((p) => heap.push(p, p));

    expect(drain(heap)).toEqual([...priorities].sort((a, b) => a - b));
  });

  it('keeps duplicated priorities', () => {
    const heap = new MinHeap<string>();
    heap.push('a', 2);
    heap.push('b', 1);
    heap.push('c', 2);

    expect(heap.pop()).toBe('b');
    expect(drain(heap).sort()).toEqual(['a', 'c']);
  });

  it('tracks its size', () => {
    const heap = new MinHeap<string>();
    heap.push('a', 1);
    heap.push('b', 2);
    heap.pop();

    expect(heap.size).toBe(1);
  });

  it('returns undefined when empty', () => {
    const heap = new MinHeap<string>();

    expect(heap.pop()).toBeUndefined();
    expect(heap.size).toBe(0);
  });
});
