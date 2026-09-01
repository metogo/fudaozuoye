"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequestControllerRegistry = void 0;
class RequestControllerRegistry {
    active = new Set();
    track(controller) {
        this.active.add(controller);
        return () => this.active.delete(controller);
    }
    cancelAll() {
        for (const controller of this.active)
            controller.abort();
        this.active.clear();
    }
}
exports.RequestControllerRegistry = RequestControllerRegistry;
