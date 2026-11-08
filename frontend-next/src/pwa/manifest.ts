// The web app manifest. vite-plugin-pwa writes it out as manifest.webmanifest.

export const manifest = {
  id: "/",
  name: "rmfakecloud",
  short_name: "rmfakecloud",
  description: "Your reMarkable library, devices and screen share, from your own server.",
  start_url: "/",
  scope: "/",
  display: "standalone" as const,
  orientation: "any" as const,
  background_color: "#101114",
  theme_color: "#3b6df0",
  icons: [
    { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    { src: "/icons/maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
    { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
  ] as { src: string; sizes: string; type: string; purpose?: string }[],
  // sharing a PDF to the app uploads it; the service worker answers this request
  share_target: {
    action: "/share-target",
    method: "POST" as const,
    enctype: "multipart/form-data",
    params: {
      files: [{ name: "file", accept: ["application/pdf", ".pdf", "application/epub+zip", ".epub", ".rmdoc", ".zip"] }],
    },
  },
};
