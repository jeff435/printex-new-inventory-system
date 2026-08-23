import type { AxiosResponse } from "axios";

/**
 * Triggers a browser download of a blob response (e.g. an Excel export).
 */
export function downloadBlob(res: AxiosResponse<Blob>, filename: string) {
  const url = window.URL.createObjectURL(res.data);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.URL.revokeObjectURL(url);
}

/**
 * Opens a PDF blob response in a new tab so the user can view, download, or
 * print it using the browser's native PDF viewer (which already has a
 * print button) — no extra print plumbing required on our side.
 */
export function openPdfBlob(res: AxiosResponse<Blob>) {
  const blob = new Blob([res.data], { type: "application/pdf" });
  const url = window.URL.createObjectURL(blob);
  window.open(url, "_blank");
  // Revoke a little later — the new tab needs time to actually load it.
  setTimeout(() => window.URL.revokeObjectURL(url), 30_000);
}

/**
 * Opens a PDF blob response in a hidden iframe and immediately invokes the
 * browser print dialog on it — used for "Print" buttons that should skip
 * straight to the print dialog rather than just opening the file.
 */
export function printPdfBlob(res: AxiosResponse<Blob>) {
  const blob = new Blob([res.data], { type: "application/pdf" });
  const url = window.URL.createObjectURL(blob);
  const iframe = document.createElement("iframe");
  iframe.style.display = "none";
  iframe.src = url;
  document.body.appendChild(iframe);
  iframe.onload = () => {
    try {
      iframe.contentWindow?.focus();
      iframe.contentWindow?.print();
    } catch {
      // Some browsers block programmatic print from a cross-origin-ish
      // blob iframe — falling back to just opening it is still useful.
      window.open(url, "_blank");
    }
    setTimeout(() => {
      document.body.removeChild(iframe);
      window.URL.revokeObjectURL(url);
    }, 60_000);
  };
}
