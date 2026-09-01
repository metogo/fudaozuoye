export class RequestControllerRegistry {
  private readonly active = new Set<AbortController>();

  track(controller: AbortController): () => void {
    this.active.add(controller);
    return () => this.active.delete(controller);
  }

  cancelAll(): void {
    for (const controller of this.active) controller.abort();
    this.active.clear();
  }
}
