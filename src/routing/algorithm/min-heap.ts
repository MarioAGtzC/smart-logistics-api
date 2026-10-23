/** Binary min-heap: push and pop in O(log n), smallest priority first. */
export class MinHeap<T> {
  private readonly entries: { item: T; priority: number }[] = [];

  get size(): number {
    return this.entries.length;
  }

  push(item: T, priority: number): void {
    this.entries.push({ item, priority });
    this.siftUp(this.entries.length - 1);
  }

  pop(): T | undefined {
    const top = this.entries[0];
    const last = this.entries.pop();
    if (this.entries.length > 0 && last) {
      this.entries[0] = last;
      this.siftDown(0);
    }
    return top?.item;
  }

  private siftUp(index: number): void {
    while (index > 0) {
      const parent = (index - 1) >> 1;
      if (this.entries[parent].priority <= this.entries[index].priority) return;
      this.swap(index, parent);
      index = parent;
    }
  }

  private siftDown(index: number): void {
    for (;;) {
      const left = 2 * index + 1;
      const right = left + 1;
      let smallest = index;
      if (
        left < this.entries.length &&
        this.entries[left].priority < this.entries[smallest].priority
      ) {
        smallest = left;
      }
      if (
        right < this.entries.length &&
        this.entries[right].priority < this.entries[smallest].priority
      ) {
        smallest = right;
      }
      if (smallest === index) return;
      this.swap(index, smallest);
      index = smallest;
    }
  }

  private swap(a: number, b: number): void {
    [this.entries[a], this.entries[b]] = [this.entries[b], this.entries[a]];
  }
}
