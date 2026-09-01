"use client"

import {
    useState,
} from "react"

type PlayerImageProps = {
  src?: string
  alt: string
  className?: string
  fallbackClassName?: string
}

export default function PlayerImage({
  src,
  alt,
  className,
  fallbackClassName,
}: PlayerImageProps) {
  const [
    hasError,
    setHasError,
  ] =
    useState(false)

  const shouldShowImage =
    Boolean(src) &&
    !hasError

  if (!shouldShowImage) {
    return (
      <span
        className={
          fallbackClassName
        }
      >
        {alt.charAt(0)}
      </span>
    )
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      onError={() =>
        setHasError(true)
      }
    />
  )
}