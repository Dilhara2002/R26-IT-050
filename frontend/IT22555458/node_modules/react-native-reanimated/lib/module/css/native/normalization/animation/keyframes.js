'use strict';

import { getPropsBuilder, getSeparatelyInterpolatedNestedProperties, isDefined, isNumber, ReanimatedError } from '../../../../common';
import { PERCENTAGE_REGEX } from '../../../constants';
import { normalizeTimingFunction } from '../common';
export const ERROR_MESSAGES = {
  invalidOffsetType: selector => `Invalid keyframe selector "${selector}". Only numbers, percentages, "from", and "to" are supported.`,
  invalidOffsetRange: selector => `Invalid keyframe selector "${selector}". Expected a number between 0 and 1 or a percentage between 0% and 100%.`
};
export function normalizeKeyframeSelector(keyframeSelector) {
  const selectors = typeof keyframeSelector === 'string' ? keyframeSelector.split(',').map(k => k.trim()) : [keyframeSelector];
  const offsets = selectors.map(selector => {
    if (selector === 'from') {
      return 0;
    }
    if (selector === 'to') {
      return 1;
    }
    let offset;
    if (typeof selector === 'number' || !isNaN(+selector)) {
      offset = +selector;
    } else if (PERCENTAGE_REGEX.test(selector)) {
      offset = parseFloat(selector) / 100;
    }
    if (!isNumber(offset)) {
      throw new ReanimatedError(ERROR_MESSAGES.invalidOffsetType(selector));
    }
    if (offset < 0 || offset > 1) {
      throw new ReanimatedError(ERROR_MESSAGES.invalidOffsetRange(selector));
    }
    return offset;
  });
  return offsets;
}
export function processKeyframes(keyframes, propsBuilder) {
  return Object.entries(keyframes).flatMap(([selector, {
    animationTimingFunction = undefined,
    ...props
  } = {}]) => {
    const normalizedProps = propsBuilder.build(props);
    if (!normalizedProps) {
      return [];
    }
    return normalizeKeyframeSelector(selector).map(offset => ({
      offset,
      props: normalizedProps,
      ...(animationTimingFunction && {
        timingFunction: animationTimingFunction
      })
    }));
  }).sort((a, b) => a.offset - b.offset).reduce((acc, keyframe) => {
    const lastKeyframe = acc[acc.length - 1];
    if (lastKeyframe && lastKeyframe.offset === keyframe.offset) {
      lastKeyframe.props = {
        ...lastKeyframe.props,
        ...keyframe.props
      };
      lastKeyframe.timingFunction = keyframe.timingFunction;
    } else {
      acc.push(keyframe);
    }
    return acc;
  }, []);
}
function processProps(offset, props, keyframeProps, separatelyInterpolatedNestedProperties) {
  Object.entries(props).forEach(([property, value]) => {
    if (!isDefined(value)) {
      return;
    }
    if (/* this object type check is correct as it accepts records and arrays */
    typeof value === 'object' && separatelyInterpolatedNestedProperties.has(property)) {
      if (!keyframeProps[property]) {
        keyframeProps[property] = Array.isArray(value) ? [] : {};
      }
      processProps(offset, value, keyframeProps[property], separatelyInterpolatedNestedProperties);
      return;
    }
    if (!keyframeProps[property]) {
      keyframeProps[property] = [];
    }
    keyframeProps[property].push({
      offset,
      value
    });
  });
}
export function normalizeAnimationKeyframes(keyframes, compoundComponentName) {
  const propsBuilder = getPropsBuilder(compoundComponentName);
  const separatelyInterpolatedNestedProperties = getSeparatelyInterpolatedNestedProperties(compoundComponentName);
  const propKeyframes = {};
  const timingFunctions = {};
  processKeyframes(keyframes, propsBuilder).forEach(({
    offset,
    props,
    timingFunction
  }) => {
    processProps(offset, props, propKeyframes, separatelyInterpolatedNestedProperties);
    if (timingFunction && offset < 1) {
      timingFunctions[offset] = normalizeTimingFunction(timingFunction);
    }
  });
  return {
    propKeyframes,
    keyframeTimingFunctions: timingFunctions
  };
}
//# sourceMappingURL=keyframes.js.map