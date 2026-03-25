Images in public/images/
--------------------------

Next.js serves these at /images/*. Put files HERE (not in a top-level /images
folder at the project root) so the browser can load them.
--------------------------

  login-bg.png     — auth pages background (light theme)

  login_blue.png   — auth pages when dark / navy theme is on

Used on Login + Register. Images **cover** the full screen (wallpaper-style).

  logo.png       — **dark / blue** theme — full-colour logo

  logo_white.png — **light / yellow** theme — white logo on the same navy–sky
                   “chips” as the blue theme (see AppLogo.jsx)

Use PNG (or WebP) with a transparent background — then only your coloured logo
shows, sharp and clear. Export from Figma/Photoshop with alpha; avoid
flattening onto black if you want no box behind the art.

Square header/footer logos use **cover** in the icon box. The **login/register
badge** uses **contain** so the full wordmark fits without cropping. Pass
`imgClassName` on `AppLogo` to tweak sizing if needed.
