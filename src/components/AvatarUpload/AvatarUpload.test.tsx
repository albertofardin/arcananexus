import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { convertImageFileToWebp } from "./AvatarUpload";

// `convertImageFileToWebp` è la conversione client-side introdotta in T-046
// (elimina il round-trip server upload→download→convert→re-upload nel caso
// comune). jsdom non implementa realmente `<canvas>`/`createImageBitmap`
// (serve il pacchetto nativo `canvas`, non installato in questo repo, vedi
// `.task/046-...md`): questi test mockano quelle API a livello di
// prototipo/globale per verificare la *logica* della funzione (in
// particolare il rilevamento del fallback silenzioso di `canvas.toBlob`,
// vedi il terzo test), non il rendering/encoding reale del browser — quello
// resta verificato per lettura del codice (vedi Log del task).
describe("convertImageFileToWebp", () => {
  const originalGetContext = HTMLCanvasElement.prototype.getContext;
  const originalToBlob = HTMLCanvasElement.prototype.toBlob;
  const originalCreateImageBitmap = global.createImageBitmap;

  const fakeBitmap = { width: 4, height: 4, close: vi.fn() };

  beforeEach(() => {
    global.createImageBitmap = vi
      .fn()
      .mockResolvedValue(fakeBitmap) as unknown as typeof createImageBitmap;
    HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
      drawImage: vi.fn(),
    }) as unknown as typeof HTMLCanvasElement.prototype.getContext;
  });

  afterEach(() => {
    global.createImageBitmap = originalCreateImageBitmap;
    HTMLCanvasElement.prototype.getContext = originalGetContext;
    HTMLCanvasElement.prototype.toBlob = originalToBlob;
    vi.restoreAllMocks();
  });

  function mockToBlob(blob: Blob | null) {
    HTMLCanvasElement.prototype.toBlob = vi.fn(callback => {
      callback(blob);
    }) as unknown as typeof HTMLCanvasElement.prototype.toBlob;
  }

  const originalFile = new File(["raw-bytes"], "foto.png", {
    type: "image/png",
  });

  it("returns a WebP File when the browser honors the requested MIME", async () => {
    mockToBlob(new Blob(["webp-bytes"], { type: "image/webp" }));

    const result = await convertImageFileToWebp(originalFile, 0.82);

    expect(result).not.toBe(originalFile);
    expect(result.type).toBe("image/webp");
    expect(result.name).toBe("foto.webp");
  });

  it("returns the original file when canvas.toBlob returns null", async () => {
    mockToBlob(null);

    const result = await convertImageFileToWebp(originalFile, 0.82);

    expect(result).toBe(originalFile);
  });

  it("returns the original file on the known silent-fallback bug (blob.type mismatch)", async () => {
    // Bug noto di piattaforma: alcuni motori (Safari/WebKit meno recenti)
    // ignorano "image/webp" passato a canvas.toBlob e restituiscono
    // comunque un blob PNG, senza sollevare errori. Qui si simula esattamente
    // quel comportamento: toBlob "riesce" (nessuna eccezione, nessun blob
    // null) ma il MIME del blob risultante non è quello richiesto.
    mockToBlob(new Blob(["png-bytes"], { type: "image/png" }));

    const result = await convertImageFileToWebp(originalFile, 0.82);

    expect(result).toBe(originalFile);
  });

  it("returns the original file when the canvas 2D context is unavailable", async () => {
    HTMLCanvasElement.prototype.getContext = vi
      .fn()
      .mockReturnValue(
        null
      ) as unknown as typeof HTMLCanvasElement.prototype.getContext;
    mockToBlob(new Blob(["webp-bytes"], { type: "image/webp" }));

    const result = await convertImageFileToWebp(originalFile, 0.82);

    expect(result).toBe(originalFile);
  });

  it("returns the original file when createImageBitmap throws (unsupported browser / undecodable file)", async () => {
    const consoleErrorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => {});
    global.createImageBitmap = vi
      .fn()
      .mockRejectedValue(
        new Error("createImageBitmap not supported")
      ) as unknown as typeof createImageBitmap;

    const result = await convertImageFileToWebp(originalFile, 0.82);

    expect(result).toBe(originalFile);
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});
