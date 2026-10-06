# Personal website

Plain HTML and CSS with no build step and no dependencies. Hosted on GitHub Pages.

## Files

- `index.html` is the homepage: bio, Experience, Projects, and Technical Skills.
- `style.css` holds all the styles.
- `me.jpg` is the header photo (currently a gray placeholder). Replace it with a square image, ~400×400.
- `track.js` sends link clicks to GoatCounter.
- `projects/` holds writeup pages. Copy `example-project.html` to start a new one.
- `.nojekyll` tells GitHub Pages to serve the files as they are.

## Analytics (GoatCounter)

Every page loads GoatCounter with the site code `niviruwijayaratne` (the
`data-goatcounter` script in each page's `<head>`). New pages need the same line:

```html
<script data-goatcounter="https://niviruwijayaratne.goatcounter.com/count" async src="https://gc.zgo.at/count.js"></script>
```

The dashboard at https://niviruwijayaratne.goatcounter.com shows visits, referrers,
countries, browsers/devices, and clicks (listed as events named `click: <url>`).

GoatCounter ignores visits from `localhost`, so local testing doesn't count.

## Local preview

```sh
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Deploy

Push to the repo. In the repo's Settings → Pages, set the source to "Deploy from a
branch" with `main` and `/ (root)`.
