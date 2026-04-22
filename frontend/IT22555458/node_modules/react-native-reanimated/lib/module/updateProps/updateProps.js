'use strict';

import { scheduleOnRN, scheduleOnUI } from 'react-native-worklets';
import { IS_JEST, processColorsInProps, processTransform, processTransformOrigin, ReanimatedError, SHOULD_BE_USE_WEB, stylePropsBuilder } from '../common';
import { processBoxShadowWeb, processFilterWeb } from '../common/web';
import jsPropsUpdater from '../createAnimatedComponent/JSPropsUpdater';
import { _updatePropsJS } from '../ReanimatedModule/js-reanimated';
let updateProps;
if (SHOULD_BE_USE_WEB) {
  updateProps = (viewDescriptors, updates, isAnimatedProps) => {
    'worklet';

    viewDescriptors.value?.forEach(viewDescriptor => {
      const component = viewDescriptor.tag;
      if ('boxShadow' in updates) {
        updates.boxShadow = processBoxShadowWeb(updates.boxShadow);
      }
      if ('filter' in updates) {
        updates.filter = processFilterWeb(updates.filter);
      }
      _updatePropsJS(updates, component, isAnimatedProps);
    });
  };
} else {
  updateProps = (viewDescriptors, updates, isAnimatedProps) => {
    'worklet';

    // TODO: Remove this if once we have SVG props builder implemented
    // We need to keep it for now to prevent regression in SVG props processing
    if (isAnimatedProps) {
      processColorsInProps(updates);
      if ('transformOrigin' in updates) {
        updates.transformOrigin = processTransformOrigin(updates.transformOrigin);
      }
      if ('transform' in updates) {
        updates.transform = processTransform(updates.transform);
      }
    }
    global.UpdatePropsManager.update(viewDescriptors,
    // Use props builder only for style updaters, since animated props
    // can contain any properties of different types, depending on the
    // component, which we cannot process properly with the props builder.
    isAnimatedProps ? updates : stylePropsBuilder.build(updates));
  };
}
export const updatePropsJestWrapper = (viewDescriptors, updates, animatedValues, adapters) => {
  adapters.forEach(adapter => {
    adapter(updates);
  });
  animatedValues.current.value = {
    ...animatedValues.current.value,
    ...updates
  };
  updateProps(viewDescriptors, updates);
};
export default updateProps;
function updateJSProps(operations) {
  jsPropsUpdater.updateProps(operations);
}
function createUpdatePropsManager() {
  'worklet';

  const nativeOperations = [];
  const jsOperations = [];
  let flushPending = false;
  const processViewUpdates = (tag, updates) => Object.entries(updates).reduce((acc, [propName, value]) => {
    if (global._tagToJSPropNamesMapping[tag]?.[propName]) {
      acc.jsPropUpdates ??= {};
      acc.jsPropUpdates[propName] = value;
    } else {
      acc.nativePropUpdates ??= {};
      acc.nativePropUpdates[propName] = value;
    }
    return acc;
  }, {});
  return {
    update(viewDescriptors, updates) {
      viewDescriptors.value.forEach(({
        tag,
        shadowNodeWrapper
      }) => {
        const viewTag = tag;
        const {
          nativePropUpdates,
          jsPropUpdates
        } = processViewUpdates(viewTag, updates);
        if (nativePropUpdates) {
          nativeOperations.push({
            shadowNodeWrapper,
            updates: nativePropUpdates
          });
        }
        if (jsPropUpdates) {
          jsOperations.push({
            tag: viewTag,
            updates: jsPropUpdates
          });
        }
        if (!flushPending && (nativePropUpdates || jsPropUpdates)) {
          queueMicrotask(this.flush);
          flushPending = true;
        }
      });
    },
    flush() {
      if (nativeOperations.length) {
        global._updateProps(nativeOperations);
        nativeOperations.length = 0;
      }
      if (jsOperations.length) {
        scheduleOnRN(updateJSProps, jsOperations);
        jsOperations.length = 0;
      }
      flushPending = false;
    }
  };
}
if (SHOULD_BE_USE_WEB) {
  const maybeThrowError = () => {
    // Jest attempts to access a property of this object to check if it is a Jest mock
    // so we can't throw an error in the getter.
    if (!IS_JEST) {
      throw new ReanimatedError('`UpdatePropsManager` is not available on non-native platform.');
    }
  };
  global.UpdatePropsManager = new Proxy({}, {
    get: maybeThrowError,
    set: () => {
      maybeThrowError();
      return false;
    }
  });
} else {
  scheduleOnUI(() => {
    'worklet';

    global.UpdatePropsManager = createUpdatePropsManager();
  });
}

/**
 * This used to be `SharedValue<Descriptors[]>` but objects holding just a
 * single `value` prop are fine too.
 */
//# sourceMappingURL=updateProps.js.map