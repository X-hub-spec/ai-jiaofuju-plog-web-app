import * as fabric from "fabric";
import {
  CANVAS_HEIGHT,
  CANVAS_WIDTH,
  EditorState,
  FRAME_ASSET,
  ImageTransform,
  LIGHTNING_PATTERN_ASSET,
  LOGO_ASSET,
  MAIN_IMAGE_BOUNDS,
  MAIN_IMAGE_MASK_ASSET,
  SERIES,
  SeriesConfig,
} from "./templates";

type LayerRole = "main" | "sticker";
type RoleObject = fabric.Object & { layerRole?: LayerRole };

const FONT_FAMILY = "Alimama ShuHeiTi";

export type RenderResult = {
  mainImage: fabric.FabricImage | null;
  sticker: fabric.FabricImage | null;
};

export async function renderCoverCanvas(
  canvas: fabric.Canvas,
  state: EditorState,
): Promise<RenderResult> {
  canvas.clear();
  canvas.setDimensions({ width: CANVAS_WIDTH, height: CANVAS_HEIGHT });
  canvas.backgroundColor = "#231832";

  const series = SERIES.find((item) => item.id === state.seriesId) ?? SERIES[0];
  const background = await loadImage(series.background);
  background.set({
    left: -2,
    top: -2,
    selectable: false,
    evented: false,
    hoverCursor: "default",
  });
  canvas.add(background);

  const lightningPattern = await loadImage(LIGHTNING_PATTERN_ASSET);
  lightningPattern.set({
    left: -23,
    top: -22,
    opacity: Math.max(0, Math.min(100, state.lightningOpacity)) / 100,
    selectable: false,
    evented: false,
    hoverCursor: "default",
  });
  canvas.add(lightningPattern);

  let mainImage: fabric.FabricImage | null = null;
  if (state.mainImage) {
    mainImage = await makeEditableImage(state.mainImage, "main", true);
    canvas.add(mainImage);
  }

  const frame = await loadImage(FRAME_ASSET);
  frame.set({
    left: 18,
    top: 267,
    selectable: false,
    evented: false,
    hoverCursor: "default",
  });
  canvas.add(frame);

  addBigTitle(canvas, state);
  await addSmallTitle(canvas, state, series);

  const logo = await loadImage(LOGO_ASSET);
  logo.set({
    left: 753,
    top: 1008,
    selectable: false,
    evented: false,
    hoverCursor: "default",
  });
  canvas.add(logo);

  let sticker: fabric.FabricImage | null = null;
  if (state.sticker) {
    sticker = await makeEditableImage(state.sticker, "sticker", false);
    canvas.add(sticker);
  }

  canvas.requestRenderAll();
  return { mainImage, sticker };
}

export function imageObjectToTransform(
  object: fabric.Object | undefined,
  src: string,
): ImageTransform {
  const scale = Math.max(object?.scaleX ?? 1, object?.scaleY ?? 1);

  return {
    src,
    left: Math.round(object?.left ?? 0),
    top: Math.round(object?.top ?? 0),
    scaleX: Number(scale.toFixed(4)),
    scaleY: Number(scale.toFixed(4)),
    angle: Number((object?.angle ?? 0).toFixed(2)),
  };
}

export function readRole(object: fabric.Object | undefined): LayerRole | null {
  return ((object as RoleObject | undefined)?.layerRole ?? null) as LayerRole | null;
}

export async function fitImageTransform(src: string): Promise<ImageTransform> {
  const image = await loadImage(src);
  const rawWidth = image.width || MAIN_IMAGE_BOUNDS.width;
  const rawHeight = image.height || MAIN_IMAGE_BOUNDS.height;
  const scale = Math.max(
    MAIN_IMAGE_BOUNDS.width / rawWidth,
    MAIN_IMAGE_BOUNDS.height / rawHeight,
  );
  const scaledWidth = rawWidth * scale;
  const scaledHeight = rawHeight * scale;

  return {
    src,
    left: Math.round(MAIN_IMAGE_BOUNDS.left + MAIN_IMAGE_BOUNDS.width - scaledWidth),
    top: Math.round(
      MAIN_IMAGE_BOUNDS.top + MAIN_IMAGE_BOUNDS.height / 2 - scaledHeight / 2,
    ),
    scaleX: Number(scale.toFixed(4)),
    scaleY: Number(scale.toFixed(4)),
    angle: 0,
  };
}

export async function defaultStickerTransform(src: string): Promise<ImageTransform> {
  const image = await loadImage(src);
  const rawWidth = image.width || 300;
  const rawHeight = image.height || 160;
  const scale = Math.min(1, 720 / rawWidth, 210 / rawHeight);

  return {
    src,
    left: 68,
    top: 94,
    scaleX: Number(scale.toFixed(4)),
    scaleY: Number(scale.toFixed(4)),
    angle: 0,
  };
}

async function makeEditableImage(
  transform: ImageTransform,
  role: LayerRole,
  clipped: boolean,
): Promise<fabric.FabricImage> {
  const image = await loadImage(transform.src);
  const uniformScale = Math.max(transform.scaleX, transform.scaleY);

  image.set({
    left: transform.left,
    top: transform.top,
    scaleX: uniformScale,
    scaleY: uniformScale,
    angle: transform.angle,
    selectable: true,
    evented: true,
    cornerColor: "#ffffff",
    cornerStrokeColor: "#111111",
    borderColor: "#ff5b3f",
    cornerSize: 14,
    transparentCorners: false,
    lockScalingFlip: true,
  });
  image.setControlsVisibility({
    mt: false,
    mr: false,
    mb: false,
    ml: false,
  });
  (image as RoleObject).layerRole = role;

  if (clipped) {
    const mask = await loadImage(MAIN_IMAGE_MASK_ASSET);
    mask.set({
      left: 0,
      top: 0,
      absolutePositioned: true,
      selectable: false,
      evented: false,
    });
    image.clipPath = mask;
  }

  return image;
}

async function loadImage(src: string): Promise<fabric.FabricImage> {
  return fabric.FabricImage.fromURL(src, { crossOrigin: "anonymous" });
}

function addBigTitle(canvas: fabric.Canvas, state: EditorState) {
  const title = new fabric.Textbox(state.bigTitle, {
    left: state.bigLeft,
    top: state.bigTop,
    width: 805,
    fontFamily: FONT_FAMILY,
    fontSize: state.bigFontSize,
    fontWeight: 800,
    fill: "#ffffff",
    lineHeight: 0.98,
    charSpacing: 0,
    selectable: false,
    evented: false,
  });
  canvas.add(title);
}

async function addSmallTitle(
  canvas: fabric.Canvas,
  state: EditorState,
  series: SeriesConfig,
) {
  if (!state.smallTitleEnabled) return;

  const label = await loadImage(series.smallTitleAsset.src);
  label.set({
    left: series.smallTitleAsset.left,
    top: series.smallTitleAsset.top,
    selectable: false,
    evented: false,
    hoverCursor: "default",
  });
  canvas.add(label);
}
