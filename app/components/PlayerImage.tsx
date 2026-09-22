"use client"

import Image from "next/image"
import { t, type Locale } from "../../lib/i18n"


import {
    type ReactNode,
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
  fallback?: ReactNode
  width?: number
  height?: number
  loading?: "lazy" | "eager"
  proxyRemote?: boolean
}

export default function PlayerImage({ locale = "pt",
  src,
  alt,
  className,
  fallbackClassName,
  kind = "player",
  fallbackText,
  fallback,
  width,
  height,
  loading,
  proxyRemote = false,
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

  const shouldProxyRemote = proxyRemote && imageSrc !== null && width !== undefined && height !== undefined &&
    /^https:\/\/media\.api-sports\.io\/football\/(?:teams|leagues)\/\d+\.png$/.test(imageSrc)

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
        {fallback ?? fallbackText ?? (alt.trim().charAt(0).toUpperCase() || "?")}
      </span>
    )
  }

  if (shouldProxyRemote) {
    return <Image src={imageSrc} alt={alt} className={className} width={width} height={height}
      loading={loading} ref={(image) => {
        if (image?.complete && image.naturalWidth === 0) setFailedSrc(imageSrc)
      }} onError={() => setFailedSrc(imageSrc)} />
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
