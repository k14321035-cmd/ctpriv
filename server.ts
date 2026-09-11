import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import * as cheerio from "cheerio";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Proxy endpoint to fetch and sanitize web pages
  app.get("/api/browse", async (req, res) => {
    const targetUrl = req.query.url as string;
    const isIncognito = req.query.incognito === 'true';
    if (!targetUrl) {
      return res.status(400).send("No URL provided");
    }

    try {
      const fetchHeaders: any = {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      };

      if (!isIncognito && req.headers.cookie) {
        fetchHeaders["Cookie"] = req.headers.cookie;
      }

      const response = await fetch(targetUrl, {
        headers: fetchHeaders,
      });

      if (!isIncognito) {
        const setCookieHeaders = response.headers.getSetCookie ? response.headers.getSetCookie() : response.headers.get("set-cookie");
        if (setCookieHeaders) {
          res.set("Set-Cookie", setCookieHeaders);
        }
      }

      const contentType = response.headers.get("content-type") || "";
      
      // If it's HTML, we sanitize it
      if (contentType.includes("text/html")) {
        const html = await response.text();
        const $ = cheerio.load(html);

        // 1. Selective blocking of trackers and ads
        const blockList = ['doubleclick', 'adsystem', 'googlesyndication', 'google-analytics', 'analytics.js', 'tracker', 'pixel', 'facebook.net', 'outbrain', 'taboola', 'amazon-adsystem'];
        
        $("script, iframe").each((i, el) => {
          const src = $(el).attr("src") || "";
          if (src && blockList.some(kw => src.toLowerCase().includes(kw))) {
            $(el).remove();
          }
        });

        $("script:not([src])").each((i, el) => {
          const content = $(el).html() || "";
          if (blockList.some(kw => content.toLowerCase().includes(kw))) {
            $(el).remove();
          }
        });

        // Basic ad container removal
        $(".ad, .ads, .advertisement, [id^='div-gpt-ad']").remove();

        // 2. Inject <base> tag so relative assets load properly from the origin
        const parsedUrl = new URL(targetUrl);
        if ($("base").length === 0) {
          $("head").prepend(`<base href="${parsedUrl.origin}">`);
        } else {
          const existingBase = $("base").attr("href");
          if (existingBase && !existingBase.startsWith("http")) {
            $("base").attr("href", new URL(existingBase, parsedUrl.origin).href);
          }
        }

        // 3. Inject a lightweight script to communicate clicks and forms to our React app
        const bridgeScript = `
          <script>
            document.addEventListener('click', function(e) {
              const a = e.target.closest('a');
              if (a && a.href && !a.href.startsWith('javascript:')) {
                e.preventDefault();
                e.stopPropagation();
                window.parent.postMessage({ type: 'navigate', url: a.href, tabId: window.name }, '*');
              }
            }, true);
            document.addEventListener('submit', function(e) {
              e.preventDefault();
              e.stopPropagation();
              const form = e.target;
              const formData = new FormData(form);
              const params = new URLSearchParams(formData);
              let url = form.action || window.location.href;
              const parsedUrl = new URL(url);
              
              if (form.method.toLowerCase() === 'get') {
                for (const [key, value] of params.entries()) {
                  parsedUrl.searchParams.set(key, value);
                }
              }
              
              window.parent.postMessage({ type: 'navigate', url: parsedUrl.toString(), tabId: window.name }, '*');
            }, true);
            
            // Custom context menu for downloading media
            let contextMenu = null;
            document.addEventListener('contextmenu', function(e) {
              const target = e.target;
              let mediaUrl = target.src || target.currentSrc;
              
              // Handle video elements that use <source>
              if (!mediaUrl && target.tagName === 'VIDEO') {
                const source = target.querySelector('source');
                if (source) mediaUrl = source.src;
              }

              if ((target.tagName === 'IMG' || target.tagName === 'VIDEO') && mediaUrl) {
                e.preventDefault();
                if (contextMenu) contextMenu.remove();

                contextMenu = document.createElement('div');
                contextMenu.style.position = 'fixed';
                contextMenu.style.left = e.clientX + 'px';
                contextMenu.style.top = e.clientY + 'px';
                contextMenu.style.background = '#1a1a1a';
                contextMenu.style.color = '#fff';
                contextMenu.style.padding = '8px 12px';
                contextMenu.style.borderRadius = '6px';
                contextMenu.style.cursor = 'pointer';
                contextMenu.style.zIndex = '2147483647'; // max z-index
                contextMenu.style.boxShadow = '0 4px 12px rgba(0,0,0,0.5)';
                contextMenu.style.border = '1px solid #333';
                contextMenu.style.fontFamily = 'sans-serif';
                contextMenu.style.fontSize = '14px';
                contextMenu.innerText = '⬇ Download ' + (target.tagName === 'IMG' ? 'Image' : 'Video');

                contextMenu.onmouseenter = () => { contextMenu.style.background = '#333'; };
                contextMenu.onmouseleave = () => { contextMenu.style.background = '#1a1a1a'; };

                contextMenu.onclick = function() {
                  window.parent.postMessage({ type: 'download', url: mediaUrl, tabId: window.name }, '*');
                  contextMenu.remove();
                  contextMenu = null;
                };

                document.body.appendChild(contextMenu);
              } else {
                if (contextMenu) {
                  contextMenu.remove();
                  contextMenu = null;
                }
              }
            });

            document.addEventListener('click', function(e) {
              if (contextMenu && e.target !== contextMenu) {
                contextMenu.remove();
                contextMenu = null;
              }
            });

            window.addEventListener('DOMContentLoaded', () => {
              window.parent.postMessage({ type: 'title', title: document.title, tabId: window.name }, '*');
            });
          </script>
        `;
        $("body").append(bridgeScript);

        res.send($.html());
      } else {
        // For non-HTML (like images loaded directly via address bar, or JSON), just pipe it
        const buffer = await response.arrayBuffer();
        res.set("Content-Type", contentType);
        res.send(Buffer.from(buffer));
      }
    } catch (err: any) {
      res.status(500).send(`Error fetching URL: ${err.message}`);
    }
  });

  // Download endpoint to proxy media downloads and enforce attachment
  app.get("/api/download", async (req, res) => {
    const targetUrl = req.query.url as string;
    if (!targetUrl) return res.status(400).send("No URL provided");

    try {
      const response = await fetch(targetUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36",
          Accept: "*/*",
        },
      });

      if (!response.ok) {
        return res.status(response.status).send("Failed to fetch media");
      }

      const contentType = response.headers.get("content-type") || "application/octet-stream";
      let filename = "download";
      
      try {
        const parsedUrl = new URL(targetUrl);
        const parts = parsedUrl.pathname.split('/');
        const lastPart = parts[parts.length - 1];
        if (lastPart && lastPart.includes('.')) {
          filename = lastPart;
        } else {
          if (contentType.includes("image/jpeg")) filename += ".jpg";
          else if (contentType.includes("image/png")) filename += ".png";
          else if (contentType.includes("image/gif")) filename += ".gif";
          else if (contentType.includes("image/webp")) filename += ".webp";
          else if (contentType.includes("video/mp4")) filename += ".mp4";
          else if (contentType.includes("video/webm")) filename += ".webm";
        }
      } catch (e) {
        // ignore parsing errors
      }

      const buffer = await response.arrayBuffer();
      res.set("Content-Type", contentType);
      res.set("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(Buffer.from(buffer));
    } catch (err: any) {
      res.status(500).send(`Error downloading URL: ${err.message}`);
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
