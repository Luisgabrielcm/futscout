export default function BrandAssetFallback({ kind }: { kind: "club" | "league" }) {
  return kind === "club" ? (
    <svg className="brandAssetFallbackIcon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 2.5 20 5.4v5.7c0 5-3.2 8.6-8 10.9-4.8-2.3-8-5.9-8-10.9V5.4L12 2.5Z" />
      <path d="M8.5 9.2h7M8.5 12h7M10.2 14.8h3.6" />
    </svg>
  ) : (
    <svg className="brandAssetFallbackIcon" viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M4.8 9h14.4M4.8 15h14.4M9 3.8c-1.1 2.3-1.7 5-1.7 8.2S7.9 17.9 9 20.2M15 3.8c1.1 2.3 1.7 5 1.7 8.2s-.6 5.9-1.7 8.2" />
    </svg>
  )
}
