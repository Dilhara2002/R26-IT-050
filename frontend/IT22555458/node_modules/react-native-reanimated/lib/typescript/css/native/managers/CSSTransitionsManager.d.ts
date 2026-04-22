import type { UnknownRecord } from '../../../common';
import type { ShadowNodeWrapper } from '../../../commonTypes';
import type { CSSTransitionProperties, ICSSTransitionsManager } from '../../types';
export default class CSSTransitionsManager implements ICSSTransitionsManager {
    private readonly viewTag;
    private readonly shadowNodeWrapper;
    private prevProps;
    private propsWithTransitions;
    private hasTransition;
    constructor(shadowNodeWrapper: ShadowNodeWrapper, viewTag: number);
    update(transitionProperties: CSSTransitionProperties | null, nextProps?: UnknownRecord): void;
    unmountCleanup(): void;
    private detach;
    private processTransitionConfig;
}
//# sourceMappingURL=CSSTransitionsManager.d.ts.map