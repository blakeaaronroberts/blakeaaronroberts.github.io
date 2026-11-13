// Snapshot undo and redo (proposal section 4). No DOM.
//
// Each finished command records the document as it was before, as a JSON string, so
// a snapshot can never be changed afterwards. A drag records once, when it ends.
// Any new edit clears redo. About 200 levels are kept.

export class History {
  constructor(limit = 200) {
    this.limit = limit;
    this.past = [];
    this.future = [];
  }

  /** Call with the document as it was BEFORE an edit. */
  record(before) {
    this.past.push(JSON.stringify(before));
    if (this.past.length > this.limit) this.past.shift();
    this.future = [];
  }

  /** The previous document, or null; `current` goes onto the redo stack. */
  undo(current) {
    if (!this.past.length) return null;
    this.future.push(JSON.stringify(current));
    return JSON.parse(this.past.pop());
  }

  redo(current) {
    if (!this.future.length) return null;
    this.past.push(JSON.stringify(current));
    return JSON.parse(this.future.pop());
  }

  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }

  clear() { this.past = []; this.future = []; }
}
