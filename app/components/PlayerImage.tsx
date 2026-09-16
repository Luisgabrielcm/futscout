"use client"

import { t, type Locale } from "../../lib/i18n"


import {
    useState,
} from "react"
import { getVisualAssetSrc, type ImageKind } from "../../lib/visualAssets"

type PlayerImageProps = {
  locale?: Locale
  src?: string
  alt: string
  className?: string
  fallbackClassName?: string
  kind?: ImageKind
  fallbackText?: string
  width?: number
  height?: number
  loading?: "lazy" | "eager"
}

export default function PlayerImage({ locale = "pt",
  src,
  alt,
  className,
  fallbackClassName,
  kind = "player",
  fallbackText,
  width,
  height,
  loading,
}: PlayerImageProps) {
  const [
    failedSrc,
    setFailedSrc,
  ] =
    useState<string | null>(null)

  const imageSrc = getVisualAssetSrc(src, kind)

  const shouldShowImage =
    imageSrc !== null &&
    failedSrc !== imageSrc

  if (!shouldShowImage) {
    return (
      <span
        role={fallbackText === "" ? undefined : "img"}
        aria-label={fallbackText === "" ? undefined : t(locale, "imageUnavailable", { name: alt })}
        aria-hidden={fallbackText === "" ? true : undefined}
        className={
          fallbackClassName
        }
      >
        {fallbackText ?? (alt.trim().charAt(0).toUpperCase() || "?")}
      </span>
    )
  }

  return (
    // Remote URLs already come from the data contract; no Next image proxy.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={imageSrc}
      alt={alt}
      className={className}
      width={width}
      height={height}
      loading={loading}
      ref={(image) => {
        // A cached failure can occur before hydration attaches onError.
        if (image?.complete && image.naturalWidth === 0) setFailedSrc(imageSrc)
      }}
      onError={() =>
        setFailedSrc(imageSrc)
      }
    />
  )
}
