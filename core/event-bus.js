/**
 * Decoupled event bus for modules and extension components.
 */

class EventBus {
  constructor() {
    this.events = new Map();
  }

  on(eventName, callback) {
    if (!this.events.has(eventName)) {
      this.events.set(eventName, new Set());
    }
    this.events.get(eventName).add(callback);
    return () => this.off(eventName, callback);
  }

  off(eventName, callback) {
    if (this.events.has(eventName)) {
      this.events.get(eventName).delete(callback);
    }
  }

  emit(eventName, data) {
    if (this.events.has(eventName)) {
      for (const cb of this.events.get(eventName)) {
        try {
          cb(data);
        } catch (err) {
          console.error(`Error in event listener for "${eventName}":`, err);
        }
      }
    }
  }
}

export const events = new EventBus();
