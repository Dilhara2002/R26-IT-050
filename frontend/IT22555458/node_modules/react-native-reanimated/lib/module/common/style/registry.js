'use strict';

import { createNativePropsBuilder, stylePropsBuilder } from './propsBuilder';
const DEFAULT_SEPARATELY_INTERPOLATED_NESTED_PROPERTIES = new Set(['boxShadow', 'shadowOffset', 'textShadowOffset', 'transformOrigin']);
const PROPS_BUILDERS = new Map();
const PATTERN_PROPS_BUILDERS = [];
function findEntry(compoundComponentName) {
  const [reactViewName] = compoundComponentName.split('$');
  const exact = PROPS_BUILDERS.get(compoundComponentName) ?? PROPS_BUILDERS.get(reactViewName);
  if (exact) {
    return exact;
  }

  // Pattern matches in registration order
  for (const {
    matcher,
    entry
  } of PATTERN_PROPS_BUILDERS) {
    const matches = matcher instanceof RegExp ? matcher.test(compoundComponentName) || matcher.test(reactViewName) : matcher(compoundComponentName) || matcher(reactViewName);
    if (matches) {
      return entry;
    }
  }
  return null;
}
export function getCompoundComponentName(reactViewName, componentDisplayName) {
  return `${reactViewName}$${componentDisplayName}`;
}
export function getPropsBuilder(compoundComponentName) {
  return findEntry(compoundComponentName)?.builder ?? stylePropsBuilder;
}
export function registerComponentPropsBuilder(componentName, config, options = {}) {
  const entry = {
    builder: createNativePropsBuilder(config),
    separatelyInterpolatedNestedProperties: options.separatelyInterpolatedNestedProperties?.length ? new Set(options.separatelyInterpolatedNestedProperties) : undefined
  };
  if (typeof componentName === 'string') {
    PROPS_BUILDERS.set(componentName, entry);
  } else {
    PATTERN_PROPS_BUILDERS.push({
      matcher: componentName,
      entry
    });
  }
}
export function getSeparatelyInterpolatedNestedProperties(compoundComponentName) {
  return findEntry(compoundComponentName)?.separatelyInterpolatedNestedProperties ?? DEFAULT_SEPARATELY_INTERPOLATED_NESTED_PROPERTIES;
}
//# sourceMappingURL=registry.js.map