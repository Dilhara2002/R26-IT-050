'use strict';

export function __installUnpacker() {
  function shareableHostUnpacker(initial, hostDecorator) {
    let hostShareable = {
      isHost: true,
      __shareableRef: true,
      value: initial
    };
    if (hostDecorator) {
      hostShareable = hostDecorator(hostShareable);
    }
    const shareable = hostShareable;
    return shareable;
  }
  globalThis.__shareableHostUnpacker = shareableHostUnpacker;
}
//# sourceMappingURL=shareableHostUnpacker.native.js.map