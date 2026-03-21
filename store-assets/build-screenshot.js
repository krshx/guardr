const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const iconPath = path.resolve(__dirname, '../icons/icon-128.png');
const screenshotPath = path.resolve(__dirname, 'popup-screenshot.png');

function toDataUrl(filePath) {
  const data = fs.readFileSync(filePath);
  const ext = path.extname(filePath).slice(1);
  return `data:image/${ext};base64,${data.toString('base64')}`;
}

const iconDataUrl = toDataUrl(iconPath);
const screenshotDataUrl = toDataUrl(screenshotPath);

const html = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }

  body {
    width: 1280px;
    height: 800px;
    background: #0f1117;
    display: flex;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    overflow: hidden;
  }

  /* LEFT PANEL */
  .left {
    width: 640px;
    height: 800px;
    display: flex;
    flex-direction: column;
    justify-content: center;
    padding: 64px 56px;
    gap: 0;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 36px;
  }

  .brand img {
    width: 56px;
    height: 56px;
    border-radius: 12px;
  }

  .brand-name {
    font-size: 26px;
    font-weight: 700;
    color: #ffffff;
    letter-spacing: -0.3px;
  }

  .headline {
    font-size: 42px;
    font-weight: 800;
    color: #ffffff;
    line-height: 1.15;
    letter-spacing: -0.8px;
    margin-bottom: 20px;
  }

  .headline span {
    color: #9DC840;
  }

  .subheading {
    font-size: 17px;
    color: #9aa3b2;
    line-height: 1.6;
    margin-bottom: 40px;
    max-width: 480px;
  }

  .bullets {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .bullet {
    display: flex;
    align-items: flex-start;
    gap: 12px;
    font-size: 15px;
    color: #c8d0dc;
    line-height: 1.4;
  }

  .bullet-dot {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    background: rgba(157, 200, 64, 0.15);
    border: 1.5px solid rgba(157, 200, 64, 0.4);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    margin-top: 1px;
  }

  .bullet-dot::after {
    content: '';
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #9DC840;
  }

  /* RIGHT PANEL */
  .right {
    width: 640px;
    height: 800px;
    display: flex;
    align-items: center;
    justify-content: center;
    position: relative;
  }

  .right::before {
    content: '';
    position: absolute;
    inset: 0;
    background: radial-gradient(ellipse at center, rgba(157,200,64,0.06) 0%, transparent 70%);
  }

  .card {
    position: relative;
    border-radius: 16px;
    background: #1a1d26;
    border: 1px solid rgba(255,255,255,0.08);
    box-shadow:
      0 0 0 1px rgba(157,200,64,0.08),
      0 24px 80px rgba(0,0,0,0.6),
      0 8px 24px rgba(0,0,0,0.4);
    padding: 12px;
    transform: translateY(-24px);
  }

  .card img {
    display: block;
    border-radius: 8px;
    max-width: 460px;
    max-height: 660px;
    width: auto;
    height: auto;
  }
</style>
</head>
<body>

<div class="left">
  <div class="brand">
    <img src="${iconDataUrl}" alt="Guardr">
    <span class="brand-name">Guardr</span>
  </div>

  <h1 class="headline">Automatic cookie<br><span>consent denial</span></h1>

  <p class="subheading">Guardr silently rejects non-essential cookie banners the moment they appear.</p>

  <div class="bullets">
    <div class="bullet">
      <div class="bullet-dot"></div>
      <span>Works on most sites — continuously learning</span>
    </div>
    <div class="bullet">
      <div class="bullet-dot"></div>
      <span>Denies legitimate interest &amp; vendor consents</span>
    </div>
    <div class="bullet">
      <div class="bullet-dot"></div>
      <span>Handles OneTrust, Cookiebot, Sourcepoint &amp; more</span>
    </div>
    <div class="bullet">
      <div class="bullet-dot"></div>
      <span>Free &amp; open source — no data leaves your browser</span>
    </div>
  </div>
</div>

<div class="right">
  <div class="card">
    <img src="${screenshotDataUrl}" alt="Guardr popup">
  </div>
</div>

</body>
</html>`;

(async () => {
  const browser = await puppeteer.launch({ headless: true });
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 800, deviceScaleFactor: 2 });
  await page.setContent(html, { waitUntil: 'networkidle0' });
  await page.screenshot({
    path: path.resolve(__dirname, 'screenshot-1280x800.png'),
    type: 'png',
    clip: { x: 0, y: 0, width: 1280, height: 800 }
  });
  await browser.close();
  console.log('Done: store-assets/screenshot-1280x800.png');
})();
