import { EventEmitter } from 'node:events';

/**
 * Tells interested services (the inbox, for receipts) that a post or one of its targets changed.
 * Emitted wherever post status is recalculated and from every IPC handler that edits targets.
 */
class PostEvents extends EventEmitter {
  emitChanged(postId: number): void {
    this.emit('post-changed', postId);
  }
  onChanged(listener: (postId: number) => void): () => void {
    this.on('post-changed', listener);
    return () => this.off('post-changed', listener);
  }
}

export const postEvents = new PostEvents();
postEvents.setMaxListeners(50);
