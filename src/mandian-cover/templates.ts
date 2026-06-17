export const CANVAS_WIDTH = 900;
export const CANVAS_HEIGHT = 1200;

const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path}`;

export type SeriesConfig = {
  id: string;
  name: string;
  smallTitle: string;
  background: string;
  smallTitleAsset: {
    src: string;
    left: number;
    top: number;
  };
};

export type ImageTransform = {
  src: string;
  left: number;
  top: number;
  scaleX: number;
  scaleY: number;
  angle: number;
};

export type EditorState = {
  seriesId: string;
  smallTitle: string;
  bigTitle: string;
  bigFontSize: number;
  bigLeft: number;
  bigTop: number;
  lightningOpacity: number;
  smallTitleEnabled: boolean;
  mainImage: ImageTransform | null;
  sticker: ImageTransform | null;
};

export const SERIES: SeriesConfig[] = [
  {
    id: "wanwu",
    name: "万物锐评",
    smallTitle: "万物锐评",
    background: assetUrl("mandian-cover/assets/templates/background-1.png"),
    smallTitleAsset: { src: assetUrl("mandian-cover/assets/templates/small-title-wanwu.png?v=small-title-alpha-1"), left: 120, top: 297 },
  },
  {
    id: "mandian",
    name: "满电百科",
    smallTitle: "满电百科",
    background: assetUrl("mandian-cover/assets/templates/background-2.png"),
    smallTitleAsset: { src: assetUrl("mandian-cover/assets/templates/small-title-mandian.png?v=small-title-alpha-1"), left: 134, top: 303 },
  },
  {
    id: "zhijia",
    name: "智驾日记",
    smallTitle: "智驾日记",
    background: assetUrl("mandian-cover/assets/templates/background-3.png"),
    smallTitleAsset: { src: assetUrl("mandian-cover/assets/templates/small-title-zhijia.png?v=small-title-alpha-1"), left: 135, top: 305 },
  },
  {
    id: "tiche",
    name: "提车报告",
    smallTitle: "提车报告",
    background: assetUrl("mandian-cover/assets/templates/background-4.png"),
    smallTitleAsset: { src: assetUrl("mandian-cover/assets/templates/small-title-tiche.png?v=small-title-alpha-1"), left: 134, top: 306 },
  },
  {
    id: "kanjie",
    name: "开车看世界",
    smallTitle: "开车看世界",
    background: assetUrl("mandian-cover/assets/templates/background-5.png"),
    smallTitleAsset: { src: assetUrl("mandian-cover/assets/templates/small-title-kanjie.png?v=small-title-alpha-1"), left: 127, top: 291 },
  },
  {
    id: "chezhufangtan",
    name: "车主访谈",
    smallTitle: "车主访谈",
    background: assetUrl("mandian-cover/assets/templates/background-6.png"),
    smallTitleAsset: { src: assetUrl("mandian-cover/assets/templates/small-title-chezhufangtan.png?v=small-title-alpha-1"), left: 125, top: 294 },
  },
  {
    id: "zhengjing",
    name: "正经试车",
    smallTitle: "正经试车",
    background: assetUrl("mandian-cover/assets/templates/background-7.png"),
    smallTitleAsset: { src: assetUrl("mandian-cover/assets/templates/small-title-zhengjing.png?v=small-title-alpha-1"), left: 136, top: 308 },
  },
  {
    id: "buwu",
    name: "不务正业",
    smallTitle: "不务正业",
    background: assetUrl("mandian-cover/assets/templates/background-8.png"),
    smallTitleAsset: { src: assetUrl("mandian-cover/assets/templates/small-title-buwu.png?v=small-title-alpha-1"), left: 136, top: 306 },
  },
  {
    id: "buzhengjing",
    name: "不正经试车",
    smallTitle: "不正经试车",
    background: assetUrl("mandian-cover/assets/templates/background-9.png"),
    smallTitleAsset: { src: assetUrl("mandian-cover/assets/templates/small-title-buzhengjing.png?v=small-title-alpha-1"), left: 116, top: 285 },
  },
];

export const DEFAULT_STATE: EditorState = {
  seriesId: SERIES[0].id,
  smallTitle: SERIES[0].smallTitle,
  bigTitle: "大标题写这儿",
  bigFontSize: 112,
  bigLeft: 68,
  bigTop: 92,
  lightningOpacity: 100,
  smallTitleEnabled: true,
  mainImage: null,
  sticker: null,
};

export const FRAME_ASSET = assetUrl("mandian-cover/assets/templates/frame.png");
export const LIGHTNING_PATTERN_ASSET = assetUrl("mandian-cover/assets/templates/lightning-pattern.png");
export const LOGO_ASSET = assetUrl("mandian-cover/assets/templates/lightning-logo.png");
export const MAIN_IMAGE_MASK_ASSET = assetUrl("mandian-cover/assets/templates/main-image-mask.png");

export const MAIN_CLIP_POINTS = [
  { x: 47, y: 419 },
  { x: 458, y: 292 },
  { x: 771, y: 292 },
  { x: 704, y: 337 },
  { x: 848, y: 342 },
  { x: 849, y: 1140 },
  { x: 47, y: 1140 },
];

export const MAIN_IMAGE_BOUNDS = {
  left: 48,
  top: 290,
  width: 809,
  height: 855,
};

export const DRAFT_KEY = "cover-template-app-draft-v1";
