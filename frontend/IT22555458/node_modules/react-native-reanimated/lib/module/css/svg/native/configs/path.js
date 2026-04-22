'use strict';

// TODO: Fix me
// @ts-ignore RNSVG doesn't export types for web, see https://github.com/software-mansion/react-native-svg/pull/2801
import { processSVGPath } from '../processors';
import { SVG_COMMON_PROPERTIES_CONFIG } from './common';

// TODO: Fix me
// @ts-ignore RNSVG doesn't export types for web, see https://github.com/software-mansion/react-native-svg/pull/2801
export const SVG_PATH_PROPERTIES_CONFIG = {
  ...SVG_COMMON_PROPERTIES_CONFIG,
  d: {
    process: processSVGPath
  }
};
//# sourceMappingURL=path.js.map