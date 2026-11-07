const { chromium } = require('playwright'); const fs = require('fs'); const path = require('path');
(async () => {
  const dir = process.argv[2]; const b = await chromium.launch();
  const jobs = [
    ['intoedu-symbol.svg', 'intoedu-symbol-1024.png', 1024, 1024, true],
    ['intoedu-logo-horizontal.svg', 'intoedu-logo-horizontal.png', null, null, true],
    ['intoedu-logo-horizontal-dark.svg', 'intoedu-logo-horizontal-dark.png', null, null, false],
    ['intoedu-kakao-profile.svg', 'intoedu-kakao-profile-1024.png', 1024, 1024, false],
    ['intoedu-kakao-profile.svg', 'intoedu-kakao-profile-640.png', 640, 640, false],
    ['intoedu-kakao-profile-circle-preview.svg', 'intoedu-kakao-profile-circle-preview.png', 512, 512, true],
  ];
  for (const [src, out, w, h, transparent] of jobs) {
    const svg = fs.readFileSync(path.join(dir, src), 'utf8');
    const m = svg.match(/width="(\d+)" height="(\d+)"/); const sw = +m[1], sh = +m[2];
    const W = w ?? sw * 2, H = h ?? sh * 2;
    const p = await b.newPage({ viewport: { width: W, height: H } });
    await p.setContent(`<html><body style="margin:0;background:transparent"><img src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}" style="width:${W}px;height:${H}px;display:block"></body></html>`);
    await p.screenshot({ path: path.join(dir, out), omitBackground: transparent });
    await p.close();
  }
  await b.close(); console.log('rendered');
})();
