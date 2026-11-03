import apiservice from "../../services/api.service";
import constants from "../../common/constants";

export function saveBlob(blob, filename) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

// rmapi `get`: the raw document archive
export const getRmdoc = (id, name) =>
  apiservice.download(id, "rmdoc").then((blob) => saveBlob(blob, `${name}.rmdoc`));

// rmapi `geta`: a PDF with the annotations drawn in
export const getAnnotatedPdf = (id, name) =>
  apiservice.download(id).then((blob) => saveBlob(blob, `${name}.pdf`));

// the SVG preview of one page (0 based); the session cookie authorises the <img>
export const pageUrl = (id, page) =>
  `${constants.ROOT_URL}/rm/page?id=${encodeURIComponent(id)}&page=${page}`;
