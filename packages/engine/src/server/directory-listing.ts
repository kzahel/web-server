import type { IFileStat, IFileSystem } from "../interfaces/filesystem.js";

interface DirEntry {
  name: string;
  stat: IFileStat;
}

export async function generateDirectoryListing(
  fs: IFileSystem,
  dirPath: string,
  urlPath: string,
): Promise<string> {
  const names = await fs.readdir(dirPath);

  const entries: DirEntry[] = [];
  for (const name of names) {
    try {
      const fullPath = dirPath.endsWith("/")
        ? dirPath + name
        : `${dirPath}/${name}`;
      const stat = await fs.stat(fullPath);
      entries.push({ name, stat });
    } catch {
      // Skip entries we can't stat
    }
  }

  // Sort: directories first, then alphabetical
  entries.sort((a, b) => {
    if (a.stat.isDirectory && !b.stat.isDirectory) return -1;
    if (!a.stat.isDirectory && b.stat.isDirectory) return 1;
    return a.name.localeCompare(b.name);
  });

  const displayPath = urlPath === "/" ? "/" : urlPath;
  const hasParent = urlPath !== "/";
  const parentHref = encodePathForHref(
    urlPath.replace(/\/[^/]*\/?$/, "/") || "/",
  );

  const rows = entries
    .map((entry) => {
      const isDir = entry.stat.isDirectory;
      const displayName = isDir ? `${entry.name}/` : entry.name;
      const href = encodePathForHref(
        (urlPath.endsWith("/") ? urlPath : `${urlPath}/`) +
          entry.name +
          (isDir ? "/" : ""),
      );
      const sizeValue = isDir ? 0 : entry.stat.size;
      const sizeStr = isDir ? "" : formatSize(entry.stat.size);
      const mtimeValue = Math.floor(entry.stat.mtime.getTime() / 1000);
      const mtimeStr = formatDate(entry.stat.mtime);
      const iconClass = isDir ? "icon dir" : "icon file";
      return `<tr><td data-value="${escapeAttr(displayName)}"><a class="${iconClass}" href="${href}">${escapeHtml(displayName)}</a></td><td class="detailsColumn" data-value="${sizeValue}">${sizeStr}</td><td class="detailsColumn" data-value="${mtimeValue}">${mtimeStr}</td></tr>`;
    })
    .join("\n");

  return `<!DOCTYPE html>
<html dir="ltr" lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light dark">
<title>Index of ${escapeHtml(displayPath)}</title>
<style>
h1 {
  border-bottom: 1px solid #c0c0c0;
  margin-bottom: 10px;
  padding-bottom: 10px;
  white-space: nowrap;
}
table { border-collapse: collapse; }
th {
  cursor: pointer;
  user-select: none;
}
td.detailsColumn {
  padding-inline-start: 2em;
  text-align: end;
  white-space: nowrap;
}
a.icon {
  padding-inline-start: 1.5em;
  text-decoration: none;
  user-select: auto;
}
a.icon:hover { text-decoration: underline; }
a.file {
  background: url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAIAAACQkWg2AAAABnRSTlMAAAAAAABupgeRAAABEElEQVR42nRRx3HDMBC846AHZ7sP54BmWAyrsP588qnwlhqw/k4v5ZwWxM1hzmGRgV1cYqrRarXoH2w2m6qqiqKIR6cPtzc3xMSML2Te7XZZlnW7Pe/91/dX47WRBHuA9oyGmRknzGDjab1ePzw8bLfb6WRalmW4ip9FDVpYSWZgOp12Oh3nXJ7nxoJSGEciteP9y+fH52q1euv38WosqA6T2gGOT44vry7BEQtJkMAMMpa6JagAMcUfWYa4hkkzAc7fFlSjwqCoOUYAF5RjHZPVCFBOtSBGfgUDji3c3jpibeEMQhIMh8NwshqyRsBJgvF4jMs/YlVR5KhgNpuBLzk0OcUiR3CMhcPaOzsZiAAA/AjmaB3WZIkAAAAASUVORK5CYII=") left top no-repeat;
}
a.dir {
  background: url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAABt0lEQVR42oxStZoWQRCs2cXdHTLcHZ6EjAwnQWIkJyQlRt4Cd3d3d1n5d7q7ju1zv/q+mh6taQsk8fn29kPDRo87SDMQcNAUJgIQkBjdAoRKdXjm2mOH0AqS+PlkP8sfp0h93iu/PDji9s2FzSSJVg5ykZqWgfGRr9rAAAQiDFoB1OfyESZEB7iAI0lHwLREQBcQQKqo8p+gNUCguwCNAAUQAcFOb0NNGjT+BbUC2YsHZpWLhC6/m0chqIoM1LKbQIIBwlTQE1xAo9QDGDPYf6rkTpPc92gCUYVJAZjhyZltJ95f3zuvLYRGWWCUNkDL2333McBh4kaLlxg+aTmyL7c2xTjkN4Bt7oE3DBP/3SRz65R/bkmBRPGzcRNHYuzMjaj+fdnaFoJUEdTSXfaHbe7XNnMPyqryPcmfY+zURaAB7SHk9cXSH4fQ5rojgCAVIuqCNWgRhLYLhJB4k3iZfIPtnQiCpjAzeBIRXMA6emAqoEbQSoDdGxFUrxS1AYcpaNbBgyQBGJEOnYOeENKR/iAd1npusI4C75/c3539+nbUjOgZV5CkAU27df40lH+agUdIuA/EAgDmZnwZlhDc0wAAAABJRU5ErkJggg==") left top no-repeat;
}
a.up {
  background: url("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAACM0lEQVR42myTA+w1RxRHz+zftmrbdlTbtq04qRGrCmvbDWp9tq3a7tPcub8mj9XZ3eHOGQdJAHw77/LbZuvnWy+c/CIAd+91CMf3bo+bgcBiBAGIZKXb19/zodsAkFT+3px+ssYfyHTQW5tr05dCOf3xN49KaVX9+2zy1dX4XMk+5JflN5MBPL30oVsvnvEyp+18Nt3ZAErQMSFOfelCFvw0HcUloDayljZkX+MmamTAMTe+d+ltZ+1wEaRAX/MAnkJdcujzZyErIiVSzCEvIiq4O83AG7LAkwsfIgAnbncag82jfPPdd9RQyhPkpNJvKJWQBKlYFmQA315n4YPNjwMAZYy0TgAweedLmLzTJSTLIxkWDaVCVfAbbiKjytgmm+EGpMBYW0WwwbZ7lL8anox/UxekaOW544HO0ANAshxuORT/RG5YSrjlwZ3lM955tlQqbtVMlWIhjwzkAVFB8Q9EAAA3AFJ+DR3DO/Pnd3NPi7H117rAzWjpEs8vfIqsGZpaweOfEAAFJKuM0v6kf2iC5pZ9+fmLSZfWBVaKfLLNOXj6lYY0V2lfyVCIsVzmcRV9Y0fx02eTaEwhl2PDrXcjFdYRAohQmS8QEFLCLKGYA0AeEakhCCFDXqxsE0AQACgAQp5w96o0lAXuNASeDKWIvADiHwigfBINpWKtAXJvCEKWgSJNbRvxf4SmrnKDpvZavePu1K/zu/due1X/6Nj90MBd/J2Cic7WjBp/jUdIuA8AUtd65M+PzXIAAAAASUVORK5CYII=") left top no-repeat;
}
html[dir=rtl] a { background-position-x: right; }
#parentDirLinkBox {
  margin-bottom: 10px;
  padding-bottom: 10px;
}
</style>
<script>
function sortTable(column) {
  var theader = document.getElementById("theader");
  var oldOrder = theader.cells[column].dataset.order || "1";
  oldOrder = parseInt(oldOrder, 10);
  var newOrder = 0 - oldOrder;
  theader.cells[column].dataset.order = newOrder;
  var tbody = document.getElementById("tbody");
  var rows = tbody.rows;
  var list = [];
  for (var i = 0; i < rows.length; i++) list.push(rows[i]);
  list.sort(function(row1, row2) {
    var a = row1.cells[column].dataset.value;
    var b = row2.cells[column].dataset.value;
    if (column) {
      a = parseInt(a, 10);
      b = parseInt(b, 10);
      return a > b ? newOrder : a < b ? oldOrder : 0;
    }
    if (a > b) return newOrder;
    if (a < b) return oldOrder;
    return 0;
  });
  for (var i = 0; i < list.length; i++) tbody.appendChild(list[i]);
}
function addHandlers(el, col) {
  el.onclick = function() { sortTable(col); };
  el.onkeydown = function(e) {
    if (e.key === "Enter" || e.key === " ") { sortTable(col); e.preventDefault(); }
  };
}
window.addEventListener("DOMContentLoaded", function() {
  addHandlers(document.getElementById("nameColumnHeader"), 0);
  addHandlers(document.getElementById("sizeColumnHeader"), 1);
  addHandlers(document.getElementById("dateColumnHeader"), 2);
});
</script>
</head>
<body>
<h1 id="header">Index of ${escapeHtml(displayPath)}</h1>
${hasParent ? `<div id="parentDirLinkBox"><a id="parentDirLink" class="icon up" href="${parentHref}"><span>[parent directory]</span></a></div>` : ""}
<table>
<thead>
<tr class="header" id="theader">
  <th id="nameColumnHeader" tabindex="0" role="button">Name</th>
  <th id="sizeColumnHeader" class="detailsColumn" tabindex="0" role="button">Size</th>
  <th id="dateColumnHeader" class="detailsColumn" tabindex="0" role="button">Date Modified</th>
</tr>
</thead>
<tbody id="tbody">
${rows}
</tbody>
</table>
</body>
</html>`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDate(date: Date): string {
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(str: string): string {
  return escapeHtml(str);
}

function encodePathForHref(path: string): string {
  const hasLeadingSlash = path.startsWith("/");
  const hasTrailingSlash = path.endsWith("/") && path !== "/";
  const segments = path
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment));

  const joined = segments.join("/");
  const withLeading = hasLeadingSlash ? `/${joined}` : joined;
  if (withLeading === "") {
    return "/";
  }

  if (hasTrailingSlash) {
    return `${withLeading}/`;
  }

  return withLeading;
}
