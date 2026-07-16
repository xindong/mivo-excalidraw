export const MEDIA_FOOTER_HEIGHT = 64;
export const MEDIA_TITLE_FONT_SIZE = 18;

export const getMediaLayout = ({
  width,
  height,
  sourceWidth,
  sourceHeight,
}: {
  width: number;
  height: number;
  sourceWidth?: number;
  sourceHeight?: number;
}) => {
  const viewBoxWidth = sourceWidth ?? width;
  const mediaHeight = sourceHeight ?? Math.max(0, height - MEDIA_FOOTER_HEIGHT);
  const viewBoxHeight = mediaHeight + MEDIA_FOOTER_HEIGHT;
  const footerHeight =
    viewBoxHeight > 0 ? (height * MEDIA_FOOTER_HEIGHT) / viewBoxHeight : 0;
  return {
    viewBox: { width: viewBoxWidth, height: viewBoxHeight },
    mediaBounds: {
      x: 0,
      y: 0,
      width,
      height: Math.max(0, height - footerHeight),
    },
  };
};
