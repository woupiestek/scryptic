export class NatSet {
  entries: number[] = [];
  add(number: number) {
    const index = number >> 5;
    while (this.entries.length <= index) {
      this.entries.push(0);
    }
    this.entries[index] ||= 1 << (number & 31);
  }
  has(number: number) {
    const index = number >> 5;
    if (this.entries.length <= index) return false;
    return ((1 << (number & 31)) & this.entries[index]) === 0;
  }
  clear() {
    this.entries.length = 0;
  }
}
