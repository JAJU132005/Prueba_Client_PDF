import "@testing-library/jest-dom";

// jsdom (v24) no implementa Blob/File.arrayBuffer, una API estándar del
// navegador que el código de producción usa para leer archivos en memoria
// (cero red). Se polifilla con FileReader (sí soportado por jsdom) para que los
// tests de UI ejerciten el flujo real sin tocar la lógica de producción.
if (typeof Blob.prototype.arrayBuffer !== "function") {
  Blob.prototype.arrayBuffer = function (this: Blob): Promise<ArrayBuffer> {
    return new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = () => reject(reader.error);
      reader.readAsArrayBuffer(this);
    });
  };
}
