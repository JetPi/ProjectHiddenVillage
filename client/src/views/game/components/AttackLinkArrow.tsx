import Xarrow from "react-xarrows";
import type { IAttackLinkRenderConfig } from "../types/viewModels";

interface AttackLinkArrowProps {
  config: IAttackLinkRenderConfig;
}

export const AttackLinkArrow = ({ config }: AttackLinkArrowProps) => (
  <Xarrow
    start={config.startId}
    end={config.endId}
    startAnchor={config.startAnchor}
    endAnchor={config.endAnchor}
    path={config.path}
    curveness={config.curveness}
    strokeWidth={4.5}
    color="rgba(251, 146, 60, 0.98)"
    dashness={{ strokeLen: 12, nonStrokeLen: 10 }}
    headSize={2.25}
    headShape={{
      svgElem: <path d="M 0 0 L 1 0.5 L 0 1 L 0.25 0.5 z" />,
      offsetForward: config.headOffsetForward,
    }}
    arrowHeadProps={{
      stroke: 'rgba(0, 0, 0, 0.24)',
      strokeWidth: 0.16,
      strokeLinejoin: 'round',
      paintOrder: 'stroke fill',
      style: {
        filter: 'drop-shadow(0 0 1px rgba(0, 0, 0, 0.86)) drop-shadow(0 0 4px rgba(0, 0, 0, 0.42)) drop-shadow(0 0 9px rgba(0, 0, 0, 0.24)) drop-shadow(0 0 16px rgba(0, 0, 0, 0.13))',
      },
    }}
    showHead
    zIndex={50}
    _extendSVGcanvas={16}
    divContainerProps={{ id: 'attack-link-overlay' }}
    passProps={{
      style: {
        pointerEvents: 'none',
        strokeLinecap: 'butt',
        strokeLinejoin: 'miter',
        filter: 'drop-shadow(0 0 1px rgba(0, 0, 0, 0.9)) drop-shadow(0 0 5px rgba(0, 0, 0, 0.42))',
      },
    }}
    _cpx1Offset={config.controlPointOffsets?.cpx1 ?? 0}
    _cpx2Offset={config.controlPointOffsets?.cpx2 ?? 0}
  />
);