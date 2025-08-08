export default function Head() {
  return (
    <>
      <title>ProFixIQ</title>
      <meta
        name="description"
        content="AI-powered diagnostics for pros and DIYers"
      />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <meta name="theme-color" content="#ff6a00" />

      {/* Open Graph (OG) for social sharing */}
      <meta property="og:title" content="ProFixIQ" />
      <meta
        property="og:description"
        content="AI-powered diagnostics, inspections, and work order automation for pros and DIYers."
      />
      <meta property="og:type" content="website" />
      <meta property="og:url" content="https://profixiq.com" />
      <meta property="og:image" content="https://profixiq.com/og-image.jpg" />

      {/* Twitter card metadata */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content="ProFixIQ" />
      <meta
        name="twitter:description"
        content="Streamline repairs with AI diagnostics and smart shop tools."
      />
      <meta name="twitter:image" content="https://profixiq.com/og-image.jpg" />

      {/* Google Fonts: Black Ops One */}
      <link rel="preconnect" href="https://fonts.googleapis.com" />
      <link
        rel="preconnect"
        href="https://fonts.gstatic.com"
        crossOrigin="anonymous"
      />
      <link
        href="https://fonts.googleapis.com/css2?family=Black+Ops+One&display=swap"
        rel="stylesheet"
      />
    </>
  );
}
